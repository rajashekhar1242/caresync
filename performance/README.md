# Hospital & Clinic Management System (HCMS) — Phase 16 Performance & Load Suite

Reproducible load-testing, concurrency, WebSocket, PostgreSQL query-plan, and synthetic scale benchmarks built on **Node.js 22** (zero external npm packages) + **PostgreSQL 16** + **JDK 25 JFR**.

## Directory Structure

```text
performance/
├── README.md
├── lib/client.mjs               # HTTP, latency quantile, and STOMP/WebSocket helpers
├── scenarios/
│   ├── 01_baseline.mjs          # Phase B: single-stream endpoint latency & throughput
│   ├── 02_auth_concurrency.mjs  # Phase C: 10/25/50/100 logins, refresh rotation, replay & logout races
│   ├── 03_booking_races.mjs     # Phase D: 10/25/50/100 contested bookings, check-ins, cancel races
│   ├── 04_rate_limit_stress.mjs # Phase E: single-IP 429 burst, 11,500-IP LRU eviction, malformed headers
│   ├── 05_queue_websocket.mjs   # Phase F: 10/25/50/100 STOMP WS clients, delivery latency, security checks
│   └── 06_scale_and_reports.mjs # Phase H & I: 50k/100k dataset search, listing, billing & reports
├── dataset/
│   └── seed_large_dataset.sql   # Deterministic synthetic SQL seed (5 clinics, 100 docs, 10k patients, 50k appts, 30k invoices, 40k payments, 100k audit logs)
├── db/
│   └── explain_queries.sql      # Phase G: EXPLAIN (ANALYZE, BUFFERS) + index usage inspection
└── results/                     # Generated JSON results, JFR recordings, and GC logs
```

## Required Environment Variables

Scripts never hardcode production credentials. Configure via environment variables before running:

- `HCMS_BASE_URL` (default `http://localhost:18080`)
- `HCMS_ADMIN_EMAIL` (default `admin@caresync.local`)
- `HCMS_ADMIN_PASSWORD` (required for admin-scoped setup/report scenarios)
- `HCMS_RECEPTIONIST_EMAIL` (default `reception@caresync.local`)
- `HCMS_RECEPTIONIST_PASSWORD` (required for receptionist queue/check-in scenarios)
- `HCMS_RESULTS_DIR` (default `performance/results`)
- `HCMS_PERF_MODE` (`dev` or `prod`, used by auth/rate-limit scripts to label single-IP vs trusted-proxy multi-IP mode)

## Safety Rules

- Run **only** against an isolated test/benchmark PostgreSQL database (`hcms-perf-pg`), never against a database holding real user data.
- Seed scripts use deterministic synthetic UUIDs (`e0000000-...`) and fake names/phones (`555...`, `@perf.local`).
