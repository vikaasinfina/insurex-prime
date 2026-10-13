import type { FastifyBaseLogger } from "fastify";
import type { Database } from "../../config/database.js";
import type { Env } from "../../config/env.js";
import { renderMeetingInviteEmail, nameFromEmail } from "../../utils/email/meeting-invite-template.js";
import { isEmailConfigured, sendEmail } from "../../utils/email/send.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { AuthContext } from "../../middleware/auth.js";
import { badRequest, forbidden, notFound } from "../../utils/errors.js";
import type { CreateMeetingBody, UpdateMeetingBody } from "./meetings.schemas.js";

const MAX_MEETINGS = 500;

const meetingInclude = {
  organizer: { select: { id: true, email: true, role: true, agent: { select: { fullName: true } } } },
  attendees: {
    select: {
      user: {
        select: { id: true, email: true, role: true, agent: { select: { id: true, fullName: true } } },
      },
    },
  },
} satisfies Prisma.MeetingInclude;

type MeetingRow = Prisma.MeetingGetPayload<{ include: typeof meetingInclude }>;
type PersonRow = MeetingRow["organizer"];

const toPerson = (user: PersonRow) => ({
  name: user.agent?.fullName ?? user.email,
  role: user.role === "AGENT" ? ("AGENT" as const) : ("ADMIN" as const),
});

export const toMeetingDto = (meeting: MeetingRow, viewerUserId: string) => ({
  id: meeting.id,
  title: meeting.title,
  description: meeting.description,
  meetingUrl: meeting.meetingUrl,
  guestEmails: meeting.guestEmails,
  startsAt: meeting.startsAt.toISOString(),
  endsAt: meeting.endsAt.toISOString(),
  organizer: { userId: meeting.organizer.id, ...toPerson(meeting.organizer) },
  attendees: meeting.attendees.map(({ user }) => ({
    userId: user.id,
    agentId: user.agent?.id ?? null,
    ...toPerson(user),
  })),
  canEdit: meeting.organizerId === viewerUserId,
});

/** Meetings the caller organizes or is invited to that overlap the window. */
export async function listMeetings(db: Database, auth: AuthContext, from: string, to: string) {
  const meetings = await db.meeting.findMany({
    where: {
      startsAt: { lt: new Date(to) },
      endsAt: { gt: new Date(from) },
      OR: [{ organizerId: auth.userId }, { attendees: { some: { userId: auth.userId } } }],
    },
    include: meetingInclude,
    orderBy: { startsAt: "asc" },
    take: MAX_MEETINGS,
  });
  return meetings.map((meeting) => toMeetingDto(meeting, auth.userId));
}

export async function listInvitableAgents(db: Database) {
  return db.agent.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, fullName: true, agentCode: true },
    orderBy: { fullName: "asc" },
  });
}

/**
 * Who gets invited: an admin picks agents (or all of them); an agent always meets the
 * agency's admins.
 */
async function resolveAttendeeUserIds(
  db: Database,
  tenantId: string,
  auth: AuthContext,
  input: {
    allAgents?: boolean | undefined;
    agentIds?: string[] | undefined;
    guestEmails?: string[] | undefined;
  },
): Promise<string[]> {
  if (auth.role === "AGENT") {
    const admins = await db.user.findMany({
      where: { tenantId, role: "TENANT_ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    if (admins.length === 0) throw badRequest("Your agency has no admin to meet with.");
    return admins.map((admin) => admin.id);
  }
  // A meeting with outside guests only (no agents) is fine.
  if (!input.allAgents && !input.agentIds?.length && input.guestEmails?.length) return [];
  const agents = await db.agent.findMany({
    where: {
      status: "ACTIVE",
      ...(input.allAgents ? {} : { id: { in: input.agentIds ?? [] } }),
    },
    select: { userId: true },
  });
  if (agents.length === 0) throw badRequest("Choose at least one agent or add a guest email.");
  if (!input.allAgents && agents.length !== new Set(input.agentIds).size) {
    throw badRequest("One or more selected agents are not available.");
  }
  return agents.map((agent) => agent.userId);
}

/** Lowercased, deduplicated, without the organizer and without anyone already invited by account. */
const cleanGuests = (emails: string[] | undefined, exclude: string[]) => {
  const skip = new Set(exclude.map((email) => email.toLowerCase()));
  return [...new Set((emails ?? []).map((email) => email.trim().toLowerCase()))].filter(
    (email) => email && !skip.has(email),
  );
};

/**
 * Emails the invitation to every attendee account and outside guest, one message each so
 * nobody sees the others' addresses. The sender's name is the organizer's (agent name, or
 * the admin's name from their email); replies go to the organizer.
 */
async function sendInvitations(
  config: Env,
  logger: FastifyBaseLogger,
  meeting: MeetingRow,
  agencyName: string | undefined,
  timeZone: string | undefined,
) {
  const recipients = [
    ...meeting.attendees.map(({ user }) => user.email),
    ...meeting.guestEmails,
  ];
  if (!isEmailConfigured(config)) {
    logger.warn({ meetingId: meeting.id }, "meeting invitations not sent: email is not configured");
    return { sent: 0, failed: recipients.length };
  }
  const organizerName = meeting.organizer.agent?.fullName ?? nameFromEmail(meeting.organizer.email);
  const message = renderMeetingInviteEmail({
    title: meeting.title,
    description: meeting.description,
    meetingUrl: meeting.meetingUrl,
    startsAt: meeting.startsAt,
    endsAt: meeting.endsAt,
    timeZone: timeZone ?? "Asia/Kolkata",
    organizerName,
    organizerEmail: meeting.organizer.email,
    agencyName,
  });
  const results = await Promise.allSettled(
    recipients.map((to) =>
      sendEmail(config, {
        ...message,
        to,
        fromName: organizerName,
        replyTo: meeting.organizer.email,
        ...(config.MEETING_FROM_EMAIL ? { fromEmail: config.MEETING_FROM_EMAIL } : {}),
      }),
    ),
  );
  const failed = results.filter((result) => result.status === "rejected");
  for (const result of failed) {
    logger.error({ err: (result as PromiseRejectedResult).reason, meetingId: meeting.id }, "meeting invitation failed");
  }
  return { sent: results.length - failed.length, failed: failed.length };
}

export async function createMeeting(
  db: Database,
  tenantId: string,
  auth: AuthContext,
  body: CreateMeetingBody,
  mail: { config: Env; logger: FastifyBaseLogger },
) {
  const userIds = await resolveAttendeeUserIds(db, tenantId, auth, body);
  const accountEmails = (
    await db.user.findMany({ where: { id: { in: [...userIds, auth.userId] } }, select: { email: true } })
  ).map((user) => user.email);
  const created = await db.meeting.create({
    data: {
      tenantId,
      organizerId: auth.userId,
      title: body.title,
      description: body.description ?? "",
      meetingUrl: body.meetingUrl ?? "",
      guestEmails: cleanGuests(body.guestEmails, accountEmails),
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      attendees: { create: userIds.map((userId) => ({ userId })) },
    },
    include: meetingInclude,
  });
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const emails = await sendInvitations(mail.config, mail.logger, created, tenant?.name, body.timeZone);
  return { ...toMeetingDto(created, auth.userId), emails };
}

/** Loads a meeting the caller organized; 404 if it is not visible to them, 403 if not theirs. */
async function findOwnMeeting(db: Database, auth: AuthContext, id: string) {
  const meeting = await db.meeting.findFirst({
    where: {
      id,
      OR: [{ organizerId: auth.userId }, { attendees: { some: { userId: auth.userId } } }],
    },
    include: meetingInclude,
  });
  if (!meeting) throw notFound("Meeting");
  if (meeting.organizerId !== auth.userId) {
    throw forbidden("Only the person who scheduled this meeting can change it.");
  }
  return meeting;
}

export async function updateMeeting(
  db: Database,
  tenantId: string,
  auth: AuthContext,
  id: string,
  body: UpdateMeetingBody,
) {
  const existing = await findOwnMeeting(db, auth, id);
  const startsAt = body.startsAt ? new Date(body.startsAt) : existing.startsAt;
  const endsAt = body.endsAt ? new Date(body.endsAt) : existing.endsAt;
  if (endsAt <= startsAt) throw badRequest("The meeting must end after it starts.");

  // Admins can change who is invited; an agent's guests are always the agency admins.
  const changesGuests =
    auth.role !== "AGENT" && (body.allAgents !== undefined || body.agentIds !== undefined);
  const userIds = changesGuests
    ? await resolveAttendeeUserIds(db, tenantId, auth, body)
    : null;

  const updated = await db.meeting.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.meetingUrl !== undefined ? { meetingUrl: body.meetingUrl } : {}),
      ...(body.guestEmails !== undefined
        ? {
            guestEmails: cleanGuests(body.guestEmails, [
              existing.organizer.email,
              ...existing.attendees.map(({ user }) => user.email),
            ]),
          }
        : {}),
      startsAt,
      endsAt,
      ...(userIds
        ? { attendees: { deleteMany: {}, create: userIds.map((userId) => ({ userId })) } }
        : {}),
    },
    include: meetingInclude,
  });
  return toMeetingDto(updated, auth.userId);
}

export async function deleteMeeting(db: Database, auth: AuthContext, id: string) {
  await findOwnMeeting(db, auth, id);
  await db.meeting.delete({ where: { id } });
  return { id };
}
