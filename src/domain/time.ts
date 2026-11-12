export type IsoInstant = string;
export type LocalDate = string;

const ISO_INSTANT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function assertLocalDate(value: string): asserts value is LocalDate {
  const match = LOCAL_DATE.exec(value);
  if (!match || !validCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
    throw new RangeError(`Invalid calendar date: ${value}`);
  }
}

export function assertIsoInstant(value: string): asserts value is IsoInstant {
  const match = ISO_INSTANT.exec(value);
  if (!match) throw new RangeError(`Expected an ISO timestamp with an explicit timezone: ${value}`);
  assertLocalDate(match[1]);
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 || !Number.isFinite(Date.parse(value))) {
    throw new RangeError(`Invalid timestamp: ${value}`);
  }
}

/** Returns the calendar day at the event's recorded timezone, independent of later profile changes. */
export function localDateAt(instant: IsoInstant, timeZone: string): LocalDate {
  assertIsoInstant(instant);
  if (typeof timeZone !== "string" || timeZone.length === 0) throw new RangeError("A timezone is required");

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(instant));
  } catch {
    throw new RangeError(`Invalid IANA timezone: ${timeZone}`);
  }
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year.padStart(4, "0")}-${values.month}-${values.day}`;
}

export function addLocalDays(date: LocalDate, days: number): LocalDate {
  assertLocalDate(date);
  if (!Number.isSafeInteger(days)) throw new RangeError("Day offset must be a safe integer");
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(0);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCFullYear(year, month - 1, day + days);
  return shifted.toISOString().slice(0, 10);
}
