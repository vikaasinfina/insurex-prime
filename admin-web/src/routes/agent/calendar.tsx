import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useFieldNotes } from "@/components/agent/field-notes-data";
import { noteStatusLabel } from "@/components/agent/field-notes-data";
import type { CalendarEvent } from "@/components/calendar/calendar-utils";
import { ScheduleCalendar } from "@/components/calendar/ScheduleCalendar";

export const Route = createFileRoute("/agent/calendar")({
  head: () => ({ meta: [{ title: "Calendar — InsuroX Prime" }] }),
  component: AgentCalendarPage,
});

function AgentCalendarPage() {
  const { notes } = useFieldNotes();

  // Each sticky note with a follow-up date shows on that day, next to the meetings.
  const noteEvents = useMemo<CalendarEvent[]>(
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

  return <ScheduleCalendar scope="agent" extraEvents={noteEvents} />;
}
