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
 * Returns the ISO UTC start and end bounds for a given calendar day in the clinic timezone.
 * @param {string} [dateStr] YYYY-MM-DD string (defaults to clinic today)
 * @returns {{ start: string, end: string, dateStr: string }}
 */
export function getClinicDayBounds(dateStr) {
  const d = dateStr || getClinicTodayDateString();
  const start = new Date(`${d}T00:00:00+05:30`).toISOString();
  const end = new Date(`${d}T23:59:59.999+05:30`).toISOString();
  return { start, end, dateStr: d };
}

