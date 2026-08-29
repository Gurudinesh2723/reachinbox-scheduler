const HOUR_MS = 60 * 60 * 1000;

/**
 * Computes an initial `scheduledAt` for every recipient in a campaign,
 * spacing sends by `delayBetweenEmailsSeconds` and never placing more than
 * `hourlyLimit` sends inside any single hour bucket starting at `startTime`.
 *
 * This is only the *initial* placement so the UI/DB show sensible times -
 * the BullMQ worker re-checks the real distributed rate limit at send time
 * (see services/rateLimiter.ts) and is the actual source of truth, since the
 * limit or delay could change, jobs could be retried, etc. Calculating this
 * up front keeps the common case (no rescheduling needed) fast and gives
 * users an accurate preview of when their campaign will complete.
 */
export function calculateScheduleTimes(params: {
  startTime: Date;
  count: number;
  delayBetweenEmailsSeconds: number;
  hourlyLimit: number;
}): Date[] {
  const { startTime, count, delayBetweenEmailsSeconds, hourlyLimit } = params;
  const times: Date[] = [];

  let windowStart = new Date(startTime);
  let cursor = new Date(startTime);
  let sentInWindow = 0;

  for (let i = 0; i < count; i++) {
    if (sentInWindow >= hourlyLimit) {
      windowStart = new Date(windowStart.getTime() + HOUR_MS);
      cursor = new Date(windowStart);
      sentInWindow = 0;
    }

    times.push(new Date(cursor));
    sentInWindow += 1;
    cursor = new Date(cursor.getTime() + delayBetweenEmailsSeconds * 1000);
  }

  return times;
}
