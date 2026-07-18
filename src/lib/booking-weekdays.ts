export const DEFAULT_BOOKING_WORK_DAYS = [1, 2, 3, 4, 5, 6] as const;
export const DEFAULT_BOOKING_VIP_DAYS = [1, 2, 3, 4] as const;

export function normalizeBookingWeekday(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed === 0) return 7;
  if (parsed >= 1 && parsed <= 7) return parsed;
  return null;
}

export function normalizeBookingWeekdays(
  days: unknown,
  fallback: readonly number[] = DEFAULT_BOOKING_WORK_DAYS,
) {
  const source = Array.isArray(days) && days.length > 0 ? days : fallback;
  const normalized = Array.from(
    new Set(
      source
        .map(normalizeBookingWeekday)
        .filter((day): day is number => day !== null),
    ),
  ).sort((a, b) => a - b);

  if (normalized.length > 0) return normalized;
  return Array.from(fallback).sort((a, b) => a - b);
}

export function bookingWeekdayFromDate(date: Date) {
  return normalizeBookingWeekday(date.getDay()) ?? 7;
}

export function includesBookingWeekday(
  days: unknown,
  weekday: number,
  fallback: readonly number[] = DEFAULT_BOOKING_WORK_DAYS,
) {
  const normalizedWeekday = normalizeBookingWeekday(weekday);
  if (normalizedWeekday === null) return false;
  return normalizeBookingWeekdays(days, fallback).includes(normalizedWeekday);
}
