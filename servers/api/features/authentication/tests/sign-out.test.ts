import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import type { Logger } from "@workspace/logging";
import { createOidcFlowCookie, createOidcSignInRoutes } from "../index.js";
import { createErrorHandler } from "../../../middleware/index.js";

const logger: Logger = {
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined
};

void test("sign-out revokes the cookie's session and clears the cookie", async (context) => {
  let revoked: Readonly<{ sessionId: string; userId: string }> | undefined;
  const app = express();
  app.use(createOidcSignInRoutes({
    provider: {
      createAuthorizationRequest: () => Promise.resolve({ kind: "provider-unavailable" }),
      verifyCallback: () => Promise.resolve({ kind: "invalid-sign-in" })
    },
    flowCookie: createOidcFlowCookie({ encryptionKey: Buffer.alloc(32, 1) }),
    completion: { complete: () => Promise.resolve({ kind: "account-closed" }) },
    callbackBaseUrl: "http://localhost:4000",
    webOrigin: "http://localhost:3000",
    secureCookies: false,
    resolveSession: (cookieHeader) => {
      assert.equal(cookieHeader, "workspace_session=current-device-token");
      return Promise.resolve({ sessionId: "session-current", userId: "user-1" });
    },
    sessions: {
      findAndTouchActiveByTokenHash: () => Promise.resolve(null),
      revokeActiveSession: (sessionId, userId) => {
        revoked = { sessionId, userId };
        return Promise.resolve(true);
      },
      listActiveByUserId: () => Promise.resolve([])
    }
  }));
  app.use(createErrorHandler({ logger }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  }));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${String(address.port)}/identity/session`, {
    method: "DELETE",
    headers: { cookie: "workspace_session=current-device-token" }
  });

  assert.equal(response.status, 204);
  assert.match(response.headers.get("set-cookie") ?? "", /workspace_session=;/);
  assert.deepEqual(revoked, {
    sessionId: "session-current",
    userId: "user-1"
  });
});
