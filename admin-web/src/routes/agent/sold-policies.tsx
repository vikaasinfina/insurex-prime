import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FilePlus2, RefreshCw } from "lucide-react";
import { SoldPoliciesLedger } from "@/components/agent/SoldPoliciesLedger";
import { Button } from "@/components/ui/button";

interface SoldSearch {
  view?: string | undefined;
  search?: string | undefined;
}

const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);

export const Route = createFileRoute("/agent/sold-policies")({
  validateSearch: (raw: Record<string, unknown>): SoldSearch => ({
    view: text(raw["view"]),
    search: text(raw["search"]),
  }),
  head: () => ({ meta: [{ title: "Sold Policies — InsuroX Prime" }] }),
  component: SoldPoliciesPage,
});

function SoldPoliciesPage() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: "/agent/sold-policies" });
  return (
    <SoldPoliciesLedger
      title="My policy sales"
      description="Every policy you have sold. Only your own sales are shown."
      viewId={params.view ?? null}
      onViewChange={(view) =>
        void navigate({ search: (prev) => ({ ...prev, view }), replace: true })
      }
      initialSearch={params.search}
      onReset={() => void navigate({ search: {}, replace: true })}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/agent/sell-policy" search={{ renewal: true }}>
              <RefreshCw /> Record Renewed Policy
            </Link>
          </Button>
          <Button asChild className="rounded-xl">
            <Link to="/agent/sell-policy">
              <FilePlus2 /> Record Sold Policy
            </Link>
          </Button>
        </div>
      }
      emptyAction={
        <Button asChild className="rounded-xl">
          <Link to="/agent/sell-policy">
            <FilePlus2 /> Record your first sold policy
          </Link>
        </Button>
      }
    />
  );
}
