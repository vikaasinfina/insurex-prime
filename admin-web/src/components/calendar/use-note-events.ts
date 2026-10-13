import { useMemo } from "react";
import { noteStatusLabel, useFieldNotes } from "@/components/agent/field-notes-data";
import type { CalendarEvent } from "./calendar-utils";

/** Each of the signed-in user's sticky notes that has a follow-up date, as a calendar event. */
export function useNoteEvents(): CalendarEvent[] {
  const { notes } = useFieldNotes();
  return useMemo(
    () =>
      notes.flatMap((note) => {
        if (!note.followUpAt) return [];
        const start = new Date(note.followUpAt);
        return [
          {
            id: `n-${note.id}`,
            kind: "note" as const,
            title: note.clientName,
            subtitle:
              [note.followUpLabel, note.note].filter(Boolean).join(" — ") ||
              noteStatusLabel[note.status],
            start,
            end: start,
            tone: note.status === "COMPLETED" ? ("done" as const) : ("note" as const),
            noteId: note.id,
          },
        ];
      }),
    [notes],
  );
}
