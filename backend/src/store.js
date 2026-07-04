import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSeedState } from "./seed.js";

const VALID_STATUS = new Set(["online", "warning", "offline"]);

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = null;
  }

  async load() {
    if (this.state) return this.state;

    try {
      const raw = await readFile(this.filePath, "utf8");
      this.state = JSON.parse(raw);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.state = createSeedState();
      await this.save();
    }

    return this.state;
  }

  async save() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    this.state.updatedAt = new Date().toISOString();
    await writeFile(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`);
  }

  async dashboard() {
    const state = await this.load();
    const nodes = this.nodesFromState(state);
    const online = nodes.filter((node) => node.status === "online").length;
    const warning = nodes.filter((node) => node.status === "warning").length;
    const offline = nodes.filter((node) => node.status === "offline").length;

    return {
      generatedAt: new Date().toISOString(),
      counts: {
        nodes: nodes.length,
        online,
        warning,
        offline,
        alerts: state.alerts.length,
        services: state.services.length
      },
      tiles: [
        { key: "onlineNodes", label: "在线节点", value: `${online}/${nodes.length}`, note: `${warning} 个注意` },
        { key: "activeAlerts", label: "活跃告警", value: String(state.alerts.length), note: `${offline} 个离线` },
        { key: "avgPing", label: "平均延迟", value: `${this.averagePing(nodes)} ms`, note: "实时计算" },
        { key: "dailyEgress", label: "今日出站", value: this.totalTraffic(nodes, "tx"), note: "节点累计" }
      ],
      fleetTrend: state.fleetTrend,
      nodes,
      services: state.services,
      alerts: state.alerts
    };
  }

  async nodes() {
    const state = await this.load();
    return this.nodesFromState(state);
  }

  async node(id) {
    const nodes = await this.nodes();
    return nodes.find((node) => node.id === id) ?? null;
  }

  async metrics(id, limit = 60) {
    const state = await this.load();
    return (state.metricsByNode[id] ?? []).slice(-limit);
  }

  async services() {
    const state = await this.load();
    return state.services;
  }

  async alerts() {
    const state = await this.load();
    return state.alerts;
  }

  async fleetTrend() {
    const state = await this.load();
    return state.fleetTrend;
  }

  async ingestAgentReport(report) {
    const state = await this.load();
    const normalized = this.normalizeReport(report);
    const existingIndex = state.nodes.findIndex((node) => node.id === normalized.id);
    const previous = existingIndex >= 0 ? state.nodes[existingIndex] : {};
    const nextNode = {
      ...previous,
      ...normalized,
      trend: undefined,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      state.nodes[existingIndex] = nextNode;
    } else {
      state.nodes.push(nextNode);
    }

    const point = {
      time: this.formatTime(report.timestamp),
      cpu: nextNode.cpu,
      mem: nextNode.mem,
      net: Number(report.net ?? report.traffic ?? 0),
      ping: nextNode.ping
    };
    state.metricsByNode[nextNode.id] = [...(state.metricsByNode[nextNode.id] ?? []), point].slice(-288);

    if (Array.isArray(report.services)) {
      this.mergeServices(state, nextNode, report.services);
    }

    this.refreshAlerts(state, nextNode);
    state.fleetTrend = this.recomputeFleetTrend(state);
    await this.save();

    return {
      accepted: true,
      node: this.withTrend(nextNode, state),
      alerts: state.alerts.filter((alert) => alert.nodeId === nextNode.id)
    };
  }

  nodesFromState(state) {
    return state.nodes.map((node) => this.withTrend(node, state));
  }

  withTrend(node, state) {
    return {
      ...node,
      trend: state.metricsByNode[node.id] ?? node.trend ?? []
    };
  }

  normalizeReport(report) {
    if (!report || typeof report !== "object") {
      throw Object.assign(new Error("Report must be a JSON object"), { statusCode: 400 });
    }

    const id = String(report.id ?? report.nodeId ?? "").trim();
    if (!id) {
      throw Object.assign(new Error("Missing node id"), { statusCode: 400 });
    }

    const status = VALID_STATUS.has(report.status) ? report.status : this.statusFromMetrics(report);
    return {
      id,
      name: String(report.name ?? id),
      role: String(report.role ?? "Agent node"),
      region: String(report.region ?? "Unknown"),
      provider: String(report.provider ?? "Custom"),
      ip: String(report.ip ?? report.host ?? "0.0.0.0"),
      os: String(report.os ?? "Unknown OS"),
      status,
      uptime: String(report.uptime ?? "unknown"),
      cpu: this.percent(report.cpu),
      mem: this.percent(report.mem ?? report.memory),
      disk: this.percent(report.disk),
      temp: Number(report.temp ?? report.temperature ?? 0),
      load: String(report.load ?? "n/a"),
      rx: String(report.rx ?? "0 GB"),
      tx: String(report.tx ?? "0 GB"),
      ping: Number(report.ping ?? 0),
      tags: Array.isArray(report.tags) ? report.tags.map(String) : []
    };
  }

  statusFromMetrics(report) {
    if (report.online === false || report.ping === 0) return "offline";
    if (Number(report.cpu ?? 0) >= 75 || Number(report.mem ?? 0) >= 85 || Number(report.disk ?? 0) >= 90) return "warning";
    return "online";
  }

  percent(value) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(100, Math.round(parsed)));
  }

  mergeServices(state, node, reportedServices) {
    for (const service of reportedServices) {
      const id = String(service.id ?? `${node.id}-${service.name ?? service.port ?? "service"}`).toLowerCase().replace(/\s+/g, "-");
      const next = {
        id,
        name: String(service.name ?? id),
        node: node.name,
        nodeId: node.id,
        protocol: String(service.protocol ?? "HTTP"),
        latency: Number(service.latency ?? 0),
        status: VALID_STATUS.has(service.status) ? service.status : node.status
      };
      const index = state.services.findIndex((item) => item.id === id);
      if (index >= 0) state.services[index] = { ...state.services[index], ...next };
      else state.services.push(next);
    }
  }

  refreshAlerts(state, node) {
    state.alerts = state.alerts.filter((alert) => alert.nodeId !== node.id || alert.tone === "info");
    const now = new Date();
    const time = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

    if (node.status === "offline") {
      state.alerts.unshift({
        id: `offline-${node.id}`,
        node: node.name,
        nodeId: node.id,
        title: "节点离线",
        detail: "Agent 上报显示节点不可达",
        time,
        tone: "danger",
        createdAt: now.toISOString()
      });
    } else if (node.cpu >= 75) {
      state.alerts.unshift({
        id: `cpu-${node.id}`,
        node: node.name,
        nodeId: node.id,
        title: "CPU 压力偏高",
        detail: `当前 CPU ${node.cpu}%`,
        time,
        tone: "warning",
        createdAt: now.toISOString()
      });
    } else if (node.disk >= 90) {
      state.alerts.unshift({
        id: `disk-${node.id}`,
        node: node.name,
        nodeId: node.id,
        title: "磁盘空间不足",
        detail: `磁盘占用 ${node.disk}%`,
        time,
        tone: "warning",
        createdAt: now.toISOString()
      });
    }

    state.alerts = state.alerts.slice(0, 50);
  }

  recomputeFleetTrend(state) {
    const nodes = this.nodesFromState(state).filter((node) => node.status !== "offline");
    if (!nodes.length) return state.fleetTrend;
    const last = nodes.map((node) => node.trend.at(-1)).filter(Boolean);
    if (!last.length) return state.fleetTrend;
    const avg = (key) => Math.round(last.reduce((sum, point) => sum + Number(point[key] ?? 0), 0) / last.length);
    const point = {
      time: this.formatTime(),
      cpu: avg("cpu"),
      mem: avg("mem"),
      traffic: avg("net")
    };
    return [...state.fleetTrend, point].slice(-24);
  }

  averagePing(nodes) {
    const online = nodes.filter((node) => node.ping > 0);
    if (!online.length) return 0;
    return Math.round(online.reduce((sum, node) => sum + node.ping, 0) / online.length);
  }

  totalTraffic(nodes, key) {
    const totalGb = nodes.reduce((sum, node) => sum + this.trafficToGb(node[key]), 0);
    if (totalGb >= 1024) return `${(totalGb / 1024).toFixed(1)} TB`;
    return `${Math.round(totalGb)} GB`;
  }

  trafficToGb(value) {
    const match = String(value ?? "").match(/([\d.]+)\s*(TB|GB|MB)/i);
    if (!match) return 0;
    const amount = Number(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === "TB") return amount * 1024;
    if (unit === "MB") return amount / 1024;
    return amount;
  }

  formatTime(timestamp = Date.now()) {
    return new Date(timestamp).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }
}
