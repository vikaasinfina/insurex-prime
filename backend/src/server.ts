import { buildApp } from "./app.js";
import { createDatabase } from "./config/database.js";
import { EnvValidationError, loadEnv } from "./config/env.js";
import { createFirebaseTokenVerifier } from "./config/firebase.js";
import { startMeetingAlertJob } from "./modules/meetings/meeting-push.js";
import { startReminderJob } from "./modules/field-notes/field-note-emails.js";

async function main() {
  let env;
  try {
    env = loadEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const db = createDatabase(env.DATABASE_URL, env.DATABASE_POOL_MAX);
  const app = await buildApp({ env, db, tokenVerifier: createFirebaseTokenVerifier(env) });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down");
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "Error during shutdown");
      process.exit(1);
    }
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  if (env.NOTE_REMINDERS === "true") {
    const stopReminders = startReminderJob(db, env, app.log);
    app.addHook("onClose", async () => stopReminders());
  }

  if (env.NOTE_REMINDERS === "true") {
    const stopMeetingAlerts = startMeetingAlertJob(db, env, app.log);
    app.addHook("onClose", async () => stopMeetingAlerts());
  }

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    app.log.error({ err: error }, "Failed to start server");
    await db.$disconnect();
    process.exit(1);
  }
}

void main();
