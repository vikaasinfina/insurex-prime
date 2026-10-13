import type { ApiMeeting } from "@/lib/api";

export type CalendarView = "day" | "week" | "month" | "agenda";

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
/** Weeks run Monday to Sunday. */
export const startOfWeek = (date: Date) => addDays(startOfDay(date), -((date.getDay() + 6) % 7));
export const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
export const isSameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** The dates a view shows plus the [from, to) window to load. */
export function viewRange(view: CalendarView, anchor: Date) {
  let from: Date;
  let to: Date;
  if (view === "day") {
    from = startOfDay(anchor);
    to = addDays(from, 1);
  } else if (view === "week") {
    from = startOfWeek(anchor);
    to = addDays(from, 7);
  } else if (view === "month") {
    from = startOfWeek(startOfMonth(anchor));
    to = addDays(from, 42);
  } else {
    from = startOfDay(anchor);
    to = addDays(from, 30);
  }
  return { from, to };
}

export function shiftAnchor(view: CalendarView, anchor: Date, direction: 1 | -1) {
  if (view === "day") return addDays(anchor, direction);
  if (view === "month") return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  return addDays(anchor, direction * (view === "week" ? 7 : 30));
}

const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" });
export const formatTime = (date: Date) => timeFormat.format(date).toUpperCase();
export const formatTimeRange = (start: Date, end: Date) =>
  `${formatTime(start)} – ${formatTime(end)}`;
export const formatDay = (date: Date, options: Intl.DateTimeFormatOptions) =>
  date.toLocaleDateString("en-IN", options);

export function rangeTitle(view: CalendarView, anchor: Date) {
  const { from, to } = viewRange(view, anchor);
  if (view === "day")
    return formatDay(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "month") return formatDay(anchor, { month: "long", year: "numeric" });
  const last = addDays(to, -1);
  const short: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${formatDay(from, short)} – ${formatDay(last, { ...short, year: "numeric" })}`;
}

/** `YYYY-MM-DD` and `HH:mm` (local) for the date and time inputs. */
export const toDateInput = (date: Date) => dayKey(date);
export const toTimeInput = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
export const fromInputs = (date: string, time: string) => new Date(`${date}T${time}`);

export type EventTone = "meeting" | "invite" | "note" | "done";

export interface CalendarEvent {
  id: string;
  kind: "meeting" | "note";
  title: string;
  subtitle: string;
  start: Date;
  end: Date;
  tone: EventTone;
  meeting?: ApiMeeting;
  noteId?: string;
}

export const meetingToEvent = (meeting: ApiMeeting, viewerIsOrganizer: boolean): CalendarEvent => ({
  id: `m-${meeting.id}`,
  kind: "meeting",
  title: meeting.title,
  subtitle: viewerIsOrganizer
    ? `${meeting.attendees.length} invited`
    : `Scheduled by ${meeting.organizer.name}`,
  start: new Date(meeting.startsAt),
  end: new Date(meeting.endsAt),
  tone: viewerIsOrganizer ? "meeting" : "invite",
  meeting,
});

/** Group by local day, each day's events in time order. */
export function groupByDay(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of [...events].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const key = dayKey(event.start);
    map.set(key, [...(map.get(key) ?? []), event]);
  }
  return map;
}

export function meetingLinkLabel(url: string) {
  try {
    const host = new URL(url).hostname;
    if (host.endsWith("meet.google.com")) return "Google Meet";
    if (host.endsWith("zoom.us") || host.endsWith("zoom.com")) return "Zoom";
    if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "Teams";
  } catch {
    // fall through
  }
  return "Meeting link";
}
