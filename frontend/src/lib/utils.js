import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines multiple Tailwind CSS classes with conflict resolution.
 * @param {...(string|undefined|null|false)} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Formats an ISO date string to a localized date.
 * @param {string|null|undefined} dateString
 * @returns {string}
 */
export function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? dateString : d.toLocaleDateString();
  } catch {
    return dateString;
  }
}

/**
 * Formats an ISO date string to a localized date and time.
 * @param {string|null|undefined} dateString
 * @returns {string}
 */
export function formatDateTime(dateString) {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? dateString : d.toLocaleString();
  } catch {
    return dateString;
  }
}

/**
 * Formats an ISO date/time string into a local clinic time format (e.g. "09:30 AM").
 * @param {string|null|undefined} dateString
 * @returns {string}
 */
export function formatTime(dateString) {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    return isNaN(d.getTime())
      ? dateString
      : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return dateString;
  }
}

/**
 * Formats a numeric value into USD currency format.
 * @param {number|null|undefined} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Standard clinic timezone (Asia/Kolkata, UTC+05:30).
 */
export const CLINIC_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns today's date string (YYYY-MM-DD) in the clinic timezone (Asia/Kolkata).
 * @param {Date} [baseDate=new Date()]
 * @returns {string}
 */
export function getClinicTodayDateString(baseDate = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(baseDate);
}

/**
 * Calculates the next calendar day string (YYYY-MM-DD) using pure UTC arithmetic,
 * avoiding any local browser timezone or DST bias.
 * @param {string} dateStr YYYY-MM-DD
 * @returns {string}
 */
export function getNextDateStringUtc(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcMs = Date.UTC(year, month - 1, day);
  const nextDayUtcMs = utcMs + 24 * 60 * 60 * 1000;
  const nextDate = new Date(nextDayUtcMs);
  const nextYear = nextDate.getUTCFullYear();
  const nextMonth = String(nextDate.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(nextDate.getUTCDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

/**
 * Converts a YYYY-MM-DD date string into the exact UTC ISO string for midnight (00:00:00.000)
 * in the specified timezone (defaults to CLINIC_TIMEZONE = 'Asia/Kolkata').
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} [timeZone=CLINIC_TIMEZONE]
 * @returns {string} UTC ISO string (e.g. "2026-11-14T18:30:00.000Z")
 */
export function getStartOfDayUtc(dateStr, timeZone = CLINIC_TIMEZONE) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  let targetUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  for (let i = 0; i < 2; i++) {
    const parts = formatter.formatToParts(new Date(targetUtc));
    const p = {};
    for (const { type, value } of parts) p[type] = value;
    const hour = p.hour === '24' ? 0 : Number(p.hour);
    const asUtc = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      hour,
      Number(p.minute),
      Number(p.second)
    );
    const diff = asUtc - Date.UTC(year, month - 1, day, 0, 0, 0);
    targetUtc -= diff;
  }
  return new Date(targetUtc).toISOString();
}

/**
 * Converts a YYYY-MM-DD date string into the exact UTC ISO string for the exclusive end
 * of that calendar day (midnight 00:00:00.000 of the next calendar day) in the specified timezone.
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} [timeZone=CLINIC_TIMEZONE]
 * @returns {string} UTC ISO string (e.g. "2026-11-15T18:30:00.000Z")
 */
export function getExclusiveEndOfDayUtc(dateStr, timeZone = CLINIC_TIMEZONE) {
  if (!dateStr) return '';
  const nextDateStr = getNextDateStringUtc(dateStr);
  return getStartOfDayUtc(nextDateStr, timeZone);
}

/**
 * Returns the ISO UTC start and exclusive end bounds for a given calendar day in the clinic timezone.
 * @param {string} [dateStr] YYYY-MM-DD string (defaults to clinic today)
 * @param {string} [timeZone=CLINIC_TIMEZONE]
 * @returns {{ start: string, end: string, dateStr: string }}
 */
export function getClinicDayBounds(dateStr, timeZone = CLINIC_TIMEZONE) {
  const d = dateStr || getClinicTodayDateString();
  const start = getStartOfDayUtc(d, timeZone);
  const end = getExclusiveEndOfDayUtc(d, timeZone);
  return { start, end, dateStr: d };
}

