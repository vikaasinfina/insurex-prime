import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  FieldNotesPage,
  validateNotesSearch,
  type NotesSearch,
} from "@/components/agent/field-notes/FieldNotesPage";

export const Route = createFileRoute("/agent/notes")({
  validateSearch: validateNotesSearch,
  head: () => ({ meta: [{ title: "Field Notes — InsureX Prime" }] }),
  component: AgentNotesPage,
});

function AgentNotesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/agent/notes" });

  return (
    <FieldNotesPage
      search={search}
      onSearchChange={(patch: Partial<NotesSearch>) =>
        void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
      }
    />
  );
}
