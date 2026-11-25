import { Request, Response, NextFunction } from 'express';
import { eq, sql } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { auditLogs, permissions, rolePermissions, roles, users } from '../db/schema.ts';
import type { RoleCode } from './domain.ts';

export interface AuthenticatedUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  roleId: number;
  roleCode: RoleCode;
  roleName: string;
  isActive: boolean;
  linkedStudentId: number | null;
  linkedGuardianId: number | null;
  linkedStaffId: number | null;
  permissions: string[];
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

const ROLE_DEFINITIONS: Array<{ code: RoleCode; name: string; description: string }> = [
  { code: 'SUPER_ADMIN', name: 'Super Administrator', description: 'Complete system access, user/role governance, settings, and audit logs.' },
  { code: 'SCHOOL_ADMIN', name: 'School Administrator', description: 'Manage school operations, students, staff, classes, attendance, and exams.' },
  { code: 'HEADTEACHER', name: 'Headteacher / Principal', description: 'Institutional oversight, academic progress, approvals, and attendance monitoring.' },
  { code: 'TEACHER', name: 'Teacher', description: 'Assigned classes, daily student attendance, and draft examination marks entry.' },
  { code: 'ACCOUNTANT', name: 'Accountant', description: 'Fee structures, payment recording, receipts, arrears, and financial reports.' },
  { code: 'STUDENT', name: 'Student', description: 'Personal profile, attendance, fee statement, and published exam results.' },
  { code: 'PARENT', name: 'Parent / Guardian', description: 'Linked student profile, published results, attendance, fee balance, and notices.' },
];

const PERMISSION_DEFINITIONS: Array<{ code: string; module: string; description: string }> = [
  { code: 'dashboard.view', module: 'Dashboard', description: 'View institutional dashboard' },
  { code: 'students.view', module: 'Students', description: 'View student directory and profiles' },
  { code: 'students.manage', module: 'Students', description: 'Register, edit, transfer, and promote students' },
  { code: 'students.medical', module: 'Students', description: 'Access confidential student medical records' },
  { code: 'staff.view', module: 'Staff', description: 'View staff directory and profiles' },
  { code: 'staff.manage', module: 'Staff', description: 'Register and update staff records' },
  { code: 'staff.confidential', module: 'Staff', description: 'View confidential staff IDs, salaries, and documents' },
  { code: 'academics.view', module: 'Academics', description: 'View academic years, terms, classes, subjects' },
  { code: 'academics.manage', module: 'Academics', description: 'Configure academic years, classes, streams, subjects, allocations' },
  { code: 'exams.view', module: 'Examinations', description: 'View examinations and published results' },
  { code: 'exams.enter_marks', module: 'Examinations', description: 'Enter and edit draft examination marks' },
  { code: 'exams.verify', module: 'Examinations', description: 'Verify, finalize, publish, and reopen examinations' },
  { code: 'finance.view', module: 'Finance', description: 'View fee structures, balances, and statements' },
  { code: 'finance.manage', module: 'Finance', description: 'Create fee structures, record payments, issue receipts, apply discounts' },
  { code: 'attendance.view', module: 'Attendance', description: 'View attendance records and summaries' },
  { code: 'attendance.manage', module: 'Attendance', description: 'Record and correct daily attendance' },
  { code: 'timetable.view', module: 'Timetable', description: 'View class and teacher timetables' },
  { code: 'timetable.manage', module: 'Timetable', description: 'Create and edit timetable schedules' },
  { code: 'comms.view', module: 'Communication', description: 'View announcements and notifications' },
  { code: 'comms.manage', module: 'Communication', description: 'Publish announcements and send messages' },
  { code: 'reports.view', module: 'Reports', description: 'Access and export institutional reports' },
  { code: 'admin.users', module: 'Administration', description: 'Manage user accounts and role assignments' },
  { code: 'admin.settings', module: 'Administration', description: 'Configure school settings and external integrations' },
  { code: 'admin.audit', module: 'Administration', description: 'View immutable audit logs and system backups' },
];

const ROLE_PERMISSION_MATRIX: Record<RoleCode, string[]> = {
  SUPER_ADMIN: PERMISSION_DEFINITIONS.map((p) => p.code),
  SCHOOL_ADMIN: [
    'dashboard.view', 'students.view', 'students.manage', 'students.medical',
    'staff.view', 'staff.manage', 'staff.confidential',
    'academics.view', 'academics.manage',
    'exams.view', 'exams.enter_marks', 'exams.verify',
    'attendance.view', 'attendance.manage',
    'timetable.view', 'timetable.manage',
    'comms.view', 'comms.manage', 'reports.view',
  ],
  HEADTEACHER: [
    'dashboard.view', 'students.view', 'students.medical',
    'staff.view', 'staff.confidential',
    'academics.view', 'exams.view', 'exams.verify',
    'finance.view', 'attendance.view', 'timetable.view',
    'comms.view', 'comms.manage', 'reports.view',
  ],
  TEACHER: [
    'dashboard.view', 'students.view', 'students.medical',
    'academics.view', 'exams.view', 'exams.enter_marks',
    'attendance.view', 'attendance.manage',
    'timetable.view', 'comms.view', 'comms.manage',
  ],
  ACCOUNTANT: [
    'dashboard.view', 'students.view',
    'finance.view', 'finance.manage',
    'comms.view', 'reports.view',
  ],
  STUDENT: [
    'dashboard.view', 'students.view', 'exams.view',
    'finance.view', 'attendance.view', 'timetable.view', 'comms.view',
  ],
  PARENT: [
    'dashboard.view', 'students.view', 'exams.view',
    'finance.view', 'attendance.view', 'timetable.view', 'comms.view',
  ],
};

let rolesBootstrapped = false;

export async function ensureRolesAndPermissions() {
  if (rolesBootstrapped) return;
  const existingRoles = await db.select().from(roles);
  if (existingRoles.length >= ROLE_DEFINITIONS.length) {
    rolesBootstrapped = true;
    return;
  }

  for (const r of ROLE_DEFINITIONS) {
    await db
      .insert(roles)
      .values(r)
      .onConflictDoNothing({ target: roles.code });
  }

  for (const p of PERMISSION_DEFINITIONS) {
    await db
      .insert(permissions)
      .values(p)
      .onConflictDoNothing({ target: permissions.code });
  }

  const allRoles = await db.select().from(roles);
  const allPerms = await db.select().from(permissions);
  const permByCode = new Map(allPerms.map((p) => [p.code, p.id]));

  for (const role of allRoles) {
    const allowedCodes = ROLE_PERMISSION_MATRIX[role.code as RoleCode] || [];
    for (const code of allowedCodes) {
      const permId = permByCode.get(code);
      if (permId) {
        await db
          .insert(rolePermissions)
          .values({ roleId: role.id, permissionId: permId })
          .onConflictDoNothing();
      }
    }
  }
  rolesBootstrapped = true;
}

export async function getPermissionsForRole(roleId: number): Promise<string[]> {
  const rows = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));
  return rows.map((r) => r.code);
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    await ensureRolesAndPermissions();

    const email = (decoded.email || '').toLowerCase();
    const fullName = decoded.name || email.split('@')[0] || 'Milo User';
    const avatarUrl = decoded.picture || null;

    // Look up existing user by uid or pre-provisioned email
    let [existingUser] = await db.select().from(users).where(eq(users.uid, decoded.uid));
    if (!existingUser && email) {
      [existingUser] = await db.select().from(users).where(eq(users.email, email));
      if (existingUser) {
        const [updated] = await db
          .update(users)
          .set({ uid: decoded.uid, avatarUrl: avatarUrl || existingUser.avatarUrl, lastLoginAt: new Date() })
          .where(eq(users.id, existingUser.id))
          .returning();
        existingUser = updated;
      }
    }

    if (!existingUser) {
      // Determine role: first user in the system becomes SUPER_ADMIN; otherwise STUDENT
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
      const targetRoleCode: RoleCode = count === 0 ? 'SUPER_ADMIN' : 'STUDENT';
      const [roleRow] = await db.select().from(roles).where(eq(roles.code, targetRoleCode));

      const [created] = await db
        .insert(users)
        .values({
          uid: decoded.uid,
          email: email || `${decoded.uid}@miloboys.local`,
          fullName,
          avatarUrl,
          roleId: roleRow.id,
          isActive: true,
          lastLoginAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: { lastLoginAt: new Date(), avatarUrl },
        })
        .returning();
      existingUser = created;
    } else {
      await db
        .update(users)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, existingUser.id));
    }

    if (!existingUser.isActive) {
      return res.status(403).json({ error: 'Your account has been deactivated. Contact the School Administrator.' });
    }

    const [roleRow] = await db.select().from(roles).where(eq(roles.id, existingUser.roleId));
    const permCodes = await getPermissionsForRole(existingUser.roleId);

    req.authUser = {
      id: existingUser.id,
      uid: existingUser.uid,
      email: existingUser.email,
      fullName: existingUser.fullName,
      avatarUrl: existingUser.avatarUrl,
      roleId: existingUser.roleId,
      roleCode: roleRow.code as RoleCode,
      roleName: roleRow.name,
      isActive: existingUser.isActive,
      linkedStudentId: existingUser.linkedStudentId,
      linkedGuardianId: existingUser.linkedGuardianId,
      linkedStaffId: existingUser.linkedStaffId,
      permissions: permCodes,
    };

    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
};

export const requirePermission = (permissionCode: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.authUser.roleCode === 'SUPER_ADMIN' || req.authUser.permissions.includes(permissionCode)) {
      return next();
    }
    return res.status(403).json({
      error: `Access denied. Required permission: ${permissionCode}.`,
    });
  };
};

export const requireRole = (...allowedRoles: RoleCode[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (allowedRoles.includes(req.authUser.roleCode)) {
      return next();
    }
    return res.status(403).json({
      error: `Access denied. This action is restricted to: ${allowedRoles.join(', ')}.`,
    });
  };
};

export async function logAudit(
  user: AuthenticatedUser | undefined,
  action: string,
  entity: string,
  entityId: string | number | null,
  details?: Record<string, unknown>,
  req?: Request
) {
  try {
    await db.insert(auditLogs).values({
      userId: user?.id ?? null,
      actorEmail: user?.email ?? 'system',
      actorRole: user?.roleCode ?? 'SYSTEM',
      action,
      entity,
      entityId: entityId !== null ? String(entityId) : null,
      details: details ?? null,
      ipAddress: req?.ip ?? null,
    });
  } catch (err) {
    console.error('Audit log insert failed:', err);
  }
}

export function sanitizeStudentForRole<T extends Record<string, any>>(
  student: T,
  permissionsList: string[],
  roleCode: RoleCode
): T {
  const canSeeMedical = roleCode === 'SUPER_ADMIN' || permissionsList.includes('students.medical');
  if (canSeeMedical) return student;
  return {
    ...student,
    bloodGroup: null,
    allergies: null,
    medicalConditions: null,
    medicalNotes: null,
  };
}

export function sanitizeStaffForRole<T extends Record<string, any>>(
  staffRow: T,
  permissionsList: string[],
  roleCode: RoleCode
): T {
  const canSeeConfidential = roleCode === 'SUPER_ADMIN' || permissionsList.includes('staff.confidential');
  if (canSeeConfidential) return staffRow;
  return {
    ...staffRow,
    nationalId: null,
    salaryAmount: null,
    documents: [],
  };
}
