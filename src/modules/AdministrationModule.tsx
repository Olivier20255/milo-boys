import React, { useCallback, useEffect, useState } from 'react';
import { DatabaseBackup, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { formatDateShort } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input, Label, SelectInput } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { DataTable, StatusText, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export const AdministrationModule: React.FC = () => {
  const { schoolSettings, refreshProfile, hasPermission } = useAuth();
  const canUsers = hasPermission('admin.users');
  const canSettings = hasPermission('admin.settings');
  const canAudit = hasPermission('admin.audit');

  const [usersData, setUsersData] = useState<any>({ users: [], roles: [], permissions: [], rolePermissions: [] });
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

  const [newUserOpen, setNewUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    email: '',
    fullName: '',
    roleCode: 'TEACHER',
    linkedStudentId: '',
    linkedStaffId: '',
  });

  const [settingsForm, setSettingsForm] = useState({
    schoolName: schoolSettings?.schoolName || 'Milo Boys School',
    motto: schoolSettings?.motto || '',
    code: schoolSettings?.code || '',
    email: schoolSettings?.email || '',
    phone: schoolSettings?.phone || '',
    address: schoolSettings?.address || '',
    county: schoolSettings?.county || '',
    rankStudentsInReports: schoolSettings?.rankStudentsInReports ?? true,
    mpesaShortcode: schoolSettings?.mpesaShortcode || '',
    mpesaEnv: schoolSettings?.mpesaEnv || 'sandbox',
  });

  useEffect(() => {
    if (schoolSettings) {
      setSettingsForm({
        schoolName: schoolSettings.schoolName,
        motto: schoolSettings.motto,
        code: schoolSettings.code,
        email: schoolSettings.email,
        phone: schoolSettings.phone,
        address: schoolSettings.address,
        county: schoolSettings.county,
        rankStudentsInReports: schoolSettings.rankStudentsInReports,
        mpesaShortcode: schoolSettings.mpesaShortcode || '',
        mpesaEnv: schoolSettings.mpesaEnv || 'sandbox',
      });
    }
  }, [schoolSettings]);

  const loadAdmin = useCallback(async () => {
    try {
      if (canUsers) {
        const uRes = await apiFetch('/api/admin/users');
        setUsersData(uRes);
        const [stus, stfs] = await Promise.all([
          apiFetch<{ items: any[] }>('/api/students?pageSize=100').catch(() => ({ items: [] })),
          apiFetch<any[]>('/api/staff').catch(() => []),
        ]);
        setStudentsList(stus.items || []);
        setStaffList(stfs || []);
      }
      if (canAudit) {
        const logs = await apiFetch<any[]>('/api/admin/audit-logs');
        setAuditLogs(logs);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load admin console.');
    }
  }, [canUsers, canAudit]);

  useEffect(() => {
    loadAdmin();
  }, [loadAdmin]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: userForm.email,
          fullName: userForm.fullName,
          roleCode: userForm.roleCode,
          linkedStudentId: userForm.linkedStudentId ? Number(userForm.linkedStudentId) : null,
          linkedStaffId: userForm.linkedStaffId ? Number(userForm.linkedStaffId) : null,
        }),
      });
      toast.success('User provisioned. They will receive this role automatically on Google Sign-In.');
      setNewUserOpen(false);
      setUserForm({ email: '', fullName: '', roleCode: 'TEACHER', linkedStudentId: '', linkedStaffId: '' });
      loadAdmin();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to provision user.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(settingsForm),
      });
      toast.success('School settings updated.');
      refreshProfile();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update settings.');
    }
  };

  const handleBackupDownload = async () => {
    try {
      const data = await apiFetch('/api/admin/backup');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `milo-boys-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Database JSON backup downloaded.');
      loadAdmin();
    } catch (err: any) {
      toast.error(err?.message || 'Backup export failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Governance & Security</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Role-based access control, school configuration, immutable audit logs, and backups
          </p>
        </div>
        {canAudit && (
          <Button variant="outline" size="sm" onClick={handleBackupDownload}>
            <DatabaseBackup className="h-4 w-4" />
            Export Database Backup
          </Button>
        )}
      </div>

      <Tabs defaultValue={canUsers ? 'users' : canSettings ? 'settings' : 'audit'}>
        <TabsList>
          {canUsers && <TabsTrigger value="users">Users & Role Assignment</TabsTrigger>}
          {canUsers && <TabsTrigger value="matrix">RBAC Permissions</TabsTrigger>}
          {canSettings && <TabsTrigger value="settings">School & Integrations</TabsTrigger>}
          {canAudit && <TabsTrigger value="audit">Audit Logs</TabsTrigger>}
        </TabsList>

        {canUsers && (
          <TabsContent value="users">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>System User Accounts ({usersData.users.length})</CardTitle>
                  <CardDescription>
                    Pre-provision staff, parent, or student emails with their assigned institutional role
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setNewUserOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Provision User
                </Button>
              </CardHeader>
              <CardContent>
                <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Assigned Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Access Toggle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <tbody>
                    {usersData.users.map((u: any) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.fullName}</TableCell>
                        <TableCell className="font-mono text-xs">{u.email}</TableCell>
                        <TableCell>
                          <SelectInput
                            className="h-8 text-xs w-44"
                            value={u.roleId}
                            onChange={async (e) => {
                              await apiFetch(`/api/admin/users/${u.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ roleId: Number(e.target.value) }),
                              });
                              toast.success('Role updated.');
                              loadAdmin();
                            }}
                          >
                            {usersData.roles.map((r: any) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </SelectInput>
                        </TableCell>
                        <TableCell>
                          <StatusText tone={u.isActive ? 'success' : 'danger'} label={u.isActive ? 'ACTIVE' : 'DISABLED'} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await apiFetch(`/api/admin/users/${u.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ isActive: !u.isActive }),
                              });
                              toast.success('Account status updated.');
                              loadAdmin();
                            }}
                          >
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </DataTable>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canUsers && (
          <TabsContent value="matrix">
            <Card>
              <CardHeader>
                <CardTitle>Institutional RBAC Matrix</CardTitle>
                <CardDescription>Server-enforced permissions across the 7 system roles</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Permission</TableHead>
                      <TableHead>Module</TableHead>
                      {usersData.roles.map((r: any) => (
                        <TableHead key={r.id} className="text-center text-[11px]">
                          {r.code.replace('_', ' ')}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <tbody>
                    {usersData.permissions.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.code}</TableCell>
                        <TableCell className="text-xs">{p.module}</TableCell>
                        {usersData.roles.map((r: any) => {
                          const has = usersData.rolePermissions.some(
                            (rp: any) => rp.roleId === r.id && rp.permissionId === p.id
                          );
                          return (
                            <TableCell key={r.id} className="text-center font-mono text-xs">
                              {has ? '✓' : '—'}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </tbody>
                </DataTable>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canSettings && (
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>School Profile & Policy Configuration</CardTitle>
                <CardDescription>Branding, academic ranking policy, and M-Pesa / Email / SMS integration state</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveSettings} className="space-y-4 max-w-2xl">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>School Name</Label>
                      <Input value={settingsForm.schoolName} onChange={(e) => setSettingsForm({ ...settingsForm, schoolName: e.target.value })} />
                    </div>
                    <div>
                      <Label>School Code</Label>
                      <Input value={settingsForm.code} onChange={(e) => setSettingsForm({ ...settingsForm, code: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>School Motto</Label>
                    <Input value={settingsForm.motto} onChange={(e) => setSettingsForm({ ...settingsForm, motto: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label>Official Email</Label>
                      <Input type="email" value={settingsForm.email} onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })} />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input value={settingsForm.phone} onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })} />
                    </div>
                    <div>
                      <Label>County</Label>
                      <Input value={settingsForm.county} onChange={(e) => setSettingsForm({ ...settingsForm, county: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>Postal Address</Label>
                    <Input value={settingsForm.address} onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })} />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={settingsForm.rankStudentsInReports}
                      onChange={(e) => setSettingsForm({ ...settingsForm, rankStudentsInReports: e.target.checked })}
                    />
                    Include Class Ranking on Student Report Cards & Merit Lists
                  </label>

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-2">
                    <p className="text-xs font-semibold">External Gateway Status (Configured via Server Secrets)</p>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500">M-Pesa Daraja</span>
                        <p className="font-semibold">{schoolSettings?.mpesaConfigured ? 'Active' : 'Unconfigured'}</p>
                      </div>
                      <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500">SMTP Email</span>
                        <p className="font-semibold">{schoolSettings?.emailConfigured ? 'Active' : 'Unconfigured'}</p>
                      </div>
                      <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500">SMS Gateway</span>
                        <p className="font-semibold">{schoolSettings?.smsConfigured ? 'Active' : 'Unconfigured'}</p>
                      </div>
                    </div>
                  </div>

                  <Button type="submit">
                    <Save className="h-4 w-4" />
                    Save Configuration
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canAudit && (
          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle>Immutable Audit Trail ({auditLogs.length})</CardTitle>
                <CardDescription>Tracks authentication, record mutations, exam approvals, and financial entries</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <tbody>
                    {auditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">{formatDateShort(log.createdAt)}</TableCell>
                        <TableCell className="text-xs">{log.actorEmail}</TableCell>
                        <TableCell className="font-mono text-xs">{log.actorRole}</TableCell>
                        <TableCell className="font-mono text-xs font-semibold">{log.action}</TableCell>
                        <TableCell className="text-xs">
                          {log.entity} {log.entityId ? `#${log.entityId}` : ''}
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </DataTable>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={newUserOpen} onOpenChange={setNewUserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Provision User Account</DialogTitle>
            <DialogDescription>
              Assign an institutional role to a Google account email before or after first sign-in.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-3">
            <div>
              <Label>Email *</Label>
              <Input type="email" required value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
            </div>
            <div>
              <Label>Full Name *</Label>
              <Input required value={userForm.fullName} onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })} />
            </div>
            <div>
              <Label>Role *</Label>
              <SelectInput value={userForm.roleCode} onChange={(e) => setUserForm({ ...userForm, roleCode: e.target.value })}>
                {usersData.roles.map((r: any) => (
                  <option key={r.id} value={r.code}>{r.name}</option>
                ))}
              </SelectInput>
            </div>
            {(userForm.roleCode === 'STUDENT' || userForm.roleCode === 'PARENT') && (
              <div>
                <Label>Link Student Record</Label>
                <SelectInput value={userForm.linkedStudentId} onChange={(e) => setUserForm({ ...userForm, linkedStudentId: e.target.value })}>
                  <option value="">Select Student</option>
                  {studentsList.map((s) => (
                    <option key={s.id} value={s.id}>{s.admissionNumber} — {s.firstName} {s.lastName}</option>
                  ))}
                </SelectInput>
              </div>
            )}
            {userForm.roleCode === 'TEACHER' && (
              <div>
                <Label>Link Staff Record</Label>
                <SelectInput value={userForm.linkedStaffId} onChange={(e) => setUserForm({ ...userForm, linkedStaffId: e.target.value })}>
                  <option value="">Select Teacher</option>
                  {staffList.map((st) => (
                    <option key={st.id} value={st.id}>{st.employeeNumber} — {st.firstName} {st.lastName}</option>
                  ))}
                </SelectInput>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setNewUserOpen(false)}>Cancel</Button>
              <Button type="submit">Provision Account</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
