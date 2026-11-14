# Hospital & Clinic Management System (HCMS)
## Phase 16.1 Critical Performance Remediation Report

---

### Executive Summary

| Attribute | Details |
| :--- | :--- |
| **System** | Hospital & Clinic Management System (HCMS) Backend |
| **Phase** | Phase 16.1 — Critical Performance & Concurrency Remediation |
| **Execution Date** | November 13, 2026 |
| **Scope** | Remediation and verification of `CRITICAL-01`, `CRITICAL-02`, and `HIGH-01` |
| **Verification Gate** | Full Maven Test Suite (`127 / 127` tests passing) + Targeted Concurrency Benchmarks |
| **Final Verdict** | **FULL PASS** |

Phase 16 load and stress testing revealed two critical connection-pool exhaustion deadlocks under concurrent load (`CRITICAL-01` check-in token deadlock at $c=25$, `CRITICAL-02` refresh-token replay deadlock at $c=25$) and one data-corruption defect (`HIGH-01` Schedule `LocalTime` -05:30 UTC shift on PostgreSQL).

All three findings have been remediated in place without increasing Hikari pool size, without weakening BCrypt work factor, without changing database schemas/Flyway migrations, and without introducing microservices or unapproved external dependencies.

---

### Key Remediation Metrics Summary

| Finding & Metric | Baseline (Phase 16) | Remediated (Phase 16.1) | Improvement | Status |
| :--- | :--- | :--- | :--- | :--- |
| **CRITICAL-01** Check-In Tokens ($c=25$) Wall Time | `15,011.24 ms` | **`897.37 ms`** | **16.7x faster** | **FIXED** |
| **CRITICAL-01** Check-In Status Distribution | `TIMEOUT: 25` | **`200: 25`** | **100% success (0 timeouts)** | **FIXED** |
| **CRITICAL-01** Daily Token Assignment | 0 tokens (deadlocked) | **25 unique tokens (1..25)** | Fully atomic & contiguous | **FIXED** |
| **CRITICAL-02** Refresh Race ($c=25$) Wall Time | `15,021.03 ms` | **`354.02 ms`** | **42.4x faster** | **FIXED** |
| **CRITICAL-02** Refresh Race Statuses | `200: 1, TIMEOUT: 24` | **`200: 1, 401: 24`** | **Zero timeouts / zero 5xx** | **FIXED** |
| **CRITICAL-02** Token Replay Security Guarantee | Rotated token returned `200` (BYPASS) | Rotated token returned `401` (**REVOKED**) | Full family revocation | **FIXED** |
| **HIGH-01** Schedule Times (`00:00`, `00:05`, `23:55`) | Shifted by `-05:30` (DB check violation) | Exact `LocalTime` preserved across timezones | 100% bit-exact across timezones | **FIXED** |
| **Database Pool** Hikari Pending Threads Post-Test | `6` pool timeouts, thread starvation | **`0` pending, `0` active, `20` idle** | Clean pool reclamation | **FIXED** |
| **Surefire Unit Tests** | 99 passing | **102 passing (0 failures, 0 skipped)** | +3 targeted unit tests | **PASS** |
| **Failsafe Integration Tests** | 22 passing | **25 passing (0 failures, 0 skipped)** | +3 targeted ITs | **PASS** |
| **Total Automated Tests** | 121 tests | **127 tests (0 failures, 0 skipped)** | **100% Pass Rate** | **PASS** |

---

### 1. Root Cause Analysis

#### A. CRITICAL-01: Check-in Connection-Pool Deadlock
- **Mechanism:** When a receptionist updates an appointment status to `CHECKED_IN`, `StatusTransitionService.checkIn()` executes inside `@Transactional`. While holding Connection A from `HikariPool-1`, the service fires a `QueueUpdatedEvent` via Spring's `ApplicationEventPublisher`.
- **Interception:** `QueueMessagePublisher.onQueueUpdated()` caught the event synchronously at `TransactionPhase.AFTER_COMMIT`. However, it immediately called `QueueService.buildQueueUpdateMessage()`, which was annotated with `@Transactional(propagation = Propagation.REQUIRES_NEW)`.
- **Deadlock:** `Propagation.REQUIRES_NEW` requests a *second* database connection (Connection B) while Connection A is still held by the active transaction context before final thread cleanup. With 25 concurrent check-ins competing for 20 Hikari connections (`maximum-pool-size: 20`), all 20 connections became occupied by outer transactions waiting for inner connections that did not exist.
- **Result:** After `connection-timeout = 30000 ms`, threads threw `CannotCreateTransactionException` wrapping `SQLTransientConnectionException`, crashing requests and failing WebSocket broadcasts.

#### B. CRITICAL-02: Concurrent Refresh-Token Replay Deadlock & Revocation Bypass
- **Mechanism:** In `AuthService.refresh()`, multiple concurrent HTTP requests presenting the same refresh token arrived simultaneously.
- **Nested Connection Request:** `AuthService.refresh()` called `RefreshTokenRevocationService.revokeAllActiveTokensForUser()`, which was annotated with `@Transactional(propagation = Propagation.REQUIRES_NEW)`. Outer transactions held connections while inner transactions attempted to acquire separate connections.
- **Race Condition without Row Lock:** The initial read `refreshTokenRepository.findByTokenHash(tokenHash)` did not obtain a database row lock. All 25 concurrent requests read the token as active (`revokedAt == null`), so multiple threads attempted rotation or revocation simultaneously.
- **Security Defect:** When pool exhaustion aborted the revocation transactions, the newly rotated token was not revoked, allowing an attacker replaying an intercepted token to leave the stolen session active.

#### C. HIGH-01: Schedule `LocalTime` Timezone Shift
- **Mechanism:** `application.yml` sets `spring.jpa.properties.hibernate.jdbc.time_zone: UTC`.
- **Conversion Error:** In Hibernate 6/7, standard JPA mapping for `java.time.LocalTime` on a PostgreSQL `TIME WITHOUT TIME ZONE` column converted local times against the JVM's default timezone (e.g. `Asia/Kolkata` `UTC+05:30`) to UTC when writing to JDBC.
- **Corruption:** A schedule defined from `00:00` to `08:00` in IST was shifted by `-05:30`, producing negative wrapped times (`18:30` previous day) or failing the database constraint `CHECK (start_time < end_time)`. Edge cases `00:00` and `23:55` suffered date-boundary truncations.

---

### 2. Remediation Implementation Details

#### Remediation 1: CRITICAL-01 Resolution
1. **Asynchronous Broadcast Thread Pool ([QueueAsyncConfig.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/queue/config/QueueAsyncConfig.java)):**
   - Created a bounded `ThreadPoolTaskExecutor` bean `queueBroadcastExecutor`.
   - Core pool: 4, Max pool: 8, Queue capacity: 500, Thread prefix: `queue-broadcast-`.
   - Rejection policy: `ThreadPoolExecutor.DiscardPolicy` with warning log.
   - Clean shutdown: `setWaitForTasksToCompleteOnShutdown(true)`, `setAwaitTerminationSeconds(5)`.
2. **Transaction Propagation Flattening ([QueueService.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/queue/service/QueueService.java)):**
   - Changed `buildQueueUpdateMessage(UUID clinicId, UUID doctorId)` from `@Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)` to `@Transactional(readOnly = true)`.
   - Reuses existing transactions or runs in its own connection when called outside a transaction, eliminating nested connection acquisition.
3. **Async Event Publisher ([QueueMessagePublisher.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/queue/service/QueueMessagePublisher.java)):**
   - Injected `queueBroadcastExecutor`.
   - Captured MDC logging context (`req`, `user`) from the calling thread.
   - Dispatched the query execution and STOMP message broadcasting asynchronously to `queueBroadcastExecutor` after the transaction commits, ensuring the HTTP worker thread releases its Hikari connection immediately.

#### Remediation 2: CRITICAL-02 Resolution
1. **Pessimistic Row Locking ([RefreshTokenRepository.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/auth/repository/RefreshTokenRepository.java)):**
   - Added query method:
     ```java
     @Lock(LockModeType.PESSIMISTIC_WRITE)
     @Query("SELECT r FROM RefreshToken r WHERE r.tokenHash = :tokenHash")
     Optional<RefreshToken> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);
     ```
   - Emits PostgreSQL `SELECT ... FOR UPDATE`, forcing concurrent refresh requests with the same token hash to serialize at the database row level.
2. **Removal of `REQUIRES_NEW` ([RefreshTokenRevocationService.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/auth/service/RefreshTokenRevocationService.java)):**
   - Removed `propagation = Propagation.REQUIRES_NEW`; now uses `@Transactional`.
   - Executes inside the caller's transaction, avoiding secondary connection acquisition.
3. **Atomic Transaction Scope ([AuthService.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/auth/service/AuthService.java)):**
   - Annotated `AuthService.refresh()` with `@Transactional(noRollbackFor = UnauthorizedException.class)`.
   - Acquired pessimistic lock on `findByTokenHashForUpdate(tokenHash)`.
   - The first thread to acquire the lock validates the active token, marks it revoked, issues a new token pair, and commits.
   - Subsequent serialized threads wake up, read `revokedAt != null`, log a security warning, call `revokeAllActiveTokensForUser(userId)`, and throw `UnauthorizedException(ErrorCode.INVALID_REFRESH_TOKEN)`.
   - `noRollbackFor = UnauthorizedException.class` ensures the revocation of all user tokens is committed even when 401 is thrown.

#### Remediation 3: HIGH-01 Resolution
1. **PostgreSQL Explicit `LocalTime` JDBC Type ([ScheduleEntry.java](file:///Z:/javaproject/backend/src/main/java/com/caresync/doctor/entity/ScheduleEntry.java)):**
   - Annotated `startTime` and `endTime` fields with Hibernate's `@JdbcType(LocalTimeJdbcType.class)`:
     ```java
     @JdbcType(LocalTimeJdbcType.class)
     @Column(name = "start_time", nullable = false)
     private LocalTime startTime;

     @JdbcType(LocalTimeJdbcType.class)
     @Column(name = "end_time", nullable = false)
     private LocalTime endTime;
     ```
   - Bypasses global `hibernate.jdbc.time_zone: UTC` translation on `TIME` columns. `LocalTime` values are persisted and read as pure time-of-day without offset manipulation.

---

### 3. Automated Test Evidence

#### Test Suite Execution Summary
Executed via `.\mvnw.cmd clean verify` against Testcontainers PostgreSQL 16:

```text
[INFO] -------------------------------------------------------
[INFO]  T E S T S
[INFO] -------------------------------------------------------
Surefire Unit Tests:   102 run, 0 failures, 0 errors, 0 skipped (100% PASS)
Failsafe IT Tests:      25 run, 0 failures, 0 errors, 0 skipped (100% PASS)
Total Automated Tests: 127 run, 0 failures, 0 errors, 0 skipped (100% PASS)
BUILD SUCCESS (Total time: 01:56 min)
```

#### Specific Remediation Integration Tests
1. **`ScheduleTimezonePersistenceIT` (4 tests, 0 failures):**
   - Tested schedule creation and retrieval with edge cases: `00:00`, `00:05`, `09:00`, `12:30`, `18:00`, `23:55`.
   - Verified roundtrip persistence with client JVM timezones: `Asia/Kolkata` (UTC+5:30), `UTC`, and `America/New_York` (UTC-5:00).
   - Confirmed exact match in Java objects and raw database SQL queries.
2. **`AuthSecurityIT` (5 tests, 0 failures):**
   - Verified `concurrentRefreshRaceRevokesUserRefreshTokensAndLeavesZeroActiveTokens` with 25 concurrent threads on distinct IPs.
   - 1 thread succeeds (200 OK, rotated tokens issued), 24 threads reject (401 INVALID_REFRESH_TOKEN).
   - Verified that zero active tokens remain for the user after replay race.
3. **`QueueIT` (2 tests, 0 failures):**
   - Verified `concurrentCheckIn25AppointmentsIssuesUniqueTokensWithoutPoolDeadlock` with 25 concurrent check-ins.
   - Confirmed all 25 receive HTTP 200, zero deadlocks, and daily token numbers are uniquely assigned from 1 to 25.
   - Verified public queue board statement count remains bounded ($\le 6$ statements) when 4 additional doctors check in.

---

### 4. Load & Concurrency Benchmark Comparison

Benchmarks executed using the Node.js performance test harness against PostgreSQL 16 on `http://localhost:18080`:

#### A. Contested Check-In Tokens ($c=25$) — CRITICAL-01 Verification
Scenario: 25 simultaneous check-ins for booked appointments competing for daily queue tokens.

| Metric | Phase 16 Baseline | Phase 16.1 Remediation | Comparison |
| :--- | :--- | :--- | :--- |
| **Concurrency ($c$)** | 25 | 25 | Identical |
| **Wall Clock Duration** | `15,011.24 ms` | **`897.37 ms`** | **16.7x speedup** |
| **Throughput (RPS)** | 1.67 RPS | **27.86 RPS`** | **+1568%** |
| **p50 Latency** | `15,006.90 ms` | **`565.94 ms`** | **-96.2%** |
| **p95 Latency** | `15,007.18 ms` | **`861.51 ms`** | **-94.3%** |
| **Max Latency** | `15,007.19 ms` | **`893.94 ms`** | **-94.0%** |
| **Status Breakdown** | `TIMEOUT: 25` | **`200: 25`** | **0% failures** |
| **Tokens Issued** | 0 (deadlocked) | **25 (100%)** | Valid |
| **Unique Tokens** | 0 | **25** | No duplicates |
| **Contiguous from 1** | `false` | **`true` (1..25)** | Exact daily sequencing |
| **HikariCP Failures** | 5 `CannotCreateTransactionException` | **0 errors** | Zero connection leaks |

#### B. Same-Token Refresh Concurrency ($c=25$) — CRITICAL-02 Verification
Scenario: 25 simultaneous refresh requests presenting the identical refresh token.

| Metric | Phase 16 Baseline | Phase 16.1 Remediation | Comparison |
| :--- | :--- | :--- | :--- |
| **Concurrency ($c$)** | 25 | 25 | Identical |
| **Wall Clock Duration** | `15,021.03 ms` | **`354.02 ms`** | **42.4x speedup** |
| **Throughput (RPS)** | 1.66 RPS | **70.62 RPS** | **+4154%** |
| **p50 Latency** | `15,015.64 ms` | **`221.26 ms`** | **-98.5%** |
| **p95 Latency** | `15,017.07 ms` | **`341.46 ms`** | **-97.7%** |
| **Max Latency** | `15,017.18 ms` | **`347.00 ms`** | **-97.7%** |
| **Status Breakdown** | `200: 1, TIMEOUT: 24` | **`200: 1, 401: 24`** | **0 timeouts, 0 5xx** |
| **Old Token Post-Race Status** | `TIMEOUT` | **`401 INVALID_REFRESH_TOKEN`** | Successfully rejected |
| **Rotated Token Post-Race** | `200 OK` (Bypass vulnerability) | **`401 INVALID_REFRESH_TOKEN`** | **Revoked as expected** |
| **Security Event Logged** | Revocation transaction failed | `REFRESH_REPLAY_REVOKED` logged | Sanitized security audit |

#### C. Actuator HikariCP Metrics Snapshot Post-Benchmark
Captured from `/actuator/metrics` after high-concurrency booking and auth races:
```json
{
  "hikaricp.connections.active": 0.0,
  "hikaricp.connections.idle": 20.0,
  "hikaricp.connections.pending": 0.0,
  "hikaricp.connections.acquire.total_count": 755.0,
  "hikaricp.connections.acquire.max_seconds": 1.286
}
```
All 20 connections cleanly returned to idle pool; zero pending threads.

---

### 5. Medium-Severity Recommendation: Database Composite Indexing

Phase 16 identified potential performance gains on large datasets (50k+ records) by adding composite indexes. As instructed, no Flyway schema migrations were modified in Phase 16.1. The following proposal is prepared for approval in Phase 17:

```sql
-- Proposal: V13__add_appointment_performance_indexes.sql
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_status_slot 
  ON appointments (doctor_id, status, slot_start);

CREATE INDEX IF NOT EXISTS idx_appointments_patient_status_slot 
  ON appointments (patient_id, status, slot_start);
```
- **Rationale:** Optimizes doctor schedule slot queries and patient appointment listing with status filtering, reducing sequential scans during high volume periods.

---

### 6. Architectural Compliance Checklist

- [x] **No Hikari Pool Increase:** Maintained `maximum-pool-size: 20` and `minimum-idle: 5`.
- [x] **No BCrypt Weakening:** Maintained standard work factor 10.
- [x] **No Global JVM Timezone Mutation:** Avoided `TimeZone.setDefault()`; used Hibernate `@JdbcType(LocalTimeJdbcType.class)`.
- [x] **No Flyway Migration Alteration:** Maintained existing V1–V12 migrations unmodified.
- [x] **Security Guarantees Intact:** Refresh token reuse triggers full session revocation with `REFRESH_REPLAY_REVOKED` audit logging without leaking tokens or PII.
- [x] **WebSocket Guarantees Intact:** Anonymous public queue board broadcasts contain zero patient PII.
- [x] **Zero Regressions:** All 127 automated unit and integration tests passed cleanly.

---

### 7. Sign-off & Verdict

Phase 16.1 Critical Performance Remediation is **COMPLETE**. All critical pool-deadlock vulnerabilities and data corruption defects have been successfully remediated, verified by both rigorous unit/integration tests and real load concurrency benchmarks.

**Verdict: FULL PASS**
