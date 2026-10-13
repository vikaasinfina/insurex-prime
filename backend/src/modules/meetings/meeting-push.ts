import type { FastifyBaseLogger } from "fastify";
import type { Database } from "../../config/database.js";
import type { Env } from "../../config/env.js";
import { nameFromEmail } from "../../utils/email/meeting-invite-template.js";
import { isPushConfigured, sendPush } from "../push/push.service.js";

export const TWO_HOURS_MS = 2 * 60 * 60_000;
export const FIFTEEN_MIN_MS = 15 * 60_000;

const personSelect = { id: true, email: true, role: true, agent: { select: { fullName: true } } } as const;

const meetingInclude = {
  organizer: { select: personSelect },
  attendees: { select: { user: { select: personSelect } } },
} as const;

interface Person {
  id: string;
  email: string;
  role: string;
  agent: { fullName: string } | null;
}

interface PushMeeting {
  id: string;
  title: string;
  meetingUrl: string;
  startsAt: Date;
  organizer: Person;
  attendees: { user: Person }[];
}

const nameOf = (person: Person) => person.agent?.fullName ?? nameFromEmail(person.email);

const timeLabel = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone })
    .format(date)
    .toUpperCase();

/** Who the recipient is meeting: the organizer, or (for the organizer) the invited people. */
function withWhom(meeting: PushMeeting, recipient: Person) {
  if (recipient.id !== meeting.organizer.id) return nameOf(meeting.organizer);
  const names = meeting.attendees.map(({ user }) => nameOf(user));
  if (names.length === 0) return "your guests";
  return names.length <= 2 ? names.join(" & ") : `${names[0]}, ${names[1]} +${names.length - 2}`;
}

const calendarUrl = (recipient: Person) =>
  `${recipient.role === "AGENT" ? "/agent" : "/admin"}/calendar?meeting=`;

/** Flags for a meeting that is already inside a reminder window when it is saved: no instant "2 hours" alert. */
export function reminderFlagsFor(startsAt: Date, now = new Date()) {
  const lead = startsAt.getTime() - now.getTime();
  return {
    pushedTwoHoursAt: lead <= TWO_HOURS_MS ? now : null,
    pushedFifteenMinAt: lead <= FIFTEEN_MIN_MS ? now : null,
  };
}

function compose(
  kind: "invited" | "two-hours" | "fifteen-min",
  meeting: PushMeeting,
  recipient: Person,
  timeZone: string,
) {
  const at = timeLabel(meeting.startsAt, timeZone);
  const who = withWhom(meeting, recipient);
  const heading =
    kind === "invited"
      ? `New meeting: ${meeting.title}`
      : kind === "two-hours"
        ? "Meeting in 2 hours"
        : "Meeting in 15 minutes";
  const body =
    kind === "invited"
      ? `${who} scheduled "${meeting.title}" at ${at}.`
      : `${meeting.title} with ${who} at ${at}.`;
  return {
    title: heading,
    body,
    url: `${calendarUrl(recipient)}${meeting.id}`,
    ...(meeting.meetingUrl ? { joinUrl: meeting.meetingUrl } : {}),
    tag: `meeting-${meeting.id}-${kind === "invited" ? "invite" : "remind"}`,
  };
}

/** Sends one kind of alert, each recipient getting their own wording. */
async function notify(
  db: Database,
  config: Env,
  logger: FastifyBaseLogger,
  meeting: PushMeeting,
  kind: "invited" | "two-hours" | "fifteen-min",
  recipients: Person[],
) {
  await Promise.all(
    recipients.map((recipient) =>
      sendPush(db, config, logger, [recipient.id], compose(kind, meeting, recipient, config.NOTE_EMAIL_TIME_ZONE)),
    ),
  );
}

/** Tells everyone invited (not the organizer) about a new meeting. Never throws. */
export async function notifyMeetingInvited(
  db: Database,
  config: Env,
  logger: FastifyBaseLogger,
  meeting: PushMeeting,
) {
  if (!isPushConfigured(config)) return;
  await notify(db, config, logger, meeting, "invited", meeting.attendees.map(({ user }) => user));
}

/**
 * Sends the "2 hours" and "15 minutes" alerts to the organizer and everyone invited.
 * Each meeting is claimed first so two server instances never both send it.
 */
export async function sendDueMeetingAlerts(
  db: Database,
  config: Env,
  logger: FastifyBaseLogger,
  now = new Date(),
) {
  if (!isPushConfigured(config)) return 0;
  let sent = 0;
  const steps = [
    { kind: "fifteen-min", field: "pushedFifteenMinAt", lead: FIFTEEN_MIN_MS },
    { kind: "two-hours", field: "pushedTwoHoursAt", lead: TWO_HOURS_MS },
  ] as const;

  for (const { kind, field, lead } of steps) {
    const due = await db.meeting.findMany({
      where: { [field]: null, startsAt: { gt: now, lte: new Date(now.getTime() + lead) } },
      include: meetingInclude,
      take: 200,
    });
    for (const meeting of due) {
      const claimed = await db.meeting.updateMany({
        where: { id: meeting.id, [field]: null },
        data: { [field]: now },
      });
      if (claimed.count === 0) continue;
      // A 15-minute alert makes the 2-hour one pointless if it never went out.
      if (kind === "fifteen-min") {
        await db.meeting.updateMany({
          where: { id: meeting.id, pushedTwoHoursAt: null },
          data: { pushedTwoHoursAt: now },
        });
      }
      await notify(db, config, logger, meeting, kind, [
        meeting.organizer,
        ...meeting.attendees.map(({ user }) => user),
      ]);
      sent += 1;
    }
  }
  return sent;
}

/** Runs the meeting alert check every minute until `stop()` is called. */
export function startMeetingAlertJob(db: Database, config: Env, logger: FastifyBaseLogger) {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    sendDueMeetingAlerts(db, config, logger)
      .catch((error) => logger.error({ err: error }, "meeting alert job failed"))
      .finally(() => {
        running = false;
      });
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
