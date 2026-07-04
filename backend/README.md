# Lattice Backend

Read-only monitoring backend for the Lattice dashboard prototype.

## Run

```powershell
$env:AGENT_TOKEN = "change-this-token"
npm start
```

Default local URL:

```text
http://127.0.0.1:8091
```

## Routes

- `GET /health`
- `GET /api/dashboard`
- `GET /api/nodes`
- `GET /api/nodes/:id`
- `GET /api/nodes/:id/metrics?limit=60`
- `GET /api/fleet-trend`
- `GET /api/services`
- `GET /api/alerts`
- `POST /api/agent/report`

`POST /api/agent/report` requires:

```http
Authorization: Bearer <AGENT_TOKEN>
```

## Smoke Test

```powershell
npm run test:smoke
```

## Security Boundary

This backend intentionally does not include remote shell, file management, scheduled commands, or task execution. Agents only report metrics.
