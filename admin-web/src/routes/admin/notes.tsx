import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AdminFooter } from "@/components/admin/AdminFooter";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import {
  FieldNotesPage,
  validateNotesSearch,
  type NotesSearch,
} from "@/components/agent/field-notes/FieldNotesPage";
import { requireAdminSession } from "@/lib/admin-route-guard";

export const Route = createFileRoute("/admin/notes")({
  ssr: false,
  beforeLoad: requireAdminSession,
  validateSearch: validateNotesSearch,
  head: () => ({ meta: [{ title: "Field Notes — InsuroX Prime" }] }),
  component: AdminNotesPage,
});

function AdminNotesPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/notes" });

  return (
    <div className="min-h-screen bg-surface/30 text-foreground">
      <AdminSidebar
        currentPath="/admin/notes"
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="app-shell-pad flex min-h-screen flex-col">
        <AdminHeader onToggleSidebar={() => setSidebarOpen(true)} />

        <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight">Field Notes</h1>
            <p className="text-sm text-muted-foreground">
              Your own sticky memos and follow-ups. They appear on your calendar and are emailed to
              you, with a reminder an hour before.
            </p>
          </div>
          <FieldNotesPage
            search={search}
            onSearchChange={(patch: Partial<NotesSearch>) =>
              void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
            }
          />
        </main>
        <AdminFooter />
      </div>
    </div>
  );
}
