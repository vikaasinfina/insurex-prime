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
import { Textarea } from "@/components/ui/textarea";
import { fieldNotesApi, type ParsedMemo } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useFieldNoteActions, type FieldNote, type FieldNoteCategory } from "../field-notes-data";
import { categoryLabel } from "./note-theme";
import { useDictation } from "./use-dictation";

/** Fields the full form can start with when the AI could not complete the memo. */
export interface MemoPrefill {
  contactName: string;
  phone: string;
  coverage: string;
  category: FieldNoteCategory;
  note: string;
  followUpAt: string | null;
  followUpLabel: string;
  done: boolean;
}

interface QuickMemoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open the saved memo in the edit form. */
  onEdit: (note: FieldNote) => void;
  /** The AI could not find a client: open the form with what it understood. */
  onNeedsDetails: (prefill: MemoPrefill) => void;
}

const formatFollowUp = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/** Say or type what happened; AI reads out the client, line, summary and follow-up, and saves it. */
export function QuickMemoDialog({
  open,
  onOpenChange,
  onEdit,
  onNeedsDetails,
}: QuickMemoDialogProps) {
  const actions = useFieldNoteActions();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // Voice text is appended to whatever was typed before the mic was switched on.
  const [typedBefore, setTypedBefore] = useState("");
  const dictation = useDictation((transcript) =>
    setText(`${typedBefore ? `${typedBefore.trimEnd()} ` : ""}${transcript}`),
  );

  useEffect(() => {
    if (!open) {
      dictation.stop();
      return;
    }
    setText("");
    setTypedBefore("");
    dictation.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleMic = () => {
    if (dictation.listening) {
      dictation.stop();
    } else {
      setTypedBefore(text);
      dictation.start();
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const spoken = text.trim();
    if (spoken.length < 3) {
      toast.info("Say or type what happened first.");
      return;
    }
    dictation.stop();
    setBusy(true);
    try {
      let parsed: ParsedMemo;
      try {
        parsed = await fieldNotesApi.parse(spoken);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't read the memo.");
        return;
      }
      const category = parsed.category.toLowerCase() as FieldNoteCategory;

      if (!parsed.clientName) {
        onOpenChange(false);
        onNeedsDetails({
          contactName: "",
          phone: parsed.phone,
          coverage: parsed.coverage,
          category,
          note: parsed.note,
          followUpAt: parsed.followUpAt,
          followUpLabel: parsed.followUpLabel,
          done: parsed.status === "COMPLETED",
        });
        toast.info(
          parsed.source === "ai"
            ? "I couldn't catch the client's name — add it and save."
            : "AI is unavailable right now — fill in the details and save.",
        );
        return;
      }

      let saved: FieldNote;
      try {
        saved = await actions.add({
          clientName: parsed.clientName,
          contactName: "",
          phone: parsed.phone,
          coverage: parsed.coverage || categoryLabel[category],
          category,
          note: parsed.note,
          status: parsed.status,
          followUpAt: parsed.followUpAt,
          followUpLabel: parsed.followUpLabel || (parsed.followUpAt ? "Follow-up" : ""),
        });
      } catch {
        return; // the data layer already showed the error; the text stays so nothing is lost
      }
      onOpenChange(false);
      toast.success(`Recorded memo for ${saved.clientName}`, {
        description: `${categoryLabel[category]} · ${
          saved.followUpAt ? `follow-up ${formatFollowUp(saved.followUpAt)}` : "no follow-up set"
        }`,
        duration: 9000,
        action: {
          label: "Undo",
          onClick: () => void actions.remove(saved.id).catch(() => {}),
        },
        cancel: { label: "Edit", onClick: () => onEdit(saved) },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="bottom-0 top-auto max-h-[92dvh] max-w-none translate-y-0 gap-0 overflow-y-auto rounded-t-2xl border-fo-outline/60 bg-fo-surface p-0 font-fo-body text-fo-ink data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:bottom-auto sm:top-[50%] sm:max-w-md sm:translate-y-[-50%] sm:rounded-xl">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-fo-outline/50 px-5 pb-4 pt-5 text-left">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-fo-outline sm:hidden" />
            <DialogTitle className="flex items-center gap-2 font-fo-display text-lg font-bold">
              <Sparkles className="size-5 text-fo-primary" /> Quick memo
            </DialogTitle>
            <DialogDescription className="text-xs text-fo-muted">
              Say or type what happened — the client, the policy and when to follow up. I'll fill in
              the rest.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleMic}
                aria-pressed={dictation.listening}
                aria-label={dictation.listening ? "Stop listening" : "Start listening"}
                disabled={busy}
                className={cn(
                  "relative grid size-14 shrink-0 cursor-pointer place-items-center rounded-full text-white shadow-md transition-all active:scale-95",
                  dictation.listening ? "bg-fo-error" : "bg-fo-primary",
                )}
              >
                {dictation.listening && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-fo-error/40" />
                )}
                {dictation.listening ? (
                  <MicOff className="relative size-6" />
                ) : (
                  <Mic className="relative size-6" />
                )}
              </button>
              <p className="text-sm text-fo-muted">
                {dictation.listening
                  ? "Listening… tap to stop"
                  : dictation.supported
                    ? "Tap the mic to speak"
                    : "Type your memo below"}
              </p>
            </div>
            <Textarea
              id="quick-memo-text"
              rows={5}
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              placeholder='e.g. "I spoke to Kamal Nath about the new health policy, he will confirm in two days"'
              className="rounded-md border-fo-outline bg-fo-lowest text-sm leading-relaxed"
            />
          </div>

          <DialogFooter className="gap-2 border-t border-fo-outline/50 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className="h-12 rounded-md border-fo-outline sm:h-10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || text.trim().length < 3}
              className="h-12 rounded-md bg-fo-primary text-white hover:bg-[#004b73] sm:h-10"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Reading…
                </>
              ) : (
                "Record memo"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
