export type RoleCode =
  | 'SUPER_ADMIN'
  | 'SCHOOL_ADMIN'
  | 'HEADTEACHER'
  | 'TEACHER'
  | 'ACCOUNTANT'
  | 'STUDENT'
  | 'PARENT';

export type ExamStatus = 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'FINALIZED' | 'PUBLISHED';

export interface GradingScaleItem {
  grade: string;
  minScore: number;
  maxScore: number;
  points: number;
  remarks: string;
}

export const DEFAULT_GRADING_SCALES: GradingScaleItem[] = [
  { grade: 'A', minScore: 80, maxScore: 100, points: 12, remarks: 'Excellent' },
  { grade: 'A-', minScore: 75, maxScore: 79, points: 11, remarks: 'Very Good' },
  { grade: 'B+', minScore: 70, maxScore: 74, points: 10, remarks: 'Good' },
  { grade: 'B', minScore: 65, maxScore: 69, points: 9, remarks: 'Above Average' },
  { grade: 'B-', minScore: 60, maxScore: 64, points: 8, remarks: 'Good Effort' },
  { grade: 'C+', minScore: 55, maxScore: 59, points: 7, remarks: 'Fair' },
  { grade: 'C', minScore: 50, maxScore: 54, points: 6, remarks: 'Average' },
  { grade: 'C-', minScore: 45, maxScore: 49, points: 5, remarks: 'Below Average' },
  { grade: 'D+', minScore: 40, maxScore: 44, points: 4, remarks: 'Needs Improvement' },
  { grade: 'D', minScore: 35, maxScore: 39, points: 3, remarks: 'Weak' },
  { grade: 'D-', minScore: 30, maxScore: 34, points: 2, remarks: 'Poor' },
  { grade: 'E', minScore: 0, maxScore: 29, points: 1, remarks: 'Very Poor' },
];

export function calculateGradeFromScale(
  rawScore: number,
  scales: GradingScaleItem[] = DEFAULT_GRADING_SCALES
): { grade: string; points: number; remarks: string } {
  const rounded = Math.round(rawScore);
  const clamped = Math.max(0, Math.min(100, rounded));
  const sorted = [...scales].sort((a, b) => b.minScore - a.minScore);
  for (const band of sorted) {
    if (clamped >= band.minScore && clamped <= band.maxScore) {
      return { grade: band.grade, points: band.points, remarks: band.remarks };
    }
  }
  const lowest = sorted[sorted.length - 1];
  return lowest
    ? { grade: lowest.grade, points: lowest.points, remarks: lowest.remarks }
    : { grade: 'E', points: 1, remarks: 'Very Poor' };
}

export function calculateMeanGradeFromPoints(
  meanPoints: number,
  scales: GradingScaleItem[] = DEFAULT_GRADING_SCALES
): string {
  const roundedPoints = Math.max(1, Math.min(12, Math.round(meanPoints)));
  const match = scales.find((s) => s.points === roundedPoints);
  return match ? match.grade : 'C';
}

export function canTransitionExamStatus(
  current: ExamStatus,
  next: ExamStatus,
  role: RoleCode
): { allowed: boolean; reason?: string } {
  if (current === next) {
    return { allowed: false, reason: 'Examination is already in this state.' };
  }

  const adminRoles: RoleCode[] = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'];

  if (current === 'DRAFT' && next === 'SUBMITTED') {
    if ([...adminRoles, 'TEACHER'].includes(role)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Only teachers or administrators can submit marks.' };
  }

  if (current === 'SUBMITTED' && next === 'VERIFIED') {
    if (adminRoles.includes(role)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Only administrators or the Headteacher can verify submitted marks.' };
  }

  if (current === 'VERIFIED' && next === 'FINALIZED') {
    if (adminRoles.includes(role)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Only administrators or the Headteacher can finalize results.' };
  }

  if (current === 'FINALIZED' && next === 'PUBLISHED') {
    if (adminRoles.includes(role)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Only administrators or the Headteacher can publish results.' };
  }

  // Authorized reopening of finalized/submitted/verified exams
  if (
    (current === 'SUBMITTED' || current === 'VERIFIED' || current === 'FINALIZED') &&
    next === 'DRAFT'
  ) {
    if (role === 'SUPER_ADMIN' || role === 'HEADTEACHER' || role === 'SCHOOL_ADMIN') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Authorized administrator approval is required to reopen this examination.' };
  }

  return {
    allowed: false,
    reason: `Invalid workflow transition from ${current} to ${next}. Enforce DRAFT -> SUBMITTED -> VERIFIED -> FINALIZED -> PUBLISHED.`,
  };
}

export function calculateFeeBalance(
  billedAmount: number,
  discountAmount: number,
  paidAmount: number
): number {
  const billed = Number(billedAmount) || 0;
  const discount = Number(discountAmount) || 0;
  const paid = Number(paidAmount) || 0;
  return Math.round((billed - discount - paid) * 100) / 100;
}

export function calculateAttendanceRate(
  records: Array<{ status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' }>
): {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number;
} {
  const total = records.length;
  if (total === 0) {
    return { total: 0, present: 0, late: 0, absent: 0, excused: 0, rate: 0 };
  }
  let present = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;
  for (const r of records) {
    if (r.status === 'PRESENT') present += 1;
    else if (r.status === 'LATE') late += 1;
    else if (r.status === 'ABSENT') absent += 1;
    else if (r.status === 'EXCUSED') excused += 1;
  }
  const rate = Math.round(((present + late) / total) * 1000) / 10;
  return { total, present, late, absent, excused, rate };
}

export interface TimetableSlotCandidate {
  id?: number;
  termId: number;
  streamId: number;
  staffId: number | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  room: string;
  isBreak?: boolean;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function detectTimetableConflict(
  candidate: TimetableSlotCandidate,
  existingSlots: TimetableSlotCandidate[]
): { hasConflict: boolean; conflictType?: string; message?: string } {
  const candStart = toMinutes(candidate.startTime);
  const candEnd = toMinutes(candidate.endTime);

  if (candEnd <= candStart) {
    return {
      hasConflict: true,
      conflictType: 'INVALID_TIME',
      message: 'End time must be after start time.',
    };
  }

  for (const slot of existingSlots) {
    if (candidate.id && slot.id === candidate.id) continue;
    if (slot.termId !== candidate.termId || slot.dayOfWeek !== candidate.dayOfWeek) continue;

    const slotStart = toMinutes(slot.startTime);
    const slotEnd = toMinutes(slot.endTime);
    const overlaps = candStart < slotEnd && slotStart < candEnd;
    if (!overlaps) continue;

    if (slot.streamId === candidate.streamId) {
      return {
        hasConflict: true,
        conflictType: 'CLASS_CONFLICT',
        message: `Class stream already has a scheduled period from ${slot.startTime} to ${slot.endTime}.`,
      };
    }

    if (!candidate.isBreak && !slot.isBreak && candidate.staffId && slot.staffId === candidate.staffId) {
      return {
        hasConflict: true,
        conflictType: 'TEACHER_CONFLICT',
        message: `Assigned teacher is already booked from ${slot.startTime} to ${slot.endTime} in room ${slot.room}.`,
      };
    }

    if (
      !candidate.isBreak &&
      !slot.isBreak &&
      candidate.room.trim().toLowerCase() === slot.room.trim().toLowerCase()
    ) {
      return {
        hasConflict: true,
        conflictType: 'ROOM_CONFLICT',
        message: `Room ${slot.room} is already occupied from ${slot.startTime} to ${slot.endTime}.`,
      };
    }
  }

  return { hasConflict: false };
}
