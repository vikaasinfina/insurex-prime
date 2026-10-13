import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useAgentSession } from "@/components/agent/agent-session-context";
import { useFieldNotes, type FieldNote } from "@/components/agent/field-notes-data";
import type { NoteStage } from "@/components/agent/field-notes/follow-up-groups";
import { NoteFormDialog, type NoteDialogMode } from "@/components/agent/field-notes/NoteFormDialog";
import { QuickMemoDialog, type MemoPrefill } from "@/components/agent/field-notes/QuickMemoDialog";
import { NotesTable } from "@/components/agent/field-notes/NotesTable";
import { StickyBoard, type NoteStatusFilter } from "@/components/agent/field-notes/StickyBoard";

interface NotesSearch {
  view?: "table" | undefined;
  status?: NoteStage | undefined;
  due?: "soon" | undefined;
}

const statuses: NoteStage[] = ["scheduled", "today", "overdue", "logged", "completed"];

export const Route = createFileRoute("/agent/notes")({
  validateSearch: (raw: Record<string, unknown>): NotesSearch => ({
    view: raw["view"] === "table" ? "table" : undefined,
    status: statuses.includes(raw["status"] as NoteStage)
      ? (raw["status"] as NoteStage)
      : undefined,
    due: raw["due"] === "soon" ? "soon" : undefined,
  }),
  head: () => ({ meta: [{ title: "Field Notes — InsureX Prime" }] }),
  component: FieldNotesPage,
});

function FieldNotesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/agent/notes" });
  const { agent } = useAgentSession();
  const { notes, isPending, isError, refetch } = useFieldNotes();

  const [dialog, setDialog] = useState<{
    mode: NoteDialogMode;
    notes: FieldNote[];
    prefill?: MemoPrefill;
  } | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const openDialog = (value: NonNullable<typeof dialog>) => {
    setDialog(value);
    setDialogOpen(true);
  };

  const status: NoteStatusFilter = search.status ?? "all";
  const setSearch = (patch: Partial<NotesSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const setStatus = (value: NoteStatusFilter) =>
    setSearch({ status: value === "all" ? undefined : value });

  const territory =
    agent.address?.split(",").slice(0, 2).join(",").trim() || "Metro Business Corridor";

  if (isPending) {
    return (
      <div className="grid gap-3 font-fo-body sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-fo-container" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-fo-lowest p-8 text-center font-fo-body text-fo-ink ring-1 ring-fo-outline/30">
        <p className="font-fo-display text-lg font-semibold">Couldn't load your field notes</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="h-10 cursor-pointer rounded-lg bg-fo-primary px-4 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="font-fo-body text-fo-ink">
      {search.view === "table" ? (
        <NotesTable
          notes={notes}
          status={status}
          onStatusChange={setStatus}
          dueSoonOnly={search.due === "soon"}
          onDueSoonChange={(value) => setSearch({ due: value ? "soon" : undefined })}
          onShowBoard={() => setSearch({ view: undefined, due: undefined })}
          onEdit={(note) => openDialog({ mode: "edit", notes: [note] })}
          onReschedule={(selected) => openDialog({ mode: "reschedule", notes: selected })}
        />
      ) : (
        <StickyBoard
          notes={notes}
          status={status}
          onStatusChange={setStatus}
          onShowTable={() => setSearch({ view: "table" })}
          onQuickMemo={() => setQuickOpen(true)}
          onEdit={(note) => openDialog({ mode: "edit", notes: [note] })}
          onReschedule={(note) => openDialog({ mode: "reschedule", notes: [note] })}
          territory={territory}
        />
      )}

      {/* Floating "+ Note" trigger, sitting above the mobile bottom nav */}
      <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 lg:bottom-8 lg:right-8">
        <button
          type="button"
          onClick={() => openDialog({ mode: "add", notes: [] })}
          className="flex h-12 cursor-pointer items-center gap-2 rounded-full bg-fo-primary px-4 text-sm font-semibold text-white shadow-lg shadow-fo-primary/20 transition-all hover:bg-fo-primary-container active:scale-95"
        >
          <Plus className="size-5" /> Note
        </button>
      </div>

      <NoteFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialog?.mode ?? "add"}
        notes={dialog?.notes}
        prefill={dialog?.prefill}
      />

      <QuickMemoDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onEdit={(note) => openDialog({ mode: "edit", notes: [note] })}
        onNeedsDetails={(prefill) => openDialog({ mode: "add", notes: [], prefill })}
      />
    </div>
  );
}
