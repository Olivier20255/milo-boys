import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { exportToCSV, exportToExcel, exportToPDF } from '../lib/exporters';
import { formatKES } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export const ReportsModule: React.FC = () => {
  const { hasPermission } = useAuth();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [exams, setExams] = useState<any[]>([]);

  useEffect(() => {
    if (hasPermission('exams.view')) {
      apiFetch<any[]>('/api/examinations').then(setExams).catch(() => {});
    }
  }, [hasPermission]);

  const downloadEnrollmentReport = async (format: 'xlsx' | 'csv' | 'pdf') => {
    setLoadingKey(`enroll-${format}`);
    try {
      const res = await apiFetch<{ items: any[] }>('/api/students?status=ALL&pageSize=100');
      const headers = ['Adm No.', 'Name', 'Class', 'Stream', 'County', 'Admission Date', 'Status'];
      const rows = res.items.map((s) => [
        s.admissionNumber,
        `${s.firstName} ${s.lastName}`,
        s.className || '—',
        s.streamName || '—',
        s.county || '—',
        s.admissionDate,
        s.status,
      ]);
      if (format === 'xlsx') {
        exportToExcel(
          'milo-boys-enrollment-report',
          'Enrollment',
          res.items.map((s) => ({
            AdmissionNumber: s.admissionNumber,
            StudentName: `${s.firstName} ${s.lastName}`,
            Class: s.className,
            Stream: s.streamName,
            County: s.county,
            AdmissionDate: s.admissionDate,
            Status: s.status,
          }))
        );
      } else if (format === 'csv') {
        exportToCSV('milo-boys-enrollment-report', headers, rows);
      } else {
        exportToPDF('milo-boys-enrollment-report', 'Student Enrollment & Status Report', 'All Registered Cohorts', headers, rows);
      }
      toast.success('Enrollment report generated.');
    } catch (err: any) {
      toast.error(err?.message || 'Report generation failed.');
    } finally {
      setLoadingKey(null);
    }
  };

  const downloadFeeReport = async (arrearsOnly: boolean, format: 'xlsx' | 'pdf') => {
    setLoadingKey(`fee-${arrearsOnly}-${format}`);
    try {
      const items = await apiFetch<any[]>(`/api/finance/student-fees?arrears=${arrearsOnly}`);
      const title = arrearsOnly ? 'Outstanding Fee Arrears Report' : 'Complete Student Fee Statements';
      if (format === 'xlsx') {
        exportToExcel(
          arrearsOnly ? 'milo-boys-fee-arrears' : 'milo-boys-fee-statements',
          'Fees',
          items.map((r) => ({
            AdmNo: r.admissionNumber,
            Student: r.studentName,
            Class: r.className,
            Billed: Number(r.fee.billedAmount),
            Bursary: Number(r.fee.discountAmount),
            Paid: Number(r.fee.paidAmount),
            Balance: Number(r.fee.balanceAmount),
          }))
        );
      } else {
        exportToPDF(
          arrearsOnly ? 'milo-boys-fee-arrears' : 'milo-boys-fee-statements',
          title,
          'Milo Boys School Bursar Ledger',
          ['Adm No.', 'Student', 'Class', 'Billed', 'Bursary', 'Paid', 'Balance'],
          items.map((r) => [
            r.admissionNumber,
            r.studentName,
            r.className || '—',
            formatKES(r.fee.billedAmount),
            formatKES(r.fee.discountAmount),
            formatKES(r.fee.paidAmount),
            formatKES(r.fee.balanceAmount),
          ])
        );
      }
      toast.success(`${title} downloaded.`);
    } catch (err: any) {
      toast.error(err?.message || 'Unable to generate fee report.');
    } finally {
      setLoadingKey(null);
    }
  };

  const downloadExamAnalysis = async (format: 'xlsx' | 'pdf') => {
    const published = exams.find((e) => e.status === 'PUBLISHED') || exams[0];
    if (!published) {
      toast.error('No examination records found.');
      return;
    }
    setLoadingKey(`exam-${format}`);
    try {
      const anal = await apiFetch<any>(`/api/examinations/${published.id}/analytics`);
      if (format === 'xlsx') {
        exportToExcel('milo-boys-exam-analysis', 'ExamResults', anal.studentResults);
      } else {
        exportToPDF(
          'milo-boys-exam-analysis',
          `Examination Analysis — ${published.name}`,
          `Status: ${published.status}`,
          ['Adm No.', 'Student', 'Class', 'Total', 'Mean %', 'Grade', 'Rank'],
          anal.studentResults.map((r: any) => [
            r.admissionNumber,
            r.studentName,
            r.className,
            r.totalMarks,
            `${r.meanScore}%`,
            r.meanGrade,
            r.classRank || '—',
          ])
        );
      }
      toast.success('Examination report downloaded.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate examination report.');
    } finally {
      setLoadingKey(null);
    }
  };

  const downloadAttendanceReport = async (format: 'csv' | 'pdf') => {
    setLoadingKey(`att-${format}`);
    try {
      const res = await apiFetch<{ items: any[]; summary: any }>('/api/attendance/students');
      const headers = ['Date', 'Adm No.', 'Student', 'Class', 'Status'];
      const rows = res.items.map((r) => [
        r.record.date,
        r.admissionNumber,
        r.studentName,
        r.className,
        r.record.status,
      ]);
      if (format === 'csv') exportToCSV('milo-boys-attendance', headers, rows);
      else exportToPDF('milo-boys-attendance', 'Attendance Summary Report', `Attendance Rate: ${res.summary.rate}%`, headers, rows);
      toast.success('Attendance report downloaded.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export attendance.');
    } finally {
      setLoadingKey(null);
    }
  };

  const downloadStaffReport = async () => {
    setLoadingKey('staff-pdf');
    try {
      const items = await apiFetch<any[]>('/api/staff');
      exportToPDF(
        'milo-boys-staff-roster',
        'Institutional Staff Roster',
        `Total Staff: ${items.length}`,
        ['Emp ID', 'Name', 'Category', 'Department', 'Designation', 'Status'],
        items.map((s) => [
          s.employeeNumber,
          `${s.firstName} ${s.lastName}`,
          s.staffType,
          s.department,
          s.designation,
          s.employmentStatus,
        ])
      );
      toast.success('Staff roster PDF downloaded.');
    } catch (err: any) {
      toast.error(err?.message || 'Unable to export staff roster.');
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reporting & Analytics Center</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Generate official Academic, Administrative, and Financial exports in PDF, Excel (.xlsx), and CSV
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print View
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Academic Reports</CardTitle>
            <CardDescription>Examination analysis, subject means, and class performance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded border border-slate-200 dark:border-slate-800 space-y-2">
              <p className="text-sm font-medium">Latest Examination Merit & Performance</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={loadingKey === 'exam-xlsx'} onClick={() => downloadExamAnalysis('xlsx')}>
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Excel
                </Button>
                <Button size="sm" disabled={loadingKey === 'exam-pdf'} onClick={() => downloadExamAnalysis('pdf')}>
                  <Download className="h-3.5 w-3.5" />
                  PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Administrative Reports</CardTitle>
            <CardDescription>Enrollment, transfers/withdrawals, staff roster, and attendance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded border border-slate-200 dark:border-slate-800 space-y-2">
              <p className="text-sm font-medium">Student Enrollment & Transfers</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={loadingKey === 'enroll-xlsx'} onClick={() => downloadEnrollmentReport('xlsx')}>
                  Excel
                </Button>
                <Button size="sm" variant="outline" disabled={loadingKey === 'enroll-csv'} onClick={() => downloadEnrollmentReport('csv')}>
                  CSV
                </Button>
                <Button size="sm" disabled={loadingKey === 'enroll-pdf'} onClick={() => downloadEnrollmentReport('pdf')}>
                  PDF
                </Button>
              </div>
            </div>
            <div className="p-3 rounded border border-slate-200 dark:border-slate-800 space-y-2">
              <p className="text-sm font-medium">Attendance & Absentee Audit</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadAttendanceReport('csv')}>CSV</Button>
                <Button size="sm" onClick={() => downloadAttendanceReport('pdf')}>PDF</Button>
              </div>
            </div>
            {hasPermission('staff.view') && (
              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 space-y-2">
                <p className="text-sm font-medium">Staff Personnel Roster</p>
                <Button size="sm" onClick={downloadStaffReport}>Download PDF</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Financial Reports</CardTitle>
            <CardDescription>Fee collection statements and arrears tracking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasPermission('finance.view') ? (
              <>
                <div className="p-3 rounded border border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="text-sm font-medium">Complete Student Fee Ledger</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => downloadFeeReport(false, 'xlsx')}>Excel</Button>
                    <Button size="sm" onClick={() => downloadFeeReport(false, 'pdf')}>PDF</Button>
                  </div>
                </div>
                <div className="p-3 rounded border border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="text-sm font-medium">Outstanding Fee Arrears</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => downloadFeeReport(true, 'xlsx')}>Excel</Button>
                    <Button size="sm" onClick={() => downloadFeeReport(true, 'pdf')}>PDF</Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">Financial reports require finance permissions.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
