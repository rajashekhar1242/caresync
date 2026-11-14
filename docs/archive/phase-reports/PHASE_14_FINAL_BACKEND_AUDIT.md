# Hospital & Clinic Management System (HCMS) – Phase 14 Final Backend Audit & Hardening Report

**Audit Date:** 2026-11-12
**Scope:** Complete Hospital & Clinic Management System (HCMS) Backend (`Phase 1` through `Phase 13`, package namespace `com.caresync.*`)
**Workspace:** `Z:\javaproject` (`backend/` + `docs/` + `docker-compose.yml` + `.env.example` + `.gitignore`)
**Baseline Runtime & Build Verification:** Java `25`, Spring Boot `4.1.2`, PostgreSQL `16-alpine` (Testcontainers), Flyway `V1`–`V12`, Maven Surefire & Failsafe

---

## A. Executive Summary

- **Overall Verdict:** **CONDITIONAL PASS** — The Hospital & Clinic Management System (HCMS) backend implements all **55 HTTP operations** across **17 `@RestController`s** and the **STOMP `/ws` queue channel** with full OpenAPI parity, passes all **110 verified automated tests (91 Surefire + 19 PostgreSQL 16 Testcontainers ITs; 0 failures, 0 errors, 0 skipped)**, and contains **0 CRITICAL** and **0 HIGH** confirmed defects. HCMS is **ready for React frontend integration** against the documented contracts, while **6 MEDIUM**, **8 LOW**, and **6 INFORMATIONAL** findings (runtime edge cases, concurrency/rate-limit/refresh-replay hardening, documentation currency, and production deployment controls) should be remediated before production rollout.
- **Audit Scope:**
  - Build, wrapper, and config (`backend/pom.xml`, `mvnw`, `mvnw.cmd`, `application.yml`, `application-dev.yml`, `application-prod.yml`, `application-test.yml`, `logback-spring.xml`, `docker-compose.yml`, `.env.example`, `.gitignore`)
  - Database schema & Flyway migrations (`V1__create_identity_tables.sql` through `V12__protect_audit_logs_append_only.sql`)
  - All 13 backend packages (`common`, `auth`, `audit`, `reference`, `doctor`, `patient`, `appointment`, `queue`, `consultation`, `medicine`, `prescription`, `billing`, `report`) across `202` main Java files and `57` test Java files
  - Documentation & specs (`README.md`, `docs/PROGRESS.md`, `docs/domain.md`, `docs/openapi.yaml`)
- **Confirmed Test Results (post-verification XML inspection):**
  - `.\mvnw.cmd clean test`: **91 tests run, 0 failures, 0 errors, 0 skipped** across **42** Surefire suites
  - `.\mvnw.cmd verify`: **19 integration tests run, 0 failures, 0 errors, 0 skipped** across **12** Failsafe suites (PostgreSQL 16 Testcontainers)
  - **Combined Total:** **110 tests run, 0 failures, 0 errors, 0 skipped**
- **Major Risks:**
  1. Uncaught exception propagation from synchronous `@TransactionalEventListener(AFTER_COMMIT)` in `QueueMessagePublisher` (and running `QueueService.buildQueueUpdateMessage` under `REQUIRED` while the committed outer transaction is still tearing down) can convert an already-committed check-in/call-next/completion into HTTP `500 INTERNAL_ERROR`.
  2. Concurrent `lastAccessNanos` mutation during `List.sort` in `RateLimitFilter.evictIfNeeded` risks `IllegalArgumentException` (`TimSort` comparison-contract violation) under cache-pressure concurrency.
  3. Refresh-token reuse/replay rejection (`AuthService.refresh`) revokes neither the token family nor active sessions of the compromised user, leaving a stolen rotated token valid until expiration.
  4. Missing proxy `server.forward-headers-strategy` and `X-Forwarded-For` support means reverse-proxied deployments collapse all client traffic onto the proxy IP for rate limiting and audit IP capture (though spoofing via raw `X-Forwarded-For` is safely prevented today).
  5. Unchecked null elements in `WeeklyScheduleRequest.entries`, nullable `clinic.getAddress()` in `PrescriptionPdfService`, and unguarded `NUMERIC(12,2)` line-item multiplication overflow in `InvoiceService.addInvoiceItem` can trigger unhandled `500 INTERNAL_ERROR`.

---

## B. Phase-by-Phase Verification & Module Architecture

### Phase-to-Package Mapping

| Phase | Domain Scope | Primary Package(s) / Locations | Primary Verification Suites |
|---|---|---|---|
| **Phase 1** | Skeleton, Maven, profiles, Docker Compose, logging | `CareSyncApplication`, `pom.xml`, `application*.yml`, `logback-spring.xml`, `docker-compose.yml` | `Phase1BootstrapTest` |
| **Phase 2** | PostgreSQL schema, constraints, partial indexes, seed data | `src/main/resources/db/migration/V1`–`V12` | `FlywayMigrationFileTest`, `FlywayMigrationIT` |
| **Phase 3** | Shared DTOs, exceptions, error writer, money/tz/IP utils, CORS | `com.caresync.common.{config,dto,exception,util}` | `MoneyUtilsTest`, `TimeZoneUtilsTest`, `ErrorResponseWriterTest`, `GlobalExceptionHandlerTest` |
| **Phase 4** | JWT, Spring Security, Bucket4j rate limiting, auth lifecycle | `com.caresync.auth.*`, `com.caresync.common.security.*`, `RateLimitFilter` | `AuthServiceTest`, `AuthControllerTest`, `StaffAccountBootstrapRunnerTest`, `JwtServiceTest`, `RateLimitFilterTest`, `MethodSecurityLoggingTest`, `AuthSecurityIT` |
| **Phase 5** | Immutable append-only audit log infrastructure & query API | `com.caresync.audit.*`, `V8`, `V12` | `AuditServiceTest`, `AuditLogControllerTest`, `AuditLogIT` |
| **Phase 6** | Reference data (`Clinic`, `Specialization`) & `Department` CRUD | `com.caresync.reference.*`, `V2`, `V10` | `ReferenceDataServiceTest`, `ReferenceDataControllerTest`, `ReferenceDataIT` |
| **Phase 7** | Doctor profiles, user linkage, search/filtering, active flags | `com.caresync.doctor.{entity,dto,repository,service,controller}` | `DoctorServiceTest`, `DoctorControllerTest`, `DoctorIT` |
| **Phase 8** | Weekly schedules, doctor leaves, timezone-aware slot generation | `com.caresync.doctor.*` (`Schedule*`, `Leave*`), `com.caresync.appointment.{controller,service}.Slot*` | `ScheduleServiceTest`, `LeaveServiceTest`, `SlotServiceTest`, `ScheduleLeaveSlotControllerTest`, `SchedulingIT` |
| **Phase 9** | Patient profiles, `text[]` allergies, scoped search, `PATIENT_READ` audit | `com.caresync.patient.*`, `JpaDoctorPatientScopeAdapter` | `PatientServiceTest`, `PatientControllerTest`, `PatientIT` |
| **Phase 10** | Appointment booking, daily token counters, strict state machine | `com.caresync.appointment.*`, `V5`, `V9` | `AppointmentServiceTest`, `StatusTransitionServiceTest`, `AppointmentControllerTest`, `AppointmentIT` |
| **Phase 11** | Live queue state, `call-next`, public board, STOMP/SockJS WS | `com.caresync.queue.*` | `WebSocketSecurityConfigTest`, `QueueServiceTest`, `QueueControllerTest`, `QueueIT` |
| **Phase 12** | Consultations, medicines, safety check (allergy/interaction), Rx & PDF | `com.caresync.consultation.*`, `com.caresync.medicine.*`, `com.caresync.prescription.*`, `V6`, `V10` | `ConsultationServiceTest`, `ConsultationControllerTest`, `MedicineControllerTest`, `SafetyCheckServiceTest`, `PrescriptionServiceTest`, `PrescriptionPdfServiceTest`, `PrescriptionControllerTest`, `ClinicalIT` |
| **Phase 13** | Auto-invoicing, payments, credit notes, voids, invoice PDF, admin reports | `com.caresync.billing.*`, `com.caresync.report.*`, `V7`, `V9` | `InvoiceServiceTest`, `InvoicePdfServiceTest`, `InvoiceControllerTest`, `BillingIT`, `ReportServiceTest`, `ReportControllerTest`, `ReportIT` |

### Module Dependency Overview

- **Acyclic Port/Adapter Boundaries (Verified):**
  - `auth -> patient/doctor`: `ProfileLinkPort` (`auth.service`) implemented by `JdbcProfileLinkAdapter` (`auth.service`) over `patients` / `doctors` SQL.
  - `patient -> appointment`: `DoctorPatientScopePort` (`patient.service`) implemented by `JpaDoctorPatientScopeAdapter` (`appointment.service`) via JPA `EXISTS` subquery.
  - `appointment -> consultation`: `ConsultationLifecyclePort` (`appointment.service`) implemented by `ConsultationLifecycleAdapter` (`consultation.service`), overriding the `@ConditionalOnMissingBean` fallback `JdbcConsultationLifecycleAdapter` (`appointment.service`).
  - `appointment -> billing`: `AppointmentBillingPort` (`appointment.service`) implemented by `InvoiceService` (`billing.service`), overriding the `@ConditionalOnMissingBean` no-op lambda in `AppointmentIntegrationConfig`.
  - `appointment -> queue`: Spring domain event `QueueChangedDomainEvent` published by `StatusTransitionService` and consumed post-commit by `QueueMessagePublisher`.
- **Direct Cross-Module Access Notes:**
  - `LeaveService.createLeave` queries `appointments` directly via `JdbcTemplate` (`LeaveService.java:94-105`) rather than an appointment availability port.
  - `consultation`, `prescription`, `appointment`, `queue`, and `billing` reference `doctor`/`patient`/`reference`/`medicine` JPA entities cleanly downstream without creating circular package dependencies (only `report` aggregates read-only across tables via parameterized `NamedParameterJdbcTemplate` SQL).

### Detailed Phase Observations (1–13)

- **Phases 1–3 (Skeleton, Migrations, Common):** `application.yml` enforces `open-in-view: false`, `hibernate.ddl-auto: validate`, `hibernate.jdbc.time_zone: UTC`, `server.error.include-* = never/false`, and `problem-details.enabled: false`. `MoneyUtils` & `TimeZoneUtils` handle rounding and DST gaps/overlaps consistently.
- **Phase 4 (Auth & Security):** BCrypt(10), 256-bit HS256 JWT (900s access / 7d refresh), single-use SHA-256 refresh token rotation with pessimistic PostgreSQL row updates, idempotent logout, and bounded Bucket4j rate limiting (`10_000` entries / `5m` idle TTL). Remaining gaps: `RateLimitFilter` concurrent TimSort mutation (F-02), refresh replay family revocation (F-03), proxy IP handling (F-04), BCrypt UTF-8 byte length (F-07), `JwtService` null-claim NPE (F-09), and `RegisterRequest.fullName` trim order (F-10).
- **Phase 5 (Audit):** Same-transaction `REQUIRED` persistence guarantees atomicity with audited operations; `V12` prevents `UPDATE`/`DELETE` row mutations; `TRUNCATE` protection (F-08) and runtime role privilege separation are open.
- **Phases 6–8 (Reference, Doctors, Schedules, Leaves, Slots):** `@EntityGraph` prevents doctor-user N+1 queries; `DOCTOR_INACTIVE -> OUTSIDE_BOOKING_WINDOW -> ON_LEAVE -> NO_SCHEDULE` precedence matches OpenAPI; missing `@NotNull` on `WeeklyScheduleRequest.entries` list items (F-05) and non-locked concurrent schedule/leave races (F-13) were identified.
- **Phase 9 (Patients):** `EXISTS` subquery avoids count inflation and N+1; `text[]` allergies deduplicate case-insensitively; `PATIENT_READ` audit occurs strictly post-authorization in `@Transactional`.
- **Phases 10–11 (Appointments & Queue/WebSocket):** Partial unique indexes (`uq_appointment_slot_active`, `uq_appointment_doctor_in_consultation`) and `INSERT ... ON CONFLICT DO UPDATE RETURNING` (`DoctorDayCounterRepository`) handle slot and token races atomically; `QueueService.getQueueBoard` runs bounded batched queries with zero PII. Confirmed defect in `QueueMessagePublisher` exception isolation & `AFTER_COMMIT` tx propagation (F-01).
- **Phase 12 (Clinical & Prescriptions):** Symmetric `medicine_a_id < medicine_b_id` interaction detection, server-side recomputed severe-warning block, prescription immutability, ownership enforcement, and OpenPDF download (`no-store`) work end-to-end; latent null guard defect on `clinic.getAddress()` in `PrescriptionPdfService` (F-06) and missing Phase 12 entry in `PROGRESS.md` (F-14) identified.
- **Phase 13 (Billing & Reports):** `PESSIMISTIC_WRITE` row locks (`findLockedById`), exact `BigDecimal` math (`NUMERIC(12,2)`), idempotent zero-fee `PAID` auto-close, `uq_payment_method_txn_ref` duplicate detection (`409 DUPLICATE_TXN_REF`), `VOID` protection, SQL-side report aggregations (`AT TIME ZONE`, `COUNT FILTER`, signed `net`, null `noShowRate`), and all 13 billing/report endpoints pass. Confirmed low edge case on `NUMERIC(12,2)` item multiplication overflow (F-11) and `Timestamp.from` JVM TZ binding detail (F-18).

---

## C. Findings Table

| ID | Severity | Module | Finding | Evidence | Impact | Recommended Fix |
|---|---|---|---|---|---|---|
| **F-01** | **MEDIUM** | `queue` | `QueueMessagePublisher.onQueueChanged` has no `try/catch` and invokes `QueueService.buildQueueUpdateMessage` (`@Transactional(readOnly = true)` with default `Propagation.REQUIRED`) synchronously inside `TransactionPhase.AFTER_COMMIT`. | `QueueMessagePublisher.java:26-30`; `QueueService.java:215-240` | Any failure building or broadcasting the STOMP message propagates back to the HTTP caller as `500 INTERNAL_ERROR` **after** the DB state change/invoice already committed; also reuses committed outer tx synchronization context instead of a clean read context. | Wrap `onQueueChanged` body in `try/catch` logging sanitized error without rethrowing, and annotate `buildQueueUpdateMessage` with `Propagation.REQUIRES_NEW` (or `NOT_SUPPORTED`). |
| **F-02** | **MEDIUM** | `common` (`RateLimitFilter`) | `evictIfNeeded` sorts `candidates` by `BucketEntry.lastAccessNanos` while concurrent request threads mutate `entry.touch(now)` outside `evictionLock`. Also, forced 20% LRU eviction on cache saturation can drop active throttled IPs. | `RateLimitFilter.java:96, 136-156, 163-172` | Concurrent mutation of sort keys during `List.sort` (`TimSort`) can throw `IllegalArgumentException`, failing incoming `/api/auth/*` or `/api/queue/board` requests with `500`. | Snapshot `(entry.getKey(), entry.getValue(), entry.getValue().lastAccessNanos)` into immutable tuples before sorting inside `evictionLock`, and consider Caffeine or segmented eviction of non-blocked idle entries. |
| **F-03** | **MEDIUM** | `auth` | `AuthService.refresh` detects revoked/reused refresh tokens (`revokedAt != null` or `updated == 0`) and returns `401 INVALID_REFRESH_TOKEN`, but does **not** revoke the rotated replacement chain or the user's other active refresh tokens. | `AuthService.java:177-198` | On refresh-token theft, whichever party calls `/refresh` first keeps a valid rotated refresh token for up to 7 days even after replay is detected on the second caller. | Track token families (e.g., `family_id`) or call `revokeAllActiveByUserId(userId, now)` in a committed (`REQUIRES_NEW` or post-revocation before throwing) transaction whenever `revokedAt != null` or `updated == 0` occurs. |
| **F-04** | **MEDIUM** | `common` / Config | `RequestIpUtils.extractClientIp` reads only `HttpServletRequest.getRemoteAddr()`, and neither `application.yml` nor `application-prod.yml` configures `server.forward-headers-strategy` or trusted proxy ranges. | `RequestIpUtils.java:12-21`; `application.yml:32-38`; `application-prod.yml:1-16` | Safe from `X-Forwarded-For` spoofing directly, but behind any reverse proxy/load balancer all users share one proxy IP: legitimate traffic triggers global rate-limit exhaustion and `audit_logs.ip_address` / `SECURITY_EVENTS` lose real client IPs. | Configure `server.forward-headers-strategy=framework` (or `native`) alongside trusted proxy CIDR configuration (`server.tomcat.remoteip.internal-proxies`) in production deployment profiles. |
| **F-05** | **MEDIUM** | `doctor` (Schedule) | `WeeklyScheduleRequest.entries` validates `@NotNull` on the list and `@Valid` on elements, omitting `@NotNull` on the element type (`List<@Valid ScheduleEntryDto>`). | `WeeklyScheduleRequest.java:8-12`; `ScheduleService.java:102-105` | Sending `{"entries": [null]}` passes Bean Validation and throws `NullPointerException` (`dto.startTime()`) -> unhandled `500 INTERNAL_ERROR` instead of `400 VALIDATION_FAILED`. | Change field declaration to `List<@NotNull(message = "entry must not be null") @Valid ScheduleEntryDto> entries`. |
| **F-06** | **MEDIUM** | `prescription` | `PrescriptionPdfService.render` passes `clinic.getAddress()` directly to `new Paragraph(clinic.getAddress(), ...)` without a null check, whereas `clinics.address` is nullable in DB schema `V2`. (`InvoicePdfService` already checks non-null/non-blank.) | `PrescriptionPdfService.java:36`; `V2__create_reference_data.sql:4`; `InvoicePdfService.java:46-48` | Generating a prescription PDF for any future clinic with `address = NULL` risks a runtime `NullPointerException` (`500`). | Guard `if (clinic.getAddress() != null && !clinic.getAddress().isBlank())` matching `InvoicePdfService`. |
| **F-07** | **LOW** | `auth` | `RegisterRequest.password` validates `@Size(min = 8, max = 72)` in UTF-16 chars rather than UTF-8 bytes (`domain.md` §13 G10), and `LoginRequest.password` has no upper `@Size` bound. | `RegisterRequest.java:11`; `LoginRequest.java:8`; `AuthService.java:98, 138` | Multi-byte passwords up to 72 chars (>72 UTF-8 bytes) trigger `BCryptPasswordEncoder` `IllegalArgumentException` (`> 72 bytes`, returning `500`) or silent truncation depending on Spring Security version behavior. | Enforce custom UTF-8 byte-length <= 72 validation on `RegisterRequest` and reject >72-byte passwords cleanly (or bounded check on `LoginRequest` returning `401 INVALID_CREDENTIALS`). |
| **F-08** | **LOW** | `audit` / DB | `V12__protect_audit_logs_append_only.sql` attaches `BEFORE UPDATE OR DELETE ... FOR EACH ROW`, which in PostgreSQL does not block `TRUNCATE TABLE audit_logs`, and runtime DB role privileges are not restricted. | `V12__protect_audit_logs_append_only.sql:9-12`; `domain.md:595` | A compromised/misconfigured DB session sharing schema owner privileges could execute `TRUNCATE audit_logs` bypassing row triggers. | Add a follow-up migration `V13` with a `BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT` trigger and provision least-privilege runtime DB roles in production. |
| **F-09** | **LOW** | `common` (`JwtService`) | `JwtService.parseAccessToken` passes `claims.getSubject()` and `claims.get("role", String.class)` directly to `UUID.fromString(...)` / `Role.valueOf(...)` while catching only `JwtException | IllegalArgumentException`. | `JwtService.java:94, 97, 104-106` | If a validly signed JWT omitted `sub` or `role` (or carried an unexpected claim state), `NullPointerException` escapes as `500` rather than `401 UNAUTHORIZED`. | Validate `sub` and `role` for non-blank strings before parsing, or throw `UnauthorizedException`. |
| **F-10** | **LOW** | `auth` | `AuthService.register` validates `@Size(min = 2)` on `RegisterRequest.fullName` *before* calling `.trim()`, allowing `" a "` to pass validation and persist as `"a"`. | `RegisterRequest.java:9`; `AuthService.java:91` | Allows persisting 1-character `fullName` values violating `minLength: 2` in `openapi.yaml:2364`. (Inconsistent with `DoctorService` and `ReferenceDataService`.) | Validate trimmed `fullName` length >= 2 inside `AuthService.register` (throwing `ValidationException`). |
| **F-11** | **LOW** | `billing` | `InvoiceService.addInvoiceItem` allows `unitPrice` up to `"9999999999.99"` (10 digits) and `quantity` up to `100`, plus unbounded invoice accumulation, which can overflow `NUMERIC(12, 2)` columns (`unit_price`/`line_total`/`total` max `9999999999.99`). | `InvoiceService.java:282-298`; `V7__create_billing_tables.sql:13, 28`; `MoneyUtils.java:10` | Extreme valid input (`9999999999.99 * 2`) triggers SQLState `22003` (`DataIntegrityViolationException`) -> unhandled `500 INTERNAL_ERROR` and exceeds OpenAPI `Money` regex. | Enforce maximum `NUMERIC(12,2)` bound (`9999999999.99`) check on `lineTotal` and new `invoice.total` returning `400 VALIDATION_FAILED`. |
| **F-12** | **LOW** | `reference` | `ReferenceDataService.saveDepartment` catches *any* `DataIntegrityViolationException` and translates it blindly to `409 DEPARTMENT_NAME_EXISTS` without checking constraint name `uq_departments_name_lower`. (`AppointmentService.bookAppointment` similarly catches all `DataIntegrityViolationException` as `SLOT_ALREADY_BOOKED`.) | `ReferenceDataService.java:95-104`; `AppointmentService.java:194-199` | Unrelated constraint/data-integrity failures in those write paths would be misreported as `409` conflict codes instead of surfacing cleanly. | Inspect Hibernate `ConstraintViolationException.getConstraintName()` / SQLState `23505` (matching `AuthService.isEmailUniquenessViolation` & `InvoiceService.isDuplicateTxnRefViolation`). |
| **F-13** | **LOW** | `doctor` (Concurrency) | `ScheduleService.replaceSchedule` (`deleteAll` + `saveAll`) and `LeaveService.createLeave` vs `AppointmentService.bookAppointment` do not lock the parent `doctors` row. | `ScheduleService.java:60-78`; `LeaveService.java:88-122`; `AppointmentService.java:167-196` | Concurrent `PUT /schedules` on the same doctor can interleave combined/overlapping schedule rows; concurrent leave creation + booking for the same date can both commit. | Acquire a pessimistic read/write lock on the `Doctor` row (`LockModeType.PESSIMISTIC_WRITE`) in `replaceSchedule`, `createLeave`, and `bookAppointment`. |
| **F-14** | **LOW** | `docs` (`PROGRESS.md`) | `docs/PROGRESS.md` jumps from Phase 11 (`lines 117-121`) to Phase 13 (`lines 123-127`), omitting a `Phase 12` changelog section, and Phase 13 references `JdbcConsultationLifecycleAdapter` (Phase 10 fallback) instead of `ConsultationLifecycleAdapter`. | `docs/PROGRESS.md:117-127`; `AppointmentIntegrationConfig.java:12-17`; `ConsultationLifecycleAdapter.java:20` | Misleading project history regarding clinical Phase 12 implementation and active bean wiring. | Document Phase 12 accurately in `docs/PROGRESS.md` and correct the adapter reference to `ConsultationLifecycleAdapter`. |
| **F-15** | **INFO** | `doctor` / `appointment` (`LeaveService`) | `LeaveService.createLeave` queries the `appointments` table directly via `JdbcTemplate` instead of an `appointment` port. | `LeaveService.java:94-105` | Minor modular-boundary bypass (`doctor` depends implicitly on `appointments` SQL schema). | Optionally extract a `BookedAppointmentCheckPort` interface in `doctor` implemented by `appointment`. |
| **F-16** | **INFO** | `appointment` (`StatusTransitionService`) | In `StatusTransitionService`, `CHECKED_IN -> IN_CONSULTATION` catches `OptimisticLockingFailureException` inside `moveCheckedInToInConsultation` and maps it to `CONSULTATION_IN_PROGRESS`; and `queueDate` uses `checkedInAt`'s clinic-local date (`G4` cross-day stale check-in edge case). | `StatusTransitionService.java:119-133` | A `CHECKED_IN -> CANCELLED` vs `CHECKED_IN -> IN_CONSULTATION` race returns `CONSULTATION_IN_PROGRESS` rather than `ILLEGAL_STATE_TRANSITION`; stale cross-day `CHECKED_IN` appointments broadcast prior date queue counts. | Document or separate optimistic-lock handling from partial-index violation in `moveCheckedInToInConsultation`. |
| **F-17** | **INFO** | `doctor` (`SlotService`) | Increasing `doctor.slotMinutes` via `PUT /doctors/{id}` does not revalidate existing `ScheduleEntry` widths, so `listDoctorSlots` can return `slots: []` with `closedReason: null` if a day's window is narrower than `slotMinutes` (or if DST gap drops the sole slot). | `SlotService.java:87-122`; `DoctorService.java:140-160` | Benign empty slot array with `closedReason: null` when schedule entries become narrower than updated `slotMinutes`. | Consider validating existing schedule durations or returning empty slots intentionally as documented. |
| **F-18** | **INFO** | `report` (`ReportRepository`) | `ReportRepository` binds `Instant` bounds via `Timestamp.from(instant)` (`setTimestamp` without UTC `Calendar`), and payment/credit-note queries rely on `InvoiceService` invariants rather than an explicit `i.status <> 'VOID'` clause. | `ReportRepository.java:67-105, 197-208, 260-261, 283-296, 338-339` | Currently safe under UTC JVM/PostgreSQL (`application.yml:23`) and API invariants, but vulnerable if app JVM TZ differs or DB rows are edited directly. | Bind `OffsetDateTime.ofInstant(instant, ZoneOffset.UTC)` and add `AND i.status <> 'VOID'` defensively in payment/credit-note report queries. |
| **F-19** | **INFO** | `db/migration` (`V1`, `V9`) | Missing non-unique FK indexes on `prescription_warnings(prescription_id)` and `invoice_items(invoice_id)`; `idx_patients_phone` lacks `varchar_pattern_ops`; `refresh_tokens.replaced_by_id` has no `ON DELETE` or index; `audit_logs` has single-column indexes only. | `V1__create_identity_tables.sql:18`; `V9__create_indexes_and_constraints.sql:19, 34-37` | Potential sequential scans under high table volumes on invoice/prescription detail loads or `audit_logs` `(user_id, occurred_at)` filters, and FK blocks if pruning old refresh tokens. | Add targeted indexes (`idx_invoice_items_invoice`, `idx_prescription_warnings_rx`, `varchar_pattern_ops`, composite `audit_logs` index) in a future migration if scale requires. |
| **F-20** | **INFO** | `auth` (`AuthService`) | Inactive doctors (`doctors.active = false`) can still log in and refresh tokens (`AuthService`), matching open Gap `G14` in `domain.md`. | `AuthService.java:127-216`; `domain.md:719` | Intentionally left open per `domain.md` §13 G14; deactivated doctors retain read/clinical capability unless disabled cleanly. | Decide desired policy in product design and add `active` enforcement or user account deactivation if required. |

---

## D. API & OpenAPI Contract Mismatches

- **Path / Method / Status Coverage:** **55/55 HTTP operations** across **40 OpenAPI paths** and **17 Spring `@RestController`s**, plus WebSocket endpoint `/ws` (`/topic/queue/{doctorId}`), match `docs/openapi.yaml` with **zero undocumented endpoints**.
- **Documented Pending Item (`domain.md` vs `openapi.yaml`):**
  - `POST /appointments/{id}/invoices` is noted as `**(pending 5d)**` in `docs/domain.md` (§4.3, §6.10, §12, §13 G7, §14) for issuing additional invoices on `COMPLETED` appointments, and is **absent** from `docs/openapi.yaml`, `AuditAction`, and `InvoiceController` / `InvoiceService`. (`GET /appointments/{id}/invoice` returning the latest non-`VOID` invoice IS implemented per `domain.md` §14.)
- **Error-Precedence & Minor Validation Nuances (matching OpenAPI `G9` observations):**
  1. **`403` vs `404` / `400` ordering differences across modules:**
     - `ReportController` (`@PreAuthorize`) & `ScheduleService`/`LeaveService` (`assertDoctorOwnershipIfDoctor`) enforce `403` before `404`, and `AuditLogController`/`ReportController`/`DoctorController`/`PatientController` run MVC parameter binding / `@Validated` query constraints (`@Min`/`@Max`/`@Size`) before `@PreAuthorize`, whereas `InvoiceService` and `PatientService` check `404` before `403`.
     - `DoctorService.updateDoctor`, `ReferenceDataService.updateDepartment`, and `ConsultationService.createConsultation`/`updateConsultation` execute `404` lookup prior to service-level `400` checks (trim length, `slotMinutes % 5`, clinic-local `followUpDate`).
  2. **Schedule list max size error code (`ScheduleService.java:91-96` vs `WeeklyScheduleRequest.java:10`):**
     - `WeeklyScheduleRequest` `@Size(max = 28)` emits `400 VALIDATION_FAILED`, rendering `ScheduleService`'s internal `400 INVALID_SCHEDULE` branch for `> 28` entries unreachable.
  3. **Numeric scale validation (`VitalsDto`):**
     - `VitalsDto` adds `@Digits(integer=3, fraction=1)` / `@Digits(integer=4, fraction=1)` matching DB `NUMERIC(4,1)`/`NUMERIC(5,1)` (`V6`), slightly stricter than OpenAPI `type: number` bounds.
  4. **Open Gaps `G1`–`G15` (`domain.md:704-720`):**
     - Unimplemented legacy promises (`/api/users` staff endpoint `G3`, standalone doctor allergy-update endpoint `G2`, rescheduling, refund tracking) match explicit `domain.md` §12–13 exclusions; `UNAUTHORIZED` error code (`G1`) is actively returned by `SecurityConfig`/`JwtService` for missing/malformed tokens.

---

## E. Security Assessment

- **Authentication & Passwords:** Stateless JWT (`Authorization: Bearer`) paired with BCrypt (`strength=10`), locked seeded staff sentinels (`!LOCKED_REQUIRES_BOOTSTRAP!`), env-driven bootstrap runner (`StaffAccountBootstrapRunner`), and case-insensitive `uq_users_email_lower` uniqueness translation (`AuthService.isEmailUniquenessViolation`).
- **JWT & Refresh Tokens:** HS256 with startup >=256-bit secret validation (`JwtService`), `900s` access expiry distinguishing `TOKEN_EXPIRED` vs `UNAUTHORIZED`, and 32-byte `SecureRandom` SHA-256 single-use refresh tokens (`604800s`). Concurrent `refresh` safely serializes on the PostgreSQL `refresh_tokens` row lock; **medium gap:** replay does not revoke the active descendant/user tokens (**F-03**).
- **Authorization & IDOR Prevention:** Enforced across every resource (`ADMIN`, `DOCTOR`, `RECEPTIONIST`, `PATIENT`), including patient ownership on profiles/appointments/prescriptions/invoices/PDFs, doctor `EXISTS` scoping on `GET /api/patients`, treating/owning doctor checks on consultations/prescriptions/schedules/leaves/queues, and `ADMIN`-only gates on departments, doctors, audit logs, invoice voiding, and reports.
- **Rate Limiting:** Bucket4j per-IP limits (`5/min` register, `10/min` login, `20/min` refresh, `30/min` queue board; `/api/auth/logout` excluded) with `Retry-After` header and bounded `10_000` / `5m` TTL cache; **medium race risk** on unsorted `lastAccessNanos` mutation during LRU sorting (**F-02**) and unconfigured proxy `RemoteAddr` forwarding (**F-04**).
- **CORS & WebSocket Security:** Strict `CARESYNC_CORS_ORIGINS` applied to both REST (`CorsConfig`) and STOMP (`WebSocketConfig.setAllowedOrigins`, no wildcard `"*"`); `WebSocketSecurityConfig` blocks all `SEND` frames and limits `SUBSCRIBE` strictly to `^/topic/queue/[A-Za-z0-9-]+$`; public `/ws` & `/topic/queue/{doctorId}` carry zero PII (only `doctorId`, `doctorName`, token numbers/counts).
- **Logging & Redaction:** Single-event `SECURITY_EVENTS` logging verified across filter-level 401/403, `@PreAuthorize` 403, and service-layer `ForbiddenException` 403 (`MethodSecurityLoggingTest`, `GlobalExceptionHandlerTest`, `AuthSecurityIT`, `BillingIT`, `ReportIT`). Unexpected `500` logs strip exception messages and stack traces (`GlobalExceptionHandler.handleUnexpected`), MDC clears cleanly in `RequestLoggingFilter`, and JWTs/passwords/clinical PII never appear in logs.

---

## F. Database Assessment

- **Migrations (`V1`–`V12`):** Clean chronological progression, `validate-on-migrate: true`, zero JPA schema drift (`hibernate.ddl-auto: validate` verified cleanly against PostgreSQL 16 across all IT contexts).
- **Constraints & Partial Unique Indexes:**
  - Lowercase functional uniqueness: `uq_users_email_lower` (`V1`), `uq_specializations_name_lower` (`V2`), `uq_departments_name_lower` (`V2`).
  - Partial unique indexes (`V9`): `uq_appointment_slot_active` (`WHERE status <> 'CANCELLED'`), `uq_appointment_doctor_in_consultation` (`WHERE status = 'IN_CONSULTATION'`), `uq_payment_method_txn_ref` (`WHERE txn_ref IS NOT NULL AND method <> 'CASH'`).
  - Clinical safety constraint (`V6`): `CHECK (medicine_a_id < medicine_b_id)` + `UNIQUE (medicine_a_id, medicine_b_id)`.
  - Atomic daily tokens: `doctor_day_counters` upsert (`INSERT ... ON CONFLICT DO UPDATE RETURNING last_token`) + `@Version` optimistic locking on `Appointment`.
- **Billing Integrity & Sequences:** PostgreSQL `NUMERIC(12,2)` matching `BigDecimal` scale `2`, `invoice_number_seq` & `credit_note_number_seq`, `PESSIMISTIC_WRITE` row locks (`findLockedById`) on invoice mutations, and strict prevention of voiding `PARTIALLY_PAID` / `PAID` invoices.
- **Audit Immutability:** `V12` `trg_audit_logs_append_only` blocks `UPDATE` and `DELETE` per row, though `TRUNCATE` (**F-08**) and separate DB roles remain open.
- **Transaction Boundaries:** `@Transactional` (`REQUIRED`) binds appointment completion + consultation finalization + automatic invoice creation + billing/clinical audit logs into a single atomic unit; only `QueueMessagePublisher` runs `AFTER_COMMIT` and needs exception isolation + fresh tx read boundary (**F-01**).

---

## G. Test Results (Observed from XML Reports)

Verification commands executed directly against `z:\javaproject\backend`:
1. `.\mvnw.cmd clean test` (Exit `0`)
2. `.\mvnw.cmd verify` with PostgreSQL `16-alpine` Testcontainers (Exit `0`)

### Surefire Summary (`target/surefire-reports/TEST-*.xml`)

| Module | Test Classes | Tests | Failures | Errors | Skipped |
|---|---|---:|---:|---:|---:|
| Bootstrap & Migrations (`CareSync` root) | 2 (`Phase1BootstrapTest`, `FlywayMigrationFileTest`) | 2 | 0 | 0 | 0 |
| `common` | 7 (`RateLimitFilterTest`, `ErrorResponseWriterTest`, `GlobalExceptionHandlerTest`, `JwtServiceTest`, `MethodSecurityLoggingTest`, `MoneyUtilsTest`, `TimeZoneUtilsTest`) | 16 | 0 | 0 | 0 |
| `auth` | 3 (`AuthControllerTest`, `AuthServiceTest`, `StaffAccountBootstrapRunnerTest`) | 14 | 0 | 0 | 0 |
| `audit` | 2 (`AuditLogControllerTest`, `AuditServiceTest`) | 5 | 0 | 0 | 0 |
| `reference` | 2 (`ReferenceDataControllerTest`, `ReferenceDataServiceTest`) | 5 | 0 | 0 | 0 |
| `doctor` | 5 (`DoctorControllerTest`, `ScheduleLeaveSlotControllerTest`, `DoctorServiceTest`, `LeaveServiceTest`, `ScheduleServiceTest`) | 9 | 0 | 0 | 0 |
| `patient` | 2 (`PatientControllerTest`, `PatientServiceTest`) | 5 | 0 | 0 | 0 |
| `appointment` | 4 (`AppointmentControllerTest`, `AppointmentServiceTest`, `SlotServiceTest`, `StatusTransitionServiceTest`) | 8 | 0 | 0 | 0 |
| `queue` | 3 (`WebSocketSecurityConfigTest`, `QueueControllerTest`, `QueueServiceTest`) | 5 | 0 | 0 | 0 |
| `consultation` | 2 (`ConsultationControllerTest`, `ConsultationServiceTest`) | 3 | 0 | 0 | 0 |
| `medicine` | 1 (`MedicineControllerTest`) | 1 | 0 | 0 | 0 |
| `prescription` | 4 (`PrescriptionControllerTest`, `PrescriptionPdfServiceTest`, `PrescriptionServiceTest`, `SafetyCheckServiceTest`) | 5 | 0 | 0 | 0 |
| `billing` | 3 (`InvoiceControllerTest`, `InvoicePdfServiceTest`, `InvoiceServiceTest`) | 9 | 0 | 0 | 0 |
| `report` | 2 (`ReportControllerTest`, `ReportServiceTest`) | 4 | 0 | 0 | 0 |
| **Surefire Total** | **42 suites** | **91** | **0** | **0** | **0** |

### Failsafe Integration Summary (`target/failsafe-reports/TEST-*.xml`)

| Suite | Tests | Failures | Errors | Skipped | Key Scenarios Verified against PostgreSQL 16 | Time (s) |
|---|---:|---:|---:|---:|---|---:|
| `FlywayMigrationIT` | 2 | 0 | 0 | 0 | Schema `V1`–`V12` validation, `V10` seed join integrity | 0.087 |
| `AuthSecurityIT` | 4 | 0 | 0 | 0 | Concurrent registration email race, `TOKEN_EXPIRED`, rate limit `429`, `SECURITY_EVENTS` | 0.773 |
| `AuditLogIT` | 2 | 0 | 0 | 0 | `V12` update/delete block, filters, pagination, `ADMIN` RBAC | 0.341 |
| `ReferenceDataIT` | 1 | 0 | 0 | 0 | Seeded clinics/specializations sort, department uniqueness | 0.123 |
| `DoctorIT` | 1 | 0 | 0 | 0 | Doctor+User provisioning, login linkage, inactive hiding | 0.542 |
| `SchedulingIT` | 1 | 0 | 0 | 0 | Schedules, leaves, booked-appointment conflict, DST slots | 0.372 |
| `PatientIT` | 1 | 0 | 0 | 0 | Doctor `EXISTS` patient scoping, `PATIENT_READ` audit, allergies | 0.503 |
| `AppointmentIT` | 1 | 0 | 0 | 0 | Concurrent booking slot race, token counter, full state transitions | 38.987 |
| `QueueIT` | 1 | 0 | 0 | 0 | Live STOMP broadcasts, 2-thread `call-next` race, zero-PII board | 1.529 |
| `ClinicalIT` | 1 | 0 | 0 | 0 | Consultation, medicine search, safety check, Rx creation + PDF | 1.313 |
| `BillingIT` | 3 | 0 | 0 | 0 | Full lifecycle & 7 audits, concurrent payment/`txnRef` race, rollback | 3.117 |
| `ReportIT` | 1 | 0 | 0 | 0 | All 5 report endpoints, timezone bucketing, void/noShow/ranking | 0.749 |
| **Failsafe Total** | **19** | **0** | **0** | **0** | **12 suites** | **48.436** |

- **Identified Automated Test Coverage Gaps:**
  - No `MedicineServiceTest` unit suite (`MedicineControllerTest` + `ClinicalIT` cover runtime path).
  - No multi-threaded PostgreSQL `refresh` race integration test in `AuthSecurityIT` (`AuthServiceTest` tests single-threaded replay/rotation via mocks).
  - No concurrency stress test for `RateLimitFilter` LRU sorting under parallel writes (**F-02**).
  - No concurrency IT for `ScheduleService.replaceSchedule` or `LeaveService.createLeave` vs `AppointmentService.bookAppointment` (**F-13**).
  - No `PrescriptionPdfServiceTest` case with `clinic.getAddress() == null` (**F-06**) and no `QueueMessagePublisher` exception-isolation test (**F-01**).

---

## H. Production Readiness Assessment

| Area | Status | Evidence & Operational Notes |
|---|---|---|
| **1. Application Correctness** | **CONDITIONAL** | Full domain workflows & OpenAPI contracts pass 110 tests; needs `QueueMessagePublisher` isolation (**F-01**), `WeeklyScheduleRequest` `@NotNull` element (**F-05**), `PrescriptionPdfService` address null guard (**F-06**), and `InvoiceService` overflow check (**F-11**). |
| **2. Security** | **CONDITIONAL** | Solid RBAC, IDOR guards, JWT, BCrypt, CSRF/headers, CORS, and zero-PII logs; needs refresh replay family revocation (**F-03**), `RateLimitFilter` thread-safe LRU snapshot (**F-02**), and proxy forwarded-header strategy (**F-04**) for proxied production. |
| **3. Database Integrity** | **PASS** | PostgreSQL 16 Flyway `V1`–`V12`, `ddl-auto: validate`, partial unique indexes, `PESSIMISTIC_WRITE` billing locks, `@Version` optimistic lock, atomic token counter, and `V12` append-only row trigger. (`TRUNCATE` trigger & separate runtime DB role recommended pre-prod.) |
| **4. API Completeness** | **PASS** | 55/55 OpenAPI operations + `/ws` STOMP implemented accurately; only deferred item `POST /appointments/{id}/invoices (pending 5d)` is intentionally out of current `openapi.yaml`. |
| **5. Test Coverage** | **CONDITIONAL** | Strong service, MockMvc, and real PostgreSQL 16 Testcontainers coverage including concurrency and rollbacks; missing `MedicineServiceTest`, multi-threaded `RateLimitFilter`/schedule/refresh concurrency ITs, and null-address/publisher-failure unit tests. |
| **6. Performance & Reliability** | **CONDITIONAL** | `open-in-view: false`, `@EntityGraph`, `EXISTS` scoping, batched queue-board queries, SQL-side report aggregations, HikariCP (`max=20`, `minIdle=5`), and Java 25 virtual threads enabled. Rate-limit sort race (**F-02**) and publisher tx boundary (**F-01**) need fixes. |
| **7. Deployment Readiness** | **FAIL** | Repo ships dev `docker-compose.yml` for PostgreSQL only; **no application `Dockerfile`**, no TLS/reverse-proxy config, no DB backup/retention automation, no JWT key rotation mechanism, and no refresh-token cleanup job (`auth` accumulation over time). |
| **8. Monitoring & Observability** | **CONDITIONAL** | `application-prod.yml` configures ECS JSON console logging + MDC correlation (`requestId`, `userId`) + `SECURITY_EVENTS` logger + Actuator `health,info,metrics` with K8s probes (`show-details: when-authorized`), but lacks external log aggregation, Prometheus/OTel metrics exporter config, error tracking (Sentry/OTLP), and `/actuator/prometheus` or alerting rules. |

---

## I. Remediation Plan

### 1. CRITICAL / HIGH
- **None found.** Zero CRITICAL or HIGH defects were identified.

### 2. MEDIUM (Mandatory Hardening Prior to Production / Recommended Immediately)
1. **F-01 (`QueueMessagePublisher`, `QueueService`):** Isolate `AFTER_COMMIT` WebSocket exceptions with `try/catch` + sanitized warning log and switch `buildQueueUpdateMessage` to `Propagation.REQUIRES_NEW` (or `NOT_SUPPORTED`) + add unit test.
2. **F-02 (`RateLimitFilter`):** Capture `lastAccessNanos` into an immutable snapshot tuple before `List.sort` inside `evictionLock`, and add a concurrent load/eviction unit test.
3. **F-03 (`AuthService`, `RefreshTokenRepository`):** On detected refresh replay (`revokedAt != null` or `updated == 0`), revoke the token family or all active refresh tokens of the user (in a non-rolled-back transaction before throwing `401`) and cover with an integration test.
4. **F-04 (`application-prod.yml` / Reverse Proxy Setup):** Configure `server.forward-headers-strategy` with strict trusted-proxy CIDR rules when deploying behind Nginx/ALB/Ingress.
5. **F-05 (`WeeklyScheduleRequest`):** Add `@NotNull` to `List<@NotNull @Valid ScheduleEntryDto>` so `[null]` returns `400 VALIDATION_FAILED` instead of `500`.
6. **F-06 (`PrescriptionPdfService`):** Add null/blank guard around `clinic.getAddress()` matching `InvoicePdfService` + unit test.

### 3. LOW (Cleanup & Consistency Hardening)
7. **F-07 (`RegisterRequest`, `LoginRequest`, `AuthService`):** Enforce 72-byte UTF-8 password validation cleanly before BCrypt.
8. **F-08 (`V13` migration):** Add `BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT` trigger and least-privilege DB runtime role documentation.
9. **F-09 (`JwtService`):** Explicitly validate `sub` and `role` claims for null/blank before parsing (`401` instead of `NPE`).
10. **F-10 (`AuthService.register`):** Validate trimmed `fullName` length `>= 2`.
11. **F-11 (`InvoiceService.addInvoiceItem`):** Validate `lineTotal` and accumulated `invoice.total` against max `NUMERIC(12,2)` (`9999999999.99`) returning `400 VALIDATION_FAILED`.
12. **F-12 (`ReferenceDataService`, `AppointmentService`):** Narrow `DataIntegrityViolationException` catches to target unique constraints (`uq_departments_name_lower`, `uq_appointment_slot_active`).
13. **F-13 (`ScheduleService`, `LeaveService`, `AppointmentService`):** Lock parent `Doctor` row (`PESSIMISTIC_WRITE`) on schedule replace, leave creation, and booking.
14. **F-14 (`docs/PROGRESS.md`):** Add `Phase 12` changelog section and update Phase 13 reference from `JdbcConsultationLifecycleAdapter` to `ConsultationLifecycleAdapter`.

### 4. INFORMATIONAL / OPTIONAL & INFRASTRUCTURE
15. Resolve production deployment artifacts (`Dockerfile`, reverse-proxy TLS config, scheduled cleanup of expired/revoked `refresh_tokens`, PostgreSQL automated backup scripts, and Prometheus/OpenTelemetry observability) before staging/production cutover.
16. Optionally address `F-15`–`F-20` (domain port for `LeaveService`, `OffsetDateTime` UTC binding in `ReportRepository`, supplemental FK/pattern indexes, and `domain.md` §13–14 open design items such as `POST /appointments/{id}/invoices` and inactive doctor login policy `G14`).

---

## J. Final Verdict

### **CONDITIONAL PASS**

- **Frontend Integration Readiness:** **YES — Ready for React frontend integration now.** All 55 REST endpoints and the read-only `/ws` STOMP queue topic match `docs/openapi.yaml`, enforce strict RBAC/ownership/zero-PII guarantees, return uniform `ErrorResponse` JSON contracts, and pass **110/110** unit and PostgreSQL 16 Testcontainers integration tests with zero failures or skipped suites.
- **Condition for Production:** Before production deployment, resolve the **6 MEDIUM** runtime/hardening findings (**F-01** through **F-06**), address low-risk input guards (**F-07**–**F-14**), and provision production infrastructure controls (Dockerfile, TLS termination, trusted proxy config, backups, and secret/token lifecycle management).
