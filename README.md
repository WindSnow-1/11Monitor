# Lattice Monitor

A lightweight, read-only server monitoring dashboard inspired by status panels such as Nezha, with a React frontend and a small Node.js backend.

## Structure

```text
frontend/  React + Vite dashboard
backend/   Node.js HTTP API with JSON persistence
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Default local URL:

```text
http://127.0.0.1:5177
```

Build:

```bash
npm run build
```

## Backend

```bash
cd backend
AGENT_TOKEN=change-this-token npm start
```

Default local API:

```text
http://127.0.0.1:8091
```

Smoke test:

```bash
npm run test:smoke
```

## Login

The dashboard requires a backend session before `/api/*` data can be read.

Default first login:

```text
username: admin
password: admin123456
```

Change the password from the settings button after logging in. The backend stores a scrypt password hash in `backend/data/store.json`; it does not store the password in plain text.

Optional production environment variables:

```bash
ADMIN_USERNAME=admin
ADMIN_INITIAL_PASSWORD=your-first-password
SESSION_SECRET=your-random-session-secret
```

## Security Boundary

The backend is intentionally read-only. It does not provide remote shell, file management, scheduled command execution, or task execution. Agents only report metrics to the API.

## Agent Report Endpoint

```http
POST /api/agent/report
Authorization: Bearer <AGENT_TOKEN>
Content-Type: application/json
```

Example payload:

```json
{
  "id": "hk-edge-01",
  "name": "HK Edge 01",
  "region": "Hong Kong",
  "provider": "Oracle Cloud",
  "ip": "10.42.8.12",
  "os": "Debian 12",
  "cpu": 37,
  "mem": 54,
  "disk": 61,
  "temp": 46,
  "ping": 18,
  "rx": "2.8 TB",
  "tx": "1.9 TB"
}
```

## Runtime Retention

- The included agent reports every 5 seconds by default.
- The frontend refreshes dashboard data every 5 seconds.
- Node metrics and fleet trend points are retained for roughly 24 hours.
- Nodes are marked offline after about 90 seconds without an agent report.
- The backend keeps the latest 100 alerts.
