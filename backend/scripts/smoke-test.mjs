import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/server.js";
import { JsonStore } from "../src/store.js";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "lattice-backend-"));
const dbPath = path.join(tempDir, "store.json");
const token = "test-agent-token";
const adminPassword = "test-admin-password";
const store = new JsonStore(dbPath);
const app = createApp({
  store,
  agentToken: token,
  auth: {
    initialPassword: adminPassword,
    sessionSecret: "test-session-secret"
  }
});

await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
const { port } = app.address();
const base = `http://127.0.0.1:${port}`;

try {
  const health = await getJson("/health");
  assert.equal(health.ok, true);

  const session = await getJson("/api/session");
  assert.equal(session.authenticated, false);

  const blockedDashboard = await fetch(`${base}/api/dashboard`);
  assert.equal(blockedDashboard.status, 401);

  const badLogin = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "wrong-password" })
  });
  assert.equal(badLogin.status, 401);

  const login = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: adminPassword })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.ok(cookie?.includes("lattice_session="));

  const dashboard = await getJson("/api/dashboard", cookie);
  assert.equal(dashboard.counts.nodes, 0);
  assert.ok(Array.isArray(dashboard.nodes));
  assert.ok(Array.isArray(dashboard.fleetTrend));

  const nodes = await getJson("/api/nodes", cookie);
  assert.equal(nodes.length, 0);

  const changedPassword = await fetch(`${base}/api/settings/password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({ currentPassword: adminPassword, newPassword: "new-test-admin-password" })
  });
  assert.equal(changedPassword.status, 200);

  const oldPasswordLogin = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: adminPassword })
  });
  assert.equal(oldPasswordLogin.status, 401);

  const denied = await fetch(`${base}/api/agent/report`, { method: "POST", body: "{}" });
  assert.equal(denied.status, 401);

  const accepted = await fetch(`${base}/api/agent/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      id: "test-node-01",
      name: "Test Node 01",
      region: "Local",
      provider: "Lab",
      ip: "127.0.0.2",
      os: "Debian",
      cpu: 81,
      mem: 45,
      disk: 51,
      ping: 4,
      rx: "1 GB",
      tx: "2 GB",
      specs: {
        cpuModel: "Smoke CPU",
        cores: "2 vCPU",
        memory: "2 GB",
        disk: "40 GB SSD",
        bandwidth: "1 Gbps"
      },
      services: [{ name: "Smoke API", protocol: "HTTP", latency: 4 }]
    })
  });
  assert.equal(accepted.status, 202);

  const created = await getJson("/api/nodes/test-node-01", cookie);
  assert.equal(created.status, "warning");
  assert.equal(created.cpu, 81);
  assert.equal(created.specs.memory, "2 GB");

  const nextDashboard = await getJson("/api/dashboard", cookie);
  assert.equal(nextDashboard.counts.nodes, 1);

  const metrics = await getJson("/api/nodes/test-node-01/metrics", cookie);
  assert.equal(metrics.length, 1);
  assert.ok(metrics[0].createdAt);

  const state = await store.load();
  state.nodes[0].updatedAt = new Date(Date.now() - 120000).toISOString();
  await store.save();

  const staleDashboard = await getJson("/api/dashboard", cookie);
  assert.equal(staleDashboard.counts.offline, 1);
  assert.equal(staleDashboard.nodes[0].status, "offline");
  assert.ok(staleDashboard.alerts.some((alert) => alert.id === "offline-test-node-01"));

  console.log("smoke ok");
} finally {
  await new Promise((resolve) => app.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

async function getJson(route, cookie) {
  const response = await fetch(`${base}${route}`, {
    headers: cookie ? { Cookie: cookie } : undefined
  });
  assert.equal(response.ok, true, `${route} failed with ${response.status}`);
  return response.json();
}
