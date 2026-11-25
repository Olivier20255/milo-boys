import { Router } from 'express';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  academicYears,
  classes,
  enrollments,
  feeStructures,
  guardians,
  results,
  examinations,
  streams,
  studentAttendance,
  studentFees,
  students,
  terms,
} from '../../db/schema.ts';
import {
  AuthRequest,
  logAudit,
  requireAuth,
  requirePermission,
  sanitizeStudentForRole,
} from '../middleware.ts';

const router = Router();

const UPLOAD_BASE = path.resolve(process.cwd(), 'uploads', 'students');
fs.mkdirSync(UPLOAD_BASE, { recursive: true });

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_BASE),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
      cb(null, `student-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, or WEBP student photographs are permitted.'));
      return;
    }
    cb(null, true);
  },
});

const studentSchema = z.object({
  admissionNumber: z.string().trim().min(3, 'Admission number is required').max(40),
  firstName: z.string().trim().min(2, 'First name is required').max(80),
  middleName: z.string().trim().max(80).optional().nullable(),
  lastName: z.string().trim().min(2, 'Last name is required').max(80),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
  gender: z.enum(['Male', 'Female', 'Other']).default('Male'),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
  kcpeIndex: z.string().trim().max(40).optional().nullable(),
  kcpeScore: z.coerce.number().int().min(0).max(500).optional().nullable(),
  currentClassId: z.coerce.number().int().positive(),
  currentStreamId: z.coerce.number().int().positive().optional().nullable(),
  emergencyContactName: z.string().trim().min(2).max(120),
  emergencyContactPhone: z.string().trim().min(7).max(30),
  emergencyContactRelation: z.string().trim().min(2).max(60),
  bloodGroup: z.string().trim().max(10).optional().nullable(),
  allergies: z.string().trim().max(300).optional().nullable(),
  medicalConditions: z.string().trim().max(300).optional().nullable(),
  medicalNotes: z.string().trim().max(600).optional().nullable(),
  residenceAddress: z.string().trim().max(250).optional().nullable(),
  county: z.string().trim().max(80).optional().nullable(),
  guardian: z.object({
    fullName: z.string().trim().min(2),
    relationship: z.string().trim().min(2),
    phone: z.string().trim().min(7),
    altPhone: z.string().trim().optional().nullable(),
    email: z.string().trim().email().optional().or(z.literal('')).nullable(),
    nationalId: z.string().trim().optional().nullable(),
    occupation: z.string().trim().optional().nullable(),
    address: z.string().trim().optional().nullable(),
  }),
});

router.get('/', requireAuth, requirePermission('students.view'), async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    const search = String(req.query.search || '').trim();
    const classId = req.query.classId ? Number(req.query.classId) : undefined;
    const streamId = req.query.streamId ? Number(req.query.streamId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));

    const conditions = [];
    if (user.roleCode === 'STUDENT' || user.roleCode === 'PARENT') {
      if (!user.linkedStudentId) {
        return res.json({ items: [], total: 0, page, pageSize });
      }
      conditions.push(eq(students.id, user.linkedStudentId));
    }

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(students.admissionNumber, pattern),
          ilike(students.firstName, pattern),
          ilike(students.lastName, pattern),
          ilike(students.county, pattern)
        )!
      );
    }
    if (classId) conditions.push(eq(students.currentClassId, classId));
    if (streamId) conditions.push(eq(students.currentStreamId, streamId));
    if (status && status !== 'ALL') {
      conditions.push(eq(students.status, status as any));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(students)
      .where(whereClause);

    const rows = await db
      .select({
        student: students,
        className: classes.name,
        streamName: streams.name,
        guardianName: guardians.fullName,
        guardianPhone: guardians.phone,
        guardianRelationship: guardians.relationship,
      })
      .from(students)
      .leftJoin(classes, eq(students.currentClassId, classes.id))
      .leftJoin(streams, eq(students.currentStreamId, streams.id))
      .leftJoin(guardians, eq(students.guardianId, guardians.id))
      .where(whereClause)
      .orderBy(desc(students.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items = rows.map((r) => ({
      ...sanitizeStudentForRole(r.student, user.permissions, user.roleCode),
      className: r.className,
      streamName: r.streamName,
      guardianName: r.guardianName,
      guardianPhone: r.guardianPhone,
      guardianRelationship: r.guardianRelationship,
    }));

    res.json({ items, total: count, page, pageSize });
  } catch (err) {
    console.error('List students error:', err);
    res.status(500).json({ error: 'Failed to load student directory.' });
  }
});

router.get('/:id', requireAuth, requirePermission('students.view'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.authUser!;

    if ((user.roleCode === 'STUDENT' || user.roleCode === 'PARENT') && user.linkedStudentId !== id) {
      return res.status(403).json({ error: 'You may only access your own linked student record.' });
    }

    const [row] = await db
      .select({
        student: students,
        className: classes.name,
        streamName: streams.name,
        guardian: guardians,
      })
      .from(students)
      .leftJoin(classes, eq(students.currentClassId, classes.id))
      .leftJoin(streams, eq(students.currentStreamId, streams.id))
      .leftJoin(guardians, eq(students.guardianId, guardians.id))
      .where(eq(students.id, id));

    if (!row) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const studentEnrollments = await db
      .select({
        id: enrollments.id,
        academicYear: academicYears.name,
        className: classes.name,
        streamName: streams.name,
        isActive: enrollments.isActive,
        enrolledAt: enrollments.enrolledAt,
      })
      .from(enrollments)
      .innerJoin(academicYears, eq(enrollments.academicYearId, academicYears.id))
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .leftJoin(streams, eq(enrollments.streamId, streams.id))
      .where(eq(enrollments.studentId, id));

    const feeSummary = await db
      .select()
      .from(studentFees)
      .where(eq(studentFees.studentId, id));

    const attendanceSummary = await db
      .select({
        total: sql<number>`count(*)::int`,
        present: sql<number>`count(*) filter (where ${studentAttendance.status} = 'PRESENT')::int`,
        late: sql<number>`count(*) filter (where ${studentAttendance.status} = 'LATE')::int`,
        absent: sql<number>`count(*) filter (where ${studentAttendance.status} = 'ABSENT')::int`,
        excused: sql<number>`count(*) filter (where ${studentAttendance.status} = 'EXCUSED')::int`,
      })
      .from(studentAttendance)
      .where(eq(studentAttendance.studentId, id));

    // Only published results for students/parents
    const publishedResults = await db
      .select({
        id: results.id,
        examinationId: examinations.id,
        examinationName: examinations.name,
        examType: examinations.examType,
        totalMarks: results.totalMarks,
        meanScore: results.meanScore,
        meanGrade: results.meanGrade,
        classRank: results.classRank,
      })
      .from(results)
      .innerJoin(examinations, eq(results.examinationId, examinations.id))
      .where(and(eq(results.studentId, id), eq(examinations.status, 'PUBLISHED')))
      .orderBy(desc(examinations.publishedAt));

    res.json({
      ...sanitizeStudentForRole(row.student, user.permissions, user.roleCode),
      className: row.className,
      streamName: row.streamName,
      guardian: row.guardian,
      enrollments: studentEnrollments,
      feeSummary,
      attendanceSummary: attendanceSummary[0] || { total: 0, present: 0, late: 0, absent: 0, excused: 0 },
      publishedResults,
    });
  } catch (err) {
    console.error('Get student detail error:', err);
    res.status(500).json({ error: 'Failed to load student profile.' });
  }
});

router.post('/', requireAuth, requirePermission('students.manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = studentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid student data.' });
    }
    const data = parsed.data;

    // Duplicate admission number guard
    const [existing] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.admissionNumber, data.admissionNumber));

    if (existing) {
      return res.status(409).json({
        error: `Admission number "${data.admissionNumber}" is already assigned to another student.`,
      });
    }

    const created = await db.transaction(async (tx) => {
      const [g] = await tx
        .insert(guardians)
        .values({
          fullName: data.guardian.fullName,
          relationship: data.guardian.relationship,
          phone: data.guardian.phone,
          altPhone: data.guardian.altPhone || null,
          email: data.guardian.email || null,
          nationalId: data.guardian.nationalId || null,
          occupation: data.guardian.occupation || null,
          address: data.guardian.address || null,
        })
        .returning();

      const [stu] = await tx
        .insert(students)
        .values({
          admissionNumber: data.admissionNumber,
          firstName: data.firstName,
          middleName: data.middleName || null,
          lastName: data.lastName,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          admissionDate: data.admissionDate,
          kcpeIndex: data.kcpeIndex || null,
          kcpeScore: data.kcpeScore ?? null,
          currentClassId: data.currentClassId,
          currentStreamId: data.currentStreamId ?? null,
          guardianId: g.id,
          emergencyContactName: data.emergencyContactName,
          emergencyContactPhone: data.emergencyContactPhone,
          emergencyContactRelation: data.emergencyContactRelation,
          bloodGroup: data.bloodGroup || null,
          allergies: data.allergies || null,
          medicalConditions: data.medicalConditions || null,
          medicalNotes: data.medicalNotes || null,
          residenceAddress: data.residenceAddress || null,
          county: data.county || null,
          status: 'ACTIVE',
        })
        .returning();

      const [currentYear] = await tx
        .select()
        .from(academicYears)
        .where(eq(academicYears.isCurrent, true))
        .limit(1);

      if (currentYear) {
        await tx.insert(enrollments).values({
          studentId: stu.id,
          academicYearId: currentYear.id,
          classId: data.currentClassId,
          streamId: data.currentStreamId ?? null,
          isActive: true,
        });
      }

      // Allocate current term fee structure automatically if configured
      const [currentTerm] = await tx
        .select()
        .from(terms)
        .where(eq(terms.isCurrent, true))
        .limit(1);
      if (currentTerm) {
        const [fs] = await tx
          .select()
          .from(feeStructures)
          .where(
            and(
              eq(feeStructures.termId, currentTerm.id),
              eq(feeStructures.classId, data.currentClassId)
            )
          );
        if (fs) {
          await tx.insert(studentFees).values({
            studentId: stu.id,
            feeStructureId: fs.id,
            termId: currentTerm.id,
            billedAmount: fs.totalAmount,
            discountAmount: '0.00',
            paidAmount: '0.00',
            balanceAmount: fs.totalAmount,
          });
        }
      }

      return stu;
    });

    await logAudit(
      req.authUser,
      'REGISTER_STUDENT',
      'students',
      created.id,
      { admissionNumber: created.admissionNumber, name: `${created.firstName} ${created.lastName}` },
      req
    );

    res.status(201).json(created);
  } catch (err) {
    console.error('Register student error:', err);
    res.status(500).json({ error: 'Failed to register student.' });
  }
});

router.patch('/:id', requireAuth, requirePermission('students.manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = studentSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update payload.' });
    }
    const data = parsed.data;

    if (data.admissionNumber) {
      const [dup] = await db
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.admissionNumber, data.admissionNumber), sql`${students.id} != ${id}`));
      if (dup) {
        return res.status(409).json({ error: `Admission number "${data.admissionNumber}" is already in use.` });
      }
    }

    const [existing] = await db.select().from(students).where(eq(students.id, id));
    if (!existing) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    if (data.guardian && existing.guardianId) {
      await db
        .update(guardians)
        .set({
          fullName: data.guardian.fullName,
          relationship: data.guardian.relationship,
          phone: data.guardian.phone,
          altPhone: data.guardian.altPhone || null,
          email: data.guardian.email || null,
          nationalId: data.guardian.nationalId || null,
          occupation: data.guardian.occupation || null,
          address: data.guardian.address || null,
        })
        .where(eq(guardians.id, existing.guardianId));
    }

    const { guardian: _g, ...studentFields } = data;
    const [updated] = await db
      .update(students)
      .set({
        ...studentFields,
        updatedAt: new Date(),
      })
      .where(eq(students.id, id))
      .returning();

    await logAudit(req.authUser, 'UPDATE_STUDENT', 'students', id, { fields: Object.keys(studentFields) }, req);
    res.json(updated);
  } catch (err) {
    console.error('Update student error:', err);
    res.status(500).json({ error: 'Failed to update student.' });
  }
});

const statusChangeSchema = z.object({
  status: z.enum(['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'SUSPENDED', 'WITHDRAWN']),
  reason: z.string().trim().min(3, 'Please provide a reason for this status change.'),
});

router.post('/:id/status', requireAuth, requirePermission('students.manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = statusChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid status update.' });
    }

    const [updated] = await db
      .update(students)
      .set({
        status: parsed.data.status,
        statusReason: parsed.data.reason,
        statusChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(students.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    await logAudit(
      req.authUser,
      `STUDENT_STATUS_${parsed.data.status}`,
      'students',
      id,
      { reason: parsed.data.reason },
      req
    );

    res.json(updated);
  } catch (err) {
    console.error('Status change error:', err);
    res.status(500).json({ error: 'Failed to change student status.' });
  }
});

const promoteSchema = z.object({
  studentIds: z.array(z.number().int().positive()).min(1),
  targetClassId: z.number().int().positive().nullable(),
  targetStreamId: z.number().int().positive().nullable().optional(),
  graduate: z.boolean().optional(),
});

router.post('/promote', requireAuth, requirePermission('students.manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = promoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Select at least one student and target class.' });
    }
    const { studentIds, targetClassId, targetStreamId, graduate } = parsed.data;

    await db.transaction(async (tx) => {
      for (const sid of studentIds) {
        if (graduate) {
          await tx
            .update(students)
            .set({
              status: 'GRADUATED',
              statusReason: 'Completed Form 4 / Graduated',
              statusChangedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(students.id, sid));
        } else if (targetClassId) {
          await tx
            .update(students)
            .set({
              currentClassId: targetClassId,
              currentStreamId: targetStreamId ?? null,
              updatedAt: new Date(),
            })
            .where(eq(students.id, sid));
        }
      }
    });

    await logAudit(
      req.authUser,
      graduate ? 'GRADUATE_STUDENTS' : 'PROMOTE_STUDENTS',
      'students',
      studentIds.join(','),
      { targetClassId, count: studentIds.length },
      req
    );

    res.json({ updatedCount: studentIds.length });
  } catch (err) {
    console.error('Promotion error:', err);
    res.status(500).json({ error: 'Failed to promote students.' });
  }
});

router.post(
  '/:id/photo',
  requireAuth,
  requirePermission('students.manage'),
  photoUpload.single('photo'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!req.file) {
        return res.status(400).json({ error: 'No valid image uploaded.' });
      }
      const resolved = path.resolve(req.file.path);
      if (!resolved.startsWith(UPLOAD_BASE + path.sep)) {
        return res.status(400).json({ error: 'Invalid upload path.' });
      }
      const photoUrl = `/uploads/students/${req.file.filename}`;
      const [updated] = await db
        .update(students)
        .set({ photoUrl, updatedAt: new Date() })
        .where(eq(students.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Student not found.' });
      }
      await logAudit(req.authUser, 'UPLOAD_STUDENT_PHOTO', 'students', id, { photoUrl }, req);
      res.json({ photoUrl });
    } catch (err) {
      console.error('Photo upload error:', err);
      res.status(500).json({ error: 'Failed to upload student photograph.' });
    }
  }
);

export default router;
