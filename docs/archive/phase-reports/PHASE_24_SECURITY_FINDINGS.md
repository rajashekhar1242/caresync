# CareSync HCMS — Phase 24 Security & Authorization Audit Report

**Date:** November 13, 2026  
**Auditor:** Application Security Lead & Penetration Testing Specialist  
**Target Systems:** Spring Boot 4.1.2 REST API, Spring Security 7, PostgreSQL 16  
**Test Suite:** `scripts/phase24-security-audit.mjs`  
**Overall Result:** **23 / 23 Security Checks PASSED (0 Critical Breaches, 0 IDOR Vulnerabilities)**

---

## 1. Executive Summary

This comprehensive security audit evaluated CareSync's defensive posture across:
1. **Role-Based Access Control (RBAC):** Strict boundaries separating Admin, Receptionist, Doctor, and Patient privilege tiers.
2. **Tenant & Identity Isolation (Anti-IDOR):** Resistance against Insecure Direct Object References and cross-patient snooping or tampering.
3. **Authentication & Token Lifecycle:** Single-use Refresh Token Rotation (RTR), replay detection, automatic token family revocation, and explicit session termination.
4. **Input Sanitization & Injection Defense:** SQL Injection immunity via parameterized Hibernate queries, XSS neutralization in clinical and patient notes, and schema overload rejection.

All tested attack vectors were successfully neutralized by Spring Security, domain service ownership checks, or PostgreSQL constraint guards.

---

## 2. Security Test Matrix & Empirical Findings

| Test ID | Category | Security Vector Tested | Severity If Breached | Expected Behavior | Actual Behavior | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RBAC-01a** | RBAC | Patient attempts reading system audit logs | HIGH | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **RBAC-01b** | RBAC | Receptionist attempts reading system audit logs | HIGH | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **RBAC-01c** | RBAC | Doctor attempts reading system audit logs | HIGH | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **RBAC-01d** | RBAC | Admin reads system audit logs | N/A | HTTP 200 OK | HTTP 200 OK | **PASS** |
| **RBAC-02a** | RBAC | Patient attempts reading financial revenue reports | HIGH | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **RBAC-02b** | RBAC | Doctor attempts reading financial revenue reports | HIGH | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **RBAC-03a** | RBAC | Patient attempts calling next patient in doctor queue | HIGH | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **RBAC-03b** | RBAC | Doctor attempts advancing another doctor's queue | HIGH | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **IDOR-01** | IDOR | Patient A reads Patient B's profile (`GET /api/patients/{id}`) | CRITICAL | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **IDOR-02** | IDOR | Patient A updates Patient B's profile (`PUT /api/patients/{id}`) | CRITICAL | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **IDOR-03** | IDOR | Patient A accesses Patient B's prescription history | CRITICAL | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **IDOR-04** | IDOR | Patient A downloads Patient B's invoice PDF | CRITICAL | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **IDOR-05** | IDOR | Patient A books appointment specifying Patient B's ID | CRITICAL | HTTP 403 Forbidden | HTTP 403 Forbidden | **PASS** |
| **AUTH-01** | Auth | Unauthenticated request to protected endpoint | MEDIUM | HTTP 401 Unauthorized | HTTP 401 Unauthorized | **PASS** |
| **AUTH-02** | Auth | Malformed or forged JWT Bearer token | MEDIUM | HTTP 401 Unauthorized | HTTP 401 Unauthorized | **PASS** |
| **AUTH-03** | Auth | Single-use refresh token rotation | HIGH | HTTP 200, New Refresh Token | HTTP 200, Rotated | **PASS** |
| **AUTH-04** | Auth | Refresh token replay attack detection | HIGH | HTTP 401 Unauthorized | HTTP 401 Unauthorized | **PASS** |
| **AUTH-05** | Auth | Invalidation of entire token family upon replay | HIGH | HTTP 401 Unauthorized | HTTP 401 Unauthorized | **PASS** |
| **AUTH-06** | Auth | Explicit logout session invalidation (`POST /auth/logout`) | MEDIUM | HTTP 204 No Content | HTTP 204 No Content | **PASS** |
| **AUTH-07** | Auth | Logged-out refresh token reuse blocked | MEDIUM | HTTP 401 Unauthorized | HTTP 401 Unauthorized | **PASS** |
| **SEC-01** | Injection | SQL Injection payload in search queries (`' OR '1'='1`) | CRITICAL | Sanitized, Param Query | HTTP 200, Safe Query | **PASS** |
| **SEC-02** | XSS | Stored XSS payload in patient record (`<script>...`) | MEDIUM | Neutralized / Literal | HTTP 200, Escaped | **PASS** |
| **SEC-03** | Overload | Buffer overload payload (>5000 chars) | LOW | HTTP 400 Bad Request | HTTP 400 Bad Request | **PASS** |

---

## 3. Deep-Dive Security Architecture Analysis

### 3.1. Tenant Isolation & Anti-IDOR Enforcement
- CareSync eliminates Insecure Direct Object References by adopting a **fail-closed ownership model**:
  ```java
  private void enforceReadAccess(UserPrincipal caller, UUID patientId) {
      Role role = caller.getRole();
      if (role == Role.ADMIN || role == Role.RECEPTIONIST) {
          return;
      }
      if (role == Role.PATIENT) {
          if (!patientId.equals(caller.getPatientId())) {
              throw new ForbiddenException("Patients can only view their own record");
          }
          return;
      }
      if (role == Role.DOCTOR) {
          if (caller.getDoctorId() == null || !isDoctorOwnPatient(caller.getDoctorId(), patientId)) {
              throw new ForbiddenException("Doctors can only view records of their own patients");
          }
          return;
      }
      throw new ForbiddenException("Access denied");
  }
  ```
- **Key Defensive Guarantees:**
  - A patient cannot read, tamper with, or download any other patient's records, prescriptions, or billing invoices.
  - Doctors cannot view records of patients who do not have an active or historical non-cancelled appointment under their care (`isDoctorOwnPatient` check).
  - Booking an appointment with a spoofed `patientId` is rejected because the backend asserts `caller.getPatientId().equals(request.patientId())`.

### 3.2. Refresh Token Family Rotation & Replay Revocation
- **Threat Model:** Attacker intercepts a refresh token from network transit or client storage.
- **Defensive Mechanism:**
  1. Refresh tokens are strictly single-use. Every call to `POST /api/auth/refresh` immediately consumes the presented token and issues a new pair (`accessToken` and `refreshToken`).
  2. If an already-consumed refresh token is presented again (replay attack):
     - The system immediately flags a replay incident.
     - The entire token family associated with that user session is revoked in the database (`refresh_tokens.revoked = true`).
     - Subsequent attempts to use the newly issued rotated token will also fail with HTTP 401.
     - The legitimate user will be forced to re-authenticate, and the attacker's access is completely blocked.

### 3.3. Append-Only Audit Trail Immutability
- CareSync records audit entries for sensitive clinical, financial, and authentication events.
- To prevent insider threats or compromised administrative accounts from tampering with audit logs, migration `V12__protect_audit_logs_append_only.sql` binds a PostgreSQL trigger:
  ```sql
  CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
  RETURNS TRIGGER AS $$
  BEGIN
      RAISE EXCEPTION 'audit_logs is append-only; % operations are prohibited', TG_OP
          USING ERRCODE = 'insufficient_privilege';
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER trg_audit_logs_append_only
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION prevent_audit_log_mutation();
  ```
- Any direct `UPDATE` or `DELETE` statement against `audit_logs` fails with PostgreSQL error `insufficient_privilege`.

### 3.4. Rate Limiting & Denial-of-Service Defense
- Built-in Bucket4j token bucket filters protect critical endpoints:
  - `POST /api/auth/register`: 5 requests per minute per IP.
  - `POST /api/auth/login`: 10 requests per minute per IP.
  - `POST /api/auth/refresh`: 20 requests per minute per IP.
  - `GET /api/queue/board`: 30 requests per minute per IP.
- Rate limit violations return HTTP 429 `TOO_MANY_REQUESTS` with standard `Retry-After: <seconds>` headers.

---

## 4. Security Findings & Recommendations for Production

### Finding 1: CORS Allowed Origins in Production
- **Current State:** Default development fallback allows `http://localhost:3000` and `http://localhost:5173`.
- **Production Requirement:**
  - In production deployments, ensure `CARESYNC_CORS_ORIGINS` environment variable is explicitly set to the authoritative hospital domain (e.g., `https://caresync.hospital.com`).
  - Wildcards (`*`) must remain prohibited.

### Finding 2: JWT Signing Secret Management
- **Current State:** Set via environment variable `CARESYNC_JWT_SECRET`.
- **Production Requirement:**
  - Must be a high-entropy secret of at least 256 bits (32 bytes).
  - Must be managed via a secrets manager (AWS Secrets Manager, HashiCorp Vault, or Kubernetes Secrets).
  - Scheduled rotation strategy should be established.

### Finding 3: Reverse Proxy TLS & Forward Header Trust
- **Current State:** Configured in `application-prod.yml` with `forward-headers-strategy: native` and standard private IP subnet masks.
- **Production Requirement:**
  - Production deployments behind Nginx, AWS ALB, or Cloudflare must configure `CARESYNC_TRUSTED_PROXIES` to only trust upstream ingress controllers, preventing spoofed `X-Forwarded-For` client IP injections.

---

## 5. Security Verdict

CareSync demonstrates an outstanding security architecture with zero high or critical vulnerabilities. All role-based boundaries, patient data privacy boundaries, and authentication lifecycle semantics are verified fail-closed.

**Workstream B Security Quality Gate: PASSED.**
