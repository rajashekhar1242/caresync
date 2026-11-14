# Hospital & Clinic Management System (HCMS) — Development Progress

## 2026-11-10: Phase 0, part 2/5: directory + patients
- [x] Departments: list, create, update (ADMIN writes)
- [x] Doctors: list (specializationId, clinicId, name, page, size, sort), get, create, update
- [x] Weekly schedule: GET, PUT (replace-all); leaves: list, create, delete
- [x] Patients: search (phone/name), create, get (audited), update; allergies as string[]
- [x] Shared: Gender, DayOfWeek, DoctorPage, PatientPage, path params
- [x] Part 1 edits: UserResponse gains patientId/doctorId; register auto-creates Patient; PageResponse description fixed
- New error codes: DEPARTMENT_NAME_EXISTS, INVALID_SCHEDULE, LEAVE_OVERLAP, LEAVE_HAS_BOOKED_APPOINTMENTS
- Open: specialization/clinic entities, department vs specialization, clinic time zone, Gender values, search auditing
- Next: Phase 0 part 3/5: slots + appointments (+ domain.md)


## 2026-11-10: Phase 0, part 4a/5: consultations + prescriptions
- [x] Consultations: GET/POST /appointments/{id}/consultation, GET/PUT /consultations/{id}
- [x] Medicines: GET /medicines (search + pagination)
- [x] POST /prescriptions/check (ALLERGY/INTERACTION, MILD/MODERATE/SEVERE)
- [x] Prescriptions: create (acknowledgeSevereWarnings), get, PDF, GET /patients/{id}/prescriptions
- [x] Edits: COMPLETED requires consultation with diagnosis; Conflict examples
- New error codes: APPOINTMENT_NOT_IN_CONSULTATION, CONSULTATION_ALREADY_EXISTS, CONSULTATION_FINALIZED, CONSULTATION_INCOMPLETE, PRESCRIPTION_ALREADY_EXISTS, SEVERE_WARNING_NOT_ACKNOWLEDGED
- Decision: money = decimal strings with 2 decimals + currency INR (applied in 4b)
- Open: "treated" definition, prescription void/edit, audit scope, admin read access
- Next: Phase 0 part 4b/5: invoices, payments, credit notes

## 2026-11-10: Phase 0, part 4b/5: billing
- [x] Billing tag; invoices: GET /invoices (status, patientId, from, to, page, size), GET /invoices/{id}, GET /appointments/{id}/invoice, GET /invoices/{id}/pdf, POST /invoices/{id}/items
- [x] POST /invoices/{id}/payments (partial payments, PENDING -> PARTIALLY_PAID -> PAID)
- [x] POST /invoices/{id}/credit-notes (ADMIN only, PAID invoices)
- [x] Money = decimal string with 2 decimals, currency INR; consultationFee changed from number to Money
- [x] Edits: BadRequest example OVERPAYMENT, Conflict example INVOICE_IMMUTABLE
- New error codes: OVERPAYMENT, CREDIT_EXCEEDS_INVOICE, INVOICE_IMMUTABLE, INVOICE_NOT_PAID, DUPLICATE_TXN_REF
- Decisions: invoice auto-created in the COMPLETED transition; PAID is never edited, only credit notes; OVERPAYMENT checked after state 409s
- Open: void/remove-item endpoint, txnRef uniqueness, billing audit scope, zero-fee invoices
- Next: Phase 0 part 5/5


## 2026-11-12: Phase 1: Project Skeleton & Build System
- [x] `backend/pom.xml` configured with Spring Boot 4.1.2, Java 25, Spring Security, Spring Data JPA, WebSocket/STOMP, Actuator, Flyway 12, PostgreSQL driver, JJWT 0.13.0, OpenPDF 3.0.5, Bucket4j 8.22.0, Testcontainers 2.0.5
- [x] Maven Wrapper (`backend/mvnw`, `backend/mvnw.cmd`, `backend/.mvn/wrapper/maven-wrapper.properties`) verified offline
- [x] `CareSyncApplication.java`, `application.yml`, `application-dev.yml`, `application-prod.yml`, `application-test.yml`, `logback-spring.xml`
- [x] Root `.gitignore`, `.env.example`, `docker-compose.yml` (PostgreSQL 16-alpine)
- [x] Verified `.\mvnw.cmd -o test` passes (`Phase1BootstrapTest`: 1 test, 0 failures)

## 2026-11-12: Phase 2: Database Foundation
- [x] Created all 11 Flyway SQL migrations (`V1`–`V11`) covering identity, reference data, doctors, schedules/leaves, patients (`text[]`), appointments/counters, clinical/medicines/prescriptions, billing/sequences, append-only audit logs, partial unique indexes (`uq_appointment_slot_active`, `uq_appointment_doctor_in_consultation`, `uq_payment_method_txn_ref`), seed data, and locked staff seed rows (`!LOCKED_REQUIRES_BOOTSTRAP!`)
- [x] Added `TestcontainersConfig` (Testcontainers 2.0.5 `org.testcontainers.postgresql.PostgreSQLContainer`), `BaseIntegrationTest`, `FlywayMigrationIT`, and `FlywayMigrationFileTest`
- [x] Verified compilation of all main and test sources and passed `FlywayMigrationFileTest`

## 2026-11-12: Phase 3: Common Infrastructure
- [x] Implemented OpenAPI-compliant DTOs (`ErrorResponse`, `FieldError`, `PageResponse`)
- [x] Implemented `ErrorCode` enum (all error codes from `domain.md` §10 plus `UNAUTHORIZED` and `INTERNAL_ERROR`), exception hierarchy, `GlobalExceptionHandler`, and `ErrorResponseWriter` (Jackson 3 `JsonMapper`)
- [x] Added `MoneyUtils`, `TimeZoneUtils` (DST gap/overlap handling), `RequestIpUtils`, `CareSyncProperties`, `ClockConfig`, `CorsConfig`, and `RequestLoggingFilter`
- [x] Verified `.\mvnw.cmd -o test` passes (9 tests, 0 failures)

## 2026-11-12: Phase 4: Security & Authentication
- [x] Implemented JWT & Security infrastructure: `UserPrincipal`, `SecurityUtils`, `SecurityEventLogger` (`SECURITY_EVENTS` structured log, zero PII), `JwtService` (HS256 via JJWT 0.13.0, clock-aware), `JwtAuthenticationFilter` (distinguishes `TOKEN_EXPIRED` vs `UNAUTHORIZED`), `RateLimitFilter` (Bucket4j per-IP rate limiting on `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/queue/board` with `Retry-After`; excludes `/api/auth/logout`), and `SecurityConfig` (`@EnableMethodSecurity`, stateless sessions, CORS, uniform 401/403 `ErrorResponse`)
- [x] Implemented `auth` module: `Role`, `User`, `RefreshToken`, `UserRepository`, `RefreshTokenRepository`, `ProfileLinkPort`, `JdbcProfileLinkAdapter`, `AuthService` (BCrypt hashing, single-use refresh token rotation with SHA-256 hash storage, idempotent logout, patient auto-provisioning on register), `AuthController` (`/api/auth/register`, `/login`, `/refresh`, `/logout`, `/me`), and `StaffAccountBootstrapRunner` (env-based bootstrap only, leaves `!LOCKED_REQUIRES_BOOTSTRAP!` accounts locked when unset)
- [x] Fixed Maven Surefire/Failsafe `<argLine>` in `backend/pom.xml` to pass `byte-buddy-agent` `-javaagent` on Java 25 (preventing dynamic self-attach named-pipe corruption inside sandboxed runs)
- [x] Verified `.\mvnw.cmd -o test` and `.\mvnw.cmd -o verify -DskipITs=true` pass all independent unit & `@WebMvcTest` suites (24 tests across 11 test classes, 0 failures, 0 skipped) and confirm `maven-failsafe-plugin:3.5.6` (`integration-test` + `verify` goals) and `spring-boot:repackage` are bound cleanly
- [ ] PostgreSQL Testcontainers integration tests (`FlywayMigrationIT`, `AuthSecurityIT`) remain pending Docker Desktop availability (compiled cleanly with no H2 fallback; NOT executed until Docker is running). Feature work paused prior to Phase 5 pending PostgreSQL IT verification.

## 2026-11-12: Pre-Phase 5 Audit & Verification
- [x] Verified Docker Desktop `29.9.3` (WSL 2 Linux engine) & Docker Compose `v5.7.0` (`docker run --rm hello-world` passed)
- [x] Verified `.\mvnw.cmd clean test`: **24 passed, 0 failed, 0 errors, 0 skipped** across 11 unit & `@WebMvcTest` suites
- [ ] Executed `.\mvnw.cmd verify` against Testcontainers `postgres:16-alpine` (PostgreSQL 16.15): **BLOCKED (`2 errors`, `0 skipped`)**
  - `V1`–`V9` Flyway migrations applied cleanly; `V10__seed_reference_data.sql` (line 35) failed with `SQL State 22P02` due to malformed UUID `'1000000-0000-4000-8000-000000000009'` (`Clopilet 75`, missing a leading `0`), failing `AuthSecurityIT` and cascading into `FlywayMigrationIT`
- [ ] Audit findings queued for user approval before Phase 5: fix `V10` UUID (`AUD-01`, Critical), log `@PreAuthorize` 403s in `GlobalExceptionHandler` (`AUD-02`, High), sanitize unhandled 500 logging (`AUD-03`, Medium), replace `RateLimitFilter` `buckets.clear()` (`AUD-04`, Medium), and clean up duplicate Phase 1 block in `PROGRESS.md`

## 2026-11-12: Pre-Phase 5 Audit Remediation & Full PostgreSQL Verification
- [x] **AUD-01**: Fixed malformed `Clopilet 75` UUID in `V10__seed_reference_data.sql` (`10000000-0000-4000-8000-000000000009`), verified in PostgreSQL alongside its `drug_interactions` join with `Omez 20`
- [x] **AUD-02**: Injected `SecurityEventLogger` into `GlobalExceptionHandler` and added `SecurityEventLogger.accessDenied(UserPrincipal, ...)` so MVC / `@PreAuthorize` `AccessDeniedException` and `AuthenticationException` log single `SECURITY_EVENTS` entries (`MethodSecurityLoggingTest` + `GlobalExceptionHandlerTest` + `AuthSecurityIT` verify zero duplicate events)
- [x] **AUD-03**: Removed exception object / message logging from `GlobalExceptionHandler.handleUnexpected(...)` and replaced with sanitized structured diagnostics (`method`, `path`, `type`, `rootCauseType`, top application frame location)
- [x] **AUD-04**: Replaced `RateLimitFilter` global `buckets.clear()` with idle-TTL + LRU bounded eviction (`DEFAULT_MAX_BUCKET_CACHE_SIZE = 10_000`, `DEFAULT_IDLE_TTL_NANOS = 5m`, `ReentrantLock` on eviction path), preserving per-IP throttling, `Retry-After`, `/api/auth/logout` exclusion, and thread safety (`RateLimitFilterTest`: 4 tests passing)
- [x] **AUD-05**: Added `V12__protect_audit_logs_append_only.sql` (`BEFORE UPDATE OR DELETE` PostgreSQL trigger enforcing append-only `audit_logs` without breaking Flyway or single-user local dev/Testcontainers inserts; dedicated runtime DB role separation remains a deployment hardening step)
- [x] **AUD-06**: Expanded `AuthSecurityIT` to attach `RequestLoggingFilter` and `RateLimitFilter` and verify expired JWT (`TOKEN_EXPIRED`), locked sentinel login rejection (`INVALID_CREDENTIALS`), filter-level `ACCESS_DENIED` single-event logging, and `429` + `Retry-After` rate limiting
- [x] **AUD-07 & AUD-08**: Removed unused clockless `ErrorResponse.of(...)` factory methods and deduplicated the repeated Phase 1 section in `docs/PROGRESS.md`
- [x] **AUD-09 (Intentionally Deferred)**: `iss`/`aud` JWT claims, STOMP `/ws/**` channel security (Phase 9), proxy header forwarding strategy, and scheduled refresh-token cleanup deferred to their target phases / deployment configuration
- [x] **Full Verification Passed**: `.\mvnw.cmd clean test` (**27 passed, 0 failed, 0 errors, 0 skipped**) and `.\mvnw.cmd verify` against PostgreSQL 16 Testcontainers (**31 total: 27 Surefire + 4 Failsafe ITs, 0 failed, 0 errors, 0 skipped**)

## 2026-11-12: Phase 5: Audit Infrastructure
- [x] Added `RequestIpUtils.extractCurrentClientIp()` helper for servlet-bound audit calls
- [x] Implemented `AuditEntityType`, `AuditAction` (all 16 OpenAPI enum actions mapped to entity types), immutable `AuditLog` JPA entity matching `V8__create_audit_table.sql`, and `AuditLogResponse`
- [x] Implemented `AuditLogRepository` (`JpaSpecificationExecutor`) and `AuditService` (transactional same-tx `record`/`recordCurrentUser` snapshot writes, length normalization, newest-first `listAuditLogs` with JPA `Specification` AND filters, `from` inclusive / `to` exclusive, `from < to` validation)
- [x] Implemented `AuditLogController` (`GET /api/audit-logs`, `@PreAuthorize("hasRole('ADMIN')")`, `@Validated` `page`/`size` bounds)
- [x] Verified `.\mvnw.cmd clean test` (32 passed) and `.\mvnw.cmd verify` against PostgreSQL 16 Testcontainers (**38 total: 32 Surefire + 6 Failsafe ITs**, including `AuditServiceTest`, `AuditLogControllerTest`, and `AuditLogIT`, 0 failed, 0 errors, 0 skipped)

## 2026-11-12: Phase 6: Reference Data & Departments
- [x] Implemented `Clinic`, `Specialization`, and `Department` JPA entities matching `V2__create_reference_data.sql`
- [x] Implemented `ClinicRepository`, `SpecializationRepository`, `DepartmentRepository`, and `ReferenceDataService` (sorted reads, name normalization, case-insensitive `409 DEPARTMENT_NAME_EXISTS` including `DataIntegrityViolationException` translation on `uq_departments_name_lower`)
- [x] Implemented `DepartmentController` (`GET /api/departments`, ADMIN-only `POST /api/departments` and `PUT /api/departments/{departmentId}`), `SpecializationController` (`GET /api/specializations`), and `ClinicController` (`GET /api/clinics`)
- [x] Verified `.\mvnw.cmd clean test` (37 passed) and `.\mvnw.cmd verify` against PostgreSQL 16 Testcontainers (**44 total: 37 Surefire + 7 Failsafe ITs**, including `ReferenceDataServiceTest`, `ReferenceDataControllerTest`, and `ReferenceDataIT`, 0 failed, 0 errors, 0 skipped)

## 2026-11-12: Phase 7: Doctors Module
- [x] Implemented `Doctor` JPA entity (`@OneToOne` link to `User`, matching `V3__create_doctor_tables.sql`) and `DoctorRepository` (`@EntityGraph(attributePaths = "user")` + `JpaSpecificationExecutor`)
- [x] Implemented `DoctorCreateRequest`, `DoctorUpdateRequest`, and `DoctorResponse` (contact details intentionally omitted, `Money` string formatting via `MoneyUtils`)
- [x] Implemented `DoctorService` (transactional creation of `User(Role.DOCTOR)` + `Doctor`, `EMAIL_ALREADY_EXISTS` conflict handling, reference existence verification, `slotMinutes` multiple-of-5 validation, `PATIENT` active-only filtering/404 hiding, `specializationId`/`clinicId`/`name` AND filters, whitelisted `fullName`/`consultationFee` sorting)
- [x] Implemented `DoctorController` (`GET /api/doctors`, ADMIN-only `POST /api/doctors`, `GET /api/doctors/{doctorId}`, ADMIN-only `PUT /api/doctors/{doctorId}`)
- [x] Verified `.\mvnw.cmd clean test` (41 passed) and `.\mvnw.cmd verify` against PostgreSQL 16 Testcontainers (**49 total: 41 Surefire + 8 Failsafe ITs**, including `DoctorServiceTest`, `DoctorControllerTest`, and `DoctorIT` covering login linkage and visibility, 0 failed, 0 errors, 0 skipped)

### Phase 8 – Schedules, Leaves & Slots
- [x] Implemented `ScheduleEntry`, `Leave`, `ScheduleEntryRepository`, and `LeaveRepository`
- [x] Implemented `ScheduleService` and `ScheduleController` (`GET /api/doctors/{doctorId}/schedules` and atomic `PUT /api/doctors/{doctorId}/schedules` with range ordering, overlap, and minimum `slotMinutes` validation returning `400 INVALID_SCHEDULE`)
- [x] Implemented `LeaveService` and `LeaveController` (`GET /api/doctors/{doctorId}/leaves`, `POST /api/doctors/{doctorId}/leaves` enforcing past-date, `LEAVE_OVERLAP`, and `LEAVE_HAS_BOOKED_APPOINTMENTS`, and `DELETE /api/doctors/{doctorId}/leaves/{leaveId}`)
- [x] Implemented `SlotService` and `SlotController` (`GET /api/doctors/{doctorId}/slots?date=` with clinic-timezone window checks, `DOCTOR_INACTIVE`/`OUTSIDE_BOOKING_WINDOW`/`ON_LEAVE`/`NO_SCHEDULE` precedence, integer-minute stepping, active appointment lookup, and shared `isValidScheduledSlotStart` helper)
- [x] Verified `.\mvnw.cmd clean test` (48 passed) and `.\mvnw.cmd verify` against PostgreSQL 16 Testcontainers (**57 total: 48 Surefire + 9 Failsafe ITs**, including `ScheduleServiceTest`, `LeaveServiceTest`, `SlotServiceTest`, `ScheduleLeaveSlotControllerTest`, and `SchedulingIT`, 0 failed, 0 errors, 0 skipped)

### Phase 9 – Patients Module
- [x] Implemented `Gender`, `Patient` (`TEXT[]` allergies mapping via Hibernate `SqlTypes.ARRAY`), `PatientRepository`, and patient DTOs (`PatientRequest`, `PatientResponse`, `PatientSummary`)
- [x] Implemented `PatientService` and `PatientController` (`GET /api/patients` phone-prefix & case-insensitive name search scoped to DOCTOR's own non-cancelled patients, `POST /api/patients` walk-in creation, `GET /api/patients/{patientId}` with mandatory same-transaction `PATIENT_READ` audit log and ownership enforcement, `PUT /api/patients/{patientId}` full replacement with allergy trimming/case-insensitive deduplication)
- [x] Verified `.\mvnw.cmd clean test` (53 passed) and `.\mvnw.cmd verify` against PostgreSQL 16 Testcontainers (**63 total: 53 Surefire + 10 Failsafe ITs**, including `PatientServiceTest`, `PatientControllerTest`, and `PatientIT`, 0 failed, 0 errors, 0 skipped)

### Phase 10 – Appointments & State Machine
- [x] Implemented `AppointmentStatus`, `Appointment`, `DoctorDayCounterId`, `DoctorDayCounter`, `AppointmentRepository` (with `@EntityGraph` details loading), and `DoctorDayCounterRepository` (atomic PostgreSQL `INSERT ... ON CONFLICT DO UPDATE ... RETURNING last_token`)
- [x] Implemented `AppointmentService` and `AppointmentController` (`GET /api/appointments` scoped by DOCTOR/PATIENT ownership and `from`/`to`/`status`/`sort`, `POST /api/appointments` following exact 5-step validation and partial unique index race handling, `GET /api/appointments/{appointmentId}`)
- [x] Implemented `StatusTransitionService` (`PATCH /api/appointments/{appointmentId}/status` enforcing `404 -> 403 -> 409 ILLEGAL_STATE_TRANSITION -> time/state rules`, atomic token assignment on `CHECKED_IN`, 2-hour cancellation window, single `IN_CONSULTATION` guard, consultation completion/finalization & billing ports, and domain event emission)
- [x] Verified `.\mvnw.cmd clean test` (58 passed) and `.\mvnw.cmd verify` against PostgreSQL 16 Testcontainers (**69 total: 58 Surefire + 11 Failsafe ITs**, including `AppointmentServiceTest`, `StatusTransitionServiceTest`, `AppointmentControllerTest`, and `AppointmentIT` covering concurrent slot booking race and full state transitions, 0 failed, 0 errors, 0 skipped)

### Phase 11 – Queue & WebSocket
- [x] Implemented queue DTOs (`QueueEntry`, `QueueStateResponse`, `QueueTokenView`, `QueueBoardResponse`, `QueueUpdateMessage`) and `QueueService` (doctor queue state for `WAITING` sorted by `tokenNumber` and active `IN_CONSULTATION`, transactional `callNext` moving lowest-token `CHECKED_IN` to `IN_CONSULTATION` with concurrency conflict translation to `409 CONSULTATION_IN_PROGRESS`, and public zero-PII clinic board grouped by doctor)
- [x] Implemented `QueueController` (`GET /api/queue/doctors/{doctorId}`, `POST /api/queue/doctors/{doctorId}/call-next`, and public `GET /api/queue/board?clinicId=` with `Cache-Control: no-store`, enforcing `404 -> 403 -> 409` ordering)
- [x] Implemented STOMP/SockJS WebSocket configuration (`WebSocketConfig` on `/ws`, `/topic`, `/app`), inbound `ChannelInterceptor` (`WebSocketSecurityConfig` blocking client `SEND` frames and restricting `SUBSCRIBE` to `/topic/queue/{doctorId}`), and post-commit `QueueMessagePublisher` broadcasting token-only `QueueUpdateMessage` events
- [x] Verified `.\mvnw.cmd clean test` (63 passed) and `.\mvnw.cmd verify` against PostgreSQL 16 Testcontainers (**75 total: 63 Surefire + 12 Failsafe ITs**, including `WebSocketSecurityConfigTest`, `QueueServiceTest`, `QueueControllerTest`, and `QueueIT` testing live STOMP broadcasts, 2-thread `call-next` race, and public board zero-PII guarantees, 0 failed, 0 errors, 0 skipped)

### Phase 13 – Billing, Reports & Final Verification
- [x] Verified Phase 12 clinical readiness gate (`ConsultationService`, `PrescriptionService`, `PrescriptionPdfService`, `PrescriptionController`, `StatusTransitionService`, `JdbcConsultationLifecycleAdapter`, `AppointmentBillingPort`) before starting Phase 13
- [x] Implemented `com.caresync.billing` (`Currency`, `InvoiceStatus`, `PaymentMethod`, `Invoice`, `InvoiceItem`, `Payment`, `CreditNote`, billing DTOs, `InvoiceRepository` with PostgreSQL `invoice_number_seq`/`credit_note_number_seq` sequence helpers and `PESSIMISTIC_WRITE` row locking, `InvoiceService` implementing `AppointmentBillingPort`, `InvoicePdfService` with OpenPDF, and `InvoiceController` exposing all 8 OpenAPI billing endpoints with `400 -> 404 -> 403 -> 409` error ordering, idempotent zero-fee auto-close on completion, overpayment/`VOID` guards, duplicate payment transaction reference protection, and all 7 `INVOICE_*` audit actions)
- [x] Implemented `com.caresync.report` (report DTOs including `SignedMoney` `net` and nullable `noShowRate`, `ReportRepository` using PostgreSQL `NamedParameterJdbcTemplate` SQL aggregations and `AT TIME ZONE` clinic-local bucketing, `ReportService`, and `@PreAuthorize("hasRole('ADMIN')")` `ReportController` exposing all 5 OpenAPI reporting endpoints with `403 -> 400 -> 404` check ordering)
- [x] Verified `.\mvnw.cmd clean test` (**91 Surefire tests**, including `InvoiceServiceTest`, `InvoicePdfServiceTest`, `InvoiceControllerTest`, `ReportServiceTest`, `ReportControllerTest`) and `.\mvnw.cmd verify` against PostgreSQL 16 Testcontainers (**110 total: 91 Surefire + 19 Failsafe ITs**, including `BillingIT` concurrency/rollback/audit/PDF checks and `ReportIT` SQL aggregation/timezone/filter checks, 0 failures, 0 errors, 0 skipped)

### Phase 18 – React Frontend Foundation & JavaScript Migration
- [x] Initialized modern single-page application inside `frontend/` powered by Vite 6 and React 18
- [x] Established design system primitives with Tailwind CSS, Lucide icons, and Radix UI primitives
- [x] Migrated cleanly to pure JavaScript ES6+ (JSX) with JSDoc typing and Zod runtime schema definitions
- [x] Configured React Router 7 with route guards: `ProtectedRoute` and `PublicOnlyRoute`
- [x] Implemented accessible component primitives (`Button`, `Input`, `Card`, `Badge`) and authenticated application layouts

### Phase 19 – Real Backend Authentication Integration
- [x] Completed backend reconnaissance of `AuthController`, `AuthService`, DTOs, and `StaffAccountBootstrapRunner`
- [x] Published `frontend/docs/PHASE_19_AUTH_ASSESSMENT.md` and `frontend/docs/PHASE_19_AUTH_INTEGRATION_REPORT.md`
- [x] Implemented in-memory access token retention in `token.service.js` with session-scoped refresh token in `sessionStorage`
- [x] Engineered single-flight Promise refresh mutex in `src/services/api.js` coordinating concurrent 401s to prevent backend token-family replay revocation
- [x] Wired transparent request replay, debounced unauthorized event broadcasting, and `queryClient.clear()` cache isolation
- [x] Integrated `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/refresh`, `POST /api/auth/logout`, and `GET /api/auth/me`
- [x] Added automated 10-concurrent-requests 401 stress test in `src/test/api-mutex.test.js` asserting exactly 1 refresh call and 10 retried requests
- [x] Verified test suite (**10 test files, 43 passed**), ESLint (0 errors, 0 warnings), and production build (`npm run build` in 7.09s)

### Phase 20 – Admin Dashboard Implementation
- [x] Conducted comprehensive reconnaissance of all administrative Spring Boot controllers and endpoints; documented findings in `frontend/docs/PHASE_20_ADMIN_API_ASSESSMENT.md`
- [x] Built responsive collapsible Admin Navigation Sidebar with local persistence (`cs_sidebar_collapsed`), rendering all exact 10 administrative sections (`Overview`, `Departments`, `Doctors`, `Staff`, `Appointments`, `Patients`, `Billing & Revenue`, `Reports`, `Audit Activity`, `Settings`), user profile badge, and secure logout action
- [x] Implemented 7 modular API service clients and TanStack Query hooks (`reports`, `departments`, `doctors`, `appointments`, `patients`, `billing`, `audit`) with optimistic cache invalidation and error boundary handling
- [x] Developed real-time Overview Dashboard featuring 6 actual KPI metrics, interactive Recharts graphs (AreaChart 30-day revenue trend, PieChart appointment status breakdown, BarChart department workload), recent appointments table, and quick action shortcuts
- [x] Developed Clinical Departments view with search, create modal (`DEPARTMENT_NAME_EXISTS` handling), edit modal, and explicit database integrity deletion policy banner
- [x] Developed Physicians & Doctors directory with specialization/clinic filtering, comprehensive detail modal, create doctor modal, and active status toggle
- [x] Developed Staff Management architectural status view honestly detailing backend API readiness and database seed accounts without synthetic mock data
- [x] Developed Hospital-Wide Appointments monitoring view with multi-criteria filtering, encounter details modal, and administrative cancellation with mandatory reason
- [x] Developed Master Patient Index with demographic search, patient registration, profile modification, and audited medical profile inspection triggering backend `PATIENT_READ`
- [x] Developed Billing & Revenue Ledger with strict financial semantics (invoiced vs collected vs balance due vs credited), real OpenPDF streaming download, void dialog, and credit note issuance
- [x] Developed 4-tab Operational & Financial Reports view with configurable date ranges and group-by controls
- [x] Developed Append-Only Audit Activity Ledger with action badges and JSON metadata inspection modal
- [x] Developed System Settings & Compliance view detailing token expiration, rate limiting, and RBAC rules
- [x] Published comprehensive completion documentation in `frontend/docs/PHASE_20_ADMIN_DASHBOARD_REPORT.md`
- [x] Verified complete frontend test suite (**19 test files, 92 passed, 0 failed**), ESLint (**0 errors, 0 warnings**), and production build (`vite build` in 19.02s) with zero backend changes and strict pure JavaScript ES6+ compliance

### Phase 21 – Receptionist Dashboard Implementation
- [x] Conducted comprehensive backend reconnaissance of receptionist-accessible APIs (`PatientController`, `DoctorController`, `ScheduleController`, `LeaveController`, `SlotController`, `AppointmentController`, `StatusTransitionService`, `QueueController`, `QueueService`, `WebSocketConfig`, `WebSocketSecurityConfig`); documented in `frontend/docs/PHASE_21_RECONNAISSANCE.md`
- [x] Configured receptionist route constants in `src/constants/index.js` and updated `src/components/layout/sidebar.jsx` with 8 dedicated front-desk navigation sections (`Overview`, `Patients`, `Register Patient`, `Appointments`, `Book Appointment`, `Check-in`, `Queue Management`, `Doctor Availability`), route matching, and secure logout
- [x] Built modular receptionist services and TanStack Query hooks: `src/services/queue.service.js`, extended `src/services/appointments.service.js` and `src/services/doctors.service.js`, `src/hooks/use-queue.js`, and real-time STOMP WebSocket hook `src/hooks/use-queue-websocket.js` connecting to `ws://localhost:8080/ws/websocket`, subscribing to `/topic/queue/{doctorId}` with exponential backoff reconnect and cache invalidation
- [x] Implemented Patient Management UI (`patients-page.jsx`): Debounced search by phone or name, pagination, audited demographic inspection dialog (`PATIENT_READ`), and direct booking shortcut
- [x] Implemented Walk-In Patient Registration (`register-patient-page.jsx`): Comprehensive intake form with Zod schema validation (`schemas/index.js`), duplicate detection handling, and immediate booking transition
- [x] Implemented Doctor Availability Directory (`doctor-availability-page.jsx`): Department and specialization filters, weekly schedule inspection modal, approved leaves viewer, and real-time slot stepping modal
- [x] Implemented Appointment Booking Engine (`book-appointment-page.jsx`): 4-step wizard (Doctor selection, Date & authoritative slot grid, Patient lookup/intake, and Confirmation) with slot conflict protection and optional instant check-in
- [x] Implemented Hospital Appointments Roster (`appointments-page.jsx`): Status, doctor, and date range filters, encounter details modal, arrival check-in action, cancellation dialog enforcing 2-hour cutoff rule (`409 CANCELLATION_WINDOW_CLOSED`), and Mark No-Show action
- [x] Implemented Fast Patient Arrival Check-In Desk (`check-in-page.jsx`): Filtered list of today's pending arrivals, one-click check-in with atomic backend token minting, and prominent printable Token Slip banner
- [x] Implemented Live Queue Management Board (`queue-page.jsx`): Doctor-specific queue view, active "Now Serving" billboard, upcoming waiting queue list, multi-doctor clinic overview, and live STOMP WebSocket connection status pill
- [x] Implemented Receptionist Overview Dashboard (`receptionist-dashboard-page.jsx`): Real-time front-desk KPI cards computed authoritatively from transactional APIs without relying on 403-restricted reporting endpoints
- [x] Enforced strict medical privacy boundaries: Receptionist role cannot view consultation notes, diagnoses, or prescriptions (HTTP 403)
- [x] Created 6 comprehensive frontend unit and integration test suites:
  - `src/test/receptionist-authorization.test.jsx` (7 tests)
  - `src/test/receptionist-services.test.js` (9 tests)
  - `src/test/receptionist-patient-management.test.jsx` (4 tests)
  - `src/test/receptionist-appointments.test.jsx` (3 tests)
  - `src/test/receptionist-queue.test.jsx` (2 tests)
  - `src/test/receptionist-overview-and-checkin.test.jsx` (2 tests)
- [x] Verified full automated test suite: **25 test files, 119 tests passing (100% pass rate)**
- [x] Verified code quality and production build: ESLint **0 errors, 0 warnings**; Vite production build completed cleanly in **8.72s** with pure JavaScript ES6+ (JSX) and zero backend modifications
- [x] Authored and executed automated live backend integration test runner (`scripts/receptionist-live-validation.mjs`): **23 passed, 0 failed, 0 blocked (100% pass rate)** against running Spring Boot 4.1.2 backend and PostgreSQL 16 database
- [x] Published complete documentation deliverables:
  - `frontend/docs/PHASE_21_RECONNAISSANCE.md`
  - `frontend/docs/PHASE_21_RECEPTIONIST_IMPLEMENTATION_REPORT.md`
  - `frontend/docs/PHASE_21_LIVE_VALIDATION_REPORT.md`
  - `frontend/docs/PHASE_21_TEST_RESULTS.md`
  - `frontend/docs/receptionist-live-results.json`

### Phase 21.1 – Receptionist Dashboard Final Verification & Gap Closure
- [x] Conducted exhaustive independent verification of Phase 21 implementation against backend Spring Boot controllers, entities, Flyway migrations (`V1`–`V12`), and PostgreSQL constraints
- [x] Remediated clinic timezone date boundary defect across all front-desk features (`receptionist-home.jsx`, `check-in-page.jsx`, `doctor-availability-page.jsx`, `book-appointment-page.jsx`) using centralized timezone helpers (`getClinicDayBounds`, `getClinicTodayDateString`) bound to `Asia/Kolkata` (`+05:30`)
- [x] Fixed Overview KPI pagination capping: derived `totalAppointments` from authoritative `totalElements`, separated active encounters from cancelled visits (`${active} active · ${cancelled} cancelled`), clarified physician subtitle to "Registered active staff", made error boundaries resilient to query failures, and introduced an honest volume notice when encounters exceed page 0 (100 items)
- [x] Enforced RBAC action filtering in `BillingPage` (`billing-page.jsx`): strictly suppressed administrative Void and Credit Note actions for the `RECEPTIONIST` role
- [x] Verified patient profile DTO consistency against backend `PatientResponse.java`: confirmed zero references to non-existent emergency contact fields in code and clarified documentation
- [x] Engineered and executed live real-time STOMP WebSocket verification (`scripts/verify-realtime-queue-websocket.mjs`): subscribed to `/topic/queue/{doctorId}`, triggered backend check-in, asserted incoming `QueueUpdateMessage` STOMP frame delivery, verified clean disconnect, REST polling fallback, and socket reconnection
- [x] Conducted automated responsive browser validation (`scripts/capture-receptionist-screenshots.mjs`) driving headless Google Chrome via CDP: captured 36 full-surface PNG screenshots across 4 device viewports (Desktop 1920×1080, Laptop 1366×768, Tablet 768×1024, Mobile 390×844) and 9 routes with **0% horizontal overflow rate**
- [x] Re-executed full Admin Dashboard live integration test suite (`scripts/live-validation.mjs`): **45 passed, 0 failed (100% pass rate)**, confirming zero admin regression
- [x] Re-executed Receptionist live API integration suite (`scripts/receptionist-live-validation.mjs`): **23 passed, 0 failed (100% pass rate)**
- [x] Cataloged master QA test-data inventory (`PHASE_21_1_QA_DATA_INVENTORY.md`): preserved all 16 patients, 10 appointments, 3 voided invoices, 4 doctor day counters, and 27 append-only audit events without destructive cleanup
- [x] Verified complete frontend test suite: **25 test files, 122 tests passed (100% pass rate)** (+3 new tests for pagination volume notice, active/cancelled counts, and receptionist billing restrictions)
- [x] Verified static analysis & production build: ESLint **0 errors, 0 warnings**; Vite 6 production build succeeded in **9.96s** with pure JavaScript ES6+ (JSX) and zero backend modifications
- [x] Published Phase 21.1 documentation deliverables:
  - `frontend/docs/PHASE_21_1_FINAL_VERIFICATION_REPORT.md`
  - `frontend/docs/PHASE_21_1_GAP_REMEDIATION_REPORT.md`
  - `frontend/docs/PHASE_21_1_BROWSER_VALIDATION.md`
  - `frontend/docs/PHASE_21_1_QA_DATA_INVENTORY.md`
  - `frontend/docs/queue-websocket-verification-results.json`
  - `frontend/docs/browser-validation-manifest.json`

### Phase 22 – Doctor Portal Implementation
- [x] Engineered and integrated complete, responsive Doctor Portal (`/doctor/*`) for attending physicians using pure JavaScript (ES6+ / JSX) with zero backend Java or schema modifications
- [x] Implemented Module A (`doctor-home.jsx`): Physician Clinical Console with live KPI metrics (today's schedule, waiting in queue, now in consultation fallback, completed encounters), today's working schedule summary, and active encounters table with quick consultation actions
- [x] Implemented Module B (`doctor-schedule-page.jsx`): Practice Schedule & Duty Roster with weekly operating timetable (`MON`–`SUN`), interactive daily slot occupancy inspector (available vs booked calculations), and leave management (apply and delete leave requests)
- [x] Implemented Module C (`doctor-queue-page.jsx`): Live Waiting Room Queue powered by real-time STOMP WebSocket connection to `/topic/queue/{doctorId}` with automatic fallback to REST polling, now serving hero card, and chronological waiting roster with sequential ticket advancement (`callNext`)
- [x] Implemented Module D (`doctor-patients-page.jsx`): Patient Medical Records & Intake directory with debounced search, detailed demographic profiles, verified drug and environmental allergies, past prescriptions, and strict HIPAA / 403 Forbidden fail-closed privacy boundary enforcement
- [x] Implemented Modules E & F (`doctor-consultations-page.jsx`): Clinical Consultation Workspace & Prescription Writer with vitals capture, mandatory ICD-10 clinical diagnosis validation, hospital formulary autocomplete (`/api/medicines`), real-time allergy/drug interaction safety check (`/api/prescriptions/check`) with severe warning acknowledgement gates, e-prescription generation, signed PDF streaming, and appointment completion
- [x] Implemented Module G (`doctor-history-page.jsx`): Consultation History review with encounter filtering, aggregate statistics, complete clinical encounter modal with vital signs, diagnosis, symptoms, clinical notes, and linked signed prescription PDF download
- [x] Created domain API services and TanStack Query hooks: `consultations.service.js`, `prescriptions.service.js`, `medicines.service.js`, `doctors.service.js`, `use-consultations.js`, `use-prescriptions.js`, `use-medicines.js`, and `use-doctors.js`
- [x] Enforced RBAC route protection in `routes.jsx` via `ProtectedRoute allowedRoles={['DOCTOR']}` and updated navigation sidebar
- [x] Created 6 comprehensive Doctor test suites in `frontend/src/test/`: `doctor-authorization.test.jsx`, `doctor-services.test.js`, `doctor-overview-and-schedule.test.jsx`, `doctor-queue.test.jsx`, `doctor-patients.test.jsx`, and `doctor-consultation-and-prescriptions.test.jsx`
- [x] Verified full test suite: **31 test files, 157 tests passed (100% pass rate)** (+31 new doctor tests, 0 failures, 0 regressions)
- [x] Verified code quality & build: ESLint **0 errors, 0 warnings**; Vite 6 production build succeeded in **10.54s**
- [x] Executed live backend API integration validation (`scripts/doctor-live-validation.mjs`): **14 passed, 0 failed (100% pass rate)** against running Spring Boot 4.1.2 and PostgreSQL 16
- [x] Conducted automated responsive browser validation (`scripts/capture-doctor-screenshots.mjs`) driving headless Google Chrome via CDP: captured 24 full-surface PNG screenshots across 4 device viewports (Desktop 1920×1080, Laptop 1366×768, Tablet 768×1024, Mobile 390×844) and 6 doctor routes with **100% unique SHA-256 hashes (24/24)**
- [x] Published Phase 22 documentation deliverables:
  - `frontend/docs/PHASE_22_DOCTOR_PORTAL_REPORT.md`
  - `frontend/docs/doctor-browser-validation-manifest.json`
  - `frontend/docs/browser-validation-manifest.json` (merged master manifest)

### Phase 22.1 – Doctor Portal Final Verification & Quality Gate Sign-Off
- [x] Audited and remediated document-level horizontal overflow across all 24 route/viewport combinations: added `min-w-0 w-full overflow-x-hidden` to `app-layout.jsx` and `html, body { overflow-x: hidden; }` in `globals.css`, achieving **0% document-level overflow rate (24/24 PASS)** while preserving intentional table touch scrolling (`overflow-x-auto`)
- [x] Verified route authentication integrity: all six routes (`/doctor/dashboard`, `/doctor/schedules`, `/doctor/queue`, `/doctor/patients`, `/doctor/consultations`, `/doctor/history`) display genuine authenticated doctor pages with 0 login redirects or fallbacks
- [x] Executed complete live clinical workflow validation (`scripts/doctor-clinical-workflow-live.mjs`): **15 passed, 0 failed (100% pass rate)** against Spring Boot 4.1.2 and PostgreSQL 16
- [x] Verified mandatory clinical diagnosis guard: appointment completion is rejected with HTTP 409 `CONSULTATION_INCOMPLETE` until diagnosis is recorded
- [x] Verified drug interaction safety check: Ibuprofen + Warfarin triggers SEVERE interaction warning; unacknowledged prescription creation is rejected with HTTP 409 `SEVERE_WARNING_NOT_ACKNOWLEDGED`; creation succeeds with `acknowledgeSevereWarnings: true`
- [x] Verified automated consultation invoicing: appointment completion automatically generates linked invoice (`INV-2026-000004`, status `PENDING`, INR 900.00 fee)
- [x] Verified signed prescription PDF streaming: `GET /api/prescriptions/{id}/pdf` delivers binary stream with `%PDF-` header (HTTP 200)
- [x] Verified doctor-patient authorization boundary: snoop attempt on unrelated patient record returns fail-closed HTTP 403 Forbidden
- [x] Verified real queue domain event over STOMP WebSocket: native WebSocket client connected to `ws://localhost:8080/ws/websocket`, subscribed to `/topic/queue/{doctorId}`, and received incoming `QueueUpdateMessage` STOMP frame upon ticket transition
- [x] Re-executed full test suite: **31 test files, 157 passed (100% pass rate)**
- [x] Re-executed static analysis: ESLint **0 errors, 0 warnings**
- [x] Re-executed production build: Vite 6 build succeeded in **19.78s**
- [x] Preserved existing QA data and made zero backend Java or database schema modifications
- [x] Published Phase 22.1 documentation deliverable:
  - `frontend/docs/PHASE_22_1_FINAL_VERIFICATION_REPORT.md`
  - `frontend/docs/phase-22-1-clinical-workflow-results.json`

### Phase 23 – Patient Portal Implementation
- [x] Engineered and integrated complete, responsive Patient Portal (`/patient/*`) for registered patients using pure JavaScript (ES6+ / JSX) with zero backend Java or database schema modifications
- [x] Implemented Module 1 (`patient-home.jsx`): Patient Health Console featuring personalized welcome banner, real-time KPI metrics (next scheduled visit, completed consultations, active prescriptions, pending invoices), next scheduled visit hero card, active prescription feed, recent billing ledger, and quick healthcare action shortcuts
- [x] Implemented Module 2 (`patient-profile-page.jsx`): Patient Profile management with React Hook Form + Zod validation (`fullName`, `phone`, `email`, `dateOfBirth`, `gender`, `address`, `allergies`), system UUID badges, and transparent informational cards clarifying counter-verified fields
- [x] Implemented Module 3 (`patient-doctors-page.jsx`): Find Doctors & Specialists directory with debounced search, department & specialization filters, consultation fees, slot durations, and interactive weekly shift schedule modal (`DoctorWeeklyScheduleModal`)
- [x] Implemented Module 4 (`patient-book-appointment-page.jsx`): Multi-step booking workflow with physician selection, 30-day booking window constraints (Asia/Kolkata timezone), real-time authoritative slot querying, slot collision handling (HTTP 409), and booking confirmation summary
- [x] Implemented Module 5 (`patient-appointments-page.jsx`): Comprehensive appointments ledger with status filtering (Upcoming, All, Completed, Cancelled), queue token badges, visit reason notes, 2-hour online cancellation window guard, and modal reason capture
- [x] Implemented Module 6 (`patient-prescriptions-page.jsx`): Electronic prescription archive with medicine items (dosage, frequency, duration, instructions), physician details, clinical notes, and authenticated PDF binary download trigger (`prescriptionsService.downloadPdf`)
- [x] Implemented Module 7 (`patient-medical-history-page.jsx`): Medical History repository featuring documented drug & environmental allergies alert badges, and expandable clinical consultation records (primary diagnosis, symptoms, vitals grid, physician notes, follow-up dates)
- [x] Implemented Module 8 (`patient-billing-page.jsx`): Financial ledger displaying total invoiced, settled amounts, and outstanding balance due, itemized line items, counter payment settlement policy notice, and authenticated invoice PDF download trigger (`billingService.downloadInvoicePdf`)
- [x] Implemented Route Aliasing: `/patient/records` automatically redirects to `/patient/medical-history`
- [x] Implemented standard shadcn `alert.jsx` component (`Alert`, `AlertTitle`, `AlertDescription`) with CVA variants (`default`, `destructive`, `warning`, `success`, `info`)
- [x] Enforced RBAC route protection in `routes.jsx` via `ProtectedRoute allowedRoles={['PATIENT']}` and updated navigation sidebar for `PATIENT` role
- [x] Created 2 comprehensive Patient test suites in `frontend/src/test/`: `patient-authorization.test.jsx` (6 tests) and `patient-portal.test.jsx` (8 tests)
- [x] Verified full test suite: **33 test files, 171 tests passed (100% pass rate)** (+14 new patient tests, 0 failures, 0 regressions)
- [x] Verified code quality & build: ESLint **0 errors, 0 warnings**; Vite 6 production build succeeded in **19.78s**
- [x] Executed live backend API integration validation (`scripts/patient-live-validation.mjs`): **15 passed, 0 failed (100% pass rate)** against running Spring Boot 4.1.2 and PostgreSQL 16
- [x] Conducted automated responsive browser validation (`scripts/capture-patient-screenshots.mjs`) driving headless Google Chrome via CDP: captured 32 full-surface PNG screenshots across 4 device viewports (Desktop 1920×1080, Laptop 1366×768, Tablet 768×1024, Mobile 390×844) and 8 patient routes with **100% unique SHA-256 hashes (32/32)** and **0% document-level overflow**
- [x] Preserved all existing QA data across Admin, Receptionist, and Doctor portals with zero modifications to backend code or database schema
- [x] Published Phase 23 documentation deliverables:
  - `frontend/docs/PHASE_23_PATIENT_PORTAL_REPORT.md`
  - `frontend/docs/patient-browser-validation-manifest.json`

### Phase 24 — CareSync System-Wide Integration, Security, Performance & Production Readiness Audit
- [x] Completed comprehensive, system-wide hardening and production audit across 8 dedicated workstreams:
  - **Workstream A (Cross-Role Workflows):** Executed `scripts/phase24-cross-role-workflow-validation.mjs` testing full 26-step encounter lifecycle between Patient, Receptionist, Doctor, and Admin (**26 / 26 PASSED, 100%**).
  - **Workstream B (Security & Authorization):** Executed `scripts/phase24-security-audit.mjs` verifying RBAC boundaries, fail-closed anti-IDOR protections, single-use refresh token rotation, replay attack detection, token family revocation, and injection defenses (**23 / 23 PASSED, 100%**).
  - **Workstream C (Backend Reliability & Database Integrity):** Executed `.\mvnw.cmd test` (**103 / 103 passed, 0 failures**), verified 12 Flyway SQL migrations (`V1`–`V12`), partial unique indexes (`uq_appointment_slot_active`, `uq_appointment_doctor_in_consultation`, `uq_payment_method_txn_ref`), and PostgreSQL append-only trigger on `audit_logs` table (`V12`).
  - **Workstream D (WebSocket Real-Time Queue Reliability):** Executed `scripts/phase24-websocket-audit.mjs` testing native STOMP connection, permitted topic subscriptions (`^/topic/queue/[A-Za-z0-9-]+$`), rejection of forbidden topics, prohibition of client `SEND` frames, concurrent multi-subscriber fan-out, and verified **zero PII leakage** in broadcast payloads (**7 / 7 PASSED, 100%**).
  - **Workstream E (Frontend Quality, Bundle Optimization & Performance):**
    - Refactored `routes.jsx` with `React.lazy` and `Suspense` and configured Rollup `manualChunks` in `vite.config.js`.
    - Reduced monolithic main bundle from **1,495 KB (398.78 KB gzip)** down to **128.25 KB (42.54 KB gzip)** — a **91.4% reduction in entry chunk size** with **0 chunk size warnings**.
    - Executed Vitest test suite: **33 test files, 171 passed (171), 0 failures (100% green)**.
    - Executed static analysis: ESLint **0 errors, 0 warnings**.
    - Verified responsive behavior across Desktop, Laptop, Tablet, and Mobile viewports with zero document-level horizontal overflow.
  - **Workstream F (Deployment & Infrastructure Readiness):** Formulated production deployment guide and runbook covering Docker Compose, health checks, secrets management, reverse proxy configuration, structured ECS JSON logging, and disaster recovery procedures.
  - **Workstream G (Error Handling & API Contract Consistency):** Audited uniform structured `ErrorResponse` records (`timestamp`, `status`, `code`, `message`, `path`, `fieldErrors`), fail-closed authorization responses, and error sanitization (Spring Boot built-in RFC 7807 problem details explicitly disabled to guarantee 100% client and test suite compatibility).
  - **Workstream H (Automated Test Strategy & Quality Gate):** Multi-tiered automated test suite established and verified.
- [x] Preserved all existing QA data across Admin, Receptionist, Doctor, and Patient portals with zero modifications to historical Flyway migrations or PostgreSQL volume.
- [x] Published Phase 24 documentation deliverables:
  - `docs/PHASE_24_SYSTEM_WIDE_AUDIT_REPORT.md`
  - `docs/PHASE_24_SECURITY_FINDINGS.md`
  - `docs/PHASE_24_CROSS_ROLE_VALIDATION.md`
  - `docs/PRODUCTION_READINESS_CHECKLIST.md`

### Phase 25 — Production Hardening & Deployment Verification
- [x] **Docker & Local Infrastructure Verification:**
  - Confirmed Docker Desktop 29.9.3 and Docker Compose v5.7.0.
  - Diagnosed Phase 24 exit 1 root cause: Windows sandbox security isolation restricts direct access to system named pipe `//./pipe/docker_engine`; running with standard administrative privileges executes cleanly with zero errors.
  - Verified `caresync-postgres` container healthy on port 5432 with persistent volume `caresync_pgdata`.
- [x] **Critical Security Remediation — WebSocket STOMP Authorization:**
  - Hardened `WebSocketSecurityConfig.java`:
    - STOMP `CONNECT` frame extracts and validates `Authorization: Bearer <token>` via `JwtService`, storing authenticated `UserPrincipal` in session attributes.
    - STOMP `SUBSCRIBE` frame strictly authorizes destination doctor ID: Doctor A can only subscribe to Doctor A's queue (`/topic/queue/{doctorId}`); cross-subscribing to Doctor B is rejected fail-closed with `MessageDeliveryException`.
    - Patients and unauthenticated callers are denied all queue subscriptions.
    - Receptionists and Administrators are permitted to monitor doctor queues for multi-desk desk operations.
    - Inbound client-to-server `SEND` frames remain strictly blocked.
    - Outbound queue broadcast messages contain zero PII (`QueueUpdateMessage`).
  - Updated `frontend/src/hooks/use-queue-websocket.js` to transmit JWT Bearer header on STOMP `CONNECT`.
  - Authored 8 unit tests in `WebSocketSecurityConfigTest.java` (100% passed).
  - Added live integration test in `QueueIT.java` (`doctorCannotSubscribeToAnotherDoctorQueueOverWebSocket`, 100% passed).
  - Executed live verification harness `scripts/phase25-websocket-live-verification.mjs` (**10 / 10 passed, 100%**).
- [x] **Authoritative Error Response Contract Clarification:**
  - Confirmed custom structured `ErrorResponse` schema (`timestamp`, `status`, `code`, `message`, `path`, `fieldErrors`) as specified in `docs/openapi.yaml`.
  - Clarified that Spring Boot 4 RFC 7807 problem details is explicitly disabled (`spring.mvc.problemdetails.enabled: false`) for 100% backward compatibility and test stability. Corrected Phase 24 documentation.
- [x] **Full Maven Verification Lifecycle (`.\mvnw.cmd verify`):**
  - Surefire Unit & Slice Tests: **109 / 109 passed** (0 failures, 0 errors, 0 skipped).
  - Failsafe Integration Tests with Testcontainers & PostgreSQL: **27 / 27 passed** (0 failures, 0 errors, 0 skipped).
  - Total Backend Tests: **136 / 136 passed (100% green)**.
- [x] **Frontend Quality & Build Verification:**
  - Vitest Unit Suites: **33 test files, 171 / 171 passed (100% green)**.
  - Static Analysis: ESLint **0 errors, 0 warnings**.
  - Production Build: Vite 6 compiled successfully in **10.24s**, entry chunk **128.26 KB (42.52 KB gzip)**, **0 chunk size warnings**.
- [x] **PostgreSQL Backup & Isolated Restoration Drill:**
  - Generated compressed dump via `pg_dump`: `backups/caresync_backup.dump` (86,367 bytes).
  - Created isolated test database `caresync_isolated_restore_test` and restored dump via `pg_restore`.
  - Verified 23 public tables, all 12 Flyway migrations (`V1`–`V12`), and matched record counts (19 users, 25 patients, 16 appointments, 70 audit logs, 5 invoices).
  - Dropped isolated test database cleanly; live database and persistent volume remained completely untouched.
- [x] **Production End-to-End Smoke Test:**
  - Executed `scripts/phase25-production-smoke-test.mjs` validating complete 20-step clinical, administrative, and financial lifecycle.
  - **20 / 20 steps passed (100% success rate)**.
- [x] **Production Deployment Artifacts:**
  - Authored multi-stage `backend/Dockerfile` (Java 25 JRE, non-root user `caresync:caresync`, G1GC, virtual threads).
  - Authored multi-stage `frontend/Dockerfile` (Node 22 builder $\rightarrow$ Nginx Alpine).
  - Authored `docker-compose.prod.yml` and verified syntax with `docker compose config`.
  - Authored production reverse proxy configuration `deploy/nginx/caresync.conf` with modern TLS 1.3/1.2 ciphers, strict security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options), and STOMP WebSocket upgrade routing.
- [x] **Preserved all existing QA data across Admin, Receptionist, Doctor, and Patient portals with zero modifications to historical Flyway migrations or PostgreSQL volume.**
- [x] **Final Quality Gate Verdict:** **`PASS – Ready for Deployment, External Deployment Not Verified`**.
### Phase 25.1 — Nginx Reverse Proxy, TLS & Production Routing Hardening
- [x] **Unified Same-Origin Routing Architecture:**
  - Standardized on `https://hospital.caresync.health` for React SPA, REST APIs (`/api/`), and STOMP WebSocket (`/ws/`), eliminating cross-origin preflight latency and CORS complexity.
- [x] **Nginx Security Header Inheritance Remediation:**
  - Solved Nginx's silent header drop in child `location` blocks by creating `deploy/nginx/snippets/security-headers.conf` and systematically including it across `/`, `/assets/`, `/api/`, and `/ws/`.
  - Configured conservative initial HSTS policy: `max-age=15724800; includeSubDomains` (6 months; preload omitted until permanent production verification).
  - Aligned Content Security Policy (CSP) with Vite build output, permitting Google Fonts (`fonts.googleapis.com` for styles, `fonts.gstatic.com` for fonts) while forbidding `unsafe-eval`.
- [x] **Nginx Reverse Proxy & Routing Hardening:**
  - Upgraded syntax to modern Nginx 1.25.1+ standards: `listen 443 ssl; http2 on;`.
  - Configured dynamic WebSocket connection upgrade mapping (`map $http_upgrade $connection_upgrade`).
  - Implemented upstream keepalive connection pooling (`proxy_http_version 1.1; proxy_set_header Connection "";`).
  - Added `proxy_hide_header X-Frame-Options;` and `proxy_hide_header X-Content-Type-Options;` on proxy locations to eliminate duplicate edge security headers.
  - Fully blocked public exposure of Spring Boot Actuator (`location /actuator { return 404; }`).
  - Enforced immutable asset caching (`/assets/*`) with `try_files $uri =404;` and `no-cache, no-store, must-revalidate` on SPA routes.
  - Configured HTTP port 80 to redirect to canonical HTTPS origin while preserving `/.well-known/acme-challenge/` for Certbot.
- [x] **Frontend WebSocket Hook Optimization:**
  - Refactored `use-queue-websocket.js` URL derivation to properly handle standard portless HTTPS hosts (`wss://hospital.caresync.health/ws/websocket`), avoiding invalid trailing colons.
  - Re-verified full frontend Vitest suite: **33 test files, 171 / 171 tests passed (100% green)**.
  - Recompiled production bundle: Vite 6 build succeeded in **9.89s** (128.26 KB entry chunk).
- [x] **Operational Runbooks & Automation:**
  - Authored `deploy/scripts/init-letsencrypt.sh` (two-stage TLS bootstrap overcoming the chicken-and-egg startup problem).
  - Authored `deploy/scripts/renew-certificates.sh` (zero-downtime Certbot renewal).
  - Self-contained `frontend/Dockerfile` by creating `frontend/nginx.conf`.
- [x] **Automated Live Containerized Verification:**
  - Tested configuration syntax via `docker run ... nginx:alpine nginx -t` (**Exit 0, syntax ok**).
  - Created and executed `scripts/phase25-1-nginx-validation.mjs` against a live local Nginx container: **24 / 24 test scenarios PASSED (100% success rate)**, verifying port 80 canonical redirects, ACME challenge passthrough, CSP and security headers, SPA route direct navigation, static asset immutable caching, Actuator 404 blocking, REST API proxying with structured error pass-through, and all 10 STOMP WebSocket scenarios (including cross-doctor IDOR prevention and zero PII).
- [x] **Preserved all existing QA data across Admin, Receptionist, Doctor, and Patient portals with zero modifications to historical Flyway migrations or PostgreSQL volume.**
- [x] **Final Quality Gate Verdict:** **`PASS – Local Nginx Configuration Verified; Public Deployment Not Verified`**.
### Phase 25.2A — CareSync Deployment Configuration Corrections
- [x] **HSTS Policy Alignment:**
  - Removed outdated 1-year HSTS and `preload` entry from `PRODUCTION_READINESS_CHECKLIST.md` (line 142).
  - Aligned all documentation with authoritative Nginx policy in `security-headers.conf`: `max-age=15724800; includeSubDomains` (6 months without preload).
  - Documented strict conditions for future preload submission (minimum 6 months continuous verified HTTPS operation).
- [x] **Compression Documentation Correction:**
  - Removed inaccurate claims of Brotli compression from `PRODUCTION_READINESS_CHECKLIST.md` (line 49).
  - Documented active Gzip compression (`gzip on`, level 6, web MIME types) and noted Brotli is deferred (standard `nginx:1.27-alpine` does not package `ngx_brotli`).
- [x] **Docker Rollback Procedure Correction:**
  - Removed invalid command `docker compose rollback` from `PRODUCTION_READINESS_CHECKLIST.md`.
  - Added `image: ${CARESYNC_BACKEND_IMAGE:-caresync-backend:latest}` to `backend` service in `docker-compose.prod.yml`.
  - Documented valid rollback strategy covering:
    - Backend rollback via tagged images and `docker compose up -d --no-build backend`.
    - Frontend rollback via versioned `dist` directory archive and Nginx reload.
    - Version coupling and forward-only Flyway migration rules (`V1`–`V12` append-only; Expand/Contract pattern).
    - Point-in-time database backup restoration drill (`pg_dump` / `pg_restore`).
- [x] **TLS Certificate Volume Mount Alignment:**
  - Updated `docker-compose.prod.yml` to bind-mount `./certbot/www:/var/www/certbot:ro` and `./certbot/conf:/etc/letsencrypt:ro`, matching `init-letsencrypt.sh` and `renew-certificates.sh`.
  - Removed unused named volume `certbot_webroot`.
  - Verified Nginx reads certificates directly from where Certbot writes them and ACME challenge tokens are shared.
- [x] **Lightweight Validation:**
  - `docker compose -f docker-compose.prod.yml config` $\rightarrow$ Exit code 0 (valid syntax).
  - `bash -n` on `init-letsencrypt.sh` and `renew-certificates.sh` $\rightarrow$ Exit code 0 (valid syntax).
  - `docker run ... nginx -t` $\rightarrow$ Exit code 0 (syntax ok, test successful).
  - Confirmed zero application code or database modifications.
- [x] **Final Quality Gate Verdict:** **`PASS — All four corrections implemented and validated`**.
- [x] **Published Deliverables:**
  - `docs/PHASE_25_2A_CORRECTION_REPORT.md`
  - `docs/PRODUCTION_READINESS_CHECKLIST.md` (updated)
  - `docs/PROGRESS.md` (updated)

### Phase 25.2B — Final Operational Safety Verification
- [x] **Read-only audit completed across deployment scripts, Docker Compose, rollback mechanisms, and zero-downtime procedures.**
- [x] **Published Deliverables:**
  - `docs/PHASE_25_2B_OPERATIONAL_SAFETY_REPORT.md`

## 2026-11-14: Phase 26 — CareSync Portfolio Deployment Preparation
- [x] **Architecture Decoupling:** Designed the distributed cloud deployment blueprint decoupling Cloudflare Pages (Frontend SPA), Render Web Service (Spring Boot Modular Monolith), and Neon (Serverless PostgreSQL 16).
- [x] **Backend Port Binding:** Configured `server.port: ${PORT:${SERVER_PORT:8080}}` in `application.yml` and parameterized serverless HikariCP pool settings (`maximum-pool-size: 10`, `minimum-idle: 2`, `connection-timeout: 30000`) in `application-prod.yml`.
- [x] **Container Hardening:** Updated `backend/Dockerfile` healthcheck to support dynamic `$PORT` while preserving non-root user `caresync:caresync` (UID/GID 10001) and G1GC RAM limits.
- [x] **Frontend Dynamic WebSocket & Cold-Start Resilience:**
  - Enhanced `use-queue-websocket.js` to dynamically derive `wss://` endpoints from `VITE_WS_URL` or `VITE_API_BASE_URL` when deployed cross-origin.
  - Increased Axios client timeout to 60,000ms (`VITE_API_TIMEOUT || 60000`) in `api.js` to gracefully absorb Render free-tier JVM cold starts.
  - Added `frontend/public/_redirects` (`/* /index.html 200`) for Cloudflare Pages SPA client-side routing.
  - Added `frontend/public/_headers` for edge security headers (`nosniff`, `DENY`, `strict-origin-when-cross-origin`).
- [x] **Comprehensive Quality Gate Verification:**
  - **Frontend:** 33 test files, 171 / 171 tests passed (100% green); Vite 6 production build succeeded in 20.56s (128 KB bundle).
  - **Backend:** 109 / 109 unit/controller tests passed (100% green).
  - Preserved pure JavaScript ES6+ / JSX frontend (zero TypeScript).
  - Preserved all 12 historical Flyway migrations (`V1`–`V12`) and append-only audit trigger.
  - Zero mock data or fake API responses introduced.
- [x] **Authoritative Documentation Deliverables Authored:**
  - `docs/PHASE_26_DEPLOYMENT_ARCHITECTURE.md`
  - `docs/RENDER_BACKEND_DEPLOYMENT.md`
  - `docs/NEON_DATABASE_SETUP.md`
  - `docs/CLOUDFLARE_PAGES_DEPLOYMENT.md`
  - `docs/PORTFOLIO_DEMO_PLAN.md`
  - `docs/PHASE_26_DEPLOYMENT_VERIFICATION.md`
  - `docs/PHASE_26_DEPLOYMENT_REPORT.md`
- [x] **Final Phase 26 Verdict:** **`READY FOR DEPLOYMENT PREPARATION`**

## 2026-11-14: Phase 26.2 — CareSync Portfolio Deployment Safety & Demo Readiness
- [x] **Credential Security & Sanitization:**
  - Removed all plaintext demo credentials and BCrypt hashes from `deploy/demo-seed.sql` and public documentation.
  - Applied `!LOCKED_REQUIRES_BOOTSTRAP!` sentinel across seeded accounts; added environment variables `CARESYNC_DEMO_DOCTOR_PASSWORD` and `CARESYNC_DEMO_PATIENT_PASSWORD` to unlock demo accounts safely on startup via `StaffAccountBootstrapRunner`.
  - Added unit test `bootstrapsDemoAccountsWhenPasswordsProvided` to `StaffAccountBootstrapRunnerTest` (3/3 tests passed).
- [x] **WebSocket Transport & URL Resolution:**
  - Verified frontend uses native browser `WebSocket` with zero SockJS dependency.
  - Implemented and exported `resolveWebSocketUrl` in `use-queue-websocket.js` targeting native `/ws` directly without appending `/websocket`, normalizing protocols, and providing local dev port 8080 fallback.
  - Added integration test `sockJsEndpointAcceptsInfoProbeAndEstablishesStompSession` in `QueueIT.java` testing `GET /ws/info` and `SockJsClient` STOMP session (5/5 tests passed).
- [x] **Frontend Environment Configuration:**
  - Implemented and exported `normalizeApiBaseUrl` in `api.js` handling trailing slashes, appending `/api` if origin-only, and preventing `/api/api` duplication.
  - Created `frontend/src/test/environment-config.test.js` validating normalization and URL resolution (8/8 tests passed).
- [x] **Neon Documentation Alignment:**
  - Explicitly documented: *"PostgreSQL 16 compatibility has been locally verified. Actual Neon deployment verification remains pending."*
  - Reconciled port 5432 (direct) vs port 6543 (PgBouncer pooler) descriptions in `docs/NEON_DATABASE_SETUP.md` and `docs/PHASE_26_1_NEON_COMPATIBILITY.md`.
- [x] **Synthetic Demonstration Seed Reliability:**
  - Dynamically anchored today's queue appointment in `deploy/demo-seed.sql` using `date_trunc('hour', NOW() AT TIME ZONE 'Asia/Kolkata')`.
  - Added Appointment #3 in `BOOKED` status for today, enabling immediate Receptionist Arrival Desk check-in testing at any hour.
  - Verified 4 appointments and complete idempotency in `FlywayMigrationIT.java` (4/4 tests passed).
- [x] **Full-Stack Verification:**
  - Backend: `.\mvnw.cmd clean verify` passed 141/141 tests (Surefire: 110 unit tests, Failsafe: 31 integration tests, 0 failures, 0 skipped).
  - Frontend: `npm.cmd test -- --run` passed 179/179 tests across 34 test files (100% green).
  - ESLint: `npm.cmd run lint` passed with 0 errors, 0 warnings.
  - Production Build: `npm.cmd run build` compiled clean production bundle in 10.86s; `_redirects` and `_headers` verified in `frontend/dist/`.
- [x] **Authored Phase 26.2 Report:**
  - Created `docs/PHASE_26_2_PORTFOLIO_DEPLOYMENT_SAFETY_REPORT.md` covering all 13 sections with explicit methodological labels.
- [x] **Final Phase 26.2 Readiness Verdict:** **`PASS — Local portfolio deployment preparation verified.`**

## 2026-11-14: Phase 26.2.1 — Final Configuration, WebSocket Security & Frontend Tooling Corrections
- [x] **Workstream A — WebSocket Allowed Origins & STOMP Security:**
  - Removed all wildcard origin patterns (`*`) from `WebSocketConfig.java` and `CorsConfig.java`. Sanitized origins list to trim whitespace and explicitly reject `*`.
  - Harmonized local development allowed origins (`http://localhost:3000,http://localhost:5173`) in `application.yml`, `application-dev.yml`, and `application-test.yml`.
  - Enforced strict JWT authentication on STOMP `CONNECT` in `WebSocketSecurityConfig.java`, rejecting missing or invalid tokens immediately at handshake.
  - Added integration tests in `QueueIT.java` verifying native `/ws` and SockJS origin enforcement (local origin accepted, production origin accepted, unapproved origin rejected), STOMP `CONNECT` token requirements, and doctor queue isolation (8/8 tests passed).
- [x] **Workstream B — Environment URL Normalization Edge-Case Coverage:**
  - Enhanced `normalizeApiBaseUrl` in `api.js` to preserve custom base paths (e.g. `/backend` -> `/backend/api`), collapse accidental duplicate trailing `/api/api` paths, and strip query strings / hash fragments.
  - Enhanced `resolveWebSocketUrl` in `use-queue-websocket.js` to handle whitespace/empty `VITE_WS_URL` fallback, strip query/hash fragments, preserve explicit `ws://`/`wss://` schemes, clean trailing slashes, and catch malformed URLs gracefully.
  - Expanded `frontend/src/test/environment-config.test.js` to 16 tests covering all edge-case scenarios (16/16 tests passed).
- [x] **Workstream C — Fix jsconfig.json Deprecation Warning:**
  - Removed deprecated `"baseUrl": "."` from `frontend/jsconfig.json`.
  - Configured `@/*` path mapping using relative `./src/*`, preserving seamless consistency with Vite 6 alias `path.resolve(__dirname, './src')`.
- [x] **Workstream D — Full Regression Verification:**
  - Backend: `.\mvnw.cmd clean verify` passed 144/144 tests (Surefire: 110 unit tests, Failsafe: 34 integration tests, 0 failures, 0 skipped).
  - Frontend: `npm.cmd test -- --run` passed 187/187 tests across 34 test files (100% green).
  - Linting: `npm.cmd run lint` passed with 0 errors, 0 warnings.
  - Production Build: `npm.cmd run build` compiled clean production bundle in 14.68s.
- [x] **Workstream E — Documentation & Deliverables:**
  - Authored `docs/PHASE_26_2_1_FINAL_CONFIGURATION_CORRECTIONS.md`.
  - Updated `docs/PROGRESS.md`.
- [x] **Final Phase 26.2.1 Verdict:** **`PASS — Configuration and security corrections verified locally.`**















