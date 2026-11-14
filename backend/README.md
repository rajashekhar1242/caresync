# CareSync HCMS — Backend Service (Spring Boot 4 / Java 25)

The backend service for **CareSync Hospital & Clinic Management System (HCMS)** is an enterprise modular monolith engineered for high-concurrency outpatient operations.

---

## 1. Technology Architecture

- **Language & Runtime:** Java 25 (with Virtual Threads enabled)
- **Framework:** Spring Boot 4.1.2
- **Security:** Spring Security 7 with stateless JWT (HS256) & Single-Use Refresh Token Rotation (RTR)
- **Persistence:** Spring Data JPA / Hibernate 6.6
- **Database:** PostgreSQL 16 with Flyway versioned migrations (V1–V12)
- **Real-Time:** Spring WebSocket with STOMP over SockJS
- **Document Rendering:** OpenPDF 2.0 (Clinical Prescriptions and Financial Receipts)
- **Rate Limiting:** In-memory token-bucket filter (Bucket4j algorithm)
- **Testing:** JUnit 5, Mockito, Testcontainers (`postgres:16-alpine`), AssertJ

---

## 2. Modular Monolith Architecture

All code resides in `src/main/java/com/caresync/`, organized into 13 decoupled domain modules:

```text
com.caresync
├── common/        # Foundational cross-cutting concerns (CORS, JWT, Rate Limiting, Global Exceptions)
├── auth/          # Identity, authentication, single-use refresh tokens, staff bootstrap
├── reference/     # Hospital branches, medical specializations, departments
├── doctor/        # Physician profiles, timezone-aware weekly schedules, leaves
├── patient/       # Patient records, allergy arrays, doctor scoping adapter
├── appointment/   # Slot booking, atomic token counters, appointment state machine
├── queue/         # Live waiting room coordination, STOMP broker, zero-PII public board
├── consultation/  # Clinical encounters, vitals recording (JSONB)
├── medicine/      # Formulary catalog, drug-drug interaction matrix
├── prescription/  # Prescription authoring, allergy safety checks, PDF generation
├── billing/       # Invoicing on appointment complete, payments, credit notes, PDF receipts
├── report/        # Native SQL aggregations for revenue, load, and no-show analytics
└── audit/         # Immutable append-only compliance audit trail
```

Inter-module coupling is avoided using explicit port interfaces:
- `AppointmentBillingPort` (`appointment` -> `billing`)
- `ConsultationLifecyclePort` (`appointment` -> `consultation`)
- `DoctorPatientScopePort` (`patient` -> `doctor`)

---

## 3. Getting Started

### Prerequisites
- **JDK 25** (`java -version`)
- **Docker Desktop** (running for PostgreSQL 16)

### 1. Start Database
From the repository root (`Z:\javaproject`):
```powershell
docker compose up -d
```

### 2. Configure Environment
Set database password and JWT secret in environment or `.env`:
```powershell
$env:SPRING_DATASOURCE_PASSWORD = "your-local-db-password"
$env:CARESYNC_JWT_SECRET = "your-random-32-byte-secret-here"
```

### 3. Run Backend
```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

The application starts on `http://localhost:8080/api` with health actuator at `http://localhost:8080/actuator/health`.

---

## 4. Running Automated Tests

All tests can be reproduced using the included Maven Wrapper:

### Unit Tests (Surefire — 110 tests, 0 failures)
```powershell
.\mvnw.cmd clean test
```
*Fast unit test execution verifying business rules, rate limiters, token validation, and controller slices.*

### Full Verification with Testcontainers (Failsafe — 34 integration tests)
```powershell
.\mvnw.cmd verify
```
*Executes against real PostgreSQL 16 containers verifying database constraints, Flyway migrations, concurrent bookings, and STOMP WebSocket channels.*

---

## 5. API & WebSocket Specifications

- **REST API:** 55 HTTP operations across 40 paths under `/api`. Contract defined in [docs/openapi.yaml](../docs/openapi.yaml).
- **WebSocket:** STOMP over native WebSocket / SockJS at `/ws`.
  - Inbound frames strictly read-only.
  - Authenticated via JWT Bearer tokens in STOMP headers.
  - Broadcasts to `/topic/queue/{doctorId}` with zero-PII public waiting-room payloads.

---

## 6. Configuration Profiles

- `dev` (`application-dev.yml`): Default profile for local development. Includes local CORS origins (`http://localhost:5173`).
- `prod` (`application-prod.yml`): Production hardening profile. Structured ECS JSON logging, proxy forwarded-header validation (`X-Forwarded-For`), and authorized Actuator health exposure.
- `test` (`application-test.yml`): Test profile for JUnit and Testcontainers integration tests.
