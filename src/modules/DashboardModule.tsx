import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { formatDateShort, formatKES } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { ModuleKey } from '../components/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { DataTable, StatusText, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

interface DashboardData {
  kpis: {
    totalStudents: number;
    teachingStaff: number;
    nonTeachingStaff: number;
    activeClasses: number;
    currentAcademicYear: string;
    currentTerm: string;
    totalFeeCollections: number;
    totalOutstandingBalances: number;
    attendanceRate: number;
  };
  charts: {
    populationByClass: Array<{ className: string; count: number }>;
    feeCollectionTrends: Array<{ month: string; amount: number; transactions: number }>;
    attendanceTrend: Array<{ date: string; present: number; late: number; absent: number; excused: number }>;
    performanceByClass: Array<{ className: string; meanScore: number }>;
    subjectPerformance: Array<{ subjectName: string; subjectCode: string; meanScore: number }>;
    latestExamName: string | null;
  };
  recentRegistrations: Array<{
    id: number;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    admissionDate: string;
    status: string;
    className: string | null;
  }>;
  recentPayments: Array<{
    id: number;
    amount: string;
    paymentMethod: string;
    referenceNumber: string;
    paymentDate: string;
    studentName: string;
    admissionNumber: string;
    receiptNumber: string | null;
  }>;
  pendingApprovals: Array<{
    id: number;
    name: string;
    examType: string;
    status: string;
    startDate: string;
  }>;
  recentAnnouncements: Array<{
    id: number;
    title: string;
    category: string;
    targetAudience: string;
    createdAt: string;
  }>;
}

export const DashboardModule: React.FC<{ onNavigate: (mod: ModuleKey) => void }> = ({ onNavigate }) => {
  const { user, hasPermission } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DashboardData>('/api/dashboard');
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard data.');
      toast.error(err?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-24 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-72 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
          <div className="h-72 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error || 'Unable to load dashboard.'}</p>
          <Button onClick={loadDashboard}>Retry Loading</Button>
        </CardContent>
      </Card>
    );
  }

  const { kpis, charts } = data;
  const showFinance = user?.roleCode !== 'TEACHER';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Institutional Overview
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Academic Year {kpis.currentAcademicYear} · {kpis.currentTerm} · Live PostgreSQL Records
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission('students.manage') && (
            <Button size="sm" onClick={() => onNavigate('students')}>
              Register Student
            </Button>
          )}
          {hasPermission('finance.manage') && (
            <Button size="sm" variant="secondary" onClick={() => onNavigate('finance')}>
              Record Payment
            </Button>
          )}
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Registered Active Students</CardDescription>
            <CardTitle className="text-2xl font-mono tabular-nums">{kpis.totalStudents}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500 dark:text-slate-400">
            Across {kpis.activeClasses} academic classes
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Teaching & Non-Teaching Staff</CardDescription>
            <CardTitle className="text-2xl font-mono tabular-nums">
              {kpis.teachingStaff} <span className="text-sm font-normal text-slate-400">/ {kpis.nonTeachingStaff}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500 dark:text-slate-400">
            {kpis.teachingStaff} teaching · {kpis.nonTeachingStaff} support & admin
          </CardContent>
        </Card>

        {showFinance ? (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Fee Collections</CardDescription>
                <CardTitle className="text-2xl font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatKES(kpis.totalFeeCollections)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 dark:text-slate-400">
                Verified receipts issued
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Outstanding Fee Balances</CardDescription>
                <CardTitle className="text-2xl font-mono tabular-nums text-amber-700 dark:text-amber-400">
                  {formatKES(kpis.totalOutstandingBalances)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 dark:text-slate-400">
                Attendance Rate: <span className="font-mono font-semibold">{kpis.attendanceRate}%</span>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Student Attendance Rate</CardDescription>
                <CardTitle className="text-2xl font-mono tabular-nums text-[#1D4ED8]">
                  {kpis.attendanceRate}%
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 dark:text-slate-400">
                Present & late roll-call average
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Academic Cycle</CardDescription>
                <CardTitle className="text-2xl font-mono tabular-nums">{kpis.currentTerm}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 dark:text-slate-400">
                Academic Year {kpis.currentAcademicYear}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Student Population by Class</CardTitle>
            <CardDescription>Current active enrollment distribution across forms</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.populationByClass}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="className" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Students" fill="#0F2557" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {showFinance && charts.feeCollectionTrends.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Fee Collection Trends</CardTitle>
              <CardDescription>Monthly verified fee collections (KES)</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.feeCollectionTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(val: any) => formatKES(val)} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    name="Collected"
                    stroke="#1D4ED8"
                    fill="#1D4ED8"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Daily Attendance Statistics</CardTitle>
              <CardDescription>Recent roll-call breakdown across active streams</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.attendanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="present" name="Present" stackId="a" fill="#16A34A" />
                  <Bar dataKey="late" name="Late" stackId="a" fill="#D97706" />
                  <Bar dataKey="absent" name="Absent" stackId="a" fill="#DC2626" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts Row 2: Academic & Subject Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Attendance Overview</CardTitle>
            <CardDescription>Daily student roll-call counts</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.attendanceTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="present" name="Present" fill="#16A34A" />
                <Bar dataKey="absent" name="Absent" fill="#DC2626" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Class Academic Mean</CardTitle>
            <CardDescription>{charts.latestExamName || 'Latest Published Examination'}</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.performanceByClass}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="className" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="meanScore" name="Mean Score (%)" fill="#1D4ED8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subject Performance</CardTitle>
            <CardDescription>Average score by subject (%)</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.subjectPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="subjectName" width={95} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="meanScore" name="Mean (%)" fill="#0F2557" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Operational Tables & Pending Workflows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.recentRegistrations.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Student Registrations</CardTitle>
                <CardDescription>Latest admitted students</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => onNavigate('students')}>
                View All
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Adm No.</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {data.recentRegistrations.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.admissionNumber}</TableCell>
                      <TableCell className="font-medium">
                        {s.firstName} {s.lastName}
                      </TableCell>
                      <TableCell>{s.className || '—'}</TableCell>
                      <TableCell>
                        <StatusText tone="success" label={s.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        )}

        {data.recentPayments.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Fee Payments</CardTitle>
                <CardDescription>Latest receipted transactions</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => onNavigate('finance')}>
                Finance Ledger
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {data.recentPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.receiptNumber || p.referenceNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium">{p.studentName}</div>
                        <div className="text-xs text-slate-400 font-mono">{p.admissionNumber}</div>
                      </TableCell>
                      <TableCell className="text-xs">{p.paymentMethod}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-semibold">
                        {formatKES(p.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Examinations & Pending Approvals</CardTitle>
              <CardDescription>Assessments awaiting submission, verification, or publication</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => onNavigate('examinations')}>
              Open Exams
            </Button>
          </CardHeader>
          <CardContent>
            {data.pendingApprovals.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">All current examinations are published.</p>
            ) : (
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Examination</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {data.pendingApprovals.map((ex) => (
                    <TableRow key={ex.id}>
                      <TableCell className="font-medium">{ex.name}</TableCell>
                      <TableCell className="text-xs">{ex.examType}</TableCell>
                      <TableCell>
                        <StatusText
                          tone={ex.status === 'SUBMITTED' ? 'warning' : ex.status === 'VERIFIED' ? 'info' : 'neutral'}
                          label={ex.status}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Institutional Announcements</CardTitle>
              <CardDescription>Official notices & calendar updates</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => onNavigate('communication')}>
              Notices
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentAnnouncements.map((a) => (
              <div
                key={a.id}
                className="pb-3 border-b last:border-b-0 border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{a.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {a.category} · Audience: {a.targetAudience}
                  </p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap font-mono">
                  {formatDateShort(a.createdAt)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
