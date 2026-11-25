import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  academicYears,
  classes,
  enrollments,
  staff,
  streams,
  students,
  subjects,
  teacherAssignments,
  terms,
} from '../../db/schema.ts';
import { AuthRequest, logAudit, requireAuth, requirePermission } from '../middleware.ts';

const router = Router();

router.get('/overview', requireAuth, requirePermission('academics.view'), async (_req, res) => {
  try {
    const years = await db.select().from(academicYears).orderBy(desc(academicYears.name));
    const allTerms = await db.select().from(terms).orderBy(terms.id);
    const allClasses = await db.select().from(classes).orderBy(classes.levelOrder);
    const allStreams = await db
      .select({
        id: streams.id,
        classId: streams.classId,
        name: streams.name,
        capacity: streams.capacity,
        classTeacherId: streams.classTeacherId,
        roomName: streams.roomName,
        classTeacherName: staff.firstName,
        classTeacherLastName: staff.lastName,
      })
      .from(streams)
      .leftJoin(staff, eq(streams.classTeacherId, staff.id))
      .orderBy(streams.id);

    const allSubjects = await db.select().from(subjects).orderBy(subjects.code);

    const assignments = await db
      .select({
        id: teacherAssignments.id,
        staffId: teacherAssignments.staffId,
        teacherName: staff.firstName,
        teacherLastName: staff.lastName,
        subjectId: teacherAssignments.subjectId,
        subjectName: subjects.name,
        subjectCode: subjects.code,
        classId: teacherAssignments.classId,
        className: classes.name,
        streamId: teacherAssignments.streamId,
        streamName: streams.name,
        academicYearId: teacherAssignments.academicYearId,
      })
      .from(teacherAssignments)
      .innerJoin(staff, eq(teacherAssignments.staffId, staff.id))
      .innerJoin(subjects, eq(teacherAssignments.subjectId, subjects.id))
      .innerJoin(classes, eq(teacherAssignments.classId, classes.id))
      .leftJoin(streams, eq(teacherAssignments.streamId, streams.id));

    const recentEnrollments = await db
      .select({
        id: enrollments.id,
        studentId: enrollments.studentId,
        admissionNumber: students.admissionNumber,
        firstName: students.firstName,
        lastName: students.lastName,
        className: classes.name,
        streamName: streams.name,
        academicYear: academicYears.name,
        isActive: enrollments.isActive,
      })
      .from(enrollments)
      .innerJoin(students, eq(enrollments.studentId, students.id))
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .innerJoin(academicYears, eq(enrollments.academicYearId, academicYears.id))
      .leftJoin(streams, eq(enrollments.streamId, streams.id))
      .orderBy(desc(enrollments.enrolledAt))
      .limit(50);

    res.json({
      academicYears: years,
      terms: allTerms,
      classes: allClasses,
      streams: allStreams,
      subjects: allSubjects,
      teacherAssignments: assignments,
      enrollments: recentEnrollments,
    });
  } catch (err) {
    console.error('Academics overview error:', err);
    res.status(500).json({ error: 'Failed to load academic structure.' });
  }
});

router.post('/years', requireAuth, requirePermission('academics.manage'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(4),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      isCurrent: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid academic year.' });
    }
    const created = await db.transaction(async (tx) => {
      if (parsed.data.isCurrent) {
        await tx.update(academicYears).set({ isCurrent: false });
      }
      const [row] = await tx.insert(academicYears).values(parsed.data).returning();
      return row;
    });
    await logAudit(req.authUser, 'CREATE_ACADEMIC_YEAR', 'academic_years', created.id, parsed.data, req);
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'An academic year with that name already exists.' });
    }
    res.status(500).json({ error: 'Failed to create academic year.' });
  }
});

router.post('/years/:id/activate', requireAuth, requirePermission('academics.manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.transaction(async (tx) => {
      await tx.update(academicYears).set({ isCurrent: false });
      await tx.update(academicYears).set({ isCurrent: true }).where(eq(academicYears.id, id));
    });
    await logAudit(req.authUser, 'SET_CURRENT_ACADEMIC_YEAR', 'academic_years', id, {}, req);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set active academic year.' });
  }
});

router.post('/terms', requireAuth, requirePermission('academics.manage'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      academicYearId: z.coerce.number().int().positive(),
      name: z.string().trim().min(2),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      isCurrent: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid term.' });
    }
    const created = await db.transaction(async (tx) => {
      if (parsed.data.isCurrent) {
        await tx.update(terms).set({ isCurrent: false });
      }
      const [row] = await tx.insert(terms).values(parsed.data).returning();
      return row;
    });
    await logAudit(req.authUser, 'CREATE_TERM', 'terms', created.id, parsed.data, req);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create term.' });
  }
});

router.post('/terms/:id/activate', requireAuth, requirePermission('academics.manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.transaction(async (tx) => {
      await tx.update(terms).set({ isCurrent: false });
      await tx.update(terms).set({ isCurrent: true }).where(eq(terms.id, id));
    });
    await logAudit(req.authUser, 'SET_CURRENT_TERM', 'terms', id, {}, req);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to activate term.' });
  }
});

router.post('/classes', requireAuth, requirePermission('academics.manage'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(2),
      levelOrder: z.coerce.number().int().min(1).max(20),
      description: z.string().trim().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid class payload.' });
    }
    const [created] = await db.insert(classes).values(parsed.data).returning();
    await logAudit(req.authUser, 'CREATE_CLASS', 'classes', created.id, parsed.data, req);
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'Class name already exists.' });
    res.status(500).json({ error: 'Failed to create class.' });
  }
});

router.post('/streams', requireAuth, requirePermission('academics.manage'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      classId: z.coerce.number().int().positive(),
      name: z.string().trim().min(1),
      capacity: z.coerce.number().int().min(5).max(120).default(45),
      classTeacherId: z.coerce.number().int().positive().nullable().optional(),
      roomName: z.string().trim().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid stream payload.' });
    }
    const [created] = await db.insert(streams).values(parsed.data).returning();
    await logAudit(req.authUser, 'CREATE_STREAM', 'streams', created.id, parsed.data, req);
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'Stream already exists in this class.' });
    res.status(500).json({ error: 'Failed to create stream.' });
  }
});

router.patch('/streams/:id', requireAuth, requirePermission('academics.manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const schema = z.object({
      classTeacherId: z.coerce.number().int().positive().nullable().optional(),
      capacity: z.coerce.number().int().min(5).max(120).optional(),
      roomName: z.string().trim().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid stream update.' });
    const [updated] = await db.update(streams).set(parsed.data).where(eq(streams.id, id)).returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update stream.' });
  }
});

router.post('/subjects', requireAuth, requirePermission('academics.manage'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      code: z.string().trim().min(2),
      name: z.string().trim().min(2),
      department: z.string().trim().min(2),
      isCompulsory: z.boolean().default(true),
      maxMarks: z.coerce.number().int().min(10).max(200).default(100),
      curriculumNotes: z.string().trim().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid subject data.' });
    const [created] = await db.insert(subjects).values(parsed.data).returning();
    await logAudit(req.authUser, 'CREATE_SUBJECT', 'subjects', created.id, parsed.data, req);
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'Subject code already exists.' });
    res.status(500).json({ error: 'Failed to create subject.' });
  }
});

router.post('/assignments', requireAuth, requirePermission('academics.manage'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      staffId: z.coerce.number().int().positive(),
      subjectId: z.coerce.number().int().positive(),
      classId: z.coerce.number().int().positive(),
      streamId: z.coerce.number().int().positive().nullable().optional(),
      academicYearId: z.coerce.number().int().positive(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid teacher assignment.' });
    const [created] = await db
      .insert(teacherAssignments)
      .values({
        staffId: parsed.data.staffId,
        subjectId: parsed.data.subjectId,
        classId: parsed.data.classId,
        streamId: parsed.data.streamId ?? null,
        academicYearId: parsed.data.academicYearId,
      })
      .returning();
    await logAudit(req.authUser, 'ASSIGN_TEACHER_SUBJECT', 'teacher_assignments', created.id, parsed.data, req);
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'Teacher is already assigned to this subject and class.' });
    res.status(500).json({ error: 'Failed to create teacher assignment.' });
  }
});

router.delete('/assignments/:id', requireAuth, requirePermission('academics.manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(teacherAssignments).where(eq(teacherAssignments.id, id));
    await logAudit(req.authUser, 'REMOVE_TEACHER_ASSIGNMENT', 'teacher_assignments', id, {}, req);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete teacher assignment.' });
  }
});

export default router;
