# CareSync HCMS — Deployment & Operations Guide

This guide details the deployment options, configuration contracts, infrastructure runbooks, and current deployment status for **CareSync HCMS**.

---

## 1. Deployment Architecture Options

CareSync is designed to support two distinct production-grade deployment strategies:

```text
Option 1: Modern Cloud Portfolio Topology (Zero-Cost, High Availability)
┌─────────────────────────┐         ┌─────────────────────────┐         ┌─────────────────────────┐
│     Cloudflare Pages    │  HTTPS  │    Render Web Service   │   SSL   │      Neon Database      │
│  React 18 / Vite 6 SPA  │────────▶│ Spring Boot (Docker/J25)│────────▶│      PostgreSQL 16      │
│  Global Edge CDN / SSL  │   WSS   │   Modular Monolith API  │         │   Serverless Postgres   │
└─────────────────────────┘         └─────────────────────────┘         └─────────────────────────┘

Option 2: On-Premises / Virtual Machine Topology (Docker Compose)
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Host Machine / Linux VM (Ubuntu 24.04 LTS / Debian 12)                                          │
│                                                                                                 │
│  ┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐     │
│  │   Nginx Reverse Proxy  │ 8080 │   Spring Boot Backend  │ 5432 │   PostgreSQL 16 Alpine │     │
│  │   TLS & Rate Limiting  │─────▶│   Multi-stage Docker   │─────▶│   Persistent Volume    │     │
│  │   Let's Encrypt Certbot│      │   Virtual Threads (J25)│      │   Automated Backups    │     │
│  └────────────────────────┘      └────────────────────────┘      └────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Status of Deployment Preparation

To ensure operational transparency for technical reviewers:

| Component | Local Configuration Status | Cloud Provisioning Status | Verified Evidence |
| :--- | :--- | :--- | :--- |
| **Backend Docker Image** | **VERIFIED** | Ready to Deploy | Multi-stage Dockerfile builds cleanly on OpenJDK 25 |
| **Frontend Static Bundle** | **VERIFIED** | Ready to Deploy | Vite 6 build produces optimized production bundle |
| **Cloudflare Routing & Headers**| **VERIFIED** | Ready to Link | `_headers` and `_redirects` in `frontend/public/` |
| **Database Migrations** | **VERIFIED** | Ready to Apply | Flyway migrations V1–V12 verified on PostgreSQL 16 |
| **Synthetic Demo Dataset** | **VERIFIED** | Ready to Seed | `deploy/demo-seed.sql` verified with locked sentinels |
| **Nginx Reverse Proxy & TLS** | **VERIFIED** | Ready for Domain | `deploy/nginx/caresync.conf` verified with ACME webroot |
| **Public Production URL** | Prepared | **Not Live Yet** | Public DNS not yet pointed (local verification only) |

---

## 3. Option 1: Cloud Deployment Runbook (Cloudflare + Render + Neon)

### 3.1 Step 1: Provision Neon Serverless PostgreSQL
1. Create a project named `caresync-prod` on [Neon](https://neon.tech) in your nearest region.
2. Select PostgreSQL version `16`.
3. Copy the pooled connection string (with `sslmode=require`).
4. Note the host, database name, username, and password for Render configuration.

### 3.2 Step 2: Deploy Backend to Render
1. Create a new **Web Service** on [Render](https://render.com).
2. Connect your repository and configure:
   - **Environment:** Docker
   - **Dockerfile Path:** `./backend/Dockerfile`
   - **Docker Context:** `./backend`
   - **Instance Type:** Starter (or Free tier)
3. Configure Environment Variables in the Render dashboard:
   - `SPRING_PROFILES_ACTIVE`: `prod`
   - `SPRING_DATASOURCE_URL`: `jdbc:postgresql://<neon-host>:5432/<neon-db>?sslmode=require`
   - `SPRING_DATASOURCE_USERNAME`: `<neon-user>`
   - `SPRING_DATASOURCE_PASSWORD`: `<neon-password>`
   - `CARESYNC_JWT_SECRET`: Minimum 32-character random string (e.g. `openssl rand -base64 32`)
   - `CARESYNC_CORS_ORIGINS`: `https://caresync.pages.dev` (your Cloudflare Pages domain)
   - `CARESYNC_ADMIN_PASSWORD`: Your chosen admin bootstrap password
   - `CARESYNC_RECEPTIONIST_PASSWORD`: Your chosen receptionist bootstrap password
   - `PORT`: `8080`
4. Deploy the service. Flyway will automatically execute migrations `V1` through `V12` on the Neon database.

### 3.3 Step 3: Deploy Frontend to Cloudflare Pages
1. In the [Cloudflare Dashboard](https://dash.cloudflare.com), navigate to **Compute (Workers) > Pages**.
2. Connect your GitHub repository:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Build Output Directory:** `dist`
3. Configure Environment Variables:
   - `VITE_API_BASE_URL`: `https://<render-backend-url>/api`
   - `VITE_WS_URL`: `wss://<render-backend-url>/ws`
4. Deploy site. Cloudflare Pages automatically applies:
   - Security headers from `frontend/public/_headers` (HSTS, CSP, X-Content-Type-Options).
   - SPA route redirection from `frontend/public/_redirects` (`/* /index.html 200`).

---

## 4. Option 2: Self-Hosted On-Premises Runbook (Docker Compose)

For dedicated servers or Linux virtual machines:

### 4.1 Prerequisites
- Docker Engine 24+ and Docker Compose v2.
- Public domain pointing to host IP (e.g. `hospital.caresync.health`).
- Ports 80 and 443 open in firewall.

### 4.2 Deployment Steps
1. Clone the repository and configure `.env`:
   ```bash
   cp .env.example .env
   # Set production values for passwords, JWT secret, and domain
   ```
2. Initialize TLS certificates using Certbot:
   ```bash
   chmod +x deploy/scripts/init-letsencrypt.sh
   ./deploy/scripts/init-letsencrypt.sh admin@caresync.health
   ```
3. Start the production stack:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```
4. Verify all containers are healthy:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```

### 4.3 Automated Certificate Renewal
Set up a daily cron job to run the renewal drill:
```bash
0 3 * * * /path/to/caresync/deploy/scripts/renew-certificates.sh >> /var/log/caresync-cert-renewal.log 2>&1
```

---

## 5. Production Health Monitoring & Actuator

The backend exposes Spring Boot Actuator health endpoints:
- `GET /actuator/health` — Returns application status (`UP` / `DOWN`).
- `GET /actuator/health/liveness` — Kubernetes / container liveness probe.
- `GET /actuator/health/readiness` — Container readiness probe (verifies database connectivity).

In production (`application-prod.yml`), health details are exposed with authorization safeguards (`show-details: when-authorized`) to prevent information leakage.
