import { toast } from "sonner";
import { useFieldNoteActions, type FieldNote } from "../field-notes-data";

/** One-tap memo actions with an Undo toast. Failures are reported by the data layer. */
export function useNoteActions() {
  const actions = useFieldNoteActions();

  const completeNote = (note: FieldNote) => {
    const previous = note.status;
    actions
      .update(note.id, { status: "COMPLETED" })
      .then(() =>
        toast.success(`${note.clientName} marked completed`, {
          action: {
            label: "Undo",
            onClick: () => void actions.update(note.id, { status: previous }).catch(() => {}),
          },
        }),
      )
      .catch(() => {});
  };

  const archiveNote = (note: FieldNote) => {
    actions
      .remove(note.id)
      .then(() =>
        toast.success(`Memo for ${note.clientName} archived`, {
          action: {
            label: "Undo",
            onClick: () =>
              void actions.restore(note).catch(() => toast.error("Couldn't restore the memo.")),
          },
        }),
      )
      .catch(() => {});
  };

  return { completeNote, archiveNote };
}
