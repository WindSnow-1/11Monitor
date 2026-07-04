import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Activity,
  AlertTriangle,
  Bell,
  Cpu,
  Database,
  Gauge,
  Globe2,
  HardDrive,
  LayoutDashboard,
  LockKeyhole,
  Moon,
  Network,
  RadioTower,
  RefreshCcw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  ThermometerSun,
  Wifi,
  Zap
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { alerts, fleetTrend, nodes, services, type NodeItem, type NodeStatus } from "./data";

type Filter = "all" | NodeStatus;
type Mode = "fleet" | "traffic" | "security";
type View = "overview" | "nodes" | "services" | "alerts" | "security";
type ThemeMode = "light" | "dark";

const statusText: Record<NodeStatus, string> = {
  online: "在线",
  warning: "注意",
  offline: "离线"
};

function getInitialTheme(): ThemeMode {
  return localStorage.getItem("lattice-theme") === "dark" ? "dark" : "light";
}

function LatticeApp() {
  const [selectedId, setSelectedId] = useState(nodes[1].id);
  const [filter, setFilter] = useState<Filter>("all");
  const [mode, setMode] = useState<Mode>("fleet");
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("lattice-theme", theme);
  }, [theme]);

  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const onlineCount = nodes.filter((node) => node.status === "online").length;
  const warningCount = nodes.filter((node) => node.status === "warning").length;
  const offlineCount = nodes.filter((node) => node.status === "offline").length;

  const selectView = (nextView: View) => {
    setView(nextView);
    setMode(modeForView(nextView));
    if (nextView === "nodes") {
      setFilter("all");
    }
  };

  const selectMode = (nextMode: Mode) => {
    setMode(nextMode);
    if (nextMode === "fleet") setView("overview");
    if (nextMode === "traffic") setView("services");
    if (nextMode === "security") setView("security");
  };

  const selectNodeByName = (nodeName: string) => {
    const nextNode = nodes.find((node) => node.name === nodeName);
    if (nextNode) {
      setSelectedId(nextNode.id);
    }
  };

  const filteredNodes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return nodes.filter((node) => {
      const statusMatch = filter === "all" || node.status === filter;
      const queryMatch =
        !needle ||
        [node.name, node.region, node.provider, node.ip, node.role, ...node.tags]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return statusMatch && queryMatch;
    });
  }, [filter, query]);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <div className="brand-mark">
            <Network size={22} />
          </div>
          <div>
            <strong>Lattice</strong>
            <span>Monitor Console</span>
          </div>
        </div>

        <nav className="nav-list">
          <IconNav active={view === "overview"} onClick={() => selectView("overview")} icon={<LayoutDashboard size={18} />} label="总览" />
          <IconNav active={view === "nodes"} onClick={() => selectView("nodes")} icon={<Server size={18} />} label="节点" />
          <IconNav active={view === "services"} onClick={() => selectView("services")} icon={<Activity size={18} />} label="服务" />
          <IconNav active={view === "alerts"} onClick={() => selectView("alerts")} icon={<Bell size={18} />} label="告警" count={alerts.length} />
          <IconNav active={view === "security"} onClick={() => selectView("security")} icon={<ShieldCheck size={18} />} label="安全" />
        </nav>

        <div className="secure-strip">
          <LockKeyhole size={17} />
          <div>
            <strong>只读观测</strong>
            <span>无远程命令入口</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">NOC / Asia-Shanghai</p>
            <h1>服务器状态调度台</h1>
          </div>

          <div className="top-actions">
            <label className="search-box">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索节点、地区、标签"
              />
            </label>
            <button
              className="icon-button theme-toggle"
              title={theme === "dark" ? "切换白天模式" : "切换黑夜模式"}
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="icon-button" title="刷新">
              <RefreshCcw size={18} />
            </button>
            <button className="icon-button" title="设置">
              <Settings size={18} />
            </button>
          </div>
        </header>

        <section className="control-band">
          <div className="mode-tabs" aria-label="视图模式">
            <TabButton active={mode === "fleet"} onClick={() => selectMode("fleet")} label="舰队" icon={<RadioTower size={16} />} />
            <TabButton active={mode === "traffic"} onClick={() => selectMode("traffic")} label="流量" icon={<Zap size={16} />} />
            <TabButton active={mode === "security"} onClick={() => selectMode("security")} label="安全" icon={<ShieldCheck size={16} />} />
          </div>

          <div className="filter-tabs" aria-label="节点筛选">
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")} label="全部" />
            <FilterButton active={filter === "online"} onClick={() => setFilter("online")} label="在线" />
            <FilterButton active={filter === "warning"} onClick={() => setFilter("warning")} label="注意" />
            <FilterButton active={filter === "offline"} onClick={() => setFilter("offline")} label="离线" />
          </div>
        </section>

        <section className="metrics-grid" aria-label="核心指标">
          <MetricTile icon={<Server size={19} />} label="在线节点" value={`${onlineCount}/${nodes.length}`} accent="mint" note={`${warningCount} 个注意`} />
          <MetricTile icon={<AlertTriangle size={19} />} label="活跃告警" value={String(alerts.length)} accent="amber" note={`${offlineCount} 个离线`} />
          <MetricTile icon={<Wifi size={19} />} label="平均延迟" value="31 ms" accent="cyan" note="较昨日 -8%" />
          <MetricTile icon={<Database size={19} />} label="今日出站" value="624 GB" accent="coral" note="峰值 91 MB/s" />
        </section>

        <section className={clsx("main-grid", `view-${view}`)}>
          {(view === "overview" || view === "nodes") && (
            <section className="fabric-panel">
              <PanelHeader icon={<Globe2 size={18} />} title="实时网络织图" action="6 个区域" />
              <Topology selected={selected} onSelect={setSelectedId} />
            </section>
          )}

          {(view === "overview" || view === "services" || view === "alerts" || view === "security") && (
            <section className="chart-panel">
              <PanelHeader icon={<Gauge size={18} />} title={modeTitle(mode)} action="24h" />
              <div className="fleet-chart">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={fleetTrend} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#36d399" stopOpacity={0.36} />
                        <stop offset="95%" stopColor="#36d399" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#5cc8ff" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#5cc8ff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} width={28} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="cpu" stroke="#36d399" strokeWidth={2.4} fill="url(#cpuFill)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="traffic" stroke="#5cc8ff" strokeWidth={2.4} fill="url(#trafficFill)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {(view === "overview" || view === "nodes") && (
            <section className="nodes-panel">
              <PanelHeader icon={<Server size={18} />} title="节点矩阵" action={`${filteredNodes.length} 台`} />
              <div className="node-grid">
                {filteredNodes.map((node) => (
                  <NodeCard
                    key={node.id}
                    node={node}
                    selected={node.id === selected.id}
                    onClick={() => setSelectedId(node.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {(view === "overview" || view === "nodes" || view === "services" || view === "alerts" || view === "security") && (
            <aside className="detail-panel">
              <PanelHeader icon={<SlidersHorizontal size={18} />} title="焦点节点" action={selected.region} />
              <NodeDetail node={selected} />
            </aside>
          )}

          {(view === "overview" || view === "services") && (
            <section className="services-panel">
              <PanelHeader icon={<Activity size={18} />} title="服务探测" action="HTTP / TCP" />
              <div className="service-list">
                {services.map((service) => (
                  <button
                    className={clsx("service-row", service.node === selected.name && "selected")}
                    key={service.name}
                    onClick={() => selectNodeByName(service.node)}
                    type="button"
                  >
                    <StatusDot status={service.status} />
                    <div>
                      <strong>{service.name}</strong>
                      <span>{service.node}</span>
                    </div>
                    <span>{service.protocol}</span>
                    <strong>{service.latency ? `${service.latency} ms` : "超时"}</strong>
                  </button>
                ))}
              </div>
            </section>
          )}

          {view === "security" && (
            <SecurityPanel
              selected={selected}
              onlineCount={onlineCount}
              warningCount={warningCount}
              offlineCount={offlineCount}
            />
          )}

          {(view === "overview" || view === "alerts") && (
            <aside className="alerts-panel">
              <PanelHeader icon={<Bell size={18} />} title="事件流" action="刚刚" />
              <div className="alert-list">
                {alerts.map((alert) => (
                  <button
                    className={clsx("alert-row", alert.tone, alert.node === selected.name && "selected")}
                    key={alert.id}
                    onClick={() => selectNodeByName(alert.node)}
                    type="button"
                  >
                    <span>{alert.time}</span>
                    <div>
                      <strong>{alert.title}</strong>
                      <p>{alert.node} · {alert.detail}</p>
                    </div>
                  </button>
                ))}
              </div>
            </aside>
          )}
        </section>
      </section>
    </main>
  );
}

function modeForView(view: View): Mode {
  if (view === "services") return "traffic";
  if (view === "alerts" || view === "security") return "security";
  return "fleet";
}

function modeTitle(mode: Mode) {
  if (mode === "traffic") return "流量曲线";
  if (mode === "security") return "安全态势";
  return "资源趋势";
}

function IconNav({
  icon,
  label,
  active,
  onClick,
  count
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button className={clsx("nav-item", active && "active")} onClick={onClick} title={label}>
      {icon}
      <span>{label}</span>
      {count ? <em>{count}</em> : null}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button className={clsx("tab-button", active && "active")} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button className={clsx("filter-button", active && "active")} onClick={onClick}>
      {label}
    </button>
  );
}

function MetricTile({
  icon,
  label,
  value,
  accent,
  note
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "mint" | "amber" | "cyan" | "coral";
  note: string;
}) {
  return (
    <article className={clsx("metric-tile", accent)}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function PanelHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action: string }) {
  return (
    <header className="panel-header">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      <span>{action}</span>
    </header>
  );
}

function SecurityPanel({
  selected,
  onlineCount,
  warningCount,
  offlineCount
}: {
  selected: NodeItem;
  onlineCount: number;
  warningCount: number;
  offlineCount: number;
}) {
  return (
    <section className="security-panel">
      <PanelHeader icon={<ShieldCheck size={18} />} title="安全边界" action="只读模式" />
      <div className="security-body">
        <div className="security-grid">
          <article className="security-card mint">
            <span>命令入口</span>
            <strong>0</strong>
            <p>控制台不暴露远程 Shell、文件管理或任务执行。</p>
          </article>
          <article className="security-card cyan">
            <span>探针鉴权</span>
            <strong>Token</strong>
            <p>Agent 上报只走受控接口，后端校验 Bearer Token。</p>
          </article>
          <article className="security-card amber">
            <span>异常节点</span>
            <strong>{warningCount + offlineCount}</strong>
            <p>{onlineCount}/{nodes.length} 在线，{offlineCount} 台离线。</p>
          </article>
        </div>

        <div className="security-check-list">
          <SecurityCheck
            tone="online"
            label="远程控制面"
            value="关闭"
            note="前端和后端都不提供远程命令通道"
          />
          <SecurityCheck
            tone={selected.status}
            label={`${selected.name} 探针`}
            value={selected.status === "offline" ? "心跳断开" : "心跳正常"}
            note={`${selected.region} · ${selected.ip}`}
          />
          <SecurityCheck
            tone={warningCount ? "warning" : "online"}
            label="压力告警"
            value={`${warningCount} 台注意`}
            note="CPU、内存、磁盘等资源阈值触发"
          />
          <SecurityCheck
            tone={offlineCount ? "offline" : "online"}
            label="离线风险"
            value={`${offlineCount} 台离线`}
            note="Agent 心跳中断会进入事件流"
          />
        </div>
      </div>
    </section>
  );
}

function SecurityCheck({
  tone,
  label,
  value,
  note
}: {
  tone: NodeStatus;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className={clsx("security-check", tone)}>
      <StatusDot status={tone} />
      <div>
        <strong>{label}</strong>
        <span>{note}</span>
      </div>
      <b>{value}</b>
    </article>
  );
}

function Topology({ selected, onSelect }: { selected: NodeItem; onSelect: (id: string) => void }) {
  return (
    <div className="topology">
      <div className="topology-core">
        <Network size={26} />
        <strong>CORE</strong>
      </div>
      {nodes.map((node, index) => (
        <button
          key={node.id}
          className={clsx("topology-node", node.status, selected.id === node.id && "selected")}
          style={{ "--i": index } as React.CSSProperties}
          onClick={() => onSelect(node.id)}
          title={node.name}
        >
          <StatusDot status={node.status} />
          <span>{node.region}</span>
        </button>
      ))}
    </div>
  );
}

function NodeCard({ node, selected, onClick }: { node: NodeItem; selected: boolean; onClick: () => void }) {
  return (
    <button className={clsx("node-card", node.status, selected && "selected")} onClick={onClick}>
      <header>
        <div>
          <strong>{node.name}</strong>
          <span>{node.role} · {node.region}</span>
        </div>
        <StatusBadge status={node.status} />
      </header>
      <div className="node-chart">
        <ResponsiveContainer width="100%" height={54}>
          <LineChart data={node.trend}>
            <Line
              type="monotone"
              dataKey="cpu"
              dot={false}
              stroke={node.status === "offline" ? "#6f7777" : "#36d399"}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line type="monotone" dataKey="net" dot={false} stroke="#5cc8ff" strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="node-spec-strip" aria-label="机器规格">
        <span>{node.specs.cores}</span>
        <span>{node.specs.memory}</span>
        <span>{node.specs.disk}</span>
      </div>
      <div className="usage-stack">
        <UsageBar label="CPU" value={node.cpu} />
        <UsageBar label="MEM" value={node.mem} />
        <UsageBar label="DISK" value={node.disk} />
      </div>
      <footer>
        <span>{node.provider}</span>
        <strong>{node.ping ? `${node.ping} ms` : "timeout"}</strong>
      </footer>
    </button>
  );
}

function NodeDetail({ node }: { node: NodeItem }) {
  return (
    <div className="node-detail">
      <div className="detail-title">
        <div>
          <StatusBadge status={node.status} />
          <h3>{node.name}</h3>
          <p>{node.provider} · {node.ip}</p>
        </div>
        <button className="icon-button" title="刷新节点">
          <RefreshCcw size={17} />
        </button>
      </div>

      <div className="detail-stats">
        <SmallStat icon={<Cpu size={17} />} label="CPU" value={`${node.cpu}%`} />
        <SmallStat icon={<HardDrive size={17} />} label="磁盘" value={`${node.disk}%`} />
        <SmallStat icon={<ThermometerSun size={17} />} label="温度" value={node.temp ? `${node.temp}C` : "n/a"} />
        <SmallStat icon={<Wifi size={17} />} label="延迟" value={node.ping ? `${node.ping}ms` : "n/a"} />
      </div>

      <MachineSpecs node={node} />

      <div className="detail-chart">
        <ResponsiveContainer width="100%" height={178}>
          <AreaChart data={node.trend} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} width={26} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="mem" stroke="#f6c35b" fill="#f6c35b22" strokeWidth={2} isAnimationActive={false} />
            <Area type="monotone" dataKey="cpu" stroke="#36d399" fill="#36d39918" strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <dl className="detail-list">
        <div>
          <dt>系统</dt>
          <dd>{node.os}</dd>
        </div>
        <div>
          <dt>负载</dt>
          <dd>{node.load}</dd>
        </div>
        <div>
          <dt>运行</dt>
          <dd>{node.uptime}</dd>
        </div>
        <div>
          <dt>流量</dt>
          <dd>{node.rx} / {node.tx}</dd>
        </div>
      </dl>

      <div className="tag-row">
        {node.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

function MachineSpecs({ node }: { node: NodeItem }) {
  const specs = [
    { icon: <Cpu size={16} />, label: "CPU", value: `${node.specs.cores} · ${node.specs.cpuModel}` },
    { icon: <Database size={16} />, label: "内存", value: node.specs.memory },
    { icon: <HardDrive size={16} />, label: "硬盘", value: node.specs.disk },
    { icon: <Network size={16} />, label: "带宽", value: node.specs.bandwidth }
  ];

  return (
    <section className="machine-specs" aria-label="机器规格">
      {specs.map((spec) => (
        <article key={spec.label}>
          {spec.icon}
          <span>{spec.label}</span>
          <strong>{spec.value}</strong>
        </article>
      ))}
    </section>
  );
}

function UsageBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="usage-bar">
      <span>{label}</span>
      <div>
        <i style={{ width: `${value}%` }} />
      </div>
      <strong>{value}%</strong>
    </div>
  );
}

function SmallStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <article className="small-stat">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusBadge({ status }: { status: NodeStatus }) {
  return (
    <span className={clsx("status-badge", status)}>
      <StatusDot status={status} />
      {statusText[status]}
    </span>
  );
}

function StatusDot({ status }: { status: NodeStatus }) {
  return <i className={clsx("status-dot", status)} />;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.name}>{item.name}: {item.value}</span>
      ))}
    </div>
  );
}

function App() {
  return <LatticeApp />;
}

export default App;
