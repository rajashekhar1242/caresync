# CareSync Backend — Render Web Service Deployment Guide

## 1. Overview

This guide provides step-by-step operational instructions for deploying the **CareSync Hospital & Clinic Management System (HCMS)** backend modular monolith to [Render](https://render.com/) as a containerized Web Service.

The backend is built with:
- **Language / Runtime:** Java 25 (OpenJDK / Eclipse Temurin 25 Alpine)
- **Framework:** Spring Boot 4.1.2 with Virtual Threads (`spring.threads.virtual.enabled: true`)
- **Packaging:** Multi-stage Docker container (`backend/Dockerfile`)
- **Database:** Serverless PostgreSQL 16 on Neon
- **Protocol:** HTTP REST APIs and STOMP-over-WebSocket

---

## 2. Prerequisites

Before deploying the backend to Render, ensure you have:
1. A GitHub or GitLab account containing the CareSync repository.
2. A free or team account on [Render](https://dashboard.render.com/).
3. A provisioned PostgreSQL database on Neon (see `docs/NEON_DATABASE_SETUP.md` for connection string details).
4. Generated secrets for JWT encryption and administrative passwords.

---

## 3. Render Service Configuration

### 3.1 Create New Web Service
1. Log in to the [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** in the top-right corner and select **Web Service**.
3. Connect your Git repository (`caresync` or `javaproject`).
4. Select the branch you wish to deploy (e.g. `main`).

### 3.2 Service Settings
Fill in the service creation form with the following settings:

| Field | Configuration Value | Explanation |
| :--- | :--- | :--- |
| **Name** | `caresync-backend` (or custom name) | Will generate a public URL like `https://caresync-backend.onrender.com` |
| **Region** | Select region closest to Neon database (e.g. `Ohio (US East)` or `Frankfurt (EU Central)`) | Minimizes JDBC network latency |
| **Branch** | `main` | Automatic deployments trigger on commits to this branch |
| **Root Directory** | `backend` | Sets the build context to the backend maven directory |
| **Runtime** | **Docker** | Uses `backend/Dockerfile` for build and execution |
| **Dockerfile Path** | `Dockerfile` (relative to Root Directory) | Resolves to `backend/Dockerfile` |
| **Instance Type** | **Free** ($0/month) or **Starter** ($7/month) | Free tier has 512 MB RAM, spins down after 15m idle |

---

## 4. Environment Variables Configuration

In the Render Dashboard under your Web Service, navigate to the **Environment** tab and configure the following required environment variables:

| Environment Variable | Recommended Value / Format | Purpose |
| :--- | :--- | :--- |
| `SPRING_PROFILES_ACTIVE` | `prod` | Activates production logging, security headers, and pool config |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://<neon-host>:5432/caresync?sslmode=require` | Secure JDBC connection string to Neon PostgreSQL |
| `SPRING_DATASOURCE_USERNAME` | `<neon-db-user>` (e.g. `neondb_owner`) | Neon database username |
| `SPRING_DATASOURCE_PASSWORD` | `<neon-db-password>` | Neon database user password |
| `SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE` | `5` (Free) or `10` (Paid) | Constrains connection pool to prevent Neon compute sleep issues |
| `SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE` | `1` | Keeps minimum active connections low during idle periods |
| `CARESYNC_JWT_SECRET` | Generate a 32+ character Base64 secret | Cryptographic HMAC-SHA256 signature key for JWT tokens |
| `CARESYNC_CORS_ORIGINS` | `https://caresync.pages.dev,http://localhost:5173` | Comma-separated list of allowed frontend origins |
| `CARESYNC_ADMIN_EMAIL` | `admin@caresync.local` | Email of seeded System Administrator |
| `CARESYNC_ADMIN_PASSWORD` | `<secure-admin-password>` | Unlocks admin account on initial startup (min 8 chars) |
| `CARESYNC_RECEPTIONIST_EMAIL` | `reception@caresync.local` | Email of seeded Front Desk Receptionist |
| `CARESYNC_RECEPTIONIST_PASSWORD` | `<secure-receptionist-password>` | Unlocks receptionist account on initial startup |
| `CARESYNC_DEMO_DOCTOR_PASSWORD` | `<secure-demo-doctor-password>` | Unlocks seeded demonstration doctors (`dr.jenkins`, `dr.patel`) |
| `CARESYNC_DEMO_PATIENT_PASSWORD` | `<secure-demo-patient-password>` | Unlocks seeded demonstration patients (`john.doe`, `eleanor.vance`) |

> [!IMPORTANT]
> **Generating a Secure JWT Secret:**
> You can generate a compliant 256-bit secret in PowerShell or bash:
> ```powershell
> [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
> ```
> Or in bash:
> ```bash
> openssl rand -base64 32
> ```

---

## 5. Health Check & Health Probes

In the Render Web Service settings under **Advanced**:
- **Health Check Path:** `/actuator/health`

Render will query this endpoint during deployments and continuous monitoring.
- The endpoint is publicly open (no JWT required) as configured in `SecurityConfig.java`:
  ```java
  .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
  ```
- When the application boots, Flyway completes migrations, and the database connects, `/actuator/health` returns HTTP 200 with `{"status":"UP"}`.
- Render marks the build as **Live** once the health probe succeeds.

---

## 6. Port Binding & Container Architecture

### 6.1 Render Dynamic Port Mapping
Render dynamically provisions a listening port for each container instance and exposes it via the `PORT` environment variable (typically `10000`).

In CareSync:
- `application.yml` is configured with:
  ```yaml
  server:
    port: ${PORT:${SERVER_PORT:8080}}
  ```
- When running in Docker Compose locally where `PORT` is unset, it defaults to `8080`.
- When deployed on Render, Spring Boot reads `PORT=10000` and automatically binds Tomcat to `0.0.0.0:10000`.

### 6.2 Multi-Stage Dockerfile Execution
`backend/Dockerfile` executes a hardened two-stage build:
1. **Builder Stage (`eclipse-temurin:25-jdk-alpine`):**
   - Resolves Maven dependencies (`mvnw dependency:go-offline`).
   - Packages executable Uber-JAR (`mvnw clean package -DskipTests`).
2. **Runtime Stage (`eclipse-temurin:25-jre-alpine`):**
   - Creates an unprivileged system user (`caresync:caresync`, UID/GID 10001).
   - Enables G1 Garbage Collector with RAM percentage limits:
     ```
     JAVA_OPTS="-XX:+UseG1GC -XX:MaxRAMPercentage=75.0 -Djava.security.egd=file:/dev/./urandom"
     ```
   - Launches application: `ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]`.

---

## 7. Cold-Start Handling & Mitigation

### 7.1 Free-Tier Behavior
On Render's free tier, the service automatically sleeps after 15 minutes without incoming HTTP traffic.
When a new request arrives:
1. Render provisions and starts the container (~15–20s).
2. JVM boots and initializes Spring context (~10–15s).
3. Database connection pool establishes and Flyway checks migrations (~2–3s).
4. Total cold-start latency: **30 to 45 seconds**.

### 7.2 Built-in Mitigations
1. **Frontend Request Timeout:** Axios timeout in `api.js` is set to 60,000ms (`timeout: Number(import.meta.env.VITE_API_TIMEOUT) || 60000`), allowing the client to wait for cold-start completion without erroring out.
2. **Scheduled Ping (Optional):** If zero cold-start is desired for demonstration presentations, you can set up a free uptime monitor (e.g. [UptimeRobot](https://uptimerobot.com/) or Cron-job.org) to ping `https://<service-name>.onrender.com/actuator/health` every 14 minutes.

---

## 8. Verification & Diagnostic Commands

Once deployed on Render, verify service health:

### 8.1 Public Health Probe
```bash
curl -i https://<your-service-name>.onrender.com/actuator/health
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/vnd.spring-boot.actuator.v3+json

{"status":"UP"}
```

### 8.2 CORS Pre-flight Verification
```bash
curl -i -X OPTIONS https://<your-service-name>.onrender.com/api/auth/login \
  -H "Origin: https://caresync.pages.dev" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization,Content-Type"
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://caresync.pages.dev
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Max-Age: 3600
```

### 8.3 Reviewing Render Logs
Under the **Logs** tab in Render Dashboard:
- Look for `Flyway Community Edition ... by Redgate` and `Successfully applied 12 migrations to schema "public"`.
- Look for `c.c.a.s.StaffAccountBootstrapRunner - Bootstrapped System Administrator account (admin@caresync.local)`.
- Look for `Started CareSyncApplication in X.XXX seconds`.

---

## 9. Synthetic Demonstration Data Seeding (`deploy/demo-seed.sql`)

To populate the database with realistic clinical demonstration personas (Dr. Sarah Jenkins in Cardiology, Dr. Raj Patel in Pediatrics, Eleanor Vance with a Penicillin allergy, a completed cardiology visit with prescription and invoice, and today's active waiting queue), execute the idempotent seed script against Neon:

```bash
# Using standard psql with your Neon connection string:
psql "postgresql://<neon-host>:5432/caresync?sslmode=require" -f deploy/demo-seed.sql
```

The script uses fixed deterministic UUIDs and `ON CONFLICT DO NOTHING` guards, making it safe to re-run at any time. Seeded credentials use `!LOCKED_REQUIRES_BOOTSTRAP!` sentinel and are unlocked via environment variables:
- **Doctors:** `dr.jenkins@caresync.local` / `dr.patel@caresync.local` — set via `CARESYNC_DEMO_DOCTOR_PASSWORD`
- **Patients:** `john.doe@example.com` / `eleanor.vance@example.com` — set via `CARESYNC_DEMO_PATIENT_PASSWORD`

