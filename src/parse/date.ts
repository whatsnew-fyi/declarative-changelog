export interface HeadingDate {
  raw: string;
  hasTime: boolean;
  /** Whether the value names a real calendar date / time. */
  valid: boolean;
  /** Epoch milliseconds. A date-only value means midnight UTC, per the spec. */
  ms: number;
}

// `full-date ("T" partial-time time-offset)?` — when a time is present it
// carries seconds and an offset, per the grammar. `T`/`Z` are case-insensitive,
// per RFC 3339 itself.
const DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-]\d{2}:\d{2}))?$/;

/** The same pattern, for locating a date anchored at the end of a longer string. */
export const DATE_AT_END_RE =
  /(\d{4}-\d{2}-\d{2}(?:[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2}))?)$/;

export function parseIsoDate(raw: string): HeadingDate | undefined {
  const m = DATE_RE.exec(raw);
  if (!m) return undefined;
  const [, year, month, day, hour, minute, second, offset] = m;
  const hasTime = hour !== undefined;
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = Number(hour ?? 0);
  const mi = Number(minute ?? 0);
  const s = Number(second ?? 0);

  let valid =
    mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo) && h < 24 && mi < 60 && s < 60;
  let offsetMinutes = 0;
  if (offset && offset.toUpperCase() !== "Z") {
    const oh = Number(offset.slice(1, 3));
    const om = Number(offset.slice(4, 6));
    if (oh > 14 || om > 59) valid = false;
    offsetMinutes = (oh * 60 + om) * (offset.startsWith("-") ? -1 : 1);
  }

  const ms =
    Date.UTC(y, mo - 1, d, h, mi, s) +
    (raw.includes(".") ? fractionMs(raw) : 0) -
    offsetMinutes * 60_000;

  return { raw, hasTime, valid, ms };
}

function fractionMs(raw: string): number {
  const m = /\.(\d+)/.exec(raw);
  return m ? Math.round(Number(`0.${m[1]}`) * 1000) : 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
