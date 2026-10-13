import {
  AlarmClock,
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CalendarX2,
  ChevronDown,
  CircleCheck,
  CirclePause,
  CloudCheck,
  ListChecks,
  MessageCircle,
  NotebookPen,
  Pencil,
  Phone,
  Pin,
  Search,
  SearchX,
  Share,
  StickyNote,
  Table2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useFieldNoteActions,
  formatLongDate,
  formatShortDate,
  formatTime,
  isDueSoon,
  notesToCsv,
  relativeDayLabel,
  type FieldNote,
} from "../field-notes-data";
import {
  filterNotes,
  groupNotesByFollowUp,
  noteStage,
  noteStageLabel,
  type FollowUpGroup,
  type FollowUpGroupKey,
} from "./follow-up-groups";
import { avatarTone, initialsOfClient } from "./note-theme";
import type { NoteStatusFilter } from "./StickyBoard";

interface NotesTableProps {
  notes: FieldNote[];
  status: NoteStatusFilter;
  onStatusChange: (status: NoteStatusFilter) => void;
  dueSoonOnly: boolean;
  onDueSoonChange: (value: boolean) => void;
  onShowBoard: () => void;
  onEdit: (note: FieldNote) => void;
  onReschedule: (notes: FieldNote[]) => void;
}

/** Section header styling per follow-up group, in the Field Ops palette. */
const groupTone: Record<
  FollowUpGroupKey,
  { icon: LucideIcon; row: string; text: string; count: string }
> = {
  overdue: {
    icon: TriangleAlert,
    row: "bg-fo-error-container/70 border-fo-error",
    text: "text-fo-on-error-container",
    count: "bg-fo-error text-white",
  },
  today: {
    icon: AlarmClock,
    row: "bg-fo-tertiary-fixed/60 border-fo-tertiary-container",
    text: "text-fo-tertiary",
    count: "bg-fo-tertiary-container text-white",
  },
  next3: {
    icon: CalendarDays,
    row: "bg-fo-primary-fixed/60 border-fo-primary",
    text: "text-fo-primary",
    count: "bg-fo-primary text-white",
  },
  next5: {
    icon: CalendarRange,
    row: "bg-fo-high border-fo-primary-container",
    text: "text-fo-primary-container",
    count: "bg-fo-primary-container text-white",
  },
  upcoming: {
    icon: CalendarCheck,
    row: "bg-fo-container border-fo-secondary",
    text: "text-fo-ink",
    count: "bg-fo-secondary text-white",
  },
  none: {
    icon: CalendarX2,
    row: "bg-fo-low border-fo-outline",
    text: "text-fo-muted",
    count: "bg-fo-outline text-fo-ink",
  },
};

/** The current date, refreshed after local midnight and when the tab regains focus. */
function useToday() {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const refresh = () =>
      setToday((prev) => (new Date().toDateString() === prev.toDateString() ? prev : new Date()));
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = window.setTimeout(refresh, nextMidnight.getTime() - now.getTime());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [today]);
  return today;
}

/** Checkbox that can show the "some selected" state. */
function TriStateCheckbox({
  checked,
  indeterminate,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onChange={(event) => onChange(event.target.checked)}
      className="size-4.5 cursor-pointer accent-fo-primary"
    />
  );
}

function GroupHeaderRow({
  group,
  collapsed,
  onToggle,
  selection,
}: {
  group: FollowUpGroup;
  collapsed: boolean;
  onToggle: () => void;
  selection: ReactNode;
}) {
  const tone = groupTone[group.key];
  const Icon = tone.icon;
  return (
    <tr className={cn("border-l-4", tone.row)}>
      <th scope="rowgroup" colSpan={7} className="p-0 text-left font-normal">
        {/* Sticky so the heading stays in view while the table scrolls sideways. */}
        <div className="sticky left-0 flex w-fit max-w-[100vw] items-center gap-3 py-2 pl-3 pr-4">
          {selection}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-controls={`follow-up-group-${group.key}`}
            className={cn(
              "flex min-h-9 cursor-pointer items-center gap-2 rounded-lg text-left",
              tone.text,
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="whitespace-nowrap font-fo-display text-sm font-bold">
              {group.title}
            </span>
            <span
              className={cn(
                "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                tone.count,
              )}
            >
              {group.notes.length}
            </span>
            <span className="whitespace-nowrap text-xs font-medium text-fo-muted tabular-nums">
              {group.description}
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-fo-muted transition-transform",
                collapsed && "-rotate-90",
              )}
            />
          </button>
        </div>
      </th>
    </tr>
  );
}

function StatusBadge({ note }: { note: FieldNote }) {
  const stage = noteStage(note);
  if (stage === "completed")
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-fo-high px-2.5 py-1 text-[11px] font-bold text-fo-ink">
        <CircleCheck className="size-3.5 fill-fo-primary text-white" /> Completed
      </span>
    );
  if (stage === "overdue")
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-fo-error-container px-2.5 py-1 text-[11px] font-bold text-fo-on-error-container">
        <CirclePause className="size-3.5" /> Overdue
      </span>
    );
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-fo-tertiary-container px-2.5 py-1 text-[11px] font-bold text-white">
        <span className="relative flex size-1.5">
          {stage === "today" && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-fo-tertiary-fixed" />
          )}
          <span className="relative inline-flex size-1.5 rounded-full bg-fo-tertiary-fixed" />
        </span>
        {noteStageLabel[stage]}
      </span>
      {note.status === "POSTPONED" && (
        <span className="text-[10px] font-semibold text-fo-muted">Rescheduled</span>
      )}
    </span>
  );
}

function FollowUpCell({ note }: { note: FieldNote }) {
  if (!note.followUpAt) return <span className="text-sm text-fo-muted">—</span>;
  if (note.status === "COMPLETED")
    return (
      <span className="whitespace-nowrap text-sm font-medium tabular-nums text-fo-muted">
        {note.recurring
          ? `${note.recurring} (${new Date(note.followUpAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })})`
          : formatLongDate(note.followUpAt)}
      </span>
    );
  if (isDueSoon(note)) {
    const Icon = note.status === "POSTPONED" ? AlarmClock : TriangleAlert;
    return (
      <div className="inline-flex flex-col">
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-bold tabular-nums text-fo-error">
          <Icon className="size-3.5" />
          {formatShortDate(note.followUpAt)} ({relativeDayLabel(note.followUpAt)})
        </span>
        <span className="whitespace-nowrap text-xs text-fo-muted">
          {formatTime(note.followUpAt)} • {note.followUpLabel}
        </span>
      </div>
    );
  }
  return (
    <div className="inline-flex flex-col">
      <span className="whitespace-nowrap text-sm font-medium tabular-nums text-fo-ink">
        {formatLongDate(note.followUpAt)}
      </span>
      <span className="whitespace-nowrap text-xs text-fo-muted">{note.followUpLabel}</span>
    </div>
  );
}

function MemoPill({ note }: { note: FieldNote }) {
  const [expanded, setExpanded] = useState(false);
  const open = note.status !== "COMPLETED";
  const TagIcon =
    note.status === "COMPLETED" ? BadgeCheck : note.status === "POSTPONED" ? CalendarClock : Pin;
  return (
    <button
      type="button"
      onClick={() => setExpanded((value) => !value)}
      aria-expanded={expanded}
      className={cn(
        "block w-full max-w-[260px] cursor-pointer rounded-lg p-2 text-left transition-shadow",
        open ? "bg-fo-tertiary-fixed/30" : "bg-fo-container",
        expanded && "shadow-md",
      )}
    >
      <p
        className={cn(
          "text-xs",
          open ? "font-medium text-fo-tertiary" : "text-fo-ink",
          !expanded && "line-clamp-2",
        )}
      >
        {note.note}
      </p>
      <span
        className={cn(
          "mt-1 inline-flex items-center gap-0.5 text-[11px] font-bold",
          open ? "text-fo-tertiary" : "text-fo-muted",
        )}
      >
        <TagIcon className="size-3" /> {note.tag}
      </span>
    </button>
  );
}

export function NotesTable({
  notes,
  status,
  onStatusChange,
  dueSoonOnly,
  onDueSoonChange,
  onShowBoard,
  onEdit,
  onReschedule,
}: NotesTableProps) {
  const noteActions = useFieldNoteActions();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<FollowUpGroupKey>>(new Set());
  const today = useToday();

  const dueSoonCount = notes.filter((note) => isDueSoon(note)).length;
  const filtered = useMemo(
    () => filterNotes(notes, { query, status, dueSoonOnly }),
    [notes, query, status, dueSoonOnly],
  );
  // Grouping runs on the filtered rows, so sections and counts match the search.
  const groups = useMemo(() => groupNotesByFollowUp(filtered, today), [filtered, today]);
  const visibleGroups = groups.filter((group) => group.notes.length > 0);
  const ordered = visibleGroups.flatMap((group) => group.notes);
  const rows = visibleGroups.flatMap((group) => (collapsed.has(group.key) ? [] : group.notes));

  // Forget selections that are no longer visible.
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(notes.map((note) => note.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [notes]);

  const selectionOf = (list: FieldNote[]) => {
    const count = list.filter((note) => selected.has(note.id)).length;
    return { all: list.length > 0 && count === list.length, some: count > 0 };
  };
  const setMany = (list: FieldNote[], checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      list.forEach((note) => (checked ? next.add(note.id) : next.delete(note.id)));
      return next;
    });
  const visibleSelection = selectionOf(rows);
  const toggleAll = (checked: boolean) => setMany(rows, checked);
  const toggleGroup = (key: FollowUpGroupKey) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const jumpTo = (key: FollowUpGroupKey) => {
    setCollapsed((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    requestAnimationFrame(() =>
      document
        .getElementById(`follow-up-group-${key}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const toggleOne = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const selectedNotes = notes.filter((note) => selected.has(note.id));

  const markCompleted = () => {
    if (!selectedNotes.length) {
      toast.info("Select at least one record");
      return;
    }
    const previous = selectedNotes.map((note) => [note.id, note.status] as const);
    noteActions
      .updateMany(
        selectedNotes.map((note) => note.id),
        { status: "COMPLETED" },
      )
      .then(() => {
        setSelected(new Set());
        toast.success(`Updated ${previous.length} records to Completed`, {
          action: {
            label: "Undo",
            onClick: () =>
              previous.forEach(
                ([id, prev]) => void noteActions.update(id, { status: prev }).catch(() => {}),
              ),
          },
        });
      })
      .catch(() => {});
  };

  const reschedule = () => {
    if (!selectedNotes.length) {
      toast.info("Select at least one record");
      return;
    }
    onReschedule(selectedNotes);
  };

  const exportCsv = () => {
    const source = selectedNotes.length ? selectedNotes : ordered;
    const blob = new Blob([notesToCsv(source)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `field-notes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${source.length} records to CSV`);
  };

  const resetFilters = () => {
    setQuery("");
    onStatusChange("all");
    onDueSoonChange(false);
  };

  const stickyCell = "sticky z-[1] bg-inherit";
  const actionButton =
    "grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-fo-container transition-all hover:bg-fo-high active:scale-95 sm:size-8";

  return (
    <div className="-mx-4 flex flex-col sm:mx-0 sm:overflow-hidden sm:rounded-xl sm:border sm:border-fo-outline/50 sm:bg-fo-lowest">
      {/* View switcher & action strip */}
      <div className="flex flex-col gap-3 bg-fo-low px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-full bg-fo-container p-1 shadow-sm">
            <button
              type="button"
              onClick={onShowBoard}
              className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-fo-muted transition-all hover:text-fo-ink"
            >
              <StickyNote className="size-4" /> Sticky Board
            </button>
            <span className="flex items-center gap-1.5 rounded-full bg-fo-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
              <Table2 className="size-4" /> Table View
            </span>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-fo-highest px-3 text-xs font-semibold text-fo-ink shadow-sm transition-all active:scale-95"
            title="Export table data"
          >
            <Share className="size-4 text-fo-primary" /> Export
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-fo-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search client name, notes, policy tags..."
              aria-label="Search field records"
              className="h-11 w-full rounded-full bg-fo-lowest pl-10 pr-8 text-sm text-fo-ink shadow-sm placeholder:text-fo-muted focus:outline-none focus:ring-2 focus:ring-fo-primary/40 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-fo-muted hover:text-fo-ink"
              >
                <X className="size-4.5" />
              </button>
            )}
          </div>
          <div className="relative">
            <select
              value={status}
              onChange={(event) => onStatusChange(event.target.value as NoteStatusFilter)}
              aria-label="Filter by status"
              className="h-11 cursor-pointer appearance-none rounded-full bg-fo-lowest pl-3 pr-8 text-xs font-semibold text-fo-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-fo-primary/40"
            >
              <option value="all">All Status</option>
              <option value="today">Due today</option>
              <option value="scheduled">Scheduled</option>
              <option value="overdue">Overdue</option>
              <option value="logged">Logged</option>
              <option value="completed">Completed</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4.5 -translate-y-1/2 text-fo-muted" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl bg-fo-container px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-fo-primary" />
            <span className="text-[11px] font-bold text-fo-muted">
              Showing <strong className="text-fo-ink">{filtered.length}</strong> field records
            </span>
          </div>
          <button
            type="button"
            onClick={() => onDueSoonChange(!dueSoonOnly)}
            aria-pressed={dueSoonOnly}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors",
              dueSoonOnly
                ? "bg-fo-error text-white"
                : "bg-fo-error-container text-fo-on-error-container",
            )}
          >
            <AlarmClock className="size-3.5" />
            {dueSoonCount} follow-ups &lt; 48h
            {dueSoonOnly && <X className="size-3" />}
          </button>
        </div>
      </div>

      {/* Ledger context */}
      <div className="flex items-center justify-between gap-2 bg-fo-surface px-4 py-2 sm:bg-fo-lowest">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-fo-primary-fixed text-fo-on-primary-fixed">
            <NotebookPen className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-fo-muted">Sticky Notes Ledger</p>
            <p className="text-xs font-semibold text-fo-ink">
              Auto-Synced from Voice Memos &amp; Field Pins
            </p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-fo-primary lg:hidden">
          Scroll horizontally <ArrowRight className="size-4" />
        </span>
      </div>

      {/* Follow-up groups at a glance; empty groups stay listed with a zero count. */}
      {ordered.length > 0 && (
        <nav
          aria-label="Follow-up groups"
          className="no-scrollbar flex items-center gap-2 overflow-x-auto bg-fo-surface px-4 pb-3 pt-1 sm:bg-fo-lowest"
        >
          {groups.map((group) => {
            const tone = groupTone[group.key];
            const Icon = tone.icon;
            const empty = group.notes.length === 0;
            return (
              <button
                key={group.key}
                type="button"
                disabled={empty}
                onClick={() => jumpTo(group.key)}
                className={cn(
                  "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors disabled:cursor-default",
                  empty
                    ? "bg-fo-low text-fo-muted/70"
                    : cn(tone.row, tone.text, "hover:brightness-95"),
                )}
              >
                <Icon className="size-3.5" />
                {group.title}
                <span
                  className={cn(
                    "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                    empty ? "bg-fo-container text-fo-muted" : tone.count,
                  )}
                >
                  {group.notes.length}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Horizontally scrollable table with frozen checkbox + client columns */}
      {ordered.length > 0 ? (
        <div className="relative w-full overflow-x-auto shadow-inner">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="bg-fo-high text-fo-muted">
                <th
                  scope="col"
                  className={cn(
                    stickyCell,
                    "left-0 z-[2] w-12 py-3 pl-4 pr-3 shadow-[2px_0_4px_rgba(0,0,0,0.03)]",
                  )}
                >
                  <TriStateCheckbox
                    label="Select all visible records"
                    checked={visibleSelection.all}
                    indeterminate={visibleSelection.some && !visibleSelection.all}
                    onChange={toggleAll}
                  />
                </th>
                <th
                  scope="col"
                  className={cn(
                    stickyCell,
                    "left-12 z-[2] min-w-[170px] px-3 py-3 text-xs font-semibold uppercase tracking-wider text-fo-ink shadow-[4px_0_6px_rgba(0,0,0,0.04)]",
                  )}
                >
                  Client Name
                </th>
                <th
                  scope="col"
                  className="min-w-[110px] px-3 py-3 text-xs font-semibold uppercase tracking-wider"
                >
                  Logged Date
                </th>
                <th
                  scope="col"
                  className="min-w-[250px] px-3 py-3 text-xs font-semibold uppercase tracking-wider"
                >
                  Comments &amp; Field Memo
                </th>
                <th
                  scope="col"
                  className="min-w-[130px] px-3 py-3 text-xs font-semibold uppercase tracking-wider"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="min-w-[160px] px-3 py-3 text-xs font-semibold uppercase tracking-wider"
                >
                  Next Follow-Up
                </th>
                <th
                  scope="col"
                  className="min-w-[120px] py-3 pl-3 pr-4 text-right text-xs font-semibold uppercase tracking-wider"
                >
                  Quick Actions
                </th>
              </tr>
            </thead>
            {visibleGroups.map((group) => {
              const isCollapsed = collapsed.has(group.key);
              const groupSelection = selectionOf(group.notes);
              const toneOffset = ordered.indexOf(group.notes[0]!);
              return (
                <tbody key={group.key} id={`follow-up-group-${group.key}`} className="scroll-mt-24">
                  <GroupHeaderRow
                    group={group}
                    collapsed={isCollapsed}
                    onToggle={() => toggleGroup(group.key)}
                    selection={
                      <TriStateCheckbox
                        label={`Select all ${group.title} records`}
                        checked={groupSelection.all}
                        indeterminate={groupSelection.some && !groupSelection.all}
                        onChange={(checked) => setMany(group.notes, checked)}
                      />
                    }
                  />
                  {!isCollapsed &&
                    group.notes.map((note, rowIndex) => {
                      const toneIndex = toneOffset + rowIndex;
                      const zebra = rowIndex % 2 === 0 ? "bg-fo-lowest" : "bg-fo-low";
                      const whatsapp = note.phone.replace(/\D/g, "");
                      return (
                        <tr
                          key={note.id}
                          className={cn(
                            "transition-colors hover:bg-fo-low",
                            zebra,
                            selected.has(note.id) && "bg-fo-low",
                          )}
                        >
                          <td
                            className={cn(
                              stickyCell,
                              "left-0 py-3 pl-4 pr-3 shadow-[2px_0_4px_rgba(0,0,0,0.03)]",
                            )}
                          >
                            <input
                              type="checkbox"
                              aria-label={`Select ${note.clientName}`}
                              checked={selected.has(note.id)}
                              onChange={(event) => toggleOne(note.id, event.target.checked)}
                              className="size-4.5 cursor-pointer accent-fo-primary"
                            />
                          </td>
                          <td
                            className={cn(
                              stickyCell,
                              "left-12 px-3 py-3 shadow-[4px_0_6px_rgba(0,0,0,0.04)]",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
                                  avatarTone(toneIndex),
                                )}
                              >
                                {initialsOfClient(note.clientName)}
                              </span>
                              <div className="min-w-0">
                                <p className="max-w-[130px] truncate text-sm font-semibold text-fo-ink">
                                  {note.clientName}
                                </p>
                                <p className="max-w-[130px] text-xs text-fo-muted">
                                  {note.coverage}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-sm font-medium tabular-nums text-fo-ink">
                            {formatLongDate(note.loggedAt)}
                          </td>
                          <td className="px-3 py-3">
                            <MemoPill note={note} />
                          </td>
                          <td className="px-3 py-3">
                            <StatusBadge note={note} />
                          </td>
                          <td className="px-3 py-3">
                            <FollowUpCell note={note} />
                          </td>
                          <td className="py-3 pl-3 pr-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <a
                                href={note.phone ? `tel:${note.phone}` : undefined}
                                title="Call contact"
                                aria-label={`Call ${note.clientName}`}
                                className={cn(actionButton, "text-fo-primary")}
                              >
                                <Phone className="size-4" />
                              </a>
                              <a
                                href={whatsapp ? `https://wa.me/${whatsapp}` : undefined}
                                target="_blank"
                                rel="noreferrer"
                                title="SMS / WhatsApp"
                                aria-label={`Message ${note.clientName}`}
                                className={cn(actionButton, "text-fo-tertiary")}
                              >
                                <MessageCircle className="size-4" />
                              </a>
                              <button
                                type="button"
                                onClick={() => onEdit(note)}
                                title="Edit memo"
                                aria-label={`Edit memo for ${note.clientName}`}
                                className={cn(actionButton, "text-fo-muted")}
                              >
                                <Pencil className="size-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              );
            })}
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <span className="mb-3 grid size-16 place-items-center rounded-full bg-fo-container text-fo-muted">
            <SearchX className="size-8" />
          </span>
          <h3 className="mb-1 font-fo-display text-lg font-semibold text-fo-ink">
            No Client Records Found
          </h3>
          <p className="mb-4 max-w-xs text-sm text-fo-muted">
            No matching sticky notes or names align with your current search and filter settings.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="h-10 cursor-pointer rounded-full bg-fo-primary px-4 text-xs font-semibold text-white"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Batch actions */}
      <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-2xl bg-fo-inverse p-3 text-fo-inverse-on shadow-lg">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full bg-fo-primary-fixed text-[11px] font-bold text-fo-on-primary-fixed">
            {selected.size}
          </span>
          <span className="text-xs font-semibold">Selected</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={markCompleted}
            className="flex h-9 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-white/15 px-3 text-[11px] font-bold transition-all hover:bg-white/25 active:scale-95"
          >
            <ListChecks className="size-4" /> Mark Completed
          </button>
          <button
            type="button"
            onClick={reschedule}
            className="flex h-9 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-fo-tertiary px-3 text-[11px] font-bold text-white transition-all active:scale-95"
          >
            <CalendarClock className="size-4" /> Reschedule
          </button>
        </div>
      </div>

      {/* Sync status */}
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-4">
        <div className="flex items-center gap-1.5 text-xs text-fo-muted">
          <CloudCheck className="size-3.5 text-emerald-600" />
          <span>Ledger synced with offline cache just now</span>
        </div>
      </div>
    </div>
  );
}
