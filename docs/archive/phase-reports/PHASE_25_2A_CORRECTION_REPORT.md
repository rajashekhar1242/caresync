# Phase 25.2A: CareSync Deployment Configuration Corrections Report

**Project:** CareSync Hospital & Clinic Management System (HCMS)  
**Execution Date:** 2026-11-14  
**Operating Environment:** Windows / Java 25 / Spring Boot 4.1.2 / PostgreSQL 16 / React 18 / Vite 6 / Nginx 1.27  
**Final Quality Gate Status:** **`PASS — All four corrections implemented and validated`**

---

## 1. Executive Summary

Phase 25.2A resolved the four configuration, documentation, and operational inconsistencies identified during the Phase 25.2 deployment-readiness audit. All corrections were executed in strict conformance with project rules: zero backend or frontend application code was modified, database schema and data remained completely untouched, and all changes were validated using lightweight offline validation tools.

---

## 2. Four Audit Findings & Exact Remediations

### Finding 1: HSTS Documentation Inconsistency
- **Original Inconsistency:**
  - `deploy/nginx/snippets/security-headers.conf` line 6 and `docs/PHASE_25_1_NGINX_TLS_VALIDATION_REPORT.md` enforced an initial conservative policy of `max-age=15724800; includeSubDomains` (6 months without `preload`).
  - However, `docs/PRODUCTION_READINESS_CHECKLIST.md` line 142 retained an outdated entry claiming `max-age=31536000; includeSubDomains; preload` (1 year with preload).
- **Remediation Implemented:**
  - Updated `docs/PRODUCTION_READINESS_CHECKLIST.md` line 142 to match the active authoritative Nginx configuration: `max-age=15724800; includeSubDomains`.
  - Removed all premature `preload` claims.
  - Documented explicit future conditions for HSTS preload eligibility: `preload` submission will only occur after a minimum of 6 months of continuous, verified HTTPS operation across all subdomains with zero HTTP fallbacks.

### Finding 2: Compression Documentation Inconsistency (Gzip vs. Brotli)
- **Original Inconsistency:**
  - `docs/PRODUCTION_READINESS_CHECKLIST.md` line 49 claimed "Gzip & Brotli Compression: Enabled for .js, .css, .json, .svg".
  - Inspection of `deploy/nginx/caresync.conf` confirmed that only `gzip` is configured (`gzip on; gzip_comp_level 6;`). Furthermore, the standard official `nginx:1.27-alpine` Docker image does not package Google's third-party `ngx_brotli` module.
- **Remediation Implemented:**
  - Corrected `docs/PRODUCTION_READINESS_CHECKLIST.md` line 49 to document active Gzip compression only (`text/plain`, `text/css`, `text/xml`, `application/json`, `application/javascript`, `application/rss+xml`, `application/atom+xml`, `image/svg+xml`).
  - Explicitly documented that Brotli is deferred as standard Alpine Nginx does not bundle `ngx_brotli`, avoiding unnecessary custom container compilation or image bloat.

### Finding 3: Invalid Docker Rollback Command
- **Original Inconsistency:**
  - `docs/PRODUCTION_READINESS_CHECKLIST.md` line 165 instructed operators to run `docker compose -f docker-compose.prod.yml rollback`, which is an invalid command in Docker Compose CLI (Docker Compose has never implemented a `rollback` subcommand).
- **Remediation Implemented:**
  - Added support for parameterized image tagging to the `backend` service in `docker-compose.prod.yml`:
    ```yaml
    backend:
      build:
        context: ./backend
        dockerfile: Dockerfile
      image: ${CARESYNC_BACKEND_IMAGE:-caresync-backend:latest}
      container_name: caresync-backend-prod
    ```
  - Rewrote Section 6 of `docs/PRODUCTION_READINESS_CHECKLIST.md` to document a complete, technically valid rollback runbook:
    1. **Backend Rollback:** Run `CARESYNC_BACKEND_IMAGE=caresync-backend:v1.0.0 docker compose -f docker-compose.prod.yml up -d --no-build backend` using previously built and tagged images.
    2. **Frontend Rollback:** Archive previous `./frontend/dist` directories; revert via `rm -rf ./frontend/dist && cp -r ./frontend/dist-v1.0.0 ./frontend/dist` followed by `docker exec caresync-nginx-prod nginx -s reload`. User browsers immediately adopt the change due to `Cache-Control: no-cache, no-store, must-revalidate` on `index.html`.
    3. **Version Compatibility & Expand/Contract Rules:** Coordinated rollbacks must respect same-origin API contracts. Flyway migrations (`V1`–`V12`) are forward-only and append-only (no destructive schema changes in application release steps).
    4. **Point-In-Time Database Disaster Recovery:** Documented `pg_dump -Fc` pre-upgrade backup creation and `pg_restore --clean` procedures.

### Finding 4: TLS Certificate & Webroot Volume Mismatch
- **Original Inconsistency:**
  - Maintenance scripts `deploy/scripts/init-letsencrypt.sh` and `deploy/scripts/renew-certificates.sh` write certs to `./certbot/conf` and challenges to `./certbot/www`.
  - However, `docker-compose.prod.yml` mounted host root path `/etc/letsencrypt` and a Docker named volume `certbot_webroot`, preventing Nginx from accessing certificates and challenge files written by Certbot.
- **Remediation Implemented:**
  - Updated `docker-compose.prod.yml` to bind-mount the exact relative paths used by the scripts:
    ```yaml
    volumes:
      - ./deploy/nginx/caresync.conf:/etc/nginx/conf.d/default.conf:ro
      - ./deploy/nginx/snippets:/etc/nginx/snippets:ro
      - ./frontend/dist:/usr/share/nginx/html:ro
      - ./certbot/www:/var/www/certbot:ro
      - ./certbot/conf:/etc/letsencrypt:ro
    ```
  - Removed the unused named volume `certbot_webroot` from `volumes:` in `docker-compose.prod.yml`.
  - Verified that:
    1. Nginx reads `fullchain.pem`, `privkey.pem`, and `chain.pem` directly from `/etc/letsencrypt/live/hospital.caresync.health/` mapped to `./certbot/conf/live/hospital.caresync.health/`.
    2. Nginx serves `location /.well-known/acme-challenge/` directly from `/var/www/certbot` mapped to `./certbot/www`.
    3. The renewal reload command `docker exec caresync-nginx-prod nginx -s reload` accurately targets `container_name: caresync-nginx-prod`.

---

## 3. Changed Files Inventory

| File Path | Nature of Change | Purpose & Technical Explanation |
| :--- | :---: | :--- |
| `docker-compose.prod.yml` | Modified | Added `${CARESYNC_BACKEND_IMAGE}` parameterization; aligned Nginx volumes to `./certbot/conf:/etc/letsencrypt:ro` and `./certbot/www:/var/www/certbot:ro`; removed unused `certbot_webroot` named volume. |
| `docs/PRODUCTION_READINESS_CHECKLIST.md` | Modified | Corrected HSTS to 6 months without preload; corrected compression to Gzip only; rewrote Section 6 rollback runbook covering tag-based backend rollback, frontend dist rollback, forward-only DB migration constraints, and PITR restoration. |
| `docs/PROGRESS.md` | Modified | Logged Phase 25.2A completion and validation results. |
| `docs/PHASE_25_2A_CORRECTION_REPORT.md` | Created | Comprehensive record of audit findings, exact remediations, and validation evidence. |

---

## 4. Lightweight Validation Commands & Results

| Validation Step | Command Line | Exit Code | Result |
| :--- | :--- | :---: | :---: |
| **Docker Compose Config Syntax** | `docker compose -f docker-compose.prod.yml config` | **0** | **PASS** — Config rendered with `caresync-backend:latest` default and correct `./certbot/*` bind mounts. |
| **Shell Script Syntax (Bootstrap)** | `bash -n deploy/scripts/init-letsencrypt.sh` | **0** | **PASS** — Syntax valid. |
| **Shell Script Syntax (Renewal)** | `bash -n deploy/scripts/renew-certificates.sh` | **0** | **PASS** — Syntax valid. |
| **Nginx Configuration Syntax** | `docker run --rm ... nginx:alpine nginx -t` | **0** | **PASS** — Configuration syntax is ok, test is successful. |
| **Git Diff Inspection** | `git status` | **0** | **PASS** — Zero application code or database modifications; changes strictly limited to deployment config and docs. |

---

## 5. Remaining Deployment Blockers (External Infrastructure)

The following items cannot be resolved locally and remain prerequisites for live WAN hosting:
1. **Public Domain DNS:** Allocation of public DNS `A` or `CNAME` records pointing `hospital.caresync.health` to the target server's public IP address.
2. **Firewall & Security Groups:** Inbound WAN access permitted on port 80 (HTTP / ACME challenge) and port 443 (HTTPS).
3. **Genuine Let's Encrypt Certificate:** Execution of `deploy/scripts/init-letsencrypt.sh` on the live internet-facing host to obtain production CA-signed certificates from the ACME server.
4. **Secrets Vault Management:** Provisioning of production `SPRING_DATASOURCE_PASSWORD`, `CARESYNC_JWT_SECRET`, `CARESYNC_ADMIN_PASSWORD`, and `CARESYNC_RECEPTIONIST_PASSWORD` in a cloud secret manager (e.g. AWS Secrets Manager, HashiCorp Vault).

---

## 6. Final Verification Sign-Off

```
================================================================================
  CARESYNC HCMS — PHASE 25.2A CORRECTION AUDIT VERDICT
================================================================================
  1. HSTS Policy Alignment:                             CORRECTED & CONSISTENT
  2. Gzip Compression Documentation:                   CORRECTED & ACCURATE
  3. Docker Rollback Runbook:                           CORRECTED (Tag-Based)
  4. TLS Certificate Volume Alignment:                 CORRECTED & VERIFIED
  5. Lightweight Syntax Validation:                     ALL PASSED (Exit Code 0)
  6. Application & Database Integrity:                 100% UNTOUCHED
--------------------------------------------------------------------------------
  FINAL VERDICT: PASS — All four corrections implemented and validated.
================================================================================
```
