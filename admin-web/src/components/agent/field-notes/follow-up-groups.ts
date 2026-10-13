import type { FieldNote } from "../field-notes-data";

/**
 * Calendar-date helpers and the follow-up grouping used by the Field Notes table.
 *
 * Everything compares *calendar days in the agent's local time zone*, never raw
 * timestamps, so a 9 am follow-up tomorrow is "1 day away" whether it is 8 am or
 * 11:59 pm today. Kept free of React/browser imports so it can be unit tested with
 * `node --test`.
 */

export type FollowUpGroupKey = "overdue" | "today" | "next3" | "next5" | "upcoming" | "none";

/** Display order of the sections. */
export const FOLLOW_UP_GROUP_ORDER: readonly FollowUpGroupKey[] = [
  "overdue",
  "today",
  "next3",
  "next5",
  "upcoming",
  "none",
];

export const followUpGroupTitle: Record<FollowUpGroupKey, string> = {
  overdue: "Overdue",
  today: "Today",
  next3: "Next 3 Days",
  next5: "Next 5 Days",
  upcoming: "Upcoming",
  none: "No Follow-Up Date",
};

interface CalendarDay {
  year: number;
  /** 0-based, like `Date#getMonth`. */
  month: number;
  day: number;
}

const DAY_MS = 86_400_000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The local calendar day of a follow-up value. Accepts ISO timestamps (what the notes
 * store holds) and plain `YYYY-MM-DD` dates (read as that calendar day, not UTC
 * midnight). Returns null for missing or unparseable values.
 */
export function toCalendarDay(value: string | Date | null | undefined): CalendarDay | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const dateOnly = DATE_ONLY.exec(value.trim());
    if (dateOnly) {
      const [year, month, day] = [
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
      ];
      const check = new Date(year, month, day);
      // Rejects impossible dates such as 2026-02-31.
      if (check.getFullYear() !== year || check.getMonth() !== month || check.getDate() !== day)
        return null;
      return { year, month, day };
    }
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

/** Whole calendar days from `reference` to `value` (negative when in the past), or null. */
export function calendarDaysBetween(
  value: string | Date | null | undefined,
  reference: Date = new Date(),
): number | null {
  const target = toCalendarDay(value);
  const base = toCalendarDay(reference);
  if (!target || !base) return null;
  // Date.UTC on both sides keeps daylight-saving shifts out of the subtraction.
  return Math.round(
    (Date.UTC(target.year, target.month, target.day) - Date.UTC(base.year, base.month, base.day)) /
      DAY_MS,
  );
}

/** Which section a follow-up belongs to, relative to `today`. */
export function followUpGroupOf(
  followUpAt: string | null | undefined,
  today: Date = new Date(),
): FollowUpGroupKey {
  const days = calendarDaysBetween(followUpAt, today);
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 3) return "next3";
  if (days <= 5) return "next5";
  return "upcoming";
}

/** Open (not completed) follow-ups due within the next 48 hours, including overdue ones. */
export function isDueSoon(note: FieldNote, now: Date = new Date()) {
  if (note.status === "COMPLETED" || !note.followUpAt) return false;
  const at = new Date(note.followUpAt).getTime();
  return !Number.isNaN(at) && at - now.getTime() < 2 * DAY_MS;
}

const followUpTime = (note: FieldNote) => {
  const time = note.followUpAt ? new Date(note.followUpAt).getTime() : Number.NaN;
  return Number.isNaN(time) ? null : time;
};

/** Earliest follow-up first; ties (and undated notes) by client name, then id. */
export function compareByFollowUp(a: FieldNote, b: FieldNote) {
  const timeA = followUpTime(a);
  const timeB = followUpTime(b);
  if (timeA !== null && timeB !== null && timeA !== timeB) return timeA - timeB;
  if (timeA === null && timeB !== null) return 1;
  if (timeA !== null && timeB === null) return -1;
  return (
    a.clientName.localeCompare(b.clientName, "en-IN", { sensitivity: "base" }) ||
    a.id.localeCompare(b.id)
  );
}

export interface FollowUpGroup {
  key: FollowUpGroupKey;
  title: string;
  /** Date range the section covers, e.g. "12 Oct – 14 Oct". */
  description: string;
  notes: FieldNote[];
}

const shortDay = (date: Date) =>
  date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export function followUpGroupDescription(key: FollowUpGroupKey, today: Date = new Date()) {
  switch (key) {
    case "overdue":
      return `Before ${shortDay(today)}`;
    case "today":
      return today.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    case "next3":
      return `${shortDay(addDays(today, 1))} – ${shortDay(addDays(today, 3))}`;
    case "next5":
      return `${shortDay(addDays(today, 4))} – ${shortDay(addDays(today, 5))}`;
    case "upcoming":
      return `From ${shortDay(addDays(today, 6))}`;
    case "none":
      return "Not scheduled yet";
  }
}

/**
 * Splits notes into the six follow-up sections (every note lands in exactly one),
 * each sorted earliest first. All six groups are returned, empty ones included, in
 * display order.
 */
export function groupNotesByFollowUp(
  notes: FieldNote[],
  today: Date = new Date(),
): FollowUpGroup[] {
  const buckets = new Map<FollowUpGroupKey, FieldNote[]>(
    FOLLOW_UP_GROUP_ORDER.map((key) => [key, []]),
  );
  for (const note of notes) buckets.get(followUpGroupOf(note.followUpAt, today))!.push(note);
  return FOLLOW_UP_GROUP_ORDER.map((key) => ({
    key,
    title: followUpGroupTitle[key],
    description: followUpGroupDescription(key, today),
    notes: buckets.get(key)!.sort(compareByFollowUp),
  }));
}

export interface NoteFilters {
  query: string;
  status: "all" | NoteStage;
  dueSoonOnly: boolean;
}

/** Search (client, contact, cover/policy, memo, tag) + status + "due < 48h" filters. */
export function filterNotes(notes: FieldNote[], filters: NoteFilters, now: Date = new Date()) {
  const q = filters.query.trim().toLowerCase();
  return notes.filter((note) => {
    if (filters.status !== "all" && noteStage(note, now) !== filters.status) return false;
    if (filters.dueSoonOnly && !isDueSoon(note, now)) return false;
    if (!q) return true;
    return [note.clientName, note.contactName, note.coverage, note.note, note.tag]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

export type AgendaDay = "overdue" | "today" | "tomorrow";

/** Open follow-ups that need attention: missed, today and tomorrow, in time order. */
export function agendaBuckets(notes: FieldNote[], now: Date = new Date()) {
  const open = notes.filter((note) => note.status !== "COMPLETED" && note.followUpAt);
  const bucket = (match: (days: number) => boolean) =>
    open
      .filter((note) => {
        const days = calendarDaysBetween(note.followUpAt, now);
        return days !== null && match(days);
      })
      .sort(compareByFollowUp);
  return {
    overdue: bucket((days) => days < 0),
    today: bucket((days) => days === 0),
    tomorrow: bucket((days) => days === 1),
  } satisfies Record<AgendaDay, FieldNote[]>;
}

/**
 * What the agent sees as a memo's status. It is derived from the follow-up date, never
 * picked by hand; the only thing stored is whether the memo has been completed.
 */
export type NoteStage = "scheduled" | "today" | "overdue" | "logged" | "completed";

export const noteStageLabel: Record<NoteStage, string> = {
  scheduled: "Scheduled",
  today: "Due today",
  overdue: "Overdue",
  logged: "Logged",
  completed: "Completed",
};

export function noteStage(note: FieldNote, now: Date = new Date()): NoteStage {
  if (note.status === "COMPLETED") return "completed";
  const days = calendarDaysBetween(note.followUpAt, now);
  if (days === null) return "logged";
  if (days < 0) return "overdue";
  return days === 0 ? "today" : "scheduled";
}
