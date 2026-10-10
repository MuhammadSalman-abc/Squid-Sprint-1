import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import type { Logger } from "@workspace/logging";
import type { ApiErrorResponse } from "@workspace/types";
import type { UserProfileSignal } from "../index.js";
import { createErrorHandler } from "../../../middleware/index.js";
import { createUserProfileRoutes } from "../routes/user-profile.route.js";

const logger: Logger = {
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined
};

const startServer = async (app: express.Express): Promise<{
  origin: string;
  close: () => Promise<void>;
}> => {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
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

void test("profile API resolves the cookie principal before calling the gateway", async (context) => {
  let receivedCookie: string | undefined;
  let receivedGatewayPrincipal: unknown;
  const profileSignals: UserProfileSignal[] = [];
  const app = express();
  app.use(createUserProfileRoutes({
    principalResolver: {
      resolve: (cookieHeader) => {
        receivedCookie = cookieHeader;
        return Promise.resolve({
          kind: "resolved",
          principal: { userId: "user-1", sessionId: "session-1", workspaceId: "workspace-1" }
        });
      }
    },
    gateway: {
      getUserProfile: (userId, principal) => {
        assert.equal(userId, "user-1");
        receivedGatewayPrincipal = principal;
        return Promise.resolve({ email: "lena@example.test", name: "Lena Park", version: 0 });
      }
    },
    recordProfileSignal: (signal) => { profileSignals.push(signal); }
  }));
  app.use(createErrorHandler({ logger }));
  const server = await startServer(app);
  context.after(server.close);

  const response = await fetch(`${server.origin}/identity/user-profile`, {
    headers: { cookie: "workspace_session=opaque-session-token" }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { email: "lena@example.test", name: "Lena Park", version: 0 });
  assert.equal(receivedCookie, "workspace_session=opaque-session-token");
  assert.deepEqual(receivedGatewayPrincipal, {
    userId: "user-1",
    sessionId: "session-1",
    workspaceId: "workspace-1"
  });
  assert.equal(profileSignals.length, 1);
  assert.deepEqual(profileSignals[0] && {
    event: profileSignals[0].event,
    module: profileSignals[0].module,
    operation: profileSignals[0].operation,
    workspaceId: profileSignals[0].workspaceId,
    outcome: profileSignals[0].outcome
  }, {
    event: "identity.user_profile.gateway_query",
    module: "identity",
    operation: "user_profile.gateway_query",
    workspaceId: "workspace-1",
    outcome: "success"
  });
  assert.equal(typeof profileSignals[0]?.durationMs, "number");
});

void test("profile gateway failure emits an error signal with the resolved workspace label", async (context) => {
  const profileSignals: UserProfileSignal[] = [];
  const app = express();
  app.use(createUserProfileRoutes({
    principalResolver: {
      resolve: () => Promise.resolve({
        kind: "resolved",
        principal: { userId: "user-1", sessionId: "session-1", workspaceId: "workspace-1" }
      })
    },
    gateway: { getUserProfile: () => Promise.reject(new Error("profile gateway unavailable")) },
    recordProfileSignal: (signal) => { profileSignals.push(signal); }
  }));
  app.use(createErrorHandler({ logger }));
  const server = await startServer(app);
  context.after(server.close);

  const response = await fetch(`${server.origin}/identity/user-profile`, {
    headers: { cookie: "workspace_session=opaque-session-token" }
  });

  assert.equal(response.status, 500);
  assert.equal(profileSignals.length, 1);
  assert.equal(profileSignals[0]?.module, "identity");
  assert.equal(profileSignals[0].workspaceId, "workspace-1");
  assert.equal(profileSignals[0].outcome, "error");
});

void test("profile API refuses unauthenticated requests before reading the gateway", async (context) => {
  let gatewayWasCalled = false;
  const app = express();
  app.use(createUserProfileRoutes({
    principalResolver: { resolve: () => Promise.resolve({ kind: "unauthenticated" }) },
    gateway: {
      getUserProfile: () => {
        gatewayWasCalled = true;
        return Promise.resolve({ email: "private@example.test", name: "Should not be returned", version: 0 });
      }
    }
  }));
  app.use(createErrorHandler({ logger }));
  const server = await startServer(app);
  context.after(server.close);

  const response = await fetch(`${server.origin}/identity/user-profile`);
  const body = await response.json() as ApiErrorResponse;

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "unauthenticated");
  assert.equal(gatewayWasCalled, false);
});

void test("profile update accepts a versioned display name and returns the saved version", async (context) => {
  let receivedUpdate: unknown;
  const app = express();
  app.use(express.json());
  app.use(createUserProfileRoutes({
    principalResolver: { resolve: () => Promise.resolve({
      kind: "resolved",
      principal: { userId: "user-1", sessionId: "session-1", workspaceId: "workspace-1" }
    }) },
    gateway: {
      getUserProfile: () => Promise.resolve({ email: "lena@example.test", name: "Lena Park", version: 0 }),
      updateUserProfile: (userId, principal, name, version) => {
        receivedUpdate = { userId, principal, name, version };
        return Promise.resolve({ kind: "updated", profile: { email: "lena@example.test", name, version: version + 1 } });
      }
    }
  }));
  app.use(createErrorHandler({ logger }));
  const server = await startServer(app);
  context.after(server.close);

  const response = await fetch(`${server.origin}/identity/user-profile`, {
    method: "PUT",
    headers: { cookie: "workspace_session=opaque-session-token", "content-type": "application/json" },
    body: JSON.stringify({ name: "  Lena Park  ", version: 0 })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { email: "lena@example.test", name: "Lena Park", version: 1 });
  assert.deepEqual(receivedUpdate, {
    userId: "user-1",
    principal: { userId: "user-1", sessionId: "session-1", workspaceId: "workspace-1" },
    name: "Lena Park",
    version: 0
  });
});

void test("profile update refuses empty, overlong, and provider-owned email input", async (context) => {
  let updateCalls = 0;
  const app = express();
  app.use(express.json());
  app.use(createUserProfileRoutes({
    principalResolver: { resolve: () => Promise.resolve({
      kind: "resolved",
      principal: { userId: "user-1", sessionId: "session-1", workspaceId: "workspace-1" }
    }) },
    gateway: {
      getUserProfile: () => Promise.resolve({ email: "lena@example.test", name: "Lena Park", version: 0 }),
      updateUserProfile: () => {
        updateCalls += 1;
        return Promise.resolve({ kind: "updated", profile: { email: "lena@example.test", name: "Changed", version: 1 } });
      }
    }
  }));
  app.use(createErrorHandler({ logger }));
  const server = await startServer(app);
  context.after(server.close);

  const invalidInputs = [
    { name: "", version: 0 },
    { name: "x".repeat(81), version: 0 },
    { name: "Lena Park", version: 0, email: "attacker@example.test" }
  ];
  for (const input of invalidInputs) {
    const response = await fetch(`${server.origin}/identity/user-profile`, {
      method: "PUT",
      headers: { cookie: "workspace_session=opaque-session-token", "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json() as ApiErrorResponse).error.code, "validation_error");
  }
  assert.equal(updateCalls, 0);

  for (const acceptedName of ["A", "x".repeat(80)]) {
    const response = await fetch(`${server.origin}/identity/user-profile`, {
      method: "PUT",
      headers: { cookie: "workspace_session=opaque-session-token", "content-type": "application/json" },
      body: JSON.stringify({ name: acceptedName, version: 0 })
    });
    assert.equal(response.status, 200);
  }
  assert.equal(updateCalls, 2);
});

void test("profile update conflict returns the latest canonical profile for the editor", async (context) => {
  const app = express();
  app.use(express.json());
  app.use(createUserProfileRoutes({
    principalResolver: { resolve: () => Promise.resolve({
      kind: "resolved",
      principal: { userId: "user-1", sessionId: "session-1", workspaceId: "workspace-1" }
    }) },
    gateway: {
      getUserProfile: () => Promise.resolve({ email: "lena@example.test", name: "Lena Park", version: 2 }),
      updateUserProfile: () => Promise.resolve({
        kind: "conflict",
        currentProfile: { email: "lena@example.test", name: "Lena in Acme", version: 2 }
      })
    }
  }));
  app.use(createErrorHandler({ logger }));
  const server = await startServer(app);
  context.after(server.close);

  const response = await fetch(`${server.origin}/identity/user-profile`, {
    method: "PUT",
    headers: { cookie: "workspace_session=opaque-session-token", "content-type": "application/json" },
    body: JSON.stringify({ name: "Lena Park", version: 1 })
  });
  const body = await response.json() as ApiErrorResponse;

  assert.equal(response.status, 409);
  assert.equal(body.error.code, "conflict");
  assert.deepEqual(body.error.details, {
    currentProfile: { email: "lena@example.test", name: "Lena in Acme", version: 2 }
  });
});
