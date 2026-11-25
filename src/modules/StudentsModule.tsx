import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Plus, Printer, Search, Upload, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { exportToExcel, exportToPDF } from '../lib/exporters';
import { formatDateShort, formatKES } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input, Label, SelectInput, Textarea } from '../components/ui/input';
import { DataTable, StatusText, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

interface StudentRecord {
  id: number;
  admissionNumber: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  admissionDate: string;
  kcpeIndex?: string | null;
  kcpeScore?: number | null;
  photoUrl?: string | null;
  currentClassId: number | null;
  currentStreamId: number | null;
  className?: string | null;
  streamName?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  bloodGroup?: string | null;
  allergies?: string | null;
  medicalConditions?: string | null;
  medicalNotes?: string | null;
  residenceAddress?: string | null;
  county?: string | null;
  status: 'ACTIVE' | 'TRANSFERRED' | 'GRADUATED' | 'SUSPENDED' | 'WITHDRAWN';
  statusReason?: string | null;
}

interface AcademicMeta {
  classes: Array<{ id: number; name: string }>;
  streams: Array<{ id: number; classId: number; name: string }>;
}

export const StudentsModule: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('students.manage');
  const canSeeMedical = hasPermission('students.medical');

  const [studentsList, setStudentsList] = useState<StudentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterClassId, setFilterClassId] = useState('');
  const [filterStatus, setFilterStatus] = useState('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<AcademicMeta>({ classes: [], streams: [] });

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteClassId, setPromoteClassId] = useState('');
  const [promoteGraduate, setPromoteGraduate] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);
  const [printMode, setPrintMode] = useState<'none' | 'admission' | 'idcard'>('none');

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<StudentRecord | null>(null);
  const [newStatus, setNewStatus] = useState<string>('TRANSFERRED');
  const [statusReason, setStatusReason] = useState('');

  // Form state
  const [form, setForm] = useState({
    admissionNumber: '',
    firstName: '',
    middleName: '',
    lastName: '',
    dateOfBirth: '2011-05-15',
    gender: 'Male',
    admissionDate: new Date().toISOString().slice(0, 10),
    kcpeIndex: '',
    kcpeScore: '',
    currentClassId: '',
    currentStreamId: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: 'Father',
    bloodGroup: 'O+',
    allergies: '',
    medicalConditions: '',
    medicalNotes: '',
    residenceAddress: '',
    county: 'Nairobi',
    guardianFullName: '',
    guardianRelationship: 'Father',
    guardianPhone: '',
    guardianEmail: '',
    guardianOccupation: '',
  });

  const loadMeta = useCallback(async () => {
    try {
      const ov = await apiFetch<AcademicMeta>('/api/academics/overview');
      setMeta({ classes: ov.classes, streams: ov.streams });
    } catch {
      // ignore if restricted
    }
  }, []);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
      });
      if (search.trim()) params.set('search', search.trim());
      if (filterClassId) params.set('classId', filterClassId);
      if (filterStatus) params.set('status', filterStatus);

      const res = await apiFetch<{ items: StudentRecord[]; total: number }>(
        `/api/students?${params.toString()}`
      );
      setStudentsList(res.items);
      setTotal(res.total);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load students.');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterClassId, filterStatus]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/students', {
        method: 'POST',
        body: JSON.stringify({
          admissionNumber: form.admissionNumber,
          firstName: form.firstName,
          middleName: form.middleName || null,
          lastName: form.lastName,
          dateOfBirth: form.dateOfBirth,
          gender: form.gender,
          admissionDate: form.admissionDate,
          kcpeIndex: form.kcpeIndex || null,
          kcpeScore: form.kcpeScore ? Number(form.kcpeScore) : null,
          currentClassId: Number(form.currentClassId),
          currentStreamId: form.currentStreamId ? Number(form.currentStreamId) : null,
          emergencyContactName: form.emergencyContactName || form.guardianFullName,
          emergencyContactPhone: form.emergencyContactPhone || form.guardianPhone,
          emergencyContactRelation: form.emergencyContactRelation || form.guardianRelationship,
          bloodGroup: form.bloodGroup || null,
          allergies: form.allergies || null,
          medicalConditions: form.medicalConditions || null,
          medicalNotes: form.medicalNotes || null,
          residenceAddress: form.residenceAddress || null,
          county: form.county || null,
          guardian: {
            fullName: form.guardianFullName,
            relationship: form.guardianRelationship,
            phone: form.guardianPhone,
            email: form.guardianEmail || null,
            occupation: form.guardianOccupation || null,
          },
        }),
      });
      toast.success('Student registered successfully.');
      setCreateOpen(false);
      loadStudents();
    } catch (err: any) {
      toast.error(err?.message || 'Registration failed.');
    }
  };

  const openProfile = async (id: number) => {
    try {
      const data = await apiFetch(`/api/students/${id}`);
      setDetailData(data);
      setPrintMode('none');
      setDetailOpen(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load student profile.');
    }
  };

  const handlePhotoUpload = async (studentId: number, file: File) => {
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const res = await apiFetch<{ photoUrl: string }>(`/api/students/${studentId}/photo`, {
        method: 'POST',
        body: fd,
      });
      toast.success('Student photograph updated.');
      setDetailData((prev: any) => (prev ? { ...prev, photoUrl: res.photoUrl } : prev));
      loadStudents();
    } catch (err: any) {
      toast.error(err?.message || 'Photo upload failed.');
    }
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusTarget) return;
    try {
      await apiFetch(`/api/students/${statusTarget.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus, reason: statusReason }),
      });
      toast.success(`Student status updated to ${newStatus}.`);
      setStatusModalOpen(false);
      setStatusReason('');
      loadStudents();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update status.');
    }
  };

  const handleBulkPromote = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/students/promote', {
        method: 'POST',
        body: JSON.stringify({
          studentIds: selectedIds,
          targetClassId: promoteGraduate ? null : Number(promoteClassId),
          graduate: promoteGraduate,
        }),
      });
      toast.success(`Updated ${selectedIds.length} student(s).`);
      setSelectedIds([]);
      setPromoteOpen(false);
      loadStudents();
    } catch (err: any) {
      toast.error(err?.message || 'Bulk promotion failed.');
    }
  };

  const handleExportExcel = () => {
    exportToExcel(
      'milo-boys-students',
      'Students',
      studentsList.map((s) => ({
        AdmissionNo: s.admissionNumber,
        Name: `${s.firstName} ${s.lastName}`,
        Class: s.className || '',
        Stream: s.streamName || '',
        Guardian: s.guardianName || '',
        GuardianPhone: s.guardianPhone || '',
        County: s.county || '',
        Status: s.status,
      }))
    );
    toast.success('Excel directory downloaded.');
  };

  const handleExportPDF = () => {
    exportToPDF(
      'milo-boys-students',
      'Student Directory Report',
      `Filter: ${filterStatus}`,
      ['Adm No.', 'Full Name', 'Class', 'Stream', 'Guardian', 'Phone', 'Status'],
      studentsList.map((s) => [
        s.admissionNumber,
        `${s.firstName} ${s.lastName}`,
        s.className || '—',
        s.streamName || '—',
        s.guardianName || '—',
        s.guardianPhone || '—',
        s.status,
      ])
    );
    toast.success('PDF directory downloaded.');
  };

  const availableStreams = meta.streams.filter(
    (st) => !form.currentClassId || st.classId === Number(form.currentClassId)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Student Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Admissions, enrollment records, guardian contacts, ID cards, and progression tracking
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
          {canManage && selectedIds.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setPromoteOpen(true)}>
              Promote / Graduate ({selectedIds.length})
            </Button>
          )}
          {canManage && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Register Student
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="no-print">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by admission number, name, or county..."
              className="pl-9"
            />
          </div>
          <SelectInput
            value={filterClassId}
            onChange={(e) => {
              setFilterClassId(e.target.value);
              setPage(1);
            }}
            className="md:w-44"
          >
            <option value="">All Classes</option>
            {meta.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
            className="md:w-44"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="TRANSFERRED">Transferred</option>
            <option value="GRADUATED">Graduated</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="WITHDRAWN">Withdrawn</option>
          </SelectInput>
        </CardContent>
      </Card>

      {/* Directory Table */}
      <Card className="no-print">
        <CardHeader className="pb-2">
          <CardTitle>Student Directory ({total})</CardTitle>
          <CardDescription>Click a student row to open full academic profile, ID card, and admission form</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="h-10 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : studentsList.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm text-slate-500">No students match the current filter.</p>
              {canManage && (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  Register First Student
                </Button>
              )}
            </div>
          ) : (
            <DataTable>
              <TableHeader>
                <TableRow>
                  {canManage && <TableHead className="w-8" />}
                  <TableHead>Adm No.</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Class & Stream</TableHead>
                  <TableHead>Guardian</TableHead>
                  <TableHead>County</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <tbody>
                {studentsList.map((s) => (
                  <TableRow key={s.id}>
                    {canManage && (
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(s.id)}
                          onChange={(e) =>
                            setSelectedIds((prev) =>
                              e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                            )
                          }
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs font-semibold">{s.admissionNumber}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => openProfile(s.id)}
                        className="font-medium text-[#0F2557] dark:text-blue-400 hover:underline text-left cursor-pointer"
                      >
                        {s.firstName} {s.middleName ? `${s.middleName} ` : ''}
                        {s.lastName}
                      </button>
                    </TableCell>
                    <TableCell>
                      {s.className || '—'} {s.streamName ? `· ${s.streamName}` : ''}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium">{s.guardianName || s.emergencyContactName}</div>
                      <div className="text-xs text-slate-400 font-mono">
                        {s.guardianPhone || s.emergencyContactPhone}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{s.county || '—'}</TableCell>
                    <TableCell>
                      <StatusText
                        tone={
                          s.status === 'ACTIVE'
                            ? 'success'
                            : s.status === 'GRADUATED'
                            ? 'info'
                            : s.status === 'SUSPENDED'
                            ? 'danger'
                            : 'warning'
                        }
                        label={s.status}
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      <Button variant="outline" size="sm" onClick={() => openProfile(s.id)}>
                        Profile
                      </Button>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setStatusTarget(s);
                            setNewStatus(s.status === 'ACTIVE' ? 'TRANSFERRED' : 'ACTIVE');
                            setStatusModalOpen(true);
                          }}
                        >
                          <UserCog className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </DataTable>
          )}

          {total > 20 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
              <span className="text-xs text-slate-500">
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / 20)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Register Student Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Register New Student</DialogTitle>
            <DialogDescription>
              Unique admission numbers are enforced automatically. Current term fees are billed upon enrollment.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Admission Number *</Label>
                <Input
                  required
                  placeholder="MBS/2026/050"
                  value={form.admissionNumber}
                  onChange={(e) => setForm({ ...form, admissionNumber: e.target.value })}
                />
              </div>
              <div>
                <Label>Admission Date *</Label>
                <Input
                  type="date"
                  required
                  value={form.admissionDate}
                  onChange={(e) => setForm({ ...form, admissionDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Date of Birth *</Label>
                <Input
                  type="date"
                  required
                  value={form.dateOfBirth}
                  onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>First Name *</Label>
                <Input
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </div>
              <div>
                <Label>Middle Name</Label>
                <Input
                  value={form.middleName}
                  onChange={(e) => setForm({ ...form, middleName: e.target.value })}
                />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <Label>Class *</Label>
                <SelectInput
                  required
                  value={form.currentClassId}
                  onChange={(e) => setForm({ ...form, currentClassId: e.target.value, currentStreamId: '' })}
                >
                  <option value="">Select Class</option>
                  {meta.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectInput>
              </div>
              <div>
                <Label>Stream</Label>
                <SelectInput
                  value={form.currentStreamId}
                  onChange={(e) => setForm({ ...form, currentStreamId: e.target.value })}
                >
                  <option value="">Select Stream</option>
                  {availableStreams.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </SelectInput>
              </div>
              <div>
                <Label>KCPE Score</Label>
                <Input
                  type="number"
                  min={0}
                  max={500}
                  value={form.kcpeScore}
                  onChange={(e) => setForm({ ...form, kcpeScore: e.target.value })}
                />
              </div>
              <div>
                <Label>County</Label>
                <Input
                  value={form.county}
                  onChange={(e) => setForm({ ...form, county: e.target.value })}
                />
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Parent / Guardian & Emergency Contact
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Guardian Full Name *</Label>
                  <Input
                    required
                    value={form.guardianFullName}
                    onChange={(e) =>
                      setForm({ ...form, guardianFullName: e.target.value, emergencyContactName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Relationship *</Label>
                  <SelectInput
                    value={form.guardianRelationship}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        guardianRelationship: e.target.value,
                        emergencyContactRelation: e.target.value,
                      })
                    }
                  >
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Guardian">Guardian</option>
                  </SelectInput>
                </div>
                <div>
                  <Label>Phone Number *</Label>
                  <Input
                    required
                    placeholder="+254 7XX XXX XXX"
                    value={form.guardianPhone}
                    onChange={(e) =>
                      setForm({ ...form, guardianPhone: e.target.value, emergencyContactPhone: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            {canSeeMedical && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Restricted Medical Information
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label>Blood Group</Label>
                    <Input
                      value={form.bloodGroup}
                      onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Allergies</Label>
                    <Input
                      value={form.allergies}
                      onChange={(e) => setForm({ ...form, allergies: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Medical Conditions</Label>
                    <Input
                      value={form.medicalConditions}
                      onChange={(e) => setForm({ ...form, medicalConditions: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Complete Registration</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Student Profile / Printable Admission Form & ID Card Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl">
          {detailData && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 no-print border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  {detailData.photoUrl ? (
                    <img
                      src={detailData.photoUrl}
                      alt={detailData.firstName}
                      className="h-14 w-14 rounded-md object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-md bg-[#0F2557] text-white flex items-center justify-center font-bold text-lg">
                      {detailData.firstName[0]}
                      {detailData.lastName[0]}
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold">
                      {detailData.firstName} {detailData.lastName}
                    </h2>
                    <p className="text-xs text-slate-500 font-mono">
                      {detailData.admissionNumber} · {detailData.className} {detailData.streamName || ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canManage && (
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                      <Upload className="h-3.5 w-3.5" />
                      Upload Photo
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) handlePhotoUpload(detailData.id, e.target.files[0]);
                        }}
                      />
                    </label>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPrintMode('idcard');
                      setTimeout(() => window.print(), 100);
                    }}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print ID Card
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPrintMode('admission');
                      setTimeout(() => window.print(), 100);
                    }}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Admission Form
                  </Button>
                </div>
              </div>

              {printMode === 'idcard' ? (
                <div className="mx-auto w-[340px] rounded-lg border-2 border-[#0F2557] overflow-hidden bg-white text-slate-900">
                  <div className="bg-[#0F2557] text-white px-4 py-3 flex items-center gap-2.5">
                    <img
                      src="/src/assets/images/milo_boys_crest_1795596068996.jpg"
                      alt="Crest"
                      className="h-9 w-9 rounded bg-white p-0.5 object-cover"
                    />
                    <div>
                      <div className="text-xs font-bold tracking-wide">MILO BOYS SCHOOL</div>
                      <div className="text-[10px] text-blue-200">OFFICIAL STUDENT IDENTITY CARD</div>
                    </div>
                  </div>
                  <div className="p-4 flex gap-3 items-center">
                    {detailData.photoUrl ? (
                      <img src={detailData.photoUrl} alt="Student" className="h-20 w-16 object-cover rounded border" />
                    ) : (
                      <div className="h-20 w-16 rounded border bg-slate-100 flex items-center justify-center font-bold text-[#0F2557]">
                        {detailData.firstName[0]}
                        {detailData.lastName[0]}
                      </div>
                    )}
                    <div className="space-y-1 text-xs">
                      <p className="font-bold text-sm">
                        {detailData.firstName} {detailData.lastName}
                      </p>
                      <p className="font-mono">Adm: {detailData.admissionNumber}</p>
                      <p>
                        Class: {detailData.className} {detailData.streamName}
                      </p>
                      <p>DOB: {detailData.dateOfBirth}</p>
                    </div>
                  </div>
                  <div className="bg-slate-100 px-4 py-2 text-[10px] text-slate-600 flex justify-between">
                    <span>Emergency: {detailData.emergencyContactPhone}</span>
                    <span>Status: {detailData.status}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-md bg-slate-50 dark:bg-slate-800/50">
                    <div>
                      <span className="text-xs text-slate-500">Date of Birth</span>
                      <p className="font-mono font-medium">{detailData.dateOfBirth}</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Admission Date</span>
                      <p className="font-mono font-medium">{detailData.admissionDate}</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">KCPE Score</span>
                      <p className="font-mono font-medium">{detailData.kcpeScore || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Guardian</span>
                      <p className="font-medium">
                        {detailData.guardian?.fullName} ({detailData.guardian?.relationship})
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Guardian Phone</span>
                      <p className="font-mono font-medium">{detailData.guardian?.phone}</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">County</span>
                      <p className="font-medium">{detailData.county || '—'}</p>
                    </div>
                  </div>

                  {canSeeMedical && (
                    <div className="p-3 rounded-md border border-slate-200 dark:border-slate-800 space-y-1">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Medical Record (Restricted Access)
                      </p>
                      <p className="text-xs">
                        Blood Group: <span className="font-mono">{detailData.bloodGroup || 'Not recorded'}</span> ·
                        Allergies: {detailData.allergies || 'None'} · Conditions: {detailData.medicalConditions || 'None'}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-md border border-slate-200 dark:border-slate-800">
                      <p className="text-xs font-semibold mb-1">Attendance Summary</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                        Present: {detailData.attendanceSummary?.present || 0} · Late:{' '}
                        {detailData.attendanceSummary?.late || 0} · Absent: {detailData.attendanceSummary?.absent || 0}
                      </p>
                    </div>
                    <div className="p-3 rounded-md border border-slate-200 dark:border-slate-800">
                      <p className="text-xs font-semibold mb-1">Current Term Fee Balance</p>
                      <p className="text-sm font-mono font-bold">
                        {formatKES(detailData.feeSummary?.[0]?.balanceAmount || 0)}
                      </p>
                    </div>
                  </div>

                  {detailData.publishedResults?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-2">Published Examination History</p>
                      <DataTable>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Examination</TableHead>
                            <TableHead className="text-right">Mean Score</TableHead>
                            <TableHead>Mean Grade</TableHead>
                            <TableHead className="text-right">Rank</TableHead>
                          </TableRow>
                        </TableHeader>
                        <tbody>
                          {detailData.publishedResults.map((r: any) => (
                            <TableRow key={r.id}>
                              <TableCell>{r.examinationName}</TableCell>
                              <TableCell className="text-right font-mono">{r.meanScore}%</TableCell>
                              <TableCell className="font-mono font-bold">{r.meanGrade}</TableCell>
                              <TableCell className="text-right font-mono">{r.classRank || '—'}</TableCell>
                            </TableRow>
                          ))}
                        </tbody>
                      </DataTable>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Status Update Modal */}
      <Dialog open={statusModalOpen} onOpenChange={setStatusModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Student Status</DialogTitle>
            <DialogDescription>
              Change status for {statusTarget?.firstName} {statusTarget?.lastName} ({statusTarget?.admissionNumber}).
              This action is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStatusSubmit} className="space-y-4">
            <div>
              <Label>New Status</Label>
              <SelectInput value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                <option value="ACTIVE">Active</option>
                <option value="TRANSFERRED">Transferred</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="WITHDRAWN">Withdrawn</option>
                <option value="GRADUATED">Graduated</option>
              </SelectInput>
            </div>
            <div>
              <Label>Official Reason *</Label>
              <Textarea
                required
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Enter transfer school, disciplinary reference, or withdrawal reason..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStatusModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Confirm Status Change</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Promotion Modal */}
      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Promote or Graduate Students</DialogTitle>
            <DialogDescription>
              Apply progression to {selectedIds.length} selected student(s).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBulkPromote} className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={promoteGraduate}
                onChange={(e) => setPromoteGraduate(e.target.checked)}
              />
              Mark selected students as Graduated (Form 4 completion)
            </label>
            {!promoteGraduate && (
              <div>
                <Label>Promote To Class *</Label>
                <SelectInput
                  required={!promoteGraduate}
                  value={promoteClassId}
                  onChange={(e) => setPromoteClassId(e.target.value)}
                >
                  <option value="">Select Target Class</option>
                  {meta.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectInput>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPromoteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Apply Progression</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
