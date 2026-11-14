# Hospital & Clinic Management System (HCMS)

Backend platform for the **Hospital & Clinic Management System (HCMS)** — a Java 25 / Spring Boot 4 modular monolith providing clinic scheduling, live patient queues over WebSocket/STOMP, clinical consultations and prescriptions with drug-safety checks, automated billing/invoicing with PDF generation, immutable audit logging, and operational reporting.

> **Compatibility Note on Technical Identifiers:** While the product and documentation have been branded as **Hospital & Clinic Management System (HCMS)** (`spring.application.name: hcms`), underlying Java packages (`com.caresync.*`), Maven coordinates (`com.caresync:caresync-backend`), database/Docker identifiers (`caresync`, `caresync-postgres`, `caresync_pgdata`), Flyway migrations (`V1`–`V12`), configuration prefix (`caresync.*`), and environment variables (`CARESYNC_*`) are intentionally preserved for backward compatibility.

---

## 1. Overview

HCMS models outpatient hospital and multi-clinic operations across four authenticated roles (`ADMIN`, `DOCTOR`, `RECEPTIONIST`, `PATIENT`) plus a zero-PII public waiting-room queue board:

- **Clinic-timezone-aware scheduling** using clinic IANA time zones (e.g., `Asia/Kolkata`) with UTC persistence (`Instant` / PostgreSQL `timestamptz`) and DST gap/overlap handling.
- **Strict appointment lifecycle state machine** (`BOOKED -> CHECKED_IN -> IN_CONSULTATION -> COMPLETED`, `CANCELLED`, `NO_SHOW`) backed by PostgreSQL partial unique indexes and atomic per-doctor daily token counters.
- **Real-time waiting room broadcasts** via STOMP over SockJS (`/ws`, `/topic/queue/{doctorId}`) triggered post-commit with zero PII on public payloads.
- **Clinical safety & documentation** combining consultations, medicine catalog search, allergy/drug-interaction checks, immutable prescriptions, and OpenPDF prescription & invoice rendering.
- **Exact decimal billing & reporting** using `INR` fixed-scale `BigDecimal` arithmetic (`NUMERIC(12,2)`), partial counter payments, credit notes, void guards, and PostgreSQL SQL-aggregated admin dashboards.

---

## 2. Key Features

Implemented modules in the backend repository:

- **Authentication & Authorization (`com.caresync.auth`):** Patient self-registration (`POST /api/auth/register` with automatic `Patient` profile provisioning), login, single-use SHA-256 refresh token rotation with replay-detection token revocation, idempotent logout, `/api/auth/me`, and environment-driven staff account bootstrap (`!LOCKED_REQUIRES_BOOTSTRAP!` guard).
- **Immutable Audit Logging (`com.caresync.audit`):** Append-only `audit_logs` table protected by a PostgreSQL `BEFORE UPDATE OR DELETE` trigger (`V12`), synchronous transactional capture for sensitive clinical/patient/billing reads & writes, and `ADMIN` query filtering (`GET /api/audit-logs`).
- **Reference Data & Departments (`com.caresync.reference`):** Read-only seeded clinics and specializations plus `ADMIN`-managed hospital departments with case-insensitive uniqueness enforcement.
- **Doctors, Weekly Schedules & Leaves (`com.caresync.doctor`):** Transactional `User(DOCTOR)` + `Doctor` creation, active/specialization/clinic/name filtering, atomic weekly schedule replacement, leave management blocking overlap or booked appointments, and timezone-aware bookable slot calculation.
- **Patients (`com.caresync.patient`):** Walk-in patient creation, `TEXT[]` allergy storage with case-insensitive deduplication, doctor patient scoping (`EXISTS` over non-cancelled appointments), and audited profile reads (`PATIENT_READ`).
- **Appointments & State Machine (`com.caresync.appointment`):** Conflict-safe slot booking (`uq_appointment_slot_active`), atomic daily token assignment (`doctor_day_counters`), optimistic locking (`@Version`), single active consultation guard (`uq_appointment_doctor_in_consultation`), 2-hour patient cancellation window, and cross-module lifecycle hooks.
- **Live Queue & WebSocket (`com.caresync.queue`):** Doctor queue state view, atomic `call-next`, public clinic queue board (`GET /api/queue/board?clinicId=` with `Cache-Control: no-store` and zero PII), and post-commit STOMP broadcasts.
- **Consultations, Medicines & Prescriptions (`com.caresync.consultation`, `com.caresync.medicine`, `com.caresync.prescription`):** Consultation authoring/finalization by the treating doctor, medicine catalog pagination, allergy/symmetric drug-interaction safety checker (`MILD`/`MODERATE`/`SEVERE`), prescription creation with severe-warning acknowledgement check, and A4 PDF downloads.
- **Billing & Invoicing (`com.caresync.billing`):** Automatic invoice creation on appointment `COMPLETED` transition (including zero-fee auto-`PAID`), itemized additions, `PESSIMISTIC_WRITE` row locking, partial counter payments with `txnRef` uniqueness, `ADMIN` credit notes and invoice voiding, and OpenPDF invoice rendering.
- **Admin Reports & Dashboard (`com.caresync.report`):** Parameterized PostgreSQL aggregations across revenue, appointments by department, no-show rates, top doctors, and summary dashboard metrics.

*(Note: Optional deferred items documented in [docs/domain.md](docs/domain.md) — such as `/api/users` staff creation and `POST /api/appointments/{appointmentId}/invoices` — are not part of the active v0.1.0 OpenAPI contract.)*

---

## 3. System Architecture

HCMS is structured as a **single-deployment modular monolith** inside `backend/src/main/java/com/caresync/`:

```text
com.caresync
├── common          # Config properties, CORS, JWT, Bucket4j rate limiter, error handler, utils
├── auth            # Users, refresh tokens, login/register/refresh/logout, staff bootstrap
├── audit           # Append-only audit events & ADMIN search endpoint
├── reference       # Clinics, specializations, departments
├── doctor          # Doctor profiles, weekly schedules, leaves
├── patient         # Patient records, allergies, doctor-patient scoping adapter target
├── appointment     # Slot generation, booking, token counters, strict state machine
├── queue           # Live waiting room state, call-next, public board, STOMP/SockJS publisher
├── consultation    # Clinical consultation notes & Appointment consultation lifecycle adapter
├── medicine        # Read-only medicine catalog & drug interaction data
├── prescription    # Allergy/interaction safety checks, prescriptions, OpenPDF renderer
├── billing         # Auto-invoicing (AppointmentBillingPort), payments, credit notes, void, PDF
└── report          # Read-only ADMIN JDBC/SQL aggregations
```

Architectural principles:
- **Acyclic Cross-Module Communication:** Downstream hooks use explicit ports/adapters (`ProfileLinkPort`, `DoctorPatientScopePort`, `ConsultationLifecyclePort`, `AppointmentBillingPort`) and post-commit domain events (`QueueChangedDomainEvent` -> `QueueMessagePublisher`).
- **Stateless API Layer:** `spring.jpa.open-in-view: false`, `hibernate.ddl-auto: validate`, `hibernate.jdbc.time_zone: UTC`.
- **Uniform Error Envelope:** All REST & security failures serialize through `ErrorResponseWriter` / `GlobalExceptionHandler` matching OpenAPI `ErrorResponse` (`status`, `code`, `message`, `path`, `timestamp`, optional `fieldErrors`).

---

## 4. Technology Stack

| Layer | Technology / Version |
|---|---|
| Language & Runtime | Java 25 (`virtual-threads.enabled: true`) |
| Application Framework | Spring Boot `4.1.2` (Web, Security, Validation, Data JPA, WebSocket/STOMP, Actuator) |
| Database & Migrations | PostgreSQL 16 (`postgres:16-alpine`), Flyway (`flyway-database-postgresql`) `V1`–`V12` |
| Authentication | JJWT `0.13.0` (HS256 JWT + SHA-256 opaque refresh tokens), BCrypt |
| Rate Limiting | Bucket4j `8.22.0` (bounded in-memory per-IP token buckets) |
| PDF Generation | OpenPDF `3.0.5` |
| Testing | JUnit 5, Spring Boot Test (`@WebMvcTest`), Mockito, Testcontainers `2.0.5` (`PostgreSQLContainer`) |
| Build Tooling | Maven Wrapper (`backend/mvnw`, `backend/mvnw.cmd`) |

---

## 5. Security & Audit Design

- **JWT & Refresh Rotation:** 256-bit+ HMAC secret validated at startup; short-lived access JWTs (`900s` default) paired with `604800s` opaque refresh tokens stored as SHA-256 hashes. Reusing a rotated/revoked refresh token immediately revokes all active refresh tokens for that user.
- **RBAC & Ownership Enforcement:** Method-level `@EnableMethodSecurity` (`@PreAuthorize`) combined with service-layer IDOR checks for `PATIENT`, `DOCTOR`, `RECEPTIONIST`, and `ADMIN`.
- **Rate Limiting:** Bucket4j per-IP limits on `/api/auth/register` (`5/min`), `/api/auth/login` (`10/min`), `/api/auth/refresh` (`20/min`), and `/api/queue/board` (`30/min`), returning `429 RATE_LIMITED` with `Retry-After`.
- **CORS & WebSocket Security:** Explicit origin allowlist via `CARESYNC_CORS_ORIGINS` (no wildcard `*`); `WebSocketSecurityConfig` blocks all client STOMP `SEND` frames and permits `SUBSCRIBE` only to `^/topic/queue/[A-Za-z0-9-]+$`.
- **Structured Sanitized Logging:** Single-event `SECURITY_EVENTS` structured logs (`UNAUTHORIZED`, `ACCESS_DENIED`, `INVALID_CREDENTIALS`, `RATE_LIMITED`) with zero PII or credentials; `prod` profile enables ECS JSON logging and trusted reverse-proxy `forward-headers-strategy`.

---

## 6. Database Schema Overview

Managed exclusively by Flyway under `backend/src/main/resources/db/migration/` with `validate-on-migrate: true`:

| Migration | Responsibility |
|---|---|
| `V1__create_identity_tables.sql` | `users` (case-insensitive `uq_users_email_lower`), `refresh_tokens` |
| `V2__create_reference_data.sql` | `clinics` (IANA `time_zone`), `specializations`, `departments` |
| `V3__create_doctor_tables.sql` | `doctors`, `doctor_schedules`, `doctor_leaves` |
| `V4__create_patient_tables.sql` | `patients` (with PostgreSQL `TEXT[]` allergies) |
| `V5__create_appointment_tables.sql` | `appointments` (with optimistic `version`), `doctor_day_counters` |
| `V6__create_clinical_tables.sql` | `consultations`, `medicines`, `drug_interactions`, `prescriptions`, `prescription_items`, `prescription_warnings` |
| `V7__create_billing_tables.sql` | `invoices`, `invoice_items`, `payments`, `credit_notes`, `invoice_number_seq`, `credit_note_number_seq` |
| `V8__create_audit_table.sql` | `audit_logs` |
| `V9__create_indexes_and_constraints.sql` | Partial unique indexes (`uq_appointment_slot_active`, `uq_appointment_doctor_in_consultation`, `uq_payment_method_txn_ref`) & query indexes |
| `V10__seed_reference_data.sql` | Clinics, specializations, departments, medicine catalog, and interaction seed data |
| `V11__seed_staff_accounts.sql` | Locked bootstrap staff rows (`admin@caresync.local`, `reception@caresync.local`) |
| `V12__protect_audit_logs_append_only.sql` | `BEFORE UPDATE OR DELETE` PostgreSQL trigger enforcing append-only `audit_logs` |

---

## 7. API Surface Overview

- Full contract: [docs/openapi.yaml](docs/openapi.yaml) (**55 HTTP operations** across **40 REST paths** under `/api`) + STOMP WebSocket `/ws` (`/topic/queue/{doctorId}`).
- Domain rules & state invariants: [docs/domain.md](docs/domain.md).

| Module | Base Paths | Key Operations |
|---|---|---|
| Auth | `/api/auth/*` | `POST /register`, `POST /login`, `POST /refresh`, `POST /logout`, `GET /me` |
| Reference | `/api/departments*`, `/api/specializations`, `/api/clinics` | Reference lookup; `ADMIN` department create/update |
| Doctors & Scheduling | `/api/doctors*` | Search/create/update doctors; `GET`/`PUT` schedules; `GET`/`POST`/`DELETE` leaves; `GET` slots |
| Patients | `/api/patients*` | Scoped search, create walk-in, audited read, full update |
| Appointments & Queue | `/api/appointments*`, `/api/queue*`, `/ws` | Book, list, get, `PATCH /status`, doctor queue, `POST /call-next`, public board, STOMP updates |
| Clinical & Pharmacy | `/api/appointments/{id}/consultation`, `/api/consultations/{id}`, `/api/medicines`, `/api/prescriptions*`, `/api/patients/{id}/prescriptions` | Consultation notes, medicine search, safety check, prescription creation & PDF |
| Billing | `/api/invoices*`, `/api/appointments/{id}/invoice` | List, get, appointment lookup, add item, record payment, credit note, void, invoice PDF |
| Audit & Reports | `/api/audit-logs`, `/api/reports/*` | `ADMIN` audit search; revenue, by-department, no-show rate, top doctors, dashboard |

---

## 8. Environment Variables & Profiles

Reference template: [.env.example](.env.example).

| Variable | Required | Default / Example | Purpose |
|---|---|---|---|
| `SPRING_DATASOURCE_URL` | Prod / Optional locally | `jdbc:postgresql://localhost:5432/caresync` | PostgreSQL JDBC URL |
| `SPRING_DATASOURCE_USERNAME` | Prod / Optional locally | `caresync` | PostgreSQL username |
| `SPRING_DATASOURCE_PASSWORD` | Yes (at runtime) | *(none)* | PostgreSQL password |
| `CARESYNC_JWT_SECRET` | Yes | *(at least 32 bytes)* | HS256 JWT signing key |
| `CARESYNC_CORS_ORIGINS` | Prod / Optional in `dev` | `http://localhost:3000` | Comma-separated REST & WebSocket allowed origins |
| `CARESYNC_ADMIN_EMAIL` | Optional | `admin@caresync.local` | Seeded admin email matched on bootstrap |
| `CARESYNC_ADMIN_PASSWORD` | Optional (needed to unlock seeded admin) | *(empty = remains locked)* | Initial password hash written if account is locked |
| `CARESYNC_RECEPTIONIST_EMAIL` | Optional | `reception@caresync.local` | Seeded receptionist email matched on bootstrap |
| `CARESYNC_RECEPTIONIST_PASSWORD` | Optional | *(empty = remains locked)* | Initial password hash written if account is locked |
| `CARESYNC_FORWARD_HEADERS_STRATEGY` | Prod (`application-prod.yml`) | `native` | Proxy forwarded-header handling |
| `CARESYNC_TRUSTED_PROXIES` | Prod (`application-prod.yml`) | RFC1918/loopback regex | Trusted reverse-proxy CIDR pattern |
| `CARESYNC_DB_NAME` / `CARESYNC_DB_USER` / `CARESYNC_DB_PASSWORD` | Docker Compose | `caresync` / `caresync` / `caresync` | PostgreSQL container database initialization |

Profiles:
- `dev` (`application-dev.yml`): Dev CORS defaults (`localhost:3000`, `localhost:5173`).
- `prod` (`application-prod.yml`): ECS structured JSON logging, forwarded-header support, Actuator health details `when-authorized`.
- `test` (`application-test.yml`): Relaxed rate limits and isolated test credentials used by automated tests.

---

## 9. Running Locally

### Prerequisites
- **Java 25**
- **Docker Desktop** (for PostgreSQL 16 via Docker Compose and Testcontainers integration tests)

### Steps
1. Start PostgreSQL 16 from the repository root (`Z:\javaproject`):
   ```powershell
   docker compose up -d
   ```
2. Copy `.env.example` to `.env` (or export the required variables in your shell) and set `SPRING_DATASOURCE_PASSWORD`, `CARESYNC_JWT_SECRET` (>= 32 bytes), and bootstrap staff passwords (`CARESYNC_ADMIN_PASSWORD`, `CARESYNC_RECEPTIONIST_PASSWORD`) as needed.
3. Run the backend from `backend/`:
   ```powershell
   cd backend
   .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"
   ```
   The API starts on `http://localhost:8080/api` and the STOMP/SockJS endpoint is exposed at `http://localhost:8080/ws`.

---

## 10. Running Tests

From `backend/`:

- **Unit & `@WebMvcTest` suites (Maven Surefire, no Docker required):**
  ```powershell
  .\mvnw.cmd clean test
  ```
- **Full verification including PostgreSQL 16 Testcontainers integration suites (`*IT`, Maven Failsafe):**
  ```powershell
  .\mvnw.cmd verify
  ```
  *(Requires a running Docker daemon for `postgres:16-alpine` Testcontainers.)*

Surefire and Failsafe XML reports are written to `backend/target/surefire-reports/` and `backend/target/failsafe-reports/`.

---

## 11. Project Structure & Documentation Links

```text
.
├── .env.example
├── .gitignore
├── docker-compose.yml
├── README.md
├── docs/
│   ├── domain.md                        # Business rules & state machine invariants
│   ├── openapi.yaml                     # OpenAPI 3.0.3 API specification
│   ├── PROGRESS.md                      # Phase-by-phase build log
│   ├── PHASE_14_FINAL_BACKEND_AUDIT.md  # Final backend audit report
│   └── PROJECT_REBRANDING_REPORT.md     # CareSync -> HCMS rebranding report
└── backend/
    ├── pom.xml                          # Maven build (com.caresync:caresync-backend)
    ├── mvnw / mvnw.cmd
    └── src/
        ├── main/java/com/caresync/      # 13 modular monolith packages
        ├── main/resources/
        │   ├── application*.yml         # Spring profiles (spring.application.name: hcms)
        │   ├── logback-spring.xml
        │   └── db/migration/            # Flyway V1–V12 SQL migrations
        └── test/                        # Unit tests, @WebMvcTest specs, PostgreSQL ITs
```

- API Contract: [docs/openapi.yaml](docs/openapi.yaml)
- Business Rules: [docs/domain.md](docs/domain.md)
- Development Log: [docs/PROGRESS.md](docs/PROGRESS.md)
- Audit Report: [docs/PHASE_14_FINAL_BACKEND_AUDIT.md](docs/PHASE_14_FINAL_BACKEND_AUDIT.md)
- Rebranding Report: [docs/PROJECT_REBRANDING_REPORT.md](docs/PROJECT_REBRANDING_REPORT.md)
