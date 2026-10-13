import { apiRequest } from "./client";

export interface ApiMeetingPerson {
  userId: string;
  name: string;
  role: "ADMIN" | "AGENT";
}

export interface ApiMeeting {
  id: string;
  title: string;
  description: string;
  /** Google Meet / Zoom link; empty when there is none. */
  meetingUrl: string;
  /** Outside guests invited by email. */
  guestEmails: string[];
  startsAt: string;
  endsAt: string;
  organizer: ApiMeetingPerson;
  attendees: (ApiMeetingPerson & { agentId: string | null })[];
  /** True only for the person who scheduled the meeting. */
  canEdit: boolean;
}

export interface MeetingInput {
  title: string;
  description: string;
  meetingUrl: string;
  startsAt: string;
  endsAt: string;
  /** Admin only: the agents to invite. An agent's meeting is always with the agency admins. */
  agentIds?: string[];
  /** Any other email addresses to invite. */
  guestEmails?: string[];
  /** IANA zone the invitation email shows times in. */
  timeZone?: string;
}

/** A new meeting plus how many invitation emails went out. */
export interface CreatedMeeting extends ApiMeeting {
  emails: { sent: number; failed: number };
}

export interface MeetingAgent {
  id: string;
  fullName: string;
  agentCode: string;
}

export const meetingsApi = {
  list: (from: string, to: string) =>
    apiRequest<ApiMeeting[]>("/meetings", { query: { from, to } }),
  agents: () => apiRequest<MeetingAgent[]>("/meetings/agents"),
  create: (input: MeetingInput) =>
    apiRequest<CreatedMeeting>("/meetings", { method: "POST", body: input }),
  update: (id: string, input: Partial<MeetingInput>) =>
    apiRequest<ApiMeeting>(`/meetings/${id}`, { method: "PATCH", body: input }),
  remove: (id: string) => apiRequest<{ id: string }>(`/meetings/${id}`, { method: "DELETE" }),
};
