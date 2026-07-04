# Lattice Backend API Contract

Base URL for local development:

```text
http://127.0.0.1:8091
```

The first frontend dashboard can replace its `src/data.ts` mock data with these routes:

| Frontend need | API route |
| --- | --- |
| Full page bootstrap | `GET /api/dashboard` |
| Metric tiles | `GET /api/dashboard` -> `tiles` / `counts` |
| Node matrix | `GET /api/nodes` |
| Focus node detail | `GET /api/nodes/:id` |
| Node chart | `GET /api/nodes/:id/metrics?limit=60` |
| Fleet trend chart | `GET /api/fleet-trend` |
| Service probe list | `GET /api/services` |
| Event stream | `GET /api/alerts` |

Agent write path:

```http
POST /api/agent/report
Authorization: Bearer <AGENT_TOKEN>
Content-Type: application/json
```

Minimal report:

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
  "tx": "1.9 TB",
  "services": [
    { "name": "Proxy Gateway", "protocol": "HTTPS", "latency": 21 }
  ]
}
```

Notes:

- Public `GET` routes are read-only.
- `POST /api/agent/report` is token protected.
- No remote command, terminal, file manager, or task execution API exists.
- Storage is `data/store.json` for now. The store layer is isolated so SQLite/Postgres can replace it later.
