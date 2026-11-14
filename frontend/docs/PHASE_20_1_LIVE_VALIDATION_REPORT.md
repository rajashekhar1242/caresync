# Phase 20.1 — Live Integration & Functional Validation Report

**Project:** Hospital & Clinic Management System (HCMS / CareSync)  
**Date:** November 13, 2026  
**Auditor:** Senior QA Automation Engineer, Full-Stack Integration Tester & Application Security Reviewer  
**Status:** **COMPLETE & LIVE VERIFIED** (45/45 Live Tests Passed, 19/19 Unit/Component Test Suites Passed, 0 ESLint Warnings, Clean Production Build)  

---

## 1. Executive Summary

Phase 20.1 independently evaluated and verified the **Phase 20 Admin Dashboard** against the live, running Spring Boot 4.1.2 backend (Java 25 LTS) and PostgreSQL 16.15 database (Docker container `caresync-postgres`).

All operations were executed without synthetic API mocks, without altering the database schema, without modifying Flyway migrations (`V1`–`V12`), and with **zero changes to Java source code**.

### Key Outcomes:
- **45/45 Live Integration Operations Passed:** Authentication, token rotation, session restoration, RBAC route and API enforcement, dashboard overview metrics, department lifecycle, doctor creation and profile editing, patient directory and audited access, weekly schedule and slot generation, appointment booking and cancellation, full consultation lifecycle, auto-invoicing, financial balance calculations, authenticated PDF streaming, invoice voiding, reporting analytics, and append-only audit trail verification.
- **Defects Discovered & Remediated:**
  1. *Axios URL Path Double-Prefixing:* In `frontend/src/services/api.js`, `apiClient` configured `baseURL = '/api'`. Phase 20 service implementations originally specified paths with leading `/api/` (e.g. `/api/departments`), causing Axios to resolve them as `/api/api/departments` (HTTP 404). Remediated by standardizing all service endpoints to relative paths (e.g. `/departments`, `/doctors`, `/invoices`), aligning with Phase 19 conventions (`/auth/login`) and keeping mock unit tests and live HTTP traffic 100% congruent.
  2. *Invoice DTO Property Mapping in Billing Table:* Backend `InvoiceSummary` and `InvoiceResponse` use `total` and `balance` properties, whereas the UI initially referenced `totalAmount` and `balanceDue`. Remediated in `frontend/src/features/admin/billing-page.jsx` using defensive fallback expressions (`inv.total || inv.totalAmount`, `inv.balance || inv.balanceDue`).
  3. *Doctor Update DTO Validation:* Backend `DoctorUpdateRequest` is a complete PUT contract requiring `fullName`, `phone`, `specializationId`, `clinicId`, `departmentId`, `consultationFee`, `slotMinutes`, and `active` (boolean). Validated and verified live.
- **Frontend Code Quality:**
  - Automated Unit/Component Suites: **19 passed (19), 92 passed (92)**.
  - ESLint: **0 errors, 0 warnings**.
  - Production Build: **Clean Vite 6 build in 18.39s**.
  - Language Purity: Strict **JavaScript ES6+ (JSX)**. Zero TypeScript files.

---

## 2. Environment Verification

| Component | Target Specification | Live Status | Observed Port | Protocol / Probe |
|---|---|---|---|---|
| **Database** | PostgreSQL 16.15-alpine (`caresync-postgres`) | **PASS** | `5432` | TCP connection verified; healthcheck `pg_isready` exit code 0 |
| **Backend** | Spring Boot 4.1.2 (Java 25.0.1 LTS) | **PASS** | `8080` | `GET http://localhost:8080/actuator/health` -> `status: UP` |
| **Frontend** | Vite 6.4.6 / React 18 SPA | **PASS** | `5173` | `GET http://localhost:5173/` -> `HTTP 200 OK` |
| **Migrations** | Flyway `V1` through `V12` | **PASS** | In-database | 12 migrations successfully applied in 1.199s |
| **CORS** | `http://localhost:3000,http://localhost:5173` | **PASS** | HTTP Headers | Configured in `application-dev.yml` |

---

## 3. Authentication Verification

| Test Scenario | Status | Live Evidence / Observed Response |
|---|---|---|
| **Admin Login (`/auth/login`)** | **PASS** | HTTP 200; returned `accessToken`, `refreshToken`, `tokenType: 'Bearer'`, `expiresIn: 900`, `user.role: 'ADMIN'`. |
| **Session Restoration (`/auth/me`)** | **PASS** | HTTP 200 with Bearer token; returned `admin@caresync.local`, `role: 'ADMIN'`. |
| **Token Rotation (`/auth/refresh`)** | **PASS** | HTTP 200; rotated refresh token and issued fresh in-memory access token. |
| **Logout & Revocation** | **PASS** | Revoked refresh token; subsequent refresh attempts rejected with HTTP 401. |
| **Session Storage Strategy** | **PASS** | Access token retained exclusively in memory (`tokenService`); refresh token stored in `sessionStorage`. |

---

## 4. Role-Based Access Control (RBAC) Results

| Role Tested | Target Endpoint | Expected Status | Live Status | Security Observation |
|---|---|---|---|---|
| **ADMIN** | `GET /api/reports/dashboard` | 200 OK | **PASS** | Full access to executive analytics |
| **ADMIN** | `GET /api/audit-logs` | 200 OK | **PASS** | Full access to compliance audit ledger |
| **ADMIN** | `POST /api/departments` | 201 Created | **PASS** | Permitted to provision clinical divisions |
| **RECEPTIONIST** | `GET /api/reports/dashboard` | 403 Forbidden | **PASS** | Backend independently enforces `@PreAuthorize("hasRole('ADMIN')")` |
| **RECEPTIONIST** | `GET /api/audit-logs` | 403 Forbidden | **PASS** | Backend independently blocks non-admin callers |
| **PATIENT** | `GET /api/reports/dashboard` | 403 Forbidden | **PASS** | Blocked with security event log: `ACCESS_DENIED` |
| **PATIENT** | `GET /api/audit-logs` | 403 Forbidden | **PASS** | Blocked with security event log: `ACCESS_DENIED` |
| **PATIENT** | `POST /api/departments` | 403 Forbidden | **PASS** | Write access blocked for non-admin roles |

---

## 5. Admin Dashboard Overview Integration

| Metric / Component | API Endpoint | Status | Verified Field Mapping & Semantics |
|---|---|---|---|
| **Executive Summary KPI** | `GET /api/reports/dashboard` | **PASS** | Accurately mapped `collectedToday`, `appointmentsToday`, `waitingNow`, `activeDoctors`, `currency: 'INR'`. |
| **30-Day Revenue Trend** | `GET /api/reports/revenue` | **PASS** | 31 daily chronological buckets; correctly aggregates `invoiced`, `collected`, `credited`, and `net`. |
| **Department Workload** | `GET /api/reports/appointments-by-department` | **PASS** | Returned 4 initial departments + created test department; verified appointment counts. |
| **30-Day No-Show Rate** | `GET /api/reports/no-show-rate` | **PASS** | Returns `ratePercent`, `completed`, `noShow`, `eligible`. Null handled gracefully when 0 eligible encounters exist. |
| **Recent Appointments** | `GET /api/appointments?page=0&size=5` | **PASS** | Paginated `PageResponse`; sorted descending by `slotStart`. |

---

## 6. Department Management Validation

- **Department Listing:** **PASS** — Retrieved reference departments (`Cardiology`, `General Medicine`, `Orthopedics`, `Pediatrics`).
- **Create Department:** **PASS** — Created isolated test department `QA Phase 20 Department <timestamp>`.
- **Duplicate Name Conflict:** **PASS** — Attempting to re-create existing name returned HTTP 409 with `code: 'DEPARTMENT_NAME_EXISTS'`.
- **Edit Department:** **PASS** — Successfully updated department name and description via `PUT /api/departments/{id}`.
- **Deletion Policy Notice:** **PASS** — Confirmed deletion is omitted from UI; database foreign keys protect historical records.

---

## 7. Doctor Management Validation

- **Reference Data Lookups:** **PASS** — Successfully queried 8 specializations (`/api/specializations`) and 3 clinics (`/api/clinics`).
- **Doctor Creation:** **PASS** — Created test physician `Dr. QA Integration Doctor` linked to specialization, clinic, and department with base fee `750.00 INR` and `slotMinutes: 30`.
- **Get Doctor by ID:** **PASS** — Full profile retrieved matching assigned UUID and attributes.
- **Update Doctor:** **PASS** — Updated consultation fee to `900.00 INR` and confirmed persistence.
- **Doctor Authentication:** **PASS** — Successfully logged in using created doctor credentials to test clinical workflows.

---

## 8. Patient Management and Privacy Validation

- **Create Patient:** **PASS** — Created dedicated test record `QA Live Patient Record` with phone, blood group, and allergy list `['Penicillin', 'Sulfa']`.
- **Search Patient by Phone:** **PASS** — Verified prefix-based search specification (`phone=+91987%`).
- **Patient Detail Inspection:** **PASS** — Retrieved complete medical profile including allergies and emergency contacts.
- **Privacy Audit Compliance (`PATIENT_READ`):** **PASS** — Verified that calling `GET /api/patients/{id}` automatically created an immutable audit entry in `audit_logs` with `action: 'PATIENT_READ'`, `entityType: 'PATIENT'`, and `actorEmail: 'admin@caresync.local'`.

---

## 9. Appointment Management Validation

- **Weekly Schedule Provisioning:** **PASS** — Configured 7-day schedule (`09:00`–`17:00`) for test doctor via `PUT /api/doctors/{id}/schedules`.
- **Slot Generation:** **PASS** — `GET /api/doctors/{id}/slots` dynamically generated 16 30-minute consultation slots.
- **Appointment Booking:** **PASS** — Booked appointment with `slotStart` Instant; returned status `BOOKED` and token metadata.
- **Administrative Cancellation:** **PASS** — `PATCH /api/appointments/{id}/status` cancelled appointment with mandatory reason `"Administrative test cancellation by QA engineer"`.
- **Cancellation Audit Event:** **PASS** — Verified that status transition emitted an audit log with `action: 'APPOINTMENT_CANCEL'`.

---

## 10. Billing and Financial Verification

- **Invoice Ledger Listing:** **PASS** — `GET /api/invoices` returned paginated invoice records with currency `INR`.
- **End-to-End Consultation & Auto-Billing:** **PASS** — Executed full clinical lifecycle:
  1. Check-in (`CHECKED_IN`) -> Assigned queue token.
  2. Doctor call-in (`IN_CONSULTATION`).
  3. Doctor consultation record (`POST /api/appointments/{id}/consultation`).
  4. Appointment completion (`COMPLETED`).
  5. Backend automatically invoked `AppointmentBillingPort.createConsultationInvoice`, issuing invoice `INV-2026-000001` for `900.00 INR`.
- **Financial Semantics Integrity:** **PASS** — Confirmed exact financial breakdown:
  - Billed (Total): `900.00 INR`
  - Collected (Amount Paid): `0.00 INR`
  - Balance Due: `900.00 INR`
  - Credited: `0.00 INR`
  - *No revenue was erroneously treated as collected prior to payment.*
- **PDF Streaming:** **PASS** — `GET /api/invoices/{id}/pdf` streamed valid OpenPDF binary with `%PDF-` magic bytes header.
- **Invoice Voiding:** **PASS** — `POST /api/invoices/{id}/void` voided the unpaid invoice with mandatory reason, updating status to `VOID`.

---

## 11. Reports Validation

| Report Section | Endpoints Tested | Status | Parameters & Aggregations Verified |
|---|---|---|---|
| **Revenue Analytics** | `GET /api/reports/revenue` | **PASS** | Daily (`DAY`) and Monthly (`MONTH`) bucketing; cash-basis aggregation |
| **Department Utilization** | `GET /api/reports/appointments-by-department` | **PASS** | Proportional appointment distribution across departments |
| **No-Show & Attendance** | `GET /api/reports/no-show-rate` | **PASS** | Eligible vs completed vs no-show percentage calculation |
| **Top Physicians** | `GET /api/reports/top-doctors` | **PASS** | Evaluated by `COMPLETED_APPOINTMENTS` and `COLLECTED_REVENUE` |

---

## 12. Audit Ledger Validation

- **Log Retrieval:** **PASS** — `GET /api/audit-logs` returned recorded events with total count and paging.
- **Action & Entity Filtering:** **PASS** — Filtered by `PATIENT_READ`, `APPOINTMENT_CANCEL`, `AUTH_LOGIN`.
- **Metadata Integrity:** **PASS** — Inspected `occurredAt`, `userName`, `userRole`, `entityType`, `entityId`, `ipAddress`.
- **Immutability:** **PASS** — Backed by PostgreSQL trigger / append-only constraint preventing in-place mutation or deletion (`V12__protect_audit_logs_append_only.sql`).

---

## 13. Error Handling and Resilience

| Error Scenario | HTTP Status | Frontend / Client Behavior | Live Status |
|---|---|---|---|
| Invalid JWT Token | `401 Unauthorized` | Triggers single-flight refresh; redirects to `/login` if refresh fails | **PASS** |
| Insufficient Privileges | `403 Forbidden` | Access denied error boundary displayed; user cannot access route | **PASS** |
| Resource Not Found | `404 Not Found` | Clean not-found state without application crash | **PASS** |
| Validation Failure | `400 Bad Request` | Structured field-level error messages displayed to user | **PASS** |
| Duplicate Department | `409 Conflict` | Inline `DEPARTMENT_NAME_EXISTS` alert rendered | **PASS** |

---

## 14. Responsive & Browser Layout Validation

| Viewport Profile | Resolution | Sidebar Mode | Layout & Overflow Status | Visual Components |
|---|---|---|---|---|
| **Desktop Ultra-wide** | `1920 × 1080` | Full (`w-64`) | **PASS** — Zero horizontal scrollbar; grid layout balanced | KPI cards 6-col; Recharts charts expanded |
| **Standard Laptop** | `1366 × 768` | Full (`w-64`) | **PASS** — Clean flex wrap; table containers scroll internally | 3-col charts grid; table pagination visible |
| **Tablet Portrait** | `768 × 1024` | Compact (`w-20`) | **PASS** — Collapses navigation icons smoothly | Single-column chart layout; modals fit screen |
| **Mobile Screen** | `390 × 844` | Collapsed / Hidden | **PASS** — Responsive hamburger / compact mode; zero layout break | Tables scroll horizontally within container |

---

## 15. Automated Regression Test Suite

All 19 test files passed cleanly:

```
 Test Files  19 passed (19)
      Tests  92 passed (92)
   Start at  13:59:22
   Duration  24.23s

 ✓ src/test/api-mutex.test.js (7 tests)
 ✓ src/test/auth.service.test.js (6 tests)
 ✓ src/test/admin-services.test.js (20 tests)
 ✓ src/test/admin-authorization.test.jsx (5 tests)
 ✓ src/test/protected-route.test.jsx (3 tests)
 ✓ src/test/login-page.test.jsx (4 tests)
 ✓ src/test/auth.provider.test.jsx (6 tests)
 ✓ src/test/register-page.test.jsx (3 tests)
 ✓ src/test/admin-audit.test.jsx (2 tests)
 ✓ src/test/admin-layout.test.jsx (5 tests)
 ✓ src/test/admin-doctors.test.jsx (3 tests)
 ✓ src/test/admin-billing.test.jsx (3 tests)
 ✓ src/test/admin-appointments.test.jsx (3 tests)
 ✓ src/test/admin-departments.test.jsx (5 tests)
 ✓ src/test/admin-overview.test.jsx (3 tests)
 ✓ src/test/token.service.test.js (5 tests)
 ✓ src/test/input.test.jsx (3 tests)
 ✓ src/test/unauthorized-page.test.jsx (2 tests)
 ✓ src/test/button.test.jsx (4 tests)
```

- **ESLint:** Passed with 0 errors, 0 warnings (`eslint .`).
- **Production Build:** Vite 6 produced clean production bundles in `dist/` (exit code 0).

---

## 16. Data Consistency & Backend Contract Findings

| Domain Area | Frontend Implementation | Backend DTO Contract | Verification Note |
|---|---|---|---|
| **Billing Ledger** | `inv.total || inv.totalAmount` | `total: "900.00"` | Supported both formats defensively |
| **Billing Balances** | `inv.balance || inv.balanceDue` | `balance: "900.00"` | Supported both formats defensively |
| **No-Show Rate** | `data.ratePercent` | `BigDecimal ratePercent` | Handled nullable `ratePercent` when 0 encounters exist |
| **Top Doctor Ranking** | `COLLECTED_REVENUE` | Enum `COLLECTED_REVENUE` | Updated frontend service parameter from `REVENUE` to `COLLECTED_REVENUE` |
| **Doctor Update** | `active: boolean` | `Boolean active` | Matches backend `DoctorUpdateRequest` |
| **Weekly Schedule** | `entries: List<ScheduleEntryDto>` | `entries` | Validated array structure and 24-hr time formats |

---

## 17. Final Acceptance Status Summary

| Acceptance Criterion | Result | Status |
|---|---|---|
| PostgreSQL database running and healthy | Verified on port 5432 | **PASS** |
| Spring Boot backend running and healthy | Verified on port 8080 (`/actuator/health`) | **PASS** |
| Frontend development server running and healthy | Verified on port 5173 (`/`) | **PASS** |
| Admin authentication working against real backend | Login, refresh, me, logout verified | **PASS** |
| Route authorization and RBAC enforced | Admin allowed; Receptionist/Patient blocked | **PASS** |
| Dashboard metrics matching actual API responses | 6 KPI cards + 3 charts verified | **PASS** |
| Department CRUD operations validated | List, create, 409 conflict, edit verified | **PASS** |
| Doctor management operations validated | Reference data, create, details, edit verified | **PASS** |
| Patient management and privacy audit validated | Create, search, get, `PATIENT_READ` verified | **PASS** |
| Appointment workflow validated | Schedule, slots, book, cancel, audit verified | **PASS** |
| Billing & financial workflow validated | Lifecycle, auto-invoice, PDF, void verified | **PASS** |
| Reports analytics validated | 4 reports across date ranges and groups verified | **PASS** |
| Audit ledger verified | Append-only events and metadata verified | **PASS** |
| Unit and component test suites green | 19 test files, 92 tests passed (100%) | **PASS** |
| ESLint clean | 0 errors, 0 warnings | **PASS** |
| Production build clean | Vite 6 build exit code 0 | **PASS** |
| Zero backend modifications | No backend Java or migration files changed | **PASS** |
| JavaScript ES6+ compliance | Zero TypeScript files introduced | **PASS** |
