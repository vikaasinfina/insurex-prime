import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GoalTargets } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  cadenceLabel,
  categoryLabel,
  goalCategories,
  useSetSalesGoals,
  type GoalCadence,
  type GoalCategory,
  type SalesGoal,
} from "../sales-goals-data";

interface GoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: Record<GoalCadence, SalesGoal>;
  cadence: GoalCadence;
  onSaved?: (cadence: GoalCadence) => void;
}

type Draft = Record<GoalCategory, { policies: string; premium: string }>;

const fieldClass =
  "h-12 rounded-md border-fo-outline bg-fo-lowest text-sm tabular-nums focus-visible:border-fo-primary focus-visible:ring-1 focus-visible:ring-fo-primary sm:h-10";

const draftOf = (goal: SalesGoal): Draft =>
  Object.fromEntries(
    goalCategories.map((key) => {
      const { targetPolicies, targetPremium } = goal.categories[key];
      return [
        key,
        {
          policies: targetPolicies ? String(targetPolicies) : "",
          premium: targetPremium ? String(targetPremium) : "",
        },
      ];
    }),
  ) as Draft;

export function GoalDialog({ open, onOpenChange, goals, cadence, onSaved }: GoalDialogProps) {
  const [selected, setSelected] = useState<GoalCadence>(cadence);
  const save = useSetSalesGoals();
  const [draft, setDraft] = useState<Draft>(() => draftOf(goals[cadence]));

  const load = (value: GoalCadence) => {
    setSelected(value);
    setDraft(draftOf(goals[value]));
  };

  useEffect(() => {
    if (open) load(cadence);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cadence]);

  const change = (key: GoalCategory, field: "policies" | "premium", value: string) =>
    setDraft((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const targets = {} as GoalTargets;
    for (const key of goalCategories) {
      const policies = Number(draft[key].policies || 0);
      const premium = Number(draft[key].premium || 0);
      if (!Number.isFinite(policies) || policies < 0 || !Number.isFinite(premium) || premium < 0) {
        toast.error(`${categoryLabel[key]}: targets must be positive numbers.`);
        return;
      }
      targets[key] = { targetPolicies: Math.round(policies), targetPremium: Math.round(premium) };
    }
    try {
      await save.mutateAsync({ cadence: selected, targets });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save your goals.");
      return;
    }
    toast.success(`${cadenceLabel[selected]} goals saved`);
    onSaved?.(selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bottom-0 top-auto max-h-[92dvh] max-w-none translate-y-0 gap-0 overflow-y-auto rounded-t-2xl border-fo-outline/60 bg-fo-surface p-0 font-fo-body text-fo-ink data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:bottom-auto sm:top-[50%] sm:max-w-md sm:translate-y-[-50%] sm:rounded-xl">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-fo-outline/50 px-5 pb-4 pt-5 text-left">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-fo-outline sm:hidden" />
            <DialogTitle className="font-fo-display text-lg font-bold">Set goals</DialogTitle>
            <DialogDescription className="text-xs text-fo-muted">
              Choose a period, then set a target for each category. Leave a category empty to skip
              it.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 px-5 py-4">
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-fo-container p-1">
              {(Object.keys(cadenceLabel) as GoalCadence[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => load(value)}
                  aria-pressed={selected === value}
                  className={cn(
                    "h-9 cursor-pointer rounded-lg text-xs font-semibold transition-all",
                    selected === value
                      ? "bg-fo-lowest text-fo-primary shadow-sm"
                      : "text-fo-muted hover:text-fo-ink",
                  )}
                >
                  {cadenceLabel[value]}
                </button>
              ))}
            </div>

            {goalCategories.map((key) => (
              <div key={key} className="grid gap-2">
                <span className="text-sm font-semibold">{categoryLabel[key]}</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`goal-${key}-policies`} className="text-xs text-fo-muted">
                      Policies
                    </Label>
                    <Input
                      id={`goal-${key}-policies`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      value={draft[key].policies}
                      onChange={(e) => change(key, "policies", e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`goal-${key}-premium`} className="text-xs text-fo-muted">
                      Premium (₹)
                    </Label>
                    <Input
                      id={`goal-${key}-premium`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1000}
                      placeholder="0"
                      value={draft[key].premium}
                      onChange={(e) => change(key, "premium", e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>
              </div>
            ))}

            <p className="rounded-lg bg-fo-secondary-container/50 px-3 py-2 text-xs text-fo-on-secondary-container">
              Sold policies and closed premium are credited automatically from your recorded sales.
            </p>
          </div>

          <DialogFooter className="gap-2 border-t border-fo-outline/50 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-12 rounded-md border-fo-outline sm:h-10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={save.isPending}
              className="h-12 rounded-md bg-fo-primary text-white hover:bg-[#004b73] sm:h-10"
            >
              Save goals
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
