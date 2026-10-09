import { systemClock } from "@workspace/kernel";
import { createOutboxRelayRunner } from "./features/outbox/index.js";
import { apiRuntimePromise } from "./runtime.js";
import { createServer, createShutdown } from "./bootstrap/index.js";
import { outboxRuntime } from "./constants/index.js";

const { app, config, database, logger } = await apiRuntimePromise;
const server = createServer({ app, config, logger });
const relay = createOutboxRelayRunner({
  ...(config.mongodbUri && config.redisUrl ? { redisUrl: config.redisUrl } : {}),
  queueName: outboxRuntime.queueName,
  pollIntervalMs: outboxRuntime.pollIntervalMs,
  batchSize: outboxRuntime.batchSize,
  publishTimeoutMs: outboxRuntime.publishTimeoutMs,
  leaseTtlMs: outboxRuntime.leaseTtlMs,
  backlogAlertAfterMs: outboxRuntime.backlogAlertAfterMs,
  clock: systemClock,
  logger
});

const shutdown = createShutdown({ database, logger, relay, server });
await server.start();
relay.start();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal)
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error("API shutdown failed.", { error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
      });
  });
}
