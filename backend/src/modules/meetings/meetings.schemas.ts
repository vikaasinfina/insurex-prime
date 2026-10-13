import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

const meetingUrlSchema = text(500)
  .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), "Enter a full http(s) link.")
  .describe("Google Meet / Zoom link; empty when there is none");

export const meetingSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  meetingUrl: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  guestEmails: z.array(z.string()),
  organizer: z.object({ userId: z.uuid(), name: z.string(), role: z.enum(["ADMIN", "AGENT"]) }),
  attendees: z.array(
    z.object({
      userId: z.uuid(),
      agentId: z.uuid().nullable(),
      name: z.string(),
      role: z.enum(["ADMIN", "AGENT"]),
    }),
  ),
  canEdit: z.boolean().describe("True only for the person who scheduled the meeting"),
});

const meetingFieldsSchema = z.object({
  title: text(200).min(1),
  description: text(5000),
  meetingUrl: meetingUrlSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

const attendeesSchema = z.object({
  guestEmails: z
    .array(z.email().max(200))
    .max(30)
    .optional()
    .describe("Any other email addresses to invite; each is emailed the invitation"),
  timeZone: z
    .string()
    .max(64)
    .optional()
    .describe("IANA zone (e.g. Asia/Kolkata) the invitation email shows times in"),
  allAgents: z.boolean().optional().describe("Admin only: invite every active agent"),
  agentIds: z.array(z.uuid()).max(500).optional().describe("Admin only: agents to invite"),
});

const endsAfterStart = (value: { startsAt?: string | undefined; endsAt?: string | undefined }) =>
  !value.startsAt || !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt);

export const createMeetingBodySchema = meetingFieldsSchema
  .partial({ description: true, meetingUrl: true })
  .extend(attendeesSchema.shape)
  .refine(endsAfterStart, { message: "The meeting must end after it starts.", path: ["endsAt"] });

export const updateMeetingBodySchema = meetingFieldsSchema
  .partial()
  .extend(attendeesSchema.shape)
  .refine(endsAfterStart, { message: "The meeting must end after it starts.", path: ["endsAt"] });

export const createdMeetingSchema = meetingSchema.extend({
  emails: z.object({
    sent: z.number().int(),
    failed: z.number().int(),
  }),
});

export const meetingIdParamsSchema = z.object({ id: z.uuid() });

export const listMeetingsQuerySchema = z.object({
  from: z.iso.datetime().describe("Start of the window (inclusive)"),
  to: z.iso.datetime().describe("End of the window (exclusive)"),
});

export const meetingAgentSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  agentCode: z.string(),
});

export type CreateMeetingBody = z.infer<typeof createMeetingBodySchema>;
export type UpdateMeetingBody = z.infer<typeof updateMeetingBodySchema>;
