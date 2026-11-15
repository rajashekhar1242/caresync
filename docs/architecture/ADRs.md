# CareSync HCMS — Architectural Decision Records (ADRs)

This document consolidates the foundational architectural decisions, context, accepted options, rejected alternatives, rationale, and trade-offs made during the design and engineering of **CareSync HCMS**.

---

## ADR 1: Modular Monolith Architecture over Distributed Microservices

### Status
Accepted

### Context
CareSync is an outpatient hospital and clinic management system encompassing appointment scheduling, real-time waiting rooms, clinical consultations, drug-drug interaction safety, electronic prescriptions, and financial invoicing. In clinical environments, atomic data consistency across consultation completion and invoice generation is paramount.

### Decision
Structure the backend as a single deployable **modular monolith** with clear domain boundaries (`com.caresync.*`), inter-module port/adapter interfaces, and unified relational persistence.

### Rejected Alternatives
- **Distributed Microservices:** Splitting scheduling, clinical records, and billing into independent services was rejected. Healthcare workflows require atomic ACID transactions; distributed sagas or 2PC would introduce eventual consistency complexities, network latency, and operational overhead.
- **Unstructured Monolith:** Storing all code in flat packages without interface-driven boundaries was rejected to avoid circular dependencies and untracked domain coupling.

### Rationale & Trade-offs
- **Transactional Atomicity:** Transitioning an appointment to `COMPLETED` atomically creates the corresponding invoice and settles queue state within a single PostgreSQL transaction.
- **Performance:** Inter-module calls execute as direct in-memory method invocations, avoiding network latency and serialization costs.
- **Operational Simplicity:** The entire backend deploys as a single lightweight container, minimizing hosting costs and monitoring complexity.

---

## ADR 2: Java 25 Virtual Threads over Reactive / WebFlux

### Status
Accepted

### Context
Outpatient clinics experience bursty I/O: waiting room displays polling queue boards, clinicians entering consultations, and staff booking appointments. The system requires high concurrency and fast response times without sacrificing maintainability.

### Decision
Adopt **Java 25 Virtual Threads** (`spring.threads.virtual.enabled: true`) with standard Spring MVC, rejecting Spring WebFlux.

### Rejected Alternatives
- **Spring WebFlux (Reactive Streams):** Rejected due to steep cognitive complexity, non-blocking stack traces that impede debugging, and incompatibility with standard JPA/JDBC drivers without reactive bridges.
- **Traditional Platform Threads Pool:** Rejected because blocking I/O (database queries, PDF generation) rapidly exhausts thread pools under high concurrent load.

### Rationale & Trade-offs
- **Imperative Simplicity:** Standard imperative Spring MVC patterns, traditional `@Transactional` boundaries, and readable stack traces are preserved.
- **High Concurrency:** Virtual threads yield throughput comparable to non-blocking reactive systems during JDBC and network I/O with zero callback overhead.

---

## ADR 3: Stateless JWT with Single-Use Refresh Token Rotation (RTR)

### Status
Accepted

### Context
Authentication must support cross-origin single-page applications, mobile clients, and WebSocket channels without server session pinning or distributed cache dependencies.

### Decision
Implement **stateless access tokens** (HMAC-SHA256 JWT, 15-minute expiry) paired with **single-use refresh token rotation** (SHA-256 hashed 64-character tokens, 7-day expiry) persisted in PostgreSQL.

### Rejected Alternatives
- **Server-Side Stateful Sessions (JSESSIONID):** Rejected because it requires sticky load balancing or external session caches (e.g. Redis), complicating zero-cost deployments.
- **Long-Lived Stateless Tokens:** Rejected because a stolen token cannot be revoked until expiration, exposing clinics to security risks.

### Rationale & Trade-offs
- **Instant Revocation & Theft Detection:** If a compromised refresh token is replayed by an attacker, the system detects the re-use of an already rotated token and immediately revokes all tokens belonging to that user's session family.
- **Stateless Read Performance:** Access tokens are verified locally via CPU signature checks, avoiding database lookups for standard API requests.

---

## ADR 4: Frontend Concurrency-Safe Refresh Token Mutex

### Status
Accepted

### Context
When a user's 15-minute access token expires while browsing a dashboard, multiple React components (e.g. queue view, stats widget, notification polling) may fire concurrent HTTP requests simultaneously, receiving multiple 401 Unauthorized responses.

### Decision
Implement a **single-flight concurrency mutex** in `frontend/src/services/api.js` and `auth.service.js`.

### Rejected Alternatives
- **Uncoordinated Retries:** Letting each component independently call `/api/auth/refresh` was rejected because the first call rotates the token, and the 2nd and 3rd calls present an already-rotated token, triggering the backend's replay guard and forcibly logging out legitimate users.
- **Proactive Timer Refresh:** Setting an aggressive interval timer was rejected because background tabs with throttled timers still experience race conditions upon waking.

### Rationale & Trade-offs
- **Prevents Accidental Logout:** The first 401 acquires the refresh lock; concurrent requests queue onto the single in-flight promise and replay with the new access token.
- **Transparent UX:** Users experience no interruption or premature redirects to `/login` during routine token rotation.

---

## ADR 5: PostgreSQL Partial Unique Indexes for Race Condition Prevention

### Status
Accepted

### Context
Appointment booking can experience race conditions when multiple patients or receptionists attempt to reserve the same doctor slot simultaneously.

### Decision
Enforce slot uniqueness at the database engine level using a **partial unique index**:
```sql
CREATE UNIQUE INDEX uq_appointment_slot_active
ON appointments (doctor_id, slot_start)
WHERE status NOT IN ('CANCELLED');
```

### Rejected Alternatives
- **Application-Level Checks:** Checking slot availability in application code prior to insert was rejected because concurrent transactions pass the check simultaneously, resulting in double bookings.
- **Pessimistic Table Locking:** Locking the entire appointments table was rejected due to severe throughput bottlenecks during peak clinic hours.

### Rationale & Trade-offs
- **Guaranteed Correctness:** Eliminates race conditions completely at the database engine level regardless of application concurrency or cluster size.
- **Cancelled Slot Reusability:** Because cancelled appointments are excluded by `WHERE status NOT IN ('CANCELLED')`, a cancelled slot can immediately be re-booked without deleting historical audit records.

---

## ADR 6: Zero-PII Public Waiting Room WebSocket Broadcasts

### Status
Accepted

### Context
Clinic waiting rooms require real-time public display screens showing upcoming queue tokens without exposing patient confidential health information (PII) to bystanders.

### Decision
Public queue endpoints (`GET /api/queue/board`) and public STOMP message topics broadcast **strictly anonymous token numbers and states** (e.g. `Token #14 — In Consultation`, `Token #15 — Waiting`).

### Rejected Alternatives
- **Client-Side Filtering:** Sending full patient data over WebSocket and filtering names in the browser was rejected as an unacceptable privacy violation and HIPAA liability.
- **SMS/App-Only Notifications:** Omitting waiting room screens was rejected because physical outpatient clinics depend on public boards for orderly queue flow.

### Rationale & Trade-offs
- **Privacy & Compliance:** Patient names, phone numbers, and clinical complaints are stripped at the backend service layer before serialization.
- **Full Operational Utility:** Patients in the waiting area see their token advance on screen without privacy exposure.

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

### Rejected Alternatives
- **Application-Level Immutability:** Relying solely on repository methods without delete methods was rejected because raw SQL access or database compromises could alter historical records.
- **External Immutable Storage (WORM / Blockchain):** Rejected due to unnecessary cost and latency for an outpatient clinic management system.

### Rationale & Trade-offs
- **Immutable Guarantee:** Prevents accidental or malicious modification of audit trails, even from database administrator accounts executing ad-hoc SQL updates.
- **Zero Performance Overhead:** Inserts proceed at native PostgreSQL speed; only unauthorized mutations are rejected.

---

## ADR 8: Pure ES6+ JavaScript Frontend Architecture

### Status
Accepted

### Context
The user interface must be clean, maintainable, fast to compile, and lightweight without introducing TypeScript build friction or complex build-time type scaffolding.

### Decision
Standardize on pure **JavaScript (ES6+) and JSX**, paired with **Zod runtime validation schemas** and JSDoc type annotations.

### Rejected Alternatives
- **TypeScript:** Rejected to eliminate TypeScript compiler transpile latency, declaration file maintenance, and build complexity for this SPA.
- **Unvalidated Vanilla JS:** Rejected because forms and API boundaries require strict runtime structural verification.

### Rationale & Trade-offs
- **Instant Compilation:** Native Vite 6 ESbuild transpilation with sub-second Hot Module Replacement (HMR).
- **Runtime Safety:** Zod schemas in `frontend/src/types/index.js` validate user form inputs and API responses at runtime, providing robust defense where it matters most.

---

## ADR 9: Fixed-Scale Decimal Financial Arithmetic

### Status
Accepted

### Context
Hospital billing handles consultation charges, itemized medication costs, partial payments, and tax receipts. Floating point inaccuracies cause rounding discrepancies and financial reconciliation errors.

### Decision
Prohibit `float` and `double` for currency across the entire codebase. Use `BigDecimal` with fixed scale of 2 (`RoundingMode.HALF_UP`) mapped to PostgreSQL `NUMERIC(12,2)`.

### Rejected Alternatives
- **Floating-Point Primitives (`double`, `float`):** Prohibited due to binary IEEE 754 precision loss that produces fractional cent errors (e.g. `0.1 + 0.2 = 0.30000000000000004`).
- **Integer Cents:** Rejected because hospital tax rules, percentage discounts, and credit note distributions require fractional decimal intermediate calculations.

### Rationale & Trade-offs
- **Exact Accounting:** Guarantees 100% precision in payment totals, balance calculations, credit notes, and tax reporting.
