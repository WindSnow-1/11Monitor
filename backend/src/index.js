import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8091);
const dbPath = process.env.DB_PATH ?? path.resolve(__dirname, "../data/store.json");
const agentToken = process.env.AGENT_TOKEN ?? "dev-agent-token-change-me";

const app = createApp({ dbPath, agentToken });

app.listen(port, "127.0.0.1", () => {
  if (agentToken === "dev-agent-token-change-me") {
    console.warn("[lattice] AGENT_TOKEN is using the development default. Change it before exposing the API.");
  }
  console.log(`[lattice] API listening on http://127.0.0.1:${port}`);
});
