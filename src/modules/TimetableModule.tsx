import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Printer, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input, Label, SelectInput } from '../components/ui/input';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;

export const TimetableModule: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('timetable.manage');

  const [meta, setMeta] = useState<any>({ academicYears: [], terms: [], classes: [], streams: [], subjects: [] });
  const [staffList, setStaffList] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'stream' | 'teacher'>('stream');
  const [selectedStreamId, setSelectedStreamId] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [slots, setSlots] = useState<any[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    dayOfWeek: 'MONDAY',
    startTime: '08:00',
    endTime: '08:40',
    subjectId: '',
    staffId: '',
    room: 'F1-N',
    isBreak: false,
    breakLabel: '',
  });

  const loadMeta = useCallback(async () => {
    try {
      const ov = await apiFetch('/api/academics/overview');
      setMeta(ov);
      if (ov.streams.length > 0 && !selectedStreamId) {
        setSelectedStreamId(String(ov.streams[0].id));
      }
      if (hasPermission('staff.view')) {
        const st = await apiFetch<any[]>('/api/staff?staffType=TEACHING');
        setStaffList(st);
        if (st.length > 0 && !selectedStaffId) setSelectedStaffId(String(st[0].id));
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load timetable metadata.');
    }
  }, [hasPermission, selectedStreamId, selectedStaffId]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const loadSlots = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (viewMode === 'stream' && selectedStreamId) params.set('streamId', selectedStreamId);
      if (viewMode === 'teacher' && selectedStaffId) params.set('staffId', selectedStaffId);
      const data = await apiFetch<any[]>(`/api/timetable?${params.toString()}`);
      setSlots(data);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load timetable.');
    }
  }, [viewMode, selectedStreamId, selectedStaffId]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentYear = meta.academicYears.find((y: any) => y.isCurrent) || meta.academicYears[0];
    const currentTerm = meta.terms.find((t: any) => t.isCurrent) || meta.terms[0];
    const stream = meta.streams.find((s: any) => s.id === Number(selectedStreamId));
    if (!currentYear || !currentTerm || !stream) {
      toast.error('Select a class stream first.');
      return;
    }

    try {
      await apiFetch('/api/timetable', {
        method: 'POST',
        body: JSON.stringify({
          academicYearId: currentYear.id,
          termId: currentTerm.id,
          classId: stream.classId,
          streamId: stream.id,
          subjectId: form.isBreak ? null : Number(form.subjectId),
          staffId: form.isBreak ? null : Number(form.staffId),
          dayOfWeek: form.dayOfWeek,
          startTime: form.startTime,
          endTime: form.endTime,
          room: form.room,
          isBreak: form.isBreak,
          breakLabel: form.isBreak ? form.breakLabel || 'Break' : null,
        }),
      });
      toast.success('Lesson scheduled with zero conflicts.');
      setCreateOpen(false);
      loadSlots();
    } catch (err: any) {
      toast.error(err?.message || 'Scheduling conflict detected.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timetable Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Weekly class and teacher schedules with automated teacher, class, and room conflict prevention
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print Timetable
          </Button>
          {canManage && viewMode === 'stream' && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Schedule Lesson
            </Button>
          )}
        </div>
      </div>

      <Card className="no-print">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              onClick={() => setViewMode('stream')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                viewMode === 'stream' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Class Stream View
            </button>
            <button
              onClick={() => setViewMode('teacher')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                viewMode === 'teacher' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Teacher Timetable View
            </button>
          </div>

          {viewMode === 'stream' ? (
            <SelectInput
              className="w-60"
              value={selectedStreamId}
              onChange={(e) => setSelectedStreamId(e.target.value)}
            >
              {meta.streams.map((st: any) => {
                const cls = meta.classes.find((c: any) => c.id === st.classId);
                return (
                  <option key={st.id} value={st.id}>
                    {cls?.name} — {st.name} ({st.roomName || 'Room'})
                  </option>
                );
              })}
            </SelectInput>
          ) : (
            <SelectInput
              className="w-64"
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
            >
              {staffList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.firstName} {t.lastName} ({t.department})
                </option>
              ))}
            </SelectInput>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {DAYS.map((day) => {
          const daySlots = slots.filter((s) => s.slot.dayOfWeek === day);
          return (
            <Card key={day}>
              <CardHeader className="pb-2 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-sm">{day}</CardTitle>
                <CardDescription>{daySlots.length} periods</CardDescription>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                {daySlots.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No scheduled periods</p>
                ) : (
                  daySlots.map((item) => (
                    <div
                      key={item.slot.id}
                      className={`p-2.5 rounded border text-xs space-y-1 ${
                        item.slot.isBreak
                          ? 'border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                        <span>
                          {item.slot.startTime} – {item.slot.endTime}
                        </span>
                        {canManage && (
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/timetable/${item.slot.id}`, { method: 'DELETE' });
                              toast.success('Period removed.');
                              loadSlots();
                            }}
                            className="text-slate-400 hover:text-red-600 no-print cursor-pointer"
                            aria-label="Remove slot"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {item.slot.isBreak ? (
                        <p className="font-semibold text-amber-800 dark:text-amber-300">
                          {item.slot.breakLabel || 'Break Period'}
                        </p>
                      ) : (
                        <>
                          <p className="font-semibold text-[#0F2557] dark:text-blue-400">
                            {item.subjectName}
                          </p>
                          <p className="text-slate-600 dark:text-slate-300">
                            {viewMode === 'stream' ? item.teacherName : `${item.className} ${item.streamName}`}
                          </p>
                          <p className="font-mono text-[11px] text-slate-400">Room: {item.slot.room}</p>
                        </>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Schedule Lesson Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Lesson / Break Period</DialogTitle>
            <DialogDescription>
              Server automatically blocks teacher, class stream, and room collisions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSlot} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Day</Label>
                <SelectInput value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </SelectInput>
              </div>
              <div>
                <Label>Start Time</Label>
                <Input type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="time" required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={form.isBreak}
                onChange={(e) => setForm({ ...form, isBreak: e.target.checked })}
              />
              Schedule as Break / Assembly Period
            </label>

            {form.isBreak ? (
              <div>
                <Label>Break Label</Label>
                <Input
                  required
                  placeholder="Lunch Break"
                  value={form.breakLabel}
                  onChange={(e) => setForm({ ...form, breakLabel: e.target.value })}
                />
              </div>
            ) : (
              <>
                <div>
                  <Label>Subject *</Label>
                  <SelectInput required value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                    <option value="">Select Subject</option>
                    {meta.subjects.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                    ))}
                  </SelectInput>
                </div>
                <div>
                  <Label>Teacher *</Label>
                  <SelectInput required value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
                    <option value="">Select Teacher</option>
                    {staffList.map((t) => (
                      <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                    ))}
                  </SelectInput>
                </div>
              </>
            )}

            <div>
              <Label>Room *</Label>
              <Input required value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit">Schedule Period</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
