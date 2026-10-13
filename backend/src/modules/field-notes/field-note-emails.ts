import type { FastifyBaseLogger } from "fastify";
import type { Database } from "../../config/database.js";
import type { Env } from "../../config/env.js";
import type { FieldNote } from "../../generated/prisma/client.js";
import { nameFromEmail } from "../../utils/email/meeting-invite-template.js";
import { renderFieldNoteEmail } from "../../utils/email/field-note-template.js";
import { isEmailConfigured, sendEmail } from "../../utils/email/send.js";

export const REMINDER_LEAD_MS = 60 * 60_000;

type Mailer = Pick<Env, "RESEND_API_KEY" | "RESEND_FROM_EMAIL" | "RESEND_FROM_NAME" | "NOTE_EMAIL_TIME_ZONE">;

/** Whoever owns the note: an agent (has a full name) or an admin (name comes from their email). */
interface OwnerRow {
  email: string;
  agent: { fullName: string } | null;
}

const ownerSelect = { email: true, agent: { select: { fullName: true } } } as const;

async function send(
  config: Mailer,
  owner: OwnerRow,
  note: FieldNote,
  kind: "saved" | "reminder",
) {
  const message = renderFieldNoteEmail({
    kind,
    agentName: owner.agent?.fullName ?? nameFromEmail(owner.email),
    clientName: note.clientName,
    contactName: note.contactName,
    phone: note.phone,
    coverage: note.coverage,
    note: note.note,
    followUpLabel: note.followUpLabel,
    followUpAt: note.followUpAt,
    timeZone: config.NOTE_EMAIL_TIME_ZONE,
  });
  await sendEmail(config, { ...message, to: owner.email });
}

/**
 * Emails the note's owner (agent or admin) a summary of the memo they just saved (who, when, message, phone).
 * Never throws: a mail problem must not fail saving the note.
 */
export async function sendNoteSavedEmail(
  db: Database,
  config: Env,
  logger: FastifyBaseLogger,
  userId: string,
  note: FieldNote,
) {
  if (!isEmailConfigured(config)) return;
  try {
    const owner = await db.user.findFirst({ where: { id: userId }, select: ownerSelect });
    if (owner) await send(config, owner, note, "saved");
  } catch (error) {
    logger.error({ err: error, noteId: note.id }, "field note email failed");
  }
}

/**
 * Sends the "1 hour to go" reminder for every open follow-up that starts within the hour.
 * Each note is claimed first (reminderSentAt) so two server instances never both send it.
 * Returns how many reminders went out.
 */
export async function sendDueReminders(
  db: Database,
  config: Env,
  logger: FastifyBaseLogger,
  now = new Date(),
) {
  if (!isEmailConfigured(config)) return 0;
  const due = await db.fieldNote.findMany({
    where: {
      reminderSentAt: null,
      status: { not: "COMPLETED" },
      followUpAt: { gt: now, lte: new Date(now.getTime() + REMINDER_LEAD_MS) },
    },
    include: { user: { select: { ...ownerSelect, status: true } } },
    take: 200,
  });

  let sent = 0;
  for (const note of due) {
    const claimed = await db.fieldNote.updateMany({
      where: { id: note.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claimed.count === 0 || note.user.status !== "ACTIVE") continue;
    try {
      await send(config, note.user, note, "reminder");
      sent += 1;
    } catch (error) {
      // Release the claim so the next run retries (the follow-up is still ahead).
      await db.fieldNote.updateMany({ where: { id: note.id }, data: { reminderSentAt: null } });
      logger.error({ err: error, noteId: note.id }, "field note reminder failed");
    }
  }
  return sent;
}

/** Runs the reminder check every minute until `stop()` is called. */
export function startReminderJob(db: Database, config: Env, logger: FastifyBaseLogger) {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    sendDueReminders(db, config, logger)
      .catch((error) => logger.error({ err: error }, "reminder job failed"))
      .finally(() => {
        running = false;
      });
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
