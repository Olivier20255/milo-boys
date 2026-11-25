import React, { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, Plus, Search, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { exportToExcel } from '../lib/exporters';
import { formatKES } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input, Label, SelectInput } from '../components/ui/input';
import { DataTable, StatusText, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export const StaffModule: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('staff.manage');
  const canSeeConfidential = hasPermission('staff.confidential');

  const [staffList, setStaffList] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);

  const [form, setForm] = useState({
    employeeNumber: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    staffType: 'TEACHING',
    department: 'Sciences',
    designation: 'Subject Teacher',
    qualifications: '',
    tscNumber: '',
    nationalId: '',
    salaryAmount: '',
    dateJoined: new Date().toISOString().slice(0, 10),
  });

  const loadStaff = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (filterType !== 'ALL') params.set('staffType', filterType);
      const rows = await apiFetch<any[]>(`/api/staff?${params.toString()}`);
      setStaffList(rows);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load staff records.');
    }
  }, [search, filterType]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/staff', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          tscNumber: form.tscNumber || null,
          nationalId: form.nationalId || null,
          salaryAmount: form.salaryAmount ? Number(form.salaryAmount) : null,
        }),
      });
      toast.success('Staff member registered.');
      setCreateOpen(false);
      loadStaff();
    } catch (err: any) {
      toast.error(err?.message || 'Registration failed.');
    }
  };

  const handleDocUpload = async (staffId: number, file: File) => {
    const fd = new FormData();
    fd.append('document', file);
    fd.append('docName', file.name);
    try {
      const docs = await apiFetch(`/api/staff/${staffId}/documents`, { method: 'POST', body: fd });
      toast.success('Staff document uploaded.');
      setSelectedStaff((prev: any) => (prev ? { ...prev, documents: docs } : prev));
      loadStaff();
    } catch (err: any) {
      toast.error(err?.message || 'Document upload failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff & Human Resources</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Teaching & non-teaching personnel, qualifications, and restricted confidential HR records
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              exportToExcel(
                'milo-boys-staff',
                'Staff',
                staffList.map((s) => ({
                  EmployeeNo: s.employeeNumber,
                  Name: `${s.firstName} ${s.lastName}`,
                  Type: s.staffType,
                  Department: s.department,
                  Designation: s.designation,
                  Qualifications: s.qualifications,
                  Status: s.employmentStatus,
                }))
              );
              toast.success('Staff directory exported.');
            }}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Register Staff
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by employee ID, name, or department..."
              className="pl-9"
            />
          </div>
          <SelectInput value={filterType} onChange={(e) => setFilterType(e.target.value)} className="sm:w-48">
            <option value="ALL">All Staff Categories</option>
            <option value="TEACHING">Teaching Staff</option>
            <option value="NON_TEACHING">Non-Teaching Staff</option>
            <option value="ADMINISTRATION">Administration</option>
          </SelectInput>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personnel Directory ({staffList.length})</CardTitle>
          <CardDescription>Click a staff member to inspect qualifications and employment documents</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable>
            <TableHeader>
              <TableRow>
                <TableHead>Emp ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Profile</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              {staffList.map((st) => (
                <TableRow key={st.id}>
                  <TableCell className="font-mono text-xs font-semibold">{st.employeeNumber}</TableCell>
                  <TableCell className="font-medium">
                    {st.firstName} {st.lastName}
                  </TableCell>
                  <TableCell>{st.department}</TableCell>
                  <TableCell className="text-xs">{st.designation}</TableCell>
                  <TableCell>
                    <div className="text-xs">{st.email}</div>
                    <div className="text-xs text-slate-400 font-mono">{st.phone}</div>
                  </TableCell>
                  <TableCell>
                    <StatusText tone={st.employmentStatus === 'ACTIVE' ? 'success' : 'warning'} label={st.employmentStatus} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setSelectedStaff(st)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </DataTable>
        </CardContent>
      </Card>

      {/* Register Staff Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Register Staff Member</DialogTitle>
            <DialogDescription>Assign unique Employee ID and department details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRegister} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Employee ID *</Label>
                <Input required placeholder="MBS-STF-015" value={form.employeeNumber} onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })} />
              </div>
              <div>
                <Label>First Name *</Label>
                <Input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Email *</Label>
                <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Phone *</Label>
                <Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label>Date Joined *</Label>
                <Input type="date" required value={form.dateJoined} onChange={(e) => setForm({ ...form, dateJoined: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Staff Category *</Label>
                <SelectInput value={form.staffType} onChange={(e) => setForm({ ...form, staffType: e.target.value })}>
                  <option value="TEACHING">Teaching</option>
                  <option value="NON_TEACHING">Non-Teaching</option>
                  <option value="ADMINISTRATION">Administration</option>
                </SelectInput>
              </div>
              <div>
                <Label>Department *</Label>
                <Input required value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div>
                <Label>Designation *</Label>
                <Input required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Professional Qualifications *</Label>
              <Input required placeholder="B.Ed Science (Mathematics/Physics)" value={form.qualifications} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} />
            </div>
            {canSeeConfidential && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                <div>
                  <Label>TSC Number</Label>
                  <Input value={form.tscNumber} onChange={(e) => setForm({ ...form, tscNumber: e.target.value })} />
                </div>
                <div>
                  <Label>National ID (Confidential)</Label>
                  <Input value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
                </div>
                <div>
                  <Label>Monthly Salary (KES)</Label>
                  <Input type="number" value={form.salaryAmount} onChange={(e) => setForm({ ...form, salaryAmount: e.target.value })} />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit">Register Staff</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Staff Profile Dialog */}
      <Dialog open={Boolean(selectedStaff)} onOpenChange={(o) => !o && setSelectedStaff(null)}>
        <DialogContent className="max-w-xl">
          {selectedStaff && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>
                  {selectedStaff.firstName} {selectedStaff.lastName}
                </DialogTitle>
                <DialogDescription>
                  {selectedStaff.employeeNumber} · {selectedStaff.designation} ({selectedStaff.department})
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 p-3 rounded">
                <div>
                  <span className="text-slate-500">Email</span>
                  <p className="font-medium">{selectedStaff.email}</p>
                </div>
                <div>
                  <span className="text-slate-500">Phone</span>
                  <p className="font-mono">{selectedStaff.phone}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">Qualifications</span>
                  <p className="font-medium">{selectedStaff.qualifications}</p>
                </div>
                <div>
                  <span className="text-slate-500">TSC Number</span>
                  <p className="font-mono">{selectedStaff.tscNumber || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-slate-500">Date Joined</span>
                  <p className="font-mono">{selectedStaff.dateJoined}</p>
                </div>
              </div>

              {canSeeConfidential && (
                <div className="p-3 rounded border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                  <p className="font-semibold">Confidential HR & Payroll Record</p>
                  <div className="flex justify-between">
                    <span>National ID: <span className="font-mono">{selectedStaff.nationalId || '—'}</span></span>
                    <span>Gross Salary: <span className="font-mono font-bold">{formatKES(selectedStaff.salaryAmount)}</span></span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="font-medium">Documents ({selectedStaff.documents?.length || 0})</span>
                    {canManage && (
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                        <Upload className="h-3.5 w-3.5" />
                        Upload PDF/Image
                        <input
                          type="file"
                          accept=".pdf,image/jpeg,image/png"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) handleDocUpload(selectedStaff.id, e.target.files[0]);
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {(selectedStaff.documents || []).map((doc: any, idx: number) => (
                    <a
                      key={idx}
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-blue-600 hover:underline font-mono"
                    >
                      {doc.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
