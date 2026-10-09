import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import test from "node:test";
import {
  createUserProfileGateway,
  type IdentityUserRecord
} from "../../../../features/identity/index.js";
import { createIdentityUserModel } from "../user.model.js";
import { createUserProfileQueryAdapter } from "../profile-query.adapter.js";

void test("user profile update writes the canonical Identity user and supports a fresh userById read", async (context) => {
  const databaseName = `identity_gateway_${String(process.pid)}_${randomUUID().replaceAll("-", "")}`;
  let connection: mongoose.Connection;

  try {
    connection = await mongoose.createConnection(
      `mongodb://127.0.0.1:27017/${databaseName}`,
      { serverSelectionTimeoutMS: 1_000 }
    ).asPromise();
  } catch {
    context.skip("Local MongoDB is unavailable; set up the repository test database to run this integration test.");
    return;
  }

  try {
    const users = createIdentityUserModel(connection);
    await users.init();
    const user: IdentityUserRecord = {
      userId: "user-1",
      email: "lena@example.test",
      name: "Lena Park (Acme)",
      provider: "google",
      subject: "google-subject-1",
      status: "ACTIVE",
      closedAt: null
    };
    await users.create(user);

    const gateway = createUserProfileGateway({ queryPort: createUserProfileQueryAdapter(users) });
    const lena = { userId: "user-1", workspaceId: "workspace-a" };
    const profile = await gateway.getUserProfile("user-1", lena);
    assert.deepEqual(profile, { email: "lena@example.test", name: "Lena Park (Acme)", version: 0 });

    const update = await gateway.updateUserProfile("user-1", lena, "Lena Park", 0);
    assert.deepEqual(update, {
      kind: "updated",
      profile: { email: "lena@example.test", name: "Lena Park", version: 1 }
    });

    const userById = await users.findOne({ userId: "user-1" }).lean().exec();
    assert.ok(userById);
    assert.equal(userById.name, "Lena Park");
    assert.equal(userById.email, "lena@example.test");
    assert.equal(userById.profileVersion, 1);
  } finally {
    await connection.dropDatabase();
    await connection.close();
  }
});
