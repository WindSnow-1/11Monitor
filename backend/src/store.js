import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashPassword, safeEqual, verifyPassword } from "./auth.js";
import { createSeedState } from "./seed.js";

const VALID_STATUS = new Set(["online", "warning", "offline"]);
const DEFAULT_SPECS = {
  cpuModel: "Unknown CPU",
  cores: "unknown",
  memory: "unknown",
  disk: "unknown",
  bandwidth: "unknown"
};
const METRIC_RETENTION_MS = 24 * 60 * 60 * 1000;
const METRIC_MAX_POINTS = 24 * 60 * 60 / 5;
const RESPONSE_TREND_POINTS = 240;
const ALERT_LIMIT = 100;
const NODE_STALE_MS = 90 * 1000;

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = null;
  }

  async load() {
    if (this.state) return this.state;

    try {
      const raw = await readFile(this.filePath, "utf8");
      this.state = this.normalizeState(JSON.parse(raw));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.state = this.normalizeState(createSeedState());
      await this.save();
    }

    return this.state;
  }

  normalizeState(state) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      ...state,
      fleetTrend: Array.isArray(state.fleetTrend) ? state.fleetTrend : [],
      nodes: Array.isArray(state.nodes) ? state.nodes : [],
      alerts: Array.isArray(state.alerts) ? state.alerts : [],
      services: Array.isArray(state.services) ? state.services : [],
      metricsByNode: state.metricsByNode && typeof state.metricsByNode === "object" ? state.metricsByNode : {}
    };
  }

  async save() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    this.state.updatedAt = new Date().toISOString();
    await writeFile(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`);
  }

  async adminProfile(config) {
    const auth = await this.ensureAuth(config);
    return {
      username: auth.username,
      usingDefaultPassword: Boolean(auth.usingDefaultPassword),
      passwordChangedAt: auth.passwordChangedAt ?? null
    };
  }

  async verifyAdminLogin(username, password, config) {
    const auth = await this.ensureAuth(config);
    if (!safeEqual(username, auth.username)) return false;
    return verifyPassword(password, auth.passwordHash);
  }

  async changeAdminPassword(currentPassword, nextPassword, config) {
    const auth = await this.ensureAuth(config);
    if (!await verifyPassword(currentPassword, auth.passwordHash)) {
      throw Object.assign(new Error("Current password is incorrect"), { statusCode: 401 });
    }

    const password = String(nextPassword ?? "");
    if (password.length < 8) {
      throw Object.assign(new Error("New password must be at least 8 characters"), { statusCode: 400 });
    }

    auth.passwordHash = await hashPassword(password);
    auth.usingDefaultPassword = false;
    auth.passwordChangedAt = new Date().toISOString();
    await this.save();

    return this.adminProfile(config);
  }

  async dashboard() {
    const state = await this.prepareState();
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
        { key: "avgPing", label: "上报耗时", value: `${this.averagePing(nodes)} ms`, note: "Agent 到后端" },
        { key: "dailyEgress", label: "今日出站", value: this.totalTraffic(nodes, "tx"), note: "节点累计" }
      ],
      fleetTrend: this.samplePoints(state.fleetTrend, RESPONSE_TREND_POINTS),
      nodes,
      services: state.services,
      alerts: state.alerts
    };
  }

  async nodes() {
    const state = await this.prepareState();
    return this.nodesFromState(state);
  }

  async node(id) {
    const nodes = await this.nodes();
    return nodes.find((node) => node.id === id) ?? null;
  }

  async metrics(id, limit = 60) {
    const state = await this.prepareState();
    return (state.metricsByNode[id] ?? []).slice(-limit);
  }

  async services() {
    const state = await this.prepareState();
    return state.services;
  }

  async alerts() {
    const state = await this.prepareState();
    return state.alerts;
  }

  async fleetTrend() {
    const state = await this.prepareState();
    return this.samplePoints(state.fleetTrend, RESPONSE_TREND_POINTS);
  }

  async ingestAgentReport(report) {
    const state = await this.load();
    const normalized = this.normalizeReport(report);
    const existingIndex = state.nodes.findIndex((node) => node.id === normalized.id);
    const previous = existingIndex >= 0 ? state.nodes[existingIndex] : {};
    const receivedAt = new Date();
    const nextNode = {
      ...previous,
      ...normalized,
      trend: undefined,
      updatedAt: receivedAt.toISOString()
    };

    if (existingIndex >= 0) {
      state.nodes[existingIndex] = nextNode;
    } else {
      state.nodes.push(nextNode);
    }

    const point = {
      time: this.formatTime(receivedAt),
      createdAt: receivedAt.toISOString(),
      cpu: nextNode.cpu,
      mem: nextNode.mem,
      net: Number(report.net ?? report.traffic ?? 0),
      ping: nextNode.ping
    };
    state.metricsByNode[nextNode.id] = this.trimRetainedPoints([...(state.metricsByNode[nextNode.id] ?? []), point]);

    if (Array.isArray(report.services)) {
      this.mergeServices(state, nextNode, report.services);
    }

    this.refreshAlerts(state, nextNode);
    state.fleetTrend = this.trimRetainedPoints(this.recomputeFleetTrend(state, receivedAt));
    this.pruneRetainedData(state);
    await this.save();

    return {
      accepted: true,
      node: this.withTrend(nextNode, state),
      alerts: state.alerts.filter((alert) => alert.nodeId === nextNode.id)
    };
  }

  async ensureAuth(config) {
    const state = await this.load();
    if (!state.auth?.passwordHash) {
      state.auth = {
        username: config.username,
        passwordHash: await hashPassword(config.initialPassword),
        usingDefaultPassword: true,
        createdAt: new Date().toISOString(),
        passwordChangedAt: null
      };
      await this.save();
    }

    return state.auth;
  }

  async prepareState() {
    const state = await this.load();
    const livenessChanged = this.refreshNodeLiveness(state);
    const retentionChanged = this.pruneRetainedData(state);
    const changed = livenessChanged || retentionChanged;
    if (changed) await this.save();
    return state;
  }

  nodesFromState(state) {
    return state.nodes.map((node) => this.withTrend(node, state));
  }

  withTrend(node, state) {
    return {
      ...node,
      specs: this.normalizeSpecs(node.specs),
      trend: this.samplePoints(state.metricsByNode[node.id] ?? node.trend ?? [], RESPONSE_TREND_POINTS)
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
      specs: this.normalizeSpecs(report.specs),
      tags: Array.isArray(report.tags) ? report.tags.map(String) : []
    };
  }

  normalizeSpecs(specs = {}) {
    return {
      ...DEFAULT_SPECS,
      cpuModel: String(specs.cpuModel ?? specs.cpu ?? DEFAULT_SPECS.cpuModel),
      cores: String(specs.cores ?? specs.cpuCores ?? DEFAULT_SPECS.cores),
      memory: String(specs.memory ?? specs.memTotal ?? DEFAULT_SPECS.memory),
      disk: String(specs.disk ?? specs.diskTotal ?? DEFAULT_SPECS.disk),
      bandwidth: String(specs.bandwidth ?? DEFAULT_SPECS.bandwidth)
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
      this.pushAlert(state, {
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
      this.pushAlert(state, {
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
      this.pushAlert(state, {
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

    state.alerts = state.alerts.slice(0, ALERT_LIMIT);
  }

  refreshNodeLiveness(state) {
    let changed = false;
    const now = Date.now();

    for (const node of state.nodes) {
      const updatedAt = Date.parse(node.updatedAt ?? "");
      if (node.status === "offline" || !Number.isFinite(updatedAt) || now - updatedAt <= NODE_STALE_MS) continue;

      node.status = "offline";
      node.ping = 0;
      changed = true;
      state.alerts = state.alerts.filter((alert) => alert.nodeId !== node.id || alert.tone === "info");
      const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
      this.pushAlert(state, {
        id: `offline-${node.id}`,
        node: node.name,
        nodeId: node.id,
        title: "节点离线",
        detail: "超过 90 秒未收到 Agent 上报",
        time,
        tone: "danger",
        createdAt: new Date().toISOString()
      });

      for (const service of state.services) {
        if (service.nodeId === node.id) {
          service.status = "offline";
          service.latency = 0;
        }
      }
    }

    return changed;
  }

  pruneRetainedData(state) {
    let changed = false;

    for (const [nodeId, points] of Object.entries(state.metricsByNode)) {
      const next = this.trimRetainedPoints(points);
      if (next.length !== points.length) {
        state.metricsByNode[nodeId] = next;
        changed = true;
      }
    }

    const nextFleetTrend = this.trimRetainedPoints(state.fleetTrend);
    if (nextFleetTrend.length !== state.fleetTrend.length) {
      state.fleetTrend = nextFleetTrend;
      changed = true;
    }

    if (state.alerts.length > ALERT_LIMIT) {
      state.alerts = state.alerts.slice(0, ALERT_LIMIT);
      changed = true;
    }

    return changed;
  }

  trimRetainedPoints(points) {
    const cutoff = Date.now() - METRIC_RETENTION_MS;
    return points.filter((point) => {
      const createdAt = Date.parse(point.createdAt ?? "");
      return !Number.isFinite(createdAt) || createdAt >= cutoff;
    }).slice(-METRIC_MAX_POINTS);
  }

  samplePoints(points, maxPoints) {
    if (points.length <= maxPoints) return points;
    const step = (points.length - 1) / (maxPoints - 1);
    return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * step)]);
  }

  pushAlert(state, alert) {
    state.alerts = state.alerts.filter((item) => item.id !== alert.id);
    state.alerts.unshift(alert);
    state.alerts = state.alerts.slice(0, ALERT_LIMIT);
  }

  recomputeFleetTrend(state, timestamp = new Date()) {
    const nodes = this.nodesFromState(state).filter((node) => node.status !== "offline");
    if (!nodes.length) return state.fleetTrend;
    const last = nodes.map((node) => node.trend.at(-1)).filter(Boolean);
    if (!last.length) return state.fleetTrend;
    const avg = (key) => Math.round(last.reduce((sum, point) => sum + Number(point[key] ?? 0), 0) / last.length);
    const point = {
      time: this.formatTime(timestamp),
      createdAt: timestamp.toISOString(),
      cpu: avg("cpu"),
      mem: avg("mem"),
      traffic: avg("net")
    };
    return [...state.fleetTrend, point];
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
