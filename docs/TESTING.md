# CareSync HCMS — Testing & Quality Assurance Guide

This document details the automated testing architecture, test suites, verified test counts, reproduction instructions, and performance verification methodology for **CareSync HCMS**.

---

## 1. Quality Assurance Philosophy & Test Pyramid

CareSync enforces a rigorous multi-tiered verification strategy designed for mission-critical healthcare applications:

```text
               ▲
              / \
             /   \      Performance Benchmarks (k6/Node)
            /     \     - Concurrency races, Auth stress, 10k+ DB scale
           /───────\
          /         \    End-to-End Live Workflow Verification
         /           \   - Multi-role browser runs (Admin, Receptionist, Doctor, Patient)
        /─────────────\
       /               \  Integration Testing (Spring Boot + Testcontainers PostgreSQL 16)
      /                 \ - Real DB constraints, Flyway migrations, STOMP WebSockets, Concurrency
     /───────────────────\
    /                     \ Frontend Component & Backend Unit Tests
   /                       \ - React Testing Library, MockMvc slices, Domain service isolation
  /─────────────────────────\
```

---

## 2. Verified Test Metrics Summary

All test counts reflect verified execution evidence:

| Test Layer | Test Runner | Files / Suites | Total Tests | Pass Rate | Execution Duration |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Backend Unit & MockMvc** | Maven Surefire | 25 | **110** | **100% (0 fail, 0 skip)** | ~18s |
| **Backend PostgreSQL Integration** | Maven Failsafe + Testcontainers | 9 | **34** | **100% (0 fail, 0 skip)** | ~45s |
| **Frontend Unit & Component** | Vitest 2 + React Testing Library | 34 | **187** | **100% (0 fail, 0 skip)** | ~8s |
| **Security Penetration Vectors** | Node.js Security Runner | 1 | **23** | **100% (0 fail)** | ~12s |
| **Total Automated Tests** | — | **69 suites** | **354 tests** | **100% PASS** | — |

---

## 3. Backend Testing Suite

### 3.1 Unit Testing (Maven Surefire)
Focuses on pure domain logic, mathematical precision, and REST controller layer validation:
- **`MoneyUtilsTest`:** Exact fixed-scale `BigDecimal` arithmetic, zero-fee handling, and rounding mode checks.
- **`TimeZoneUtilsTest`:** Clinic IANA timezone transformations, UTC boundary conversions, and DST transitions.
- **`GlobalExceptionHandlerTest` & `ErrorResponseWriterTest`:** Structured `ErrorResponse` generation and HTTP status code mappings.
- **`RateLimitFilterTest`:** Token-bucket consumption, refill timings, and client IP extraction supporting `X-Forwarded-For`.
- **`JwtServiceTest`:** Token generation, claims extraction, expired token rejection, and signature verification.
- **Controller Unit Tests (`@WebMvcTest`):** Request validation, authorization headers, and response serialization across all 13 domains.

Execute backend unit tests:
```powershell
cd backend
.\mvnw.cmd test
```

---

### 3.2 Integration Testing with Testcontainers (Maven Failsafe)
CareSync runs all integration tests against a real, ephemeral **PostgreSQL 16** Docker container managed automatically by Testcontainers. No mock databases or in-memory H2 databases are used.

```powershell
cd backend
.\mvnw.cmd verify
```

#### Major Integration Test Suites:
1. **`QueueIT` (8 tests):**
   - STOMP `/ws` handshake authentication requiring valid JWT Bearer tokens.
   - Rejecting unapproved origins and wildcard patterns (`*`).
   - Verifying SockJS fallback endpoints.
   - Enforcing doctor queue topic isolation (Doctor A cannot read Doctor B's private queue).
   - Zero-PII public waiting-room payload delivery.
2. **`BillingIT` (7 tests):**
   - Automatic invoice creation upon appointment `COMPLETED` lifecycle transition.
   - Pessimistic locking (`PESSIMISTIC_WRITE`) during counter payment recording.
   - Partial payments, credit note balance adjustments, and invoice void guards.
3. **`AuthSecurityIT` (5 tests):**
   - Single-use Refresh Token Rotation (RTR).
   - Replay attack detection: presenting an already rotated token immediately triggers revocation of the entire token family.
   - Idempotent logout and session invalidation.
4. **`AppointmentIT` (4 tests):**
   - Concurrency guard partial unique index (`uq_appointment_slot_active`) rejecting simultaneous bookings for the same doctor slot.
   - Atomic per-doctor daily token sequencing via `DoctorDayCounter`.
   - 2-hour patient cancellation window enforcement.
5. **`ClinicalIT` (4 tests):**
   - Doctor-patient scoping enforcement (doctors can only author consultations for booked patients).
   - JSONB vitals persistence and retrieval.
6. **`DoctorIT` (2 tests):**
   - Schedule timezone persistence across IANA time zones (`Asia/Kolkata`).
   - Leave date conflict detection preventing doctor absence declarations when active appointments exist.
7. **`FlywayMigrationIT` (2 tests):**
   - Complete execution of migrations `V1` through `V12`.
   - Database trigger immutability test: asserts that `UPDATE audit_logs` and `DELETE FROM audit_logs` are intercepted and rejected by PostgreSQL trigger `protect_audit_logs_append_only`.

---

## 4. Frontend Testing Suite

The frontend test suite is executed using **Vitest 2** with `jsdom` and **React Testing Library**:

```powershell
cd frontend
npm test -- --run
```

### 4.1 Test Suite Breakdown (187 Tests across 34 Files):
- **Concurrency & Mutex (`api-mutex.test.js`):** Simulates 5 simultaneous 401 Unauthorized responses; asserts that exactly 1 refresh HTTP call is made, all 5 pending promises resolve cleanly, and no session thrashing occurs.
- **Environment Normalization (`environment-config.test.js`, 16 tests):** Validates URL sanitization, custom base path preservation (e.g. `/backend` -> `/backend/api`), deduplication of accidental trailing `/api/api`, whitespace handling, and WebSocket scheme deduction (`ws://` vs `wss://`).
- **Auth Provider & Guards (`auth.provider.test.jsx`, `protected-route.test.jsx`):** Role-based redirection, unauthenticated redirects to `/login`, and session hydration from `localStorage`.
- **Role Portals:**
  - Admin Portal: Dashboard metrics, doctor management, department forms, billing oversight, and audit logs.
  - Receptionist Portal: Patient check-in flow, appointment booking modal, live queue board, and walk-in patient registration.
  - Doctor Portal: Clinical consultation editor, vitals inputs, drug-safety warning acknowledgements, and prescription creation.
  - Patient Portal: Appointment self-booking, appointment cancellation, medical history viewing, and invoice review.

---

## 5. Security & Penetration Verification

CareSync includes an automated security audit script (`scripts/phase24-security-audit.mjs`) verifying 23 distinct attack vectors:

```powershell
node scripts/phase24-security-audit.mjs
```

### Verified Security Check Matrix:
- **RBAC Violations (7 tests):** Verified that Patients and Receptionists cannot view system audit logs or financial revenue reports (HTTP 403 Forbidden).
- **Anti-IDOR Violations (5 tests):** Verified that Patient A cannot read Patient B's profile, update Patient B's details, access Patient B's prescriptions, or download Patient B's invoice PDF.
- **Authentication Lifecycle (7 tests):** Unauthenticated requests rejected (HTTP 401), forged JWTs rejected, single-use refresh token rotation enforced, replay attacks detected, and token families revoked.
- **SQL & XSS Injection (4 tests):** Parameterized Hibernate queries neutralize SQL injection (`' OR '1'='1`); React JSX encoding neutralizes stored XSS payloads (`<script>alert(1)</script>`).

---

## 6. Performance & Load Engineering (Phase 16)

Performance benchmarks were executed using automated load scripts under `performance/`:

| Benchmark Scenario | Concurrency | Target Endpoint | Metric Achieved |
| :--- | :---: | :--- | :--- |
| **01 Baseline Read** | 50 VUs | `GET /api/reference/clinics` | **P99 < 15ms**, 0% errors |
| **02 Auth Concurrency** | 20 VUs | `POST /api/auth/login` | **P95 < 85ms** (BCrypt cost 10) |
| **03 Booking Races** | 10 VUs | `POST /api/appointments` | **100% collision safety** (1 success, 9 HTTP 409) |
| **04 Rate Limit Stress** | 30 VUs | `POST /api/auth/register` | Rate limit enforced cleanly (HTTP 429) |
| **05 WebSocket Queue Scale**| 100 STOMP clients | `/topic/queue/{doctorId}` | **Message delivery latency < 5ms** |
| **06 Database Scale** | 10,000+ records | Financial SQL Aggregations | **P95 < 45ms** via PostgreSQL indexed queries |
