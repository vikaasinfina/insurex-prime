import webpush from "web-push";
import type { FastifyBaseLogger } from "fastify";
import type { Database } from "../../config/database.js";
import type { Env } from "../../config/env.js";

export interface PushMessage {
  title: string;
  body: string;
  /** Page inside the app the notification opens. */
  url: string;
  /** Meeting link, offered as a "Join" button. */
  joinUrl?: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
}

export const isPushConfigured = (config: Pick<Env, "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY">) =>
  Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);

type PushConfig = Pick<Env, "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT">;

/**
 * Sends one notification to every phone/browser the given users have enabled alerts on.
 * Never throws: a push problem must not fail the request that triggered it. Subscriptions the
 * push service reports as gone (404/410) are deleted. Returns how many devices accepted it.
 */
export async function sendPush(
  db: Database,
  config: PushConfig,
  logger: FastifyBaseLogger,
  userIds: string[],
  message: PushMessage,
) {
  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY || userIds.length === 0) return 0;
  try {
    const subscriptions = await db.pushSubscription.findMany({
      where: { userId: { in: userIds }, user: { status: "ACTIVE" } },
    });
    const payload = JSON.stringify(message);
    const options = {
      vapidDetails: {
        subject: config.VAPID_SUBJECT,
        publicKey: config.VAPID_PUBLIC_KEY,
        privateKey: config.VAPID_PRIVATE_KEY,
      },
      TTL: 60 * 60,
      urgency: "high" as const,
    };
    let delivered = 0;
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
            payload,
            options,
          );
          delivered += 1;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await db.pushSubscription.deleteMany({ where: { id: subscription.id } });
          } else {
            logger.error({ err: error, subscriptionId: subscription.id }, "push notification failed");
          }
        }
      }),
    );
    return delivered;
  } catch (error) {
    logger.error({ err: error }, "push notification failed");
    return 0;
  }
}

export async function saveSubscription(
  db: Database,
  userId: string,
  input: { endpoint: string; p256dh: string; auth: string; userAgent?: string | undefined },
) {
  // The same browser can sign in as someone else: the endpoint always follows the latest user.
  await db.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { userId, ...input },
    update: { userId, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent ?? null },
  });
}

export async function removeSubscription(db: Database, userId: string, endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
}
