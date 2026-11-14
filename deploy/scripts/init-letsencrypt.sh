#!/usr/bin/env bash
# ==============================================================================
# CareSync HCMS - Production Let's Encrypt TLS Certificate Initialization Script
# Bootstraps initial TLS certificates for hospital.caresync.health using Certbot
# Reference: Phase 25.1 Production Hardening Specification
# ==============================================================================

set -euo pipefail

DOMAIN="hospital.caresync.health"
EMAIL="${1:-admin@caresync.health}"
DATA_PATH="./certbot"
WEBROOT_PATH="./certbot/www"

echo "=== CareSync TLS Bootstrap for ${DOMAIN} ==="

if [ -d "${DATA_PATH}/conf/live/${DOMAIN}" ]; then
  echo "Certificate directory already exists for ${DOMAIN}."
  read -p "Existing data found. Replace existing certificate? (y/N) " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    exit 0
  fi
fi

# Step 1: Create directories
mkdir -p "${DATA_PATH}/conf/live/${DOMAIN}"
mkdir -p "${WEBROOT_PATH}"

# Step 2: Create temporary dummy self-signed certificate so Nginx starts safely
echo "-> Creating temporary bootstrap dummy certificate..."
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout "${DATA_PATH}/conf/live/${DOMAIN}/privkey.pem" \
  -out "${DATA_PATH}/conf/live/${DOMAIN}/fullchain.pem" \
  -subj "/CN=localhost"
cp "${DATA_PATH}/conf/live/${DOMAIN}/fullchain.pem" "${DATA_PATH}/conf/live/${DOMAIN}/chain.pem"

# Step 3: Start Nginx reverse proxy
echo "-> Starting Nginx reverse proxy service..."
docker compose -f docker-compose.prod.yml up -d reverse-proxy

# Step 4: Delete dummy certificate before requesting real certificate
echo "-> Removing temporary dummy certificate..."
rm -rf "${DATA_PATH}/conf/live/${DOMAIN}"

# Step 5: Request genuine Let's Encrypt certificate via ACME webroot challenge
echo "-> Requesting genuine Let's Encrypt certificate from ACME server..."
docker run --rm \
  -v "$(pwd)/${DATA_PATH}/conf:/etc/letsencrypt" \
  -v "$(pwd)/${WEBROOT_PATH}:/var/www/certbot" \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  --email "${EMAIL}" \
  -d "${DOMAIN}" \
  --rsa-key-size 4096 \
  --agree-tos \
  --force-renewal \
  --non-interactive

# Step 6: Reload Nginx with new certificate
echo "-> Reloading Nginx with authentic TLS certificate..."
docker exec caresync-nginx-prod nginx -s reload

echo "=== TLS Bootstrap Complete: https://${DOMAIN} is live ==="
