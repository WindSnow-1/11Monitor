import http from "node:http";
import { JsonStore } from "./store.js";
import { requireAgentToken } from "./auth.js";

const JSON_LIMIT_BYTES = 1024 * 1024;

export function createApp(options = {}) {
  const store = options.store ?? new JsonStore(options.dbPath);
  const agentToken = options.agentToken ?? process.env.AGENT_TOKEN ?? "dev-agent-token-change-me";

  return http.createServer(async (request, response) => {
    try {
      setCors(response);

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      const url = new URL(request.url ?? "/", "http://localhost");
      const route = `${request.method} ${url.pathname}`;

      if (route === "GET /health") {
        return sendJson(response, 200, { ok: true, name: "lattice-backend", time: new Date().toISOString() });
      }

      if (route === "GET /api/dashboard") {
        return sendJson(response, 200, await store.dashboard());
      }

      if (route === "GET /api/nodes") {
        return sendJson(response, 200, await store.nodes());
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/nodes/")) {
        const parts = url.pathname.split("/").filter(Boolean);
        const id = decodeURIComponent(parts[2] ?? "");

        if (parts[3] === "metrics") {
          const limit = Number(url.searchParams.get("limit") ?? 60);
          return sendJson(response, 200, await store.metrics(id, limit));
        }

        const node = await store.node(id);
        if (!node) return sendJson(response, 404, { error: "node_not_found" });
        return sendJson(response, 200, node);
      }

      if (route === "GET /api/fleet-trend") {
        return sendJson(response, 200, await store.fleetTrend());
      }

      if (route === "GET /api/services") {
        return sendJson(response, 200, await store.services());
      }

      if (route === "GET /api/alerts") {
        return sendJson(response, 200, await store.alerts());
      }

      if (route === "POST /api/agent/report") {
        requireAgentToken(request, agentToken);
        const report = await readJson(request);
        return sendJson(response, 202, await store.ingestAgentReport(report));
      }

      return sendJson(response, 404, { error: "not_found" });
    } catch (error) {
      const status = error.statusCode ?? 500;
      const payload = status >= 500 ? { error: "internal_error", message: error.message } : { error: error.message };
      return sendJson(response, status, payload);
    }
  });
}

export function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Agent-Token");
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > JSON_LIMIT_BYTES) {
      throw Object.assign(new Error("Payload too large"), { statusCode: 413 });
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { statusCode: 400 });
  }
}
