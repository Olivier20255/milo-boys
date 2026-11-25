import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, Download, Plus, Printer, ReceiptText, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { exportToExcel, exportToPDF } from '../lib/exporters';
import { formatDateShort, formatKES } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input, Label, SelectInput } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { DataTable, StatusText, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export const FinanceModule: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission('finance.manage');
  const isRestricted = user?.roleCode === 'STUDENT' || user?.roleCode === 'PARENT';

  const [structures, setStructures] = useState<any[]>([]);
  const [studentFees, setStudentFees] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [reports, setReports] = useState<any>(null);
  const [academicMeta, setAcademicMeta] = useState<any>(null);
  const [onlyArrears, setOnlyArrears] = useState(false);

  // Payment modal
  const [payOpen, setPayOpen] = useState(false);
  const [selectedFeeRow, setSelectedFeeRow] = useState<any>(null);
  const [payForm, setPayForm] = useState({
    amount: '',
    paymentMethod: 'MPESA',
    referenceNumber: '',
    paidBy: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  // Discount modal
  const [discOpen, setDiscOpen] = useState(false);
  const [discForm, setDiscForm] = useState({ discountAmount: '', discountReason: '' });

  // Receipt modal
  const [receiptData, setReceiptData] = useState<any>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Structure modal
  const [structOpen, setStructOpen] = useState(false);
  const [structForm, setStructForm] = useState({
    academicYearId: '',
    termId: '',
    classId: '',
    title: '',
    dueDate: '2026-06-15',
    tuition: '20000',
    boarding: '14500',
    activity: '2500',
    lab: '2000',
  });

  // M-Pesa STK modal
  const [stkOpen, setStkOpen] = useState(false);
  const [stkForm, setStkForm] = useState({ phone: '2547', amount: '', accountReference: '' });

  const loadFinance = useCallback(async () => {
    try {
      const [stList, feesList, pmtList] = await Promise.all([
        apiFetch<any[]>('/api/finance/structures'),
        apiFetch<any[]>(`/api/finance/student-fees?arrears=${onlyArrears}`),
        apiFetch<any[]>('/api/finance/payments'),
      ]);
      setStructures(stList);
      setStudentFees(feesList);
      setPayments(pmtList);
      if (!isRestricted) {
        const rep = await apiFetch('/api/finance/reports');
        setReports(rep);
      }
      if (hasPermission('academics.view')) {
        const ov = await apiFetch('/api/academics/overview');
        setAcademicMeta(ov);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load finance records.');
    }
  }, [onlyArrears, isRestricted, hasPermission]);

  useEffect(() => {
    loadFinance();
  }, [loadFinance]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFeeRow) return;
    try {
      const res = await apiFetch<any>('/api/finance/payments', {
        method: 'POST',
        body: JSON.stringify({
          studentFeeId: selectedFeeRow.fee.id,
          amount: Number(payForm.amount),
          paymentMethod: payForm.paymentMethod,
          referenceNumber: payForm.referenceNumber,
          paidBy: payForm.paidBy || null,
          paymentDate: payForm.paymentDate,
          notes: payForm.notes || null,
        }),
      });
      toast.success(`Payment recorded. Receipt ${res.receipt.receiptNumber} issued.`);
      setPayOpen(false);
      await loadFinance();
      const rcp = await apiFetch(`/api/finance/receipts/${res.receipt.id}`);
      setReceiptData(rcp);
      setReceiptOpen(true);
    } catch (err: any) {
      toast.error(err?.message || 'Payment recording failed.');
    }
  };

  const handleApplyDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFeeRow) return;
    try {
      await apiFetch(`/api/finance/student-fees/${selectedFeeRow.fee.id}/discount`, {
        method: 'POST',
        body: JSON.stringify({
          discountAmount: Number(discForm.discountAmount),
          discountReason: discForm.discountReason,
        }),
      });
      toast.success('Bursary / discount adjustment saved.');
      setDiscOpen(false);
      loadFinance();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to apply discount.');
    }
  };

  const handleCreateStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await apiFetch<any>('/api/finance/structures', {
        method: 'POST',
        body: JSON.stringify({
          academicYearId: Number(structForm.academicYearId),
          termId: Number(structForm.termId),
          classId: Number(structForm.classId),
          title: structForm.title,
          dueDate: structForm.dueDate,
          items: [
            { voteHead: 'Tuition & Academic Resources', amount: Number(structForm.tuition) },
            { voteHead: 'Boarding & Catering', amount: Number(structForm.boarding) },
            { voteHead: 'Co-Curricular & Sports', amount: Number(structForm.activity) },
            { voteHead: 'Science & ICT Laboratory', amount: Number(structForm.lab) },
          ],
        }),
      });
      toast.success('Fee structure created.');
      setStructOpen(false);
      await apiFetch(`/api/finance/structures/${created.id}/allocate`, { method: 'POST' });
      loadFinance();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save fee structure.');
    }
  };

  const handleMpesaStk = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/finance/mpesa/stk-push', {
        method: 'POST',
        body: JSON.stringify({
          phone: stkForm.phone,
          amount: Number(stkForm.amount),
          accountReference: stkForm.accountReference,
        }),
      });
      toast.success('M-Pesa STK Push sent to guardian phone.');
      setStkOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'M-Pesa STK Push unavailable.');
    }
  };

  const openReceipt = async (receiptId: number) => {
    try {
      const rcp = await apiFetch(`/api/finance/receipts/${receiptId}`);
      setReceiptData(rcp);
      setReceiptOpen(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load receipt.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finance & Fees Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Fee structures, student ledgers, transactional payments, sequential receipts, and arrears reporting
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStkOpen(true)}>
                <Smartphone className="h-4 w-4" />
                M-Pesa STK Push
              </Button>
              <Button size="sm" onClick={() => setStructOpen(true)}>
                <Plus className="h-4 w-4" />
                New Fee Structure
              </Button>
            </>
          )}
        </div>
      </div>

      {!isRestricted && reports?.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Term Billing</CardDescription>
              <CardTitle className="text-xl font-mono tabular-nums">
                {formatKES(reports.summary.totalBilled)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Bursaries & Discounts</CardDescription>
              <CardTitle className="text-xl font-mono tabular-nums text-blue-700 dark:text-blue-400">
                {formatKES(reports.summary.totalDiscounts)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Collected</CardDescription>
              <CardTitle className="text-xl font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatKES(reports.summary.totalCollected)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Outstanding Arrears</CardDescription>
              <CardTitle className="text-xl font-mono tabular-nums text-amber-700 dark:text-amber-400">
                {formatKES(reports.summary.totalOutstanding)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <Tabs defaultValue="ledgers" className="no-print">
        <TabsList>
          <TabsTrigger value="ledgers">Student Fee Statements</TabsTrigger>
          <TabsTrigger value="payments">Payments & Receipts</TabsTrigger>
          <TabsTrigger value="structures">Fee Structures</TabsTrigger>
          {!isRestricted && <TabsTrigger value="reports">Collection Reports</TabsTrigger>}
        </TabsList>

        <TabsContent value="ledgers">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle>Student Fee Statements</CardTitle>
                <CardDescription>Live billed, bursary, paid, and balance ledgers</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={onlyArrears}
                    onChange={(e) => setOnlyArrears(e.target.checked)}
                  />
                  Show Arrears Only
                </label>
                {!isRestricted && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      exportToExcel(
                        'milo-boys-fee-balances',
                        'Balances',
                        studentFees.map((r) => ({
                          AdmNo: r.admissionNumber,
                          Student: r.studentName,
                          Class: r.className,
                          Billed: Number(r.fee.billedAmount),
                          Discount: Number(r.fee.discountAmount),
                          Paid: Number(r.fee.paidAmount),
                          Balance: Number(r.fee.balanceAmount),
                        }))
                      );
                      toast.success('Fee statement Excel exported.');
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Adm No.</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Bursary</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <tbody>
                  {studentFees.map((r) => {
                    const bal = Number(r.fee.balanceAmount);
                    return (
                      <TableRow key={r.fee.id}>
                        <TableCell className="font-mono text-xs">{r.admissionNumber}</TableCell>
                        <TableCell className="font-medium">{r.studentName}</TableCell>
                        <TableCell>{r.className || '—'}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatKES(r.fee.billedAmount)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-blue-600">
                          {formatKES(r.fee.discountAmount)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatKES(r.fee.paidAmount)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-bold">
                          {formatKES(bal)}
                        </TableCell>
                        <TableCell>
                          <StatusText
                            tone={bal <= 0 ? 'success' : Number(r.fee.paidAmount) > 0 ? 'warning' : 'danger'}
                            label={bal <= 0 ? 'CLEARED' : Number(r.fee.paidAmount) > 0 ? 'PARTIAL' : 'ARREARS'}
                          />
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right space-x-1 whitespace-nowrap">
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedFeeRow(r);
                                setPayForm({
                                  amount: bal > 0 ? String(bal) : '',
                                  paymentMethod: 'MPESA',
                                  referenceNumber: '',
                                  paidBy: '',
                                  paymentDate: new Date().toISOString().slice(0, 10),
                                  notes: '',
                                });
                                setPayOpen(true);
                              }}
                            >
                              <Banknote className="h-3.5 w-3.5" />
                              Pay
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedFeeRow(r);
                                setDiscForm({
                                  discountAmount: String(r.fee.discountAmount || '0'),
                                  discountReason: r.fee.discountReason || '',
                                });
                                setDiscOpen(true);
                              }}
                            >
                              Bursary
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Payment Transactions & Receipts</CardTitle>
              <CardDescription>Immutable payment ledger with printable official receipts</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt No.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <tbody>
                  {payments.map((row) => (
                    <TableRow key={row.payment.id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {row.receiptNumber || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.payment.paymentDate}</TableCell>
                      <TableCell>
                        <span className="font-medium">{row.studentName}</span>{' '}
                        <span className="font-mono text-xs text-slate-400">({row.admissionNumber})</span>
                      </TableCell>
                      <TableCell className="text-xs">{row.payment.paymentMethod}</TableCell>
                      <TableCell className="font-mono text-xs">{row.payment.referenceNumber}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-semibold">
                        {formatKES(row.payment.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.receiptId && (
                          <Button size="sm" variant="outline" onClick={() => openReceipt(row.receiptId)}>
                            <ReceiptText className="h-3.5 w-3.5" />
                            View
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

        <TabsContent value="structures">
          <Card>
            <CardHeader>
              <CardTitle>Configured Term Fee Structures</CardTitle>
              <CardDescription>Vote-head breakdown by class and term</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {structures.map((st) => (
                <div key={st.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-sm">{st.title}</h4>
                      <p className="text-xs text-slate-500">
                        {st.academicYearName} · {st.termName} · Due {st.dueDate}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-sm">{formatKES(st.totalAmount)}</span>
                  </div>
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1 text-xs">
                    {(st.items || []).map((it: any, idx: number) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">{it.voteHead}</span>
                        <span className="font-mono tabular-nums">{formatKES(it.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {!isRestricted && reports && (
          <TabsContent value="reports" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Daily Collection Reconciliation</CardTitle>
                  <CardDescription>Verified totals grouped by payment date</CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    exportToPDF(
                      'daily-collections',
                      'Daily Fee Collection Report',
                      'Milo Boys School Bursar Office',
                      ['Payment Date', 'Transactions', 'Total Collected (KES)'],
                      reports.daily.map((d: any) => [d.date, d.count, formatKES(d.total)])
                    )
                  }
                >
                  PDF Report
                </Button>
              </CardHeader>
              <CardContent>
                <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                      <TableHead className="text-right">Total Collected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <tbody>
                    {reports.daily.map((d: any) => (
                      <TableRow key={d.date}>
                        <TableCell className="font-mono text-xs">{d.date}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{d.count}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {formatKES(d.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </DataTable>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Collections by Payment Channel</CardTitle>
                <CardDescription>M-Pesa, Bank Transfer, Cash & Cheque totals</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment Method</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <tbody>
                    {reports.byMethod.map((m: any) => (
                      <TableRow key={m.method}>
                        <TableCell className="font-medium">{m.method}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{m.count}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {formatKES(m.total)}
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

      {/* Record Payment Modal */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Fee Payment</DialogTitle>
            <DialogDescription>
              {selectedFeeRow?.studentName} ({selectedFeeRow?.admissionNumber}) · Current Balance:{' '}
              {formatKES(selectedFeeRow?.fee?.balanceAmount)}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordPayment} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (KES) *</Label>
                <Input
                  type="number"
                  required
                  min={1}
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                />
              </div>
              <div>
                <Label>Payment Date *</Label>
                <Input
                  type="date"
                  required
                  value={payForm.paymentDate}
                  onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment Method *</Label>
                <SelectInput
                  value={payForm.paymentMethod}
                  onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
                >
                  <option value="MPESA">M-Pesa</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="OTHER">Other</option>
                </SelectInput>
              </div>
              <div>
                <Label>Reference Number *</Label>
                <Input
                  required
                  placeholder="e.g. UFB92817X"
                  value={payForm.referenceNumber}
                  onChange={(e) => setPayForm({ ...payForm, referenceNumber: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Paid By</Label>
              <Input
                placeholder="Parent / Guardian name"
                value={payForm.paidBy}
                onChange={(e) => setPayForm({ ...payForm, paidBy: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button type="submit">Record & Issue Receipt</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bursary / Discount Modal */}
      <Dialog open={discOpen} onOpenChange={setDiscOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Bursary / Fee Adjustment</DialogTitle>
            <DialogDescription>
              {selectedFeeRow?.studentName} ({selectedFeeRow?.admissionNumber})
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleApplyDiscount} className="space-y-3">
            <div>
              <Label>Discount / Bursary Amount (KES) *</Label>
              <Input
                type="number"
                required
                min={0}
                value={discForm.discountAmount}
                onChange={(e) => setDiscForm({ ...discForm, discountAmount: e.target.value })}
              />
            </div>
            <div>
              <Label>Authorization Reason *</Label>
              <Input
                required
                placeholder="County Bursary / Principal Scholarship"
                value={discForm.discountReason}
                onChange={(e) => setDiscForm({ ...discForm, discountReason: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDiscOpen(false)}>Cancel</Button>
              <Button type="submit">Apply Adjustment</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* New Fee Structure Modal */}
      <Dialog open={structOpen} onOpenChange={setStructOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Class Fee Structure</DialogTitle>
            <DialogDescription>Automatically allocates fees to active students in the selected class.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateStructure} className="space-y-3">
            <div>
              <Label>Title *</Label>
              <Input
                required
                placeholder="Form 1 — Term 3 2026 Fee Structure"
                value={structForm.title}
                onChange={(e) => setStructForm({ ...structForm, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Year *</Label>
                <SelectInput
                  required
                  value={structForm.academicYearId}
                  onChange={(e) => setStructForm({ ...structForm, academicYearId: e.target.value })}
                >
                  <option value="">Year</option>
                  {academicMeta?.academicYears?.map((y: any) => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </SelectInput>
              </div>
              <div>
                <Label>Term *</Label>
                <SelectInput
                  required
                  value={structForm.termId}
                  onChange={(e) => setStructForm({ ...structForm, termId: e.target.value })}
                >
                  <option value="">Term</option>
                  {academicMeta?.terms?.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </SelectInput>
              </div>
              <div>
                <Label>Class *</Label>
                <SelectInput
                  required
                  value={structForm.classId}
                  onChange={(e) => setStructForm({ ...structForm, classId: e.target.value })}
                >
                  <option value="">Class</option>
                  {academicMeta?.classes?.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </SelectInput>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tuition (KES)</Label>
                <Input type="number" value={structForm.tuition} onChange={(e) => setStructForm({ ...structForm, tuition: e.target.value })} />
              </div>
              <div>
                <Label>Boarding (KES)</Label>
                <Input type="number" value={structForm.boarding} onChange={(e) => setStructForm({ ...structForm, boarding: e.target.value })} />
              </div>
              <div>
                <Label>Activity (KES)</Label>
                <Input type="number" value={structForm.activity} onChange={(e) => setStructForm({ ...structForm, activity: e.target.value })} />
              </div>
              <div>
                <Label>Laboratory & ICT (KES)</Label>
                <Input type="number" value={structForm.lab} onChange={(e) => setStructForm({ ...structForm, lab: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStructOpen(false)}>Cancel</Button>
              <Button type="submit">Create & Allocate</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* M-Pesa STK Push Dialog */}
      <Dialog open={stkOpen} onOpenChange={setStkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Initiate M-Pesa STK Push</DialogTitle>
            <DialogDescription>
              Sends a real Safaricom Daraja payment prompt when M-Pesa API credentials are configured.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMpesaStk} className="space-y-3">
            <div>
              <Label>Guardian M-Pesa Phone (2547XXXXXXXX) *</Label>
              <Input required value={stkForm.phone} onChange={(e) => setStkForm({ ...stkForm, phone: e.target.value })} />
            </div>
            <div>
              <Label>Amount (KES) *</Label>
              <Input type="number" required value={stkForm.amount} onChange={(e) => setStkForm({ ...stkForm, amount: e.target.value })} />
            </div>
            <div>
              <Label>Student Admission No. (Account Ref) *</Label>
              <Input required placeholder="MBS/2026/001" value={stkForm.accountReference} onChange={(e) => setStkForm({ ...stkForm, accountReference: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStkOpen(false)}>Cancel</Button>
              <Button type="submit">Send STK Prompt</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Printable Official Receipt Dialog */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-lg">
          {receiptData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/src/assets/images/milo_boys_crest_1795596068996.jpg"
                    alt="Crest"
                    className="h-11 w-11 rounded object-cover"
                  />
                  <div>
                    <h3 className="font-bold text-[#0F2557] dark:text-white">
                      {receiptData.school?.schoolName || 'MILO BOYS SCHOOL'}
                    </h3>
                    <p className="text-xs text-slate-500">OFFICIAL FEE PAYMENT RECEIPT</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="no-print" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 p-3 rounded">
                <div>
                  <span className="text-slate-500">Receipt No.</span>
                  <p className="font-mono font-bold text-sm">{receiptData.receipt.receiptNumber}</p>
                </div>
                <div>
                  <span className="text-slate-500">Payment Date</span>
                  <p className="font-mono font-semibold">{receiptData.payment.paymentDate}</p>
                </div>
                <div>
                  <span className="text-slate-500">Student</span>
                  <p className="font-semibold">
                    {receiptData.student.firstName} {receiptData.student.lastName} (
                    {receiptData.student.admissionNumber})
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Class</span>
                  <p className="font-semibold">{receiptData.className || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-500">Channel & Reference</span>
                  <p className="font-mono">
                    {receiptData.payment.paymentMethod} · {receiptData.payment.referenceNumber}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Issued At</span>
                  <p className="font-mono">{formatDateShort(receiptData.receipt.issuedAt)}</p>
                </div>
              </div>

              <div className="border-t border-b border-slate-200 dark:border-slate-800 py-3 flex justify-between items-center">
                <span className="text-sm font-medium">Amount Received</span>
                <span className="text-xl font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {formatKES(receiptData.receipt.amount)}
                </span>
              </div>

              <div className="flex justify-between text-xs text-slate-500">
                <span>Remaining Term Balance:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {formatKES(receiptData.feeBalance)}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
