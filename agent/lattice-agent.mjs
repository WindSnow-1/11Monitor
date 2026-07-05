import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";

const apiUrl = env("LATTICE_API_URL", "http://127.0.0.1:8091/api/agent/report");
const token = env("LATTICE_AGENT_TOKEN", env("AGENT_TOKEN", ""));
const intervalSeconds = Number(env("LATTICE_AGENT_INTERVAL", "5"));
const intervalMs = Math.max(5000, (Number.isFinite(intervalSeconds) ? intervalSeconds : 5) * 1000);
const once = process.argv.includes("--once");

let previousNet = null;
let previousCpu = null;
let previousAt = Date.now();
let lastPostMs = 1;

if (!token) {
  console.error("[lattice-agent] missing LATTICE_AGENT_TOKEN");
  process.exit(1);
}

if (once) {
  await reportOnce();
} else {
  await reportOnce();
  setInterval(() => {
    void reportOnce().catch((error) => {
      console.error(`[lattice-agent] ${error.message}`);
    });
  }, intervalMs);
}

async function reportOnce() {
  const payload = await collectPayload();
  const postStarted = Date.now();
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  lastPostMs = Math.max(1, Date.now() - postStarted);
  if (!response.ok) {
    throw new Error(`report failed ${response.status}: ${text}`);
  }

  console.log(`[lattice-agent] reported ${payload.name} cpu=${payload.cpu}% mem=${payload.mem}% disk=${payload.disk}%`);
}

async function collectPayload() {
  const [cpu, memory, disk, net] = await Promise.all([
    cpuUsage(),
    memoryUsage(),
    diskUsage(env("LATTICE_DISK_PATH", "/")),
    networkUsage()
  ]);
  const load = os.loadavg();
  const cpuInfo = os.cpus();
  const hostname = os.hostname();

  return {
    id: env("LATTICE_NODE_ID", hostname),
    name: env("LATTICE_NODE_NAME", hostname),
    role: env("LATTICE_NODE_ROLE", "监控节点"),
    region: env("LATTICE_NODE_REGION", "Unknown"),
    provider: env("LATTICE_NODE_PROVIDER", "Custom"),
    ip: env("LATTICE_NODE_IP", firstIPv4()),
    os: `${os.type()} ${os.release()}`,
    uptime: formatUptime(os.uptime()),
    cpu,
    mem: memory.percent,
    disk: disk.percent,
    temp: 0,
    load: load.map((value) => value.toFixed(2)).join(" / "),
    rx: formatBytes(net.rxBytes),
    tx: formatBytes(net.txBytes),
    net: net.throughputMbps,
    ping: lastPostMs,
    specs: {
      cpuModel: cpuInfo[0]?.model ?? "Unknown CPU",
      cores: `${cpuInfo.length} vCPU`,
      memory: formatBytes(memory.totalBytes),
      disk: formatBytes(disk.totalBytes),
      bandwidth: env("LATTICE_NODE_BANDWIDTH", "unknown")
    },
    tags: env("LATTICE_NODE_TAGS", "agent,prod").split(",").map((tag) => tag.trim()).filter(Boolean)
  };
}

async function cpuUsage() {
  try {
    const current = await readCpuStat();
    if (!previousCpu) {
      previousCpu = current;
      await sleep(250);
      const sampled = await readCpuStat();
      const usage = cpuPercentBetween(previousCpu, sampled);
      previousCpu = sampled;
      return usage;
    }

    const usage = cpuPercentBetween(previousCpu, current);
    previousCpu = current;
    return usage;
  } catch {
    return clampPercent(os.loadavg()[0] * 50);
  }
}

function cpuPercentBetween(first, second) {
  const idle = second.idle - first.idle;
  const total = second.total - first.total;
  if (total <= 0) return 0;
  return clampPercent((1 - idle / total) * 100);
}

async function readCpuStat() {
  const line = (await readFile("/proc/stat", "utf8")).split("\n")[0];
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  // Count iowait as pressure so the dashboard matches common VPS panels during disk-heavy work.
  const idle = values[3] ?? 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return { idle, total };
}

async function memoryUsage() {
  try {
    const raw = await readFile("/proc/meminfo", "utf8");
    const memTotal = Number(raw.match(/^MemTotal:\s+(\d+)/m)?.[1] ?? 0) * 1024;
    const memAvailable = Number(raw.match(/^MemAvailable:\s+(\d+)/m)?.[1] ?? 0) * 1024;
    return {
      totalBytes: memTotal,
      percent: clampPercent((1 - memAvailable / memTotal) * 100)
    };
  } catch {
    const totalBytes = os.totalmem();
    return {
      totalBytes,
      percent: clampPercent((1 - os.freemem() / totalBytes) * 100)
    };
  }
}

async function diskUsage(targetPath) {
  const raw = execFileSync("df", ["-Pk", targetPath], { encoding: "utf8" }).trim().split("\n").at(-1);
  const parts = raw.trim().split(/\s+/);
  const totalBytes = Number(parts[1]) * 1024;
  const usedBytes = Number(parts[2]) * 1024;
  return {
    totalBytes,
    percent: clampPercent((usedBytes / totalBytes) * 100)
  };
}

async function networkUsage() {
  const iface = env("LATTICE_NET_IFACE", defaultInterface());
  const current = await readInterfaceBytes(iface);
  const now = Date.now();
  const elapsedSeconds = Math.max(1, (now - previousAt) / 1000);
  const delta = previousNet
    ? Math.max(0, current.rxBytes - previousNet.rxBytes) + Math.max(0, current.txBytes - previousNet.txBytes)
    : 0;

  previousNet = current;
  previousAt = now;

  return {
    ...current,
    throughputMbps: Math.round((delta * 8 / elapsedSeconds / 1000000) * 10) / 10
  };
}

async function readInterfaceBytes(preferredInterface) {
  const interfaces = preferredInterface ? [preferredInterface] : await nonLoopbackInterfaces();
  for (const iface of interfaces) {
    try {
      const [rx, tx] = await Promise.all([
        readFile(`/sys/class/net/${iface}/statistics/rx_bytes`, "utf8"),
        readFile(`/sys/class/net/${iface}/statistics/tx_bytes`, "utf8")
      ]);
      return {
        iface,
        rxBytes: Number(rx.trim()),
        txBytes: Number(tx.trim())
      };
    } catch {
      // Try the next interface.
    }
  }

  return { iface: "unknown", rxBytes: 0, txBytes: 0 };
}

async function nonLoopbackInterfaces() {
  try {
    const names = await readdir("/sys/class/net");
    return names.filter((name) => !/^(lo|docker|veth|br-|virbr)/.test(name));
  } catch {
    return Object.entries(os.networkInterfaces())
      .filter(([, entries]) => entries?.some((entry) => !entry.internal))
      .map(([name]) => name);
  }
}

function defaultInterface() {
  try {
    const output = execFileSync("sh", ["-c", "ip route show default 2>/dev/null | awk '{print $5; exit}'"], { encoding: "utf8" }).trim();
    return output || "";
  } catch {
    return "";
  }
}

function firstIPv4() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "0.0.0.0";
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 ** 4) return `${(value / 1024 ** 4).toFixed(1)} TB`;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function env(name, fallback) {
  return process.env[name] && process.env[name].trim() ? process.env[name].trim() : fallback;
}
