# CareSync HCMS — Backend Architecture

## 1. Overview & Technology Stack

The **CareSync** backend is engineered as an enterprise-grade modular monolith built on the modern Java ecosystem:

- **Language & Runtime:** Java 25 (`<java.version>25</java.version>`)
- **Framework:** Spring Boot 4.1.2
- **Concurrency Model:** Java Virtual Threads enabled (`spring.threads.virtual.enabled: true`)
- **Security:** Spring Security 7 with stateless JWT authentication & RBAC
- **Persistence:** Spring Data JPA with Hibernate 6.6 & PostgreSQL 16
- **Database Migrations:** Flyway 10 (V1 through V12)
- **Document Generation:** OpenPDF 2.0 (Prescriptions and Invoices)
- **Real-Time Broker:** Spring WebSocket with STOMP over SockJS

---

## 2. Package & Module Structure

All backend application code resides under `backend/src/main/java/com/caresync/`:

```text
com.caresync
├── CareSyncApplication.java       # Spring Boot main entrypoint
│
├── common/                        # Cross-cutting foundational infrastructure
│   ├── config/                    # CORS, Clock, RateLimiting, Logging, Properties
│   ├── dto/                       # ErrorResponse, FieldError, PageResponse
│   ├── exception/                 # Custom domain exceptions & GlobalExceptionHandler
│   ├── security/                  # JwtService, JwtAuthFilter, UserPrincipal, SecurityUtils
│   └── util/                      # MoneyUtils, PdfHelper, RequestIpUtils, TimeZoneUtils
│
├── auth/                          # Identity & Authentication
│   ├── controller/                # AuthController (login, register, refresh, me, logout)
│   ├── entity/                    # User, Role, RefreshToken
│   ├── repository/                # UserRepository, RefreshTokenRepository
│   └── service/                   # AuthService, RefreshTokenRevocation, StaffBootstrap
│
├── reference/                     # Clinics, Specializations, Departments
│   ├── controller/                # ClinicController, DepartmentController, SpecializationController
│   ├── entity/                    # Clinic, Department, Specialization
│   └── service/                   # ReferenceDataService
│
├── doctor/                        # Doctor profiles, schedules & leaves
│   ├── controller/                # DoctorController, ScheduleController, LeaveController
│   ├── entity/                    # Doctor, ScheduleEntry, Leave
│   └── service/                   # DoctorService, ScheduleService, LeaveService
│
├── patient/                       # Patient records & medical history
│   ├── controller/                # PatientController (demographics, allergies, timeline)
│   ├── entity/                    # Patient, Gender
│   └── service/                   # PatientService, DoctorPatientScopePort
│
├── appointment/                   # Scheduling, slots, token counters & lifecycle
│   ├── controller/                # AppointmentController, SlotController
│   ├── entity/                    # Appointment, AppointmentStatus, DoctorDayCounter
│   ├── event/                     # QueueChangedDomainEvent, QueueEventType
│   └── service/                   # AppointmentService, SlotService, StatusTransitionService
│
├── queue/                         # Real-time waiting room & WebSocket
│   ├── broadcast/                 # QueueMessagePublisher (STOMP broker integration)
│   ├── config/                    # WebSocketConfig, WebSocketSecurityConfig, QueueAsyncConfig
│   ├── controller/                # QueueController (doctor queue view, public board, call-next)
│   └── service/                   # QueueService
│
├── consultation/                  # Clinical encounters & vitals
│   ├── controller/                # ConsultationController
│   ├── entity/                    # Consultation, VitalsDto
│   └── service/                   # ConsultationService, ConsultationLifecycleAdapter
│
├── medicine/                      # Medication catalog & safety interaction matrix
│   ├── controller/                # MedicineController
│   ├── entity/                    # Medicine, DrugInteraction, WarningSeverity
│   └── service/                   # MedicineService
│
├── prescription/                  # Prescriptions, allergy checks & PDF generation
│   ├── controller/                # PrescriptionController
│   ├── entity/                    # Prescription, PrescriptionItem, PrescriptionWarning
│   └── service/                   # PrescriptionService, SafetyCheckService, PrescriptionPdfService
│
├── billing/                       # Invoices, payments, credit notes & PDF receipts
│   ├── controller/                # InvoiceController
│   ├── entity/                    # Invoice, InvoiceItem, Payment, CreditNote, InvoiceStatus
│   └── service/                   # InvoiceService, InvoicePdfService
│
├── report/                        # Management analytics & operational dashboards
│   ├── controller/                # ReportController
│   ├── repository/                # ReportRepository (custom native SQL aggregations)
│   └── service/                   # ReportService
│
└── audit/                         # Append-only immutable compliance logging
    ├── controller/                # AuditLogController
    ├── entity/                    # AuditLog, AuditAction, AuditEntityType
    └── service/                   # AuditService
```

---

## 3. Core Architectural Layers

### 3.1 REST Controllers
- All REST endpoints are prefixed under `/api`.
- Controller methods validate incoming payloads via Jakarta Validation (`@Valid`, `@NotNull`, `@Size`, `@Pattern`).
- Uniform HTTP status codes are strictly returned:
  - `200 OK` — Successful query or idempotent update.
  - `201 Created` — Successful resource creation (with `Location` header or resource ID).
  - `204 No Content` — Successful deletion or logout.
  - `400 Bad Request` — Schema or validation failure.
  - `401 Unauthorized` — Missing, expired, or invalid JWT credentials.
  - `403 Forbidden` — Authenticated caller lacks required role or resource ownership.
  - `404 Not Found` — Resource identifier does not exist.
  - `409 Conflict` — State machine violation or slot booking collision.
  - `422 Unprocessable Entity` — Clinical safety violation (e.g. unacknowledged severe drug interaction).
  - `429 Too Many Requests` — Rate limit exceeded.

### 3.2 Service Layer & Transaction Boundaries
- Business logic is encapsulated in `@Service` classes annotated with `@Transactional(readOnly = true)` at class level and overridden with `@Transactional` on mutating methods.
- Inter-module communication uses explicit **ports and adapters** to prevent circular entity dependencies:
  - `AppointmentBillingPort` (`appointment` -> `billing`): Invoked automatically upon appointment completion to issue the consultation invoice.
  - `ConsultationLifecyclePort` (`appointment` -> `consultation`): Coordinates status progression when doctor begins consultation.
  - `DoctorPatientScopePort` (`patient` -> `doctor`): Enforces that doctors can only view full patient profiles for individuals who have booked an appointment with them.
  - `ProfileLinkPort` (`auth` -> `doctor`/`patient`): Links a newly registered user to their respective domain entity.

### 3.3 Repositories & Data Access
- Extends Spring Data `JpaRepository<T, UUID>`.
- Read operations utilize projection interfaces (e.g. `QueueBoardTokenProjection`) to fetch only necessary columns, minimizing memory footprint.
- Concurrency-sensitive operations use explicit database locking:
  - `PESSIMISTIC_WRITE` locks in `InvoiceRepository` during payment processing to prevent double-charging or race conditions.
  - Optimistic locking via `@Version` columns on `Appointment` and `DoctorDayCounter`.

---

## 4. Security & Middleware Architecture

### 4.1 Filter Chain Pipeline
Inbound HTTP requests pass through the following ordered filters:

```text
Request ---> RequestLoggingFilter ---> RateLimitFilter ---> JwtAuthenticationFilter ---> SecurityFilterChain ---> Controller
```

1. **`RequestLoggingFilter`:** Generates or propagates an `X-Request-ID` correlation token, places it into SLF4J MDC, and logs method, URI, status, and execution duration in milliseconds.
2. **`RateLimitFilter`:** An in-memory token-bucket rate limiter that throttles sensitive authentication endpoints per client IP:
   - Register: 5 requests/minute
   - Login: 10 requests/minute
   - Refresh: 20 requests/minute
   - Public Queue Board: 30 requests/minute
   - Client IP extraction safely handles `X-Forwarded-For` with trusted proxy CIDR validation.
3. **`JwtAuthenticationFilter`:** Extracts the `Authorization: Bearer <token>` header, verifies the HS256 signature using `JwtService`, constructs a `UserPrincipal`, and populates the `SecurityContext`.

### 4.2 Global Exception Handling
`GlobalExceptionHandler` captures all checked and unchecked exceptions thrown during request execution and produces a uniform `ErrorResponse`:

```java
public record ErrorResponse(
    Instant timestamp,
    int status,
    ErrorCode code,
    String message,
    String path,
    List<FieldError> fieldErrors
) {}
```

- Converts `ResourceNotFoundException` to `404 NOT_FOUND`.
- Converts `ConflictException` to `409 CONFLICT`.
- Converts `ForbiddenException` to `403 FORBIDDEN`.
- Converts `ValidationException` and `MethodArgumentNotValidException` to `400 VALIDATION_ERROR` with detailed per-field errors.
- Converts `TooManyRequestsException` to `429 TOO_MANY_REQUESTS`.
- Converts unexpected runtime exceptions to `500 INTERNAL_ERROR` without leaking stack traces or internal implementation details.

---

## 5. Clinical Safety & Drug Interaction Engine

The `SafetyCheckService` evaluates prescription safety before any medication is prescribed:
1. **Patient Allergy Check:** Compares the requested medicine's active chemical and drug family against the patient's recorded allergies (`patient.allergies` text array).
2. **Drug-Drug Interaction Check:** Evaluates the symmetric interaction matrix between newly prescribed medications and the patient's existing active prescriptions:
   - `MILD`: Information advisory.
   - `MODERATE`: Clinical caution.
   - `SEVERE`: Hard safety stop. Prescription creation is blocked unless the doctor explicitly supplies a documented clinical acknowledgement flag (`acknowledgedWarnings`).

---

## 6. Financial Arithmetic & Billing Guarantees

Healthcare billing demands absolute precision:
- **Zero Floating-Point Arithmetic:** `float` and `double` are strictly forbidden. All monetary fields (`consultationFee`, `itemPrice`, `subtotal`, `totalAmount`, `paidAmount`, `balanceDue`) use `BigDecimal` with fixed scale of 2 (`RoundingMode.HALF_UP`).
- **Database Column Mapping:** Mapped to PostgreSQL `NUMERIC(12,2)`.
- **Payment Method Support:** Supports `CASH`, `CARD`, `UPI`, and `INSURANCE`.
- **Transaction Reference Uniqueness:** `txn_ref` enforces uniqueness across payment gateways.
- **Credit Notes & Voids:** Invoices cannot be deleted. If an invoice is cancelled, it transitions to `VOID` or issues an itemized `CreditNote`, preserving the financial audit trail.

---

## 7. Database Migrations (Flyway V1–V12)

Database evolution is versioned through sequential Flyway SQL migrations:

| Version | Name | Description |
| :--- | :--- | :--- |
| **V1** | `create_identity_tables` | `users` and `refresh_tokens` tables with foreign keys and unique constraints |
| **V2** | `create_reference_data` | `clinics`, `specializations`, and `departments` tables |
| **V3** | `create_doctor_tables` | `doctors`, `weekly_schedules`, and `doctor_leaves` tables |
| **V4** | `create_patient_tables` | `patients` table with `allergies TEXT[]` column |
| **V5** | `create_appointment_tables` | `appointments` and `doctor_day_counters` tables |
| **V6** | `create_clinical_tables` | `consultations`, `medicines`, `drug_interactions`, `prescriptions`, `prescription_items`, and `prescription_warnings` |
| **V7** | `create_billing_tables` | `invoices`, `invoice_items`, `payments`, and `credit_notes` |
| **V8** | `create_audit_table` | `audit_logs` table for compliance tracking |
| **V9** | `create_indexes_and_constraints` | Performance indexes and concurrency partial unique indexes |
| **V10** | `seed_reference_data` | Reference clinics (Banjara Hills, Jubilee Hills), specializations, departments, and medication catalog |
| **V11** | `seed_staff_accounts` | Initial admin and receptionist user accounts with locked sentinel hash |
| **V12** | `protect_audit_logs_append_only` | PostgreSQL `BEFORE UPDATE OR DELETE` trigger preventing tampering with audit records |
