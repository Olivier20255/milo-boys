import React, { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileCheck2, Lock, Plus, Printer, RotateCcw, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { exportToExcel } from '../lib/exporters';
import { formatDateShort } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input, Label, SelectInput, Textarea } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { DataTable, StatusText, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export const ExaminationsModule: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const canVerify = hasPermission('exams.verify');
  const canEnterMarks = hasPermission('exams.enter_marks');

  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [examSubjects, setExamSubjects] = useState<any[]>([]);
  const [selectedExamSubjectId, setSelectedExamSubjectId] = useState<number | null>(null);
  const [marksRows, setMarksRows] = useState<any[]>([]);
  const [scoreEdits, setScoreEdits] = useState<Record<number, string>>({});
  const [analytics, setAnalytics] = useState<any>(null);
  const [scales, setScales] = useState<any[]>([]);
  const [academicMeta, setAcademicMeta] = useState<any>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [examForm, setExamForm] = useState({
    name: '',
    examType: 'CAT_2',
    academicYearId: '',
    termId: '',
    startDate: '2026-07-06',
    endDate: '2026-07-10',
    classIds: [] as number[],
    subjectIds: [] as number[],
  });

  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reportCard, setReportCard] = useState<any>(null);
  const [reportCardOpen, setReportCardOpen] = useState(false);

  const loadBase = useCallback(async () => {
    try {
      const [exList, scList] = await Promise.all([
        apiFetch<any[]>('/api/examinations'),
        apiFetch<any[]>('/api/examinations/grading-scales'),
      ]);
      setExams(exList);
      setScales(scList);
      if (exList.length > 0 && !selectedExamId) {
        setSelectedExamId(exList[0].id);
      }
      if (hasPermission('academics.view')) {
        const ov = await apiFetch('/api/academics/overview');
        setAcademicMeta(ov);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load examinations.');
    }
  }, [hasPermission, selectedExamId]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  const loadExamDetails = useCallback(async () => {
    if (!selectedExamId) return;
    try {
      const [subs, anal] = await Promise.all([
        apiFetch<any[]>(`/api/examinations/${selectedExamId}/subjects`),
        apiFetch<any>(`/api/examinations/${selectedExamId}/analytics`),
      ]);
      setExamSubjects(subs);
      setAnalytics(anal);
      if (subs.length > 0) {
        setSelectedExamSubjectId(subs[0].id);
      } else {
        setSelectedExamSubjectId(null);
        setMarksRows([]);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load exam details.');
    }
  }, [selectedExamId]);

  useEffect(() => {
    loadExamDetails();
  }, [loadExamDetails]);

  useEffect(() => {
    if (!selectedExamId || !selectedExamSubjectId) return;
    apiFetch<{ rows: any[] }>(
      `/api/examinations/${selectedExamId}/marks?examSubjectId=${selectedExamSubjectId}`
    )
      .then((res) => {
        setMarksRows(res.rows);
        const edits: Record<number, string> = {};
        for (const r of res.rows) {
          edits[r.studentId] = r.score !== null ? String(r.score) : '';
        }
        setScoreEdits(edits);
      })
      .catch((err) => toast.error(err?.message || 'Failed to load marks sheet.'));
  }, [selectedExamId, selectedExamSubjectId]);

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await apiFetch<any>('/api/examinations', {
        method: 'POST',
        body: JSON.stringify({
          name: examForm.name,
          examType: examForm.examType,
          academicYearId: Number(examForm.academicYearId),
          termId: Number(examForm.termId),
          startDate: examForm.startDate,
          endDate: examForm.endDate,
          classIds: examForm.classIds,
          subjectIds: examForm.subjectIds,
        }),
      });
      toast.success('Examination created in DRAFT state.');
      setCreateOpen(false);
      await loadBase();
      setSelectedExamId(created.id);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create examination.');
    }
  };

  const handleSaveMarks = async () => {
    if (!selectedExamId || !selectedExamSubjectId) return;
    const entries = Object.entries(scoreEdits)
      .filter(([, val]) => val !== '' && !Number.isNaN(Number(val)))
      .map(([sid, val]) => ({
        studentId: Number(sid),
        score: Number(val),
      }));

    if (entries.length === 0) {
      toast.error('Enter at least one student score before saving.');
      return;
    }

    try {
      await apiFetch(`/api/examinations/${selectedExamId}/marks`, {
        method: 'POST',
        body: JSON.stringify({ examSubjectId: selectedExamSubjectId, entries }),
      });
      toast.success(`Saved ${entries.length} student score(s) and recalculated grades.`);
      loadExamDetails();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save marks.');
    }
  };

  const handleTransition = async (targetStatus: string, reason?: string) => {
    if (!selectedExamId) return;
    try {
      await apiFetch(`/api/examinations/${selectedExamId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ targetStatus, reason }),
      });
      toast.success(`Examination moved to ${targetStatus}.`);
      setReopenOpen(false);
      setReopenReason('');
      await loadBase();
      await loadExamDetails();
    } catch (err: any) {
      toast.error(err?.message || 'Workflow transition denied.');
    }
  };

  const openReportCard = async (studentId: number) => {
    if (!selectedExamId) return;
    try {
      const data = await apiFetch(`/api/examinations/${selectedExamId}/report-card/${studentId}`);
      setReportCard(data);
      setReportCardOpen(true);
    } catch (err: any) {
      toast.error(err?.message || 'Unable to load report card.');
    }
  };

  const isRestrictedRole = user?.roleCode === 'STUDENT' || user?.roleCode === 'PARENT';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Examinations & Results</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Controlled workflow: DRAFT → SUBMITTED → VERIFIED → FINALIZED → PUBLISHED
          </p>
        </div>
        {canVerify && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Examination
          </Button>
        )}
      </div>

      {/* Exam Selector Bar */}
      <Card className="no-print">
        <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-72">
              <Label>Active Examination</Label>
              <SelectInput
                value={selectedExamId || ''}
                onChange={(e) => setSelectedExamId(Number(e.target.value))}
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} ({ex.status})
                  </option>
                ))}
              </SelectInput>
            </div>

            {selectedExam && (
              <div className="text-xs space-y-0.5 pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Status:</span>
                  <StatusText
                    tone={
                      selectedExam.status === 'PUBLISHED'
                        ? 'success'
                        : selectedExam.status === 'FINALIZED'
                        ? 'info'
                        : selectedExam.status === 'SUBMITTED'
                        ? 'warning'
                        : 'neutral'
                    }
                    label={selectedExam.status}
                  />
                </div>
                <p className="text-slate-500">
                  {selectedExam.academicYearName} · {selectedExam.termName}
                  {selectedExam.publishedByName ? ` · Published by ${selectedExam.publishedByName}` : ''}
                </p>
              </div>
            )}
          </div>

          {/* Workflow State Transition Controls */}
          {selectedExam && !isRestrictedRole && (
            <div className="flex flex-wrap items-center gap-2">
              {selectedExam.status === 'DRAFT' && canEnterMarks && (
                <Button size="sm" variant="secondary" onClick={() => handleTransition('SUBMITTED')}>
                  <Send className="h-3.5 w-3.5" />
                  Submit Marks
                </Button>
              )}
              {selectedExam.status === 'SUBMITTED' && canVerify && (
                <Button size="sm" onClick={() => handleTransition('VERIFIED')}>
                  <FileCheck2 className="h-3.5 w-3.5" />
                  Verify Results
                </Button>
              )}
              {selectedExam.status === 'VERIFIED' && canVerify && (
                <Button size="sm" onClick={() => handleTransition('FINALIZED')}>
                  <Lock className="h-3.5 w-3.5" />
                  Finalize Results
                </Button>
              )}
              {selectedExam.status === 'FINALIZED' && canVerify && (
                <Button size="sm" variant="secondary" onClick={() => handleTransition('PUBLISHED')}>
                  Publish to Students & Parents
                </Button>
              )}
              {['SUBMITTED', 'VERIFIED', 'FINALIZED'].includes(selectedExam.status) && canVerify && (
                <Button size="sm" variant="outline" onClick={() => setReopenOpen(true)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reopen Draft
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue={isRestrictedRole ? 'results' : 'marks'} className="no-print">
        <TabsList>
          {!isRestrictedRole && <TabsTrigger value="marks">Marks Entry</TabsTrigger>}
          <TabsTrigger value="results">Results & Report Cards</TabsTrigger>
          <TabsTrigger value="analysis">Subject & Class Analysis</TabsTrigger>
          <TabsTrigger value="scales">Grading Scale</TabsTrigger>
        </TabsList>

        {!isRestrictedRole && (
          <TabsContent value="marks">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle>Subject Marks Entry</CardTitle>
                  <CardDescription>
                    {selectedExam?.status === 'DRAFT'
                      ? 'Draft marks are editable. Grades compute automatically on save.'
                      : `Examination is ${selectedExam?.status || ''}. Marks are locked against ordinary editing.`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <SelectInput
                    className="w-64"
                    value={selectedExamSubjectId || ''}
                    onChange={(e) => setSelectedExamSubjectId(Number(e.target.value))}
                  >
                    {examSubjects.map((es) => (
                      <option key={es.id} value={es.id}>
                        {es.className} — {es.subjectCode} {es.subjectName}
                      </option>
                    ))}
                  </SelectInput>
                  {selectedExam?.status === 'DRAFT' && canEnterMarks && (
                    <Button size="sm" onClick={handleSaveMarks}>
                      <Save className="h-4 w-4" />
                      Save Marks
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {marksRows.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    No students or assigned subjects found for this selection.
                  </p>
                ) : (
                  <DataTable>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Adm No.</TableHead>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Stream</TableHead>
                        <TableHead className="w-36">Score (0–100)</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Points</TableHead>
                        <TableHead>Remarks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <tbody>
                      {marksRows.map((row) => (
                        <TableRow key={row.studentId}>
                          <TableCell className="font-mono text-xs">{row.admissionNumber}</TableCell>
                          <TableCell className="font-medium">{row.studentName}</TableCell>
                          <TableCell className="text-xs">{row.streamName || '—'}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step="0.5"
                              disabled={selectedExam?.status !== 'DRAFT' || !canEnterMarks}
                              value={scoreEdits[row.studentId] ?? ''}
                              onChange={(e) =>
                                setScoreEdits((prev) => ({ ...prev, [row.studentId]: e.target.value }))
                              }
                              className="h-8 font-mono tabular-nums"
                            />
                          </TableCell>
                          <TableCell className="font-mono font-bold">{row.grade || '—'}</TableCell>
                          <TableCell className="font-mono tabular-nums">{row.points ?? '—'}</TableCell>
                          <TableCell className="text-xs text-slate-500">{row.remarks || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </tbody>
                  </DataTable>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="results">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Student Results Summary</CardTitle>
                <CardDescription>
                  Click View Report Card to print or inspect subject-by-subject breakdown
                </CardDescription>
              </div>
              {analytics?.studentResults?.length > 0 && !isRestrictedRole && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    exportToExcel(
                      `exam-results-${selectedExamId}`,
                      'Results',
                      analytics.studentResults
                    );
                    toast.success('Results spreadsheet downloaded.');
                  }}
                >
                  Export Excel
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!analytics || analytics.studentResults.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">
                  No calculated results available for this examination yet.
                </p>
              ) : (
                <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Adm No.</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Mean %</TableHead>
                      <TableHead>Mean Grade</TableHead>
                      {analytics.allowRanking && <TableHead className="text-right">Class Rank</TableHead>}
                      <TableHead className="text-right">Report Card</TableHead>
                    </TableRow>
                  </TableHeader>
                  <tbody>
                    {analytics.studentResults.map((r: any) => (
                      <TableRow key={r.studentId}>
                        <TableCell className="font-mono text-xs">{r.admissionNumber}</TableCell>
                        <TableCell className="font-medium">{r.studentName}</TableCell>
                        <TableCell>
                          {r.className} {r.streamName || ''}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{r.totalMarks}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {r.meanScore}%
                        </TableCell>
                        <TableCell className="font-mono font-bold text-[#0F2557] dark:text-blue-400">
                          {r.meanGrade}
                        </TableCell>
                        {analytics.allowRanking && (
                          <TableCell className="text-right font-mono tabular-nums">
                            {r.classRank ? `#${r.classRank}` : '—'}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => openReportCard(r.studentId)}>
                            Report Card
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Subject Performance Analysis</CardTitle>
              <CardDescription>Mean score, highest, and lowest marks per subject</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {analytics?.subjectAnalysis?.length > 0 && (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.subjectAnalysis}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="subjectCode" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="meanScore" name="Mean Score (%)" fill="#0F2557" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Mean %</TableHead>
                    <TableHead className="text-right">High / Low</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {analytics?.subjectAnalysis?.map((s: any) => (
                    <TableRow key={s.subjectId}>
                      <TableCell className="font-medium">
                        {s.subjectCode} · {s.subjectName}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{s.entries}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-semibold">
                        {s.meanScore}%
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {s.highestScore} / {s.lowestScore}
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Class Comparison & Governance Trail</CardTitle>
              <CardDescription>Class mean scores and audit actors</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Candidates</TableHead>
                    <TableHead className="text-right">Class Mean %</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {analytics?.classAnalysis?.map((c: any) => (
                    <TableRow key={c.classId}>
                      <TableCell className="font-semibold">{c.className}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{c.studentsCount}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-bold">
                        {c.meanScore}%
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>

              {selectedExam && (
                <div className="p-3 rounded-md border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                  <p className="font-semibold">Audit Sign-Off Timestamps</p>
                  <p>Created: {selectedExam.createdByName || 'System'}</p>
                  <p>Submitted: {selectedExam.submittedByName ? `${selectedExam.submittedByName} (${formatDateShort(selectedExam.submittedAt)})` : 'Pending'}</p>
                  <p>Verified: {selectedExam.verifiedByName ? `${selectedExam.verifiedByName} (${formatDateShort(selectedExam.verifiedAt)})` : 'Pending'}</p>
                  <p>Finalized: {selectedExam.finalizedByName ? `${selectedExam.finalizedByName} (${formatDateShort(selectedExam.finalizedAt)})` : 'Pending'}</p>
                  <p>Published: {selectedExam.publishedByName ? `${selectedExam.publishedByName} (${formatDateShort(selectedExam.publishedAt)})` : 'Pending'}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scales">
          <Card>
            <CardHeader>
              <CardTitle>School Grading Scale (KCSE 12-Point System)</CardTitle>
              <CardDescription>Automatically used for grade and points calculations</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grade</TableHead>
                    <TableHead>Score Range</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {scales.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono font-bold">{b.grade}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {b.minScore} – {b.maxScore}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{b.points}</TableCell>
                      <TableCell>{b.remarks}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Examination Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Examination</DialogTitle>
            <DialogDescription>Select target classes and subjects to initialize mark sheets.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateExam} className="space-y-3">
            <div>
              <Label>Examination Name *</Label>
              <Input
                required
                placeholder="Term 2 End-of-Term Examination 2026"
                value={examForm.name}
                onChange={(e) => setExamForm({ ...examForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Exam Type</Label>
                <SelectInput
                  value={examForm.examType}
                  onChange={(e) => setExamForm({ ...examForm, examType: e.target.value })}
                >
                  <option value="CAT_1">CAT 1</option>
                  <option value="CAT_2">CAT 2</option>
                  <option value="MID_TERM">Mid-Term</option>
                  <option value="END_OF_TERM">End of Term</option>
                  <option value="MOCK">Mock Exam</option>
                </SelectInput>
              </div>
              <div>
                <Label>Academic Year *</Label>
                <SelectInput
                  required
                  value={examForm.academicYearId}
                  onChange={(e) => setExamForm({ ...examForm, academicYearId: e.target.value })}
                >
                  <option value="">Select Year</option>
                  {academicMeta?.academicYears?.map((y: any) => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </SelectInput>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Term *</Label>
                <SelectInput
                  required
                  value={examForm.termId}
                  onChange={(e) => setExamForm({ ...examForm, termId: e.target.value })}
                >
                  <option value="">Select Term</option>
                  {academicMeta?.terms?.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </SelectInput>
              </div>
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={examForm.startDate}
                  onChange={(e) => setExamForm({ ...examForm, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={examForm.endDate}
                  onChange={(e) => setExamForm({ ...examForm, endDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Participating Classes *</Label>
              <div className="flex flex-wrap gap-3 mt-1.5">
                {academicMeta?.classes?.map((c: any) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={examForm.classIds.includes(c.id)}
                      onChange={(e) =>
                        setExamForm((prev) => ({
                          ...prev,
                          classIds: e.target.checked
                            ? [...prev.classIds, c.id]
                            : prev.classIds.filter((id) => id !== c.id),
                        }))
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label>Subjects *</Label>
              <div className="grid grid-cols-2 gap-1.5 mt-1.5 max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded p-2">
                {academicMeta?.subjects?.map((s: any) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={examForm.subjectIds.includes(s.id)}
                      onChange={(e) =>
                        setExamForm((prev) => ({
                          ...prev,
                          subjectIds: e.target.checked
                            ? [...prev.subjectIds, s.id]
                            : prev.subjectIds.filter((id) => id !== s.id),
                        }))
                      }
                    />
                    {s.code} {s.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit">Create Exam</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reopen Audit Dialog */}
      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Authorize Reopening to DRAFT</DialogTitle>
            <DialogDescription>
              Reopening a submitted or finalized examination requires an audit explanation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Audit Reason *</Label>
            <Textarea
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Explain the authorized correction required..."
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReopenOpen(false)}>Cancel</Button>
              <Button onClick={() => handleTransition('DRAFT', reopenReason)}>Confirm Reopen</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Printable Report Card Dialog */}
      <Dialog open={reportCardOpen} onOpenChange={setReportCardOpen}>
        <DialogContent className="max-w-2xl">
          {reportCard && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/src/assets/images/milo_boys_crest_1795596068996.jpg"
                    alt="Crest"
                    className="h-12 w-12 rounded object-cover"
                  />
                  <div>
                    <h3 className="text-base font-bold text-[#0F2557] dark:text-white">
                      {reportCard.school?.schoolName || 'MILO BOYS SCHOOL'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Official Academic Report Form · {reportCard.exam.name}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="no-print" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  Print Report Card
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs p-3 rounded bg-slate-50 dark:bg-slate-800/60">
                <div>
                  <span className="text-slate-500">Student Name</span>
                  <p className="font-semibold">
                    {reportCard.student.firstName} {reportCard.student.lastName}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Admission No.</span>
                  <p className="font-mono font-semibold">{reportCard.student.admissionNumber}</p>
                </div>
                <div>
                  <span className="text-slate-500">Class</span>
                  <p className="font-semibold">
                    {reportCard.student.className} {reportCard.student.streamName || ''}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Mean Grade / Rank</span>
                  <p className="font-mono font-bold">
                    {reportCard.summary?.meanGrade || '—'}
                    {reportCard.allowRanking && reportCard.summary?.classRank
                      ? ` · Rank #${reportCard.summary.classRank}`
                      : ''}
                  </p>
                </div>
              </div>

              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {reportCard.subjectMarks.map((m: any) => (
                    <TableRow key={m.subjectCode}>
                      <TableCell className="font-mono text-xs">{m.subjectCode}</TableCell>
                      <TableCell className="font-medium">{m.subjectName}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{m.score}</TableCell>
                      <TableCell className="font-mono font-bold">{m.grade}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{m.points}</TableCell>
                      <TableCell className="text-xs">{m.remarks}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>

              {reportCard.summary && (
                <div className="p-3 rounded border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                  <div className="flex justify-between font-mono font-semibold">
                    <span>Total Marks: {reportCard.summary.totalMarks}</span>
                    <span>Mean Score: {reportCard.summary.meanScore}%</span>
                    <span>Total Points: {reportCard.summary.totalPoints}</span>
                  </div>
                  <p className="pt-1 text-slate-600 dark:text-slate-300">
                    Principal&apos;s Remarks: {reportCard.summary.principalRemarks}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
