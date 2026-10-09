import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import test from "node:test";
import { createWorkspaceMembershipQueryAdapter } from "../membership-query.adapter.js";
import { WORKSPACE_MEMBERSHIP_COLLECTION } from "../membership-query.adapter.js";

void test("Workspace membership query excludes inactive memberships, workspaces, and organizations", async (context) => {
  const databaseName = `workspace_member_${String(process.pid)}_${randomUUID().replaceAll("-", "")}`;
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
    const database = connection.db;
    assert.ok(database);
    await database.collection<{ _id: string; status: string }>("organizations").insertMany([
      { _id: "org-active", status: "ACTIVE" },
      { _id: "org-closed", status: "ARCHIVED" }
    ]);
    await database.collection<{ _id: string; orgId: string; status: string }>("workspaces").insertMany([
      { _id: "workspace-active", orgId: "org-active", status: "ACTIVE" },
      { _id: "workspace-archived", orgId: "org-active", status: "ARCHIVED" },
      { _id: "workspace-closed-org", orgId: "org-closed", status: "ACTIVE" },
      { _id: "workspace-removed", orgId: "org-active", status: "ACTIVE" }
    ]);
    await database.collection<{
      workspaceId: string;
      userId: string;
      role: string;
      status: string;
      guest: boolean;
      version: number;
    }>(WORKSPACE_MEMBERSHIP_COLLECTION).insertMany([
      { workspaceId: "workspace-active", userId: "user-1", role: "owner", status: "ACTIVE", guest: false, version: 0 },
      { workspaceId: "workspace-archived", userId: "user-1", role: "member", status: "ACTIVE", guest: false, version: 0 },
      { workspaceId: "workspace-closed-org", userId: "user-1", role: "member", status: "ACTIVE", guest: false, version: 0 },
      { workspaceId: "workspace-removed", userId: "user-1", role: "member", status: "REMOVED", guest: false, version: 0 },
      { workspaceId: "workspace-active", userId: "user-2", role: "owner", status: "ACTIVE", guest: false, version: 0 }
    ]);

    const membershipPort = createWorkspaceMembershipQueryAdapter(connection);
    assert.deepEqual(await membershipPort.activeMembershipsFor("user-1"), [{ workspaceId: "workspace-active", role: "owner", guest: false }]);
    assert.deepEqual(await membershipPort.activeMembershipsFor("user-2"), [{ workspaceId: "workspace-active", role: "owner", guest: false }]);
    assert.deepEqual(await membershipPort.activeMembershipsFor("missing-user"), []);
  } finally {
    await connection.dropDatabase();
    await connection.close();
  }
});
