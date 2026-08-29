import { describe, expect, it } from 'vitest';
import { calculateScheduleTimes } from '../../src/services/scheduleCalculator';

describe('calculateScheduleTimes', () => {
  it('spaces emails by delayBetweenEmailsSeconds within an hour bucket', () => {
    const startTime = new Date('2026-01-01T09:00:00.000Z');
    const times = calculateScheduleTimes({
      startTime,
      count: 3,
      delayBetweenEmailsSeconds: 30,
      hourlyLimit: 100,
    });

    expect(times[0].toISOString()).toBe('2026-01-01T09:00:00.000Z');
    expect(times[1].toISOString()).toBe('2026-01-01T09:00:30.000Z');
    expect(times[2].toISOString()).toBe('2026-01-01T09:01:00.000Z');
  });

  it('rolls remaining emails into the next hour window once the hourly limit is hit', () => {
    const startTime = new Date('2026-01-01T09:00:00.000Z');
    const times = calculateScheduleTimes({
      startTime,
      count: 250,
      delayBetweenEmailsSeconds: 1,
      hourlyLimit: 100,
    });

    // First 100 stay within hour 1 (09:00 - 10:00)
    const hour1 = times.slice(0, 100);
    expect(hour1.every((t) => t.getTime() < new Date('2026-01-01T10:00:00.000Z').getTime())).toBe(true);

    // Next 100 (index 100-199) must start exactly at the next hour boundary
    expect(times[100].toISOString()).toBe('2026-01-01T10:00:00.000Z');

    // Remaining 50 (index 200-249) roll into the third hour window
    expect(times[200].toISOString()).toBe('2026-01-01T11:00:00.000Z');
  });

  it('never places more than hourlyLimit emails inside any single hour window', () => {
    const startTime = new Date('2026-01-01T00:00:00.000Z');
    const times = calculateScheduleTimes({
      startTime,
      count: 500,
      delayBetweenEmailsSeconds: 1,
      hourlyLimit: 100,
    });

    const perHourCounts = new Map<number, number>();
    for (const t of times) {
      const hourBucket = Math.floor(t.getTime() / (60 * 60 * 1000));
      perHourCounts.set(hourBucket, (perHourCounts.get(hourBucket) ?? 0) + 1);
    }

    for (const count of perHourCounts.values()) {
      expect(count).toBeLessThanOrEqual(100);
    }
    expect(perHourCounts.size).toBe(5); // 500 / 100 per hour = 5 hour windows
  });

  it('returns an empty array for zero recipients', () => {
    expect(calculateScheduleTimes({ startTime: new Date(), count: 0, delayBetweenEmailsSeconds: 2, hourlyLimit: 100 })).toEqual([]);
  });
});
