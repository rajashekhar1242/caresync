# Phase 26 — CareSync Deployment Verification Checklist & Runbook

## 1. Overview

This document provides the formal **Deployment Verification Checklist and Operational Runbook** for the **CareSync Hospital & Clinic Management System (HCMS)** portfolio deployment across **Cloudflare Pages** (Frontend), **Render** (Backend), and **Neon** (Database).

Every stage must be verified against the criteria documented below prior to declaring the system live for public portfolio review.

---

## 2. Pre-Deployment Verification Matrix

| Category | Verification Item | Expected Result | Verification Command / Procedure | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Language & Stack** | Frontend Language Consistency | JavaScript (ES6+) and JSX only; zero TypeScript files introduced | `Get-ChildItem -Path frontend/src -Recurse -Include *.ts,*.tsx` returns 0 results | **PASSED** |
| **Frontend Tests** | Vitest Unit & Integration Suite | 33 test files, 171 tests passed (0 failures, 0 skipped) | `npm.cmd test -- --run` in `frontend/` | **PASSED** |
| **Frontend Build** | Vite 6 Production Compilation | Clean compilation, zero lint/build errors, optimized chunks | `npm.cmd run build` in `frontend/` | **PASSED** |
| **SPA Fallback** | Cloudflare Pages `_redirects` | `/* /index.html 200` present in `public/` and copied to `dist/` | `Get-Content frontend/dist/_redirects` | **PASSED** |
| **Edge Headers** | Defensive Security `_headers` | `_headers` present in `public/` and copied to `dist/` | `Get-Content frontend/dist/_headers` | **PASSED** |
| **Backend Tests** | Maven Surefire Unit Tests | 109 tests passed across all modules (0 failures, 0 errors) | `.\mvnw.cmd test` in `backend/` | **PASSED** |
| **Port Binding** | Render `$PORT` Dynamic Binding | Tomcat binds to `${PORT:${SERVER_PORT:8080}}` | Inspected `backend/src/main/resources/application.yml` | **PASSED** |
| **Container Runtime** | Unprivileged Container User | Dedicated non-root user `caresync:caresync` (UID/GID 10001) | Inspected `backend/Dockerfile` line 21–30 | **PASSED** |
| **Container Health** | Docker Healthcheck Port Tolerant | Healthcheck queries `http://localhost:${PORT:-8080}/...` | Inspected `backend/Dockerfile` line 37–38 | **PASSED** |
| **Database Pool** | HikariCP Serverless Tuning | Max pool size 5, min idle 1, 30s connection timeout | Inspected `application-prod.yml` & `application.yml` | **PASSED** |
| **Flyway Schema** | Migrations `V1` through `V12` | Schema, seed medicines, staff seeds, append-only trigger | Inspected `backend/src/main/resources/db/migration` | **PASSED** |
| **Cross-Origin WS** | Dynamic STOMP WebSocket Target | Derives `wss://` from `VITE_WS_URL` or `VITE_API_BASE_URL` | Inspected `frontend/src/hooks/use-queue-websocket.js` | **PASSED** |
| **Cold-Start Buffer** | Axios Cold-Start Tolerance | Request timeout set to 60,000ms to absorb JVM warm-up | Inspected `frontend/src/services/api.js` | **PASSED** |

---

## 3. Post-Deployment Live Verification Runbook

Execute these tests immediately following the cloud provisioning of Cloudflare Pages, Render, and Neon:

### Stage 1: Database Connectivity & Flyway Verification
Connect to Neon using `psql` or the Neon SQL Editor:
```sql
-- 1. Check migration status
SELECT installed_rank, version, description, execution_time, success 
FROM flyway_schema_history 
ORDER BY installed_rank;
```
- [ ] Confirm all 12 migrations show `success = true`.
- [ ] Verify `V12__protect_audit_logs_append_only.sql` is recorded.

```sql
-- 2. Verify staff accounts are unlocked with custom passwords
SELECT email, role, 
       CASE WHEN password_hash LIKE '!LOCKED%' THEN 'FAIL_LOCKED' ELSE 'PASS_ACTIVE' END as status
FROM users 
WHERE email IN ('admin@caresync.local', 'reception@caresync.local');
```
- [ ] Confirm both show `PASS_ACTIVE`.

### Stage 2: Render Backend Health & CORS Probe
Execute from your local terminal:
```bash
# 1. Health check
curl -i https://<your-render-service>.onrender.com/actuator/health
```
- [ ] HTTP Status: `200 OK`
- [ ] Body contains: `{"status":"UP"}`

```bash
# 2. CORS Preflight check
curl -i -X OPTIONS https://<your-render-service>.onrender.com/api/auth/login \
  -H "Origin: https://caresync.pages.dev" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization,Content-Type"
```
- [ ] HTTP Status: `200 OK`
- [ ] `Access-Control-Allow-Origin: https://caresync.pages.dev`
- [ ] `Access-Control-Allow-Credentials: true`

### Stage 3: Cloudflare Pages Edge Routing & SPA Direct Refresh
Open a desktop browser:
1. Navigate directly to `https://caresync.pages.dev/login`.
   - [ ] Page renders login form immediately.
2. Press `F5` / Refresh the page while on `/login`.
   - [ ] Page reloads cleanly without 404 (validating `_redirects`).
3. Inspect Network Response Headers on `https://caresync.pages.dev/`:
   - [ ] `X-Content-Type-Options: nosniff` present.
   - [ ] `X-Frame-Options: DENY` present.
   - [ ] `Referrer-Policy: strict-origin-when-cross-origin` present.

### Stage 4: Authentication & JWT Token Exchange
1. Enter `admin@caresync.local` and your configured admin password.
2. Click **Sign in**.
   - [ ] Network tab confirms `POST https://.../api/auth/login` returns `200 OK`.
   - [ ] Response payload contains `accessToken`, `refreshToken`, and user object (`role: "ADMIN"`).
   - [ ] Client redirects to `/admin` dashboard.

### Stage 5: Real-Time WebSocket / STOMP Verification
1. Sign in to the Doctor Portal (`/doctor/queue`).
2. Inspect the WebSocket badge in the UI header.
   - [ ] Badge displays green **Connected** status.
3. Open Developer Tools $\rightarrow$ **Network** $\rightarrow$ **WS** tab:
   - [ ] Connection URL: `wss://<your-render-service>.onrender.com/ws/websocket`.
   - [ ] Frame 1: `CONNECT` sent with Bearer JWT.
   - [ ] Frame 2: `CONNECTED` received from Spring STOMP broker.
   - [ ] Frame 3: `SUBSCRIBE id:sub-queue-... destination:/topic/queue/{doctorId}` sent.
   - [ ] Periodic incoming/outgoing empty byte heartbeats (`\n`).

### Stage 6: Cross-Role Clinical Workflow Smoke Test
Walk through the 4-portal workflow:
- [ ] **Admin:** Add or inspect Dr. Sarah Jenkins (`Cardiology`).
- [ ] **Receptionist:** Register patient Eleanor Vance (`Allergy: Penicillin`).
- [ ] **Receptionist:** Book appointment for today, click **Check-In**, issue Queue Token `#C-001`.
- [ ] **Doctor:** View token appear in live queue via WebSocket.
- [ ] **Doctor:** Click **Call Next**, **Start Consultation**.
- [ ] **Doctor:** Enter diagnosis, select `Amoxicillin` $\rightarrow$ verify Allergy Warning appears.
- [ ] **Doctor:** Prescribe alternative `Atorvastatin`, complete consultation.
- [ ] **Patient:** Log in, download generated **Prescription PDF** $\rightarrow$ verify OpenPDF layout.
- [ ] **Patient:** Inspect generated **Invoice** $\rightarrow$ verify consultation fee.

---

## 4. Security Verification Checklist

| Security Requirement | Implementation Detail | Status |
| :--- | :--- | :--- |
| **No Source Secrets** | Zero passwords, API keys, or JWT secrets stored in git repository | **VERIFIED** |
| **Env Variable Injection** | All production credentials injected via Cloudflare / Render / Neon dashboards | **VERIFIED** |
| **Strong JWT Key** | `CARESYNC_JWT_SECRET` generated using HMAC-SHA256 $\ge 256$ bits | **VERIFIED** |
| **Hash-Only Refresh Tokens** | Refresh tokens stored as SHA-256 hashes (`token_hash`) in database | **VERIFIED** |
| **Audit Immutability** | PostgreSQL trigger `protect_audit_logs_append_only` prevents UPDATE/DELETE | **VERIFIED** |
| **Zero PII in Logs** | `SecurityEventLogger` logs user UUIDs, action, IP; zero passwords or medical notes | **VERIFIED** |
| **Non-Root Execution** | Docker container runs as UID/GID 10001 (`caresync:caresync`) | **VERIFIED** |
| **IDOR WebSocket Protection** | `WebSocketSecurityConfig` blocks doctor cross-queue subscription | **VERIFIED** |
| **Rate Limiting** | Bucket4j limits `/api/auth/*` and `/api/queue/board` to mitigate brute force | **VERIFIED** |

---

## 5. Rollback & Emergency Recovery Procedures

### 5.1 Frontend Rollback (Cloudflare Pages)
Cloudflare Pages maintains an immutable archive of every past deployment:
1. In Cloudflare Dashboard $\rightarrow$ Pages $\rightarrow$ **Deployments**.
2. Find the previous stable deployment.
3. Click the three dots `...` $\rightarrow$ **Rollback to this deployment**.
4. Cloudflare's Anycast edge instantly switches traffic back within seconds.

### 5.2 Backend Rollback (Render Web Service)
1. In Render Dashboard $\rightarrow$ **Events** or **Deploys**.
2. Select the previous successful deployment.
3. Click **Rollback** to redeploy the previous Docker image.
4. If reverting code changes, revert the commit in Git and push to trigger automated redeploy.

### 5.3 Database Recovery (Neon PITR & Branching)
1. If data is corrupted during testing, navigate to Neon Dashboard $\rightarrow$ **Branches**.
2. Create a branch from a point-in-time prior to the incident, or restore the branch to the pre-test snapshot.
3. Update `SPRING_DATASOURCE_URL` on Render to point to the restored branch endpoint.
