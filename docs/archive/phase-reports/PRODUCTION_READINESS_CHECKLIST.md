# CareSync HCMS — Production Readiness & Deployment Checklist

**Version:** 1.0.0  
**Target Release:** CareSync Enterprise v1.0  
**Stack:** Java 25 / Spring Boot 4.1.2 / PostgreSQL 16 / React 18 / Vite 6  

This document serves as the authoritative operational guide, infrastructure checklist, and deployment runbook for hosting CareSync HCMS in production environments.

---

## 1. Environment & Configuration Matrix

| Category | Environment Variable | Required In Prod | Recommended Production Value | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Profile** | `SPRING_PROFILES_ACTIVE` | Yes | `prod` | Activates production logging, trusted proxy parsing, and strict error suppression. |
| **Database** | `SPRING_DATASOURCE_URL` | Yes | `jdbc:postgresql://db.prod.internal:5432/caresync` | Authoritative PostgreSQL JDBC connection URL with SSL enabled (`sslmode=require`). |
| **Database** | `SPRING_DATASOURCE_USERNAME` | Yes | `caresync_app` | Dedicated non-superuser database user for application runtime. |
| **Database** | `SPRING_DATASOURCE_PASSWORD` | Yes | *From Secret Vault* | High-entropy password managed via secret manager. |
| **Security** | `CARESYNC_JWT_SECRET` | Yes | *From Secret Vault* | At least 64-character random string (HS256/HS512 compliant). |
| **CORS** | `CARESYNC_CORS_ORIGINS` | Yes | `https://hospital.caresync.health` | Comma-delimited list of authorized frontend origins. No wildcards. |
| **Admin** | `CARESYNC_ADMIN_EMAIL` | Yes | `admin@hospital.caresync.health` | System root administrator account email. |
| **Admin** | `CARESYNC_ADMIN_PASSWORD` | Yes | *From Secret Vault* | Initial admin password; prompt reset upon first login. |
| **Reception** | `CARESYNC_RECEPTIONIST_EMAIL` | Yes | `frontdesk@hospital.caresync.health` | Default front desk staff account. |
| **Reception** | `CARESYNC_RECEPTIONIST_PASSWORD` | Yes | *From Secret Vault* | Initial receptionist password. |
| **Proxy** | `CARESYNC_TRUSTED_PROXIES` | Yes | CIDR range of Ingress/ALB | Regex matching trusted upstream proxy IPs for secure header extraction. |
| **Frontend** | `VITE_API_BASE_URL` | Optional | `https://hospital.caresync.health/api` (or omit for same-origin `/api`) | Production API endpoint using same-origin routing. |

---

## 2. Infrastructure & Deployment Architecture

```mermaid
graph TD
    User["Clinicians & Patients (Browser/Mobile)"] -->|HTTPS / 443| CDN["Cloudflare / AWS CloudFront"]
    CDN -->|Static Assets (JS/CSS/HTML)| S3["S3 / Nginx Static Hosting"]
    CDN -->|API /ws Requests| ALB["Application Load Balancer (TLS Termination)"]
    ALB -->|HTTP / 8080| App1["CareSync Backend Instance 1"]
    ALB -->|HTTP / 8080| App2["CareSync Backend Instance 2"]
    App1 -->|JDBC / SSL (Pool: 20)| PGPrimary[("PostgreSQL 16 Primary")]
    App2 -->|JDBC / SSL (Pool: 20)| PGPrimary
    PGPrimary -->|Streaming Replication| PGReplica[("PostgreSQL 16 Read Replica")]
    PGPrimary -->|Automated Backups| BackupBucket[("S3 Encrypted Backup Vault")]
```

### 2.1. Frontend Production Container & Nginx Reverse Proxy
The React application is built via `npm run build` and served as static assets through Nginx using `deploy/nginx/caresync.conf` and reusable edge snippet `deploy/nginx/snippets/security-headers.conf`.
Key Nginx configuration rules:
- **Unified Same-Origin Routing:** Single public domain `https://hospital.caresync.health` serving frontend SPA, REST APIs (`/api/`), and STOMP WebSocket (`/ws/`).
- **Gzip Compression:** Enabled for `text/plain`, `text/css`, `text/xml`, `application/json`, `application/javascript`, `application/rss+xml`, `application/atom+xml`, `image/svg+xml` at compression level 6 (Brotli is deferred as the standard `nginx:1.27-alpine` image does not package the third-party `ngx_brotli` module).
- **Cache-Control:**
  - `index.html`: `no-cache, no-store, must-revalidate` (to ensure immediate adoption of new deployments).
  - `/assets/*.js`, `/assets/*.css`: `public, max-age=31536000, immutable` (fingerprinted chunks) with `try_files $uri =404;`.
- **Single Page Application Routing:** `try_files $uri $uri/ /index.html;`.
- **Snippet-Based Security Headers (Inherited on all locations):**
  - `Strict-Transport-Security: max-age=15724800; includeSubDomains` (conservative 6-month initial policy; preload omitted until permanent production verification)
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';`
- **Reverse Proxy & WebSocket Routing:**
  - REST API routed to `http://backend:8080/api/` with upstream keepalive (`Connection ""`), `proxy_hide_header` to prevent duplicate edge headers, and 10MB body limit.
  - STOMP WebSocket routed to `http://backend:8080/ws/` with dynamic upgrade mapping (`map $http_upgrade $connection_upgrade`) and 3600s timeouts.
  - Actuator endpoints blocked from public ingress (`location /actuator { return 404; }`).
  - HTTP port 80 redirects to canonical HTTPS origin while passing `/.well-known/acme-challenge/` for Certbot renewal.

### 2.2. Backend Production Container (Spring Boot)
Defined in `backend/Dockerfile` and orchestrated in `docker-compose.prod.yml`:
- **Base Image:** `eclipse-temurin:25-jre-alpine` multi-stage build.
- **User:** Dedicated non-root application user (`USER caresync:caresync`, UID `10001:10001`).
- **JVM Options:**
  - `-XX:+UseG1GC`
  - `-XX:MaxRAMPercentage=75.0`
  - `-Djava.security.egd=file:/dev/./urandom`
- **Virtual Threads:** Enabled via `spring.threads.virtual.enabled: true`.
- **Liveness Health Check:** `wget --spider http://localhost:8080/actuator/health/liveness || exit 1`.

---

## 3. Database Resilience & Backup Runbook

### 3.1. Connection Pool Tuning
- **HikariCP Configuration:**
  - `maximum-pool-size: 20` per instance.
  - `minimum-idle: 5`.
  - `connection-timeout: 30000` (30s).
  - `idle-timeout: 600000` (10m).
  - `max-lifetime: 1800000` (30m).

### 3.2. Automated Backup Strategy
1. **Daily Full Logical Backup:**
   ```bash
   pg_dump -U caresync -Fc caresync | gzip > /backups/caresync_full_$(date +%Y%m%d_%H%M%S).dump.gz
   ```
2. **Continuous WAL Archiving:**
   - WAL archiving to AWS S3 / GCS bucket for Point-In-Time Recovery (PITR) with a Recovery Point Objective (RPO) $< 5$ minutes.
3. **Backup Restoration Drill:**
   - Test restoration quarterly in a sandbox environment:
   ```bash
   createdb -U caresync caresync_recovery_test
   pg_restore -U caresync -d caresync_recovery_test /backups/caresync_full_latest.dump
   ```

### 3.3. Database Migrations (Flyway)
- Migrations (`V1` through `V12`) are applied automatically on startup (`flyway.validate-on-migrate: true`).
- **Strict Rule:** Existing historical migration scripts (`V1`–`V12`) must **never** be modified or deleted. Any schema changes must be added as sequential migrations (`V13__...`).

---

## 4. Observability, Monitoring & Health Checks

### 4.1. Actuator Endpoints
- **Health Probes:**
  - Liveness Probe: `GET /actuator/health/liveness` (returns 200 `UP`).
  - Readiness Probe: `GET /actuator/health/readiness` (verifies DB connection and Flyway state).
- **Metrics:** `GET /actuator/metrics` (Prometheus scrape endpoint available at `/actuator/prometheus` when dependency is added).

### 4.2. Structured Logging
- In production (`spring.profiles.active=prod`), logging format is configured to **Elastic Common Schema (ECS)** JSON format:
  ```json
  {
    "@timestamp": "2026-11-13T18:00:00.000Z",
    "log.level": "INFO",
    "message": "User login successful",
    "service.name": "caresync-backend",
    "user.id": "41ab8257-8ffa-47af-b3ce-ea90e8e0b996",
    "client.ip": "203.0.113.195"
  }
  ```
- **Audit Immutability:** Audit trail entries are additionally persisted to the `audit_logs` table with an append-only trigger (`V12__protect_audit_logs_append_only.sql`).

### 4.3. Authoritative Error Response Contract Specification
- **Structured Error Schema:** The backend deliberately uses custom structured `ErrorResponse` records (`timestamp`, `status`, `code`, `message`, `path`, `fieldErrors`) matching `openapi.yaml`.
- **RFC 7807 Explicitly Disabled:** Spring Boot 4's built-in RFC 7807 problem details is intentionally disabled (`spring.mvc.problemdetails.enabled: false`) to preserve 100% backward compatibility across all frontend portals, toast notification handlers, and Axios error interceptors.
- **Uniform Error Codes:** Standard domain error codes (`CONSULTATION_INCOMPLETE`, `SEVERE_WARNING_NOT_ACKNOWLEDGED`, `SLOT_UNAVAILABLE`, `TOKEN_EXPIRED`, `UNAUTHORIZED`, `ACCESS_DENIED`, `INTERNAL_ERROR`) are strictly returned in the `code` field.

---

## 5. Security & Hardening Checklist

- [x] HTTPS enforced via reverse proxy with TLS 1.3 / TLS 1.2 modern cipher suites (`deploy/nginx/caresync.conf`).
- [x] HSTS enabled (`Strict-Transport-Security: max-age=15724800; includeSubDomains`; initial conservative 6-month policy without `preload` to guarantee operational reversibility; `preload` will be submitted only after 6 months of continuous, verified uninterrupted HTTPS operation across all subdomains).
- [x] Modern Content Security Policy (CSP), X-Frame-Options: DENY, X-Content-Type-Options: nosniff.
- [x] Open Session in View disabled (`spring.jpa.open-in-view: false`).
- [x] Server error details suppressed (`server.error.include-message: never`, stacktrace never included).
- [x] Single-use Refresh Token Rotation with SHA-256 hash storage and token family invalidation.
- [x] Fail-closed IDOR protection across all clinical, prescription, and invoice endpoints.
- [x] **WebSocket STOMP Channel Hardening:**
  - JWT Bearer token authentication required on STOMP `CONNECT`.
  - Strict destination doctor ID validation on STOMP `SUBSCRIBE` (`/topic/queue/{doctorId}`): Doctor A can only subscribe to Doctor A's queue; cross-doctor subscriptions rejected fail-closed with `MessageDeliveryException`.
  - Patients and unauthenticated callers denied all queue subscriptions.
  - Receptionists and Administrators permitted to monitor queues for multi-desk desk operations.
  - Inbound client-to-server STOMP `SEND` frames strictly blocked.
  - Outbound queue broadcast messages contain zero PII (`QueueUpdateMessage`).
- [x] Rate limiting enabled on authentication endpoints via Bucket4j with LRU cache eviction and `Retry-After`.
- [x] Non-root container runtime (`USER caresync:caresync`, UID 10001).

---

## 6. Rollback & Disaster Recovery Runbook

### Scenario A: Backend Application Deployment Rollback
Docker Compose does not provide a native `rollback` subcommand. In production, atomic rollbacks are executed using tagged container images and Docker Compose's `--no-build` flag:

1. **Tag-Based Rollback Execution:**
   - Every production release must be built and tagged with its semantic release version or Git commit SHA:
     ```bash
     docker build -t caresync-backend:v1.0.1 ./backend
     ```
   - In `docker-compose.prod.yml`, the backend service references `image: ${CARESYNC_BACKEND_IMAGE:-caresync-backend:latest}`.
   - To immediately roll back to the previous stable backend release without rebuilding:
     ```bash
     CARESYNC_BACKEND_IMAGE=caresync-backend:v1.0.0 docker compose -f docker-compose.prod.yml up -d --no-build backend
     ```
   - Alternatively, update `CARESYNC_BACKEND_IMAGE=caresync-backend:v1.0.0` in the environment (`.env`) and execute:
     ```bash
     docker compose -f docker-compose.prod.yml up -d --no-build backend
     ```
   - Docker Compose performs an in-place container recreation, redirecting traffic to the previous healthy container image with minimal service disruption.
   - *(Note: For Kubernetes environments, the equivalent declarative command is `kubectl rollout undo deployment/caresync-backend`).*

### Scenario B: Frontend SPA Rollback
The React frontend is served as static assets from `./frontend/dist` via Nginx:
1. **Directory-Level Rollback:**
   - In production CI/CD pipelines, previous build artifacts must be archived (e.g. `./frontend/dist-v1.0.0`, `./frontend/dist-v1.0.1`).
   - To revert the frontend SPA:
     ```bash
     rm -rf ./frontend/dist && cp -r ./frontend/dist-v1.0.0 ./frontend/dist
     docker exec caresync-nginx-prod nginx -s reload
     ```
   - Because `index.html` is configured with `Cache-Control: no-cache, no-store, must-revalidate`, user browsers immediately pick up the reverted frontend entry point upon page reload.
   - Fingerprinted JS chunks in `/assets/` have immutable caching and remain available in the archive for any active client sessions.

### Scenario C: Version Compatibility & Forward-Only Migration Rules
1. **API & Frontend Version Coupling:**
   - In CareSync's same-origin architecture (`https://hospital.caresync.health`), the frontend Axios client and backend REST API share the same origin and contract (`docs/openapi.yaml`).
   - If rolling back the backend alone, ensure that the running frontend version does not depend on newly added API fields or endpoints.
2. **Database Migration Rollback Limitations:**
   - **Strict Rule:** Flyway migrations (`V1` through `V12`) are forward-only and append-only. Historical migration scripts must **never** be edited or deleted.
   - Automatic schema downgrades (`flyway undo`) are not supported in open-source Flyway.
   - If a backend rollback involves a schema change, the application must be designed using the **Expand/Contract (Parallel Run)** database pattern:
     - New columns and tables must be nullable or have safe defaults so that the prior backend release can continue functioning without failure.
     - Destructive column removals or schema changes must never be deployed in the same release as application code.

### Scenario D: Database Failure & Disaster Recovery
1. **Migration Validation Failure on Startup:**
   - If Flyway fails to validate checksums or execute a migration on startup, the application fails fast (`flyway.validate-on-migrate: true`), preventing inconsistent runtime states.
   - Inspect Flyway table `flyway_schema_history` and PostgreSQL container logs:
     ```bash
     docker logs caresync-postgres-prod
     ```
2. **Point-In-Time Backup Restoration Drill:**
   - Before any production upgrade or deployment, generate a verified point-in-time custom-format backup:
     ```bash
     docker exec caresync-postgres-prod pg_dump -U caresync -Fc caresync > ./backups/pre_upgrade_backup_$(date +%Y%m%d_%H%M%S).dump
     ```
   - If a database recovery is required:
     ```bash
     docker compose -f docker-compose.prod.yml stop backend
     docker exec -i caresync-postgres-prod pg_restore -U caresync --clean --if-exists -d caresync < ./backups/pre_upgrade_backup.dump
     docker compose -f docker-compose.prod.yml up -d backend
     ```
3. **Restoration Verification Drill:**
   - Regular restoration drills verified against isolated database `caresync_isolated_restore_test` using `backups/caresync_backup.dump`.
   - Verified 23 tables, Flyway migrations `V1`–`V12`, and 100% record parity without impacting live data.

---

## 7. Sign-Off & Production Authorization

**Phase 25 Status:** **`PASS – Ready for Deployment, External Deployment Not Verified`**  
**Phase 25.1 Status:** **`PASS – Local Nginx Configuration Verified; Public Deployment Not Verified`**

*Note on Deployment Boundary:* Local infrastructure, containerization, database migrations, security hardening, WebSocket authorization, Nginx reverse proxy routing (same-origin, edge security headers, SPA fallback, Actuator blocking), and all automated test suites (Surefire, Failsafe, Vitest, live E2E smoke tests, Nginx 24-scenario test harness) are 100% verified. Public cloud DNS, public TLS certificate acquisition via Certbot, and offsite cloud vault storage remain operational tasks for cloud provisioning engineers upon live network release.

| Role | Verification Scope | Status | Result |
| :--- | :--- | :---: | :---: |
| **Backend & Security Lead** | WebSocket Auth, JWT, RTR, RBAC, IDOR, Error Schema | APPROVED | 136/136 Tests Passed |
| **Frontend Lead** | Vite Build (128 KB), Vitest Suites, ESLint, React Router | APPROVED | 171/171 Tests Passed |
| **QA Automation Lead** | 20-Step Live Smoke Test, Live STOMP Harness | APPROVED | 20/20 Steps Passed |
| **DevOps / SRE Lead** | Dockerfiles, Compose Prod, Nginx TLS Conf, Backup Drill | APPROVED | Drill & Config Verified |
| **Reverse Proxy & Edge Lead**| Phase 25.1 Nginx TLS, Same-Origin, Snippet Headers | APPROVED | 24/24 Scenarios Passed |
