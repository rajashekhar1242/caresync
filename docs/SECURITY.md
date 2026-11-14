# CareSync HCMS — Security & Authorization Architecture

## 1. Security Overview & Threat Model

Healthcare information systems handle Protected Health Information (PHI) and financial transactions. **CareSync** is architected with a **defense-in-depth** security strategy:

- **Authentication:** Stateless short-lived JWT access tokens + Single-Use Refresh Token Rotation (RTR).
- **Authorization:** Granular Role-Based Access Control (RBAC) enforced at HTTP, method, and domain service boundaries.
- **Data Isolation:** Strict Anti-IDOR (Insecure Direct Object Reference) guards ensuring patient records and medical histories are inaccessible to unauthorized callers.
- **Channel Security:** WebSocket STOMP channel authorization and zero-PII public waiting-room payloads.
- **Compliance Logging:** Append-only database triggers preventing tampering with security and operational audit logs.

> **Portfolio Disclaimer:** CareSync is an advanced engineering demonstration project designed to showcase secure software architecture and enterprise Java development best practices. It has not undergone formal third-party regulatory certification for HIPAA, GDPR, or SOC 2 compliance.

---

## 2. Authentication & Token Security

### 2.1 Access Tokens (JWT)
- **Algorithm:** HMAC-SHA256 (`HS256`) signed with a minimum 256-bit cryptographically random secret key (`CARESYNC_JWT_SECRET`).
- **Lifespan:** 15 minutes (900 seconds) to minimize the exposure window if a client token is intercepted.
- **Claims:** Embedded `sub` (User UUID), `email`, `role`, `iat`, and `exp`. Tokens are stateless and verified by CPU signature check without database roundtrips.

### 2.2 Refresh Token Rotation (RTR) & Replay Theft Detection
- **Format:** 64-character cryptographically secure hex string generated via `SecureRandom`.
- **Database Storage:** Stored as an SHA-256 hash (`token_hash VARCHAR(64) UNIQUE`) in PostgreSQL. The raw token is never persisted.
- **Single-Use Policy:** Each invocation of `POST /api/auth/refresh` consumes the presented token, marks it revoked, and issues a new refresh token.
- **Replay Attack Detection:** If an already-revoked refresh token is presented again (indicating that an attacker has stolen and replayed a previous token), the backend immediately triggers automatic family revocation, revoking all active sessions for that user.

### 2.3 Staff Account Bootstrap Sentinel
To prevent predictable default passwords from entering source control or database migrations:
- Flyway migration `V11` seeds default `admin@caresync.local` and `reception@caresync.local` with the non-BCrypt sentinel hash `!LOCKED_REQUIRES_BOOTSTRAP!`.
- Accounts cannot be authenticated in this state.
- `StaffAccountBootstrapRunner` initializes BCrypt password hashes only when `CARESYNC_ADMIN_PASSWORD` and `CARESYNC_RECEPTIONIST_PASSWORD` environment variables are provided on startup.

---

## 3. Role-Based Access Control (RBAC)

Access permissions are enforced across four authenticated roles:

| Capability | ADMIN | RECEPTIONIST | DOCTOR | PATIENT |
| :--- | :---: | :---: | :---: | :---: |
| **System Audit Logs (`/api/audit-logs`)** | **YES** | NO | NO | NO |
| **Financial Revenue Reports (`/api/reports/*`)** | **YES** | NO | NO | NO |
| **Department Management (`/api/departments`)** | **YES** | NO | NO | NO |
| **Doctor Profile CRUD (`/api/doctors`)** | **YES** | Read-Only | Read-Only | Read-Only |
| **Patient Registration (`/api/patients`)** | **YES** | **YES** | NO | Self Only |
| **Appointment Booking (`/api/appointments`)** | **YES** | **YES** | NO | Self Only |
| **Patient Check-In (`/api/appointments/{id}/check-in`)** | **YES** | **YES** | NO | NO |
| **Doctor Queue Advance (`call-next`)** | **YES** | NO | Own Queue Only | NO |
| **Consultation & Diagnosis Entry** | NO | NO | Own Patients Only | NO |
| **Prescription Authoring** | NO | NO | Own Patients Only | NO |
| **Patient Medical Records Access** | NO | NO | Booked Patients Only | Self Only |
| **Invoice Settlement & Counter Payments** | **YES** | **YES** | NO | Online Self |
| **Invoice Voids & Credit Notes** | **YES** | NO | NO | NO |

---

## 4. Anti-IDOR & Patient Identity Scoping

Insecure Direct Object Reference (IDOR) vulnerabilities allow malicious actors to view or alter records by manipulating URL parameters (e.g. `GET /api/patients/123e4567-e89b...`).

CareSync implements three layers of IDOR defense:
1. **Self-Ownership Scoping for Patients:**
   - In `PatientService`, queries for patient records compare the caller's authenticated `UserPrincipal.id` against the target patient's `userId`.
   - Patients attempting to view another patient's profile, medical history, or invoices are immediately rejected with `403 Forbidden`.
2. **Doctor-Patient Relationship Scoping (`DoctorPatientScopePort`):**
   - Doctors are not granted blanket read access to the entire patient database.
   - A doctor may only inspect the medical history and allergies of a patient who has an active or past non-cancelled appointment booked with that doctor:
     ```sql
     SELECT EXISTS (
         SELECT 1 FROM appointments
         WHERE doctor_id = :doctorId AND patient_id = :patientId
         AND status != 'CANCELLED'
     )
     ```
3. **Restricted Financial Downloads:**
   - In `InvoiceController`, generating an invoice PDF validates that the requesting caller is either an `ADMIN`, `RECEPTIONIST`, or the specific `PATIENT` billed on that invoice.

---

## 5. WebSocket & Real-Time Queue Authorization

Real-time communication over STOMP (`/ws`) enforces strict security via `WebSocketSecurityConfig`:
1. **Authentication Handshake:**
   - Handshake requires a valid JWT Bearer token in the STOMP `CONNECT` frame headers.
   - Missing, expired, or forged tokens are rejected immediately, terminating the connection.
2. **Read-Only Channel Guard:**
   - All inbound `SEND` frames from clients are rejected. Clients cannot inject unauthorized messages into broker topics.
3. **Topic Subscription RBAC:**
   - Subscriptions to doctor queues (`/topic/queue/{doctorId}`) are restricted:
     - `DOCTOR`: Permitted to subscribe only to their own assigned doctor ID.
     - `ADMIN` & `RECEPTIONIST`: Permitted to subscribe to any queue for hospital-wide coordination.
     - `PATIENT`: Forbidden from subscribing to doctor queue management streams.
4. **Zero-PII Public Queue Displays:**
   - The public waiting room queue board (`GET /api/queue/board`) exposes strictly anonymized token numbers (e.g. `Token #12 - In Consultation`). No patient names, phone numbers, or medical reasons are broadcast.

---

## 6. Rate Limiting & Denial-of-Service Defense

Implemented via `RateLimitFilter` using an in-memory token-bucket algorithm:
- `POST /api/auth/register`: 5 requests per minute per IP.
- `POST /api/auth/login`: 10 requests per minute per IP (mitigates brute-force credential stuffing).
- `POST /api/auth/refresh`: 20 requests per minute per IP.
- `GET /api/queue/board`: 30 requests per minute per IP.
- **Proxy Header Security:** Inspects `X-Forwarded-For` only when the remote host matches trusted reverse proxy CIDRs (`CARESYNC_TRUSTED_PROXIES`), preventing IP spoofing rate-limit bypasses.

---

## 7. Compliance Audit Logging & Immutability Trigger

All security-sensitive operations trigger synchronous transactional audit events:
- Authentication events (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `TOKEN_ROTATED`, `REPLAY_ATTACK_DETECTED`).
- Data access events (`PATIENT_READ`, `MEDICAL_HISTORY_ACCESSED`).
- Clinical operations (`CONSULTATION_SAVED`, `PRESCRIPTION_ISSUED`, `WARNING_ACKNOWLEDGED`).
- Financial operations (`INVOICE_GENERATED`, `PAYMENT_RECEIVED`, `INVOICE_VOIDED`, `CREDIT_NOTE_ISSUED`).

### Tamper-Proof Trigger (`V12`)
Flyway migration `V12` attaches a PostgreSQL `BEFORE UPDATE OR DELETE` trigger on `audit_logs`:
```sql
CREATE TRIGGER protect_audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
```
*Even an administrative SQL query attempting to alter or delete historical audit entries will fail and abort the transaction.*
