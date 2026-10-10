import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { createConnection, type Socket } from "node:net";
import { performance } from "node:perf_hooks";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import test from "node:test";

const serverSockets = new WeakMap<Server, Set<Socket>>();

const listen = async (server: Server): Promise<number> => {
  const sockets = new Set<Socket>();
  serverSockets.set(server, sockets);
  server.on("connection", socket => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return address.port;
};

const close = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
    for (const socket of serverSockets.get(server) ?? []) socket.destroy();
  });

const stopProcess = async (child: ChildProcess): Promise<void> => {
  if (!child.pid) return;
  if (process.platform === "win32") {
    await new Promise<void>(resolve => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      killer.once("error", () => resolve());
      killer.once("close", () => resolve());
    });
    return;
  }
  child.kill("SIGTERM");
  await new Promise<void>(resolve => child.once("close", () => resolve()));
};

const waitForWeb = async (child: ChildProcess, port: number): Promise<void> => {
  const deadline = performance.now() + 60_000;
  while (performance.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before startup (code ${child.exitCode})`);
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host: "127.0.0.1", port });
        socket.once("connect", () => {
          socket.destroy();
          resolve();
        });
        socket.once("error", reject);
      });
      return;
    } catch {
      // The Next.js dev server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Next.js did not become ready within 60 seconds");
};

void test("AC-4 Playwright journey: Identity failure leaves the organization page usable with Retry", async () => {
  let identityLookupCalls = 0;
  const identity = {
    userById: async (): Promise<{ displayName: string }> => {
      identityLookupCalls += 1;
      throw new Error("Injected Identity failure");
    }
  };
  const apiServer = createServer(async (request, response) => {
    if (request.method !== "GET" || !request.url?.startsWith("/workspace/organization-profile/")) {
      response.writeHead(404).end();
      return;
    }
    let ownerDisplayName: string | null = null;
    try {
      ownerDisplayName = (await identity.userById()).displayName;
    } catch {
      // Match the API behavior: an Identity outage must not replace the organization profile.
    }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      id: "organization-1",
      name: "Acme Design",
      ownerId: "owner-1",
      ownerDisplayName,
      ownerUnavailable: ownerDisplayName === null,
      createdAt: "2026-10-06T12:00:00.000Z",
      state: { kind: "ACTIVE" },
      workspaces: [
        { id: "studio", name: "Studio", state: "ACTIVE", activeMemberCount: 12 },
        { id: "ops", name: "Ops", state: "ACTIVE", activeMemberCount: 4 }
      ]
    }));
  });
  const apiPort = await listen(apiServer);
  const previousApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const previousTemp = process.env.TEMP;
  const previousTmp = process.env.TMP;
  process.env.NEXT_PUBLIC_API_BASE_URL = `http://127.0.0.1:${apiPort}`;

  const webRoot = fileURLToPath(new URL("../..", import.meta.url));
  const browserTemp = join(webRoot, "..", "..", ".repo-cache", "playwright-temp");
  await mkdir(browserTemp, { recursive: true });
  process.env.TEMP = browserTemp;
  process.env.TMP = browserTemp;
  const portProbe = createServer();
  await new Promise<void>((resolve, reject) => {
    portProbe.once("error", reject);
    portProbe.listen(0, "127.0.0.1", () => resolve());
  });
  const address = portProbe.address();
  assert.ok(address && typeof address === "object");
  await close(portProbe);
  const webPort = address.port;
  const nextCli = fileURLToPath(new URL("../../node_modules/next/dist/bin/next", import.meta.url));
  const webOutput: string[] = [];
  const webProcess = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(webPort)], {
    cwd: webRoot,
    env: { ...process.env, NEXT_TEST_DIST_DIR: ".next/playwright-owner-unavailable" },
    stdio: "pipe"
  });
  webProcess.stdout?.on("data", chunk => webOutput.push(String(chunk)));
  webProcess.stderr?.on("data", chunk => webOutput.push(String(chunk)));
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  try {
    await waitForWeb(webProcess, webPort);
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const page = await browser.newPage();

    await page.goto(`http://127.0.0.1:${webPort}/organizations/organization-1`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000
    });
    await page.getByRole("heading", { name: "Acme Design" }).waitFor({ state: "visible" });
    const workspaceList = page.getByRole("list", { name: "Organization workspaces" });
    await workspaceList.waitFor({ state: "visible" });
    assert.equal(await workspaceList.getByRole("listitem").count(), 2);
    await page.getByRole("heading", { name: "Studio" }).waitFor({ state: "visible" });
    assert.equal(await page.getByText("Active members: ", { exact: false }).count(), 2);
    const ownerAnnouncement = page.getByRole("status");
    await ownerAnnouncement.waitFor({ state: "visible" });
    assert.equal((await ownerAnnouncement.textContent())?.trim(), "Owner: unavailable");
    const retryLink = page.getByRole("link", { name: "Retry" });
    await retryLink.waitFor({ state: "visible" });
    assert.equal(await page.getByText("Error page", { exact: false }).count(), 0);
    assert.equal(identityLookupCalls, 1);

    await retryLink.focus();
    assert.equal(await retryLink.evaluate(element => element === document.activeElement), true);
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "Acme Design" }).waitFor({ state: "visible" });
    assert.equal(identityLookupCalls, 2);
  } catch (error) {
    console.error("AC-4 browser journey failed:", error, webOutput.join(""));
    throw error;
  } finally {
    await browser?.close();
    await stopProcess(webProcess);
    await close(apiServer);
    if (previousApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = previousApiUrl;
    if (previousTemp === undefined) delete process.env.TEMP;
    else process.env.TEMP = previousTemp;
    if (previousTmp === undefined) delete process.env.TMP;
    else process.env.TMP = previousTmp;
  }
});
