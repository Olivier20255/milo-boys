import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  academicYears,
  announcements,
  classes,
  enrollments,
  examinations,
  examSubjects,
  feeStructures,
  gradingScales,
  guardians,
  marks,
  payments,
  receipts,
  results,
  schoolSettings,
  staff,
  staffAttendance,
  streams,
  studentAttendance,
  studentFees,
  students,
  subjects,
  teacherAssignments,
  terms,
  timetables,
  users,
} from '../db/schema.ts';
import {
  calculateGradeFromScale,
  calculateMeanGradeFromPoints,
  DEFAULT_GRADING_SCALES,
} from './domain.ts';
import { ensureRolesAndPermissions } from './middleware.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = runSeed().catch((err) => {
    seedPromise = null;
    throw err;
  });
  return seedPromise;
}

async function runSeed(): Promise<void> {
  await ensureRolesAndPermissions();

  // Check if school settings & academic years already exist
  const [{ count: yearCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(academicYears);

  if (yearCount > 0) {
    return;
  }

  // 1. School Settings
  await db.insert(schoolSettings).values({
    schoolName: 'Milo Boys School',
    motto: 'Discipline, Scholarship & Integrity',
    code: 'MBS-2026',
    email: 'principal@miloboys.ac.ke',
    phone: '+254 712 480 900',
    address: 'P.O. Box 4120 - 00100, Nairobi, Kenya',
    county: 'Nairobi',
    rankStudentsInReports: true,
    mpesaShortcode: '',
    mpesaEnv: 'sandbox',
    mpesaConfigured: Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET),
    emailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
    smsConfigured: Boolean(process.env.SMS_API_KEY),
  });

  // 2. Grading Scales (KCSE)
  for (const band of DEFAULT_GRADING_SCALES) {
    await db.insert(gradingScales).values(band).onConflictDoNothing();
  }

  // 3. Academic Years & Terms
  const [year2025] = await db
    .insert(academicYears)
    .values({ name: '2025', startDate: '2025-01-08', endDate: '2025-11-14', isCurrent: false })
    .returning();
  const [year2026] = await db
    .insert(academicYears)
    .values({ name: '2026', startDate: '2026-01-06', endDate: '2026-11-13', isCurrent: true })
    .returning();

  const [term1] = await db
    .insert(terms)
    .values({
      academicYearId: year2026.id,
      name: 'Term 1',
      startDate: '2026-01-06',
      endDate: '2026-04-03',
      isCurrent: false,
    })
    .returning();
  const [term2] = await db
    .insert(terms)
    .values({
      academicYearId: year2026.id,
      name: 'Term 2',
      startDate: '2026-05-04',
      endDate: '2026-08-07',
      isCurrent: true,
    })
    .returning();
  await db.insert(terms).values({
    academicYearId: year2026.id,
    name: 'Term 3',
    startDate: '2026-08-31',
    endDate: '2026-11-13',
    isCurrent: false,
  });
  await db.insert(terms).values({
    academicYearId: year2025.id,
    name: 'Term 3',
    startDate: '2025-09-01',
    endDate: '2025-11-14',
    isCurrent: false,
  });

  // 4. Classes & Streams
  const classRows = await db
    .insert(classes)
    .values([
      { name: 'Form 1', levelOrder: 1, description: 'First Year Secondary' },
      { name: 'Form 2', levelOrder: 2, description: 'Second Year Secondary' },
      { name: 'Form 3', levelOrder: 3, description: 'Third Year Secondary' },
      { name: 'Form 4', levelOrder: 4, description: 'KCSE Candidate Class' },
    ])
    .returning();

  const streamRows: Array<typeof streams.$inferSelect> = [];
  for (const cls of classRows) {
    for (const sName of ['North', 'East']) {
      const [s] = await db
        .insert(streams)
        .values({
          classId: cls.id,
          name: sName,
          capacity: 45,
          roomName: `${cls.name.replace(' ', '')}-${sName[0]}`,
        })
        .returning();
      streamRows.push(s);
    }
  }

  // 5. Subjects
  const subjectRows = await db
    .insert(subjects)
    .values([
      { code: '101', name: 'English', department: 'Languages', isCompulsory: true, maxMarks: 100 },
      { code: '102', name: 'Kiswahili', department: 'Languages', isCompulsory: true, maxMarks: 100 },
      { code: '121', name: 'Mathematics', department: 'Mathematics', isCompulsory: true, maxMarks: 100 },
      { code: '231', name: 'Biology', department: 'Sciences', isCompulsory: true, maxMarks: 100 },
      { code: '232', name: 'Physics', department: 'Sciences', isCompulsory: false, maxMarks: 100 },
      { code: '233', name: 'Chemistry', department: 'Sciences', isCompulsory: true, maxMarks: 100 },
      { code: '311', name: 'History & Government', department: 'Humanities', isCompulsory: false, maxMarks: 100 },
      { code: '312', name: 'Geography', department: 'Humanities', isCompulsory: false, maxMarks: 100 },
      { code: '451', name: 'Computer Studies', department: 'Technical', isCompulsory: false, maxMarks: 100 },
      { code: '565', name: 'Business Studies', department: 'Technical', isCompulsory: false, maxMarks: 100 },
    ])
    .returning();

  // 6. Staff (Teaching + Non-Teaching + Admin)
  const staffRows = await db
    .insert(staff)
    .values([
      {
        employeeNumber: 'MBS-STF-001',
        firstName: 'Samuel',
        lastName: 'Kiprotich',
        email: 's.kiprotich@miloboys.ac.ke',
        phone: '+254 722 101 200',
        staffType: 'ADMINISTRATION',
        department: 'Administration',
        designation: 'Principal',
        qualifications: 'M.Ed Educational Leadership, B.Ed (Hons)',
        tscNumber: 'TSC-441920',
        nationalId: '21948511',
        salaryAmount: '185000.00',
        dateJoined: '2018-01-15',
        employmentStatus: 'ACTIVE',
      },
      {
        employeeNumber: 'MBS-STF-002',
        firstName: 'David',
        lastName: 'Ochieng',
        email: 'd.ochieng@miloboys.ac.ke',
        phone: '+254 723 304 510',
        staffType: 'TEACHING',
        department: 'Mathematics',
        designation: 'Senior Mathematics Teacher',
        qualifications: 'B.Ed Science (Mathematics & Physics)',
        tscNumber: 'TSC-519204',
        nationalId: '25849102',
        salaryAmount: '92000.00',
        dateJoined: '2020-05-01',
        employmentStatus: 'ACTIVE',
      },
      {
        employeeNumber: 'MBS-STF-003',
        firstName: 'Grace',
        lastName: 'Wanjiku',
        email: 'g.wanjiku@miloboys.ac.ke',
        phone: '+254 711 490 221',
        staffType: 'TEACHING',
        department: 'Languages',
        designation: 'Head of Languages',
        qualifications: 'M.A Literature, B.Ed Arts (English)',
        tscNumber: 'TSC-498211',
        nationalId: '24810394',
        salaryAmount: '98000.00',
        dateJoined: '2019-09-02',
        employmentStatus: 'ACTIVE',
      },
      {
        employeeNumber: 'MBS-STF-004',
        firstName: 'Peter',
        lastName: 'Mutua',
        email: 'p.mutua@miloboys.ac.ke',
        phone: '+254 734 812 009',
        staffType: 'TEACHING',
        department: 'Sciences',
        designation: 'Chemistry & Biology Teacher',
        qualifications: 'B.Ed Science (Chemistry/Biology)',
        tscNumber: 'TSC-563920',
        nationalId: '28194022',
        salaryAmount: '84000.00',
        dateJoined: '2022-01-10',
        employmentStatus: 'ACTIVE',
      },
      {
        employeeNumber: 'MBS-STF-005',
        firstName: 'Esther',
        lastName: 'Chebet',
        email: 'e.chebet@miloboys.ac.ke',
        phone: '+254 720 671 334',
        staffType: 'TEACHING',
        department: 'Humanities',
        designation: 'History & Kiswahili Teacher',
        qualifications: 'B.Ed Arts (Kiswahili & History)',
        tscNumber: 'TSC-589104',
        nationalId: '29481033',
        salaryAmount: '82000.00',
        dateJoined: '2023-01-09',
        employmentStatus: 'ACTIVE',
      },
      {
        employeeNumber: 'MBS-STF-006',
        firstName: 'Benson',
        lastName: 'Mwangi',
        email: 'b.mwangi@miloboys.ac.ke',
        phone: '+254 725 992 140',
        staffType: 'TEACHING',
        department: 'Technical',
        designation: 'Computer Studies & Business Teacher',
        qualifications: 'B.Sc Computer Science, PGDE',
        tscNumber: 'TSC-602114',
        nationalId: '30194821',
        salaryAmount: '86000.00',
        dateJoined: '2023-09-04',
        employmentStatus: 'ACTIVE',
      },
      {
        employeeNumber: 'MBS-STF-007',
        firstName: 'Mary',
        lastName: 'Njoroge',
        email: 'm.njoroge@miloboys.ac.ke',
        phone: '+254 728 511 088',
        staffType: 'NON_TEACHING',
        department: 'Finance',
        designation: 'School Bursar / Accountant',
        qualifications: 'B.Com Finance, CPA(K)',
        tscNumber: null,
        nationalId: '26718290',
        salaryAmount: '110000.00',
        dateJoined: '2021-03-01',
        employmentStatus: 'ACTIVE',
      },
      {
        employeeNumber: 'MBS-STF-008',
        firstName: 'Joseph',
        lastName: 'Kamau',
        email: 'j.kamau@miloboys.ac.ke',
        phone: '+254 714 203 771',
        staffType: 'NON_TEACHING',
        department: 'Facilities',
        designation: 'Laboratory & ICT Technician',
        qualifications: 'Diploma in Analytical Chemistry & ICT',
        tscNumber: null,
        nationalId: '31209482',
        salaryAmount: '54000.00',
        dateJoined: '2024-01-08',
        employmentStatus: 'ACTIVE',
      },
    ])
    .returning();

  // Assign class teachers to streams
  for (let i = 0; i < streamRows.length; i++) {
    const teacher = staffRows[(i % 5) + 1];
    await db
      .update(streams)
      .set({ classTeacherId: teacher.id })
      .where(sql`${streams.id} = ${streamRows[i].id}`);
  }

  // Teacher Subject Assignments
  for (const cls of classRows) {
    await db
      .insert(teacherAssignments)
      .values([
        { staffId: staffRows[2].id, subjectId: subjectRows[0].id, classId: cls.id, academicYearId: year2026.id }, // English
        { staffId: staffRows[4].id, subjectId: subjectRows[1].id, classId: cls.id, academicYearId: year2026.id }, // Kiswahili
        { staffId: staffRows[1].id, subjectId: subjectRows[2].id, classId: cls.id, academicYearId: year2026.id }, // Maths
        { staffId: staffRows[3].id, subjectId: subjectRows[3].id, classId: cls.id, academicYearId: year2026.id }, // Bio
        { staffId: staffRows[3].id, subjectId: subjectRows[5].id, classId: cls.id, academicYearId: year2026.id }, // Chem
        { staffId: staffRows[1].id, subjectId: subjectRows[4].id, classId: cls.id, academicYearId: year2026.id }, // Physics
        { staffId: staffRows[5].id, subjectId: subjectRows[8].id, classId: cls.id, academicYearId: year2026.id }, // Computer
      ])
      .onConflictDoNothing();
  }

  // 7. Guardians & 20 Students across Forms 1-4
  const sampleStudentsData = [
    { adm: 'MBS/2026/001', fn: 'Brian', ln: 'Karanja', dob: '2011-04-12', kcpe: 388, clsIdx: 0, stIdx: 0, gName: 'James Karanja', gPhone: '+254 722 440 111', gRel: 'Father', county: 'Kiambu' },
    { adm: 'MBS/2026/002', fn: 'Kelvin', ln: 'Otieno', dob: '2011-08-22', kcpe: 376, clsIdx: 0, stIdx: 0, gName: 'beatrice Otieno', gPhone: '+254 712 882 301', gRel: 'Mother', county: 'Kisumu' },
    { adm: 'MBS/2026/003', fn: 'Ian', ln: 'Mutisya', dob: '2011-01-19', kcpe: 394, clsIdx: 0, stIdx: 1, gName: 'Daniel Mutisya', gPhone: '+254 733 551 902', gRel: 'Father', county: 'Machakos' },
    { adm: 'MBS/2026/004', fn: 'Victor', ln: 'Kiprop', dob: '2011-11-03', kcpe: 365, clsIdx: 0, stIdx: 1, gName: 'Sarah Kiprop', gPhone: '+254 720 119 450', gRel: 'Mother', county: 'Uasin Gishu' },
    { adm: 'MBS/2026/005', fn: 'Allan', ln: 'Wamalwa', dob: '2011-06-28', kcpe: 372, clsIdx: 0, stIdx: 0, gName: 'Patrick Wamalwa', gPhone: '+254 718 902 412', gRel: 'Father', county: 'Bungoma' },
    { adm: 'MBS/2025/011', fn: 'Dennis', ln: 'Maina', dob: '2010-03-14', kcpe: 382, clsIdx: 1, stIdx: 2, gName: 'Rose Maina', gPhone: '+254 721 664 120', gRel: 'Mother', county: 'Nyeri' },
    { adm: 'MBS/2025/012', fn: 'Collins', ln: 'Odhiambo', dob: '2010-07-09', kcpe: 391, clsIdx: 1, stIdx: 2, gName: 'George Odhiambo', gPhone: '+254 724 318 904', gRel: 'Father', county: 'Siaya' },
    { adm: 'MBS/2025/013', fn: 'Felix', ln: 'Kibet', dob: '2010-09-25', kcpe: 368, clsIdx: 1, stIdx: 3, gName: 'Hellen Kibet', gPhone: '+254 710 442 781', gRel: 'Mother', county: 'Kericho' },
    { adm: 'MBS/2025/014', fn: 'Martin', ln: 'Muriithi', dob: '2010-02-11', kcpe: 379, clsIdx: 1, stIdx: 3, gName: 'Charles Muriithi', gPhone: '+254 727 891 200', gRel: 'Father', county: 'Meru' },
    { adm: 'MBS/2025/015', fn: 'Samuel', ln: 'Ndungu', dob: '2010-12-01', kcpe: 358, clsIdx: 1, stIdx: 2, gName: 'Esther Ndungu', gPhone: '+254 716 330 981', gRel: 'Mother', county: 'Nakuru' },
    { adm: 'MBS/2024/021', fn: 'Emmanuel', ln: 'Omondi', dob: '2009-05-18', kcpe: 396, clsIdx: 2, stIdx: 4, gName: 'Michael Omondi', gPhone: '+254 722 908 114', gRel: 'Father', county: 'Homa Bay' },
    { adm: 'MBS/2024/022', fn: 'Timothy', ln: 'Ngetich', dob: '2009-10-07', kcpe: 374, clsIdx: 2, stIdx: 4, gName: 'Miriam Ngetich', gPhone: '+254 726 710 342', gRel: 'Mother', county: 'Bomet' },
    { adm: 'MBS/2024/023', fn: 'Lewis', ln: 'Gacheru', dob: '2009-01-29', kcpe: 385, clsIdx: 2, stIdx: 5, gName: 'John Gacheru', gPhone: '+254 731 204 881', gRel: 'Father', county: 'Muranga' },
    { adm: 'MBS/2024/024', fn: 'Anthony', ln: 'Musyoka', dob: '2009-08-15', kcpe: 369, clsIdx: 2, stIdx: 5, gName: 'Ruth Musyoka', gPhone: '+254 713 558 290', gRel: 'Mother', county: 'Makueni' },
    { adm: 'MBS/2024/025', fn: 'Brian', ln: 'Rotich', dob: '2009-04-04', kcpe: 390, clsIdx: 2, stIdx: 4, gName: 'Paul Rotich', gPhone: '+254 729 412 007', gRel: 'Father', county: 'Nandi' },
    { adm: 'MBS/2023/031', fn: 'Daniel', ln: 'Kamau', dob: '2008-06-11', kcpe: 402, clsIdx: 3, stIdx: 6, gName: 'Stephen Kamau', gPhone: '+254 722 773 819', gRel: 'Father', county: 'Nairobi' },
    { adm: 'MBS/2023/032', fn: 'Josephat', ln: 'Wafula', dob: '2008-02-23', kcpe: 389, clsIdx: 3, stIdx: 6, gName: 'Agnes Wafula', gPhone: '+254 717 602 441', gRel: 'Mother', county: 'Trans Nzoia' },
    { adm: 'MBS/2023/033', fn: 'Caleb', ln: 'Kariuki', dob: '2008-09-17', kcpe: 377, clsIdx: 3, stIdx: 7, gName: 'Francis Kariuki', gPhone: '+254 721 190 554', gRel: 'Father', county: 'Laikipia' },
    { adm: 'MBS/2023/034', fn: 'Eric', ln: 'Barasa', dob: '2008-11-30', kcpe: 393, clsIdx: 3, stIdx: 7, gName: 'Beatrice Barasa', gPhone: '+254 725 883 120', gRel: 'Mother', county: 'Kakamega' },
    { adm: 'MBS/2023/035', fn: 'Moses', ln: 'Mwendwa', dob: '2008-03-08', kcpe: 381, clsIdx: 3, stIdx: 6, gName: 'Bernard Mwendwa', gPhone: '+254 732 419 770', gRel: 'Father', county: 'Kitui' },
  ];

  const insertedStudents: Array<typeof students.$inferSelect> = [];
  for (const s of sampleStudentsData) {
    const [g] = await db
      .insert(guardians)
      .values({
        fullName: s.gName.charAt(0).toUpperCase() + s.gName.slice(1),
        relationship: s.gRel,
        phone: s.gPhone,
        email: `${s.fn.toLowerCase()}.${s.ln.toLowerCase()}@family.ke`,
        address: `${s.county} County, Kenya`,
      })
      .returning();

    const cls = classRows[s.clsIdx];
    const strm = streamRows[s.stIdx];
    const admYear = s.adm.split('/')[1];

    const [stu] = await db
      .insert(students)
      .values({
        admissionNumber: s.adm,
        firstName: s.fn,
        lastName: s.ln,
        dateOfBirth: s.dob,
        gender: 'Male',
        admissionDate: `${admYear}-01-12`,
        kcpeIndex: `204010${Math.floor(10000 + Math.random() * 89999)}`,
        kcpeScore: s.kcpe,
        currentClassId: cls.id,
        currentStreamId: strm.id,
        guardianId: g.id,
        emergencyContactName: g.fullName,
        emergencyContactPhone: g.phone,
        emergencyContactRelation: g.relationship,
        bloodGroup: ['O+', 'A+', 'B+', 'AB+'][insertedStudents.length % 4],
        allergies: insertedStudents.length % 5 === 0 ? 'Peanuts (Mild)' : 'None recorded',
        medicalConditions: 'None',
        residenceAddress: `${s.county} Town`,
        county: s.county,
        status: 'ACTIVE',
      })
      .returning();

    insertedStudents.push(stu);

    await db.insert(enrollments).values({
      studentId: stu.id,
      academicYearId: year2026.id,
      classId: cls.id,
      streamId: strm.id,
      isActive: true,
    });
  }

  // 8. Fee Structures & Student Fees & Payments & Receipts (Term 2 2026)
  const feeStructuresByClass = new Map<number, typeof feeStructures.$inferSelect>();
  for (const cls of classRows) {
    const tuition = 18000 + cls.levelOrder * 1500;
    const boarding = 14500;
    const activity = 2500;
    const lab = 2000;
    const total = tuition + boarding + activity + lab;

    const [fs] = await db
      .insert(feeStructures)
      .values({
        academicYearId: year2026.id,
        termId: term2.id,
        classId: cls.id,
        title: `${cls.name} — Term 2 2026 Standard Fees`,
        totalAmount: total.toFixed(2),
        items: [
          { voteHead: 'Tuition & Academic Resources', amount: tuition },
          { voteHead: 'Boarding & Catering', amount: boarding },
          { voteHead: 'Co-Curricular & Sports', amount: activity },
          { voteHead: 'Science & ICT Laboratory', amount: lab },
        ],
        dueDate: '2026-06-15',
      })
      .returning();
    feeStructuresByClass.set(cls.id, fs);
  }

  // Create a system placeholder user if none exists yet for recording seed entries?
  // Wait: payments.recordedByUserId references users.id, so let's skip creating fake users if none exist, OR insert a system admin staff user placeholder only if needed — better: check if any user exists, or insert the principal's user record linked to staff!
  const [adminRole] = await db.execute(sql`SELECT id FROM roles WHERE code = 'HEADTEACHER' LIMIT 1`).then((r) => r.rows as Array<{ id: number }>);
  const [seedUser] = await db
    .insert(users)
    .values({
      uid: 'seed-principal-mbs-001',
      email: 's.kiprotich@miloboys.ac.ke',
      fullName: 'Samuel Kiprotich',
      roleId: adminRole.id,
      isActive: true,
      linkedStaffId: staffRows[0].id,
    })
    .onConflictDoNothing()
    .returning();

  const recorderId = seedUser?.id || 1;

  const paymentMethods = ['MPESA', 'BANK_TRANSFER', 'CASH'] as const;
  let receiptSeq = 1;
  for (let i = 0; i < insertedStudents.length; i++) {
    const stu = insertedStudents[i];
    const fs = feeStructuresByClass.get(stu.currentClassId!)!;
    const billed = Number(fs.totalAmount);
    const discount = i % 6 === 0 ? 5000 : 0;
    // Varying realistic payment progress (full, partial, arrears)
    const payRatio = i % 4 === 0 ? 1 : i % 4 === 1 ? 0.72 : i % 4 === 2 ? 0.5 : 0.25;
    const paid = Math.round((billed - discount) * payRatio);
    const balance = billed - discount - paid;

    const [sf] = await db
      .insert(studentFees)
      .values({
        studentId: stu.id,
        feeStructureId: fs.id,
        termId: term2.id,
        billedAmount: billed.toFixed(2),
        discountAmount: discount.toFixed(2),
        discountReason: discount > 0 ? 'Academic Merit Bursary' : null,
        paidAmount: paid.toFixed(2),
        balanceAmount: balance.toFixed(2),
      })
      .returning();

    if (paid > 0) {
      const method = paymentMethods[i % paymentMethods.length];
      const day = String(5 + (i % 20)).padStart(2, '0');
      const month = i % 2 === 0 ? '05' : '06';
      const ref =
        method === 'MPESA'
          ? `UFB${800120 + i}X`
          : method === 'BANK_TRANSFER'
          ? `KCB-2026-${4000 + i}`
          : `CSH-2026-${100 + i}`;

      const [pmt] = await db
        .insert(payments)
        .values({
          studentId: stu.id,
          studentFeeId: sf.id,
          amount: paid.toFixed(2),
          paymentMethod: method,
          referenceNumber: ref,
          paidBy: stu.emergencyContactName,
          paymentDate: `2026-${month}-${day}`,
          notes: `Term 2 fee installment`,
          recordedByUserId: recorderId,
        })
        .returning();

      await db.insert(receipts).values({
        receiptNumber: `RCP-2026-${String(receiptSeq).padStart(4, '0')}`,
        paymentId: pmt.id,
        studentId: stu.id,
        amount: paid.toFixed(2),
      });
      receiptSeq += 1;
    }
  }

  // 9. Examinations: 1 PUBLISHED (Term 1 End of Term) + 1 SUBMITTED (Term 2 Mid Term)
  const [publishedExam] = await db
    .insert(examinations)
    .values({
      name: 'Term 1 End-of-Term Examination 2026',
      examType: 'END_OF_TERM',
      academicYearId: year2026.id,
      termId: term1.id,
      startDate: '2026-03-23',
      endDate: '2026-03-31',
      status: 'PUBLISHED',
      createdByUserId: recorderId,
      submittedByUserId: recorderId,
      submittedAt: new Date('2026-04-01T10:00:00Z'),
      verifiedByUserId: recorderId,
      verifiedAt: new Date('2026-04-02T14:00:00Z'),
      finalizedByUserId: recorderId,
      finalizedAt: new Date('2026-04-02T16:30:00Z'),
      publishedByUserId: recorderId,
      publishedAt: new Date('2026-04-03T09:00:00Z'),
    })
    .returning();

  await db.insert(examinations).values({
    name: 'Term 2 Mid-Term CAT 2026',
    examType: 'CAT_1',
    academicYearId: year2026.id,
    termId: term2.id,
    startDate: '2026-06-15',
    endDate: '2026-06-19',
    status: 'SUBMITTED',
    createdByUserId: recorderId,
    submittedByUserId: recorderId,
    submittedAt: new Date('2026-06-21T11:20:00Z'),
  });

  // Setup Exam Subjects (6 core subjects per class) and marks for Published Exam
  const coreSubjects = subjectRows.slice(0, 6);
  const examSubjectMap = new Map<string, number>();

  for (const cls of classRows) {
    for (const subj of coreSubjects) {
      const [es] = await db
        .insert(examSubjects)
        .values({
          examinationId: publishedExam.id,
          classId: cls.id,
          subjectId: subj.id,
          maxMarks: 100,
          examDate: '2026-03-25',
        })
        .returning();
      examSubjectMap.set(`${cls.id}:${subj.id}`, es.id);
    }
  }

  // Deterministic realistic scores per student so charts and report cards are rich and consistent
  for (let sIdx = 0; sIdx < insertedStudents.length; sIdx++) {
    const stu = insertedStudents[sIdx];
    const baseAbility = 58 + ((sIdx * 7) % 30); // 58 to 87
    let totalMarks = 0;
    let totalPoints = 0;

    for (let subjIdx = 0; subjIdx < coreSubjects.length; subjIdx++) {
      const subj = coreSubjects[subjIdx];
      const esId = examSubjectMap.get(`${stu.currentClassId}:${subj.id}`)!;
      const variation = ((sIdx + subjIdx * 3) % 15) - 7;
      const score = Math.max(32, Math.min(96, baseAbility + variation));
      const { grade, points, remarks } = calculateGradeFromScale(score);

      await db.insert(marks).values({
        examinationId: publishedExam.id,
        examSubjectId: esId,
        studentId: stu.id,
        score: score.toFixed(2),
        grade,
        points,
        remarks,
        enteredByUserId: recorderId,
      });

      totalMarks += score;
      totalPoints += points;
    }

    const meanScore = totalMarks / coreSubjects.length;
    const meanGrade = calculateMeanGradeFromPoints(totalPoints / coreSubjects.length);

    await db.insert(results).values({
      examinationId: publishedExam.id,
      studentId: stu.id,
      classId: stu.currentClassId!,
      streamId: stu.currentStreamId,
      totalMarks: totalMarks.toFixed(2),
      meanScore: meanScore.toFixed(2),
      meanGrade,
      totalPoints,
      subjectsCount: coreSubjects.length,
      principalRemarks: meanScore >= 70 ? 'Commendable academic performance. Keep up the discipline.' : 'Good effort. Focus on consistent revision in sciences.',
    });
  }

  // Compute class ranks for published exam
  for (const cls of classRows) {
    const classResults = await db
      .select()
      .from(results)
      .where(sql`${results.examinationId} = ${publishedExam.id} AND ${results.classId} = ${cls.id}`)
      .orderBy(sql`${results.meanScore} DESC`);
    for (let idx = 0; idx < classResults.length; idx++) {
      await db
        .update(results)
        .set({ classRank: idx + 1 })
        .where(sql`${results.id} = ${classResults[idx].id}`);
    }
  }

  // 10. Attendance (Last 5 school days)
  const attendanceDates = ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'];
  for (let dIdx = 0; dIdx < attendanceDates.length; dIdx++) {
    const dateStr = attendanceDates[dIdx];
    for (let sIdx = 0; sIdx < insertedStudents.length; sIdx++) {
      const stu = insertedStudents[sIdx];
      const mod = (dIdx + sIdx) % 19;
      const status = mod === 0 ? 'ABSENT' : mod === 5 ? 'LATE' : mod === 11 ? 'EXCUSED' : 'PRESENT';
      await db.insert(studentAttendance).values({
        studentId: stu.id,
        classId: stu.currentClassId!,
        streamId: stu.currentStreamId,
        termId: term2.id,
        date: dateStr,
        status,
        remarks: status === 'ABSENT' ? 'Parent notified' : null,
        recordedByUserId: recorderId,
      });
    }

    for (let stIdx = 0; stIdx < staffRows.length; stIdx++) {
      const stf = staffRows[stIdx];
      await db.insert(staffAttendance).values({
        staffId: stf.id,
        date: dateStr,
        status: (dIdx + stIdx) % 14 === 0 ? 'EXCUSED' : 'PRESENT',
        checkInTime: '07:25',
        recordedByUserId: recorderId,
      });
    }
  }

  // 11. Conflict-Free Sample Timetable for Form 1 North
  const f1North = streamRows[0];
  const f1Class = classRows[0];
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;
  const slots = [
    { start: '08:00', end: '08:40', subjIdx: 2, stfIdx: 1, room: 'F1-N' },
    { start: '08:40', end: '09:20', subjIdx: 0, stfIdx: 2, room: 'F1-N' },
    { start: '09:20', end: '10:00', subjIdx: 5, stfIdx: 3, room: 'Chem Lab' },
    { start: '10:00', end: '10:30', isBreak: true, breakLabel: 'Morning Break', room: 'Courtyard' },
    { start: '10:30', end: '11:10', subjIdx: 1, stfIdx: 4, room: 'F1-N' },
    { start: '11:10', end: '11:50', subjIdx: 3, stfIdx: 3, room: 'Bio Lab' },
    { start: '11:50', end: '12:30', subjIdx: 8, stfIdx: 5, room: 'ICT Lab' },
  ];

  for (let dIdx = 0; dIdx < days.length; dIdx++) {
    for (let slIdx = 0; slIdx < slots.length; slIdx++) {
      const sl = slots[slIdx];
      if (sl.isBreak) {
        await db.insert(timetables).values({
          academicYearId: year2026.id,
          termId: term2.id,
          classId: f1Class.id,
          streamId: f1North.id,
          dayOfWeek: days[dIdx],
          startTime: sl.start,
          endTime: sl.end,
          room: sl.room,
          isBreak: true,
          breakLabel: sl.breakLabel,
        });
      } else {
        const rotatedSubj = (sl.subjIdx! + dIdx) % 6;
        const subj = subjectRows[rotatedSubj];
        const stf = staffRows[(sl.stfIdx! % 5) + 1];
        await db.insert(timetables).values({
          academicYearId: year2026.id,
          termId: term2.id,
          classId: f1Class.id,
          streamId: f1North.id,
          subjectId: subj.id,
          staffId: stf.id,
          dayOfWeek: days[dIdx],
          startTime: sl.start,
          endTime: sl.end,
          room: sl.room,
          isBreak: false,
        });
      }
    }
  }

  // 12. Announcements
  await db.insert(announcements).values([
    {
      title: 'Term 2 Mid-Term Academic Clinics & Parents Conference',
      content: 'Parents and guardians of Form 3 and Form 4 candidates are invited for academic clinic consultations on Saturday, 27th June 2026 from 8:30 AM in the Main Hall.',
      category: 'EVENT',
      targetAudience: 'PARENTS',
      eventDate: '2026-06-27',
      authorUserId: recorderId,
    },
    {
      title: 'Submission Deadline for Term 2 Mid-Term CAT Marks',
      content: 'All subject teachers are reminded to finalize and submit Term 2 CAT 1 draft marks for Academic Dean verification before Friday 4:00 PM.',
      category: 'ACADEMIC',
      targetAudience: 'TEACHERS',
      eventDate: '2026-06-26',
      authorUserId: recorderId,
    },
    {
      title: 'Term 2 Fee Balance Reminder & Bursary Applications',
      content: 'Parents with outstanding Term 2 balances are requested to clear fees via the official school M-Pesa Paybill or Bank Transfer and retain the official receipt.',
      category: 'FINANCE',
      targetAudience: 'ALL',
      authorUserId: recorderId,
    },
  ]);
}
