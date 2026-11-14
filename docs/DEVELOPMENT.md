# CareSync HCMS — Local Development Guide

This guide walks through configuring, building, running, and debugging **CareSync** on a local development workstation.

---

## 1. Prerequisites

Ensure the following tools are installed and available on your system path:

| Tool | Minimum Version | Verification Command | Notes |
| :--- | :--- | :--- | :--- |
| **Java Development Kit (JDK)** | **Java 25** | `java -version` | Required for Virtual Threads and Spring Boot 4.1.2 |
| **Node.js** | **v20.x or v22.x** | `node -v` | LTS recommended for Vite 6 frontend development |
| **npm** | **v10.x** | `npm -v` | Node package manager |
| **Docker Desktop** | **v24+ / Compose v2** | `docker compose version` | Required for local PostgreSQL 16 container and Testcontainers |
| **Git** | **v2.40+** | `git --version` | Source control |

---

## 2. Environment Configuration

### 2.1 Backend Environment Setup
CareSync provides an annotated environment template at the repository root: [.env.example](../.env.example).

Copy the template to `.env`:
```powershell
Copy-Item .env.example .env
```

Review and adjust the environment variables:

| Variable | Description | Default / Local Development Value |
| :--- | :--- | :--- |
| `SPRING_PROFILES_ACTIVE` | Active Spring profile | `dev` |
| `SPRING_DATASOURCE_URL` | PostgreSQL JDBC connection URL | `jdbc:postgresql://localhost:5432/caresync` |
| `SPRING_DATASOURCE_USERNAME` | Database username | `caresync` |
| `SPRING_DATASOURCE_PASSWORD` | Database password | Set to your local container password (e.g. `caresync_dev_pass`) |
| `CARESYNC_JWT_SECRET` | 32+ character HS256 JWT signing secret | Any random 32+ character string for local development |
| `CARESYNC_CORS_ORIGINS` | Allowed origins for REST & STOMP | `http://localhost:3000,http://localhost:5173` |
| `CARESYNC_ADMIN_EMAIL` | Admin account email | `admin@caresync.local` |
| `CARESYNC_ADMIN_PASSWORD` | Admin bootstrap password | Set a password to unlock seeded admin account on start |
| `CARESYNC_RECEPTIONIST_EMAIL` | Receptionist account email | `reception@caresync.local` |
| `CARESYNC_RECEPTIONIST_PASSWORD` | Receptionist bootstrap password | Set a password to unlock seeded receptionist account on start |
| `CARESYNC_DEMO_DOCTOR_PASSWORD` | Optional demo doctor password | Set password to unlock demo doctors |
| `CARESYNC_DEMO_PATIENT_PASSWORD` | Optional demo patient password | Set password to unlock demo patients |

> **Note on Account Bootstrapping:** In accordance with healthcare security standards, seeded accounts in Flyway `V11` use the non-BCrypt sentinel hash `!LOCKED_REQUIRES_BOOTSTRAP!`. Supplying `CARESYNC_ADMIN_PASSWORD` and `CARESYNC_RECEPTIONIST_PASSWORD` will automatically initialize their BCrypt password hashes on first launch via `StaffAccountBootstrapRunner`.

### 2.2 Frontend Environment Setup
The frontend uses Vite environment variables located in [frontend/.env.example](../frontend/.env.example).

By default, the Vite dev server is pre-configured in `vite.config.js` to proxy `/api` requests to `http://localhost:8080`, so local development works out of the box without creating a `frontend/.env` file.

If custom configuration is needed:
```powershell
Copy-Item frontend\.env.example frontend\.env
```

---

## 3. Step-by-Step Local Startup

Open three PowerShell windows (or terminal split panes) at `Z:\javaproject`:

### Step 1: Start PostgreSQL 16
From the repository root (`Z:\javaproject`):
```powershell
docker compose up -d
```
Verify the container is healthy:
```powershell
docker compose ps
```
*Expected: `caresync-postgres` is `Up` and `healthy` on port `5432`.*

---

### Step 2: Start the Spring Boot Backend
Navigate to the `backend` folder and run via the included Maven Wrapper:
```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

*Expected Output:*
```text
... Tomcat started on port 8080 (http) with context path '/api'
... Started CareSyncApplication in 2.842 seconds (process running for 3.105)
```

Verify backend health:
```powershell
Invoke-RestMethod http://localhost:8080/actuator/health
```
*Returns: `{"status":"UP","components":{"db":{"status":"UP"},"diskSpace":{"status":"UP"},"ping":{"status":"UP"}}}`*

---

### Step 3: Start the React Frontend
Navigate to the `frontend` folder, install dependencies, and launch Vite:
```powershell
cd frontend
npm install
npm run dev
```

*Expected Output:*
```text
  VITE v6.0.7  ready in 280 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Open `http://localhost:5173/` in your browser. You will see the CareSync portal landing page with demo quick-fill buttons for instant testing.

---

## 4. Database Seeding & Reset

### 4.1 Automated Migrations
On startup, Flyway automatically runs all pending migrations (`V1` through `V12`) located in `backend/src/main/resources/db/migration/`.

### 4.2 Demo Data Seeding
To populate realistic synthetic data (doctors, schedules, patients, completed appointments, and invoices):
```powershell
docker exec -i caresync-postgres psql -U caresync -d caresync < deploy/demo-seed.sql
```

### 4.3 Clean Database Reset
If you want to start from a clean slate:
```powershell
docker compose down -v
docker compose up -d
```
Then restart the Spring Boot backend to re-run migrations from `V1`.

---

## 5. Troubleshooting Common Issues

### Port 8080 or 5432 Already In Use
- **Port 5432:** A local PostgreSQL instance may be running as a Windows service. Stop it via `Stop-Service postgresql*` or adjust `ports` in `docker-compose.yml`.
- **Port 8080:** Another application or zombie java process may be holding port 8080:
  ```powershell
  Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object OwningProcess
  Stop-Process -Id <PID> -Force
  ```

### Docker Daemon Not Running
- If `docker compose up -d` fails with `error during connect`, launch Docker Desktop and wait until the whale icon shows "Engine running".

### CORS Errors during Development
- Ensure `CARESYNC_CORS_ORIGINS` in your `.env` contains `http://localhost:5173`.
- Verify you are accessing the frontend via `http://localhost:5173` rather than `127.0.0.1:5173`.

### Rate Limit Exceeded (`HTTP 429 Too Many Requests`)
- In local development, the login rate limit is 10 requests/minute. Wait 60 seconds for the token bucket to refill.
