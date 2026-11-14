# CareSync Frontend — Cloudflare Pages Deployment Guide

## 1. Overview

This guide details the deployment of the **CareSync Hospital & Clinic Management System (HCMS)** frontend Single-Page Application (SPA) to [Cloudflare Pages](https://pages.cloudflare.com/).

Cloudflare Pages delivers the React 18 + Vite frontend across Cloudflare's global Anycast edge network with zero server maintenance, automated SSL/TLS termination, HTTP/3 support, instant cache invalidation, and branch preview deployments.

---

## 2. Prerequisites

Before connecting Cloudflare Pages, verify you have:
1. Pushed the CareSync project repository to GitHub or GitLab.
2. A free [Cloudflare](https://dash.cloudflare.com/) account.
3. The public URL of your deployed Render backend (e.g. `https://caresync-api.onrender.com`).

---

## 3. Cloudflare Pages Project Configuration

### 3.1 Create New Project via Git
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left navigation, select **Compute (Workers & Pages)** $\rightarrow$ **Create Application** $\rightarrow$ **Pages** $\rightarrow$ **Connect to Git**.
3. Select your Git account and choose the repository (`caresync` or `javaproject`).
4. Click **Begin setup**.

### 3.2 Build Settings Configuration
Enter the exact build parameters below:

| Configuration Field | Value | Notes |
| :--- | :--- | :--- |
| **Project Name** | `caresync` | Generates canonical domain `https://caresync.pages.dev` |
| **Production Branch** | `main` | Automatic deploys trigger on pushes to this branch |
| **Framework Preset** | **Vite** | Automatically selects standard Vite defaults |
| **Root Directory** | `frontend` | Critical: tells Cloudflare to build inside `frontend/` |
| **Build Command** | `npm run build` | Compiles JS/JSX bundle and Tailwind CSS to `dist/` |
| **Build Output Directory** | `dist` | Cloudflare serves assets from `frontend/dist/` |

---

## 4. Environment Variables Configuration

In the Cloudflare Pages project setup (under **Environment variables (advanced)**) or under **Settings $\rightarrow$ Environment variables**, configure the production environment variables:

| Variable Name | Production Value | Purpose |
| :--- | :--- | :--- |
| `NODE_VERSION` | `20` | Ensures the build environment uses Node 20 LTS |
| `VITE_API_BASE_URL` | `https://<your-render-backend>.onrender.com/api` | Full cross-origin URL to Render REST API |
| `VITE_WS_URL` | `wss://<your-render-backend>.onrender.com/ws` | Secure STOMP WebSocket endpoint on Render |
| `VITE_API_TIMEOUT` | `60000` | 60-second request timeout to tolerate Render cold start |
| `VITE_APP_NAME` | `CareSync Hospital & Clinic Management` | Application branding text |

Click **Save and Deploy**. Cloudflare Pages will clone the repo, install npm dependencies, compile the production bundle, and deploy to the edge.

---

## 5. Client-Side SPA Routing & Security Headers

CareSync utilizes React Router 7 with HTML5 pushState routing (`/doctor/queue`, `/patient/dashboard`, `/receptionist/check-in`). When a browser directly visits or refreshes an internal route, static CDNs will return a 404 unless instructed to serve `index.html`.

CareSync includes two dedicated configuration files inside `frontend/public/` that are automatically copied into the root of `frontend/dist/` during build:

### 5.1 `frontend/public/_redirects` (SPA Route Rewrite)
```
/*  /index.html  200
```
- Instructs Cloudflare Pages to rewrite any unmatched incoming path to `/index.html` with an HTTP status `200 OK`.
- React Router then takes over in the browser and mounts the correct route component (`DoctorQueuePage`, `PatientDashboard`, etc.).

### 5.2 `frontend/public/_headers` (Defensive Edge Headers)
```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```
- Injects defensive HTTP security headers at the Cloudflare edge for all delivered HTML and assets, eliminating MIME-sniffing, clickjacking, and unauthorized browser feature access.

---

## 6. Dynamic Backend & WebSocket Derivation

In `frontend/src/hooks/use-queue-websocket.js`, the WebSocket connection logic is designed to be fully adaptive:

```javascript
// Targets the native /ws endpoint directly without appending /websocket
export function resolveWebSocketUrl(env = import.meta.env, loc = typeof window !== 'undefined' ? window.location : null) {
  const configuredWs = env?.VITE_WS_URL || env?.VITE_WS_BASE_URL;
  if (configuredWs) {
    let normalized = configuredWs.trim().replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
    normalized = normalized.replace(/\/+$/, '');
    if (normalized.endsWith('/websocket')) {
      normalized = normalized.replace(/\/websocket$/, '');
    }
    if (!normalized.endsWith('/ws')) {
      normalized = `${normalized}/ws`;
    }
    return normalized;
  }

  // Derive from VITE_API_BASE_URL (e.g. https://domain.com/api -> wss://domain.com/ws)
  if (env?.VITE_API_BASE_URL && /^https?:\/\//i.test(env.VITE_API_BASE_URL)) {
    const apiOrigin = new URL(env.VITE_API_BASE_URL);
    const wsProto = apiOrigin.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${apiOrigin.host}/ws`;
  }

  // Local development / same-origin fallback
  if (loc) {
    const isSecure = loc.protocol === 'https:';
    const protocol = isSecure ? 'wss:' : 'ws:';
    const isDev = loc.port === '5173';
    const hostPart = isDev ? `${loc.hostname}:8080` : loc.host;
    return `${protocol}//${hostPart}/ws`;
  }

  return 'ws://localhost:8080/ws';
}
```

### Why this architecture is robust:
1. **Zero Hardcoded URLs:** The build cleanly adapts whether running in local Vite development, single-host Docker Compose / Nginx, or distributed Cloudflare Pages.
2. **Auto-Derivation:** If `VITE_WS_URL` is omitted, the frontend automatically derives `wss://<render-backend>/ws` directly from `VITE_API_BASE_URL`.
3. **Protocol Normalization:** If a developer enters `https://.../ws` or trailing slashes, it is safely normalized to `wss://.../ws`.
4. **Native WebSocket Direct Connect:** Connects directly to Spring Boot's registered `/ws` native endpoint using the browser's built-in `WebSocket` API without requiring SockJS client libraries.

---

## 7. Edge Performance & Asset Caching

1. **Vite Content Hashing:**
   All JavaScript and CSS bundles generated by `vite build` include cryptographic content hashes in their filenames (e.g. `index-BpHD_P7c.js`, `index-N6uwTglK.css`).
2. **Immutable Caching:**
   Cloudflare Pages automatically serves hashed assets in `/assets/*` with long-term immutable caching headers (`Cache-Control: public, max-age=31536000, immutable`), ensuring instantaneous subsequent page loads.
3. **Fast HTML Edge Revalidation:**
   `index.html` is cached at the edge with immediate revalidation, guaranteeing that new deployments are immediately visible to users without browser cache issues.

---

## 8. Verification & Deployment Testing

Once Cloudflare Pages finishes the initial deployment:

### 8.1 Direct Route Navigation Test
1. Open an incognito browser window.
2. Visit `https://caresync.pages.dev/login`.
3. Refresh the page (press `F5` / `Ctrl+R`).
4. **Verification:** The page should reload directly into the login screen without returning a 404 error.

### 8.2 Inspect Headers via curl
```bash
curl -I https://caresync.pages.dev/
```
**Expected Output:**
```http
HTTP/2 200
content-type: text/html; charset=utf-8
x-content-type-options: nosniff
x-frame-options: DENY
referrer-policy: strict-origin-when-cross-origin
cf-cache-status: DYNAMIC
```

### 8.3 Cross-Origin API Connectivity
1. Open the browser Developer Tools (`F12`) $\rightarrow$ **Console** / **Network** tab.
2. On `https://caresync.pages.dev/login`, attempt to log in.
3. **Verification:** Check the `POST .../api/auth/login` request. Verify that the CORS pre-flight `OPTIONS` returns HTTP 200 and the subsequent `POST` returns HTTP 200 with access and refresh tokens.
