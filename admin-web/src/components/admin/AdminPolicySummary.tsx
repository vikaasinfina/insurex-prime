import {
  Building2,
  CarFront,
  CheckCircle2,
  Clock,
  HeartPulse,
  ShieldAlert,
  Umbrella,
} from "lucide-react";
import { formatINR, type PolicyCategorySummary } from "./admin-mock-data";

export interface AdminPolicySummaryProps {
  categories: PolicyCategorySummary[];
}

const LINE_STYLE = {
  Health: { icon: HeartPulse, chip: "bg-primary/10 text-primary", bar: "bg-primary" },
  Motor: {
    icon: CarFront,
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    bar: "bg-emerald-600",
  },
  Life: {
    icon: Umbrella,
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  Commercial: {
    icon: Building2,
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    bar: "bg-violet-500",
  },
} as const;

export function AdminPolicySummary({ categories }: AdminPolicySummaryProps) {
  return (
    <section aria-label="Policy Portfolio Summary" className="w-full">
      <div className="rounded-xl border border-border/80 bg-background/90 p-3.5 shadow-xs sm:rounded-2xl sm:p-5 backdrop-blur-sm">
        {/* Header */}
        <div className="border-b border-border/60 pb-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Policy Portfolio Summary
          </h2>
          <p className="text-xs text-muted-foreground">
            Operational status breakdown across your insurance product lines
          </p>
        </div>

        {/* Compact Grid */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {categories.map((item) => {
            const line = item.category.replace(" Insurance", "") as keyof typeof LINE_STYLE;
            const style = LINE_STYLE[line] ?? LINE_STYLE.Health;
            const Icon = style.icon;
            const activePercent = item.total ? Math.round((item.active / item.total) * 100) : 0;

            return (
              <div
                key={item.category}
                className="rounded-xl border border-border/70 bg-surface/50 p-4 transition-all hover:border-primary/40 hover:bg-surface/80"
              >
                {/* Line title & icon */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`grid size-9 place-items-center rounded-xl ${style.chip}`}>
                      <Icon className="size-4.5" />
                    </span>
                    <div>
                      <h3 className="font-display font-bold text-sm text-foreground">
                        {item.category}
                      </h3>
                      <span className="text-[11px] text-muted-foreground">
                        Premium: {item.totalPremium}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground mb-1.5">
                    <span>Portfolio In-Force Ratio</span>
                    <span className="font-bold text-foreground">{activePercent}% Active</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
                      style={{ width: `${activePercent}%` }}
                    />
                  </div>
                </div>

                {/* Metrics Breakdown Grid */}
                <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-background/80 p-2 border border-border/50">
                    <span className="text-[10px] text-muted-foreground block uppercase font-bold">
                      Total
                    </span>
                    <span className="font-display font-bold text-foreground text-sm mt-0.5 block">
                      {item.total}
                    </span>
                  </div>
                  <div className="rounded-lg bg-emerald-500/5 p-2 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                    <span className="text-[10px] block uppercase font-bold">Active</span>
                    <span className="font-display font-bold text-sm mt-0.5 block">
                      {item.active}
                    </span>
                  </div>
                  <div className="rounded-lg bg-destructive/5 p-2 border border-destructive/20 text-destructive">
                    <span className="text-[10px] block uppercase font-bold">Expired</span>
                    <span className="font-display font-bold text-sm mt-0.5 block">
                      {item.expired}
                    </span>
                  </div>
                  <div className="rounded-lg bg-slate-500/5 p-2 border border-slate-500/20 text-slate-600 dark:text-slate-400">
                    <span className="text-[10px] block uppercase font-bold">Renewed</span>
                    <span className="font-display font-bold text-sm mt-0.5 block">
                      {item.renewed ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
