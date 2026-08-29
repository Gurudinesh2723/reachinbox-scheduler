import { Redis } from 'ioredis';
import { redis } from '../config/redis';

/**
 * Atomically checks BOTH the per-sender minimum send delay AND the per-sender
 * hourly send limit in a single Redis Lua script, so the check-and-reserve is
 * indivisible even with many concurrent worker processes hitting the same
 * sender at once. This is what makes "10 workers, limit 100" still cap at
 * exactly 100 sends for the hour, and what makes MIN_EMAIL_DELAY hold even
 * when several workers race to send for the same sender simultaneously.
 *
 * KEYS[1] = hourly rate-limit counter key   email-rate:{senderId}:{hourWindow}
 * KEYS[2] = min-delay "next allowed" key    email-delay:{senderId}
 * ARGV[1] = hourlyLimit
 * ARGV[2] = hourWindow TTL in seconds (window length + safety margin)
 * ARGV[3] = now (ms epoch)
 * ARGV[4] = minEmailDelay in ms
 */
const TRY_RESERVE_SLOT_SCRIPT = `
local nextAllowed = tonumber(redis.call('GET', KEYS[2]) or '0')
local now = tonumber(ARGV[3])

if now < nextAllowed then
  return {0, 'min_delay', nextAllowed}
end

local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end

local limit = tonumber(ARGV[1])
if current > limit then
  redis.call('DECR', KEYS[1])
  return {0, 'rate_limited', current}
end

local minDelay = tonumber(ARGV[4])
if minDelay > 0 then
  redis.call('SET', KEYS[2], now + minDelay, 'PX', minDelay + 60000)
end

return {1, 'ok', current}
`;

export type ReserveSlotReason = 'ok' | 'rate_limited' | 'min_delay';

export interface ReserveSlotResult {
  allowed: boolean;
  reason: ReserveSlotReason;
  /** current hourly count when reason=ok/rate_limited, or the ms-epoch the caller must wait until when reason=min_delay */
  info: number;
}

export const HOUR_WINDOW_MS = 60 * 60 * 1000;

export function getHourWindow(date: Date = new Date()): number {
  return Math.floor(date.getTime() / HOUR_WINDOW_MS);
}

export function getHourWindowStart(hourWindow: number): Date {
  return new Date(hourWindow * HOUR_WINDOW_MS);
}

export function getNextHourWindowStart(date: Date = new Date()): Date {
  return getHourWindowStart(getHourWindow(date) + 1);
}

interface RedisWithScript extends Redis {
  trySendSlot(
    rateKey: string,
    delayKey: string,
    hourlyLimit: number,
    windowTtlSeconds: number,
    nowMs: number,
    minDelayMs: number,
  ): Promise<[number, ReserveSlotReason, number]>;
}

let scriptRegistered = false;
function client(): RedisWithScript {
  const c = redis as RedisWithScript;
  if (!scriptRegistered) {
    redis.defineCommand('trySendSlot', {
      numberOfKeys: 2,
      lua: TRY_RESERVE_SLOT_SCRIPT,
    });
    scriptRegistered = true;
  }
  return c;
}

export async function reserveSendSlot(params: {
  senderId: string;
  hourlyLimit: number;
  minEmailDelayMs: number;
  now?: Date;
}): Promise<ReserveSlotResult> {
  const now = params.now ?? new Date();
  const hourWindow = getHourWindow(now);
  const rateKey = `email-rate:${params.senderId}:${hourWindow}`;
  const delayKey = `email-delay:${params.senderId}`;

  const [allowed, reason, info] = await client().trySendSlot(
    rateKey,
    delayKey,
    params.hourlyLimit,
    Math.ceil(HOUR_WINDOW_MS / 1000) + 300,
    now.getTime(),
    params.minEmailDelayMs,
  );

  return { allowed: allowed === 1, reason, info };
}
