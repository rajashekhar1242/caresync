# Phase 20.1.1 — Environment Inspection Report

**Project:** Hospital & Clinic Management System (HCMS / CareSync)  
**Date:** November 13, 2026  
**Auditor:** Senior QA Automation Engineer, Full-Stack Integration Tester & Security Reviewer  
**Status:** PASS — All Services Live & Healthy  

---

## 1. Service Status Summary

| Service | Technology / Container | Host Port | Status | Health / Readiness Probe | Notes |
|---|---|---|---|---|---|
| **Database** | PostgreSQL 16.15-alpine (`caresync-postgres`) | `5432` | **UP (healthy)** | `pg_isready -U caresync -d caresync` (exit code 0) | Clean container initialized with Flyway migrations `V1`–`V12` applied |
| **Backend API** | Spring Boot 4.1.2 (Java 25.0.1 LTS) | `8080` | **UP** | `GET http://localhost:8080/actuator/health` -> `{"status":"UP","groups":["liveness","readiness"]}` | Active profile: `dev`; Tomcat started in 23.7s; HikariCP pool initialized (max 20, min 5) |
| **Frontend Web** | Vite 6.4.6 / React 18 SPA | `5173` | **UP** | `GET http://localhost:5173/` -> `HTTP 200 OK` | Dev proxy enabled (`/api` -> `http://localhost:8080`, `/ws` -> `http://localhost:8080`) |

---

## 2. Port & Network Configuration

- **PostgreSQL Port:** `5432` (Docker binding `0.0.0.0:5432->5432/tcp`). Tested via loopback TCP socket connection: `TcpTestSucceeded: True`.
- **Backend Port:** `8080` (HTTP). Context path: `/`. Management actuator exposed at `/actuator/health`, `/actuator/info`, `/actuator/metrics`.
- **Frontend Port:** `5173` (HTTP). Vite proxy configured to map all `/api/*` and `/ws/*` calls transparently to `http://localhost:8080`.
- **CORS Configuration:** Configured in `application-dev.yml` allowing `http://localhost:3000,http://localhost:5173` with credentials support.
- **Reporting Timezone:** Explicitly configured as `Asia/Kolkata` for daily and monthly statistical bucketing.

---

## 3. Database Schema & Flyway Migration Status

Flyway successfully applied all 12 migrations from `classpath:db/migration` upon Spring Boot startup:

```
2026-11-13T13:34:06.645+05:30 INFO  [main] o.f.core.internal.command.DbValidate - Successfully validated 12 migrations
2026-11-13T13:34:06.893+05:30 INFO  [main] o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "1 - create identity tables"
2026-11-13T13:34:07.047+05:30 INFO  [main] o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "2 - create reference data"
2026-11-13T13:34:07.187+05:30 INFO  [main] o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "3 - create doctor tables"
2026-11-13T13:34:07.328+05:30 INFO  [main] o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "4 - create patient tables"
2026-11-13T13:34:07.471+05:30 INFO  [main] o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "5 - create appointment tables"
2026-11-13T13:34:07.582+05:30 INFO  [main] o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "6 - create clinical tables"
2026-11-13T13:34:07.850+05:30 INFO  [main] o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "7 - create billing tables"
2026-11-13T13:34:08.036+05:30 INFO  [main] o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "8 - create audit table"
2026-11-13T13:34:08.125+05:30 INFO  [main] o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "9 - create indexes and constraints"
2026-11-13T13:34:08.462+05:30 INFO  [main] o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "10 - seed reference data"
2026-11-13T13:34:08.541+05:30 INFO  [main] o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "11 - seed staff accounts"
2026-11-13T13:34:08.593+05:30 INFO  [main] o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "12 - protect audit logs append only"
2026-11-13T13:34:08.655+05:30 INFO  [main] o.f.core.internal.command.DbMigrate - Successfully applied 12 migrations to schema "public", now at version v12
```

---

## 4. Bootstrap Accounts & Security Parameters

- **Admin Account:**
  - Email: `admin@caresync.local`
  - Seed UUID: `00000000-0000-4000-8000-000000000001`
  - Status: Successfully unlocked and credentialed by `StaffAccountBootstrapRunner` on startup.
- **Receptionist Account:**
  - Email: `reception@caresync.local`
  - Seed UUID: `00000000-0000-4000-8000-000000000002`
  - Status: Successfully unlocked and credentialed by `StaffAccountBootstrapRunner` on startup.
- **JWT Authentication:**
  - Algorithm: HMAC-SHA256 (HS256) with cryptographically sound >= 32-byte secret key.
  - Access Token Expiration: 900 seconds (15 minutes).
  - Refresh Token Expiration: 604,800 seconds (7 days).
- **Rate Limiting (Bucket4j):**
  - Registration: 5 requests / min
  - Login: 10 requests / min
  - Token Refresh: 20 requests / min
  - Queue Board: 30 requests / min

---

## 5. Startup Issues & Resolution

- **Issue:** `docker compose` initially failed inside standard sandbox isolation due to Windows named pipe restriction (`\\.\pipe\docker_engine`).
- **Resolution:** Initialized docker container `caresync-postgres` using unsandboxed execution mode as required for container network binding on Windows. Container became healthy immediately.
- **Startup Errors:** None. PostgreSQL, Spring Boot backend, and Vite frontend started with exit code 0 and zero unhandled exceptions.
