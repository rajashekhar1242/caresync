# Phase 26.1 — CareSync Neon PostgreSQL Serverless Compatibility Report

## 1. Executive Summary

This report evaluates the technical compatibility between the **CareSync Hospital & Clinic Management System (HCMS)** backend and **Neon Serverless PostgreSQL 16**.

> [!NOTE]
> **Verification Status:** PostgreSQL 16 compatibility has been locally verified. Actual Neon deployment verification remains pending.

The audit confirms that CareSync's database architecture, Flyway schema migrations (`V1`–`V12`), PostgreSQL-specific extensions and triggers, and HikariCP connection pool settings are fully compatible with PostgreSQL 16 and architected for Neon Serverless PostgreSQL.

---

## 2. Serverless PostgreSQL Architecture & Dialect Compatibility

CareSync targets **PostgreSQL 16**, the standard default engine version deployed on Neon.

### 2.1 Database Features & Dialect Audit

| PostgreSQL Feature | CareSync Usage | Neon Compatibility Status | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **UUID v4 Primary Keys** | All entity identifiers (`UUID PRIMARY KEY`) | **Native Support** | Validated in `FlywayMigrationIT` |
| **Text Arrays (`TEXT[]`)** | `patients.allergies` | **Native Support** | Array queries and inserts tested in `demo-seed.sql` & `ClinicalIT` |
| **Case-Insensitive Indexes** | `uq_users_email_lower ON users (LOWER(email))` | **Native Support** | Tested in `AuthSecurityIT` |
| **Partial Unique Indexes** | `uq_appointment_slot_active` (status <> 'CANCELLED')<br/>`uq_appointment_doctor_in_consultation` (status = 'IN_CONSULTATION')<br/>`uq_payment_method_txn_ref` (method <> 'CASH') | **Native Support** | Validated via `pg_indexes` query in `FlywayMigrationIT` |
| **Database Sequences** | `invoice_number_seq`, `credit_note_number_seq` | **Native Support** | Sequential invoice generation verified in `BillingIT` |
| **Append-Only Triggers** | `prevent_audit_log_mutation()` PL/pgSQL function and `trg_audit_logs_append_only` | **Native Support** | Direct UPDATE/DELETE rejection tested in `FlywayMigrationIT` & `AuditLogIT` |
| **Timezone Sensitivity** | `TIMESTAMPTZ` with `Asia/Kolkata` storage | **Native Support** | Cross-timezone scheduling verified in `AppointmentIT` |

---

## 3. Flyway Migration Lifecycle Verification (`V1`–`V12`)

CareSync executes Flyway migrations automatically on application startup.

### 3.1 Migration Pipeline Review

| Migration Version | Description | Target Objects |
| :--- | :--- | :--- |
| `V1__create_identity_tables.sql` | Identity & Authentication | `users`, `refresh_tokens`, `uq_users_email_lower` |
| `V2__create_reference_data.sql` | Hospital Reference Entities | `clinics`, `specializations`, `departments` |
| `V3__create_doctor_tables.sql` | Clinical Staff Profiles | `doctors`, `schedule_entries`, `leaves` |
| `V4__create_patient_tables.sql` | Patient Registry | `patients` (`allergies TEXT[]`) |
| `V5__create_appointment_tables.sql` | Appointment Lifecycle | `appointments`, `doctor_day_counters` |
| `V6__create_clinical_tables.sql` | Electronic Medical Records | `consultations`, `medicines`, `drug_interactions`, `prescriptions`, `prescription_items`, `prescription_warnings` |
| `V7__create_billing_tables.sql` | Billing & Ledgers | `invoices`, `invoice_items`, `payments`, `credit_notes`, sequences |
| `V8__create_audit_table.sql` | Security & Compliance Ledger | `audit_logs` |
| `V9__create_indexes_and_constraints.sql` | Performance & Concurrency | 3 partial unique indexes, 18 operational B-Tree indexes |
| `V10__seed_reference_data.sql` | Static Reference Data | 3 clinics, 8 specializations, 4 departments, 20 medicines, 8 interactions |
| `V11__seed_staff_accounts.sql` | Initial Bootstrap Sentinels | `admin@caresync.local`, `reception@caresync.local` (`!LOCKED_REQUIRES_BOOTSTRAP!`) |
| `V12__protect_audit_logs_append_only.sql` | Compliance Trigger | Append-only security trigger on `audit_logs` |

### 3.2 Idempotency & Clean Database Execution
In `FlywayMigrationIT`, all 12 migrations were applied against a fresh PostgreSQL 16 container:
1. Initial migration applied `V1` through `V12` cleanly in under 1 second.
2. A second invocation of `flyway.migrate()` applied **0 migrations**, confirming complete idempotency.
3. Partial unique indexes and PL/pgSQL triggers were verified via `information_schema` and `pg_indexes`.

---

## 4. HikariCP Connection Pool Rightsizing for Neon Serverless

Neon's serverless compute model suspends instances after 5 minutes of idle time to conserve resources. Traditional database connection pools that hold 20–50 persistent open connections cause resource exhaustion and broken pipe errors upon compute resume.

### 4.1 Reconciled Configuration (`application-prod.yml`)

The connection pool settings across documents and code have been harmonized to the conservative serverless profile:

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: ${SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE:5}
      minimum-idle: ${SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE:1}
      connection-timeout: ${SPRING_DATASOURCE_HIKARI_CONNECTION_TIMEOUT:30000}
      idle-timeout: ${SPRING_DATASOURCE_HIKARI_IDLE_TIMEOUT:600000}
      max-lifetime: ${SPRING_DATASOURCE_HIKARI_MAX_LIFETIME:1800000}
```

### 4.2 Parameter Rationale
- **`maximum-pool-size: 5`:** Constrains pool memory footprint on Render's 512 MB Free Tier while comfortably serving concurrent requests via Java 25 Virtual Threads.
- **`minimum-idle: 1`:** Allows Neon's compute instance to scale down without being kept artificially awake by multiple idle pool connections.
- **`connection-timeout: 30000` (30 seconds):** Accommodates Neon's cold-start compute wake time (typically 2–4 seconds) during initial requests after suspension.
- **`idle-timeout: 600000` (10 minutes):** Drops surplus connections cleanly after traffic bursts.
- **`max-lifetime: 1800000` (30 minutes):** Prevents stale TCP connection issues through periodic graceful retirement.

---

## 5. Direct Compute (Port 5432) vs PgBouncer Pooler (Port 6543)

Neon provides two connection endpoints:
1. **Direct Compute Endpoint (Port `5432`):** Connects directly to the PostgreSQL compute instance.
2. **PgBouncer Pooler Endpoint (Port `6543`):** Connects through Neon's server-side transaction pooler.

### Architecture Recommendation
For the CareSync portfolio deployment, the **Direct Compute Endpoint (Port `5432`)** is selected:
- **Flyway DDL Compatibility:** Flyway schema migrations execute DDL statements (e.g. `CREATE TABLE`, `CREATE INDEX`, `CREATE TRIGGER`) that require direct connection access and are restricted under certain transaction-pooling proxies.
- **Prepared Statement Support:** Spring Data JPA and Hibernate rely on server-side prepared statements and `@Version` optimistic locking, which operate with maximum fidelity on port 5432.
- **Low Concurrency Demand:** For portfolio evaluations and recruiter reviews, HikariCP's client-side pooling (`max=5`) manages concurrency without requiring an intermediate PgBouncer proxy.

### JDBC Connection String Format
```
jdbc:postgresql://<neon-subdomain>.neon.tech:5432/caresync?sslmode=require
```

---

## 6. Conclusion

PostgreSQL 16 compatibility has been locally verified across all 12 Flyway schema migrations, partial unique indexes, append-only audit triggers, and demonstration seed scripts. Actual Neon deployment verification remains pending until cloud provisioning.
