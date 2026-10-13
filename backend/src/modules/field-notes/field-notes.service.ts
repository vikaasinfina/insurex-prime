import type { Database } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { REMINDER_LEAD_MS } from "./field-note-emails.js";
import { notFound } from "../../utils/errors.js";
import {
  toFieldNoteDto,
  type CreateFieldNoteBody,
  type UpdateFieldNoteBody,
} from "./field-notes.schemas.js";

const MAX_NOTES = 500;

const toDate = (value: string | null | undefined) => (value ? new Date(value) : value);

/** Scalar patch for Prisma (ISO strings become dates; `undefined` fields are left alone). */
function toData(body: UpdateFieldNoteBody): Prisma.FieldNoteUncheckedUpdateInput {
  const { followUpAt, ...rest } = body;
  return {
    ...rest,
    // A moved follow-up gets its own reminder.
    ...(followUpAt !== undefined ? { followUpAt: toDate(followUpAt), reminderSentAt: null } : {}),
  };
}

export async function listFieldNotes(
  db: Database,
  userId: string,
  query: { q?: string | undefined; status?: "IN_PROGRESS" | "COMPLETED" | "POSTPONED" | undefined },
) {
  const where: Prisma.FieldNoteWhereInput = { userId };
  if (query.status) where.status = query.status;
  if (query.q) {
    const contains = { contains: query.q, mode: "insensitive" as const };
    where.OR = [
      { clientName: contains },
      { contactName: contains },
      { coverage: contains },
      { note: contains },
    ];
  }
  const notes = await db.fieldNote.findMany({
    where,
    orderBy: { loggedAt: "desc" },
    take: MAX_NOTES,
  });
  return notes.map(toFieldNoteDto);
}

export async function createFieldNote(
  db: Database,
  tenantId: string,
  owner: { userId: string; agentId: string | null },
  body: CreateFieldNoteBody,
) /* returns the stored row */ {
  const count = await db.fieldNote.count({ where: { userId: owner.userId } });
  const { followUpAt, loggedAt, tag, ...rest } = body;
  // The saved-note email already covers a follow-up that is less than an hour away.
  const dueSoon = followUpAt ? new Date(followUpAt).getTime() - Date.now() < REMINDER_LEAD_MS : false;
  const created = await db.fieldNote.create({
    data: {
      ...rest,
      tenantId,
      userId: owner.userId,
      agentId: owner.agentId,
      tag: tag ?? `Sticky Note #${count + 1}`,
      followUpAt: toDate(followUpAt) ?? null,
      ...(dueSoon ? { reminderSentAt: new Date() } : {}),
      ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
    },
  });
  return created;
}

export async function updateFieldNote(
  db: Database,
  userId: string,
  id: string,
  body: UpdateFieldNoteBody,
) {
  // updateMany so the userId filter is part of the write: people can only touch their own memos.
  const { count } = await db.fieldNote.updateMany({ where: { id, userId }, data: toData(body) });
  if (count === 0) throw notFound("Field note");
  return toFieldNoteDto(await db.fieldNote.findFirstOrThrow({ where: { id, userId } }));
}

export async function bulkUpdateFieldNotes(
  db: Database,
  userId: string,
  ids: string[],
  body: UpdateFieldNoteBody,
) {
  await db.fieldNote.updateMany({ where: { id: { in: ids }, userId }, data: toData(body) });
  const notes = await db.fieldNote.findMany({ where: { id: { in: ids }, userId } });
  return notes.map(toFieldNoteDto);
}

export async function deleteFieldNote(db: Database, userId: string, id: string) {
  const { count } = await db.fieldNote.deleteMany({ where: { id, userId } });
  if (count === 0) throw notFound("Field note");
  return { id };
}
