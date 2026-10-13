import type { Env } from "../../config/env.js";
import { AppError } from "../errors.js";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Overrides the configured sender display name (e.g. the person who scheduled a meeting). */
  fromName?: string;
  /** Overrides the configured sender address; must be on a domain verified in Resend. */
  fromEmail?: string;
  /** Where replies go. */
  replyTo?: string;
}

export const isEmailConfigured = (config: Pick<Env, "RESEND_API_KEY" | "RESEND_FROM_EMAIL">) =>
  Boolean(config.RESEND_API_KEY && config.RESEND_FROM_EMAIL);

/**
 * Sends through Resend's HTTPS API rather than SMTP: Render (like most PaaS hosts) blocks
 * outbound SMTP ports, which makes SMTP hang in production regardless of credentials.
 */
export async function sendEmail(
  config: Pick<Env, "RESEND_API_KEY" | "RESEND_FROM_EMAIL" | "RESEND_FROM_NAME">,
  message: EmailMessage,
): Promise<void> {
  if (!config.RESEND_API_KEY || !config.RESEND_FROM_EMAIL) {
    throw new AppError(503, "SERVICE_UNAVAILABLE", "Email sending is not configured.");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${(message.fromName ?? config.RESEND_FROM_NAME).replace(/[<>"\r\n]/g, "")} <${message.fromEmail ?? config.RESEND_FROM_EMAIL}>`,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // The body can echo the recipient; keep it out of the error that reaches clients.
    throw new Error(`Resend responded ${response.status}: ${await response.text().catch(() => "")}`);
  }
}
