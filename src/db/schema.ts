import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ============================================================================
// ENUMS
// ============================================================================

export const roleCodeEnum = pgEnum('role_code', [
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'HEADTEACHER',
  'TEACHER',
  'ACCOUNTANT',
  'STUDENT',
  'PARENT',
]);

export const studentStatusEnum = pgEnum('student_status', [
  'ACTIVE',
  'TRANSFERRED',
  'GRADUATED',
  'SUSPENDED',
  'WITHDRAWN',
]);

export const employmentStatusEnum = pgEnum('employment_status', [
  'ACTIVE',
  'ON_LEAVE',
  'SUSPENDED',
  'RESIGNED',
  'RETIRED',
]);

export const staffTypeEnum = pgEnum('staff_type', [
  'TEACHING',
  'NON_TEACHING',
  'ADMINISTRATION',
]);

export const examTypeEnum = pgEnum('exam_type', [
  'CAT_1',
  'CAT_2',
  'MID_TERM',
  'END_OF_TERM',
  'MOCK',
]);

export const examStatusEnum = pgEnum('exam_status', [
  'DRAFT',
  'SUBMITTED',
  'VERIFIED',
  'FINALIZED',
  'PUBLISHED',
]);

export const attendanceStatusEnum = pgEnum('attendance_status', [
  'PRESENT',
  'ABSENT',
  'LATE',
  'EXCUSED',
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'MPESA',
  'BANK_TRANSFER',
  'CASH',
  'CHEQUE',
  'OTHER',
]);

export const dayOfWeekEnum = pgEnum('day_of_week', [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
]);

// ============================================================================
// 1. IDENTITY, ROLES, PERMISSIONS & AUDIT
// ============================================================================

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  code: roleCodeEnum('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  module: text('module').notNull(),
  description: text('description').notNull(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: serial('id').primaryKey(),
    roleId: integer('role_id')
      .references(() => roles.id, { onDelete: 'cascade' })
      .notNull(),
    permissionId: integer('permission_id')
      .references(() => permissions.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [
    uniqueIndex('role_permissions_unique_idx').on(table.roleId, table.permissionId),
  ]
);

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    email: text('email').notNull().unique(),
    fullName: text('full_name').notNull(),
    avatarUrl: text('avatar_url'),
    roleId: integer('role_id')
      .references(() => roles.id)
      .notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    linkedStudentId: integer('linked_student_id'),
    linkedGuardianId: integer('linked_guardian_id'),
    linkedStaffId: integer('linked_staff_id'),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('users_role_idx').on(table.roleId)]
);

export const schoolSettings = pgTable('school_settings', {
  id: serial('id').primaryKey(),
  schoolName: text('school_name').default('Milo Boys School').notNull(),
  motto: text('motto').default('Excellence, Integrity & Service').notNull(),
  code: text('code').default('MBS-001').notNull(),
  email: text('email').default('admin@miloboys.ac.ke').notNull(),
  phone: text('phone').default('+254 700 123 456').notNull(),
  address: text('address').default('P.O. Box 4120 - 00100, Nairobi, Kenya').notNull(),
  county: text('county').default('Nairobi').notNull(),
  rankStudentsInReports: boolean('rank_students_in_reports').default(true).notNull(),
  mpesaShortcode: text('mpesa_shortcode'),
  mpesaEnv: text('mpesa_env').default('sandbox'),
  mpesaConfigured: boolean('mpesa_configured').default(false).notNull(),
  emailConfigured: boolean('email_configured').default(false).notNull(),
  smsConfigured: boolean('sms_configured').default(false).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    actorEmail: text('actor_email').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    details: jsonb('details').$type<Record<string, unknown>>(),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_entity_idx').on(table.entity, table.createdAt),
    index('audit_logs_actor_idx').on(table.userId),
  ]
);

// ============================================================================
// 2. ACADEMIC STRUCTURE
// ============================================================================

export const academicYears = pgTable('academic_years', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // e.g., "2026"
  startDate: text('start_date').notNull(), // YYYY-MM-DD
  endDate: text('end_date').notNull(),
  isCurrent: boolean('is_current').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const terms = pgTable(
  'terms',
  {
    id: serial('id').primaryKey(),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(), // "Term 1", "Term 2", "Term 3"
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    isCurrent: boolean('is_current').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('terms_year_name_idx').on(table.academicYearId, table.name),
  ]
);

export const classes = pgTable('classes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // "Form 1", "Form 2", "Form 3", "Form 4"
  levelOrder: integer('level_order').notNull(), // 1, 2, 3, 4
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const streams = pgTable(
  'streams',
  {
    id: serial('id').primaryKey(),
    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(), // "North", "East", "West"
    capacity: integer('capacity').default(45).notNull(),
    classTeacherId: integer('class_teacher_id'),
    roomName: text('room_name'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('streams_class_name_idx').on(table.classId, table.name)]
);

export const subjects = pgTable('subjects', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // e.g. "101", "102", "121"
  name: text('name').notNull(),
  department: text('department').notNull(),
  isCompulsory: boolean('is_compulsory').default(true).notNull(),
  maxMarks: integer('max_marks').default(100).notNull(),
  curriculumNotes: text('curriculum_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// 3. STAFF, STUDENTS, GUARDIANS & ENROLLMENTS
// ============================================================================

export const staff = pgTable(
  'staff',
  {
    id: serial('id').primaryKey(),
    employeeNumber: text('employee_number').notNull().unique(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull().unique(),
    phone: text('phone').notNull(),
    staffType: staffTypeEnum('staff_type').default('TEACHING').notNull(),
    department: text('department').notNull(),
    designation: text('designation').notNull(),
    qualifications: text('qualifications').notNull(),
    tscNumber: text('tsc_number'),
    nationalId: text('national_id'), // Restricted to HR/Admins
    salaryAmount: numeric('salary_amount', { precision: 12, scale: 2 }), // Restricted
    dateJoined: text('date_joined').notNull(),
    employmentStatus: employmentStatusEnum('employment_status').default('ACTIVE').notNull(),
    photoUrl: text('photo_url'),
    documents: jsonb('documents').$type<Array<{ name: string; url: string; uploadedAt: string }>>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('staff_type_idx').on(table.staffType, table.employmentStatus)]
);

export const guardians = pgTable('guardians', {
  id: serial('id').primaryKey(),
  fullName: text('full_name').notNull(),
  relationship: text('relationship').notNull(), // Father, Mother, Guardian
  phone: text('phone').notNull(),
  altPhone: text('alt_phone'),
  email: text('email'),
  nationalId: text('national_id'),
  occupation: text('occupation'),
  address: text('address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const students = pgTable(
  'students',
  {
    id: serial('id').primaryKey(),
    admissionNumber: text('admission_number').notNull().unique(),
    firstName: text('first_name').notNull(),
    middleName: text('middle_name'),
    lastName: text('last_name').notNull(),
    dateOfBirth: text('date_of_birth').notNull(),
    gender: text('gender').default('Male').notNull(),
    admissionDate: text('admission_date').notNull(),
    kcpeIndex: text('kcpe_index'),
    kcpeScore: integer('kcpe_score'),
    photoUrl: text('photo_url'),
    currentClassId: integer('current_class_id').references(() => classes.id),
    currentStreamId: integer('current_stream_id').references(() => streams.id),
    guardianId: integer('guardian_id').references(() => guardians.id),
    emergencyContactName: text('emergency_contact_name').notNull(),
    emergencyContactPhone: text('emergency_contact_phone').notNull(),
    emergencyContactRelation: text('emergency_contact_relation').notNull(),
    // Confidential medical fields (filtered by backend permissions)
    bloodGroup: text('blood_group'),
    allergies: text('allergies'),
    medicalConditions: text('medical_conditions'),
    medicalNotes: text('medical_notes'),
    residenceAddress: text('residence_address'),
    county: text('county'),
    status: studentStatusEnum('status').default('ACTIVE').notNull(),
    statusReason: text('status_reason'),
    statusChangedAt: timestamp('status_changed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('students_class_stream_idx').on(table.currentClassId, table.currentStreamId),
    index('students_status_idx').on(table.status),
  ]
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: serial('id').primaryKey(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id, { onDelete: 'cascade' })
      .notNull(),
    classId: integer('class_id')
      .references(() => classes.id)
      .notNull(),
    streamId: integer('stream_id').references(() => streams.id),
    enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
    isActive: boolean('is_active').default(true).notNull(),
  },
  (table) => [
    uniqueIndex('enrollments_student_year_idx').on(table.studentId, table.academicYearId),
  ]
);

export const teacherAssignments = pgTable(
  'teacher_assignments',
  {
    id: serial('id').primaryKey(),
    staffId: integer('staff_id')
      .references(() => staff.id, { onDelete: 'cascade' })
      .notNull(),
    subjectId: integer('subject_id')
      .references(() => subjects.id, { onDelete: 'cascade' })
      .notNull(),
    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),
    streamId: integer('stream_id').references(() => streams.id, { onDelete: 'cascade' }),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('teacher_assign_unique_idx').on(
      table.staffId,
      table.subjectId,
      table.classId,
      table.streamId,
      table.academicYearId
    ),
  ]
);

// ============================================================================
// 4. EXAMINATIONS, GRADING & RESULTS WORKFLOW
// ============================================================================

export const gradingScales = pgTable('grading_scales', {
  id: serial('id').primaryKey(),
  grade: text('grade').notNull().unique(), // A, A-, B+, ... E
  minScore: integer('min_score').notNull(),
  maxScore: integer('max_score').notNull(),
  points: integer('points').notNull(), // 12 down to 1
  remarks: text('remarks').notNull(),
});

export const examinations = pgTable(
  'examinations',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(), // e.g., "Term 1 End-of-Term Exams 2026"
    examType: examTypeEnum('exam_type').notNull(),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id)
      .notNull(),
    termId: integer('term_id')
      .references(() => terms.id)
      .notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    status: examStatusEnum('status').default('DRAFT').notNull(),
    createdByUserId: integer('created_by_user_id').references(() => users.id),
    submittedByUserId: integer('submitted_by_user_id').references(() => users.id),
    submittedAt: timestamp('submitted_at'),
    verifiedByUserId: integer('verified_by_user_id').references(() => users.id),
    verifiedAt: timestamp('verified_at'),
    finalizedByUserId: integer('finalized_by_user_id').references(() => users.id),
    finalizedAt: timestamp('finalized_at'),
    publishedByUserId: integer('published_by_user_id').references(() => users.id),
    publishedAt: timestamp('published_at'),
    reopenReason: text('reopen_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('exams_term_status_idx').on(table.termId, table.status)]
);

export const examSubjects = pgTable(
  'exam_subjects',
  {
    id: serial('id').primaryKey(),
    examinationId: integer('examination_id')
      .references(() => examinations.id, { onDelete: 'cascade' })
      .notNull(),
    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),
    subjectId: integer('subject_id')
      .references(() => subjects.id, { onDelete: 'cascade' })
      .notNull(),
    maxMarks: integer('max_marks').default(100).notNull(),
    examDate: text('exam_date'),
  },
  (table) => [
    uniqueIndex('exam_subjects_unique_idx').on(
      table.examinationId,
      table.classId,
      table.subjectId
    ),
  ]
);

export const marks = pgTable(
  'marks',
  {
    id: serial('id').primaryKey(),
    examinationId: integer('examination_id')
      .references(() => examinations.id, { onDelete: 'cascade' })
      .notNull(),
    examSubjectId: integer('exam_subject_id')
      .references(() => examSubjects.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    score: numeric('score', { precision: 6, scale: 2 }).notNull(),
    grade: text('grade').notNull(),
    points: integer('points').notNull(),
    remarks: text('remarks'),
    enteredByUserId: integer('entered_by_user_id')
      .references(() => users.id)
      .notNull(),
    updatedByUserId: integer('updated_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('marks_exam_subject_student_idx').on(table.examSubjectId, table.studentId),
    index('marks_student_exam_idx').on(table.studentId, table.examinationId),
  ]
);

export const results = pgTable(
  'results',
  {
    id: serial('id').primaryKey(),
    examinationId: integer('examination_id')
      .references(() => examinations.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    classId: integer('class_id')
      .references(() => classes.id)
      .notNull(),
    streamId: integer('stream_id').references(() => streams.id),
    totalMarks: numeric('total_marks', { precision: 8, scale: 2 }).notNull(),
    meanScore: numeric('mean_score', { precision: 6, scale: 2 }).notNull(),
    meanGrade: text('mean_grade').notNull(),
    totalPoints: integer('total_points').notNull(),
    subjectsCount: integer('subjects_count').notNull(),
    classRank: integer('class_rank'),
    streamRank: integer('stream_rank'),
    principalRemarks: text('principal_remarks'),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('results_exam_student_idx').on(table.examinationId, table.studentId),
  ]
);

// ============================================================================
// 5. ATTENDANCE
// ============================================================================

export const studentAttendance = pgTable(
  'student_attendance',
  {
    id: serial('id').primaryKey(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    classId: integer('class_id')
      .references(() => classes.id)
      .notNull(),
    streamId: integer('stream_id').references(() => streams.id),
    termId: integer('term_id')
      .references(() => terms.id)
      .notNull(),
    date: text('date').notNull(), // YYYY-MM-DD
    status: attendanceStatusEnum('status').notNull(),
    remarks: text('remarks'),
    recordedByUserId: integer('recorded_by_user_id')
      .references(() => users.id)
      .notNull(),
    correctedByUserId: integer('corrected_by_user_id').references(() => users.id),
    correctionReason: text('correction_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('student_attendance_unique_idx').on(table.studentId, table.date),
    index('student_attendance_date_class_idx').on(table.date, table.classId),
  ]
);

export const staffAttendance = pgTable(
  'staff_attendance',
  {
    id: serial('id').primaryKey(),
    staffId: integer('staff_id')
      .references(() => staff.id, { onDelete: 'cascade' })
      .notNull(),
    date: text('date').notNull(),
    status: attendanceStatusEnum('status').notNull(),
    checkInTime: text('check_in_time'),
    remarks: text('remarks'),
    recordedByUserId: integer('recorded_by_user_id')
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('staff_attendance_unique_idx').on(table.staffId, table.date)]
);

// ============================================================================
// 6. FINANCE, FEES, PAYMENTS & RECEIPTS
// ============================================================================

export const feeStructures = pgTable(
  'fee_structures',
  {
    id: serial('id').primaryKey(),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id)
      .notNull(),
    termId: integer('term_id')
      .references(() => terms.id)
      .notNull(),
    classId: integer('class_id')
      .references(() => classes.id)
      .notNull(),
    title: text('title').notNull(),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    items: jsonb('items').$type<Array<{ voteHead: string; amount: number }>>().notNull(),
    dueDate: text('due_date').notNull(),
    createdByUserId: integer('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('fee_structures_term_class_idx').on(table.termId, table.classId),
  ]
);

export const studentFees = pgTable(
  'student_fees',
  {
    id: serial('id').primaryKey(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    feeStructureId: integer('fee_structure_id')
      .references(() => feeStructures.id)
      .notNull(),
    termId: integer('term_id')
      .references(() => terms.id)
      .notNull(),
    billedAmount: numeric('billed_amount', { precision: 12, scale: 2 }).notNull(),
    discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    discountReason: text('discount_reason'),
    paidAmount: numeric('paid_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    balanceAmount: numeric('balance_amount', { precision: 12, scale: 2 }).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('student_fees_student_term_idx').on(table.studentId, table.termId),
  ]
);

export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    studentId: integer('student_id')
      .references(() => students.id, { onDelete: 'cascade' })
      .notNull(),
    studentFeeId: integer('student_fee_id')
      .references(() => studentFees.id, { onDelete: 'cascade' })
      .notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    referenceNumber: text('reference_number').notNull().unique(),
    paidBy: text('paid_by'),
    paymentDate: text('payment_date').notNull(), // YYYY-MM-DD
    notes: text('notes'),
    recordedByUserId: integer('recorded_by_user_id')
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('payments_student_date_idx').on(table.studentId, table.paymentDate),
  ]
);

export const receipts = pgTable('receipts', {
  id: serial('id').primaryKey(),
  receiptNumber: text('receipt_number').notNull().unique(),
  paymentId: integer('payment_id')
    .references(() => payments.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  studentId: integer('student_id')
    .references(() => students.id, { onDelete: 'cascade' })
    .notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  issuedAt: timestamp('issued_at').defaultNow().notNull(),
});

// ============================================================================
// 7. TIMETABLE & COMMUNICATION
// ============================================================================

export const timetables = pgTable(
  'timetables',
  {
    id: serial('id').primaryKey(),
    academicYearId: integer('academic_year_id')
      .references(() => academicYears.id)
      .notNull(),
    termId: integer('term_id')
      .references(() => terms.id)
      .notNull(),
    classId: integer('class_id')
      .references(() => classes.id, { onDelete: 'cascade' })
      .notNull(),
    streamId: integer('stream_id')
      .references(() => streams.id, { onDelete: 'cascade' })
      .notNull(),
    subjectId: integer('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
    staffId: integer('staff_id').references(() => staff.id, { onDelete: 'set null' }),
    dayOfWeek: dayOfWeekEnum('day_of_week').notNull(),
    startTime: text('start_time').notNull(), // "08:00"
    endTime: text('end_time').notNull(), // "08:40"
    room: text('room').notNull(),
    isBreak: boolean('is_break').default(false).notNull(),
    breakLabel: text('break_label'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('timetables_stream_day_idx').on(table.termId, table.streamId, table.dayOfWeek),
    index('timetables_staff_day_idx').on(table.termId, table.staffId, table.dayOfWeek),
  ]
);

export const announcements = pgTable(
  'announcements',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    category: text('category').default('GENERAL').notNull(), // GENERAL, ACADEMIC, EVENT, FINANCE
    targetAudience: text('target_audience').default('ALL').notNull(), // ALL, STUDENTS, PARENTS, TEACHERS, STAFF
    eventDate: text('event_date'),
    authorUserId: integer('author_user_id')
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('announcements_audience_idx').on(table.targetAudience, table.createdAt)]
);

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    category: text('category').default('SYSTEM').notNull(),
    isRead: boolean('is_read').default(false).notNull(),
    linkModule: text('link_module'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('notifications_user_read_idx').on(table.userId, table.isRead)]
);

export const internalMessages = pgTable(
  'internal_messages',
  {
    id: serial('id').primaryKey(),
    senderUserId: integer('sender_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    recipientUserId: integer('recipient_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('messages_recipient_idx').on(table.recipientUserId, table.isRead)]
);

// ============================================================================
// RELATIONS
// ============================================================================

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
  rolePermissions: many(rolePermissions),
}));

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  currentClass: one(classes, {
    fields: [students.currentClassId],
    references: [classes.id],
  }),
  currentStream: one(streams, {
    fields: [students.currentStreamId],
    references: [streams.id],
  }),
  guardian: one(guardians, {
    fields: [students.guardianId],
    references: [guardians.id],
  }),
  enrollments: many(enrollments),
  fees: many(studentFees),
  payments: many(payments),
}));

export const classesRelations = relations(classes, ({ many }) => ({
  streams: many(streams),
  students: many(students),
}));

export const streamsRelations = relations(streams, ({ one }) => ({
  schoolClass: one(classes, {
    fields: [streams.classId],
    references: [classes.id],
  }),
}));
