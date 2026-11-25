import React, { useCallback, useEffect, useState } from 'react';
import { Download, Save } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { exportToCSV, exportToPDF } from '../lib/exporters';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input, Label, SelectInput } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { DataTable, StatusText, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export const AttendanceModule: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission('attendance.manage');
  const canManageStaff = hasPermission('staff.manage');
  const isRestricted = user?.roleCode === 'STUDENT' || user?.roleCode === 'PARENT';

  const [meta, setMeta] = useState<any>({ classes: [], streams: [] });
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const [rollCallStudents, setRollCallStudents] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<number, 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'>>({});
  const [correctionReason, setCorrectionReason] = useState('');

  const [history, setHistory] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ total: 0, present: 0, late: 0, absent: 0, excused: 0, rate: 0 });

  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffStatuses, setStaffStatuses] = useState<Record<number, 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'>>({});
  const [staffHistory, setStaffHistory] = useState<any[]>([]);

  const loadMeta = useCallback(async () => {
    if (hasPermission('academics.view')) {
      const ov = await apiFetch('/api/academics/overview');
      setMeta(ov);
      if (ov.classes.length > 0 && !classId) {
        setClassId(String(ov.classes[0].id));
      }
    }
    if (hasPermission('staff.view')) {
      const st = await apiFetch<any[]>('/api/staff');
      setStaffList(st);
      const init: Record<number, 'PRESENT'> = {};
      st.forEach((s) => (init[s.id] = 'PRESENT'));
      setStaffStatuses(init);
    }
  }, [hasPermission, classId]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const loadHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (classId) params.set('classId', classId);
      if (streamId) params.set('streamId', streamId);
      if (filterStatus !== 'ALL') params.set('status', filterStatus);

      const res = await apiFetch<any>(`/api/attendance/students?${params.toString()}`);
      setHistory(res.items);
      setSummary(res.summary);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load attendance history.');
    }
  }, [date, classId, streamId, filterStatus]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const loadRollCall = useCallback(async () => {
    if (isRestricted || !classId) return;
    try {
      const params = new URLSearchParams({ classId, status: 'ACTIVE', pageSize: '100' });
      if (streamId) params.set('streamId', streamId);
      const res = await apiFetch<{ items: any[] }>(`/api/students?${params.toString()}`);
      setRollCallStudents(res.items);
      const next: Record<number, 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'> = {};
      res.items.forEach((s) => {
        const existing = history.find((h) => h.record.studentId === s.id);
        next[s.id] = existing ? existing.record.status : 'PRESENT';
      });
      setStatuses(next);
    } catch {
      // ignore
    }
  }, [isRestricted, classId, streamId, history]);

  useEffect(() => {
    loadRollCall();
  }, [loadRollCall]);

  const saveStudentRollCall = async () => {
    if (!classId || rollCallStudents.length === 0) return;
    try {
      await apiFetch('/api/attendance/students/batch', {
        method: 'POST',
        body: JSON.stringify({
          date,
          classId: Number(classId),
          streamId: streamId ? Number(streamId) : null,
          correctionReason: correctionReason || undefined,
          entries: rollCallStudents.map((s) => ({
            studentId: s.id,
            status: statuses[s.id] || 'PRESENT',
          })),
        }),
      });
      toast.success(`Attendance saved for ${rollCallStudents.length} student(s).`);
      setCorrectionReason('');
      loadHistory();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save attendance.');
    }
  };

  const loadStaffAttendance = async () => {
    try {
      const res = await apiFetch<any>(`/api/attendance/staff?date=${date}`);
      setStaffHistory(res.items);
    } catch {
      // ignore
    }
  };

  const saveStaffRollCall = async () => {
    try {
      await apiFetch('/api/attendance/staff/batch', {
        method: 'POST',
        body: JSON.stringify({
          date,
          entries: staffList.map((st) => ({
            staffId: st.id,
            status: staffStatuses[st.id] || 'PRESENT',
            checkInTime: '07:30',
          })),
        }),
      });
      toast.success('Staff attendance saved.');
      loadStaffAttendance();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save staff attendance.');
    }
  };

  const classStreams = meta.streams.filter((st: any) => !classId || st.classId === Number(classId));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Daily student roll call, staff attendance, absentee tracking, and audited corrections
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportToCSV(
                `attendance-${date}`,
                ['Date', 'Adm No.', 'Student', 'Class', 'Status'],
                history.map((h) => [
                  h.record.date,
                  h.admissionNumber,
                  h.studentName,
                  h.className,
                  h.record.status,
                ])
              )
            }
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportToPDF(
                `attendance-${date}`,
                'Student Attendance Report',
                `Date: ${date} · Rate: ${summary.rate}%`,
                ['Date', 'Adm No.', 'Student', 'Class', 'Status'],
                history.map((h) => [
                  h.record.date,
                  h.admissionNumber,
                  h.studentName,
                  h.className,
                  h.record.status,
                ])
              )
            }
          >
            Export PDF
          </Button>
        </div>
      </div>

      {/* Filters & Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </CardContent>
        </Card>
        {!isRestricted && (
          <>
            <Card>
              <CardContent className="p-3">
                <Label>Class</Label>
                <SelectInput
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setStreamId('');
                  }}
                >
                  <option value="">All Classes</option>
                  {meta.classes.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </SelectInput>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <Label>Stream</Label>
                <SelectInput value={streamId} onChange={(e) => setStreamId(e.target.value)}>
                  <option value="">All Streams</option>
                  {classStreams.map((st: any) => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </SelectInput>
              </CardContent>
            </Card>
          </>
        )}
        <Card>
          <CardContent className="p-3">
            <Label>Status Filter</Label>
            <SelectInput value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="ALL">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
              <option value="LATE">Late</option>
              <option value="EXCUSED">Excused</option>
            </SelectInput>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex flex-col justify-center">
            <span className="text-xs text-slate-500">Attendance Rate</span>
            <span className="text-xl font-mono font-bold tabular-nums text-[#0F2557] dark:text-blue-400">
              {summary.rate}%
            </span>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={canManage && !isRestricted ? 'rollcall' : 'history'}>
        <TabsList>
          {canManage && !isRestricted && <TabsTrigger value="rollcall">Daily Roll Call</TabsTrigger>}
          <TabsTrigger value="history">Records & Absentees</TabsTrigger>
          {hasPermission('staff.view') && (
            <TabsTrigger value="staff" onClick={loadStaffAttendance}>
              Staff Attendance
            </TabsTrigger>
          )}
        </TabsList>

        {canManage && !isRestricted && (
          <TabsContent value="rollcall">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle>Mark Student Roll Call ({date})</CardTitle>
                  <CardDescription>All changes are logged with timestamps and actor identity</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Optional correction reason..."
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    className="w-56 h-8 text-xs"
                  />
                  <Button size="sm" onClick={saveStudentRollCall}>
                    <Save className="h-4 w-4" />
                    Save Roll Call
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Adm No.</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Stream</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <tbody>
                    {rollCallStudents.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.admissionNumber}</TableCell>
                        <TableCell className="font-medium">
                          {s.firstName} {s.lastName}
                        </TableCell>
                        <TableCell className="text-xs">{s.streamName || '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            {(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => setStatuses((prev) => ({ ...prev, [s.id]: st }))}
                                className={`px-2.5 py-1 rounded text-xs font-medium border cursor-pointer transition-colors ${
                                  statuses[s.id] === st
                                    ? st === 'PRESENT'
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : st === 'ABSENT'
                                      ? 'bg-red-600 text-white border-red-600'
                                      : st === 'LATE'
                                      ? 'bg-amber-600 text-white border-amber-600'
                                      : 'bg-blue-600 text-white border-blue-600'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </DataTable>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Historical Attendance Log ({history.length})</CardTitle>
              <CardDescription>
                Present: {summary.present} · Late: {summary.late} · Absent: {summary.absent} · Excused: {summary.excused}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Adm No.</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {history.map((h) => (
                    <TableRow key={h.record.id}>
                      <TableCell className="font-mono text-xs">{h.record.date}</TableCell>
                      <TableCell className="font-mono text-xs">{h.admissionNumber}</TableCell>
                      <TableCell className="font-medium">{h.studentName}</TableCell>
                      <TableCell>
                        {h.className} {h.streamName || ''}
                      </TableCell>
                      <TableCell>
                        <StatusText
                          tone={
                            h.record.status === 'PRESENT'
                              ? 'success'
                              : h.record.status === 'ABSENT'
                              ? 'danger'
                              : h.record.status === 'LATE'
                              ? 'warning'
                              : 'info'
                          }
                          label={h.record.status}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {h.record.correctionReason || h.record.remarks || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        </TabsContent>

        {hasPermission('staff.view') && (
          <TabsContent value="staff">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Daily Staff Attendance ({date})</CardTitle>
                  <CardDescription>Teaching and support staff check-in status</CardDescription>
                </div>
                {canManageStaff && (
                  <Button size="sm" onClick={saveStaffRollCall}>
                    <Save className="h-4 w-4" />
                    Save Staff Attendance
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {canManageStaff && (
                  <DataTable>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Emp No.</TableHead>
                        <TableHead>Staff Name</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <tbody>
                      {staffList.map((st) => (
                        <TableRow key={st.id}>
                          <TableCell className="font-mono text-xs">{st.employeeNumber}</TableCell>
                          <TableCell className="font-medium">
                            {st.firstName} {st.lastName}
                          </TableCell>
                          <TableCell className="text-xs">{st.department}</TableCell>
                          <TableCell>
                            <SelectInput
                              className="w-36 h-8 text-xs"
                              value={staffStatuses[st.id] || 'PRESENT'}
                              onChange={(e) =>
                                setStaffStatuses((prev) => ({
                                  ...prev,
                                  [st.id]: e.target.value as any,
                                }))
                              }
                            >
                              <option value="PRESENT">PRESENT</option>
                              <option value="LATE">LATE</option>
                              <option value="ABSENT">ABSENT</option>
                              <option value="EXCUSED">EXCUSED</option>
                            </SelectInput>
                          </TableCell>
                        </TableRow>
                      ))}
                    </tbody>
                  </DataTable>
                )}

                {staffHistory.length > 0 && (
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-semibold mb-2">Recorded Staff Log ({date})</p>
                    <DataTable>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Emp No.</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Check-In</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <tbody>
                        {staffHistory.map((sh) => (
                          <TableRow key={sh.record.id}>
                            <TableCell className="font-mono text-xs">{sh.employeeNumber}</TableCell>
                            <TableCell>{sh.staffName}</TableCell>
                            <TableCell className="font-mono text-xs">{sh.record.checkInTime || '—'}</TableCell>
                            <TableCell>
                              <StatusText tone={sh.record.status === 'PRESENT' ? 'success' : 'warning'} label={sh.record.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </tbody>
                    </DataTable>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
