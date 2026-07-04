import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/server.js";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "lattice-backend-"));
const dbPath = path.join(tempDir, "store.json");
const token = "test-agent-token";
const app = createApp({ dbPath, agentToken: token });

await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
const { port } = app.address();
const base = `http://127.0.0.1:${port}`;

try {
  const health = await getJson("/health");
  assert.equal(health.ok, true);

  const dashboard = await getJson("/api/dashboard");
  assert.equal(dashboard.counts.nodes, 0);
  assert.ok(Array.isArray(dashboard.nodes));
  assert.ok(Array.isArray(dashboard.fleetTrend));

  const nodes = await getJson("/api/nodes");
  assert.equal(nodes.length, 0);

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

  const created = await getJson("/api/nodes/test-node-01");
  assert.equal(created.status, "warning");
  assert.equal(created.cpu, 81);
  assert.equal(created.specs.memory, "2 GB");

  const nextDashboard = await getJson("/api/dashboard");
  assert.equal(nextDashboard.counts.nodes, 1);

  const metrics = await getJson("/api/nodes/test-node-01/metrics");
  assert.equal(metrics.length, 1);

  console.log("smoke ok");
} finally {
  await new Promise((resolve) => app.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

async function getJson(route) {
  const response = await fetch(`${base}${route}`);
  assert.equal(response.ok, true, `${route} failed with ${response.status}`);
  return response.json();
}
