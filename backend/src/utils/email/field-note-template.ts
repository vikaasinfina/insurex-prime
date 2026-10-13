import { escapeHtml } from "./password-reset-template.js";
import type { EmailMessage } from "./send.js";

export interface FieldNoteEmailInput {
  kind: "saved" | "reminder";
  agentName: string;
  clientName: string;
  contactName: string;
  phone: string;
  coverage: string;
  note: string;
  followUpLabel: string;
  /** Null when the memo has no follow-up date. */
  followUpAt: Date | null;
  timeZone: string;
}

const BRAND = "#0265DC";
const INK = "#0f172a";
const MUTED = "#475569";
const PAGE_BG = "#f1f5fb";
const SANS = "'Inter', 'Segoe UI', Roboto, Arial, Helvetica, sans-serif";

function formatWhen(date: Date, timeZone: string) {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-IN", {
      timeZone: zone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    })
      .format(date)
      .replace(/\b(am|pm)\b/, (value) => value.toUpperCase());
  try {
    return format(timeZone);
  } catch {
    return format("UTC");
  }
}

/** The memo summary sent when a sticky note is saved, and the reminder an hour before its follow-up. */
export function renderFieldNoteEmail(input: FieldNoteEmailInput): Omit<EmailMessage, "to"> {
  const when = input.followUpAt ? formatWhen(input.followUpAt, input.timeZone) : null;
  const who = input.contactName ? `${input.clientName} (${input.contactName})` : input.clientName;
  const reminder = input.kind === "reminder";

  const subject = reminder
    ? `Reminder: ${input.followUpLabel || "follow-up"} with ${input.clientName} in 1 hour`
    : `Sticky note saved: ${input.clientName}${when ? ` — follow-up ${when}` : ""}`;
  const heading = reminder ? "Your follow-up starts in about an hour" : "Your sticky note was saved";

  const rows: [string, string][] = [
    ["With", who],
    ...(when ? ([["When", when]] as [string, string][]) : []),
    ...(input.followUpLabel ? ([["Purpose", input.followUpLabel]] as [string, string][]) : []),
    ...(input.phone ? ([["Phone", input.phone]] as [string, string][]) : []),
    ...(input.coverage ? ([["Cover", input.coverage]] as [string, string][]) : []),
  ];

  const text = [
    `Hi ${input.agentName},`,
    "",
    heading + ".",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Message:",
    input.note,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${PAGE_BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;padding:28px 28px 24px;">
        <tr><td>
          <p style="margin:0 0 4px;font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${BRAND};">${reminder ? "Follow-up reminder" : "Sticky note"}</p>
          <h1 style="margin:0 0 6px;font-family:${SANS};font-size:21px;line-height:1.3;color:${INK};">${heading}</h1>
          <p style="margin:0 0 18px;font-family:${SANS};font-size:14px;color:${MUTED};">Hi ${escapeHtml(input.agentName)},</p>
          <table role="presentation" cellpadding="0" cellspacing="0">
            ${rows
              .map(
                ([label, value]) => `<tr>
              <td style="padding:6px 16px 6px 0;font-family:${SANS};font-size:13px;color:${MUTED};white-space:nowrap;" valign="top">${label}</td>
              <td style="padding:6px 0;font-family:${SANS};font-size:14px;font-weight:600;color:${INK};">${escapeHtml(value)}</td>
            </tr>`,
              )
              .join("")}
          </table>
          <p style="margin:18px 0 6px;font-family:${SANS};font-size:12px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.05em;">Message</p>
          <p style="margin:0;padding:14px 16px;background:#fff8d6;border-radius:10px;font-family:${SANS};font-size:14px;line-height:1.55;color:${INK};white-space:pre-wrap;">${escapeHtml(input.note)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}
