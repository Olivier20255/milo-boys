import { describe, expect, it } from 'vitest';
import {
  calculateAttendanceRate,
  calculateFeeBalance,
  calculateGradeFromScale,
  calculateMeanGradeFromPoints,
  canTransitionExamStatus,
  detectTimetableConflict,
} from '../src/server/domain.ts';

describe('MILO BOYS SMIS Domain Logic & Security Controls', () => {
  it('computes KCSE grades and points accurately from configurable scale', () => {
    expect(calculateGradeFromScale(86)).toEqual({ grade: 'A', points: 12, remarks: 'Excellent' });
    expect(calculateGradeFromScale(75)).toEqual({ grade: 'A-', points: 11, remarks: 'Very Good' });
    expect(calculateGradeFromScale(52)).toEqual({ grade: 'C', points: 6, remarks: 'Average' });
    expect(calculateGradeFromScale(24)).toEqual({ grade: 'E', points: 1, remarks: 'Very Poor' });
    expect(calculateMeanGradeFromPoints(10.6)).toBe('A-');
  });

  it('enforces the 5-stage examination workflow and role authorization', () => {
    expect(canTransitionExamStatus('DRAFT', 'SUBMITTED', 'TEACHER').allowed).toBe(true);
    expect(canTransitionExamStatus('DRAFT', 'PUBLISHED', 'SUPER_ADMIN').allowed).toBe(false);
    expect(canTransitionExamStatus('SUBMITTED', 'VERIFIED', 'TEACHER').allowed).toBe(false);
    expect(canTransitionExamStatus('SUBMITTED', 'VERIFIED', 'SCHOOL_ADMIN').allowed).toBe(true);
    expect(canTransitionExamStatus('VERIFIED', 'FINALIZED', 'HEADTEACHER').allowed).toBe(true);
    expect(canTransitionExamStatus('FINALIZED', 'PUBLISHED', 'SCHOOL_ADMIN').allowed).toBe(true);
    expect(canTransitionExamStatus('FINALIZED', 'PUBLISHED', 'ACCOUNTANT').allowed).toBe(false);
    expect(canTransitionExamStatus('FINALIZED', 'DRAFT', 'HEADTEACHER').allowed).toBe(true);
    expect(canTransitionExamStatus('FINALIZED', 'DRAFT', 'TEACHER').allowed).toBe(false);
  });

  it('calculates student fee balances with bursary discounts accurately', () => {
    expect(calculateFeeBalance(38500, 5000, 20000)).toBe(13500);
    expect(calculateFeeBalance(38500, 0, 38500)).toBe(0);
    expect(calculateFeeBalance(38500, 2500, 40000)).toBe(-4000);
  });

  it('computes student and staff attendance rates accurately', () => {
    const stats = calculateAttendanceRate([
      { status: 'PRESENT' },
      { status: 'PRESENT' },
      { status: 'LATE' },
      { status: 'ABSENT' },
      { status: 'EXCUSED' },
    ]);
    expect(stats.total).toBe(5);
    expect(stats.present).toBe(2);
    expect(stats.late).toBe(1);
    expect(stats.absent).toBe(1);
    expect(stats.excused).toBe(1);
    expect(stats.rate).toBe(60);
  });

  it('detects and prevents class, teacher, and room timetable conflicts', () => {
    const existing = [
      {
        id: 1,
        termId: 2,
        streamId: 1,
        staffId: 10,
        dayOfWeek: 'MONDAY',
        startTime: '08:00',
        endTime: '08:40',
        room: 'F1-N',
      },
    ];

    // Overlapping same class stream
    expect(
      detectTimetableConflict(
        {
          termId: 2,
          streamId: 1,
          staffId: 12,
          dayOfWeek: 'MONDAY',
          startTime: '08:20',
          endTime: '09:00',
          room: 'Lab 1',
        },
        existing
      )
    ).toMatchObject({ hasConflict: true, conflictType: 'CLASS_CONFLICT' });

    // Overlapping same teacher in different stream
    expect(
      detectTimetableConflict(
        {
          termId: 2,
          streamId: 2,
          staffId: 10,
          dayOfWeek: 'MONDAY',
          startTime: '08:00',
          endTime: '08:40',
          room: 'F2-N',
        },
        existing
      )
    ).toMatchObject({ hasConflict: true, conflictType: 'TEACHER_CONFLICT' });

    // Overlapping same room
    expect(
      detectTimetableConflict(
        {
          termId: 2,
          streamId: 2,
          staffId: 15,
          dayOfWeek: 'MONDAY',
          startTime: '08:15',
          endTime: '08:55',
          room: 'f1-n',
        },
        existing
      )
    ).toMatchObject({ hasConflict: true, conflictType: 'ROOM_CONFLICT' });

    // Conflict-free slot
    expect(
      detectTimetableConflict(
        {
          termId: 2,
          streamId: 1,
          staffId: 10,
          dayOfWeek: 'MONDAY',
          startTime: '08:40',
          endTime: '09:20',
          room: 'F1-N',
        },
        existing
      )
    ).toEqual({ hasConflict: false });
  });
});
