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
