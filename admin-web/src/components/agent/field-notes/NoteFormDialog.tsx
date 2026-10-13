import { Loader2, Mic, MicOff, Sparkles } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { fieldNotesApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useFieldNoteActions, type FieldNote, type FieldNoteCategory } from "../field-notes-data";
import { categoryIcon, categoryLabel } from "./note-theme";
import type { MemoPrefill } from "./QuickMemoDialog";
import { useDictation } from "./use-dictation";

export type NoteDialogMode = "add" | "edit" | "reschedule";

interface NoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: NoteDialogMode;
  /** The memo being edited or rescheduled (or several, for a batch reschedule). */
  notes?: FieldNote[] | undefined;
  /** Starting values for a new memo (when the AI could not complete it). */
  prefill?: MemoPrefill | undefined;
}

/** datetime-local value (local time, minutes precision) ↔ ISO. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

const defaultFollowUp = () => {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
};

const fieldClass =
  "h-12 rounded-md border-fo-outline bg-fo-lowest text-sm focus-visible:border-fo-primary focus-visible:ring-1 focus-visible:ring-fo-primary sm:h-10";

export function NoteFormDialog({
  open,
  onOpenChange,
  mode,
  notes = [],
  prefill,
}: NoteFormDialogProps) {
  const editing = notes[0];
  const noteActions = useFieldNoteActions();
  const [saving, setSaving] = useState(false);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [coverage, setCoverage] = useState("");
  const [category, setCategory] = useState<FieldNoteCategory>("health");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpLabel, setFollowUpLabel] = useState("");
  const [postponed, setPostponed] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  // Fields the AI just changed are outlined for a moment so the agent can review them.
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());
  const dictation = useDictation(setAiText);

  useEffect(() => {
    if (!open) {
      dictation.stop();
      return;
    }
    const start = editing ? undefined : prefill;
    setContactName(editing?.contactName || editing?.clientName || start?.contactName || "");
    setPhone(editing?.phone ?? start?.phone ?? "");
    setCoverage(editing?.coverage ?? start?.coverage ?? "");
    setCategory(editing?.category ?? start?.category ?? "health");
    setNote(editing?.note ?? start?.note ?? "");
    setDone(editing ? editing.status === "COMPLETED" : (start?.done ?? false));
    setPostponed(editing?.status === "POSTPONED");
    setFollowUpAt(toLocalInput(editing?.followUpAt ?? start?.followUpAt ?? defaultFollowUp()));
    setFollowUpLabel(editing?.followUpLabel ?? (start?.followUpLabel || "Follow-up call"));
    setAiText("");
    setFlash(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const flashClass = (key: string) =>
    flash.has(key) && "ring-2 ring-fo-primary ring-offset-1 transition-shadow";

  /** Sends the spoken/typed instruction plus the form as it stands; fills the form with the result. */
  const applyInstruction = async () => {
    const instruction = aiText.trim();
    if (instruction.length < 3) {
      toast.info("Say or type what changed first.");
      return;
    }
    dictation.stop();
    setAiBusy(true);
    try {
      const revised = await fieldNotesApi.revise(
        {
          clientName: contactName.trim(),
          phone: phone.trim(),
          coverage: coverage.trim(),
          category: category.toUpperCase() as "LIFE" | "HEALTH" | "MOTOR" | "COMMERCIAL",
          note: note.trim(),
          status: done ? "COMPLETED" : postponed ? "POSTPONED" : "IN_PROGRESS",
          followUpAt: fromLocalInput(followUpAt),
          followUpLabel: followUpLabel.trim(),
        },
        instruction,
      );
      const next = {
        contact: revised.clientName,
        phone: revised.phone,
        coverage: revised.coverage,
        note: revised.note,
        followUp: toLocalInput(revised.followUpAt),
        label: revised.followUpLabel,
      };
      const nextCategory = revised.category.toLowerCase() as FieldNoteCategory;
      const changed = new Set<string>();
      if (next.contact !== contactName) changed.add("contact");
      if (next.phone !== phone) changed.add("phone");
      if (next.coverage !== coverage) changed.add("coverage");
      if (next.note !== note) changed.add("note");
      if (next.followUp !== followUpAt) changed.add("followUp");
      if (next.label !== followUpLabel) changed.add("label");
      if (nextCategory !== category) changed.add("category");
      if ((revised.status === "COMPLETED") !== done) changed.add("done");

      setContactName(next.contact);
      setPhone(next.phone);
      setCoverage(next.coverage);
      setCategory(nextCategory);
      setNote(next.note);
      setFollowUpAt(next.followUp);
      setFollowUpLabel(next.label);
      setDone(revised.status === "COMPLETED");
      setPostponed(revised.status === "POSTPONED");
      setFlash(changed);
      window.setTimeout(() => setFlash(new Set()), 3000);
      setAiText("");

      if (revised.source !== "ai") {
        toast.info("AI is unavailable right now — your words were added to the memo. Press Save.");
        return;
      }
      if (!revised.clientName.trim() || !revised.note.trim()) {
        toast.info("Updated — add the contact person and press Save.");
        return;
      }

      // The AI result is the final word: save it now, no second click.
      const values = {
        clientName: revised.clientName.trim(),
        contactName: "",
        phone: revised.phone.trim(),
        coverage: revised.coverage.trim() || categoryLabel[nextCategory],
        category: nextCategory,
        note: revised.note.trim(),
        status: revised.status,
        followUpAt: revised.followUpAt,
        followUpLabel: revised.followUpLabel.trim() || "Follow-up",
      };
      const summary = revised.followUpAt
        ? `Follow-up ${new Date(revised.followUpAt).toLocaleString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}`
        : "No follow-up set";
      try {
        if (mode === "edit" && editing) {
          await noteActions.update(editing.id, values);
          toast.success("Memo updated", {
            description: summary,
            duration: 9000,
            action: {
              label: "Undo",
              onClick: () =>
                void noteActions
                  .update(editing.id, {
                    clientName: editing.clientName,
                    contactName: editing.contactName,
                    phone: editing.phone,
                    coverage: editing.coverage,
                    category: editing.category,
                    note: editing.note,
                    status: editing.status,
                    followUpAt: editing.followUpAt,
                    followUpLabel: editing.followUpLabel,
                  })
                  .catch(() => {}),
            },
          });
        } else {
          const created = await noteActions.add(values);
          toast.success("Memo pinned to your board", {
            description: summary,
            duration: 9000,
            action: {
              label: "Undo",
              onClick: () => void noteActions.remove(created.id).catch(() => {}),
            },
          });
        }
      } catch {
        return; // the data layer already showed the error; the form keeps the update so it can be saved again
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update the memo.");
    } finally {
      setAiBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const followUp = fromLocalInput(followUpAt);

    if (mode === "reschedule") {
      if (!followUp) {
        toast.error("Pick a new follow-up date.");
        return;
      }
      setSaving(true);
      try {
        await noteActions.updateMany(
          notes.map((item) => item.id),
          {
            followUpAt: followUp,
            followUpLabel: followUpLabel.trim() || "Follow-up",
            status: "POSTPONED",
          },
        );
      } catch {
        return; // the data layer already showed the error
      } finally {
        setSaving(false);
      }
      toast.success(
        notes.length > 1
          ? `Rescheduled follow-ups for ${notes.length} clients`
          : `Follow-up rescheduled for ${notes[0]?.clientName}`,
      );
      onOpenChange(false);
      return;
    }

    if (!contactName.trim() || !note.trim()) {
      toast.error("Contact person and memo are required.");
      return;
    }
    const values = {
      clientName: contactName.trim(),
      contactName: "",
      phone: phone.trim(),
      coverage: coverage.trim() || categoryLabel[category],
      category,
      note: note.trim(),
      status: done
        ? ("COMPLETED" as const)
        : postponed
          ? ("POSTPONED" as const)
          : ("IN_PROGRESS" as const),
      followUpAt: followUp,
      followUpLabel: followUpLabel.trim() || "Follow-up",
    };
    setSaving(true);
    try {
      if (mode === "edit" && editing) {
        await noteActions.update(editing.id, values);
        toast.success("Memo updated");
      } else {
        await noteActions.add(values);
        toast.success("Memo pinned to your board");
      }
    } catch {
      return; // the data layer already showed the error
    } finally {
      setSaving(false);
    }
    onOpenChange(false);
  };

  const title =
    mode === "add" ? "New field memo" : mode === "edit" ? "Edit memo" : "Reschedule follow-up";
  const description =
    mode === "reschedule"
      ? notes.length > 1
        ? `Set a new follow-up for ${notes.length} selected clients.`
        : `Set a new follow-up for ${editing?.clientName ?? "this client"}.`
      : "Capture what happened on the visit and when to follow up.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bottom-0 top-auto max-h-[92dvh] max-w-none translate-y-0 gap-0 overflow-y-auto rounded-t-2xl border-fo-outline/60 bg-fo-surface p-0 font-fo-body text-fo-ink data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:bottom-auto sm:top-[50%] sm:max-w-lg sm:translate-y-[-50%] sm:rounded-xl">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-fo-outline/50 px-5 pb-4 pt-5 text-left">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-fo-outline sm:hidden" />
            <DialogTitle className="font-fo-display text-lg font-bold">{title}</DialogTitle>
            <DialogDescription className="text-xs text-fo-muted">{description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 px-5 py-4">
            {mode !== "reschedule" && (
              <>
                <div className="grid gap-2 rounded-xl bg-fo-low p-3">
                  <Label
                    htmlFor="note-ai-instruction"
                    className="flex items-center gap-1.5 text-xs font-semibold text-fo-primary"
                  >
                    <Sparkles className="size-3.5" /> Tell AI what changed
                  </Label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
                      disabled={aiBusy}
                      aria-label={dictation.listening ? "Stop listening" : "Speak to update"}
                      aria-pressed={dictation.listening}
                      className={cn(
                        "grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-white transition-colors",
                        dictation.listening ? "bg-fo-error" : "bg-fo-primary",
                      )}
                    >
                      {dictation.listening ? (
                        <MicOff className="size-4.5" />
                      ) : (
                        <Mic className="size-4.5" />
                      )}
                    </button>
                    <Input
                      id="note-ai-instruction"
                      value={aiText}
                      disabled={aiBusy}
                      onChange={(e) => setAiText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void applyInstruction();
                        }
                      }}
                      placeholder={
                        dictation.listening
                          ? "Listening…"
                          : "e.g. meeting postponed to next week, client has urgent work"
                      }
                      className={cn(fieldClass, "min-w-0 flex-1")}
                    />
                    <Button
                      type="button"
                      onClick={() => void applyInstruction()}
                      disabled={aiBusy || aiText.trim().length < 3}
                      className="h-12 shrink-0 rounded-md bg-fo-primary px-3 text-white hover:bg-[#004b73] sm:h-10"
                    >
                      {aiBusy ? <Loader2 className="size-4 animate-spin" /> : "Update"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-fo-muted">
                    Speak or type — I'll update the memo, follow-up date and status and save it for
                    you. You can Undo from the confirmation.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="note-contact" className="text-xs font-semibold">
                      Contact person *
                    </Label>
                    <Input
                      id="note-contact"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="e.g. Marcus D'Souza (Fleet Mgr)"
                      className={cn(fieldClass, flashClass("contact"))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="note-phone" className="text-xs font-semibold">
                      Phone
                    </Label>
                    <Input
                      id="note-phone"
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91"
                      className={cn(fieldClass, flashClass("phone"))}
                    />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label className="text-xs font-semibold">Line of business</Label>
                    <div
                      role="radiogroup"
                      aria-label="Line of business"
                      className="grid grid-cols-4 gap-2"
                    >
                      {(Object.keys(categoryLabel) as FieldNoteCategory[]).map((value) => {
                        const Icon = categoryIcon[value];
                        const active = category === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setCategory(value)}
                            className={cn(
                              "flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-semibold transition-all active:scale-95 sm:text-xs",
                              active
                                ? "border-fo-primary bg-fo-primary-fixed text-fo-on-primary-fixed shadow-sm ring-1 ring-fo-primary"
                                : "border-fo-outline/60 bg-fo-lowest text-fo-muted hover:border-fo-primary/50 hover:text-fo-ink",
                            )}
                          >
                            <Icon className="size-5" />
                            {categoryLabel[value]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="note-coverage" className="text-xs font-semibold">
                    Cover / policy ref
                  </Label>
                  <Input
                    id="note-coverage"
                    value={coverage}
                    onChange={(e) => setCoverage(e.target.value)}
                    placeholder="e.g. Family Floater #HL-2041"
                    className={cn(fieldClass, flashClass("coverage"))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="note-body" className="text-xs font-semibold">
                      Memo *
                    </Label>
                  </div>
                  <Textarea
                    id="note-body"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    placeholder="What did you discuss?"
                    className={cn(
                      "rounded-sm border-[#f59e0b] bg-[#fef9c3] text-sm leading-relaxed text-[#713f12] placeholder:text-[#a16207]/70 focus-visible:ring-1 focus-visible:ring-[#d97706]",
                      flashClass("note"),
                    )}
                  />
                </div>
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="note-followup" className="text-xs font-semibold">
                  Next follow-up
                </Label>
                <Input
                  id="note-followup"
                  type="datetime-local"
                  value={followUpAt}
                  onChange={(e) => setFollowUpAt(e.target.value)}
                  className={cn(fieldClass, flashClass("followUp"))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="note-followup-label" className="text-xs font-semibold">
                  Follow-up type
                </Label>
                <Input
                  id="note-followup-label"
                  value={followUpLabel}
                  onChange={(e) => setFollowUpLabel(e.target.value)}
                  placeholder="Renewal call, onsite visit…"
                  className={cn(fieldClass, flashClass("label"))}
                />
              </div>
            </div>

            {mode === "edit" && (
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-fo-container px-3 py-2.5 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(e) => setDone(e.target.checked)}
                  className="size-4 cursor-pointer accent-[var(--fo-primary)]"
                />
                Mark as completed
              </label>
            )}
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
              disabled={saving}
              className="h-12 rounded-md bg-fo-primary text-white hover:bg-[#004b73] sm:h-10"
            >
              {mode === "add" ? "Pin memo" : mode === "edit" ? "Save changes" : "Reschedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
