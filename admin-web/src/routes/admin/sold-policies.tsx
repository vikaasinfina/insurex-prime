import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordSoldPolicyFlow } from "@/routes/agent/sell-policy";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SoldPoliciesLedger } from "@/components/agent/SoldPoliciesLedger";
import { useState } from "react";
import { requireAdminSession } from "@/lib/admin-route-guard";
import { AdminFooter } from "@/components/admin/AdminFooter";

export const Route = createFileRoute("/admin/sold-policies")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: () => ({
    meta: [{ title: "Sold Policies Audit — InsuroX Prime" }],
  }),
  component: AdminSoldPoliciesPage,
});

function AdminSoldPoliciesPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-surface/30 text-foreground">
      <AdminSidebar
        currentPath="/admin/sold-policies"
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="app-shell-pad flex flex-col min-h-screen">
        <AdminHeader onToggleSidebar={() => setSidebarOpen(true)} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Link
                to="/admin/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-2"
              >
                <ArrowLeft className="size-3.5" /> Back to Dashboard
              </Link>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
                Sold Policies Ledger
              </h1>
              <p className="text-xs text-muted-foreground">
                {recording
                  ? "Record a policy on behalf of an agent who has shared the sale details."
                  : "Audit trail of every policy sold by your agents, with new and renewed sales marked."}
              </p>
            </div>
            {recording ? (
              <Button variant="outline" className="rounded-xl" onClick={() => setRecording(false)}>
                <ArrowLeft /> Back to ledger
              </Button>
            ) : (
              <Button className="rounded-xl" onClick={() => setRecording(true)}>
                <FilePlus2 /> Record Policy
              </Button>
            )}
          </div>

          {recording ? (
            <RecordSoldPolicyFlow adminMode onViewLedger={() => setRecording(false)} />
          ) : (
            <SoldPoliciesLedger
              adminMode
              title="All policy sales"
              description="Every policy sold by your agents. Search, filter, edit or remove a sale."
              viewId={viewId}
              onViewChange={(id) => setViewId(id ?? null)}
              actions={null}
              emptyAction={
                <Button className="rounded-xl" onClick={() => setRecording(true)}>
                  <FilePlus2 /> Record the first policy
                </Button>
              }
            />
          )}
        </main>
        <AdminFooter />
      </div>
    </div>
  );
}
