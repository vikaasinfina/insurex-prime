import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminFooter } from "@/components/admin/AdminFooter";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ScheduleCalendar } from "@/components/calendar/ScheduleCalendar";
import { useNoteEvents } from "@/components/calendar/use-note-events";
import { requireAdminSession } from "@/lib/admin-route-guard";

export const Route = createFileRoute("/admin/calendar")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: () => ({ meta: [{ title: "Calendar — InsuroX Prime" }] }),
  component: AdminCalendarPage,
});

function AdminCalendarPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const noteEvents = useNoteEvents();

  return (
    <div className="min-h-screen bg-surface/30 text-foreground">
      <AdminSidebar
        currentPath="/admin/calendar"
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="app-shell-pad flex min-h-screen flex-col">
        <AdminHeader onToggleSidebar={() => setSidebarOpen(true)} />

        <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              Schedule & Calendar
            </h1>
            <p className="text-sm text-muted-foreground">
              Meet with your agents. Invited agents see the meeting and its join link on their
              calendar.
            </p>
          </div>
          <ScheduleCalendar scope="admin" extraEvents={noteEvents} />
        </main>
        <AdminFooter />
      </div>
    </div>
  );
}
