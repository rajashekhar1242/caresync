#!/usr/bin/env bash
# ==============================================================================
# CareSync HCMS - Automated Certificate Renewal Script (Cron / Systemd Timer)
# Reference: Phase 25.1 Production Hardening Specification
# ==============================================================================

set -euo pipefail

echo "=== [$(date)] Executing Automated Certbot Renewal Drill ==="

# Execute Certbot renewal against ACME webroot
docker run --rm \
  -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/certbot/www:/var/www/certbot" \
  certbot/certbot renew \
  --webroot -w /var/www/certbot \
  --quiet

# Reload Nginx safely to adopt renewed certificates without dropping existing connections
docker exec caresync-nginx-prod nginx -s reload

echo "=== [$(date)] Renewal check completed successfully ==="
