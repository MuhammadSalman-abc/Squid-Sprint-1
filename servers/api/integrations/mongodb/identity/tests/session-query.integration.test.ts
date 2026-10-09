import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import test from "node:test";
import { SESSION_LIFETIME_MS } from "../../../../features/identity/index.js";
import { createSessionModel } from "../session.model.js";
import { createSessionQueryAdapter } from "../session-query.adapter.js";

void test("session lookup refreshes active sessions and marks overdue sessions expired", async (context) => {
  const databaseName = `identity_sessions_${String(process.pid)}_${randomUUID().replaceAll("-", "")}`;
  let connection: mongoose.Connection;

  try {
    connection = await mongoose.createConnection(
      `mongodb://127.0.0.1:27017/${databaseName}`,
      { serverSelectionTimeoutMS: 1_000 }
    ).asPromise();
  } catch {
    context.skip("Local MongoDB is unavailable; configure the repository test database to run this integration test.");
    return;
  }

  try {
    const model = createSessionModel(connection);
    await model.init();
    const now = new Date("2026-10-01T12:00:00.000Z");
    await model.create([
      {
        sessionId: "active-session",
        tokenHash: "active-token-hash",
        userId: "user-1",
        status: "ACTIVE",
        lastUsedAt: new Date("2026-09-20T00:00:00.000Z"),
        expiresAt: new Date("2026-10-02T12:00:00.000Z"),
        device: "Chrome"
      },
      {
        sessionId: "expired-session",
        tokenHash: "expired-token-hash",
        userId: "user-1",
        status: "ACTIVE",
        lastUsedAt: new Date("2026-09-17T11:59:00.000Z"),
        expiresAt: new Date("2026-10-01T11:59:00.000Z"),
        device: "Safari"
      },
      {
        sessionId: "phone-session",
        tokenHash: "phone-token-hash",
        userId: "user-1",
        status: "ACTIVE",
        lastUsedAt: new Date("2026-10-01T11:00:00.000Z"),
        expiresAt: new Date("2026-10-02T12:00:00.000Z"),
        device: "Phone"
      },
      {
        sessionId: "other-user-session",
        tokenHash: "other-user-token-hash",
        userId: "user-2",
        status: "ACTIVE",
        lastUsedAt: new Date("2026-10-01T11:00:00.000Z"),
        expiresAt: new Date("2026-10-02T12:00:00.000Z"),
        device: "Other user device"
      }
    ]);
    const sessions = createSessionQueryAdapter(model);

    assert.deepEqual(await sessions.findAndTouchActiveByTokenHash("active-token-hash", now), {
      sessionId: "active-session",
      userId: "user-1"
    });
    const refreshed = await model.findOne({ sessionId: "active-session" }).lean().exec();
    assert.ok(refreshed);
    assert.equal(refreshed.lastUsedAt.getTime(), now.getTime());
    assert.equal(refreshed.expiresAt.getTime(), now.getTime() + SESSION_LIFETIME_MS);

    assert.equal(await sessions.findAndTouchActiveByTokenHash("expired-token-hash", now), null);
    const expired = await model.findOne({ sessionId: "expired-session" }).lean().exec();
    assert.equal(expired?.status, "EXPIRED");

    const userSessions = await sessions.listActiveByUserId("user-1", now);
    assert.deepEqual(userSessions.map((session) => session.sessionId), ["active-session", "phone-session"]);

    assert.equal(await sessions.revokeActiveSession("active-session", "user-1", now), true);
    assert.equal(await sessions.revokeActiveSession("phone-session", "another-user", now), false);
    assert.equal(await sessions.findAndTouchActiveByTokenHash("active-token-hash", now), null);
    assert.deepEqual(await sessions.findAndTouchActiveByTokenHash("phone-token-hash", now), {
      sessionId: "phone-session",
      userId: "user-1"
    });
    assert.deepEqual((await sessions.listActiveByUserId("user-1", now)).map((session) => session.sessionId), ["phone-session"]);
  } finally {
    await connection.dropDatabase();
    await connection.close();
  }
});
