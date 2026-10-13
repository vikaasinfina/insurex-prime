import { escapeHtml } from "./password-reset-template.js";
import type { EmailMessage } from "./send.js";

export interface MeetingInviteInput {
  title: string;
  description: string;
  meetingUrl: string;
  startsAt: Date;
  endsAt: Date;
  /** IANA zone the times are shown in, e.g. "Asia/Kolkata". */
  timeZone: string;
  organizerName: string;
  organizerEmail: string;
  agencyName?: string | undefined;
}

const BRAND = "#0265DC";
const INK = "#0f172a";
const MUTED = "#475569";
const PAGE_BG = "#f1f5fb";
const SANS = "'Inter', 'Segoe UI', Roboto, Arial, Helvetica, sans-serif";

/** "Kempanna.Admin@x.com" -> "Kempanna Admin": a readable name for accounts that only have an email. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._\-+\d]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ") || email;
}

/** Falls back to UTC if the zone name is not one the runtime knows. */
function formatWhen(input: MeetingInviteInput) {
  const attempt = (timeZone: string) => {
    const date = new Intl.DateTimeFormat("en-IN", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(input.startsAt);
    const time = new Intl.DateTimeFormat("en-IN", { timeZone, hour: "2-digit", minute: "2-digit" });
    const zone =
      new Intl.DateTimeFormat("en-IN", { timeZone, timeZoneName: "short" })
        .formatToParts(input.startsAt)
        .find((part) => part.type === "timeZoneName")?.value ?? timeZone;
    return {
      date,
      time: `${time.format(input.startsAt).toUpperCase()} – ${time.format(input.endsAt).toUpperCase()} (${zone})`,
    };
  };
  try {
    return attempt(input.timeZone);
  } catch {
    return attempt("UTC");
  }
}

export function renderMeetingInviteEmail(input: MeetingInviteInput): Omit<EmailMessage, "to"> {
  const { date, time } = formatWhen(input);
  const subject = `Meeting invitation: ${input.title} — ${date}`;

  const text = [
    `${input.organizerName} has invited you to a meeting.`,
    "",
    input.title,
    `Date: ${date}`,
    `Time: ${time}`,
    input.meetingUrl ? `Join: ${input.meetingUrl}` : "",
    input.description ? `\n${input.description}` : "",
    "",
    `Reply to this email to reach ${input.organizerName} (${input.organizerEmail}).`,
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n");

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 16px 6px 0;font-family:${SANS};font-size:13px;color:${MUTED};white-space:nowrap;" valign="top">${label}</td>
      <td style="padding:6px 0;font-family:${SANS};font-size:14px;font-weight:600;color:${INK};">${value}</td>
    </tr>`;

  const joinButton = input.meetingUrl
    ? `<p style="margin:22px 0 4px;"><a href="${escapeHtml(input.meetingUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;font-family:${SANS};font-size:14px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;">Join meeting</a></p>
       <p style="margin:6px 0 0;font-family:${SANS};font-size:12px;color:${MUTED};word-break:break-all;">${escapeHtml(input.meetingUrl)}</p>`
    : "";

  const description = input.description
    ? `<p style="margin:20px 0 0;padding:14px 16px;background:#f4f8ff;border-radius:10px;font-family:${SANS};font-size:14px;line-height:1.55;color:${MUTED};white-space:pre-wrap;">${escapeHtml(input.description)}</p>`
    : "";

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${PAGE_BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;padding:28px 28px 24px;">
        <tr><td>
          <p style="margin:0 0 4px;font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${BRAND};">Meeting invitation</p>
          <h1 style="margin:0 0 6px;font-family:${SANS};font-size:22px;line-height:1.3;color:${INK};">${escapeHtml(input.title)}</h1>
          <p style="margin:0 0 18px;font-family:${SANS};font-size:14px;color:${MUTED};"><strong style="color:${INK};">${escapeHtml(input.organizerName)}</strong> has invited you${input.agencyName ? ` · ${escapeHtml(input.agencyName)}` : ""}</p>
          <table role="presentation" cellpadding="0" cellspacing="0">
            ${row("Date", escapeHtml(date))}
            ${row("Time", escapeHtml(time))}
          </table>
          ${joinButton}
          ${description}
          <p style="margin:24px 0 0;font-family:${SANS};font-size:12px;color:#94a3b8;">Reply to this email to reach ${escapeHtml(input.organizerName)} (${escapeHtml(input.organizerEmail)}).</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}
