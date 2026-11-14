# CareSync HCMS — Key Architectural & Engineering Decisions (ADRs)

This document records the foundational architectural decisions, rationale, alternatives considered, and trade-offs made during the design and development of **CareSync HCMS**.

---

## ADR 1: Modular Monolith Architecture over Distributed Microservices

### Status
Accepted

### Context
CareSync is an outpatient hospital clinic management system covering appointment booking, live queues, consultations, prescriptions, and billing. In healthcare systems, data consistency across clinical encounters and invoicing is paramount.

### Decision
Structure the backend as a single-deployment **modular monolith** with clear package boundaries (`com.caresync.*`), inter-module port/adapter interfaces, and unified relational storage.

### Rationale & Trade-offs
- **Transactional Consistency:** Transitioning an appointment to `COMPLETED` atomically generates an invoice and updates queue state in a single database transaction. Microservices would require distributed sagas, 2PC, or outbox patterns with eventual consistency complexities.
- **Performance:** Inter-module calls execute as direct in-memory method invocations, eliminating network serialization overhead and latency.
- **Operational Footprint:** Can be deployed as a single lightweight container on cost-effective cloud tiers (Render / container host) without Kubernetes or service mesh overhead.

---

## ADR 2: Java 25 Virtual Threads over Reactive / WebFlux

### Status
Accepted

### Context
Healthcare management systems experience bursty I/O: waiting room displays polling queue boards, clinicians saving consultations, and front desk staff booking slots. High concurrency is essential.

### Decision
Adopt **Java 25 Virtual Threads** (`spring.threads.virtual.enabled: true`) with Spring MVC, rejecting Spring WebFlux.

### Rationale & Trade-offs
- **Imperative Simplicity:** Standard imperative Spring MVC programming, traditional `@Transactional` boundaries, and straightforward stack traces are preserved.
- **High Concurrency:** Virtual threads yield throughput comparable to non-blocking reactive systems during JDBC and network I/O without the steep complexity, callback hell, or debugging difficulty of Reactive Streams.

---

## ADR 3: Stateless JWT with Single-Use Refresh Token Rotation (RTR)

### Status
Accepted

### Context
Authentication must support cross-origin single-page applications, mobile clients, and WebSocket channels without server session pinning.

### Decision
Implement **stateless access tokens** (HS256 JWT, 15-minute expiry) paired with **single-use refresh token rotation** (SHA-256 hashed 64-character tokens, 7-day expiry) stored in PostgreSQL.

### Rationale & Trade-offs
- **Instant Revocation & Theft Detection:** If a compromised refresh token is replayed by an attacker, the system detects the re-use of an already rotated token and immediately revokes all tokens belonging to that user's session family.
- **Stateless Read Performance:** Access tokens are verified locally by CPU signature checks, avoiding database lookups for standard API requests.

---

## ADR 4: Frontend Concurrency-Safe Refresh Token Mutex

### Status
Accepted

### Context
When a user's 15-minute access token expires while browsing a dashboard, multiple React components (e.g. queue view, stats widget, notification polling) may fire concurrent HTTP requests simultaneously, receiving multiple 401 Unauthorized responses.

### Decision
Implement a **single-flight concurrency mutex** in `frontend/src/services/api.js`.

### Rationale & Trade-offs
- **Prevents Accidental Logout:** Without a mutex, 3 concurrent 401s would fire 3 refresh requests. The first would succeed and rotate the token, but the 2nd and 3rd would present the old token, triggering the backend's replay-detection guard and forcibly logging out a legitimate user.
- **Transparent UX:** The first 401 acquires the refresh lock; other concurrent 401s are queued in an array of pending promises and re-executed once the primary refresh completes.

---

## ADR 5: PostgreSQL Partial Unique Indexes for Race Condition Prevention

### Status
Accepted

### Context
Appointment booking can experience race conditions when multiple patients or receptionists attempt to book the same doctor slot simultaneously.

### Decision
Enforce slot uniqueness at the database engine level using a **partial unique index**:
```sql
CREATE UNIQUE INDEX uq_appointment_slot_active
ON appointments (doctor_id, slot_start)
WHERE status NOT IN ('CANCELLED');
```

### Rationale & Trade-offs
- **Guaranteed Correctness:** Eliminates race conditions completely, regardless of application concurrency or cluster node count.
- **Cancelled Slot Re-usability:** Because cancelled appointments are excluded from the index, a cancelled slot can immediately be re-booked by another patient without deleting the historical cancelled record.

---

## ADR 6: Zero-PII Public Waiting Room WebSocket Broadcasts

### Status
Accepted

### Context
Waiting rooms require real-time public display screens showing upcoming queue tokens without exposing patient confidential health information (PII) to bystanders.

### Decision
Public queue endpoints (`GET /api/queue/board`) and public STOMP message topics broadcast **strictly anonymous token numbers and states** (e.g. `Token #14 — In Consultation`, `Token #15 — Waiting`).

### Rationale & Trade-offs
- **HIPAA / Privacy Best Practice:** Patient names, phone numbers, and consultation reasons are stripped at the backend service layer before serialization.
- **Full Operational Utility:** Patients in the waiting area see their token advance on the board without privacy risks.

---

## ADR 7: Append-Only Database Trigger for Compliance Audit Logs

### Status
Accepted

### Context
Healthcare compliance standards require tamper-evident logging of administrative actions, patient record access, clinical diagnoses, and invoice cancellations.

### Decision
Protect the `audit_logs` table via a PostgreSQL `BEFORE UPDATE OR DELETE` trigger created in Flyway migration `V12`:
```sql
CREATE TRIGGER protect_audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
```

### Rationale & Trade-offs
- **Immutable Guarantee:** Prevents accidental or malicious modification of audit trails, even from database administrator accounts executing ad-hoc SQL updates.
- **Zero Overhead:** Inserts proceed at native speed; only unauthorized mutations are rejected.

---

## ADR 8: Pure ES6+ JavaScript Frontend Architecture

### Status
Accepted

### Context
The user interface must be clean, maintainable, fast to compile, and lightweight without introducing TypeScript build friction.

### Decision
Standardize on pure **JavaScript (ES6+) and JSX**, paired with **Zod runtime validation schemas** and JSDoc type annotations.

### Rationale & Trade-offs
- **Fast Build Times:** Native Vite 6 ESbuild transpilation with zero TypeScript compiler type-check latency.
- **Runtime Safety:** Zod schemas in `frontend/src/types/index.js` validate user form inputs and API payloads at runtime, providing robust defense where it matters most.

---

## ADR 9: Fixed-Scale Decimal Financial Arithmetic

### Status
Accepted

### Context
Hospital billing handles consultation charges, itemized medication costs, partial payments, and tax receipts. Floating point inaccuracies cause rounding discrepancies and financial reconciliation errors.

### Decision
Prohibit `float` and `double` for currency across the entire codebase. Use `BigDecimal` with fixed scale of 2 (`RoundingMode.HALF_UP`) mapped to PostgreSQL `NUMERIC(12,2)`.

### Rationale & Trade-offs
- **Exact Accounting:** Guarantees 100% precision in payment totals, balance calculations, credit notes, and tax reporting.
