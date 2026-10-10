import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import type { Logger } from "@workspace/logging";
import { createIdentitySessionManager, createUserSessionsRoutes, type SessionAudit } from "../index.js";
import { createErrorHandler } from "../../../middleware/index.js";

const logger: Logger = {
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined
};

const startServer = async (app: express.Express): Promise<Readonly<{ origin: string; close: () => Promise<void> }>> => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    })
  };
};

const createPrincipalResolver = () => ({
  resolve: () => Promise.resolve({
    kind: "resolved" as const,
    principal: { userId: "lena", sessionId: "chrome", workspaceId: "workspace-1" }
  }),
  invalidateSession: () => undefined
});

void test("session list returns only the signed-in user's active sessions and marks the current device", async (context) => {
  const manager = createIdentitySessionManager({
    findAndTouchActiveByTokenHash: () => Promise.resolve(null),
    revokeActiveSession: () => Promise.resolve(false),
    listActiveByUserId: (userId) => Promise.resolve([
      { sessionId: "chrome", userId, device: "Chrome on Windows", lastUsedAt: new Date("2026-10-01T11:00:00Z"), expiresAt: new Date("2026-10-15T11:00:00Z") },
      { sessionId: "safari", userId, device: "Safari on iPhone", lastUsedAt: new Date("2026-10-01T12:00:00Z"), expiresAt: new Date("2026-10-15T12:00:00Z") },
      { sessionId: "other-user-session", userId: "omar", device: "Firefox", lastUsedAt: new Date("2026-10-01T12:00:00Z"), expiresAt: new Date("2026-10-15T12:00:00Z") }
    ])
  });
  const app = express();
  app.use(createUserSessionsRoutes({ principalResolver: createPrincipalResolver(), manager }));
  app.use(createErrorHandler({ logger }));
  const server = await startServer(app);
  context.after(server.close);

  const response = await fetch(`${server.origin}/identity/sessions`, { headers: { cookie: "workspace_session=lena-token" } });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [
    { sessionId: "chrome", device: "Chrome on Windows", lastUsedAt: "2026-10-01T11:00:00.000Z", isCurrent: true },
    { sessionId: "safari", device: "Safari on iPhone", lastUsedAt: "2026-10-01T12:00:00.000Z", isCurrent: false }
  ]);
});

void test("revoking another user's session returns NotFound, does not revoke it, and records the attempt", async (context) => {
  let attempted: Readonly<{ sessionId: string; userId: string }> | undefined;
  let audit: SessionAudit | undefined;
  const manager = createIdentitySessionManager({
    findAndTouchActiveByTokenHash: () => Promise.resolve(null),
    listActiveByUserId: () => Promise.resolve([]),
    revokeActiveSession: (sessionId, userId) => {
      attempted = { sessionId, userId };
      return Promise.resolve(false);
    }
  });
  const app = express();
  app.use(createUserSessionsRoutes({ principalResolver: createPrincipalResolver(), manager, recordSessionAudit: (event) => { audit = event; } }));
  app.use(createErrorHandler({ logger }));
  const server = await startServer(app);
  context.after(server.close);

  const response = await fetch(`${server.origin}/identity/sessions/omars-session`, {
    method: "DELETE",
    headers: { cookie: "workspace_session=lena-token" }
  });
  const body = await response.json() as { error: { code: string } };

  assert.equal(response.status, 404);
  assert.equal(body.error.code, "session_not_found");
  assert.deepEqual(attempted, { sessionId: "omars-session", userId: "lena" });
  assert.deepEqual(audit, {
    event: "identity.session.revoke",
    actorUserId: "lena",
    sessionId: "omars-session",
    outcome: "not_found"
  });
});
