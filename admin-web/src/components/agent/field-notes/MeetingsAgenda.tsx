import {
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  Check,
  CircleAlert,
  Phone,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatShortDate, formatTime, type FieldNote } from "../field-notes-data";
import { agendaBuckets, type AgendaDay } from "./follow-up-groups";
import { useNoteActions } from "./note-actions";
import { categoryChip, categoryIcon, categoryLabel } from "./note-theme";

const tabs: { key: AgendaDay; label: string; icon: typeof CalendarDays }[] = [
  { key: "today", label: "Today", icon: CalendarCheck2 },
  { key: "tomorrow", label: "Tomorrow", icon: CalendarClock },
  { key: "overdue", label: "Overdue", icon: CircleAlert },
];

const emptyCopy: Record<AgendaDay, string> = {
  today: "No meetings today. Enjoy the breathing room.",
  tomorrow: "Nothing booked for tomorrow yet.",
  overdue: "You're all caught up. No missed follow-ups.",
};

interface MeetingsAgendaProps {
  notes: FieldNote[];
  onReschedule: (note: FieldNote) => void;
}

const actionButton =
  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full transition-all active:scale-90";

export function MeetingsAgenda({ notes, onReschedule }: MeetingsAgendaProps) {
  const { completeNote } = useNoteActions();
  const buckets = agendaBuckets(notes);
  const [day, setDay] = useState<AgendaDay>("today");
  const rows = buckets[day];

  return (
    <section
      aria-label="Today and tomorrow's meetings"
      className="overflow-hidden rounded-2xl border border-fo-outline/40 bg-fo-low shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div>
          <h2 className="font-fo-display text-lg font-bold tracking-tight text-fo-ink">
            Meetings agenda
          </h2>
          <p className="text-xs text-fo-muted">Everything due soon, so nothing slips through.</p>
        </div>
        <div role="tablist" className="flex items-center gap-1 rounded-full bg-fo-container p-1">
          {tabs.map(({ key, label, icon: Icon }) => {
            const count = buckets[key].length;
            const active = day === key;
            const alert = key === "overdue" && count > 0;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setDay(key)}
                className={cn(
                  "flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all active:scale-95",
                  active
                    ? "bg-fo-lowest text-fo-primary shadow-sm"
                    : "text-fo-muted hover:text-fo-ink",
                )}
              >
                <Icon className={cn("size-3.5", alert && "text-fo-error")} />
                {label}
                <span
                  className={cn(
                    "grid min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                    alert
                      ? "bg-fo-error text-white"
                      : active
                        ? "bg-fo-primary text-white"
                        : "bg-fo-high text-fo-muted",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 pb-5 pt-2 text-sm text-fo-muted">{emptyCopy[day]}</p>
      ) : (
        <ul role="tabpanel" className="grid gap-2 p-3 pt-1 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((note) => {
            const Icon = categoryIcon[note.category];
            return (
              <li
                key={note.id}
                className="flex items-center gap-3 rounded-xl bg-fo-lowest p-3 shadow-sm ring-1 ring-fo-outline/30"
              >
                <div
                  className={cn(
                    "flex w-[4.75rem] shrink-0 flex-col items-center rounded-lg py-1.5",
                    day === "overdue"
                      ? "bg-fo-error-container text-fo-on-error-container"
                      : "bg-fo-primary-fixed text-fo-on-primary-fixed",
                  )}
                >
                  <span className="whitespace-nowrap text-sm font-bold leading-tight tabular-nums">
                    {formatTime(note.followUpAt!)}
                  </span>
                  <span className="text-[10px] font-semibold uppercase opacity-80">
                    {day === "overdue" ? formatShortDate(note.followUpAt!) : day}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-fo-ink">{note.clientName}</p>
                  <p className="truncate text-xs text-fo-muted">{note.followUpLabel}</p>
                  <span
                    className={cn(
                      "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      categoryChip[note.category],
                    )}
                  >
                    <Icon className="size-3" /> {categoryLabel[note.category]}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {note.phone && (
                    <a
                      href={`tel:${note.phone}`}
                      aria-label={`Call ${note.clientName}`}
                      className={cn(
                        actionButton,
                        "bg-fo-container text-fo-primary hover:bg-fo-high",
                      )}
                    >
                      <Phone className="size-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    aria-label={`Reschedule ${note.clientName}`}
                    onClick={() => onReschedule(note)}
                    className={cn(actionButton, "bg-fo-container text-fo-muted hover:bg-fo-high")}
                  >
                    <CalendarClock className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Mark ${note.clientName} done`}
                    onClick={() => completeNote(note)}
                    className={cn(
                      actionButton,
                      "bg-fo-primary text-white hover:bg-fo-primary-container",
                    )}
                  >
                    <Check className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
