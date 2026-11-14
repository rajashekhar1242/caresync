# Phase 16 — Hospital & Clinic Management System (HCMS) Performance & Load Testing Report

**Assessment Date:** 2026-11-12  
**Target System:** Hospital & Clinic Management System (HCMS) Backend (`backend/`, Spring Boot `4.1.2`, Java `25.0.1 LTS`, PostgreSQL `16.15`)  
**Benchmark Harness:** [performance/](file:///Z:/javaproject/performance/README.md) (`run_stage1.ps1`, `run_stage2.ps1`, Node.js `v22.14.0` load drivers, PostgreSQL `16-alpine` Docker container, JFR, GC logs, `/actuator/metrics`)  
**Production Readiness Verdict:** **HOLD PENDING REMEDIATION (NOT READY FOR PRODUCTION)**

---

## A. Executive Summary & Readiness Verdict

Phase 16 measured HCMS backend performance, concurrency correctness, rate-limiter resilience, STOMP WebSocket fanout, PostgreSQL 16 query plans at 50k/100k scale, and Java 25 virtual-thread / GC telemetry across both `dev` (single-IP) and `prod` (trusted `X-Forwarded-For` proxy, multi-IP) runtime profiles.

**Why the current verdict is `HOLD PENDING REMEDIATION`:**
While baseline sequential latencies (`9–41 ms` p50 for non-BCrypt endpoints), contested single-slot booking exclusivity (`1` winner / `N-1` `409`, `0` `5xx` up to `c=100`), bounded rate-limiter cache eviction (`11,500` distinct IPs at `311.43 RPS`, `0` `5xx`), and STOMP fanout (`100/100` delivered, `59.99 ms` p95, zero PII) perform well, testing uncovered **two `CRITICAL` HikariCP connection-pool self-deadlocks** and **one `HIGH` schedule timezone-shift `500` bug**, plus **high-volume indexing gaps** at `50k`/`100k` rows:

| ID | Severity | Defect / Bottleneck | Primary Observed Impact |
| :--- | :--- | :--- | :--- |
| **CRITICAL-01** | Critical | `HikariPool-1` self-deadlock on concurrent check-ins (`StatusTransitionService` + `AFTER_COMMIT` `QueueService` `Propagation.REQUIRES_NEW`) | At `c=25` concurrent check-ins, **25/25 client requests timed out at 15,000 ms**; backend threw **5 unhandled HTTP `500` `CannotCreateTransactionException`** after `30s` plus `queue_broadcast_failed` |
| **CRITICAL-02** | Critical | `HikariPool-1` self-deadlock & replay-revocation bypass on concurrent refresh (`AuthService` + `RefreshTokenRevocationService` `Propagation.REQUIRES_NEW`) | At `c=25` concurrent same-token refreshes, **1 succeeded (`200`) and 24/25 timed out at 15,000 ms** (`6` `CannotCreateTransactionException` errors after `30s`); post-race check showed **`rotatedTokenStatusAfterReplayRevocation = 200`** (newly rotated token was NOT revoked) |
| **HIGH-01** | High | `ScheduleEntry` `LocalTime` `-05:30` UTC shift (`hibernate.jdbc.time_zone: UTC` on `+05:30` JVM) | Persisting `00:00..23:55` shifted to `18:30:00..18:25:00` in PostgreSQL, violating `CHECK (start_time < end_time)` (`schedule_entries_check`) with an unhandled **`500 DataIntegrityViolationException`** |
| **MEDIUM-01** | Medium | Missing `appointments` sort/filter composite indexes & unindexed 180d/366d report joins | Unfiltered `GET /api/appointments` (`50,040` rows, `c=10`) degraded to **`438.74 ms` p50 / `492.82 ms` p95 (`22.09 RPS`)**; 180d/366d revenue reports hit **`154.38–243.25 ms` p50** (`Seq Scan` on 40k `payments` + 30k `invoices`) |
| **MEDIUM-02** | Medium | Unused `patients` indexes (`idx_scan = 0`) under `en_US.utf8` collation | `idx_patients_phone` (`varchar` without `varchar_pattern_ops`) and `idx_patients_full_name_lower` (non-trigram B-tree against `%substring%`) had **0 scans**; every search fell back to `Seq Scan on patients` |
| **MEDIUM-03** | Medium | Single-column `audit_logs` indexes + 100k `COUNT(*)` overhead | `idx_audit_logs_user_id` (`816 kB`) and `idx_audit_logs_entity_type` (`656 kB`) had **0 scans**; `GET /api/audit-logs` (100,235 rows, `c=10`) ran at **`118.87 ms` p50 / `138.39 ms` p95** |
| **MEDIUM-04** | Medium | `BCrypt` CPU saturation on auth bursts | Multi-IP login plateaued at **`46.51–55.34 RPS`** (`c=25..100`), with `c=100` reaching **`1,230.84 ms` p50 / `2,017.11 ms` p95** (`BCrypt.key` = `18.49%` of all Stage 2 JFR CPU samples) |
| **LOW-01** | Low | Cold OpenPDF spike & minor JDK 25 virtual-thread pinning | First prescription PDF hit **`271.83–273.62 ms` p95** (`~28 ms` warm p50); Stage 2 JFR recorded **`12` `VirtualThreadPinned`** events (`21.6–38.5 ms`) inside Micrometer `DefaultLongTaskTimer` and Hibernate `SqmSelectStatement.subquery()` |

> **Scope compliance:** No application source files, Flyway migrations (`V1`–`V12`), or `backend/pom.xml` were modified during Phase 16. The disposable Docker database container `hcms-perf-pg` was stopped and removed (`docker rm -f hcms-perf-pg`) after evidence capture.

---

## B. Test Environment & Baseline Architecture

### Hardware & Software Stack (Verified from JFR & Tool Output)
- **CPU:** AMD Ryzen 7 5700U with Radeon Graphics (`1` socket, `16` logical hardware threads — `jdk.CPUInformation`)
- **Memory:** `15.4 GB` physical RAM (`jdk.PhysicalMemory`)
- **OS:** Windows 11, 64-bit Build 26100 (`10.0.26100.9818`, `Asia/Kolkata` `+05:30`)
- **JVM:** Oracle Java `25.0.1` LTS (`build 25.0.1+8-LTS-27`), Tomcat virtual threads enabled (`spring.threads.virtual.enabled=true`)
- **Database:** Docker PostgreSQL `16.15` (`postgres:16-alpine`), collation `en_US.utf8`, `shared_buffers = 16384 * 8kB` (`128 MB`), `effective_cache_size = 524288 * 8kB` (`4 GB`), `work_mem = 4096 kB`, `max_connections = 100`
- **Load Generator:** Node.js `v22.14.0` (`fetch` + native `ws` STOMP 1.2 client) on localhost against `http://localhost:18080`
- **Connection Pool:** HikariCP `HikariPool-1` (`maximum-pool-size = 20`, `connection-timeout = 30000 ms`)

### Benchmark Stages Executed
1. **Stage 1 (`dev` profile, single-IP):** [run_stage1.ps1](file:///Z:/javaproject/performance/run_stage1.ps1) ran Scenarios `01_baseline`, `03_booking_races`, `05_queue_websocket`, `02_auth_concurrency` (single-IP), and `04_rate_limit_stress` (single-IP), capturing `stage1-gc.log`, `stage1-dev.jfr`, `stage1-heap.txt`, and `stage1-metrics.json`.
2. **Stage 2 (`prod` trusted-proxy profile, multi-IP + 50k/100k scale):** [run_stage2.ps1](file:///Z:/javaproject/performance/run_stage2.ps1) ran `01_baseline` (multi-IP via trusted `X-Forwarded-For`), `02_auth_concurrency` (multi-IP + refresh/logout races), `04_rate_limit_stress` (11,500-IP LRU eviction stress), seeded the deterministic scale dataset via [seed_large_dataset.sql](file:///Z:/javaproject/performance/seed_large_dataset.sql), ran `06_scale_and_reports`, executed `EXPLAIN (ANALYZE, BUFFERS)` + `pg_stat` queries ([explain_queries.sql](file:///Z:/javaproject/performance/explain_queries.sql)), and captured `stage2-gc.log`, `stage2-prod.jfr`, `stage2-heap.txt`, and `stage2-metrics.json`.

---

## C. Baseline Endpoint Latency & Throughput (Phase B)

Warm sequential latency and throughput across all 36 endpoints in Stage 1 ([01_baseline_singleip.json](file:///Z:/javaproject/performance/results/01_baseline_singleip.json)) and Stage 2 ([01_baseline_multiip.json](file:///Z:/javaproject/performance/results/01_baseline_multiip.json)). Note that `06:00–23:55` schedule windows were used in baseline/race scripts to work around **HIGH-01** (`-05:30` UTC shift).

| Endpoint | Stage 1 (`dev`) `n` | Stage 1 `p50` (ms) | Stage 1 `p95` (ms) | Stage 1 `RPS` | Stage 2 (`prod`) `n` | Stage 2 `p50` (ms) | Stage 2 `p95` (ms) | Stage 2 `RPS` | Statuses |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| `POST /api/auth/register` | 4 | 119.16 | 129.42 | 8.14 | 25 | 99.79 | 126.55 | 9.23 | `201` (100%) |
| `POST /api/auth/login` | 5 | 93.67 | 117.58 | 10.17 | 25 | 95.82 | 123.77 | 10.07 | `200` (100%) |
| `POST /api/auth/refresh` | 5 | 32.40 | 46.38 | 28.62 | 25 | 29.71 | 33.67 | 32.68 | `200` (100%) |
| `POST /api/auth/logout` | 5 | 18.57 | 20.67 | 52.68 | 25 | 17.76 | 20.93 | 55.13 | `204` (100%) |
| `GET /api/doctors` | 30 | 17.14 | 19.26 | 50.03 | 30 | 18.70 | 25.67 | 45.92 | `200` (100%) |
| `GET /api/doctors/{id}/schedules` | 30 | 17.95 | 23.54 | 53.14 | 30 | 17.15 | 19.72 | 56.54 | `200` (100%) |
| `GET /api/doctors/{id}/leaves` | 30 | 17.99 | 21.30 | 53.56 | 30 | 17.84 | 21.97 | 54.41 | `200` (100%) |
| `GET /api/doctors/{id}/slots` | 30 | 26.31 | 32.92 | 36.97 | 30 | 25.22 | 30.32 | 38.30 | `200` (100%) |
| `POST /api/patients` | 25 | 17.47 | 23.20 | 51.68 | 25 | 17.83 | 34.75 | 48.28 | `201` (100%) |
| `GET /api/patients/{id}` (audited) | 25 | 18.42 | 20.23 | 52.11 | 25 | 17.98 | 29.14 | 51.30 | `200` (100%) |
| `GET /api/patients?name=...` | 30 | 19.18 | 25.08 | 48.94 | 30 | 16.60 | 21.86 | 56.36 | `200` (100%) |
| `POST /api/appointments` | 25 | 39.33 | 53.95 | 24.30 | 25 | 33.88 | 41.13 | 27.71 | `201` (100%) |
| `GET /api/appointments/{id}` | 30 | 13.01 | 17.51 | 72.92 | 30 | 12.79 | 17.58 | 73.56 | `200` (100%) |
| `GET /api/appointments` | 30 | 20.57 | 30.12 | 46.00 | 30 | 20.49 | 29.91 | 46.31 | `200` (100%) |
| `PATCH .../status (CANCELLED)` | 25 | 18.39 | 20.16 | 53.14 | 25 | 16.88 | 18.23 | 58.03 | `200` (100%) |
| `PATCH .../status (CHECKED_IN)` | 15 | 41.31 | 148.40 | 20.90 | 15 | 37.05 | 191.44 | 20.19 | `200` (100%) |
| `POST /api/queue/doctors/{id}/call-next` | 15 | 56.42 | 77.76 | 17.30 | 15 | 51.89 | 74.12 | 18.21 | `200` (100%) |
| `POST /api/appointments/{id}/consultation` | 15 | 29.49 | 79.15 | 29.70 | 15 | 28.11 | 73.30 | 31.60 | `201` (100%) |
| `GET /api/appointments/{id}/consultation` | 15 | 24.72 | 32.06 | 38.98 | 15 | 22.81 | 31.68 | 42.57 | `200` (100%) |
| `POST /api/prescriptions/check` | 15 | 20.32 | 48.67 | 44.29 | 15 | 18.90 | 44.57 | 46.85 | `200` (100%) |
| `POST /api/prescriptions` | 15 | 42.71 | 140.44 | 20.34 | 15 | 40.90 | 142.91 | 21.16 | `201` (100%) |
| `GET /api/prescriptions/{id}` | 15 | 26.27 | 44.74 | 36.83 | 15 | 25.57 | 51.08 | 36.91 | `200` (100%) |
| `GET /api/prescriptions/{id}/pdf` | 15 | 29.08 | 273.62 | 21.76 | 15 | 27.68 | 271.83 | 22.62 | `200` (100%) |
| `PATCH .../status (COMPLETED)` | 15 | 80.35 | 157.69 | 11.88 | 15 | 72.62 | 115.50 | 13.13 | `200` (100%) |
| `GET /api/appointments/{id}/invoice` | 15 | 35.81 | 78.92 | 25.95 | 15 | 34.46 | 111.25 | 25.99 | `200` (100%) |
| `POST /api/invoices/{id}/payments` | 15 | 32.16 | 69.76 | 29.63 | 15 | 29.84 | 82.30 | 30.61 | `201` (100%) |
| `POST /api/invoices/{id}/credit-notes` | 15 | 33.70 | 49.92 | 28.19 | 15 | 30.81 | 43.82 | 31.43 | `201` (100%) |
| `GET /api/invoices/{id}/pdf` | 15 | 35.16 | 48.84 | 28.06 | 15 | 31.98 | 47.16 | 30.48 | `200` (100%) |
| `GET /api/queue/doctors/{id}` | 30 | 22.98 | 26.80 | 42.69 | 30 | 21.71 | 23.17 | 45.95 | `200` (100%) |
| `GET /api/queue/board` | 20 | 26.43 | 37.17 | 34.55 | 30 | 23.71 | 28.43 | 39.51 | `200` (100%) |
| `GET /api/invoices` | 30 | 13.09 | 18.64 | 69.74 | 30 | 12.72 | 17.35 | 73.11 | `200` (100%) |
| `GET /api/reports/revenue?groupBy=DAY` | 25 | 14.73 | 17.22 | 62.88 | 25 | 13.37 | 16.86 | 68.72 | `200` (100%) |
| `GET /api/reports/appointments-by-department` | 25 | 10.07 | 10.75 | 96.66 | 25 | 9.65 | 11.05 | 99.30 | `200` (100%) |
| `GET /api/reports/no-show-rate` | 25 | 9.04 | 10.03 | 107.06 | 25 | 9.44 | 12.09 | 99.69 | `200` (100%) |
| `GET /api/reports/top-doctors` | 25 | 10.59 | 12.51 | 90.02 | 25 | 10.25 | 20.30 | 83.61 | `200` (100%) |
| `GET /api/reports/dashboard` | 25 | 16.36 | 17.67 | 59.86 | 25 | 15.57 | 22.99 | 60.25 | `200` (100%) |

---

## D. Concurrency & Race Condition Benchmarks (Phases C & D)

### 1. Authentication Concurrency ([02_auth_concurrency_singleip.json](file:///Z:/javaproject/performance/results/02_auth_concurrency_singleip.json) & [02_auth_concurrency_multiip.json](file:///Z:/javaproject/performance/results/02_auth_concurrency_multiip.json))

| Scenario | Concurrency | `wallMs` | `p50` (ms) | `p95` (ms) | `max` (ms) | `RPS` | Status Breakdown | Notes |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| Login (`dev` single-IP) | `c=10` | 152.55 | 145.53 | 148.65 | 148.65 | 65.55 | `200: 10` | Fits within `10/min` auth burst |
| Login (`dev` single-IP) | `c=25` | 40.77 | 31.78 | 33.54 | 34.65 | 613.24 | `429: 25` | Fast Bucket4j rejection |
| Login (`dev` single-IP) | `c=50` | 62.49 | 50.88 | 53.67 | 53.76 | 800.14 | `429: 50` | Fast Bucket4j rejection |
| Login (`dev` single-IP) | `c=100` | 129.53 | 100.28 | 109.55 | 110.43 | 772.02 | `429: 100` | Fast Bucket4j rejection |
| Login (`prod` multi-IP) | `c=10` | — | 164.51 | 279.90 | — | 35.44 | `200: 10` | `0` `5xx` |
| Login (`prod` multi-IP) | `c=25` | — | 370.72 | 477.08 | — | 49.53 | `200: 25` | `0` `5xx` |
| Login (`prod` multi-IP) | `c=50` | — | 479.54 | 859.31 | — | 55.34 | `200: 50` | Peak BCrypt throughput (~55 RPS) |
| Login (`prod` multi-IP) | `c=100` | — | 1230.84 | 2017.11 | — | 46.51 | `200: 100` | Tail exceeds `2s` on 16 HW threads |
| Same-token Refresh Race | `c=25` | 15021.03 | 15015.64 | 15017.07 | 15017.18 | 1.66 | `200: 1, TIMEOUT: 24` | **CRITICAL-02 Pool Deadlock** |
| Concurrent Refresh + Logout | `c=20` | 84.60 | 66.52 | 79.07 | 81.22 | 236.40 | `204: 10, 401: 10` | Post-race `401 INVALID_REFRESH_TOKEN` |

#### `CRITICAL-02` Failure Analysis (Refresh Rotation Race)
In [AuthService.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/auth/service/AuthService.java), `refresh()` runs inside `@Transactional` while holding a Hikari connection (`Connection #1..#20`). When duplicate concurrent threads detect a rotated/revoked token, they call `RefreshTokenRevocationService.revokeAllActiveTokensForUser(...)` in [RefreshTokenRevocationService.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/auth/service/RefreshTokenRevocationService.java), which is annotated `@Transactional(propagation = Propagation.REQUIRES_NEW)`. At `c=25`, `HikariPool-1` (`max=20`) saturates cleanly into a self-deadlock for `30s`:
- **Server evidence ([stage2-app.stdout.log](file:///Z:/javaproject/performance/results/stage2-app.stdout.log)):** `6` logged `CannotCreateTransactionException` / `SQLTransientConnectionException` errors across `AuthService#refresh` and `RefreshTokenRevocationService#revokeAllActiveTokensForUser`.
- **Security impact:** Follow-up `oldTokenReplayStatus` timed out, and **`rotatedTokenStatusAfterReplayRevocation` returned HTTP `200`** — proving the legitimate rotated refresh token survived active when replay revocation collapsed under pool exhaustion.

---

### 2. Appointment Booking & Queue Concurrency ([03_booking_races.json](file:///Z:/javaproject/performance/results/03_booking_races.json))

| Scenario | Concurrency | `wallMs` | `p50` (ms) | `p95` (ms) | `max` (ms) | `RPS` | Status Breakdown | Result / Invariant |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| Contested Same-Slot | `c=10` | 112.99 | 91.96 | 108.93 | 108.93 | 88.51 | `201: 1, 409: 9` | **PASS** (1 winner, 0 5xx) |
| Contested Same-Slot | `c=25` | 213.02 | 161.51 | 203.83 | 209.54 | 117.36 | `201: 1, 409: 24` | **PASS** (1 winner, 0 5xx) |
| Contested Same-Slot | `c=50` | 330.89 | 203.59 | 287.61 | 319.52 | 151.11 | `201: 1, 409: 49` | **PASS** (1 winner, 0 5xx) |
| Contested Same-Slot | `c=100` | 655.91 | 527.54 | 620.36 | 634.26 | 152.46 | `201: 1, 409: 99` | **PASS** (1 winner, 0 5xx) |
| Parallel Distinct Slots (4 docs) | `c=50` | 388.13 | 295.88 | 372.55 | 378.00 | 128.82 | `201: 50` | **PASS** (50/50 created) |
| Cancel vs Rebook (10 pairs) | `c=20` | 115.85 | 82.24 | 110.74 | 112.97 | 172.64 | `200: 10, 201: 9, 409: 1` | **PASS** (`0` 5xx; race resolved cleanly) |
| Concurrent Check-In Tokens | `c=25` | 15011.24 | 15006.90 | 15007.18 | 15007.19 | 1.67 | `TIMEOUT: 25` | **FAIL — CRITICAL-01 Deadlock** |
| Concurrent `call-next` Race | `c=10` | 230.22 | 218.19 | 229.99 | 229.99 | 43.44 | `200: 1, 409: 9` | **PASS** (1 caller won, 0 5xx) |

#### `CRITICAL-01` Failure Analysis (Check-In Token Deadlock)
In [StatusTransitionService.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/appointment/service/StatusTransitionService.java), `updateStatus(...)` executes inside `@Transactional`, publishes a queue event on check-in, and holds its JDBC connection until `JpaTransactionManager` cleans up after transaction callbacks. However, [QueueMessagePublisher.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/queue/service/QueueMessagePublisher.java) intercepts that event synchronously inside `@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)` **before** Connection #1 is returned to `HikariPool-1`, and invokes [QueueService.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/queue/service/QueueService.java) `buildQueueUpdateMessage(...)` which is annotated `@Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)`.
- **Server evidence ([stage1-app.stdout.log](file:///Z:/javaproject/performance/results/stage1-app.stdout.log)):** Lines `1355–1359` record **5 unhandled HTTP `500` `CannotCreateTransactionException` (`SQLTransientConnectionException`)** failures at `StatusTransitionService#updateStatus`, and line `1367` records `WARN queue_broadcast_failed ... errorType=CannotCreateTransactionException` on `QueueMessagePublisher`.
- **Cascading side effect:** The immediately following `POST /api/appointments` setup call for `sameAppointmentStatusRace` took `15,198 ms` on the recovering pool (`line 1388`), exceeding the Node `15,000 ms` fetch abort timeout (`sameAppointmentStatusRace: null` in `03_booking_races.json`).

---

## E. Rate Limiter Stress & Edge Case Results (Phase E)

Observed from [04_rate_limit_stress_singleip.json](file:///Z:/javaproject/performance/results/04_rate_limit_stress_singleip.json) and [04_rate_limit_stress_multiip.json](file:///Z:/javaproject/performance/results/04_rate_limit_stress_multiip.json):

| Check | Mode | Count | `wallMs` | `p50` (ms) | `p95` (ms) | `RPS` | Statuses & Assertions |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| Queue Board Burst (limit `30/min`) | `dev` (single-IP) | 60 | 339.97 | 82.08 | 179.56 | 176.49 | `200: 30, 429: 30`, `30/30` `Retry-After` present, `0` `5xx` |
| Queue Board Burst (limit `30/min`) | `prod` (`10.88.1.1`) | 60 | 353.48 | 70.13 | 180.30 | 169.74 | `200: 30, 429: 30`, `30/30` `Retry-After` present, `0` `5xx` |
| Spoofed `X-Forwarded-For` Check | `dev` (ignores XFF) | 10 | 13.67 | 5.31 | 7.51 | 731.52 | `429: 10` — spoofing blocked |
| Malformed `XFF` (`""`, `"unknown"`, `"not-an-ip"`, `"999.999.999.999"`, `"10.1.1.1, bad_ip, 127.0.0.1"`) | `dev` | 5 | 6.62 | 4.03 | 4.17 | 754.89 | `429: 5`, `0` `5xx` |
| Malformed `XFF` (same 5 payloads) | `prod` (trusted proxy) | 5 | — | — | — | — | `200: 5`, `0` `5xx` (fell back cleanly to non-exhausted `127.0.0.1` bucket) |
| **11,500 Distinct Client IPs LRU Eviction Stress (`c=64`)** | `prod` | 11,500 | 36926.61 | 185.63 | 330.28 | **311.43** | **`200: 11,500`**, `max=769.45 ms`, `0` `5xx`, `0` transport errors |
| Unrelated IP (`198.51.100.77`) post-eviction | `prod` | 1 | 22.63 | 22.63 | 22.63 | — | `200: 1` |
| Pass-through `/actuator/health` (`c=20`) | `prod` | 200 | 342.18 | 32.81 | 44.16 | **584.48** | `200: 200` (no Bucket4j rule) |
| Rate-limited `/api/queue/board` (`c=20`) | `prod` | 200 | 742.08 | 58.23 | 172.27 | **269.51** | `200: 200` (Bucket4j filter + DB query) |

**Key takeaway:** [RateLimitFilter.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/common/config/RateLimitFilter.java) (`DEFAULT_MAX_BUCKET_CACHE_SIZE = 10_000`) handled 11,500 distinct IPs under `c=64` concurrency with bounded LRU eviction and `0` `5xx`/transport errors.

---

## F. Queue & STOMP WebSocket Scalability (Phase F)

Measured against `/ws` in [05_queue_websocket.json](file:///Z:/javaproject/performance/results/05_queue_websocket.json):

- **Security & Authorization Verification:**
  - Subscribing to `/topic/admin` was rejected (`"Subscription destination is not permitted"`).
  - Sending a client STOMP `SEND` frame was rejected (`"Client SEND frames are rejected on /ws"`).
  - `/topic/queue/{doctorId}` payload inspection confirmed **`piiLeaked: false`** on delivered `MESSAGE` frames across all waves.

| Concurrent Subscribers | Connect+Sub `wallMs` | Connect `p95` (ms) | Triggering Check-In (ms) | Delivered | Lost / Dups | Fanout `p50` (ms) | Fanout `p95` (ms) | Fanout `RPS` |
| ---: | ---: | ---: | ---: | ---: | :---: | ---: | ---: | ---: |
| `10` clients | 34.81 | 34.81 | 38.82 | `10 / 10` | `0 / 0` | 40.03 | 40.09 | 249.42 |
| `25` clients | 66.57 | 66.32 | 43.03 | `25 / 25` | `0 / 0` | 43.82 | 44.01 | 567.84 |
| `50` clients | 104.63 | 104.50 | 50.71 | `50 / 50` | `0 / 0` | 51.29 | 51.82 | 964.25 |
| `100` clients | 228.75 | 228.49 | 51.30 | `100 / 100` | `0 / 0` | 58.78 | 59.99 | 1663.63 |

**Caveat:** [WebSocketConfig.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/queue/config/WebSocketConfig.java) uses Spring's in-memory `SimpleBroker`. While single-node latency is sub-60 ms at 100 clients, horizontal scaling across multiple backend pods will require an external STOMP broker relay (e.g., RabbitMQ/ActiveMQ) or Redis pub/sub fanout.

---

## G. Database Query Plan & Index Inspection (Phase G)

All plans captured via `EXPLAIN (ANALYZE, BUFFERS)` on the `hcms-perf-pg` dataset (`5` clinics, `25` departments, `101` doctors, `10,077` patients, `50,040` appointments, `30,015` invoices, `40,015` payments, `15` credit notes, `100,235` audit logs) in [explain_plans.txt](file:///Z:/javaproject/performance/results/explain_plans.txt):

| # | Query Pattern | Plan Operator(s) | Exec Time (ms) | Shared Hit Buffers | Rows Discarded / Finding |
| :---: | :--- | :--- | ---: | ---: | :--- |
| `1` | Doctor schedule lookup | `Bitmap Index Scan` (`idx_schedule_entries_doctor_day`) | `0.122` | `3` | Healthy (`7` rows) |
| `2` | Available slot lookup | `Bitmap Index Scan` (`uq_appointment_slot_active`) | `0.118` | `8` | Healthy (`5` rows) |
| `3a` | Patient phone prefix (`'910001%'`) | **`Seq Scan on patients`** + Sort | `1.814` | `226` | **Discarded `10,076` rows** (`idx_patients_phone` unused: `en_US.utf8`) |
| `3b` | Patient name substring (`'%pat005%'`) | **`Seq Scan on patients`** + top-N Sort | `5.090` | `220` | **Discarded `9,977` rows** (`idx_patients_full_name_lower` unused) |
| `3c` | Patient search doctor `EXISTS` | `Hash Semi Join`: `Seq Scan on patients` + `Bitmap Index Scan` (`uq_appointment_slot_active`) | `3.492` | `726` | Full `patients` table scan joined with 500 doctor appointments |
| `4` | Doctor-scoped appointment list | **`Seq Scan on appointments`** + `Seq Scan on patients` + top-N Sort | `8.417` | `1,365` | **Discarded `49,540` `appointments` rows**; needs `(doctor_id, slot_start, id)` |
| `5` | Booking exclusivity check | `Index Scan` (`uq_appointment_slot_active`) | `0.102` | `3` | Optimal |
| `6` | Clinic queue board (20 docs) | `BitmapOr` (`uq_appointment_doctor_in_consultation` + `idx_appointments_doctor_checked_in`) | `1.920` | `337` | `319` buffer hits on `idx_appointments_doctor_checked_in` (not leading with `checked_in_at`) |
| `7` | Invoice list (`status` + `created_at DESC`) | `Index Scan Backward` (`idx_invoices_created_at`) | `0.072` | `4` | Optimal |
| `8` | Payment history by `invoice_id` | `Index Scan` (`idx_payments_invoice`) | `0.055` | `4` | Optimal |
| `9a` | Revenue invoiced (`30d`, `DAY`) | `Index Scan` (`idx_invoices_created_at`) | `0.162` | `3` | Healthy (`15` recent rows) |
| `9b` | Revenue collected (`180d`, `DAY`) | **`Hash Join` of `Seq Scan on payments` + `Seq Scan on invoices`** | `76.527` | `1,322` | Scanned all `40,015` payments & `30,015` invoices |
| `10` | Report: Depts (`180d`) | **`Seq Scan on appointments`** + `Hash Right Join` | `42.909` | `1,144` | Scanned all `50,040` appointments (`slot_start` unindexed) |
| `11` | Report: Top Doctors (`180d`) | **`Seq Scan on appointments`** + **`Hash Join (Seq payments, Seq invoices)`** | `64.925` | `2,467` | 2 full sequential scans (`appointments`, `payments`+`invoices`) |
| `12` | Report: Dashboard Today | **`Seq Scan on appointments`** | `9.134` | `1,138` | **Discarded `49,500` rows** (needs `slot_start` index) |
| `13` | Audit logs filtered by `user_id` | `Index Scan` (`idx_audit_logs_occurred_at`) | `1.145` | `683` | **Discarded `862` rows**; needs `(user_id, occurred_at DESC)` |

### `pg_stat_user_indexes` Unused Index Highlights
Among 62 reported index rows (`explain_plans.txt` lines 503–518), key large/search indexes remained at **`idx_scan = 0`** throughout the entire load test:
- `patients`: `idx_patients_phone` (`576 kB`, `idx_scan = 0`), `idx_patients_full_name_lower` (`576 kB`, `idx_scan = 0`)
- `audit_logs`: `idx_audit_logs_user_id` (`816 kB`, `idx_scan = 0`), `idx_audit_logs_entity_type` (`656 kB`, `idx_scan = 0`)
- `invoices` / `credit_notes` / clinical: `invoices_invoice_number_key` (`1200 kB`, `0`), `credit_notes_credit_note_number_key` (`16 kB`, `0`), `idx_consultations_patient` (`16 kB`, `0`), `idx_prescriptions_patient_created` (`16 kB`, `0`), `idx_medicines_name_lower` (`16 kB`, `0`)

---

## H. Synthetic Dataset & Scale / Reporting Results (Phases H & I)

Measured against the `50k`/`100k` seeded dataset ([06_scale_and_reports.json](file:///Z:/javaproject/performance/results/06_scale_and_reports.json)):

| Workload | `n` (Concurrency) | `p50` (ms) | `p90` (ms) | `p95` (ms) | `p99` (ms) | `RPS` | Statuses |
| :--- | :---: | ---: | ---: | ---: | ---: | ---: | :--- |
| Scale Patient Search: phone prefix | `30 (c=10)` | 31.05 | 49.28 | 52.30 | 53.79 | 273.42 | `200: 30` |
| Scale Patient Search: name substring | `30 (c=10)` | 56.31 | 66.59 | 67.13 | 68.88 | 160.55 | `200: 30` |
| Scale Patient Search: `DOCTOR` `EXISTS` scoped | `30 (c=10)` | 110.19 | 134.86 | 142.93 | 146.47 | 82.32 | `200: 30` |
| Scale Doctor List (`100+` doctors) | `30 (c=10)` | 50.91 | 71.42 | 83.61 | 89.53 | 169.11 | `200: 30` |
| **Scale Appointment List: all (`50,040` rows)** | `30 (c=10)` | **438.74** | **481.69** | **492.82** | **501.69** | **22.09** | `200: 30` |
| Scale Appointment List: doctor scoped | `30 (c=10)` | 82.14 | 116.03 | 131.32 | 134.04 | 100.44 | `200: 30` |
| Scale Queue Board: Clinic 1 (`20+` doctors) | `30 (c=10)` | 60.84 | 84.54 | 89.28 | 92.90 | 146.62 | `200: 30` |
| Scale Invoice List (`30,015` rows) | `30 (c=10)` | 72.90 | 88.53 | 92.76 | 98.34 | 120.02 | `200: 30` |
| Scale Invoice Detail `GET` | `30 (c=10)` | 73.50 | 111.67 | 121.47 | 122.12 | 116.15 | `200: 30` |
| Scale Invoice PDF Render | `15 (c=5)` | 58.31 | 69.06 | 71.72 | 71.72 | 77.26 | `200: 15` |
| **Scale Audit Logs Paginated (`100,235` rows)** | `30 (c=10)` | **118.87** | **136.97** | **138.39** | **147.21** | **87.98** | `200: 30` |
| Scale Audit Logs by `action` + Page | `30 (c=10)` | 58.26 | 68.27 | 74.05 | 79.89 | 151.89 | `200: 30` |
| Report Revenue `DAY` (`30d`) | `20` | 24.64 | 39.26 | 41.09 | 43.50 | 137.71 | `200: 20` |
| **Report Revenue `DAY` (`180d`)** | `20` | **154.38** | **243.40** | **252.34** | **254.36** | **21.53** | `200: 20` |
| **Report Revenue `DAY` (`366d` max)** | `20` | **243.25** | **271.62** | **273.25** | **278.72** | **15.85** | `200: 20` |
| **Report Revenue `MONTH` (`180d`)** | `20` | **229.71** | **257.97** | **260.98** | **268.57** | **16.70** | `200: 20` |
| **Report Revenue `MONTH` (`366d` max)** | `20` | **213.23** | **273.22** | **276.88** | **278.15** | **17.78** | `200: 20` |
| Report Dept Appointments (`180d`, all clinics) | `20` | 55.11 | 74.63 | 94.06 | 107.75 | 54.97 | `200: 20` |
| Report Dept Appointments (`180d`, clinic 1) | `20` | 23.33 | 25.60 | 26.33 | 26.36 | 163.51 | `200: 20` |
| Report No-Show Rate (`180d`) | `20` | 23.68 | 25.46 | 25.60 | 26.07 | 161.67 | `200: 20` |
| Report Top Doctors: `COMPLETED_APPOINTMENTS` (`180d`) | `20` | 71.72 | 76.20 | 96.47 | 100.00 | 51.34 | `200: 20` |
| Report Top Doctors: `COLLECTED_REVENUE` (`180d`) | `20` | 82.26 | 100.24 | 100.27 | 107.75 | 45.69 | `200: 20` |
| Report Dashboard (all clinics) | `20` | 32.32 | 34.21 | 39.37 | 40.66 | 116.86 | `200: 20` |
| Report Dashboard (clinic 1) | `20` | 29.38 | 32.95 | 33.11 | 34.02 | 131.29 | `200: 20` |

### Report Mathematical & Validation Invariants
- Zero-denominator no-show rate returned HTTP `200` with `ratePercent: null` (`zeroDenominatorRatePercentIsNull: true`).
- Inverted date range returned HTTP `400` with `code: 'VALIDATION_FAILED'`.
- `180d` revenue totals verified exact accounting identity `net = collected - credited`: `invoiceCount: 28,515`, `invoiced: '14257500.00'`, `collected: '10007500.00'`, `credited: '750.00'`, `net: '10006750.00'` across `7` buckets.

---

## I. JVM, GC, Memory, Thread & Connection Pool Telemetry (Phase J)

| Telemetry Metric | Stage 1 (`dev`, 242s) | Stage 2 (`prod`, 149s + 50k/100k Scale) |
| :--- | :--- | :--- |
| **G1GC Pauses (`gc.log`)** | `47` pauses, total **`309.903 ms`**, max **`21.364 ms`**, **`0` Full GCs** | `113` pauses, total **`856.066 ms`**, max **`39.879 ms`**, **`0` Full GCs** |
| **Heap Usage (`jcmd GC.heap_info`)** | `223,232K` committed / `92,880K` used (`~90.7 MB`) | `178,176K` committed / `154,801K` used (`~151.2 MB`) |
| **Live / Peak Platform Threads** | Live `41` / Peak `109` | Live `39` / Peak `39` |
| **`http.server.requests`** | `COUNT = 1,681`, `TOTAL = 847.36s`, `MAX = 30.195s` | `COUNT = 13,688`, `TOTAL = 1,463.71s`, `MAX = 30.321s` |
| **`hikaricp.connections.acquire`** | `COUNT = 1,335`, `TOTAL = 788.28s`, `MAX = 30.006s` | `COUNT = 13,925`, `TOTAL = 306.24s`, `MAX = 30.015s` |
| **`hikaricp.connections.usage`** | `COUNT = 1,329`, `TOTAL = 648.42s`, `MAX = 30.186s` | `COUNT = 13,919`, `TOTAL = 1,171.19s`, `MAX = 30.317s` |
| **JFR `VirtualThreadPinned`** | **`0`** | **`12`** (`21.6–38.5 ms`: 3 in Micrometer `DefaultLongTaskTimer.start()`, 9 in Hibernate `SqmSelectStatement.subquery()` from `JpaDoctorPatientScopeAdapter.doctorOwnPatientPredicate`) |
| **JFR `VirtualThreadSubmitFailed`** | **`0`** | **`0`** |
| **JFR Top CPU Hot Method** | `BCrypt.key` (`11.15%`, `175` samples) | `BCrypt.key` (`18.49%`, `1,375` samples), `HashMap.getNode` (`1.72%`) |

*(Note: `jstat -gcutil` failed on Windows OpenJDK with `PerfDataBuffer: Could not map vmid to user name`; GC/heap/pool telemetry was collected via `-Xlog:gc*`, `jcmd GC.heap_info`, `/actuator/metrics`, and JFR.)*

---

## J. Phase L Optimization Plan (Recommended Actions — Pending Approval)

No application code or database migrations have been modified yet. The following remediation roadmap is ordered by severity:

### Mandatory Before Production (Critical / High)

1. **Fix `CRITICAL-01` — Eliminate Nested `REQUIRES_NEW` Inside `AFTER_COMMIT` Check-In Fanout**
   - **Files:** [QueueMessagePublisher.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/queue/service/QueueMessagePublisher.java), [QueueService.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/queue/service/QueueService.java), [StatusTransitionService.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/appointment/service/StatusTransitionService.java)
   - **Change:** Dispatch `QueueMessagePublisher.onQueueChanged` asynchronously on a bounded virtual-thread executor (preserving MDC correlation/context), **or** offload `QueueService.buildQueueUpdateMessage` cleanly outside the HTTP transaction's `HikariPool-1` connection lifetime so acquiring Connection #2 never blocks waiting for Connection #1 to return.
   - **Expected Gain:** Eliminates `30s` `HikariPool-1` deadlocks and `CannotCreateTransactionException` `500` errors at `c >= 20` check-ins.

2. **Fix `CRITICAL-02` — Remove Dual-Connection Deadlock & Revocation Bypass on Refresh Replay**
   - **Files:** [AuthService.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/auth/service/AuthService.java), [RefreshTokenRevocationService.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/auth/service/RefreshTokenRevocationService.java)
   - **Change:** Replace `Propagation.REQUIRES_NEW` revocation with an atomic single-connection pattern or transaction-decoupled revocation after outer rollback: e.g., lock/consume the presented refresh token atomically (`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = :hash AND revoked_at IS NULL`) and when `0` rows match an already-rotated token, trigger family revocation cleanly outside any active held `HikariPool-1` connection (and keep replay exception handling deterministic so `rotatedTokenStatusAfterReplayRevocation == 401` under high concurrency).
   - **Expected Gain:** Zero `30s` refresh timeouts under `c=25+` same-token races and guaranteed family revocation under saturation.

3. **Fix `HIGH-01` — Prevent `-05:30` UTC Offset Shift on `ScheduleEntry.startTime` / `endTime`**
   - **Files:** [application.yml](file:///Z:/javaproject/backend/src/main/resources/application.yml), [ScheduleEntry.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/doctor/entity/ScheduleEntry.java)
   - **Change:** Force consistent UTC JVM timezone across startup/entrypoints (`TimeZone.setDefault(TimeZone.getTimeZone("UTC"))` or `-Duser.timezone=UTC`) and/or map PostgreSQL `TIME WITHOUT TIME ZONE` without timezone-converting `java.sql.Time` shim so `LocalTime` wall-clock clinic hours persist verbatim regardless of host OS timezone. Also verify `ScheduleService` maps unexpected constraint failures safely without leaking `500`.

### Strongly Recommended Performance Optimizations (Medium)

4. **Flyway `V13` Indexing & Query Tuning (`MEDIUM-01`–`MEDIUM-03`)**
   - `appointments`: Add `(slot_start, id)` and `(doctor_id, slot_start, id)` to eliminate `49,540+`-row sequential scans in listing and date-bounded dashboard/department/top-doctor queries; add index/covering index for `(checked_in_at, doctor_id) WHERE status = 'CHECKED_IN'`.
   - `patients`: Ensure `pg_trgm` extension + GIN trigram index on `LOWER(full_name)` and `varchar_pattern_ops` index on `phone` (replacing/complementing unused `idx_patients_full_name_lower` and `idx_patients_phone`).
   - `payments` / `ReportRepository`: Add composite `(created_at, invoice_id)` on `payments` or aggregate via indexed window/materialized summary for `180d`/`366d` revenue queries (`ReportRepository.java`).
   - `audit_logs`: Add composite `(user_id, occurred_at DESC)` and `(action, occurred_at DESC)` to replace unused single-column `idx_audit_logs_user_id` and `idx_audit_logs_entity_type` where appropriate.
   - **Target:** Bring unfiltered `GET /api/appointments` (`50k` rows) from `438.74 ms` p50 down below `50 ms`, and `180d`/`366d` revenue reports from `154–243 ms` down below `60 ms`.

5. **Resilience & Scaling Guardrails (`MEDIUM-04`, `LOW-01`, `LOW-02`)**
   - Add request concurrency / bulkhead guard or document login CPU scaling expectations (`~50 RPS` per 16 HW-thread node at BCrypt default strength).
   - Warm up OpenPDF fonts at startup (`ApplicationReadyEvent`) to eliminate the `~272 ms` cold first-request PDF spike.
   - Configure `spring.datasource.hikari.leak-detection-threshold` in non-prod/staging profiles and monitor Hibernate 7 / Micrometer updates for the minor `DefaultLongTaskTimer` / `SqmSelectStatement` monitor pinning (`12` events).
