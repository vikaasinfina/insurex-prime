import { createFileRoute } from "@tanstack/react-router";
import { ScheduleCalendar } from "@/components/calendar/ScheduleCalendar";
import { useNoteEvents } from "@/components/calendar/use-note-events";

export const Route = createFileRoute("/agent/calendar")({
  head: () => ({ meta: [{ title: "Calendar — InsuroX Prime" }] }),
  component: AgentCalendarPage,
});

function AgentCalendarPage() {
  // Sticky-note follow-ups show on their day, next to the meetings.
  return <ScheduleCalendar scope="agent" extraEvents={useNoteEvents()} />;
}
