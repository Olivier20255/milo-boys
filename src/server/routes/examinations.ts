import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  academicYears,
  classes,
  examinations,
  examSubjects,
  gradingScales,
  marks,
  results,
  schoolSettings,
  streams,
  students,
  subjects,
  teacherAssignments,
  terms,
  users,
} from '../../db/schema.ts';
import {
  calculateGradeFromScale,
  calculateMeanGradeFromPoints,
  canTransitionExamStatus,
  ExamStatus,
} from '../domain.ts';
import { AuthRequest, logAudit, requireAuth, requirePermission } from '../middleware.ts';

const router = Router();

router.get('/grading-scales', requireAuth, requirePermission('exams.view'), async (_req, res) => {
  try {
    const scales = await db.select().from(gradingScales).orderBy(desc(gradingScales.points));
    res.json(scales);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load grading scales.' });
  }
});

router.put('/grading-scales', requireAuth, requirePermission('exams.verify'), async (req: AuthRequest, res) => {
  try {
    const schema = z.array(
      z.object({
        grade: z.string().trim().min(1),
        minScore: z.coerce.number().int().min(0).max(100),
        maxScore: z.coerce.number().int().min(0).max(100),
        points: z.coerce.number().int().min(1).max(12),
        remarks: z.string().trim().min(1),
      })
    );
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid grading scale bands.' });

    await db.transaction(async (tx) => {
      await tx.delete(gradingScales);
      await tx.insert(gradingScales).values(parsed.data);
    });
    await logAudit(req.authUser, 'UPDATE_GRADING_SCALES', 'grading_scales', null, { bands: parsed.data.length }, req);
    res.json(parsed.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update grading scales.' });
  }
});

router.get('/', requireAuth, requirePermission('exams.view'), async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    const isRestrictedViewer = user.roleCode === 'STUDENT' || user.roleCode === 'PARENT';

    const rows = await db
      .select({
        exam: examinations,
        academicYearName: academicYears.name,
        termName: terms.name,
      })
      .from(examinations)
      .innerJoin(academicYears, eq(examinations.academicYearId, academicYears.id))
      .innerJoin(terms, eq(examinations.termId, terms.id))
      .where(isRestrictedViewer ? eq(examinations.status, 'PUBLISHED') : undefined)
      .orderBy(desc(examinations.createdAt));

    const userNames = await db.select({ id: users.id, fullName: users.fullName }).from(users);
    const nameMap = new Map(userNames.map((u) => [u.id, u.fullName]));

    const payload = rows.map((r) => ({
      ...r.exam,
      academicYearName: r.academicYearName,
      termName: r.termName,
      createdByName: r.exam.createdByUserId ? nameMap.get(r.exam.createdByUserId) || null : null,
      submittedByName: r.exam.submittedByUserId ? nameMap.get(r.exam.submittedByUserId) || null : null,
      verifiedByName: r.exam.verifiedByUserId ? nameMap.get(r.exam.verifiedByUserId) || null : null,
      finalizedByName: r.exam.finalizedByUserId ? nameMap.get(r.exam.finalizedByUserId) || null : null,
      publishedByName: r.exam.publishedByUserId ? nameMap.get(r.exam.publishedByUserId) || null : null,
    }));

    res.json(payload);
  } catch (err) {
    console.error('List exams error:', err);
    res.status(500).json({ error: 'Failed to load examinations.' });
  }
});

router.post('/', requireAuth, requirePermission('exams.verify'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(3),
      examType: z.enum(['CAT_1', 'CAT_2', 'MID_TERM', 'END_OF_TERM', 'MOCK']),
      academicYearId: z.coerce.number().int().positive(),
      termId: z.coerce.number().int().positive(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      classIds: z.array(z.coerce.number().int().positive()).min(1),
      subjectIds: z.array(z.coerce.number().int().positive()).min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid examination payload.' });
    }
    const { classIds, subjectIds, ...examData } = parsed.data;

    const created = await db.transaction(async (tx) => {
      const [exam] = await tx
        .insert(examinations)
        .values({
          ...examData,
          status: 'DRAFT',
          createdByUserId: req.authUser!.id,
        })
        .returning();

      const subjectRows = await tx.select().from(subjects);
      const maxMarksMap = new Map(subjectRows.map((s) => [s.id, s.maxMarks]));

      for (const cid of classIds) {
        for (const sid of subjectIds) {
          await tx.insert(examSubjects).values({
            examinationId: exam.id,
            classId: cid,
            subjectId: sid,
            maxMarks: maxMarksMap.get(sid) || 100,
            examDate: examData.startDate,
          });
        }
      }
      return exam;
    });

    await logAudit(req.authUser, 'CREATE_EXAMINATION', 'examinations', created.id, { name: created.name }, req);
    res.status(201).json(created);
  } catch (err) {
    console.error('Create exam error:', err);
    res.status(500).json({ error: 'Failed to create examination.' });
  }
});

router.get('/:id/subjects', requireAuth, requirePermission('exams.view'), async (req: AuthRequest, res) => {
  try {
    const examId = Number(req.params.id);
    const user = req.authUser!;

    const [exam] = await db.select().from(examinations).where(eq(examinations.id, examId));
    if (!exam) return res.status(404).json({ error: 'Examination not found.' });
    if ((user.roleCode === 'STUDENT' || user.roleCode === 'PARENT') && exam.status !== 'PUBLISHED') {
      return res.status(403).json({ error: 'Results are not yet published.' });
    }

    const rows = await db
      .select({
        id: examSubjects.id,
        examinationId: examSubjects.examinationId,
        classId: examSubjects.classId,
        className: classes.name,
        subjectId: examSubjects.subjectId,
        subjectName: subjects.name,
        subjectCode: subjects.code,
        maxMarks: examSubjects.maxMarks,
      })
      .from(examSubjects)
      .innerJoin(classes, eq(examSubjects.classId, classes.id))
      .innerJoin(subjects, eq(examSubjects.subjectId, subjects.id))
      .where(eq(examSubjects.examinationId, examId))
      .orderBy(classes.levelOrder, subjects.code);

    // Filter for Teacher to only assigned class/subject pairs if linkedStaffId exists
    if (user.roleCode === 'TEACHER' && user.linkedStaffId) {
      const assigned = await db
        .select()
        .from(teacherAssignments)
        .where(eq(teacherAssignments.staffId, user.linkedStaffId));
      const allowedKeys = new Set(assigned.map((a) => `${a.classId}:${a.subjectId}`));
      return res.json(rows.filter((r) => allowedKeys.has(`${r.classId}:${r.subjectId}`)));
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load exam subjects.' });
  }
});

router.get('/:id/marks', requireAuth, requirePermission('exams.view'), async (req: AuthRequest, res) => {
  try {
    const examId = Number(req.params.id);
    const examSubjectId = Number(req.query.examSubjectId);
    const user = req.authUser!;

    const [exam] = await db.select().from(examinations).where(eq(examinations.id, examId));
    if (!exam) return res.status(404).json({ error: 'Examination not found.' });

    if ((user.roleCode === 'STUDENT' || user.roleCode === 'PARENT') && exam.status !== 'PUBLISHED') {
      return res.status(403).json({ error: 'Unpublished examination marks cannot be accessed.' });
    }

    const [es] = await db.select().from(examSubjects).where(eq(examSubjects.id, examSubjectId));
    if (!es) return res.status(404).json({ error: 'Exam subject not found.' });

    const classStudents = await db
      .select({
        id: students.id,
        admissionNumber: students.admissionNumber,
        firstName: students.firstName,
        lastName: students.lastName,
        streamName: streams.name,
      })
      .from(students)
      .leftJoin(streams, eq(students.currentStreamId, streams.id))
      .where(and(eq(students.currentClassId, es.classId), eq(students.status, 'ACTIVE')))
      .orderBy(students.admissionNumber);

    const existingMarks = await db
      .select()
      .from(marks)
      .where(eq(marks.examSubjectId, examSubjectId));
    const markByStudent = new Map(existingMarks.map((m) => [m.studentId, m]));

    const rows = classStudents
      .filter((s) =>
        user.roleCode === 'STUDENT' || user.roleCode === 'PARENT'
          ? s.id === user.linkedStudentId
          : true
      )
      .map((s) => {
        const m = markByStudent.get(s.id);
        return {
          studentId: s.id,
          admissionNumber: s.admissionNumber,
          studentName: `${s.firstName} ${s.lastName}`,
          streamName: s.streamName,
          score: m ? Number(m.score) : null,
          grade: m?.grade || null,
          points: m?.points || null,
          remarks: m?.remarks || null,
        };
      });

    res.json({ exam, examSubject: es, rows });
  } catch (err) {
    console.error('Get exam marks error:', err);
    res.status(500).json({ error: 'Failed to load marks sheet.' });
  }
});

async function recomputeExamResults(tx: any, examId: number) {
  const scales = await tx.select().from(gradingScales);
  const allMarks = await tx
    .select({
      studentId: marks.studentId,
      score: marks.score,
      points: marks.points,
    })
    .from(marks)
    .where(eq(marks.examinationId, examId));

  if (allMarks.length === 0) return;

  const byStudent = new Map<number, { totalScore: number; totalPoints: number; count: number }>();
  for (const m of allMarks) {
    const cur = byStudent.get(m.studentId) || { totalScore: 0, totalPoints: 0, count: 0 };
    cur.totalScore += Number(m.score);
    cur.totalPoints += m.points;
    cur.count += 1;
    byStudent.set(m.studentId, cur);
  }

  const allStudents = await tx.select().from(students);
  const studentMap = new Map<number, typeof students.$inferSelect>(allStudents.map((s: any) => [s.id, s]));

  await tx.delete(results).where(eq(results.examinationId, examId));

  const inserted: Array<{ id: number; classId: number; streamId: number | null; meanScore: number }> = [];
  for (const [studentId, agg] of byStudent.entries()) {
    const stu = studentMap.get(studentId);
    if (!stu || !stu.currentClassId) continue;
    const meanScore = agg.totalScore / agg.count;
    const meanGrade = calculateMeanGradeFromPoints(agg.totalPoints / agg.count, scales);

    const [row] = await tx
      .insert(results)
      .values({
        examinationId: examId,
        studentId,
        classId: stu.currentClassId,
        streamId: stu.currentStreamId,
        totalMarks: agg.totalScore.toFixed(2),
        meanScore: meanScore.toFixed(2),
        meanGrade,
        totalPoints: agg.totalPoints,
        subjectsCount: agg.count,
        principalRemarks:
          meanScore >= 75
            ? 'Outstanding academic achievement. Maintain the high standard.'
            : meanScore >= 60
            ? 'Good steady progress. Aim even higher next term.'
            : 'Requires focused consultation with subject teachers.',
      })
      .returning();
    inserted.push({ id: row.id, classId: row.classId, streamId: row.streamId, meanScore });
  }

  // Class Ranking
  const byClass = new Map<number, typeof inserted>();
  for (const r of inserted) {
    const arr = byClass.get(r.classId) || [];
    arr.push(r);
    byClass.set(r.classId, arr);
  }
  for (const arr of byClass.values()) {
    arr.sort((a, b) => b.meanScore - a.meanScore);
    for (let i = 0; i < arr.length; i++) {
      await tx.update(results).set({ classRank: i + 1 }).where(eq(results.id, arr[i].id));
    }
  }
}

router.post('/:id/marks', requireAuth, requirePermission('exams.enter_marks'), async (req: AuthRequest, res) => {
  try {
    const examId = Number(req.params.id);
    const user = req.authUser!;
    const schema = z.object({
      examSubjectId: z.coerce.number().int().positive(),
      entries: z.array(
        z.object({
          studentId: z.coerce.number().int().positive(),
          score: z.coerce.number().min(0).max(100),
          remarks: z.string().trim().max(120).optional().nullable(),
        })
      ),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid marks payload. Scores must be between 0 and 100.' });
    }

    const [exam] = await db.select().from(examinations).where(eq(examinations.id, examId));
    if (!exam) return res.status(404).json({ error: 'Examination not found.' });

    if (exam.status !== 'DRAFT') {
      return res.status(403).json({
        error: `Marks cannot be edited when examination is ${exam.status}. Finalized/submitted exams require authorized reopening to DRAFT.`,
      });
    }

    const [es] = await db
      .select()
      .from(examSubjects)
      .where(eq(examSubjects.id, parsed.data.examSubjectId));
    if (!es || es.examinationId !== examId) {
      return res.status(404).json({ error: 'Exam subject not found.' });
    }

    // Teacher assignment verification
    if (user.roleCode === 'TEACHER' && user.linkedStaffId) {
      const [assigned] = await db
        .select()
        .from(teacherAssignments)
        .where(
          and(
            eq(teacherAssignments.staffId, user.linkedStaffId),
            eq(teacherAssignments.classId, es.classId),
            eq(teacherAssignments.subjectId, es.subjectId)
          )
        );
      if (!assigned) {
        return res.status(403).json({ error: 'You are not assigned to teach this subject for this class.' });
      }
    }

    const scales = await db.select().from(gradingScales);

    await db.transaction(async (tx) => {
      for (const entry of parsed.data.entries) {
        if (entry.score > es.maxMarks) {
          throw new Error(`Score ${entry.score} exceeds max marks (${es.maxMarks}).`);
        }
        const computed = calculateGradeFromScale(entry.score, scales);
        await tx
          .insert(marks)
          .values({
            examinationId: examId,
            examSubjectId: es.id,
            studentId: entry.studentId,
            score: entry.score.toFixed(2),
            grade: computed.grade,
            points: computed.points,
            remarks: entry.remarks || computed.remarks,
            enteredByUserId: user.id,
            updatedByUserId: user.id,
          })
          .onConflictDoUpdate({
            target: [marks.examSubjectId, marks.studentId],
            set: {
              score: entry.score.toFixed(2),
              grade: computed.grade,
              points: computed.points,
              remarks: entry.remarks || computed.remarks,
              updatedByUserId: user.id,
              updatedAt: new Date(),
            },
          });
      }

      await recomputeExamResults(tx, examId);
    });

    await logAudit(
      user,
      'ENTER_DRAFT_MARKS',
      'marks',
      examId,
      { examSubjectId: es.id, entriesCount: parsed.data.entries.length },
      req
    );

    res.json({ saved: parsed.data.entries.length });
  } catch (err: any) {
    console.error('Save marks error:', err);
    res.status(400).json({ error: err.message || 'Failed to save marks.' });
  }
});

router.post('/:id/transition', requireAuth, async (req: AuthRequest, res) => {
  try {
    const examId = Number(req.params.id);
    const user = req.authUser!;
    const schema = z.object({
      targetStatus: z.enum(['DRAFT', 'SUBMITTED', 'VERIFIED', 'FINALIZED', 'PUBLISHED']),
      reason: z.string().trim().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid transition request.' });

    const [exam] = await db.select().from(examinations).where(eq(examinations.id, examId));
    if (!exam) return res.status(404).json({ error: 'Examination not found.' });

    const check = canTransitionExamStatus(
      exam.status as ExamStatus,
      parsed.data.targetStatus,
      user.roleCode
    );
    if (!check.allowed) {
      return res.status(403).json({ error: check.reason });
    }

    if (parsed.data.targetStatus === 'DRAFT' && (!parsed.data.reason || parsed.data.reason.length < 5)) {
      return res.status(400).json({ error: 'A detailed audit reason is required to reopen an examination.' });
    }

    const now = new Date();
    const updates: Record<string, unknown> = { status: parsed.data.targetStatus };
    if (parsed.data.targetStatus === 'SUBMITTED') {
      updates.submittedByUserId = user.id;
      updates.submittedAt = now;
    } else if (parsed.data.targetStatus === 'VERIFIED') {
      updates.verifiedByUserId = user.id;
      updates.verifiedAt = now;
    } else if (parsed.data.targetStatus === 'FINALIZED') {
      updates.finalizedByUserId = user.id;
      updates.finalizedAt = now;
    } else if (parsed.data.targetStatus === 'PUBLISHED') {
      updates.publishedByUserId = user.id;
      updates.publishedAt = now;
    } else if (parsed.data.targetStatus === 'DRAFT') {
      updates.reopenReason = parsed.data.reason;
    }

    const [updated] = await db.transaction(async (tx) => {
      if (parsed.data.targetStatus === 'VERIFIED' || parsed.data.targetStatus === 'FINALIZED') {
        await recomputeExamResults(tx, examId);
      }
      return tx.update(examinations).set(updates).where(eq(examinations.id, examId)).returning();
    });

    await logAudit(
      user,
      `EXAM_TRANSITION_${parsed.data.targetStatus}`,
      'examinations',
      examId,
      { from: exam.status, to: parsed.data.targetStatus, reason: parsed.data.reason || null },
      req
    );

    res.json(updated);
  } catch (err) {
    console.error('Exam transition error:', err);
    res.status(500).json({ error: 'Failed to update examination status.' });
  }
});

router.get('/:id/analytics', requireAuth, requirePermission('exams.view'), async (req: AuthRequest, res) => {
  try {
    const examId = Number(req.params.id);
    const user = req.authUser!;
    const [exam] = await db.select().from(examinations).where(eq(examinations.id, examId));
    if (!exam) return res.status(404).json({ error: 'Examination not found.' });

    if ((user.roleCode === 'STUDENT' || user.roleCode === 'PARENT') && exam.status !== 'PUBLISHED') {
      return res.status(403).json({ error: 'Results have not been published yet.' });
    }

    const [settings] = await db.select().from(schoolSettings).limit(1);
    const allowRanking = settings?.rankStudentsInReports ?? true;

    const subjectAnalysis = await db
      .select({
        subjectId: subjects.id,
        subjectCode: subjects.code,
        subjectName: subjects.name,
        entries: sql<number>`count(${marks.id})::int`,
        meanScore: sql<number>`round(avg(${marks.score})::numeric, 1)::float`,
        highestScore: sql<number>`max(${marks.score})::float`,
        lowestScore: sql<number>`min(${marks.score})::float`,
      })
      .from(marks)
      .innerJoin(examSubjects, eq(marks.examSubjectId, examSubjects.id))
      .innerJoin(subjects, eq(examSubjects.subjectId, subjects.id))
      .where(eq(marks.examinationId, examId))
      .groupBy(subjects.id, subjects.code, subjects.name)
      .orderBy(sql`avg(${marks.score}) desc`);

    const classAnalysis = await db
      .select({
        classId: classes.id,
        className: classes.name,
        studentsCount: sql<number>`count(${results.id})::int`,
        meanScore: sql<number>`round(avg(${results.meanScore})::numeric, 1)::float`,
      })
      .from(results)
      .innerJoin(classes, eq(results.classId, classes.id))
      .where(eq(results.examinationId, examId))
      .groupBy(classes.id, classes.name, classes.levelOrder)
      .orderBy(classes.levelOrder);

    const studentResults = await db
      .select({
        studentId: students.id,
        admissionNumber: students.admissionNumber,
        studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
        className: classes.name,
        streamName: streams.name,
        totalMarks: results.totalMarks,
        meanScore: results.meanScore,
        meanGrade: results.meanGrade,
        totalPoints: results.totalPoints,
        subjectsCount: results.subjectsCount,
        classRank: results.classRank,
      })
      .from(results)
      .innerJoin(students, eq(results.studentId, students.id))
      .innerJoin(classes, eq(results.classId, classes.id))
      .leftJoin(streams, eq(results.streamId, streams.id))
      .where(
        user.roleCode === 'STUDENT' || user.roleCode === 'PARENT'
          ? and(eq(results.examinationId, examId), eq(results.studentId, user.linkedStudentId || -1))
          : eq(results.examinationId, examId)
      )
      .orderBy(desc(results.meanScore));

    res.json({
      exam,
      allowRanking,
      subjectAnalysis,
      classAnalysis,
      studentResults: studentResults.map((r) => ({
        ...r,
        classRank: allowRanking ? r.classRank : null,
      })),
    });
  } catch (err) {
    console.error('Exam analytics error:', err);
    res.status(500).json({ error: 'Failed to load examination analytics.' });
  }
});

router.get('/:id/report-card/:studentId', requireAuth, requirePermission('exams.view'), async (req: AuthRequest, res) => {
  try {
    const examId = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    const user = req.authUser!;

    if ((user.roleCode === 'STUDENT' || user.roleCode === 'PARENT') && user.linkedStudentId !== studentId) {
      return res.status(403).json({ error: 'You can only view your own report card.' });
    }

    const [exam] = await db
      .select({
        exam: examinations,
        academicYear: academicYears.name,
        termName: terms.name,
      })
      .from(examinations)
      .innerJoin(academicYears, eq(examinations.academicYearId, academicYears.id))
      .innerJoin(terms, eq(examinations.termId, terms.id))
      .where(eq(examinations.id, examId));

    if (!exam) return res.status(404).json({ error: 'Examination not found.' });
    if ((user.roleCode === 'STUDENT' || user.roleCode === 'PARENT') && exam.exam.status !== 'PUBLISHED') {
      return res.status(403).json({ error: 'This report card is not published yet.' });
    }

    const [stu] = await db
      .select({
        id: students.id,
        admissionNumber: students.admissionNumber,
        firstName: students.firstName,
        lastName: students.lastName,
        className: classes.name,
        streamName: streams.name,
      })
      .from(students)
      .leftJoin(classes, eq(students.currentClassId, classes.id))
      .leftJoin(streams, eq(students.currentStreamId, streams.id))
      .where(eq(students.id, studentId));

    if (!stu) return res.status(404).json({ error: 'Student not found.' });

    const [summary] = await db
      .select()
      .from(results)
      .where(and(eq(results.examinationId, examId), eq(results.studentId, studentId)));

    const subjectMarks = await db
      .select({
        subjectCode: subjects.code,
        subjectName: subjects.name,
        score: marks.score,
        maxMarks: examSubjects.maxMarks,
        grade: marks.grade,
        points: marks.points,
        remarks: marks.remarks,
      })
      .from(marks)
      .innerJoin(examSubjects, eq(marks.examSubjectId, examSubjects.id))
      .innerJoin(subjects, eq(examSubjects.subjectId, subjects.id))
      .where(and(eq(marks.examinationId, examId), eq(marks.studentId, studentId)))
      .orderBy(subjects.code);

    const [settings] = await db.select().from(schoolSettings).limit(1);

    res.json({
      school: settings,
      exam: { ...exam.exam, academicYear: exam.academicYear, termName: exam.termName },
      student: stu,
      summary: summary || null,
      subjectMarks,
      allowRanking: settings?.rankStudentsInReports ?? true,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load student report card.' });
  }
});

export default router;
