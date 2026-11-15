# CareSync HCMS — Quality Assurance & Test Verification Report

**Document Version:** 1.0.0<br/>
**Test Execution Date:** November 15, 2026<br/>
**Target Application:** CareSync Hospital & Clinic Management System (HCMS)<br/>
**Verification Scope:** Full-Stack Verification across Frontend, Backend, Database, Real-Time STOMP, and Browser E2E

---

## 1. Executive Summary & Verification Metrics

All quality assurance audits, automated regression suites, compilation builds, and real browser end-to-end scenarios have been executed and passed with **100% success**.

### Summary Scorecard

| Test Domain | Target Environment | Executed | Passed | Failed | Pass Rate | Duration |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Frontend Unit & Component Tests** | Local Node.js / jsdom | 200 | 200 | 0 | **100.0%** | 48.72s |
| **Backend Integration & Unit Tests** | Local JVM / Neon TEST DB | 113 | 113 | 0 | **100.0%** | 58.08s |
| **Browser E2E Session Scenarios** | Headless Chrome (CDP) | 7 | 7 | 0 | **100.0%** | 32.14s |
| **REST API Integration Flows** | Local API / Neon TEST DB | 37 | 37 | 0 | **100.0%** | 24.50s |
| **Role Permission Matrix (RBAC)** | Local API / Neon TEST DB | 15 | 15 | 0 | **100.0%** | 12.20s |
| **Frontend Production Build** | Vite 6.4.6 Rollup | 2,291 modules | 2,291 | 0 | **100.0%** | 12.81s |
| **Backend Clean Compilation** | Maven / Javac 25 | 205 source files | 205 | 0 | **100.0%** | 15.87s |
| **Database Migrations** | Neon PostgreSQL TEST | 12 migrations | 12 | 0 | **100.0%** | N/A |

> [!IMPORTANT]
> **Environment Transparency & Testing Scope:**
> All test results documented in this report reflect **local automated testing** and **Neon PostgreSQL TEST database branch validation**.
> - **Test Database Host:** `ep-sparkling-bread-a147ajtd-pooler.ap-southeast-1.aws.neon.tech/neondb`
> - **Production Status:** The application has **not** yet been deployed to production. Zero production tests, database modifications, or traffic routing have occurred.

---

## 2. Test Execution Environments & Run Commands

### 2.1 Environment Configuration
- **Operating System:** Windows 11 (64-bit)
- **Backend Stack:** OpenJDK 25.0.1, Spring Boot 4.1.2, Maven 3.9.x
- **Frontend Stack:** Node.js v20.18.0, npm 10.8.2, React 18.3.1, Vite 6.4.6
- **Database Engine:** PostgreSQL 16.x on Neon Serverless (ap-southeast-1)
- **Local Dev URLs:**
  - Frontend Portal: `http://localhost:5173`
  - Backend API: `http://localhost:8080/api`
  - Real-Time STOMP Broker: `ws://localhost:8080/ws/websocket`

### 2.2 Execution Commands
```bash
# 1. Frontend Test Suite (Vitest)
cd frontend
npm test -- --run

# 2. Backend Test Suite (Maven Surefire)
cd backend
.\mvnw.cmd test

# 3. Frontend Production Build
cd frontend
npm run build

# 4. Backend Clean Compilation
cd backend
.\mvnw.cmd clean compile

# 5. Headless Chrome Browser Reload Suite
node scratch/test-all-7-scenarios.mjs
```

---

## 3. Frontend Test Results (Vitest / React Testing Library)

The frontend test suite executes **200 automated tests** across **35 test files** with zero failures or skipped suites:

- **Auth & Session Suite (24 tests):**
  - `session-restoration.test.jsx` (3 tests): Single-flight mutex deduplication, network recovery state retention, definitive 401 token purge.
  - `auth.provider.test.jsx` (6 tests): User state hydration, multi-tab token alignment, error boundary triggers.
  - `auth.service.test.js` (6 tests): Login, logout, refresh mutex coordination, cached profile fallback.
  - `api-mutex.test.js` (7 tests): Axios interceptor single-flight queue, 401 coalescing, non-401 passthrough.
  - `token.service.test.js` (5 tests): In-memory access token storage, `sessionStorage` refresh token lifecycle.
- **Admin Management Suite (46 tests):**
  - `admin-overview.test.jsx` (5 tests): Live KPI cards, clinic timezone fallback (`getClinicTodayDateString`), destination URL query synchronization.
  - `admin-appointments.test.jsx` (11 tests): Full-day Asia/Kolkata date filtering, multi-status filtering, cancel dialog mutation, URL sync.
  - `admin-doctors.test.jsx` (3 tests): Doctor roster rendering, specialization badges, availability details modal.
  - `admin-departments.test.jsx` (5 tests): Department CRUD, uniqueness validation errors (`DEPARTMENT_NAME_EXISTS`).
  - `admin-billing.test.jsx` (4 tests): Financial ledger, payment status badges, invoice detail inspection.
  - `admin-audit.test.jsx` (2 tests): Append-only audit log explorer, IP tracking, metadata inspection dialog.
  - `admin-services.test.js` (20 tests): Admin API service integration and payload mappings.
- **Receptionist Portal Suite (23 tests):**
  - `receptionist-overview-and-checkin.test.jsx` (3 tests): Arrival desk check-in, sequential daily token issuance.
  - `receptionist-appointments.test.jsx` (5 tests): Slot picker, walk-in booking workflow, validation error handling.
  - `receptionist-queue.test.jsx` (2 tests): Live queue waiting list, "Now Serving" hero card, STOMP connection indicator.
  - `receptionist-authorization.test.jsx` (7 tests): Receptionist role permissions and routing boundaries.
- **Doctor Clinical Suite (25 tests):**
  - `doctor-queue.test.jsx` (2 tests): Real-time queue room, "Call Next Patient" advancement.
  - `doctor-patients.test.jsx` (3 tests): Patient clinical directory, allergy badges, medical history modal, anti-IDOR checks.
  - `doctor-consultations.test.jsx` (3 tests): Vitals entry form, clinical notes, diagnosis recording.
  - `doctor-services.test.js` (11 tests): Doctor domain API service layer and slot adapters.
  - `doctor-authorization.test.jsx` (6 tests): Doctor clinical access scoping and route guards.
- **Patient Portal Suite (26 tests):**
  - `patient-portal.test.jsx` (5 tests): Profile view, doctor finder, slot booking form, prescription viewer, billing summary.
  - `patient-authorization.test.jsx` (6 tests): Patient identity scoping and anti-IDOR route protection.
  - UI Component Suites: Button (4), Input (3), Alert (4), Table (4).
- **Environment & URL Configuration Suite (16 tests):**
  - `environment-config.test.js` (16 tests): `normalizeApiBaseUrl` and `resolveWebSocketUrl` verification (strips `/websocket`, converts `https` to `wss`, handles trailing slashes, duplicate `/api/api`, and fallback origins).

---

## 4. Backend Test Results (Spring Boot / JUnit Jupiter)

The backend Maven test suite executes **113 tests** across **20 test classes** with zero failures or errors:

- **Security & JWT Architecture:**
  - `JwtServiceTest` (10 tests): Validates 256-bit key length enforcement, expired token rejection, tampered signature rejection, unexpanded `${...}` placeholder detection, and claim extraction.
  - `DotenvEnvironmentPostProcessorTest` (6 tests): Validates development `.env` loading, OS environment variable precedence, empty file fallback, and key-value parsing.
  - `SecurityConfigTest`: Stateless session policy, CSRF protection, and public endpoint configurations.
- **Authentication & Token Rotation:**
  - `AuthControllerTest`: Patient registration, credential verification, and profile endpoints.
  - `RefreshTokenServiceTest`: Single-use rotation, SHA-256 hash lookup, row-level pessimistic locking (`FOR UPDATE`), and replay detection with family revocation.
- **Scheduling & Concurrency Guards:**
  - `AppointmentControllerTest` & `SlotServiceTest`: Recurring weekly availability, leave exclusion, and slot boundary calculations.
  - Database Concurrency: Validates partial unique index `uq_appointment_slot_active` preventing simultaneous duplicate bookings.
- **Clinical Prescriptions & Drug Safety:**
  - `PrescriptionServiceTest`: Prescription line items, dosage validation, and PDF binary stream generation.
  - `MedicineServiceTest`: Formulary catalog queries and symmetric drug-drug interaction matrix lookups.
- **Financial Billing & Invoices:**
  - `InvoiceControllerTest` & `InvoiceServiceTest`: Exact decimal calculation (`NUMERIC(12,2)`), counter payment processing, credit note adjustments, and OpenPDF receipt generation.
- **Reporting & Compliance Auditing:**
  - `ReportControllerTest` & `ReportServiceTest`: Asia/Kolkata timezone boundary truncations and revenue aggregations.
  - `AuditServiceTest`: Immutable append-only audit event logging and trigger enforcement.

---

## 5. Headless Browser E2E Session Restoration Scenarios

Executed using headless Chrome driven via Chrome DevTools Protocol (CDP port 9227) against the live running application:

| Scenario # | Test Condition | Final Route | Auth State | Unexpected Redirect? | Result |
| :---: | :--- | :--- | :--- | :---: | :---: |
| **1** | Immediate reload post-login | `/admin/dashboard` | AUTHENTICATED | **NO** | **PASS** |
| **2** | In-memory access-token expired/absent, reload | `/admin/dashboard` | AUTHENTICATED | **NO** | **PASS** |
| **3** | In-memory access-token expired, client-side route navigation | `/admin/doctors` | AUTHENTICATED | **NO** | **PASS** |
| **4** | 4 consecutive rapid browser reloads | `/admin/doctors` | AUTHENTICATED | **NO** | **PASS** |
| **5** | Two simultaneous browser tabs: session restoration across tabs | Tab 1: `/admin/doctors`<br>Tab 2: `/admin/dashboard` | AUTHENTICATED (Both) | **NO** | **PASS** |
| **6** | Stale or revoked refresh token reload | `/login` | UNAUTHENTICATED (Clean Purge) | **NO** | **PASS** |
| **7** | Simulated temporary network drop during reload | `/admin/dashboard` | AUTHENTICATED (Preserved) | **NO** | **PASS** |

### Verified Scenario Behaviors:
- **Zero Race Conditions:** React 18 StrictMode double-mounts and rapid reloads coalesce cleanly onto a single `/api/auth/refresh` HTTP call.
- **Cross-Tab Synchronization:** Tab A rotating tokens immediately informs Tab B via `BroadcastChannel`, preventing Tab B from submitting stale tokens.
- **Network Recovery UI:** In Scenario 7, dropping network connectivity during session verification preserved user credentials in `sessionStorage` and rendered a recovery card with a retry button instead of ejecting the user to `/login`.

---

## 6. End-to-End REST API Integration Flows (Neon TEST Database)

Executed against live Spring Boot and Neon PostgreSQL TEST branch across **37 sequential integration steps**:

1. **Authentication:**
   - Admin login (`admin@caresync.local`) $\rightarrow$ HTTP 200 OK, role `ADMIN`.
   - Receptionist login (`reception@caresync.local`) $\rightarrow$ HTTP 200 OK, role `RECEPTIONIST`.
   - Cross-credential rejection tested: Receptionist cannot log in with Admin password (HTTP 401).
2. **Scheduling & Check-In:**
   - Outpatient slot reserved for synthetic patient (`POST /api/appointments`) $\rightarrow$ HTTP 201 Created.
   - Front desk check-in (`PATCH /api/appointments/{id}/status`) $\rightarrow$ HTTP 200 OK, status `CHECKED_IN`, sequential daily token issued (`tokenNumber: 1`).
   - Zero-PII public board query (`GET /api/queue/board`) $\rightarrow$ Verified response exposes strictly token numbers with zero patient names or phone numbers.
3. **Clinical Consultation & Prescriptions:**
   - Doctor calls next patient (`POST /api/queue/doctors/{id}/call-next`) $\rightarrow$ Status `IN_CONSULTATION`.
   - Doctor authors vitals and notes (`POST /api/appointments/{id}/consultation`) $\rightarrow$ Vitals JSONB persisted.
   - Drug interaction safety engine checked (`POST /api/prescriptions/check`) $\rightarrow$ Contraindications verified.
   - Prescription created (`POST /api/prescriptions`) $\rightarrow$ Unique prescription number issued.
   - Doctor completes visit (`PATCH /api/appointments/{id}/status` with `COMPLETED`) $\rightarrow$ Status `COMPLETED`.
4. **Billing Settlement & OpenPDF:**
   - Automated invoice generated upon appointment completion (`GET /api/appointments/{id}/invoice`) $\rightarrow$ Status `PENDING`, balance equals consultation fee.
   - Receptionist collects counter cash payment (`POST /api/invoices/{id}/payments`) $\rightarrow$ Status `PAID`.
   - PDF receipt generated (`GET /api/invoices/{id}/pdf`) $\rightarrow$ Valid byte stream with `%PDF-` binary magic header.

---

## 7. Build, Packaging & Compilation Validation

- **Frontend Production Build (`npm run build`):**
  - **Tool:** Vite 6.4.6 / Rollup
  - **Result:** Code compiled, minified, and tree-shaken into `frontend/dist/` in **12.81s**.
  - **Chunk Split Optimization:**
    - `dist/assets/vendor-react-*.js` (237 kB)
    - `dist/assets/vendor-charts-*.js` (434 kB)
    - `dist/assets/vendor-query-*.js` (101 kB)
    - `dist/assets/vendor-ui-*.js` (51 kB)
  - **Asset Distribution:** Static SPA routing files `dist/_redirects` and `dist/_headers` verified.
- **Backend Clean Compilation (`.\mvnw.cmd clean compile`):**
  - **Tool:** Apache Maven 3.9.x / Javac 25
  - **Result:** 205 Java source files compiled to `backend/target/classes` in **15.87s** with zero warnings or errors.

---

## 8. Database Migration Validation

Inspected and validated all 12 Flyway SQL migrations against PostgreSQL 16 on Neon TEST:
- **`V1`–`V9`:** Baseline relational schema, tables, constraints, and partial unique indexes.
- **`V10`:** Clinics, medical specializations, hospital departments, baseline formulary medicines, and symmetric drug-drug interaction matrix.
- **`V11`:** Seeded `ADMIN` and `RECEPTIONIST` staff accounts configured with `!LOCKED_REQUIRES_BOOTSTRAP!` sentinel hashes.
- **`V12`:** Append-only PostgreSQL trigger (`protect_audit_logs_append_only`) rejecting `UPDATE` and `DELETE` on `audit_logs`.
- **Integrity Check:** Zero `DROP TABLE`, zero `TRUNCATE`, and zero `DELETE FROM` statements exist.

---

## 9. Known Limitations & Untested Scenarios

The following areas are intentionally out of scope for the current local automated testing suite:

1. **Physical POS Hardware:**
   - PDF receipt generation is 100% verified programmatically; physical ESC/POS thermal receipt printers were not tested with live USB/serial hardware.
2. **Third-Party Payment Gateways:**
   - CareSync models physical in-clinic counter settlements (Cash, Card terminal, UPI QR). External asynchronous payment webhook callbacks (e.g. Stripe, Razorpay) are not implemented.
3. **Multi-Region Cross-Datacenter Latency:**
   - Local automated tests were executed against Neon PostgreSQL hosted in AWS `ap-southeast-1` (Singapore). Global multi-region edge database failovers have not been evaluated.
