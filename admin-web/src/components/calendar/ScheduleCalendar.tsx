import { ChevronLeft, ChevronRight, ExternalLink, Plus, StickyNote, Video } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApiMeeting } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  addDays,
  dayKey,
  formatDay,
  formatTime,
  formatTimeRange,
  groupByDay,
  isSameDay,
  meetingLinkLabel,
  meetingToEvent,
  rangeTitle,
  shiftAnchor,
  startOfDay,
  viewRange,
  type CalendarEvent,
  type CalendarView,
  type EventTone,
} from "./calendar-utils";
import { EventDetailDialog, MeetingFormDialog, type MeetingFormState } from "./MeetingDialogs";
import { useMeetings, type CalendarScope } from "./use-calendar-data";

const views: { id: CalendarView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "agenda", label: "Agenda" },
];

const toneStyle: Record<EventTone, { bar: string; chip: string; dot: string; label: string }> = {
  meeting: {
    bar: "border-l-blue-500",
    chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
    label: "Scheduled by you",
  },
  invite: {
    bar: "border-l-cyan-500",
    chip: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
    dot: "bg-cyan-500",
    label: "Invited",
  },
  note: {
    bar: "border-l-amber-400",
    chip: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
    dot: "bg-amber-400",
    label: "Field note",
  },
  done: {
    bar: "border-l-slate-400",
    chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    dot: "bg-slate-400",
    label: "Completed note",
  },
};

export interface ScheduleCalendarProps {
  scope: CalendarScope;
  /** Extra events (an agent's sticky-note follow-ups). Only those in view are shown. */
  extraEvents?: CalendarEvent[];
}

export function ScheduleCalendar({ scope, extraEvents = [] }: ScheduleCalendarProps) {
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [form, setForm] = useState<MeetingFormState | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const { from, to } = viewRange(view, anchor);
  const meetings = useMeetings(scope, from, to);

  const events = useMemo(() => {
    const fromMs = from.getTime();
    const toMs = to.getTime();
    const meetingEvents = (meetings.data ?? []).map((meeting) =>
      meetingToEvent(meeting, meeting.canEdit),
    );
    const noteEvents = extraEvents.filter(
      (event) => event.start.getTime() >= fromMs && event.start.getTime() < toMs,
    );
    return [...meetingEvents, ...noteEvents];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings.data, extraEvents, from.getTime(), to.getTime()]);

  const byDay = useMemo(() => groupByDay(events), [events]);
  const today = new Date();
  const meetingCount = events.filter((event) => event.kind === "meeting").length;

  const newMeeting = (day?: Date) => {
    const start = day ? new Date(day) : undefined;
    if (start) start.setHours(10, 0, 0, 0);
    setForm(start ? { start } : {});
  };
  const edit = (meeting: ApiMeeting) => {
    setSelected(null);
    setForm({ meeting });
  };

  const dayColumn = (day: Date, roomy: boolean) => {
    const list = byDay.get(dayKey(day)) ?? [];
    return (
      <div key={dayKey(day)} className="flex min-w-0 flex-col gap-3">
        <div
          className={cn(
            "flex items-center justify-between gap-1 rounded-2xl border p-3.5 lg:p-2.5 2xl:p-3.5",
            isSameDay(day, today)
              ? "border-2 border-primary bg-primary/10"
              : "border-border bg-card",
          )}
        >
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {formatDay(day, { weekday: "short" })}
              {isSameDay(day, today) && (
                <span className="rounded bg-primary px-1.5 text-[9px] text-primary-foreground">
                  Today
                </span>
              )}
            </div>
            <div className="font-display text-base font-extrabold lg:text-sm 2xl:text-base">
              {formatDay(day, { day: "numeric", month: "short" })}
            </div>
          </div>
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {list.length}
            <span className="hidden 2xl:inline">{list.length === 1 ? " event" : " events"}</span>
          </span>
        </div>

        {list.map((event) => (
          <EventCard key={event.id} event={event} onOpen={setSelected} roomy={roomy} />
        ))}

        <button
          type="button"
          onClick={() => newMeeting(day)}
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/20 py-4 text-muted-foreground transition-colors hover:border-primary/60 hover:bg-card hover:text-primary"
        >
          <Plus className="mb-1 size-4" />
          <span className="text-[11px] font-semibold">Add meeting</span>
        </button>
      </div>
    );
  };

  const days = (count: number, start: Date) =>
    Array.from({ length: count }, (_, i) => addDays(start, i));

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl border border-border bg-background p-0.5">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}
              className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchor(startOfDay(new Date()))}
              className="cursor-pointer rounded-lg px-3 py-1 text-xs font-semibold hover:bg-muted"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}
              className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <h2 className="font-display text-sm font-bold tracking-wide sm:text-base">
            {rangeTitle(view, anchor)}
          </h2>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            {meetingCount} {meetingCount === 1 ? "meeting" : "meetings"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Calendar view"
            className="flex rounded-xl border border-border bg-background p-1 text-xs font-medium"
          >
            {views.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={view === item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  "cursor-pointer rounded-lg px-3 py-1 transition-colors",
                  view === item.id
                    ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Button onClick={() => newMeeting()} className="rounded-xl">
            <Plus className="mr-1.5 size-4" /> New meeting
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-xs font-medium text-muted-foreground">
        {(["meeting", "invite", "note", "done"] as const).map((tone) => (
          <span key={tone} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", toneStyle[tone].dot)} />
            {toneStyle[tone].label}
          </span>
        ))}
      </div>

      {meetings.isError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <span>Couldn't load meetings.</span>
          <Button size="sm" variant="outline" onClick={() => void meetings.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {view === "week" && (
        <div
          className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-7 lg:gap-2 2xl:gap-3.5"
          aria-busy={meetings.isPending}
        >
          {days(7, from).map((day) => dayColumn(day, false))}
        </div>
      )}

      {view === "day" && <div className="mx-auto max-w-xl">{dayColumn(from, true)}</div>}

      {view === "month" && (
        <MonthGrid
          anchor={anchor}
          from={from}
          byDay={byDay}
          today={today}
          onOpenDay={(day) => {
            setAnchor(day);
            setView("day");
          }}
          onOpenEvent={setSelected}
        />
      )}

      {view === "agenda" && (
        <div className="space-y-4">
          {byDay.size === 0 && !meetings.isPending && (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nothing scheduled in the next 30 days.
            </p>
          )}
          {[...byDay.entries()].map(([key, list]) => (
            <section key={key}>
              <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {formatDay(list[0]!.start, { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {list.map((event) => (
                  <EventCard key={event.id} event={event} onOpen={setSelected} roomy />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <MeetingFormDialog scope={scope} state={form} onClose={() => setForm(null)} />
      <EventDetailDialog
        scope={scope}
        event={selected}
        onClose={() => setSelected(null)}
        onEdit={edit}
      />
    </div>
  );
}

function EventCard({
  event,
  onOpen,
  roomy,
}: {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
  roomy: boolean;
}) {
  const style = toneStyle[event.tone];
  const meeting = event.meeting;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(event)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(event)}
      className={cn(
        "cursor-pointer rounded-2xl border border-l-4 border-border bg-card p-3.5 shadow-sm transition-colors hover:bg-muted/40 lg:p-2.5 2xl:p-3.5",
        style.bar,
        event.tone === "done" && "opacity-70",
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            style.chip,
          )}
        >
          {event.kind === "note" && <StickyNote className="size-3" />}
          {event.kind === "note" ? "Follow-up" : event.tone === "invite" ? "Invited" : "Meeting"}
        </span>
        <span className="text-[11px] font-semibold text-muted-foreground">
          {event.kind === "note"
            ? formatTime(event.start)
            : formatTimeRange(event.start, event.end)}
        </span>
      </div>
      <h4 className={cn("text-sm font-bold", event.tone === "done" && "line-through")}>
        {event.title}
      </h4>
      <p className={cn("mt-0.5 text-xs text-muted-foreground", !roomy && "line-clamp-2")}>
        {event.subtitle}
      </p>
      {meeting?.meetingUrl && (
        <a
          href={meeting.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Video className="size-3.5" />
          <span className="lg:max-2xl:hidden">{meetingLinkLabel(meeting.meetingUrl)}: </span>
          Join
          <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}

function MonthGrid({
  anchor,
  from,
  byDay,
  today,
  onOpenDay,
  onOpenEvent,
}: {
  anchor: Date;
  from: Date;
  byDay: Map<string, CalendarEvent[]>;
  today: Date;
  onOpenDay: (day: Date) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const cells = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {cells.slice(0, 7).map((day) => (
          <div key={day.getDay()} className="py-2">
            {formatDay(day, { weekday: "short" })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day) => {
          const list = byDay.get(dayKey(day)) ?? [];
          const inMonth = day.getMonth() === anchor.getMonth();
          return (
            <div
              key={dayKey(day)}
              className={cn(
                "min-h-20 min-w-0 border-b border-r border-border/60 p-1 sm:min-h-28 sm:p-1.5",
                !inMonth && "bg-muted/20 text-muted-foreground/60",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenDay(day)}
                aria-label={formatDay(day, { weekday: "long", day: "numeric", month: "long" })}
                className={cn(
                  "mb-1 grid size-6 cursor-pointer place-items-center rounded-full text-xs font-semibold hover:bg-muted",
                  isSameDay(day, today) && "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                {day.getDate()}
              </button>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onOpenEvent(event)}
                    title={event.title}
                    className={cn(
                      "block w-full cursor-pointer truncate rounded px-1 py-0.5 text-left text-[10px] font-semibold sm:text-[11px]",
                      toneStyle[event.tone].chip,
                    )}
                  >
                    <span className="hidden sm:inline">{formatTime(event.start)} </span>
                    {event.title}
                  </button>
                ))}
                {list.length > 3 && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(day)}
                    className="block w-full cursor-pointer px-1 text-left text-[10px] font-semibold text-muted-foreground hover:text-primary"
                  >
                    +{list.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
