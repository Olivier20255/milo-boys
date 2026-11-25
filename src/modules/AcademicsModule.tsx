import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input, Label, SelectInput } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { DataTable, StatusText, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export const AcademicsModule: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('academics.manage');

  const [overview, setOverview] = useState<any>(null);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [yearOpen, setYearOpen] = useState(false);
  const [yearForm, setYearForm] = useState({ name: '', startDate: '2027-01-05', endDate: '2027-11-12', isCurrent: false });

  const [termOpen, setTermOpen] = useState(false);
  const [termForm, setTermForm] = useState({ academicYearId: '', name: '', startDate: '', endDate: '', isCurrent: false });

  const [streamOpen, setStreamOpen] = useState(false);
  const [streamForm, setStreamForm] = useState({ classId: '', name: '', capacity: '45', roomName: '', classTeacherId: '' });

  const [subjectOpen, setSubjectOpen] = useState(false);
  const [subjectForm, setSubjectForm] = useState({ code: '', name: '', department: 'Sciences', isCompulsory: true, maxMarks: '100' });

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ staffId: '', subjectId: '', classId: '', academicYearId: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const ov = await apiFetch('/api/academics/overview');
      setOverview(ov);
      if (hasPermission('staff.view')) {
        const st = await apiFetch('/api/staff?staffType=TEACHING');
        setStaffList(st);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load academic setup.');
    } finally {
      setLoading(false);
    }
  }, [hasPermission]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/academics/years', { method: 'POST', body: JSON.stringify(yearForm) });
      toast.success('Academic year created.');
      setYearOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create academic year.');
    }
  };

  const handleCreateTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/academics/terms', {
        method: 'POST',
        body: JSON.stringify({ ...termForm, academicYearId: Number(termForm.academicYearId) }),
      });
      toast.success('Term added.');
      setTermOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add term.');
    }
  };

  const handleCreateStream = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/academics/streams', {
        method: 'POST',
        body: JSON.stringify({
          classId: Number(streamForm.classId),
          name: streamForm.name,
          capacity: Number(streamForm.capacity),
          roomName: streamForm.roomName || null,
          classTeacherId: streamForm.classTeacherId ? Number(streamForm.classTeacherId) : null,
        }),
      });
      toast.success('Stream created.');
      setStreamOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create stream.');
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/academics/subjects', {
        method: 'POST',
        body: JSON.stringify({ ...subjectForm, maxMarks: Number(subjectForm.maxMarks) }),
      });
      toast.success('Subject added.');
      setSubjectOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create subject.');
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/academics/assignments', {
        method: 'POST',
        body: JSON.stringify({
          staffId: Number(assignForm.staffId),
          subjectId: Number(assignForm.subjectId),
          classId: Number(assignForm.classId),
          academicYearId: Number(assignForm.academicYearId),
        }),
      });
      toast.success('Teacher assigned to subject and class.');
      setAssignOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Assignment failed.');
    }
  };

  if (loading || !overview) {
    return <div className="h-64 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Academic Administration</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure academic years, terms, classes, streams, curriculum subjects, and teacher allocations
        </p>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="calendar">Years & Terms</TabsTrigger>
          <TabsTrigger value="classes">Classes & Streams</TabsTrigger>
          <TabsTrigger value="subjects">Subjects & Curriculum</TabsTrigger>
          <TabsTrigger value="allocations">Teacher Allocations</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Academic Years</CardTitle>
                <CardDescription>School calendar years</CardDescription>
              </div>
              {canManage && (
                <Button size="sm" onClick={() => setYearOpen(true)}>
                  <Plus className="h-4 w-4" />
                  New Year
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {overview.academicYears.map((y: any) => (
                    <TableRow key={y.id}>
                      <TableCell className="font-mono font-semibold">{y.name}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {y.startDate} → {y.endDate}
                      </TableCell>
                      <TableCell>
                        <StatusText tone={y.isCurrent ? 'success' : 'neutral'} label={y.isCurrent ? 'ACTIVE' : 'ARCHIVED'} />
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && !y.isCurrent && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await apiFetch(`/api/academics/years/${y.id}/activate`, { method: 'POST' });
                              toast.success(`${y.name} set as active academic year.`);
                              loadData();
                            }}
                          >
                            Set Current
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Academic Terms</CardTitle>
                <CardDescription>Termly sessions</CardDescription>
              </div>
              {canManage && (
                <Button size="sm" onClick={() => setTermOpen(true)}>
                  <Plus className="h-4 w-4" />
                  New Term
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Term</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {overview.terms.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {t.startDate} → {t.endDate}
                      </TableCell>
                      <TableCell>
                        <StatusText tone={t.isCurrent ? 'success' : 'neutral'} label={t.isCurrent ? 'CURRENT' : 'INACTIVE'} />
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && !t.isCurrent && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await apiFetch(`/api/academics/terms/${t.id}/activate`, { method: 'POST' });
                              toast.success(`${t.name} activated.`);
                              loadData();
                            }}
                          >
                            Activate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="classes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Classes & Streams</CardTitle>
                <CardDescription>Class capacities, rooms, and assigned class teachers</CardDescription>
              </div>
              {canManage && (
                <Button size="sm" onClick={() => setStreamOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add Stream
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Stream</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Class Teacher</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {overview.streams.map((st: any) => {
                    const cls = overview.classes.find((c: any) => c.id === st.classId);
                    return (
                      <TableRow key={st.id}>
                        <TableCell className="font-semibold">{cls?.name}</TableCell>
                        <TableCell>{st.name}</TableCell>
                        <TableCell className="font-mono text-xs">{st.roomName || '—'}</TableCell>
                        <TableCell className="font-mono tabular-nums">{st.capacity}</TableCell>
                        <TableCell>
                          {st.classTeacherName
                            ? `${st.classTeacherName} ${st.classTeacherLastName}`
                            : 'Unassigned'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subjects">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Curriculum Subjects ({overview.subjects.length})</CardTitle>
                <CardDescription>KNEC subject codes, departments, and maximum marks</CardDescription>
              </div>
              {canManage && (
                <Button size="sm" onClick={() => setSubjectOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add Subject
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Subject Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Max Marks</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {overview.subjects.map((sub: any) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-mono font-semibold">{sub.code}</TableCell>
                      <TableCell className="font-medium">{sub.name}</TableCell>
                      <TableCell>{sub.department}</TableCell>
                      <TableCell>
                        <StatusText
                          tone={sub.isCompulsory ? 'info' : 'neutral'}
                          label={sub.isCompulsory ? 'COMPULSORY' : 'ELECTIVE'}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{sub.maxMarks}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allocations">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Teacher–Subject Allocations</CardTitle>
                <CardDescription>Controls which classes and subjects a teacher can enter marks for</CardDescription>
              </div>
              {canManage && (
                <Button size="sm" onClick={() => setAssignOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Assign Teacher
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {overview.teacherAssignments.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {a.teacherName} {a.teacherLastName}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-slate-500">{a.subjectCode}</span> · {a.subjectName}
                      </TableCell>
                      <TableCell>
                        {a.className} {a.streamName ? `(${a.streamName})` : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              await apiFetch(`/api/academics/assignments/${a.id}`, { method: 'DELETE' });
                              toast.success('Assignment removed.');
                              loadData();
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enrollments">
          <Card>
            <CardHeader>
              <CardTitle>Student Class Enrollments</CardTitle>
              <CardDescription>Active year placement log</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Adm No.</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Academic Year</TableHead>
                    <TableHead>Class & Stream</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {overview.enrollments.map((en: any) => (
                    <TableRow key={en.id}>
                      <TableCell className="font-mono text-xs">{en.admissionNumber}</TableCell>
                      <TableCell className="font-medium">
                        {en.firstName} {en.lastName}
                      </TableCell>
                      <TableCell className="font-mono">{en.academicYear}</TableCell>
                      <TableCell>
                        {en.className} {en.streamName ? `· ${en.streamName}` : ''}
                      </TableCell>
                      <TableCell>
                        <StatusText tone={en.isActive ? 'success' : 'neutral'} label={en.isActive ? 'ENROLLED' : 'CLOSED'} />
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={yearOpen} onOpenChange={setYearOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Academic Year</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateYear} className="space-y-3">
            <div>
              <Label>Year Name *</Label>
              <Input required placeholder="2027" value={yearForm.name} onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date *</Label>
                <Input type="date" required value={yearForm.startDate} onChange={(e) => setYearForm({ ...yearForm, startDate: e.target.value })} />
              </div>
              <div>
                <Label>End Date *</Label>
                <Input type="date" required value={yearForm.endDate} onChange={(e) => setYearForm({ ...yearForm, endDate: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setYearOpen(false)}>Cancel</Button>
              <Button type="submit">Save Year</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={termOpen} onOpenChange={setTermOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Academic Term</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTerm} className="space-y-3">
            <div>
              <Label>Academic Year *</Label>
              <SelectInput required value={termForm.academicYearId} onChange={(e) => setTermForm({ ...termForm, academicYearId: e.target.value })}>
                <option value="">Select Year</option>
                {overview.academicYears.map((y: any) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </SelectInput>
            </div>
            <div>
              <Label>Term Name *</Label>
              <Input required placeholder="Term 1" value={termForm.name} onChange={(e) => setTermForm({ ...termForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date *</Label>
                <Input type="date" required value={termForm.startDate} onChange={(e) => setTermForm({ ...termForm, startDate: e.target.value })} />
              </div>
              <div>
                <Label>End Date *</Label>
                <Input type="date" required value={termForm.endDate} onChange={(e) => setTermForm({ ...termForm, endDate: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setTermOpen(false)}>Cancel</Button>
              <Button type="submit">Create Term</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={streamOpen} onOpenChange={setStreamOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Class Stream</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateStream} className="space-y-3">
            <div>
              <Label>Class *</Label>
              <SelectInput required value={streamForm.classId} onChange={(e) => setStreamForm({ ...streamForm, classId: e.target.value })}>
                <option value="">Select Class</option>
                {overview.classes.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </SelectInput>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Stream Name *</Label>
                <Input required placeholder="West" value={streamForm.name} onChange={(e) => setStreamForm({ ...streamForm, name: e.target.value })} />
              </div>
              <div>
                <Label>Capacity *</Label>
                <Input type="number" required value={streamForm.capacity} onChange={(e) => setStreamForm({ ...streamForm, capacity: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Room Name</Label>
              <Input placeholder="F1-W" value={streamForm.roomName} onChange={(e) => setStreamForm({ ...streamForm, roomName: e.target.value })} />
            </div>
            <div>
              <Label>Class Teacher</Label>
              <SelectInput value={streamForm.classTeacherId} onChange={(e) => setStreamForm({ ...streamForm, classTeacherId: e.target.value })}>
                <option value="">Select Teacher</option>
                {staffList.map((st: any) => (
                  <option key={st.id} value={st.id}>{st.firstName} {st.lastName}</option>
                ))}
              </SelectInput>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStreamOpen(false)}>Cancel</Button>
              <Button type="submit">Save Stream</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={subjectOpen} onOpenChange={setSubjectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Subject</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubject} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Subject Code *</Label>
                <Input required placeholder="443" value={subjectForm.code} onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })} />
              </div>
              <div>
                <Label>Max Marks *</Label>
                <Input type="number" required value={subjectForm.maxMarks} onChange={(e) => setSubjectForm({ ...subjectForm, maxMarks: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Subject Name *</Label>
              <Input required placeholder="Agriculture" value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} />
            </div>
            <div>
              <Label>Department *</Label>
              <Input required value={subjectForm.department} onChange={(e) => setSubjectForm({ ...subjectForm, department: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setSubjectOpen(false)}>Cancel</Button>
              <Button type="submit">Add Subject</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Allocate Teacher to Subject</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAssignment} className="space-y-3">
            <div>
              <Label>Teacher *</Label>
              <SelectInput required value={assignForm.staffId} onChange={(e) => setAssignForm({ ...assignForm, staffId: e.target.value })}>
                <option value="">Select Teacher</option>
                {staffList.map((st: any) => (
                  <option key={st.id} value={st.id}>{st.firstName} {st.lastName}</option>
                ))}
              </SelectInput>
            </div>
            <div>
              <Label>Subject *</Label>
              <SelectInput required value={assignForm.subjectId} onChange={(e) => setAssignForm({ ...assignForm, subjectId: e.target.value })}>
                <option value="">Select Subject</option>
                {overview.subjects.map((sub: any) => (
                  <option key={sub.id} value={sub.id}>{sub.code} — {sub.name}</option>
                ))}
              </SelectInput>
            </div>
            <div>
              <Label>Class *</Label>
              <SelectInput required value={assignForm.classId} onChange={(e) => setAssignForm({ ...assignForm, classId: e.target.value })}>
                <option value="">Select Class</option>
                {overview.classes.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </SelectInput>
            </div>
            <div>
              <Label>Academic Year *</Label>
              <SelectInput required value={assignForm.academicYearId} onChange={(e) => setAssignForm({ ...assignForm, academicYearId: e.target.value })}>
                <option value="">Select Year</option>
                {overview.academicYears.map((y: any) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </SelectInput>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
              <Button type="submit">Save Allocation</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
