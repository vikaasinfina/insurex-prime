import {
  Archive,
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  CheckCheck,
  CircleCheck,
  CirclePause,
  ClipboardList,
  Clock,
  FilePenLine,
  Mic,
  Phone,
  StickyNote,
  Table2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "../agent-ui";
import {
  formatShortDate,
  formatTime,
  type FieldNote,
  type FieldNoteStatus,
} from "../field-notes-data";
import { useNoteActions } from "./note-actions";
import { agendaBuckets, noteStage, noteStageLabel, type NoteStage } from "./follow-up-groups";
import { MeetingsAgenda } from "./MeetingsAgenda";
import { categoryIcon, categoryLabel, paletteFor, tapeTilt } from "./note-theme";

export type NoteStatusFilter = "all" | NoteStage;

interface StickyBoardProps {
  notes: FieldNote[];
  status: NoteStatusFilter;
  onStatusChange: (status: NoteStatusFilter) => void;
  onShowTable: () => void;
  onQuickMemo: () => void;
  onEdit: (note: FieldNote) => void;
  onReschedule: (note: FieldNote) => void;
}

export function StickyBoard({
  notes,
  status,
  onStatusChange,
  onShowTable,
  onQuickMemo,
  onEdit,
  onReschedule,
}: StickyBoardProps) {
  const agenda = agendaBuckets(notes);
  const meetings = agenda.today.length + agenda.tomorrow.length;
  const stageCount = (stage: NoteStage) => notes.filter((n) => noteStage(n) === stage).length;
  const counts: Record<NoteStatusFilter, number> = {
    all: notes.length,
    today: stageCount("today"),
    scheduled: stageCount("scheduled"),
    overdue: stageCount("overdue"),
    logged: stageCount("logged"),
    completed: stageCount("completed"),
  };
  const pending = notes.length - counts.completed;
  const visible = status === "all" ? notes : notes.filter((note) => noteStage(note) === status);

  const pills: [NoteStatusFilter, string][] = [
    ["all", "All"],
    ["today", "Due today"],
    ["scheduled", "Scheduled"],
    ["overdue", "Overdue"],
    ["completed", "Completed"],
  ];

  return (
    <div className="flex flex-col gap-3 lg:gap-5">
      {/* Quick operational stats */}
      <div className="flex items-center justify-between rounded-full bg-fo-low px-4 py-2.5 shadow-sm lg:justify-start lg:gap-8">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-fo-ink sm:text-xs">
          <CalendarDays className="size-4.5 shrink-0 text-fo-primary" />
          <span className="truncate">
            <strong className="text-fo-primary">{meetings}</strong> Today &amp; Tomorrow
          </span>
        </span>
        <span className="size-1 rounded-full bg-fo-outline" />
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-fo-ink sm:text-xs">
          <ClipboardList className="size-4.5 shrink-0 text-fo-tertiary" />
          <span className="truncate">
            <strong className="text-fo-tertiary">{pending}</strong> Pending
          </span>
        </span>
        <span className="size-1 rounded-full bg-fo-outline" />
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-fo-ink sm:text-xs">
          <CircleCheck className="size-4.5 shrink-0 text-emerald-700" />
          <span className="truncate">
            <strong className="text-emerald-800">{counts.completed}</strong> Done
          </span>
        </span>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2 lg:gap-5">
        {/* Quick Memo Mode banner */}
        <div
          role="button"
          tabIndex={0}
          onClick={onQuickMemo}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onQuickMemo();
            }
          }}
          className="relative flex cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-xl bg-fo-primary p-3.5 text-white shadow-md transition-transform active:scale-[0.99] lg:p-5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative grid size-10 shrink-0 place-items-center rounded-full bg-fo-primary-container shadow-sm lg:size-12">
              <Mic className="size-5.5 animate-pulse" />
              <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-fo-tertiary-fixed opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-fo-tertiary-fixed" />
              </span>
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-1">
                <Zap className="size-4 shrink-0 fill-fo-tertiary-fixed text-fo-tertiary-fixed" />
                <span className="truncate font-fo-display text-lg font-semibold tracking-tight">
                  Quick Memo Mode
                </span>
              </div>
              <span className="truncate text-xs text-[#cce5ff]">
                Tap to dictate or drop a memo between visits
              </span>
            </div>
          </div>
          <span className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold text-fo-primary shadow-sm">
            Record <ArrowRight className="size-4" />
          </span>
        </div>

        <MeetingsAgenda notes={notes} onReschedule={onReschedule} />
      </div>

      {/* Title, view toggle and filters */}
      <div className="flex flex-col gap-2.5 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate font-fo-display text-xl font-bold tracking-tight text-fo-ink lg:text-2xl">
              Active Memos
            </h2>
            <span className="hidden shrink-0 rounded-full bg-fo-high px-2 py-0.5 text-[11px] font-bold text-fo-muted min-[420px]:inline">
              {notes.length} total
            </span>
          </div>
          <div className="flex shrink-0 items-center rounded-full bg-fo-container p-1 shadow-inner">
            <span className="flex items-center gap-1 rounded-full bg-fo-lowest px-3 py-1 text-xs font-semibold text-fo-primary shadow-sm">
              <StickyNote className="size-4 fill-fo-primary/15" /> Sticky
            </span>
            <button
              type="button"
              onClick={onShowTable}
              className="flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-fo-muted transition-colors hover:text-fo-ink"
            >
              <Table2 className="size-4" /> Table
            </button>
          </div>
        </div>

        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1.5 pt-0.5 sm:mx-0 sm:px-0">
          {pills.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onStatusChange(value)}
              aria-pressed={status === value}
              className={cn(
                "h-9 shrink-0 cursor-pointer rounded-full px-3.5 text-xs font-semibold transition-all active:scale-95",
                status === value
                  ? "bg-fo-ink text-fo-surface shadow-sm"
                  : "bg-fo-container text-fo-muted hover:text-fo-ink",
              )}
            >
              {label} ({counts[value]})
            </button>
          ))}
        </div>
      </div>

      {/* Sticky memos */}
      {visible.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No memos here"
          description="Nothing matches this filter yet. Drop a memo after your next visit."
          className="border-fo-outline bg-fo-low"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((note, index) => (
            <MemoCard
              key={note.id}
              note={note}
              index={index}
              onEdit={onEdit}
              onReschedule={onReschedule}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MemoCard({
  note,
  index,
  onEdit,
  onReschedule,
}: {
  note: FieldNote;
  index: number;
  onEdit: (note: FieldNote) => void;
  onReschedule: (note: FieldNote) => void;
}) {
  const { archiveNote, completeNote } = useNoteActions();
  const palette = paletteFor(note);
  const Icon = categoryIcon[note.category];
  const stage = noteStage(note);
  const completed = stage === "completed";
  const overdue = stage === "overdue";
  const DueIcon = completed ? CalendarCheck : overdue ? CalendarClock : CalendarRange;
  const iconButton = cn(
    "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full shadow-sm transition-all hover:bg-white active:scale-90",
    palette.softButton,
  );

  return (
    <article
      className={cn(
        "relative flex flex-col gap-2 rounded-xl p-3 transition-transform duration-200 hover:-translate-y-0.5",
        palette.card,
        palette.shadow,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -top-1.5 left-1/2 h-3 w-14 -translate-x-1/2 rounded-[1px] bg-white/70 shadow-sm backdrop-blur-sm",
          tapeTilt[index % tapeTilt.length],
        )}
      />

      <header className="flex items-start justify-between gap-2 pt-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn("grid size-8 shrink-0 place-items-center rounded-lg", palette.badge)}
            title={categoryLabel[note.category]}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <h3
              className={cn(
                "truncate font-fo-display text-[15px] font-bold leading-tight",
                palette.title,
              )}
            >
              {note.clientName}
            </h3>
            <p className={cn("truncate text-[11px] font-medium", palette.sub)}>
              {categoryLabel[note.category]}
              {note.contactName ? ` · ${note.contactName}` : ""}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            palette.badge,
          )}
        >
          {completed ? (
            <CheckCheck className="size-3" />
          ) : overdue ? (
            <CirclePause className="size-3" />
          ) : (
            <span className={cn("size-1.5 rounded-full bg-current", palette.accent)} />
          )}
          {noteStageLabel[stage]}
        </span>
      </header>

      <p className={cn("line-clamp-3 flex-1 text-[13px] leading-snug", palette.title)}>
        {note.note}
      </p>

      <footer className="flex items-center justify-between gap-2 border-t border-current/10 pt-2">
        <div className={cn("min-w-0 text-[11px] font-semibold leading-tight", palette.sub)}>
          <p className="flex items-center gap-1 truncate tabular-nums">
            <DueIcon className={cn("size-3.5 shrink-0", palette.accent)} />
            {note.followUpAt
              ? `${completed ? "" : "Due "}${formatShortDate(note.followUpAt)} · ${formatTime(note.followUpAt)}`
              : "No follow-up"}
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate font-medium opacity-80">
            <Clock className="size-3 shrink-0" />
            Logged {formatShortDate(note.loggedAt)}
            {note.status === "POSTPONED" && !completed ? " · Rescheduled" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {note.phone ? (
            <a
              href={`tel:${note.phone}`}
              aria-label={`Call ${note.clientName}`}
              className={iconButton}
            >
              <Phone className="size-4" />
            </a>
          ) : null}
          <button
            type="button"
            aria-label="Edit memo"
            onClick={() => onEdit(note)}
            className={iconButton}
          >
            <FilePenLine className="size-4" />
          </button>
          {overdue && (
            <button
              type="button"
              aria-label="Reschedule follow-up"
              onClick={() => onReschedule(note)}
              className={iconButton}
            >
              <CalendarDays className="size-4" />
            </button>
          )}
          {completed ? (
            <button
              type="button"
              aria-label="Archive memo"
              onClick={() => archiveNote(note)}
              className={iconButton}
            >
              <Archive className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Mark complete"
              onClick={() => completeNote(note)}
              className={cn(
                "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full shadow-sm transition-all active:scale-90",
                palette.solidButton,
              )}
            >
              <Check className="size-4" />
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
