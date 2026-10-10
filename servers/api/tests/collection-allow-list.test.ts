import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedModels = new Map([
  ["features/auth/integrations/session.model.ts", { name: "Session", collection: "sessions" }],
  ["features/auth/integrations/user.model.ts", { name: "User", collection: "users" }],
  ["features/identity/integrations/user-invitation.mongo.ts", { name: "UserInvitation", collection: "user_invitations" }],
  ["features/identity/integrations/identity.mongo.ts", { name: "IdentityUser", collection: "users" }],
  ["features/identity/integrations/identity.mongo.ts#Invitation", { name: "IdentityInvitation", collection: "invitations" }],
  ["features/workspace/integrations/workspace.mongo.ts#Organization", { name: "WorkspaceBootstrapOrganization", collection: "organizations" }],
  ["features/workspace/integrations/workspace.mongo.ts#Workspace", { name: "WorkspaceBootstrapWorkspace", collection: "workspaces" }],
  ["features/workspace/integrations/workspace.mongo.ts#Membership", { name: "WorkspaceBootstrapMembership", collection: "memberships" }],
  ["integrations/mongodb/identity/session.model.ts", { name: "IdentitySession", collection: "sessions" }],
  ["integrations/mongodb/identity/user.model.ts", { name: "IdentityUser", collection: "users" }],
  ["features/workspace/integrations/organization.model.ts", { name: "Organization", collection: "organizations" }],
  ["features/workspace/integrations/workspace.model.ts", { name: "Workspace", collection: "workspaces" }],
  ["integrations/mongodb/workspace-branding.model.ts", { name: "WorkspaceBranding", collection: "workspaces" }]
]);

const findModelFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory()) {
      return ["node_modules", "dist", "build", "coverage"].includes(entry.name)
        ? []
        : await findModelFiles(path.join(directory, entry.name));
    }
    if (!entry.isFile() || (!entry.name.endsWith(".model.ts") && !entry.name.endsWith(".mongo.ts"))) return [];
    const absolutePath = path.join(directory, entry.name);
    const source = await readFile(absolutePath, "utf8");
    return /\b(?:mongoose\.)?model(?:<[^>]+>)?\s*\(/u.test(source)
      ? [path.relative(apiRoot, absolutePath).split(path.sep).join("/")]
      : [];
  }));
  return nested.flat().sort();
};

void test("Mongoose model definitions use only explicitly allow-listed collections", async () => {
  const modelFiles = await findModelFiles(apiRoot);
  const allowedModelFiles = [...new Set([...allowedModels.keys()].map(relativePath => relativePath.split("#")[0]))].sort();
  assert.deepEqual(modelFiles, allowedModelFiles);

  for (const [relativePath, allowed] of allowedModels) {
    const [sourcePath = relativePath, modelSuffix] = relativePath.split("#");
    const source = await readFile(path.join(apiRoot, sourcePath), "utf8");
    const declaration = modelSuffix
      ? source.split("\n").find(line => line.includes(`"${allowed.name}"`) && /\b(?:mongoose\.)?model(?:<[^>]+>)?\s*\(/u.test(line)) ?? ""
      : source;
    const modelName = declaration.match(/\b(?:mongoose\.)?model(?:<[^>]+>)?\s*\(\s*"([^"]+)"/u)?.[1];
    const explicitCollection = declaration.match(/\b(?:mongoose\.)?model(?:<[^>]+>)?\s*\(\s*"[^"]+",\s*\w+,\s*"([^"]+)"/u)?.[1];
    const schemaCollection = explicitCollection
      ?? declaration.match(/collection:\s*"([^"]+)"/u)?.[1]
      ?? (declaration.includes("SESSION_COLLECTION") ? "sessions" : undefined)
      ?? (declaration.includes("USER_COLLECTION") ? "users" : undefined);
    assert.deepEqual(
      modelName ? [modelName, schemaCollection] : undefined,
      [allowed.name, allowed.collection],
      relativePath
    );
  }
});
