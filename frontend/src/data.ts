export type NodeStatus = "online" | "warning" | "offline";

export type MetricPoint = {
  time: string;
  cpu: number;
  mem: number;
  net: number;
  ping: number;
};

export type NodeItem = {
  id: string;
  name: string;
  role: string;
  region: string;
  provider: string;
  ip: string;
  os: string;
  status: NodeStatus;
  uptime: string;
  cpu: number;
  mem: number;
  disk: number;
  temp: number;
  load: string;
  rx: string;
  tx: string;
  ping: number;
  specs: {
    cpuModel: string;
    cores: string;
    memory: string;
    disk: string;
    bandwidth: string;
  };
  tags: string[];
  trend: MetricPoint[];
};

export type AlertItem = {
  id: string;
  node: string;
  title: string;
  detail: string;
  time: string;
  tone: "danger" | "warning" | "info";
};

export type ServiceItem = {
  name: string;
  node: string;
  protocol: string;
  latency: number;
  status: NodeStatus;
};

export const fleetTrend = [
  { time: "00:00", cpu: 34, mem: 48, traffic: 22 },
  { time: "02:00", cpu: 39, mem: 50, traffic: 28 },
  { time: "04:00", cpu: 31, mem: 45, traffic: 20 },
  { time: "06:00", cpu: 44, mem: 57, traffic: 36 },
  { time: "08:00", cpu: 58, mem: 62, traffic: 51 },
  { time: "10:00", cpu: 52, mem: 61, traffic: 48 },
  { time: "12:00", cpu: 47, mem: 59, traffic: 42 },
  { time: "14:00", cpu: 63, mem: 66, traffic: 59 },
  { time: "16:00", cpu: 55, mem: 64, traffic: 54 },
  { time: "18:00", cpu: 49, mem: 60, traffic: 47 },
  { time: "20:00", cpu: 42, mem: 56, traffic: 39 },
  { time: "22:00", cpu: 37, mem: 52, traffic: 31 }
];

export const nodes: NodeItem[] = [
  {
    id: "hk-edge-01",
    name: "HK Edge 01",
    role: "入口网关",
    region: "Hong Kong",
    provider: "Oracle Cloud",
    ip: "10.42.8.12",
    os: "Debian 12",
    status: "online",
    uptime: "42d 08h",
    cpu: 37,
    mem: 54,
    disk: 61,
    temp: 46,
    load: "0.42 / 0.61 / 0.58",
    rx: "2.8 TB",
    tx: "1.9 TB",
    ping: 18,
    specs: {
      cpuModel: "Ampere A1",
      cores: "4 vCPU",
      memory: "24 GB",
      disk: "120 GB NVMe",
      bandwidth: "1 Gbps"
    },
    tags: ["edge", "hysteria", "prod"],
    trend: [
      { time: "12:00", cpu: 28, mem: 47, net: 18, ping: 22 },
      { time: "13:00", cpu: 35, mem: 49, net: 24, ping: 19 },
      { time: "14:00", cpu: 40, mem: 55, net: 31, ping: 18 },
      { time: "15:00", cpu: 31, mem: 52, net: 22, ping: 21 },
      { time: "16:00", cpu: 37, mem: 54, net: 28, ping: 18 },
      { time: "17:00", cpu: 43, mem: 57, net: 35, ping: 17 }
    ]
  },
  {
    id: "tyo-app-02",
    name: "Tokyo App 02",
    role: "应用节点",
    region: "Tokyo",
    provider: "AWS Lightsail",
    ip: "10.42.12.24",
    os: "Ubuntu 24.04",
    status: "warning",
    uptime: "18d 21h",
    cpu: 76,
    mem: 69,
    disk: 72,
    temp: 68,
    load: "1.76 / 1.43 / 1.11",
    rx: "680 GB",
    tx: "811 GB",
    ping: 31,
    specs: {
      cpuModel: "Intel Xeon",
      cores: "2 vCPU",
      memory: "4 GB",
      disk: "80 GB SSD",
      bandwidth: "1 Gbps"
    },
    tags: ["api", "node", "watch"],
    trend: [
      { time: "12:00", cpu: 51, mem: 58, net: 26, ping: 30 },
      { time: "13:00", cpu: 62, mem: 61, net: 35, ping: 33 },
      { time: "14:00", cpu: 71, mem: 66, net: 44, ping: 32 },
      { time: "15:00", cpu: 68, mem: 68, net: 42, ping: 35 },
      { time: "16:00", cpu: 76, mem: 69, net: 51, ping: 31 },
      { time: "17:00", cpu: 73, mem: 70, net: 48, ping: 29 }
    ]
  },
  {
    id: "fra-db-01",
    name: "Frankfurt DB 01",
    role: "数据节点",
    region: "Frankfurt",
    provider: "Hetzner",
    ip: "10.42.20.8",
    os: "Rocky Linux 9",
    status: "online",
    uptime: "73d 02h",
    cpu: 24,
    mem: 63,
    disk: 47,
    temp: 43,
    load: "0.31 / 0.35 / 0.33",
    rx: "1.1 TB",
    tx: "942 GB",
    ping: 42,
    specs: {
      cpuModel: "AMD EPYC",
      cores: "4 vCPU",
      memory: "16 GB",
      disk: "240 GB NVMe",
      bandwidth: "10 Gbps"
    },
    tags: ["postgres", "backup", "eu"],
    trend: [
      { time: "12:00", cpu: 21, mem: 61, net: 12, ping: 46 },
      { time: "13:00", cpu: 26, mem: 62, net: 17, ping: 44 },
      { time: "14:00", cpu: 19, mem: 62, net: 14, ping: 45 },
      { time: "15:00", cpu: 29, mem: 63, net: 19, ping: 42 },
      { time: "16:00", cpu: 24, mem: 63, net: 16, ping: 42 },
      { time: "17:00", cpu: 27, mem: 64, net: 18, ping: 41 }
    ]
  },
  {
    id: "sjc-worker-03",
    name: "San Jose Worker 03",
    role: "任务节点",
    region: "San Jose",
    provider: "Vultr",
    ip: "10.42.31.19",
    os: "AlmaLinux 9",
    status: "online",
    uptime: "9d 13h",
    cpu: 45,
    mem: 38,
    disk: 34,
    temp: 51,
    load: "0.88 / 0.73 / 0.62",
    rx: "390 GB",
    tx: "524 GB",
    ping: 68,
    specs: {
      cpuModel: "Intel Xeon",
      cores: "2 vCPU",
      memory: "8 GB",
      disk: "160 GB NVMe",
      bandwidth: "2 Gbps"
    },
    tags: ["jobs", "media", "us"],
    trend: [
      { time: "12:00", cpu: 42, mem: 35, net: 28, ping: 70 },
      { time: "13:00", cpu: 48, mem: 36, net: 34, ping: 68 },
      { time: "14:00", cpu: 41, mem: 37, net: 29, ping: 72 },
      { time: "15:00", cpu: 53, mem: 38, net: 41, ping: 69 },
      { time: "16:00", cpu: 45, mem: 38, net: 37, ping: 68 },
      { time: "17:00", cpu: 49, mem: 39, net: 39, ping: 66 }
    ]
  },
  {
    id: "sg-cache-01",
    name: "Singapore Cache 01",
    role: "缓存节点",
    region: "Singapore",
    provider: "DigitalOcean",
    ip: "10.42.44.5",
    os: "Debian 12",
    status: "offline",
    uptime: "0m",
    cpu: 0,
    mem: 0,
    disk: 66,
    temp: 0,
    load: "n/a",
    rx: "1.7 TB",
    tx: "2.2 TB",
    ping: 0,
    specs: {
      cpuModel: "AMD EPYC",
      cores: "2 vCPU",
      memory: "4 GB",
      disk: "100 GB SSD",
      bandwidth: "1 Gbps"
    },
    tags: ["cache", "redis", "edge"],
    trend: [
      { time: "12:00", cpu: 32, mem: 49, net: 45, ping: 36 },
      { time: "13:00", cpu: 34, mem: 51, net: 47, ping: 35 },
      { time: "14:00", cpu: 31, mem: 50, net: 43, ping: 38 },
      { time: "15:00", cpu: 0, mem: 0, net: 0, ping: 0 },
      { time: "16:00", cpu: 0, mem: 0, net: 0, ping: 0 },
      { time: "17:00", cpu: 0, mem: 0, net: 0, ping: 0 }
    ]
  },
  {
    id: "sz-home-01",
    name: "Shenzhen Home 01",
    role: "家庭实验室",
    region: "Shenzhen",
    provider: "Homelab",
    ip: "192.168.6.21",
    os: "Proxmox 8",
    status: "online",
    uptime: "116d 04h",
    cpu: 31,
    mem: 71,
    disk: 58,
    temp: 55,
    load: "0.94 / 0.82 / 0.80",
    rx: "8.4 TB",
    tx: "7.1 TB",
    ping: 6,
    specs: {
      cpuModel: "Intel N100",
      cores: "4 Core",
      memory: "16 GB",
      disk: "512 GB SSD + 2 TB HDD",
      bandwidth: "LAN"
    },
    tags: ["nas", "vm", "lan"],
    trend: [
      { time: "12:00", cpu: 23, mem: 68, net: 32, ping: 7 },
      { time: "13:00", cpu: 28, mem: 69, net: 35, ping: 6 },
      { time: "14:00", cpu: 33, mem: 70, net: 41, ping: 7 },
      { time: "15:00", cpu: 29, mem: 71, net: 38, ping: 6 },
      { time: "16:00", cpu: 31, mem: 71, net: 40, ping: 6 },
      { time: "17:00", cpu: 36, mem: 72, net: 44, ping: 5 }
    ]
  }
];

export const alerts: AlertItem[] = [
  {
    id: "a1",
    node: "Singapore Cache 01",
    title: "节点离线",
    detail: "Agent 心跳中断 12 分钟",
    time: "00:08",
    tone: "danger"
  },
  {
    id: "a2",
    node: "Tokyo App 02",
    title: "CPU 压力偏高",
    detail: "5 分钟平均值超过 70%",
    time: "00:03",
    tone: "warning"
  },
  {
    id: "a3",
    node: "Frankfurt DB 01",
    title: "备份完成",
    detail: "快照写入对象存储",
    time: "23:42",
    tone: "info"
  }
];

export const services: ServiceItem[] = [
  { name: "Proxy Gateway", node: "HK Edge 01", protocol: "HTTPS", latency: 21, status: "online" },
  { name: "API Core", node: "Tokyo App 02", protocol: "HTTP", latency: 84, status: "warning" },
  { name: "Postgres", node: "Frankfurt DB 01", protocol: "TCP", latency: 46, status: "online" },
  { name: "Media Jobs", node: "San Jose Worker 03", protocol: "Queue", latency: 68, status: "online" },
  { name: "Redis Cache", node: "Singapore Cache 01", protocol: "TCP", latency: 0, status: "offline" }
];
