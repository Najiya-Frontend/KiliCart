import app from "./src/app.js";
import { env } from "./src/config/env.js";
import { prisma } from "./src/config/prisma.js";
import { validateEmailConfiguration } from "./src/services/email.service.js";
import { outboxKey } from "./src/services/outbox-crypto.js";

if (env.nodeEnv === 'production') { validateEmailConfiguration(); outboxKey(); }

const server = app.listen(env.port, () => {
  console.log("====================================");
  console.log("        KILICART BACKEND API        ");
  console.log("====================================");
  console.log(`Environment: ${env.nodeEnv}`);
  console.log(`Port: ${env.port}`);
  console.log(`Health: http://localhost:${env.port}/api/v1/health`);
  console.log("====================================");
});

// Stop accepting requests before closing the shared database pool.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Shutting down KiliCart API (${signal})...`);
  server.close(async (error) => {
    try {
      await prisma.$disconnect();
      if (error) throw error;
    } catch (shutdownError) {
      console.error("Shutdown failed:", shutdownError);
      process.exitCode = 1;
    }
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
