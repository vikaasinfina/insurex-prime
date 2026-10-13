import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CircleHelp, Pencil, Plus, Sparkles, Target } from "lucide-react";
import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { agentApi } from "@/lib/api/agent";
import { GoalDialog } from "@/components/agent/sales-goals/GoalDialog";
import {
  cadenceLabel,
  categoryLabel,
  goalCategories,
  paceLabel,
  paceOf,
  percent,
  useSalesGoals,
  type CategoryGoal,
  type GoalCadence,
  type GoalCategory,
  type SalesGoal,
} from "@/components/agent/sales-goals-data";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agent/goals")({
  head: () => ({ meta: [{ title: "Sales Goals — InsureX Prime" }] }),
  component: SalesGoalsPage,
});

const cadences: GoalCadence[] = ["weekly", "monthly", "quarterly", "yearly"];

// Same category colours as the dashboard's Policy Type Distribution donut.
const CATEGORY_COLOR: Record<GoalCategory, string> = {
  health: "var(--primary)",
  motor: "#0d9488",
  life: "#f59e0b",
};

const card = "flex min-w-0 flex-col rounded-xl bg-fo-lowest shadow-sm ring-1 ring-fo-outline/30";

function SalesGoalsPage() {
  const { goals, isPending, isError, refetch } = useSalesGoals();
  const [cadence, setCadence] = useState<GoalCadence>("weekly");
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isPending) {
    return (
      <div className="grid gap-3 font-fo-body lg:max-w-3xl" aria-busy="true">
        <div className="h-11 animate-pulse rounded-xl bg-fo-container" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl bg-fo-container" />
        ))}
      </div>
    );
  }
  if (isError || !goals) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-fo-lowest p-8 text-center font-fo-body text-fo-ink ring-1 ring-fo-outline/30">
        <p className="font-fo-display text-lg font-semibold">Couldn't load your goals</p>
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
  const goal = goals[cadence];
  const hasGoals = goalCategories.some((key) => goal.categories[key].targetPolicies > 0);

  return (
    <div className="flex flex-col gap-4 font-fo-body text-fo-ink">
      <div className="flex items-center gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-4 gap-1 rounded-xl bg-fo-container p-1 lg:max-w-md">
          {cadences.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCadence(value)}
              aria-pressed={cadence === value}
              className={cn(
                "h-9 cursor-pointer rounded-lg px-2 text-xs font-semibold transition-all",
                cadence === value
                  ? "bg-fo-lowest text-fo-primary shadow-sm"
                  : "text-fo-muted hover:text-fo-ink",
              )}
            >
              {cadenceLabel[value]}
            </button>
          ))}
        </div>
        <CoachHelp cadence={cadence} goal={goal} />
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-fo-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-[#004b73] active:scale-[0.98]"
        >
          <Target className="size-4" />
          <span className="hidden sm:inline">Set goals</span>
          <span className="sm:hidden">Set</span>
        </button>
      </div>

      <p className="px-1 text-xs text-fo-muted tabular-nums">
        {goal.periodLabel} • {goal.businessDaysLeft} business day
        {goal.businessDaysLeft === 1 ? "" : "s"} left
      </p>

      {hasGoals ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
          <div className="grid gap-3">
            {goalCategories.map((key) => (
              <CategoryCard
                key={key}
                category={key}
                goal={goal.categories[key]}
                goalPeriod={goal}
                onSet={() => setDialogOpen(true)}
              />
            ))}
          </div>
          <div className="order-first lg:sticky lg:top-4 lg:order-none">
            <OverallCard goal={goal} />
          </div>
        </div>
      ) : (
        <div className={cn(card, "items-center gap-3 p-8 text-center")}>
          <span className="grid size-12 place-items-center rounded-full bg-fo-low text-fo-primary">
            <Target className="size-6" />
          </span>
          <p className="font-fo-display text-lg font-semibold">
            No {cadenceLabel[cadence].toLowerCase()} goals yet
          </p>
          <p className="max-w-xs text-sm text-fo-muted">
            Set how many Motor, Health and Life policies you want to sell.
          </p>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="mt-1 flex h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-fo-primary px-5 text-sm font-semibold text-white hover:bg-[#004b73]"
          >
            <Plus className="size-4" /> Set goals
          </button>
        </div>
      )}

      <GoalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        goals={goals}
        cadence={cadence}
        onSaved={setCadence}
      />
    </div>
  );
}

function CategoryCard({
  category,
  goal,
  goalPeriod,
  onSet,
}: {
  category: GoalCategory;
  goal: CategoryGoal;
  goalPeriod: SalesGoal;
  onSet: () => void;
}) {
  if (goal.targetPolicies === 0) {
    return (
      <div className={cn(card, "flex-row items-center justify-between gap-3 p-4")}>
        <div className="min-w-0">
          <p className="font-fo-display text-base font-semibold">{categoryLabel[category]}</p>
          <p className="text-xs text-fo-muted">No goal set</p>
        </div>
        <button
          type="button"
          onClick={onSet}
          className="flex h-10 shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-fo-low px-3 text-xs font-semibold text-fo-primary hover:bg-fo-container"
        >
          <Plus className="size-4" /> Set goal
        </button>
      </div>
    );
  }

  const pace = paceOf(goal, goalPeriod.elapsed);
  const pct = percent(goal.soldPolicies, goal.targetPolicies);
  const remaining = Math.max(0, goal.targetPolicies - goal.soldPolicies);

  return (
    <div className={cn(card, "gap-3 p-4")}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-fo-display text-base font-semibold">{categoryLabel[category]}</p>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              pace === "BEHIND" ? "bg-fo-error/10 text-fo-error" : "bg-fo-high text-fo-primary",
            )}
          >
            {paceLabel[pace]}
          </span>
          <button
            type="button"
            onClick={onSet}
            aria-label={`Edit ${categoryLabel[category]} goal`}
            className="grid size-7 cursor-pointer place-items-center rounded-md text-fo-muted hover:bg-fo-container hover:text-fo-primary"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-fo-display text-[26px] font-bold leading-8 text-fo-primary tabular-nums">
          {goal.soldPolicies}
          <span className="font-fo-body text-sm font-normal text-fo-muted">
            {" "}
            / {goal.targetPolicies} {goal.targetPolicies === 1 ? "policy" : "policies"}
          </span>
        </span>
        <span className="text-sm font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-fo-container">
        <div
          className="h-full rounded-full bg-fo-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-fo-muted">
        <span>
          {remaining > 0 ? `${remaining} more to go` : "Goal achieved"}
          {goal.derived && " · auto from weekly goal"}
        </span>
        {goal.targetPremium > 0 && (
          <span className="tabular-nums">
            {formatINR(goal.closedPremium)} / {formatINR(goal.targetPremium)}
          </span>
        )}
      </div>
    </div>
  );
}

function OverallCard({ goal }: { goal: SalesGoal }) {
  const rows = goalCategories
    .map((key) => ({ key, ...goal.categories[key] }))
    .filter((row) => row.targetPolicies > 0);
  const target = rows.reduce((sum, row) => sum + row.targetPolicies, 0);
  // Over-achieving one category must not hide a gap in another.
  const sold = rows.reduce((sum, row) => sum + Math.min(row.soldPolicies, row.targetPolicies), 0);
  const pct = percent(sold, target);
  const data = [
    ...rows.map((row) => ({
      name: categoryLabel[row.key],
      value: Math.min(row.soldPolicies, row.targetPolicies),
      color: CATEGORY_COLOR[row.key],
    })),
    { name: "Remaining", value: target - sold, color: "var(--color-muted)" },
  ];

  return (
    <div className={cn(card, "items-center gap-4 p-5")}>
      <div className="relative h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="68%"
              outerRadius="92%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={0}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((row) => (
                <Cell key={row.name} fill={row.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-fo-display text-3xl font-extrabold tabular-nums">{pct}%</span>
          <span className="text-[11px] font-medium text-fo-muted tabular-nums">
            {sold} / {target} policies
          </span>
        </div>
      </div>
      <ul className="grid w-full gap-2" aria-label="Progress by category">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: CATEGORY_COLOR[row.key] }}
              />
              {categoryLabel[row.key]}
            </span>
            <span className="font-semibold tabular-nums text-fo-muted">
              {row.soldPolicies} / {row.targetPolicies}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** (?) button: AI coach with the top 5 steps to convert business, tuned to the agent's progress. */
function CoachHelp({ cadence, goal }: { cadence: GoalCadence; goal: SalesGoal }) {
  const [open, setOpen] = useState(false);
  const input = {
    cadence,
    daysLeft: goal.daysLeft,
    categories: goalCategories.map((key) => ({
      category: key,
      targetPolicies: goal.categories[key].targetPolicies,
      soldPolicies: goal.categories[key].soldPolicies,
    })),
  };
  const coaching = useQuery({
    queryKey: ["agent-coaching", input],
    queryFn: () => agentApi.coaching(input),
    enabled: open,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Tips to reach your goals"
          title="Tips to reach your goals"
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-fo-low text-fo-primary transition-colors hover:bg-fo-container"
        >
          <CircleHelp className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(92vw,380px)] border-fo-outline/40 bg-fo-lowest p-4 font-fo-body text-fo-ink"
      >
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-fo-primary" />
          <p className="font-fo-display text-base font-semibold">Top 5 steps to convert</p>
        </div>
        {coaching.isPending ? (
          <ul className="grid gap-3" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="h-12 animate-pulse rounded-lg bg-fo-container" />
            ))}
          </ul>
        ) : coaching.isError ? (
          <p className="text-sm text-fo-muted">Couldn't load tips right now. Try again shortly.</p>
        ) : (
          <>
            <ol className="grid gap-3">
              {coaching.data.steps.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-fo-high text-xs font-bold text-fo-primary">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{step.title}</p>
                    <p className="text-xs text-fo-muted">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-3 border-t border-fo-outline/40 pt-2 text-[11px] text-fo-muted">
              {coaching.data.source === "ai"
                ? "AI-generated from your goal progress. Use your own judgement."
                : "General best-practice checklist."}
            </p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
