import { z } from "zod";
import { FieldNoteStatus, InsuranceType } from "../../generated/prisma/enums.js";
import type { FieldNote } from "../../generated/prisma/client.js";

const text = (max: number) => z.string().trim().max(max);

export const fieldNoteSchema = z.object({
  id: z.uuid(),
  clientName: z.string(),
  contactName: z.string(),
  phone: z.string(),
  coverage: z.string(),
  category: z.enum(InsuranceType),
  note: z.string(),
  tag: z.string(),
  status: z.enum(FieldNoteStatus),
  followUpAt: z.string().nullable().describe("ISO timestamp of the next follow-up"),
  followUpLabel: z.string(),
  recurring: z.string().nullable(),
  loggedAt: z.string().describe("ISO timestamp the memo was logged"),
});

const fieldNoteInputSchema = z.object({
  clientName: text(200).min(1),
  contactName: text(200),
  phone: text(30),
  coverage: text(200),
  category: z.enum(InsuranceType),
  note: text(5000).min(1),
  status: z.enum(FieldNoteStatus),
  followUpAt: z.iso.datetime().nullable(),
  followUpLabel: text(100),
  recurring: text(50).nullable(),
});

export const createFieldNoteBodySchema = fieldNoteInputSchema
  .partial()
  .required({ clientName: true, category: true, note: true })
  .extend({
    // Only sent when restoring an archived memo (undo): keeps its original tag and date.
    tag: text(100).optional(),
    loggedAt: z.iso.datetime().optional(),
  });

// No defaults here: a partial update must leave the fields it does not mention alone.
export const updateFieldNoteBodySchema = fieldNoteInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Send at least one field to update.");

export const bulkUpdateFieldNotesBodySchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
  patch: updateFieldNoteBodySchema,
});

export const fieldNoteIdParamsSchema = z.object({ id: z.uuid() });

export const listFieldNotesQuerySchema = z.object({
  q: z.string().trim().max(100).optional().describe("Matches client, contact, coverage or memo"),
  status: z.enum(FieldNoteStatus).optional(),
});

export type CreateFieldNoteBody = z.infer<typeof createFieldNoteBodySchema>;
export type UpdateFieldNoteBody = z.infer<typeof updateFieldNoteBodySchema>;

export const toFieldNoteDto = (note: FieldNote): z.infer<typeof fieldNoteSchema> => ({
  id: note.id,
  clientName: note.clientName,
  contactName: note.contactName,
  phone: note.phone,
  coverage: note.coverage,
  category: note.category,
  note: note.note,
  tag: note.tag,
  status: note.status,
  followUpAt: note.followUpAt?.toISOString() ?? null,
  followUpLabel: note.followUpLabel,
  recurring: note.recurring,
  loggedAt: note.loggedAt.toISOString(),
});
