import type { Database } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";
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
  return { ...rest, ...(followUpAt !== undefined ? { followUpAt: toDate(followUpAt) } : {}) };
}

export async function listFieldNotes(
  db: Database,
  agentId: string,
  query: { q?: string | undefined; status?: "IN_PROGRESS" | "COMPLETED" | "POSTPONED" | undefined },
) {
  const where: Prisma.FieldNoteWhereInput = { agentId };
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
  agentId: string,
  body: CreateFieldNoteBody,
) {
  const count = await db.fieldNote.count({ where: { agentId } });
  const { followUpAt, loggedAt, tag, ...rest } = body;
  const created = await db.fieldNote.create({
    data: {
      ...rest,
      tenantId,
      agentId,
      tag: tag ?? `Sticky Note #${count + 1}`,
      followUpAt: toDate(followUpAt) ?? null,
      ...(loggedAt ? { loggedAt: new Date(loggedAt) } : {}),
    },
  });
  return toFieldNoteDto(created);
}

export async function updateFieldNote(
  db: Database,
  agentId: string,
  id: string,
  body: UpdateFieldNoteBody,
) {
  // updateMany so the agentId filter is part of the write: agents can only touch their own memos.
  const { count } = await db.fieldNote.updateMany({ where: { id, agentId }, data: toData(body) });
  if (count === 0) throw notFound("Field note");
  return toFieldNoteDto(await db.fieldNote.findFirstOrThrow({ where: { id, agentId } }));
}

export async function bulkUpdateFieldNotes(
  db: Database,
  agentId: string,
  ids: string[],
  body: UpdateFieldNoteBody,
) {
  await db.fieldNote.updateMany({ where: { id: { in: ids }, agentId }, data: toData(body) });
  const notes = await db.fieldNote.findMany({ where: { id: { in: ids }, agentId } });
  return notes.map(toFieldNoteDto);
}

export async function deleteFieldNote(db: Database, agentId: string, id: string) {
  const { count } = await db.fieldNote.deleteMany({ where: { id, agentId } });
  if (count === 0) throw notFound("Field note");
  return { id };
}
