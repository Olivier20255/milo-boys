import { Router } from 'express';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  academicYears,
  announcements,
  auditLogs,
  classes,
  internalMessages,
  notifications,
  permissions,
  rolePermissions,
  roles,
  schoolSettings,
  staff,
  staffAttendance,
  streams,
  studentAttendance,
  students,
  subjects,
  terms,
  timetables,
  users,
} from '../../db/schema.ts';
import { calculateAttendanceRate, detectTimetableConflict, RoleCode } from '../domain.ts';
import {
  AuthRequest,
  logAudit,
  requireAuth,
  requirePermission,
  sanitizeStaffForRole,
} from '../middleware.ts';

export const attendanceRouter = Router();
export const staffRouter = Router();
export const timetableRouter = Router();
export const commsRouter = Router();
export const adminRouter = Router();

// ============================================================================
// ATTENDANCE ROUTES
// ============================================================================

attendanceRouter.get('/students', requireAuth, requirePermission('attendance.view'), async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    const date = req.query.date ? String(req.query.date) : undefined;
    const classId = req.query.classId ? Number(req.query.classId) : undefined;
    const streamId = req.query.streamId ? Number(req.query.streamId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;

    const conditions = [];
    if (user.roleCode === 'STUDENT' || user.roleCode === 'PARENT') {
      conditions.push(eq(studentAttendance.studentId, user.linkedStudentId || -1));
    } else if (studentId) {
      conditions.push(eq(studentAttendance.studentId, studentId));
    }
    if (date) conditions.push(eq(studentAttendance.date, date));
    if (classId) conditions.push(eq(studentAttendance.classId, classId));
    if (streamId) conditions.push(eq(studentAttendance.streamId, streamId));
    if (status && status !== 'ALL') conditions.push(eq(studentAttendance.status, status as any));

    const rows = await db
      .select({
        record: studentAttendance,
        admissionNumber: students.admissionNumber,
        studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
        className: classes.name,
        streamName: streams.name,
      })
      .from(studentAttendance)
      .innerJoin(students, eq(studentAttendance.studentId, students.id))
      .innerJoin(classes, eq(studentAttendance.classId, classes.id))
      .leftJoin(streams, eq(studentAttendance.streamId, streams.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(studentAttendance.date), students.admissionNumber)
      .limit(250);

    const summary = calculateAttendanceRate(rows.map((r) => ({ status: r.record.status })));
    res.json({ items: rows, summary });
  } catch (err) {
    console.error('Attendance fetch error:', err);
    res.status(500).json({ error: 'Failed to load student attendance.' });
  }
});

attendanceRouter.post('/students/batch', requireAuth, requirePermission('attendance.manage'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      classId: z.coerce.number().int().positive(),
      streamId: z.coerce.number().int().positive().nullable().optional(),
      entries: z
        .array(
          z.object({
            studentId: z.coerce.number().int().positive(),
            status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
            remarks: z.string().trim().max(200).optional().nullable(),
          })
        )
        .min(1),
      correctionReason: z.string().trim().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid attendance payload.' });

    const [currentTerm] = await db.select().from(terms).where(eq(terms.isCurrent, true)).limit(1);
    if (!currentTerm) return res.status(400).json({ error: 'No active term configured.' });

    await db.transaction(async (tx) => {
      for (const entry of parsed.data.entries) {
        await tx
          .insert(studentAttendance)
          .values({
            studentId: entry.studentId,
            classId: parsed.data.classId,
            streamId: parsed.data.streamId ?? null,
            termId: currentTerm.id,
            date: parsed.data.date,
            status: entry.status,
            remarks: entry.remarks || null,
            recordedByUserId: req.authUser!.id,
          })
          .onConflictDoUpdate({
            target: [studentAttendance.studentId, studentAttendance.date],
            set: {
              status: entry.status,
              remarks: entry.remarks || null,
              correctedByUserId: req.authUser!.id,
              correctionReason: parsed.data.correctionReason || 'Updated daily roll call',
              updatedAt: new Date(),
            },
          });
      }
    });

    await logAudit(
      req.authUser,
      'RECORD_STUDENT_ATTENDANCE',
      'student_attendance',
      parsed.data.date,
      { classId: parsed.data.classId, count: parsed.data.entries.length },
      req
    );
    res.json({ saved: parsed.data.entries.length });
  } catch (err) {
    console.error('Batch attendance error:', err);
    res.status(500).json({ error: 'Failed to save attendance records.' });
  }
});

attendanceRouter.get('/staff', requireAuth, requirePermission('staff.view'), async (req: AuthRequest, res) => {
  try {
    const date = req.query.date ? String(req.query.date) : undefined;
    const rows = await db
      .select({
        record: staffAttendance,
        employeeNumber: staff.employeeNumber,
        staffName: sql<string>`${staff.firstName} || ' ' || ${staff.lastName}`,
        department: staff.department,
      })
      .from(staffAttendance)
      .innerJoin(staff, eq(staffAttendance.staffId, staff.id))
      .where(date ? eq(staffAttendance.date, date) : undefined)
      .orderBy(desc(staffAttendance.date))
      .limit(150);

    const summary = calculateAttendanceRate(rows.map((r) => ({ status: r.record.status })));
    res.json({ items: rows, summary });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load staff attendance.' });
  }
});

attendanceRouter.post('/staff/batch', requireAuth, requirePermission('staff.manage'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      entries: z
        .array(
          z.object({
            staffId: z.coerce.number().int().positive(),
            status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
            checkInTime: z.string().trim().optional().nullable(),
            remarks: z.string().trim().optional().nullable(),
          })
        )
        .min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid staff attendance data.' });

    await db.transaction(async (tx) => {
      for (const entry of parsed.data.entries) {
        await tx
          .insert(staffAttendance)
          .values({
            staffId: entry.staffId,
            date: parsed.data.date,
            status: entry.status,
            checkInTime: entry.checkInTime || null,
            remarks: entry.remarks || null,
            recordedByUserId: req.authUser!.id,
          })
          .onConflictDoUpdate({
            target: [staffAttendance.staffId, staffAttendance.date],
            set: {
              status: entry.status,
              checkInTime: entry.checkInTime || null,
              remarks: entry.remarks || null,
            },
          });
      }
    });

    await logAudit(req.authUser, 'RECORD_STAFF_ATTENDANCE', 'staff_attendance', parsed.data.date, { count: parsed.data.entries.length }, req);
    res.json({ saved: parsed.data.entries.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save staff attendance.' });
  }
});

// ============================================================================
// STAFF ROUTES
// ============================================================================

const STAFF_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'staff');
fs.mkdirSync(STAFF_UPLOAD_DIR, { recursive: true });

const staffDocUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STAFF_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = ['.pdf', '.jpg', '.jpeg', '.png'].includes(ext) ? ext : '.pdf';
      cb(null, `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error('Only PDF, JPEG, or PNG staff documents are permitted.'));
      return;
    }
    cb(null, true);
  },
});

const staffSchema = z.object({
  employeeNumber: z.string().trim().min(3),
  firstName: z.string().trim().min(2),
  lastName: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7),
  staffType: z.enum(['TEACHING', 'NON_TEACHING', 'ADMINISTRATION']),
  department: z.string().trim().min(2),
  designation: z.string().trim().min(2),
  qualifications: z.string().trim().min(2),
  tscNumber: z.string().trim().optional().nullable(),
  nationalId: z.string().trim().optional().nullable(),
  salaryAmount: z.coerce.number().min(0).optional().nullable(),
  dateJoined: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employmentStatus: z.enum(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'RETIRED']).default('ACTIVE'),
});

staffRouter.get('/', requireAuth, requirePermission('staff.view'), async (req: AuthRequest, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const staffType = req.query.staffType ? String(req.query.staffType) : undefined;
    const conditions = [];
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(staff.employeeNumber, pattern),
          ilike(staff.firstName, pattern),
          ilike(staff.lastName, pattern),
          ilike(staff.department, pattern)
        )!
      );
    }
    if (staffType && staffType !== 'ALL') {
      conditions.push(eq(staff.staffType, staffType as any));
    }

    const rows = await db
      .select()
      .from(staff)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(staff.employeeNumber);

    const user = req.authUser!;
    res.json(rows.map((r) => sanitizeStaffForRole(r, user.permissions, user.roleCode)));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load staff directory.' });
  }
});

staffRouter.post('/', requireAuth, requirePermission('staff.manage'), async (req: AuthRequest, res) => {
  try {
    const parsed = staffSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid staff details.' });
    }
    const { salaryAmount, ...rest } = parsed.data;
    const [created] = await db
      .insert(staff)
      .values({
        ...rest,
        salaryAmount: salaryAmount !== undefined && salaryAmount !== null ? salaryAmount.toFixed(2) : null,
      })
      .returning();

    await logAudit(req.authUser, 'REGISTER_STAFF', 'staff', created.id, { employeeNumber: created.employeeNumber }, req);
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Employee number or email already exists.' });
    }
    res.status(500).json({ error: 'Failed to register staff member.' });
  }
});

staffRouter.patch('/:id', requireAuth, requirePermission('staff.manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = staffSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid staff update.' });
    const { salaryAmount, ...rest } = parsed.data;
    const [updated] = await db
      .update(staff)
      .set({
        ...rest,
        ...(salaryAmount !== undefined
          ? { salaryAmount: salaryAmount !== null ? salaryAmount.toFixed(2) : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(staff.id, id))
      .returning();
    await logAudit(req.authUser, 'UPDATE_STAFF', 'staff', id, { fields: Object.keys(parsed.data) }, req);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update staff record.' });
  }
});

staffRouter.post(
  '/:id/documents',
  requireAuth,
  requirePermission('staff.manage'),
  staffDocUpload.single('document'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!req.file) return res.status(400).json({ error: 'No valid document uploaded.' });
      const resolved = path.resolve(req.file.path);
      if (!resolved.startsWith(STAFF_UPLOAD_DIR + path.sep)) {
        return res.status(400).json({ error: 'Invalid file path.' });
      }
      const [row] = await db.select().from(staff).where(eq(staff.id, id));
      if (!row) return res.status(404).json({ error: 'Staff member not found.' });

      const newDoc = {
        name: String(req.body.docName || req.file.originalname).slice(0, 120),
        url: `/uploads/staff/${req.file.filename}`,
        uploadedAt: new Date().toISOString(),
      };
      const updatedDocs = [...(row.documents || []), newDoc];
      await db.update(staff).set({ documents: updatedDocs }).where(eq(staff.id, id));
      await logAudit(req.authUser, 'UPLOAD_STAFF_DOCUMENT', 'staff', id, { docName: newDoc.name }, req);
      res.json(updatedDocs);
    } catch (err) {
      res.status(500).json({ error: 'Failed to upload staff document.' });
    }
  }
);

// ============================================================================
// TIMETABLE ROUTES (WITH CONFLICT DETECTION)
// ============================================================================

timetableRouter.get('/', requireAuth, requirePermission('timetable.view'), async (req: AuthRequest, res) => {
  try {
    const streamId = req.query.streamId ? Number(req.query.streamId) : undefined;
    const staffId = req.query.staffId ? Number(req.query.staffId) : undefined;
    const termId = req.query.termId ? Number(req.query.termId) : undefined;

    const conditions = [];
    if (streamId) conditions.push(eq(timetables.streamId, streamId));
    if (staffId) conditions.push(eq(timetables.staffId, staffId));
    if (termId) conditions.push(eq(timetables.termId, termId));

    const rows = await db
      .select({
        slot: timetables,
        className: classes.name,
        streamName: streams.name,
        subjectName: subjects.name,
        subjectCode: subjects.code,
        teacherName: sql<string>`${staff.firstName} || ' ' || ${staff.lastName}`,
      })
      .from(timetables)
      .innerJoin(classes, eq(timetables.classId, classes.id))
      .innerJoin(streams, eq(timetables.streamId, streams.id))
      .leftJoin(subjects, eq(timetables.subjectId, subjects.id))
      .leftJoin(staff, eq(timetables.staffId, staff.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(timetables.startTime);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load timetables.' });
  }
});

timetableRouter.post('/', requireAuth, requirePermission('timetable.manage'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      academicYearId: z.coerce.number().int().positive(),
      termId: z.coerce.number().int().positive(),
      classId: z.coerce.number().int().positive(),
      streamId: z.coerce.number().int().positive(),
      subjectId: z.coerce.number().int().positive().nullable().optional(),
      staffId: z.coerce.number().int().positive().nullable().optional(),
      dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      room: z.string().trim().min(1),
      isBreak: z.boolean().default(false),
      breakLabel: z.string().trim().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid timetable slot.' });
    const data = parsed.data;

    const existing = await db
      .select()
      .from(timetables)
      .where(and(eq(timetables.termId, data.termId), eq(timetables.dayOfWeek, data.dayOfWeek)));

    const conflict = detectTimetableConflict(
      {
        termId: data.termId,
        streamId: data.streamId,
        staffId: data.staffId ?? null,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        room: data.room,
        isBreak: data.isBreak,
      },
      existing.map((e) => ({
        id: e.id,
        termId: e.termId,
        streamId: e.streamId,
        staffId: e.staffId,
        dayOfWeek: e.dayOfWeek,
        startTime: e.startTime,
        endTime: e.endTime,
        room: e.room,
        isBreak: e.isBreak,
      }))
    );

    if (conflict.hasConflict) {
      return res.status(409).json({
        error: conflict.message,
        conflictType: conflict.conflictType,
      });
    }

    const [created] = await db
      .insert(timetables)
      .values({
        ...data,
        subjectId: data.isBreak ? null : data.subjectId ?? null,
        staffId: data.isBreak ? null : data.staffId ?? null,
      })
      .returning();

    await logAudit(req.authUser, 'CREATE_TIMETABLE_SLOT', 'timetables', created.id, data, req);
    res.status(201).json(created);
  } catch (err) {
    console.error('Create timetable slot error:', err);
    res.status(500).json({ error: 'Failed to schedule timetable lesson.' });
  }
});

timetableRouter.delete('/:id', requireAuth, requirePermission('timetable.manage'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(timetables).where(eq(timetables.id, id));
    await logAudit(req.authUser, 'DELETE_TIMETABLE_SLOT', 'timetables', id, {}, req);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove timetable slot.' });
  }
});

// ============================================================================
// COMMUNICATION ROUTES
// ============================================================================

commsRouter.get('/announcements', requireAuth, requirePermission('comms.view'), async (_req, res) => {
  try {
    const rows = await db
      .select({
        announcement: announcements,
        authorName: users.fullName,
      })
      .from(announcements)
      .innerJoin(users, eq(announcements.authorUserId, users.id))
      .orderBy(desc(announcements.createdAt));

    res.json(rows.map((r) => ({ ...r.announcement, authorName: r.authorName })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load announcements.' });
  }
});

commsRouter.post('/announcements', requireAuth, requirePermission('comms.manage'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      title: z.string().trim().min(3),
      content: z.string().trim().min(5),
      category: z.enum(['GENERAL', 'ACADEMIC', 'EVENT', 'FINANCE']),
      targetAudience: z.enum(['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS', 'STAFF']),
      eventDate: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid announcement data.' });

    const [created] = await db
      .insert(announcements)
      .values({
        ...parsed.data,
        eventDate: parsed.data.eventDate || null,
        authorUserId: req.authUser!.id,
      })
      .returning();

    // Create in-app notifications for active users
    const activeUsers = await db.select({ id: users.id }).from(users).where(eq(users.isActive, true));
    for (const u of activeUsers) {
      if (u.id !== req.authUser!.id) {
        await db.insert(notifications).values({
          userId: u.id,
          title: created.title,
          message: created.content.slice(0, 140),
          category: created.category,
          linkModule: 'communication',
        });
      }
    }

    await logAudit(req.authUser, 'PUBLISH_ANNOUNCEMENT', 'announcements', created.id, { title: created.title }, req);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish announcement.' });
  }
});

commsRouter.get('/messages', requireAuth, requirePermission('comms.view'), async (req: AuthRequest, res) => {
  try {
    const uid = req.authUser!.id;
    const rows = await db
      .select({
        message: internalMessages,
        senderName: users.fullName,
        senderEmail: users.email,
      })
      .from(internalMessages)
      .innerJoin(users, eq(internalMessages.senderUserId, users.id))
      .where(or(eq(internalMessages.recipientUserId, uid), eq(internalMessages.senderUserId, uid)))
      .orderBy(desc(internalMessages.createdAt))
      .limit(50);

    const recipients = await db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users);
    const recipientMap = new Map(recipients.map((u) => [u.id, u]));

    res.json(
      rows.map((r) => ({
        ...r.message,
        senderName: r.senderName,
        senderEmail: r.senderEmail,
        recipientName: recipientMap.get(r.message.recipientUserId)?.fullName || 'User',
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages.' });
  }
});

commsRouter.post('/messages', requireAuth, requirePermission('comms.view'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      recipientUserId: z.coerce.number().int().positive(),
      subject: z.string().trim().min(2),
      body: z.string().trim().min(2),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide recipient, subject, and message body.' });

    const [created] = await db
      .insert(internalMessages)
      .values({
        senderUserId: req.authUser!.id,
        recipientUserId: parsed.data.recipientUserId,
        subject: parsed.data.subject,
        body: parsed.data.body,
      })
      .returning();

    await db.insert(notifications).values({
      userId: parsed.data.recipientUserId,
      title: `New Message: ${parsed.data.subject}`,
      message: `From ${req.authUser!.fullName}`,
      category: 'MESSAGE',
      linkModule: 'communication',
    });

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send internal message.' });
  }
});

commsRouter.get('/recipients', requireAuth, requirePermission('comms.view'), async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.isActive, true))
      .orderBy(users.fullName);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load recipients.' });
  }
});

// ============================================================================
// ADMINISTRATION, RBAC, AUDIT LOGS & BACKUP ROUTES
// ============================================================================

adminRouter.get('/users', requireAuth, requirePermission('admin.users'), async (_req, res) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        roleId: users.roleId,
        roleCode: roles.code,
        roleName: roles.name,
        isActive: users.isActive,
        linkedStudentId: users.linkedStudentId,
        linkedStaffId: users.linkedStaffId,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .orderBy(users.id);

    const allRoles = await db.select().from(roles).orderBy(roles.id);
    const allPerms = await db.select().from(permissions).orderBy(permissions.module, permissions.code);
    const rolePermRows = await db.select().from(rolePermissions);

    res.json({ users: allUsers, roles: allRoles, permissions: allPerms, rolePermissions: rolePermRows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load user directory.' });
  }
});

adminRouter.post('/users', requireAuth, requirePermission('admin.users'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      email: z.string().trim().email(),
      fullName: z.string().trim().min(2),
      roleCode: z.enum(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'TEACHER', 'ACCOUNTANT', 'STUDENT', 'PARENT']),
      linkedStudentId: z.coerce.number().int().positive().nullable().optional(),
      linkedStaffId: z.coerce.number().int().positive().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid user details.' });

    const [roleRow] = await db.select().from(roles).where(eq(roles.code, parsed.data.roleCode as RoleCode));
    if (!roleRow) return res.status(400).json({ error: 'Role not found.' });

    const [created] = await db
      .insert(users)
      .values({
        uid: `pre-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        email: parsed.data.email.toLowerCase(),
        fullName: parsed.data.fullName,
        roleId: roleRow.id,
        isActive: true,
        linkedStudentId: parsed.data.linkedStudentId ?? null,
        linkedStaffId: parsed.data.linkedStaffId ?? null,
      })
      .returning();

    await logAudit(req.authUser, 'PROVISION_USER', 'users', created.id, { email: created.email, role: parsed.data.roleCode }, req);
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'A user with this email already exists.' });
    res.status(500).json({ error: 'Failed to provision user.' });
  }
});

adminRouter.patch('/users/:id', requireAuth, requirePermission('admin.users'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const schema = z.object({
      roleId: z.coerce.number().int().positive().optional(),
      isActive: z.boolean().optional(),
      linkedStudentId: z.coerce.number().int().positive().nullable().optional(),
      linkedStaffId: z.coerce.number().int().positive().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid user update.' });

    const [updated] = await db
      .update(users)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    await logAudit(req.authUser, 'UPDATE_USER_ACCESS', 'users', id, parsed.data, req);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user account.' });
  }
});

adminRouter.patch('/settings', requireAuth, requirePermission('admin.settings'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      schoolName: z.string().trim().min(2),
      motto: z.string().trim().min(2),
      code: z.string().trim().min(2),
      email: z.string().trim().email(),
      phone: z.string().trim().min(5),
      address: z.string().trim().min(3),
      county: z.string().trim().min(2),
      rankStudentsInReports: z.boolean(),
      mpesaShortcode: z.string().trim().optional().nullable(),
      mpesaEnv: z.enum(['sandbox', 'production']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid school configuration.' });

    const [existing] = await db.select().from(schoolSettings).limit(1);
    const [updated] = await db
      .update(schoolSettings)
      .set({
        ...parsed.data,
        mpesaConfigured: Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET),
        emailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
        smsConfigured: Boolean(process.env.SMS_API_KEY),
        updatedAt: new Date(),
      })
      .where(eq(schoolSettings.id, existing.id))
      .returning();

    await logAudit(req.authUser, 'UPDATE_SCHOOL_SETTINGS', 'school_settings', updated.id, {}, req);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save school settings.' });
  }
});

adminRouter.get('/audit-logs', requireAuth, requirePermission('admin.audit'), async (_req, res) => {
  try {
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

adminRouter.get('/backup', requireAuth, requirePermission('admin.audit'), async (req: AuthRequest, res) => {
  try {
    const [
      settingsRows,
      yearsRows,
      termsRows,
      classesRows,
      streamsRows,
      subjectsRows,
      studentsRows,
      staffRows,
    ] = await Promise.all([
      db.select().from(schoolSettings),
      db.select().from(academicYears),
      db.select().from(terms),
      db.select().from(classes),
      db.select().from(streams),
      db.select().from(subjects),
      db.select().from(students),
      db.select().from(staff),
    ]);

    await logAudit(req.authUser, 'EXPORT_DATABASE_BACKUP', 'system', null, {}, req);
    res.setHeader('Content-Disposition', `attachment; filename="milo-boys-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      exportedBy: req.authUser!.email,
      schoolSettings: settingsRows,
      academicYears: yearsRows,
      terms: termsRows,
      classes: classesRows,
      streams: streamsRows,
      subjects: subjectsRows,
      students: studentsRows,
      staff: staffRows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to export database backup.' });
  }
});
