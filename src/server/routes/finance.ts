import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  academicYears,
  classes,
  feeStructures,
  payments,
  receipts,
  schoolSettings,
  streams,
  studentFees,
  students,
  terms,
} from '../../db/schema.ts';
import { calculateFeeBalance } from '../domain.ts';
import { AuthRequest, logAudit, requireAuth, requirePermission } from '../middleware.ts';

const router = Router();

router.get('/structures', requireAuth, requirePermission('finance.view'), async (_req, res) => {
  try {
    const rows = await db
      .select({
        structure: feeStructures,
        className: classes.name,
        termName: terms.name,
        academicYearName: academicYears.name,
      })
      .from(feeStructures)
      .innerJoin(classes, eq(feeStructures.classId, classes.id))
      .innerJoin(terms, eq(feeStructures.termId, terms.id))
      .innerJoin(academicYears, eq(feeStructures.academicYearId, academicYears.id))
      .orderBy(desc(feeStructures.createdAt));

    res.json(
      rows.map((r) => ({
        ...r.structure,
        className: r.className,
        termName: r.termName,
        academicYearName: r.academicYearName,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to load fee structures.' });
  }
});

router.post('/structures', requireAuth, requirePermission('finance.manage'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      academicYearId: z.coerce.number().int().positive(),
      termId: z.coerce.number().int().positive(),
      classId: z.coerce.number().int().positive(),
      title: z.string().trim().min(3),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      items: z
        .array(
          z.object({
            voteHead: z.string().trim().min(2),
            amount: z.coerce.number().positive(),
          })
        )
        .min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid fee structure.' });
    }
    const total = parsed.data.items.reduce((acc, i) => acc + i.amount, 0);

    const [created] = await db
      .insert(feeStructures)
      .values({
        ...parsed.data,
        totalAmount: total.toFixed(2),
        createdByUserId: req.authUser!.id,
      })
      .returning();

    await logAudit(req.authUser, 'CREATE_FEE_STRUCTURE', 'fee_structures', created.id, { total }, req);
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'A fee structure already exists for this class and term.' });
    }
    res.status(500).json({ error: 'Failed to create fee structure.' });
  }
});

router.post('/structures/:id/allocate', requireAuth, requirePermission('finance.manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [fs] = await db.select().from(feeStructures).where(eq(feeStructures.id, id));
    if (!fs) return res.status(404).json({ error: 'Fee structure not found.' });

    const classStudents = await db
      .select()
      .from(students)
      .where(and(eq(students.currentClassId, fs.classId), eq(students.status, 'ACTIVE')));

    let allocatedCount = 0;
    await db.transaction(async (tx) => {
      for (const stu of classStudents) {
        const [existing] = await tx
          .select()
          .from(studentFees)
          .where(and(eq(studentFees.studentId, stu.id), eq(studentFees.termId, fs.termId)));
        if (!existing) {
          await tx.insert(studentFees).values({
            studentId: stu.id,
            feeStructureId: fs.id,
            termId: fs.termId,
            billedAmount: fs.totalAmount,
            discountAmount: '0.00',
            paidAmount: '0.00',
            balanceAmount: fs.totalAmount,
          });
          allocatedCount += 1;
        }
      }
    });

    await logAudit(req.authUser, 'ALLOCATE_CLASS_FEES', 'fee_structures', id, { allocatedCount }, req);
    res.json({ allocatedCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to allocate fees to students.' });
  }
});

router.get('/student-fees', requireAuth, requirePermission('finance.view'), async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    const classId = req.query.classId ? Number(req.query.classId) : undefined;
    const onlyArrears = req.query.arrears === 'true';

    const rows = await db
      .select({
        fee: studentFees,
        studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
        admissionNumber: students.admissionNumber,
        classId: students.currentClassId,
        className: classes.name,
        streamName: streams.name,
        termName: terms.name,
        structureTitle: feeStructures.title,
        dueDate: feeStructures.dueDate,
      })
      .from(studentFees)
      .innerJoin(students, eq(studentFees.studentId, students.id))
      .innerJoin(feeStructures, eq(studentFees.feeStructureId, feeStructures.id))
      .innerJoin(terms, eq(studentFees.termId, terms.id))
      .leftJoin(classes, eq(students.currentClassId, classes.id))
      .leftJoin(streams, eq(students.currentStreamId, streams.id))
      .orderBy(desc(studentFees.balanceAmount));

    const filtered = rows.filter((r) => {
      if ((user.roleCode === 'STUDENT' || user.roleCode === 'PARENT') && r.fee.studentId !== user.linkedStudentId) {
        return false;
      }
      if (classId && r.classId !== classId) return false;
      if (onlyArrears && Number(r.fee.balanceAmount) <= 0) return false;
      return true;
    });

    res.json(filtered);
  } catch (err) {
    console.error('Student fees error:', err);
    res.status(500).json({ error: 'Failed to load student fee ledgers.' });
  }
});

router.post('/student-fees/:id/discount', requireAuth, requirePermission('finance.manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const schema = z.object({
      discountAmount: z.coerce.number().min(0),
      discountReason: z.string().trim().min(3),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a valid discount amount and reason.' });

    const updated = await db.transaction(async (tx) => {
      const [sf] = await tx.select().from(studentFees).where(eq(studentFees.id, id));
      if (!sf) throw new Error('Student fee record not found.');
      const billed = Number(sf.billedAmount);
      const paid = Number(sf.paidAmount);
      if (parsed.data.discountAmount > billed) {
        throw new Error('Discount cannot exceed billed amount.');
      }
      const newBalance = calculateFeeBalance(billed, parsed.data.discountAmount, paid);
      const [row] = await tx
        .update(studentFees)
        .set({
          discountAmount: parsed.data.discountAmount.toFixed(2),
          discountReason: parsed.data.discountReason,
          balanceAmount: newBalance.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(studentFees.id, id))
        .returning();
      return row;
    });

    await logAudit(
      req.authUser,
      'APPLY_FEE_DISCOUNT',
      'student_fees',
      id,
      { discountAmount: parsed.data.discountAmount, reason: parsed.data.discountReason },
      req
    );
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to apply discount.' });
  }
});

router.get('/payments', requireAuth, requirePermission('finance.view'), async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    const rows = await db
      .select({
        payment: payments,
        receiptNumber: receipts.receiptNumber,
        receiptId: receipts.id,
        studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
        admissionNumber: students.admissionNumber,
        className: classes.name,
      })
      .from(payments)
      .innerJoin(students, eq(payments.studentId, students.id))
      .leftJoin(classes, eq(students.currentClassId, classes.id))
      .leftJoin(receipts, eq(receipts.paymentId, payments.id))
      .where(
        user.roleCode === 'STUDENT' || user.roleCode === 'PARENT'
          ? eq(payments.studentId, user.linkedStudentId || -1)
          : undefined
      )
      .orderBy(desc(payments.createdAt));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load payment history.' });
  }
});

router.post('/payments', requireAuth, requirePermission('finance.manage'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      studentFeeId: z.coerce.number().int().positive(),
      amount: z.coerce.number().positive('Payment amount must be greater than zero'),
      paymentMethod: z.enum(['MPESA', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'OTHER']),
      referenceNumber: z.string().trim().min(3, 'Payment reference number is required'),
      paidBy: z.string().trim().optional().nullable(),
      paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notes: z.string().trim().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid payment payload.' });
    }
    const data = parsed.data;

    const [dupRef] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.referenceNumber, data.referenceNumber));
    if (dupRef) {
      return res.status(409).json({
        error: `Payment reference "${data.referenceNumber}" has already been recorded.`,
      });
    }

    const result = await db.transaction(async (tx) => {
      const [sf] = await tx.select().from(studentFees).where(eq(studentFees.id, data.studentFeeId));
      if (!sf) throw new Error('Student fee ledger not found.');

      const newPaid = Number(sf.paidAmount) + data.amount;
      const newBalance = calculateFeeBalance(Number(sf.billedAmount), Number(sf.discountAmount), newPaid);

      const [pmt] = await tx
        .insert(payments)
        .values({
          studentId: sf.studentId,
          studentFeeId: sf.id,
          amount: data.amount.toFixed(2),
          paymentMethod: data.paymentMethod,
          referenceNumber: data.referenceNumber,
          paidBy: data.paidBy || null,
          paymentDate: data.paymentDate,
          notes: data.notes || null,
          recordedByUserId: req.authUser!.id,
        })
        .returning();

      await tx
        .update(studentFees)
        .set({
          paidAmount: newPaid.toFixed(2),
          balanceAmount: newBalance.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(studentFees.id, sf.id));

      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(receipts);
      const receiptNumber = `RCP-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

      const [rcp] = await tx
        .insert(receipts)
        .values({
          receiptNumber,
          paymentId: pmt.id,
          studentId: sf.studentId,
          amount: data.amount.toFixed(2),
        })
        .returning();

      return { payment: pmt, receipt: rcp, updatedBalance: newBalance };
    });

    await logAudit(
      req.authUser,
      'RECORD_FEE_PAYMENT',
      'payments',
      result.payment.id,
      {
        amount: data.amount,
        method: data.paymentMethod,
        referenceNumber: data.referenceNumber,
        receiptNumber: result.receipt.receiptNumber,
      },
      req
    );

    res.status(201).json(result);
  } catch (err: any) {
    console.error('Payment error:', err);
    res.status(400).json({ error: err.message || 'Failed to record fee payment.' });
  }
});

router.get('/receipts/:id', requireAuth, requirePermission('finance.view'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.authUser!;
    const [row] = await db
      .select({
        receipt: receipts,
        payment: payments,
        student: students,
        className: classes.name,
        feeBalance: studentFees.balanceAmount,
      })
      .from(receipts)
      .innerJoin(payments, eq(receipts.paymentId, payments.id))
      .innerJoin(students, eq(receipts.studentId, students.id))
      .innerJoin(studentFees, eq(payments.studentFeeId, studentFees.id))
      .leftJoin(classes, eq(students.currentClassId, classes.id))
      .where(eq(receipts.id, id));

    if (!row) return res.status(404).json({ error: 'Receipt not found.' });
    if ((user.roleCode === 'STUDENT' || user.roleCode === 'PARENT') && row.student.id !== user.linkedStudentId) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const [school] = await db.select().from(schoolSettings).limit(1);
    res.json({ ...row, school });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load receipt.' });
  }
});

router.get('/reports', requireAuth, requirePermission('finance.view'), async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    if (user.roleCode === 'STUDENT' || user.roleCode === 'PARENT') {
      return res.status(403).json({ error: 'Financial summary reports are restricted to finance and admin staff.' });
    }

    const daily = await db
      .select({
        date: payments.paymentDate,
        total: sql<number>`sum(${payments.amount})::float`,
        count: sql<number>`count(*)::int`,
      })
      .from(payments)
      .groupBy(payments.paymentDate)
      .orderBy(desc(payments.paymentDate))
      .limit(30);

    const byMethod = await db
      .select({
        method: payments.paymentMethod,
        total: sql<number>`sum(${payments.amount})::float`,
        count: sql<number>`count(*)::int`,
      })
      .from(payments)
      .groupBy(payments.paymentMethod);

    const summary = await db
      .select({
        totalBilled: sql<number>`coalesce(sum(${studentFees.billedAmount}), 0)::float`,
        totalDiscounts: sql<number>`coalesce(sum(${studentFees.discountAmount}), 0)::float`,
        totalCollected: sql<number>`coalesce(sum(${studentFees.paidAmount}), 0)::float`,
        totalOutstanding: sql<number>`coalesce(sum(${studentFees.balanceAmount}), 0)::float`,
      })
      .from(studentFees);

    res.json({
      summary: summary[0],
      daily,
      byMethod,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate financial report.' });
  }
});

router.post('/mpesa/stk-push', requireAuth, requirePermission('finance.manage'), async (req: AuthRequest, res) => {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;

  if (!consumerKey || !consumerSecret || !shortcode || !passkey) {
    return res.status(503).json({
      error:
        'M-Pesa Daraja API credentials are not configured on the server. Set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, and MPESA_PASSKEY in environment secrets, or record manual M-Pesa confirmation codes.',
    });
  }

  try {
    const schema = z.object({
      phone: z.string().regex(/^2547\d{8}$|^2541\d{8}$/, 'Use 2547XXXXXXXX format'),
      amount: z.coerce.number().int().positive(),
      accountReference: z.string().trim().min(2),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid STK push parameters.' });
    }

    const baseUrl =
      process.env.MPESA_ENV === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';

    const authTokenRes = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`,
      },
    });
    if (!authTokenRes.ok) {
      return res.status(502).json({ error: 'Failed to authenticate with Safaricom Daraja OAuth.' });
    }
    const { access_token } = (await authTokenRes.json()) as { access_token: string };

    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    const stkRes = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: parsed.data.amount,
        PartyA: parsed.data.phone,
        PartyB: shortcode,
        PhoneNumber: parsed.data.phone,
        CallBackURL: process.env.MPESA_CALLBACK_URL || `${process.env.APP_URL}/api/finance/mpesa/callback`,
        AccountReference: parsed.data.accountReference,
        TransactionDesc: 'Milo Boys School Fees',
      }),
    });

    const stkData = await stkRes.json();
    await logAudit(req.authUser, 'INITIATE_MPESA_STK', 'payments', null, { phone: parsed.data.phone, amount: parsed.data.amount }, req);
    res.status(stkRes.ok ? 200 : 502).json(stkData);
  } catch (err) {
    console.error('M-Pesa STK Push error:', err);
    res.status(500).json({ error: 'M-Pesa STK Push request failed.' });
  }
});

export default router;
