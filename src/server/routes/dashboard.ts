import { Router } from 'express';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  academicYears,
  announcements,
  classes,
  examinations,
  marks,
  notifications,
  payments,
  receipts,
  results,
  schoolSettings,
  staff,
  studentAttendance,
  studentFees,
  students,
  subjects,
  terms,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware.ts';
import { ensureSeeded } from '../seed.ts';

const router = Router();

router.get('/auth/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureSeeded();
    const user = req.authUser!;
    const [settings] = await db.select().from(schoolSettings).limit(1);
    const [currentYear] = await db
      .select()
      .from(academicYears)
      .where(eq(academicYears.isCurrent, true))
      .limit(1);
    const [currentTerm] = await db
      .select()
      .from(terms)
      .where(eq(terms.isCurrent, true))
      .limit(1);
    const [{ count: unreadCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(sql`${notifications.userId} = ${user.id} AND ${notifications.isRead} = false`);

    res.json({
      user,
      schoolSettings: settings || null,
      currentAcademicYear: currentYear || null,
      currentTerm: currentTerm || null,
      unreadNotificationsCount: unreadCount,
    });
  } catch (err) {
    console.error('Error loading session profile:', err);
    res.status(500).json({ error: 'Failed to load user profile.' });
  }
});

router.get('/dashboard', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureSeeded();
    const user = req.authUser!;
    const [currentYear] = await db
      .select()
      .from(academicYears)
      .where(eq(academicYears.isCurrent, true))
      .limit(1);
    const [currentTerm] = await db
      .select()
      .from(terms)
      .where(eq(terms.isCurrent, true))
      .limit(1);

    // Core counts from PostgreSQL
    const [{ count: totalStudents }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(students)
      .where(eq(students.status, 'ACTIVE'));

    const [{ count: teachingStaff }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(staff)
      .where(sql`${staff.staffType} = 'TEACHING' AND ${staff.employmentStatus} = 'ACTIVE'`);

    const [{ count: nonTeachingStaff }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(staff)
      .where(sql`${staff.staffType} != 'TEACHING' AND ${staff.employmentStatus} = 'ACTIVE'`);

    const [{ count: activeClasses }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(classes);

    // Financial aggregates (restricted for Student/Parent to their linked student)
    let totalFeeCollections = 0;
    let totalOutstandingBalances = 0;

    if (user.roleCode === 'STUDENT' || user.roleCode === 'PARENT') {
      if (user.linkedStudentId) {
        const feeRows = await db
          .select({
            paid: sql<string>`coalesce(sum(${studentFees.paidAmount}), 0)`,
            balance: sql<string>`coalesce(sum(${studentFees.balanceAmount}), 0)`,
          })
          .from(studentFees)
          .where(eq(studentFees.studentId, user.linkedStudentId));
        totalFeeCollections = Number(feeRows[0]?.paid || 0);
        totalOutstandingBalances = Number(feeRows[0]?.balance || 0);
      }
    } else if (user.roleCode !== 'TEACHER') {
      const feeRows = await db
        .select({
          paid: sql<string>`coalesce(sum(${studentFees.paidAmount}), 0)`,
          balance: sql<string>`coalesce(sum(${studentFees.balanceAmount}), 0)`,
        })
        .from(studentFees);
      totalFeeCollections = Number(feeRows[0]?.paid || 0);
      totalOutstandingBalances = Number(feeRows[0]?.balance || 0);
    }

    // Overall Attendance Rate
    const attRows = await db
      .select({
        total: sql<number>`count(*)::int`,
        presentOrLate: sql<number>`count(*) filter (where ${studentAttendance.status} in ('PRESENT', 'LATE'))::int`,
      })
      .from(studentAttendance);
    const attendanceRate =
      attRows[0]?.total > 0
        ? Math.round((attRows[0].presentOrLate / attRows[0].total) * 1000) / 10
        : 0;

    // Student Population by Class (for Bar/Area Chart)
    const populationByClass = await db
      .select({
        className: classes.name,
        levelOrder: classes.levelOrder,
        count: sql<number>`count(${students.id})::int`,
      })
      .from(classes)
      .leftJoin(
        students,
        sql`${students.currentClassId} = ${classes.id} AND ${students.status} = 'ACTIVE'`
      )
      .groupBy(classes.id, classes.name, classes.levelOrder)
      .orderBy(classes.levelOrder);

    // Fee Collection Trends by Month (hidden for Teachers/Students/Parents)
    const feeCollectionTrends =
      user.roleCode === 'TEACHER' || user.roleCode === 'STUDENT' || user.roleCode === 'PARENT'
        ? []
        : await db
            .select({
              month: sql<string>`substring(${payments.paymentDate} from 1 for 7)`,
              amount: sql<number>`sum(${payments.amount})::float`,
              transactions: sql<number>`count(*)::int`,
            })
            .from(payments)
            .groupBy(sql`substring(${payments.paymentDate} from 1 for 7)`)
            .orderBy(sql`substring(${payments.paymentDate} from 1 for 7)`);

    // Attendance Statistics by Date
    const attendanceTrend = await db
      .select({
        date: studentAttendance.date,
        present: sql<number>`count(*) filter (where ${studentAttendance.status} = 'PRESENT')::int`,
        late: sql<number>`count(*) filter (where ${studentAttendance.status} = 'LATE')::int`,
        absent: sql<number>`count(*) filter (where ${studentAttendance.status} = 'ABSENT')::int`,
        excused: sql<number>`count(*) filter (where ${studentAttendance.status} = 'EXCUSED')::int`,
      })
      .from(studentAttendance)
      .groupBy(studentAttendance.date)
      .orderBy(studentAttendance.date);

    // Academic Performance by Class (Latest Published Exam)
    const [latestPublished] = await db
      .select()
      .from(examinations)
      .where(eq(examinations.status, 'PUBLISHED'))
      .orderBy(desc(examinations.publishedAt))
      .limit(1);

    const performanceByClass = latestPublished
      ? await db
          .select({
            className: classes.name,
            levelOrder: classes.levelOrder,
            meanScore: sql<number>`round(avg(${results.meanScore})::numeric, 1)::float`,
          })
          .from(results)
          .innerJoin(classes, eq(results.classId, classes.id))
          .where(eq(results.examinationId, latestPublished.id))
          .groupBy(classes.id, classes.name, classes.levelOrder)
          .orderBy(classes.levelOrder)
      : [];

    // Subject Performance
    const subjectPerformance = latestPublished
      ? await db
          .select({
            subjectName: subjects.name,
            subjectCode: subjects.code,
            meanScore: sql<number>`round(avg(${marks.score})::numeric, 1)::float`,
          })
          .from(marks)
          .innerJoin(
            sql`exam_subjects es`,
            sql`${marks.examSubjectId} = es.id`
          )
          .innerJoin(subjects, sql`es.subject_id = ${subjects.id}`)
          .where(eq(marks.examinationId, latestPublished.id))
          .groupBy(subjects.id, subjects.name, subjects.code)
          .orderBy(sql`avg(${marks.score}) desc`)
      : [];

    // Recent Registrations
    const recentRegistrations =
      user.roleCode === 'STUDENT' || user.roleCode === 'PARENT'
        ? []
        : await db
            .select({
              id: students.id,
              admissionNumber: students.admissionNumber,
              firstName: students.firstName,
              lastName: students.lastName,
              admissionDate: students.admissionDate,
              status: students.status,
              className: classes.name,
            })
            .from(students)
            .leftJoin(classes, eq(students.currentClassId, classes.id))
            .orderBy(desc(students.createdAt))
            .limit(6);

    // Recent Payments
    const recentPayments =
      user.roleCode === 'TEACHER' || user.roleCode === 'STUDENT' || user.roleCode === 'PARENT'
        ? []
        : await db
            .select({
              id: payments.id,
              amount: payments.amount,
              paymentMethod: payments.paymentMethod,
              referenceNumber: payments.referenceNumber,
              paymentDate: payments.paymentDate,
              studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
              admissionNumber: students.admissionNumber,
              receiptNumber: receipts.receiptNumber,
            })
            .from(payments)
            .innerJoin(students, eq(payments.studentId, students.id))
            .leftJoin(receipts, eq(receipts.paymentId, payments.id))
            .orderBy(desc(payments.createdAt))
            .limit(6);

    // Pending Exam Approvals
    const pendingApprovals = await db
      .select({
        id: examinations.id,
        name: examinations.name,
        examType: examinations.examType,
        status: examinations.status,
        startDate: examinations.startDate,
      })
      .from(examinations)
      .where(sql`${examinations.status} in ('DRAFT', 'SUBMITTED', 'VERIFIED', 'FINALIZED')`)
      .orderBy(desc(examinations.createdAt))
      .limit(5);

    const recentAnnouncements = await db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.createdAt))
      .limit(4);

    res.json({
      kpis: {
        totalStudents,
        teachingStaff,
        nonTeachingStaff,
        activeClasses,
        currentAcademicYear: currentYear?.name || '2026',
        currentTerm: currentTerm?.name || 'Term 2',
        totalFeeCollections,
        totalOutstandingBalances,
        attendanceRate,
      },
      charts: {
        populationByClass,
        feeCollectionTrends,
        attendanceTrend,
        performanceByClass,
        subjectPerformance,
        latestExamName: latestPublished?.name || null,
      },
      recentRegistrations,
      recentPayments,
      pendingApprovals,
      recentAnnouncements,
    });
  } catch (err) {
    console.error('Dashboard fetch error:', err);
    res.status(500).json({ error: 'Failed to load dashboard metrics.' });
  }
});

router.get('/search', requireAuth, async (req: AuthRequest, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ students: [], staff: [], receipts: [] });
    }
    const pattern = `%${q}%`;
    const user = req.authUser!;

    const studentMatches =
      user.roleCode === 'STUDENT' || user.roleCode === 'PARENT'
        ? []
        : await db
            .select({
              id: students.id,
              admissionNumber: students.admissionNumber,
              firstName: students.firstName,
              lastName: students.lastName,
            })
            .from(students)
            .where(
              or(
                ilike(students.admissionNumber, pattern),
                ilike(students.firstName, pattern),
                ilike(students.lastName, pattern)
              )
            )
            .limit(6);

    const staffMatches =
      user.roleCode === 'STUDENT' || user.roleCode === 'PARENT'
        ? []
        : await db
            .select({
              id: staff.id,
              employeeNumber: staff.employeeNumber,
              firstName: staff.firstName,
              lastName: staff.lastName,
              designation: staff.designation,
            })
            .from(staff)
            .where(
              or(
                ilike(staff.employeeNumber, pattern),
                ilike(staff.firstName, pattern),
                ilike(staff.lastName, pattern)
              )
            )
            .limit(5);

    const receiptMatches =
      user.roleCode === 'ACCOUNTANT' || user.roleCode === 'SUPER_ADMIN' || user.roleCode === 'HEADTEACHER'
        ? await db
            .select({
              id: receipts.id,
              receiptNumber: receipts.receiptNumber,
              amount: receipts.amount,
            })
            .from(receipts)
            .where(ilike(receipts.receiptNumber, pattern))
            .limit(5)
        : [];

    res.json({ students: studentMatches, staff: staffMatches, receipts: receiptMatches });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed.' });
  }
});

router.get('/notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.authUser!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(20);
    res.json(rows);
  } catch (err) {
    console.error('Notifications error:', err);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

router.post('/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(sql`${notifications.id} = ${id} AND ${notifications.userId} = ${req.authUser!.id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Notification update error:', err);
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

export default router;
