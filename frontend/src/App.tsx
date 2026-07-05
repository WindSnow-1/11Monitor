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
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
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
  UserRound,
  Wifi,
  X,
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
import {
  fleetTrend as fallbackFleetTrend,
  type AlertItem,
  type NodeItem,
  type NodeStatus,
  type ServiceItem
} from "./data";

type Filter = "all" | NodeStatus;
type Mode = "fleet" | "traffic" | "security";
type View = "overview" | "nodes" | "services" | "alerts" | "security";
type ThemeMode = "light" | "dark";
type ApiState = "live" | "fallback";
type AuthStatus = "checking" | "authenticated" | "anonymous";

type AuthUser = {
  username: string;
  usingDefaultPassword?: boolean;
  passwordChangedAt?: string | null;
};

type DashboardTile = {
  key: string;
  label: string;
  value: string;
  note: string;
};

type DashboardData = {
  generatedAt?: string;
  counts?: {
    nodes: number;
    online: number;
    warning: number;
    offline: number;
    alerts: number;
    services: number;
  };
  tiles?: DashboardTile[];
  fleetTrend: typeof fallbackFleetTrend;
  nodes: NodeItem[];
  services: ServiceItem[];
  alerts: AlertItem[];
};

type SessionResponse = {
  authenticated: boolean;
  user?: AuthUser;
};

const statusText: Record<NodeStatus, string> = {
  online: "在线",
  warning: "注意",
  offline: "离线"
};

const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const defaultSpecs: NodeItem["specs"] = {
  cpuModel: "Unknown CPU",
  cores: "unknown",
  memory: "unknown",
  disk: "unknown",
  bandwidth: "unknown"
};

const emptyDashboard: DashboardData = {
  fleetTrend: [],
  nodes: [],
  services: [],
  alerts: []
};

function getInitialTheme(): ThemeMode {
  return localStorage.getItem("lattice-theme") === "dark" ? "dark" : "light";
}

function LatticeApp() {
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [apiState, setApiState] = useState<ApiState>("fallback");
  const [apiError, setApiError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [mode, setMode] = useState<Mode>("fleet");
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const nodes = dashboard.nodes;
  const services = dashboard.services;
  const alerts = dashboard.alerts;
  const fleetTrend = dashboard.fleetTrend;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("lattice-theme", theme);
  }, [theme]);

  useEffect(() => {
    let active = true;

    void fetchSession()
      .then((session) => {
        if (!active) return;
        if (session.authenticated && session.user) {
          setAuthUser(session.user);
          setAuthStatus("authenticated");
        } else {
          setAuthUser(null);
          setAuthStatus("anonymous");
        }
      })
      .catch(() => {
        if (!active) return;
        setAuthUser(null);
        setAuthStatus("anonymous");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated") return;

    let active = true;
    let controller: AbortController | null = null;

    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const nextDashboard = await fetchDashboard(controller.signal);
        if (!active) return;
        setDashboard(nextDashboard);
        setApiState("live");
        setApiError(null);
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        handleApiError(error);
      }
    };

    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [authStatus]);

  const refreshDashboard = () => {
    void fetchDashboard()
      .then((nextDashboard) => {
        setDashboard(nextDashboard);
        setApiState("live");
        setApiError(null);
      })
      .catch((error) => {
        handleApiError(error);
      });
  };

  const handleApiError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      setAuthStatus("anonymous");
      setAuthUser(null);
      setDashboard(emptyDashboard);
      setSettingsOpen(false);
      return;
    }

    setApiState("fallback");
    setApiError(error instanceof Error ? error.message : "API 连接失败");
  };

  const handleLogin = async (username: string, password: string) => {
    const response = await fetch(`${apiBase}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? "账号或密码不对" : `登录失败：${response.status}`);
    }

    const payload = await response.json() as { user: AuthUser };
    setAuthUser(payload.user);
    setAuthStatus("authenticated");
  };

  const handleLogout = async () => {
    await fetch(`${apiBase}/api/logout`, {
      method: "POST",
      credentials: "include"
    });
    setAuthStatus("anonymous");
    setAuthUser(null);
    setDashboard(emptyDashboard);
    setSettingsOpen(false);
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    const response = await fetch(`${apiBase}/api/settings/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include",
      body: JSON.stringify({ currentPassword, newPassword })
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? "当前密码不对" : "密码至少 8 位");
    }

    const payload = await response.json() as { user: AuthUser };
    setAuthUser(payload.user);
  };

  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0] ?? null;
  const onlineCount = nodes.filter((node) => node.status === "online").length;
  const warningCount = nodes.filter((node) => node.status === "warning").length;
  const offlineCount = nodes.filter((node) => node.status === "offline").length;
  const tileValue = (key: string, fallback: string) => dashboard.tiles?.find((tile) => tile.key === key)?.value ?? fallback;
  const tileNote = (key: string, fallback: string) => dashboard.tiles?.find((tile) => tile.key === key)?.note ?? fallback;

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
  }, [filter, nodes, query]);

  const resetNodeFilters = () => {
    setQuery("");
    setFilter("all");
  };

  if (authStatus === "checking") {
    return (
      <AuthShell theme={theme} onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
        <div className="auth-card compact">
          <div className="auth-mark">
            <Network size={24} />
          </div>
          <strong>正在检查登录状态</strong>
          <span>连接 Lattice Monitor 后端...</span>
        </div>
      </AuthShell>
    );
  }

  if (authStatus === "anonymous") {
    return (
      <AuthShell theme={theme} onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
        <LoginPanel onLogin={handleLogin} />
      </AuthShell>
    );
  }

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
            <p className={clsx("api-state", apiState)} title={apiError ?? undefined}>
              {apiState === "live" ? "API 实时数据" : "等待 Agent 上报"}
            </p>
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
            {authUser?.usingDefaultPassword ? <span className="password-warning">请修改初始密码</span> : null}
            <span className="user-pill" title={`已登录：${authUser?.username ?? "admin"}`}>
              <UserRound size={15} />
              {authUser?.username ?? "admin"}
            </span>
            <button
              className="icon-button theme-toggle"
              title={theme === "dark" ? "切换白天模式" : "切换黑夜模式"}
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="icon-button" onClick={refreshDashboard} title="刷新">
              <RefreshCcw size={18} />
            </button>
            <button className="icon-button" title="设置" onClick={() => setSettingsOpen(true)}>
              <Settings size={18} />
            </button>
            <button className="icon-button" title="退出登录" onClick={handleLogout}>
              <LogOut size={18} />
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
          <MetricTile icon={<Server size={19} />} label="在线节点" value={tileValue("onlineNodes", `${onlineCount}/${nodes.length}`)} accent="mint" note={tileNote("onlineNodes", `${warningCount} 个注意`)} />
          <MetricTile icon={<AlertTriangle size={19} />} label="活跃告警" value={tileValue("activeAlerts", String(alerts.length))} accent="amber" note={tileNote("activeAlerts", `${offlineCount} 个离线`)} />
          <MetricTile icon={<Wifi size={19} />} label="上报耗时" value={tileValue("avgPing", "0 ms")} accent="cyan" note={tileNote("avgPing", "Agent 到后端")} />
          <MetricTile icon={<Database size={19} />} label="今日出站" value={tileValue("dailyEgress", "0 GB")} accent="coral" note={tileNote("dailyEgress", "节点累计")} />
        </section>

        <section className={clsx("main-grid", `view-${view}`)}>
          {(view === "overview" || view === "nodes") && (
            <section className="fabric-panel">
              <PanelHeader icon={<Globe2 size={18} />} title="实时网络织图" action="6 个区域" />
              <Topology nodes={nodes} selected={selected} onSelect={setSelectedId} />
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
                {filteredNodes.length ? (
                  filteredNodes.map((node) => (
                    <NodeCard
                      key={node.id}
                      node={node}
                      selected={node.id === selected?.id}
                      onClick={() => setSelectedId(node.id)}
                    />
                  ))
                ) : nodes.length ? (
                  <EmptyState
                    title="没有匹配节点"
                    detail="当前搜索内容或状态筛选没有匹配到节点，清除筛选后会显示已有服务器。"
                    actionLabel="清除筛选"
                    onAction={resetNodeFilters}
                  />
                ) : (
                  <EmptyState title="暂无节点" detail="部署 Agent 后，真实服务器会自动出现在这里。" />
                )}
              </div>
            </section>
          )}

          {(view === "overview" || view === "nodes" || view === "services" || view === "alerts" || view === "security") && (
            <aside className="detail-panel">
              <PanelHeader icon={<SlidersHorizontal size={18} />} title="焦点节点" action={selected?.region ?? "等待上报"} />
              {selected ? <NodeDetail node={selected} /> : <EmptyState title="暂无节点" detail="安装 Agent 并上报后，这里会显示真实机器详情。" />}
            </aside>
          )}

          {(view === "overview" || view === "services") && (
            <section className="services-panel">
              <PanelHeader icon={<Activity size={18} />} title="服务探测" action="HTTP / TCP" />
              <div className="service-list">
                {services.length ? (
                  services.map((service) => (
                    <button
                      className={clsx("service-row", service.node === selected?.name && "selected")}
                      key={service.id ?? service.name}
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
                  ))
                ) : (
                  <EmptyState title="暂无服务探测" detail="Agent 上报服务后，这里会显示 HTTP/TCP 状态。" />
                )}
              </div>
            </section>
          )}

          {view === "security" && (
            <SecurityPanel
              selected={selected}
              onlineCount={onlineCount}
              warningCount={warningCount}
              offlineCount={offlineCount}
              totalNodes={nodes.length}
            />
          )}

          {(view === "overview" || view === "alerts") && (
            <aside className="alerts-panel">
              <PanelHeader icon={<Bell size={18} />} title="事件流" action="刚刚" />
              <div className="alert-list">
                {alerts.length ? (
                  alerts.map((alert) => (
                    <button
                      className={clsx("alert-row", alert.tone, alert.node === selected?.name && "selected")}
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
                  ))
                ) : (
                  <EmptyState title="暂无事件" detail="异常、离线和恢复事件会出现在这里。" />
                )}
              </div>
            </aside>
          )}
        </section>
      </section>
      {settingsOpen && authUser ? (
        <SettingsDialog
          user={authUser}
          onClose={() => setSettingsOpen(false)}
          onChangePassword={handleChangePassword}
        />
      ) : null}
    </main>
  );
}

async function fetchSession(): Promise<SessionResponse> {
  const response = await fetch(`${apiBase}/api/session`, {
    headers: { Accept: "application/json" },
    credentials: "include"
  });

  if (!response.ok) {
    throw new ApiError(response.status, `Session ${response.status}`);
  }

  return response.json() as Promise<SessionResponse>;
}

async function fetchDashboard(signal?: AbortSignal): Promise<DashboardData> {
  const response = await fetch(`${apiBase}/api/dashboard`, {
    headers: { Accept: "application/json" },
    credentials: "include",
    signal
  });

  if (!response.ok) {
    throw new ApiError(response.status, `API ${response.status}`);
  }

  const payload = (await response.json()) as DashboardData;
  return {
    ...payload,
    fleetTrend: payload.fleetTrend ?? [],
    nodes: (payload.nodes ?? []).map(withNodeDefaults),
    services: payload.services ?? [],
    alerts: payload.alerts ?? []
  };
}

function AuthShell({
  children,
  theme,
  onToggleTheme
}: {
  children: React.ReactNode;
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  return (
    <main className="auth-shell">
      <button className="icon-button auth-theme" title={theme === "dark" ? "切换白天模式" : "切换黑夜模式"} onClick={onToggleTheme}>
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <section className="auth-hero">
        <div className="auth-brand">
          <div className="brand-mark">
            <Network size={22} />
          </div>
          <div>
            <strong>Lattice</strong>
            <span>Monitor Console</span>
          </div>
        </div>
        <div>
          <p className="eyebrow">NOC / Asia-Shanghai</p>
          <h1>服务器状态调度台</h1>
          <p>登录后查看节点、服务、告警和探针上报数据。</p>
        </div>
      </section>
      {children}
    </main>
  );
}

function LoginPanel({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onLogin(username.trim(), password);
    } catch (error) {
      setError(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-card-head">
        <div className="auth-mark">
          <LockKeyhole size={22} />
        </div>
        <div>
          <strong>登录控制台</strong>
          <span>请输入管理员账号密码</span>
        </div>
      </div>

      <label className="field">
        <span>账号</span>
        <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
      </label>

      <label className="field">
        <span>密码</span>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
          autoFocus
        />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      <button className="primary-button" type="submit" disabled={loading || !username.trim() || !password}>
        {loading ? "登录中..." : "进入面板"}
      </button>
    </form>
  );
}

function SettingsDialog({
  user,
  onClose,
  onChangePassword
}: {
  user: AuthUser;
  onClose: () => void;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (newPassword.length < 8) {
      setError("新密码至少 8 位");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("两次新密码不一致");
      return;
    }

    setLoading(true);
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("密码已修改");
    } catch (error) {
      setError(error instanceof Error ? error.message : "修改失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="设置">
        <header className="settings-head">
          <div>
            <span className="settings-icon"><KeyRound size={18} /></span>
            <div>
              <strong>设置</strong>
              <p>{user.username} · {user.usingDefaultPassword ? "正在使用初始密码" : "密码已保护"}</p>
            </div>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <form className="password-form" onSubmit={submit}>
          <label className="field">
            <span>当前密码</span>
            <input
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          <label className="field">
            <span>新密码</span>
            <input
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span>确认新密码</span>
            <input
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="form-success">{message}</p> : null}

          <button className="primary-button" type="submit" disabled={loading || !currentPassword || !newPassword || !confirmPassword}>
            {loading ? "保存中..." : "修改密码"}
          </button>
        </form>
      </section>
    </div>
  );
}

function withNodeDefaults(node: NodeItem): NodeItem {
  return {
    ...node,
    specs: {
      ...defaultSpecs,
      ...(node.specs ?? {})
    },
    tags: node.tags ?? [],
    trend: node.trend ?? []
  };
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
  offlineCount,
  totalNodes
}: {
  selected: NodeItem | null;
  onlineCount: number;
  warningCount: number;
  offlineCount: number;
  totalNodes: number;
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
            <p>{onlineCount}/{totalNodes} 在线，{offlineCount} 台离线。</p>
          </article>
        </div>

        <div className="security-check-list">
          <SecurityCheck
            tone="online"
            label="远程控制面"
            value="关闭"
            note="前端和后端都不提供远程命令通道"
          />
          {selected ? (
            <SecurityCheck
              tone={selected.status}
              label={`${selected.name} 探针`}
              value={selected.status === "offline" ? "心跳断开" : "心跳正常"}
              note={`${selected.region} · ${selected.ip}`}
            />
          ) : (
            <SecurityCheck
              tone="offline"
              label="暂无探针"
              value="等待上报"
              note="安装 Agent 后自动出现在这里"
            />
          )}
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

function Topology({ nodes, selected, onSelect }: { nodes: NodeItem[]; selected: NodeItem | null; onSelect: (id: string) => void }) {
  return (
    <div className="topology">
      <div className="topology-core">
        <Network size={26} />
        <strong>CORE</strong>
      </div>
      {nodes.length ? (
        nodes.map((node, index) => (
          <button
            key={node.id}
            className={clsx("topology-node", node.status, selected?.id === node.id && "selected")}
            style={{ "--i": index } as React.CSSProperties}
            onClick={() => onSelect(node.id)}
            title={node.name}
          >
            <StatusDot status={node.status} />
            <span>{node.region}</span>
          </button>
        ))
      ) : (
        <div className="topology-empty">等待 Agent 上报</div>
      )}
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
      <NodeSparkline node={node} />
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

function NodeSparkline({ node }: { node: NodeItem }) {
  if (node.trend.length < 2) {
    return (
      <div className="node-chart node-chart-waiting">
        <span>等待更多采样</span>
      </div>
    );
  }

  return (
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
        <SmallStat icon={<Wifi size={17} />} label="上报" value={node.ping ? `${node.ping}ms` : "n/a"} />
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

function EmptyState({
  title,
  detail,
  actionLabel,
  onAction
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <Server size={20} />
      <strong>{title}</strong>
      <p>{detail}</p>
      {actionLabel && onAction ? (
        <button className="empty-action" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
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
