import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouterState } from "@tanstack/react-router";
import {
  fieldNotesApi,
  retryUnlessClientError,
  type ApiFieldNote,
  type FieldNoteInput,
} from "@/lib/api";
import { calendarDaysBetween, noteStage, noteStageLabel } from "./field-notes/follow-up-groups";

/**
 * Field notes ("sticky memos") an agent drops between customer visits.
 *
 * Stored per user (agent or admin) on the backend (`/field-notes`); `FieldNote` is the shape the screens use.
 */
export type FieldNoteStatus = "IN_PROGRESS" | "COMPLETED" | "POSTPONED";

/** Matches the policy lines of business (Life, Health, Motor, Commercial). */
export type FieldNoteCategory = "life" | "health" | "motor" | "commercial";

export interface FieldNote {
  id: string;
  /** Client or business name. */
  clientName: string;
  /** Person met, with role. */
  contactName: string;
  phone: string;
  /** Cover being discussed, e.g. "Fleet Motor #MT-904". */
  coverage: string;
  category: FieldNoteCategory;
  /** ISO timestamp the memo was logged. */
  loggedAt: string;
  note: string;
  /** Short tag shown under the memo, e.g. "Sticky Note #104". */
  tag: string;
  status: FieldNoteStatus;
  /** ISO timestamp of the next follow-up (null when nothing is scheduled). */
  followUpAt: string | null;
  /** What the follow-up is, e.g. "Renewal call". */
  followUpLabel: string;
  /** Set for recurring/annual follow-ups ("Annual review"). */
  recurring?: string;
}

export const noteStatusLabel: Record<FieldNoteStatus, string> = {
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  POSTPONED: "Rescheduled",
};

const categoryFromApi = (category: ApiFieldNote["category"]): FieldNoteCategory =>
  category.toLowerCase() as FieldNoteCategory;
const categoryToApi = (category: FieldNoteCategory) =>
  category.toUpperCase() as ApiFieldNote["category"];

const fromApi = (note: ApiFieldNote): FieldNote => ({
  id: note.id,
  clientName: note.clientName,
  contactName: note.contactName,
  phone: note.phone,
  coverage: note.coverage,
  category: categoryFromApi(note.category),
  loggedAt: note.loggedAt,
  note: note.note,
  tag: note.tag,
  status: note.status,
  followUpAt: note.followUpAt,
  followUpLabel: note.followUpLabel,
  ...(note.recurring ? { recurring: note.recurring } : {}),
});

const toApiPatch = (patch: Partial<FieldNote>): FieldNoteInput => {
  const { id: _id, loggedAt: _loggedAt, tag: _tag, category, recurring, ...rest } = patch;
  return {
    ...rest,
    ...(category ? { category: categoryToApi(category) } : {}),
    ...(recurring !== undefined ? { recurring } : {}),
  };
};

/**
 * Admins and agents share the notes screens but never each other's data, so each portal
 * caches under its own root (the sign-out of that portal clears it).
 */
export function useNoteKey() {
  const admin = useRouterState({ select: (state) => state.location.pathname.startsWith("/admin") });
  return [admin ? "admin" : "agent", "field-notes"] as const;
}

/** The signed-in user's memos, newest first. */
export function useFieldNotes() {
  const key = useNoteKey();
  const query = useQuery({
    queryKey: key,
    queryFn: async () => (await fieldNotesApi.list()).map(fromApi),
    retry: retryUnlessClientError,
  });
  return { ...query, notes: query.data ?? [] };
}

/**
 * Create / update / delete memos. Edits show instantly (optimistic) and roll back with an
 * error toast if the server rejects them; the list is re-fetched afterwards either way.
 */
export function useFieldNoteActions() {
  const queryClient = useQueryClient();
  const key = useNoteKey();
  const read = () => queryClient.getQueryData<FieldNote[]>(key) ?? [];
  const write = (next: FieldNote[]) => queryClient.setQueryData(key, next);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  /** Runs `request` after applying `optimistic`; on failure restores the old list. */
  async function optimistic<T>(
    apply: (list: FieldNote[]) => FieldNote[],
    request: () => Promise<T>,
  ) {
    await queryClient.cancelQueries({ queryKey: key });
    const previous = read();
    write(apply(previous));
    try {
      const result = await request();
      void refresh();
      return result;
    } catch (error) {
      write(previous);
      toast.error(error instanceof Error ? error.message : "Couldn't save the change.");
      throw error;
    }
  }

  return {
    async add(input: Omit<FieldNote, "id" | "loggedAt" | "tag">) {
      try {
        const created = await fieldNotesApi.create({
          ...toApiPatch(input),
          clientName: input.clientName,
          note: input.note,
          category: categoryToApi(input.category),
        });
        await refresh();
        return fromApi(created);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't save the memo.");
        throw error;
      }
    },
    update: (id: string, patch: Partial<FieldNote>) =>
      optimistic(
        (list) => list.map((note) => (note.id === id ? { ...note, ...patch } : note)),
        () => fieldNotesApi.update(id, toApiPatch(patch)),
      ),
    updateMany: (ids: string[], patch: Partial<FieldNote>) => {
      const set = new Set(ids);
      return optimistic(
        (list) => list.map((note) => (set.has(note.id) ? { ...note, ...patch } : note)),
        () => fieldNotesApi.bulkUpdate(ids, toApiPatch(patch)),
      );
    },
    remove: (id: string) =>
      optimistic(
        (list) => list.filter((note) => note.id !== id),
        () => fieldNotesApi.remove(id),
      ),
    /** Puts a removed memo back (undo), keeping its original tag and logged date. */
    async restore(note: FieldNote) {
      await fieldNotesApi.create({
        ...toApiPatch(note),
        clientName: note.clientName,
        note: note.note,
        category: categoryToApi(note.category),
        tag: note.tag,
        loggedAt: note.loggedAt,
      });
      await refresh();
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Date maths lives in field-notes/follow-up-groups so the table, badges and grouping agree.
export { isDueSoon } from "./field-notes/follow-up-groups";

/** Whole calendar days from today until the follow-up (negative when overdue). */
export const daysUntilFollowUp = (iso: string) => calendarDaysBetween(iso) ?? 0;

export function relativeDayLabel(iso: string) {
  const days = daysUntilFollowUp(iso);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return `${-days} days overdue`;
  return `In ${days} days`;
}

export const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export const formatLongDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

export function notesToCsv(rows: FieldNote[]) {
  const header = [
    "Client",
    "Contact",
    "Phone",
    "Coverage",
    "Logged",
    "Status",
    "Next follow-up",
    "Follow-up",
    "Memo",
  ];
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = rows.map((note) =>
    [
      note.clientName,
      note.contactName,
      note.phone,
      note.coverage,
      formatLongDate(note.loggedAt),
      noteStageLabel[noteStage(note)],
      note.followUpAt ? `${formatLongDate(note.followUpAt)} ${formatTime(note.followUpAt)}` : "",
      note.followUpLabel,
      note.note,
    ]
      .map(escape)
      .join(","),
  );
  return [header.map(escape).join(","), ...lines].join("\n");
}
