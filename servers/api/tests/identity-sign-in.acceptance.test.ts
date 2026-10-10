import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import type { Logger } from "@workspace/logging";
import type { ApiErrorResponse } from "@workspace/types";
import { createOidcFlowCookie, createOidcSignInRoutes, OIDC_FLOW_COOKIE_NAME } from "../features/authentication/index.js";
import type { OidcProviderPort } from "../features/authentication/index.js";
import { createPrincipalResolver } from "../features/authentication/index.js";
import { createIdentityUserBootstrap, createUserProfileRoutes } from "../features/identity/index.js";
import type { IdentitySessionInsert, IdentityUserRecord, IdentityUserTransaction, SignInCompletionPort, VerifiedIdentity } from "../features/identity/index.js";
import { createWorkspaceBootstrap } from "../features/workspace/index.js";
import type { WorkspaceBootstrapTransaction } from "../features/workspace/index.js";
import { createErrorHandler } from "../middleware/index.js";

const logger: Logger = {
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined
};

const startServer = async (app: express.Express): Promise<Readonly<{ origin: string; close: () => Promise<void> }>> => {
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

const verifiedLena = Object.freeze({
  provider: "google" as const,
  subject: "g-1001",
  email: "lena@acme.test",
  displayName: "Lena Park"
});

const createIdentityStore = () => {
  const users: IdentityUserRecord[] = [];
  const sessions: IdentitySessionInsert[] = [];
  const events: Array<{ type: string; payload: Readonly<{ subject: string }> }> = [];
  const memberships: Array<Readonly<{ workspaceId: string; userId: string }>> = [];
  let id = 0;
  const transaction: WorkspaceBootstrapTransaction = {
    findUserByProviderSubject: (provider, subject) => Promise.resolve(
      users.find((user) => user.provider === provider && user.subject === subject) ?? null
    ),
    insertUser: (user) => { users.push(user); return Promise.resolve(); },
    insertSession: (session) => { sessions.push(session); return Promise.resolve(); },
    appendUserCreated: (event) => { events.push(event); return Promise.resolve(); },
    activeWorkspaceIdsFor: (userId) => Promise.resolve(memberships
      .filter((membership) => membership.userId === userId)
      .map((membership) => membership.workspaceId)),
    createOrganization: () => Promise.resolve(),
    createWorkspace: () => Promise.resolve(),
    createOwnerMembership: ({ workspaceId, userId }) => {
      memberships.push({ workspaceId, userId });
      return Promise.resolve();
    }
  };
  const identityTransaction: IdentityUserTransaction = transaction;
  const completion = createWorkspaceBootstrap({
    transactionRunner: { run: (operation) => operation(transaction) },
    identity: createIdentityUserBootstrap({
      createId: () => `id-${String(++id)}`,
      createSessionToken: () => `session-token-${String(id)}`,
      now: () => new Date("2026-10-02T00:00:00.000Z"),
      deviceLabel: "Acceptance test"
    }),
    createId: () => `workspace-${String(++id)}`
  });
  return { users, sessions, events, memberships, transaction: identityTransaction, completion };
};

const signedInCallbackApp = (
  provider: OidcProviderPort,
  completion: SignInCompletionPort,
  recordInvalidSignIn: () => void = () => undefined
) => {
  const app = express();
  const flowCookie = createOidcFlowCookie({ encryptionKey: Buffer.alloc(32, 7) });
  app.use(createOidcSignInRoutes({
    provider,
    flowCookie,
    completion,
    callbackBaseUrl: "http://127.0.0.1",
    webOrigin: "http://web.test",
    secureCookies: false,
    recordInvalidSignIn
  }));
  return { app, flowCookie };
};

const callbackRequest = (origin: string, flowCookie: ReturnType<typeof createOidcFlowCookie>, code = "callback-code"): Promise<Response> => {
  const cookie = flowCookie.seal({
    provider: "google",
    state: `state-${code}-0123456789`,
    nonce: `nonce-${code}-0123456789`,
    codeVerifier: `verifier-${code}-0123456789abcdefghijklmnopqrstuv`
  });
  return fetch(`${origin}/identity/callback/google?code=${encodeURIComponent(code)}`, {
    headers: { cookie: `${OIDC_FLOW_COOKIE_NAME}=${cookie}` },
    redirect: "manual"
  });
};

void test("AC-1: verified first callback creates the user, outbox event, and ACTIVE session", async (context) => {
  const store = createIdentityStore();
  const { app, flowCookie } = signedInCallbackApp({
    createAuthorizationRequest: () => Promise.resolve({ kind: "provider-unavailable" }),
    verifyCallback: () => Promise.resolve({ kind: "verified", identity: verifiedLena })
  }, store.completion);
  const server = await startServer(app);
  context.after(server.close);

  const response = await callbackRequest(server.origin, flowCookie);

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://web.test/workspace/organization");
  assert.equal(store.users.length, 1);
  assert.deepEqual(store.users[0] && {
    provider: store.users[0].provider,
    subject: store.users[0].subject,
    email: store.users[0].email,
    name: store.users[0].name
  }, { provider: "google", subject: "g-1001", email: "lena@acme.test", name: "Lena Park" });
  assert.equal(store.events.length, 1);
  const event = store.events[0];
  assert.ok(event);
  assert.equal(event.type, "UserCreated");
  assert.equal(event.payload.subject, "g-1001");
  assert.equal(store.sessions.length, 1);
  assert.equal(store.sessions[0]?.status, "ACTIVE");
});

void test("AC-3: replaying the callback finds the same user and does not duplicate UserCreated", async (context) => {
  const store = createIdentityStore();
  const { app, flowCookie } = signedInCallbackApp({
    createAuthorizationRequest: () => Promise.resolve({ kind: "provider-unavailable" }),
    verifyCallback: () => Promise.resolve({ kind: "verified", identity: verifiedLena })
  }, store.completion);
  const server = await startServer(app);
  context.after(server.close);

  const first = await callbackRequest(server.origin, flowCookie, "replay-one");
  const second = await callbackRequest(server.origin, flowCookie, "replay-two");

  assert.equal(first.status, 303);
  assert.equal(second.status, 303);
  assert.equal(store.users.length, 1);
  assert.equal(store.events.length, 1);
  assert.equal(store.sessions.length, 2);
});

void test("AC-4: invalid callback redirects to sign-in and performs no account/session writes", async (context) => {
  const store = createIdentityStore();
  let failedSignInCount = 0;
  const { app, flowCookie } = signedInCallbackApp({
    createAuthorizationRequest: () => Promise.resolve({ kind: "provider-unavailable" }),
    verifyCallback: () => Promise.resolve({ kind: "invalid-sign-in" })
  }, store.completion, () => { failedSignInCount += 1; });
  const server = await startServer(app);
  context.after(server.close);

  const response = await callbackRequest(server.origin, flowCookie, "tampered-token");

  assert.equal(response.status, 303);
  assert.match(response.headers.get("location") ?? "", /\/sign-in\?error=invalid-sign-in$/);
  assert.equal(store.users.length + store.sessions.length + store.events.length, 0);
  assert.equal(failedSignInCount, 1);
});

void test("AC-5: provider outage leaves the existing ACTIVE session able to resolve Omar's principal", async (context) => {
  const store = createIdentityStore();
  let completionCalls = 0;
  const completion: SignInCompletionPort = {
    complete: (identity: VerifiedIdentity) => {
      completionCalls += 1;
      return store.completion.complete(identity);
    }
  };
  const { app } = signedInCallbackApp({
    createAuthorizationRequest: () => Promise.resolve({ kind: "provider-unavailable" }),
    verifyCallback: () => Promise.resolve({ kind: "provider-unavailable" })
  }, completion);
  app.get("/identity/principal", async (request, response) => {
    const resolver = createPrincipalResolver({
      resolveSession: () => Promise.resolve(request.headers.cookie === "workspace_session:omar" ? { sessionId: "omar-session", userId: "omar" } : null),
      memberships: { activeMembershipsFor: () => Promise.resolve([{ workspaceId: "omar-workspace" }]) }
    });
    const result = await resolver.resolve(request.headers.cookie);
    response.json(result);
  });
  const server = await startServer(app);
  context.after(server.close);

  const unavailable = await fetch(`${server.origin}/identity/sign-in/google`, { redirect: "manual" });
  const nextRequest = await fetch(`${server.origin}/identity/principal`, { headers: { cookie: "workspace_session:omar" } });

  assert.equal(unavailable.status, 303);
  assert.match(unavailable.headers.get("location") ?? "", /\/sign-in\?error=provider-unavailable$/);
  assert.deepEqual(await nextRequest.json(), {
    kind: "resolved",
    principal: { userId: "omar", sessionId: "omar-session", workspaceId: "omar-workspace" }
  });
  assert.equal(completionCalls, 0);
  assert.equal(store.users.length, 0);
  assert.equal(store.sessions.length, 0);
  assert.equal(store.events.length, 0);
});

void test("permission refusal: profile route returns 403 when the principal has no active workspace", async (context) => {
  const app = express();
  app.use(createUserProfileRoutes({
    principalResolver: { resolve: () => Promise.resolve({ kind: "no-active-workspace" }) },
    gateway: { getUserProfile: () => Promise.resolve({ email: "private@example.test", name: "Must not be read", version: 0 }) }
  }));
  app.use(createErrorHandler({ logger }));
  const server = await startServer(app);
  context.after(server.close);

  const response = await fetch(`${server.origin}/identity/user-profile`, { headers: { cookie: "workspace_session=active" } });
  const body = await response.json() as ApiErrorResponse;

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "no_active_workspace");
});
