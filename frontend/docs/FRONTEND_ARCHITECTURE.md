# CareSync Frontend Architecture & Design Specification

**Project:** Hospital & Clinic Management System (HCMS / CareSync)  
**Technology:** React 18 + Vite 6 + Tailwind CSS + JavaScript (ES6+)  
**Backend:** Spring Boot 4.1.2 Modular Monolith (PostgreSQL 16)  

---

## 1. Architecture Overview

The CareSync frontend is designed as a modular, component-driven single-page application (SPA). It uses modern ECMAScript 2022+ standards, JSDoc type annotations for editor intelligence, and Zod schemas for runtime schema verification.

```
┌─────────────────────────────────────────────────────────────┐
│                       React Router 7                        │
│   /login   /register   /admin/*   /doctor/*   /patient/*    │
└──────────────┬───────────────────────────────┬──────────────┘
               ▼                               ▼
┌──────────────────────────────┐ ┌────────────────────────────┐
│      Auth Context Provider    │ │   TanStack Query Provider  │
│  (Session, RBAC, User State) │ │   (API Cache, Stale-Time)  │
└──────────────┬───────────────┘ └─────────────┬──────────────┘
               ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Central Axios HTTP Client                   │
│   - Bearer Token Injection Interceptor                      │
│   - Single-Flight Refresh Token Mutex Queue (Concurrency)   │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│           Spring Boot Backend API (/api/*)                  │
│       PostgreSQL 16 · Flyway Migrations V1-V12               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Authentication & Concurrency Guarantees

### Token Lifecycle & Storage Model
1. **User Login (`POST /api/auth/login`)**: Returns an `AuthResponse` containing `accessToken` (15-min JWT), `refreshToken` (7-day token), `tokenType: "Bearer"`, `expiresIn: 900`, and `user` profile (`id`, `email`, `fullName`, `role`, `patientId`, `doctorId`).
2. **In-Memory Access Token**: `tokenService` maintains `inMemoryAccessToken` exclusively in JavaScript runtime closure. It is **never** written to `localStorage` or `sessionStorage`, mitigating persistent cross-site scripting (XSS) token exfiltration.
3. **Session-Scoped Refresh Token**: `refreshToken` is persisted in `sessionStorage` (`cs_refresh_token`). It persists through tab reloads during active navigation, but is immediately discarded when the user closes the browser tab, preventing ambient session hijacking on shared workstations.
4. **Outgoing Authorization**: The central Axios request interceptor injects `Authorization: Bearer <accessToken>` onto every outgoing backend request.
5. **Startup Session Restoration (`authService.restoreSession`)**:
   - On page load / initial render, `AuthProvider` checks `sessionStorage.getItem('cs_refresh_token')`.
   - If present, it executes `POST /api/auth/refresh` to mint a fresh access token, followed by `GET /api/auth/me` to hydrate the user profile.
   - If invalid or expired, local session artifacts are scrubbed, and the user enters the unauthenticated state without disruption.
6. **Query Cache Isolation on Logout**:
   - Both intentional user logout and automated session expiry (`auth:unauthorized`) call `queryClient.clear()` immediately. This completely flushes all in-memory React Query caches, preventing patient and clinical data from bleeding into subsequent user sessions on shared clinical workstations.

### The Refresh Concurrency Dilemma & Mutex Solution
The CareSync backend implements strict token family rotation (`AuthService.java` lines 179-208):
- Each refresh token can only be used once.
- Using an already-rotated or revoked token triggers **token family revocation** (`refreshTokenRevocationService.revokeAllActiveTokensForUser(userId)`), immediately revoking all active sessions for that user.
- When a dashboard page renders 3-10 widgets concurrently that all fail with HTTP 401 when the access token expires, uncoordinated requests would each attempt to call `POST /api/auth/refresh` using the identical refresh token.
- Without coordination: The 1st refresh request succeeds and rotates the token; requests 2 through 10 arrive with the stale token, tripping replay detection and abruptly killing the user's entire session!

**Frontend Mutex Architecture (`src/services/api.js`):**
To guarantee zero-replay safety, `apiClient` manages refresh concurrency through an in-flight Promise mutex:

```javascript
let refreshPromise = null;
let hasDispatchedUnauthorized = false;

export const executeTokenRefresh = async () => {
  if (refreshPromise) {
    return refreshPromise;
  }

  const currentRefreshToken = tokenService.getRefreshToken();
  if (!currentRefreshToken) {
    throw new Error('No refresh token available');
  }

  refreshPromise = (async () => {
    try {
      // Use clean axios instance to bypass interceptor loops
      const response = await axios.post(
        `${API_BASE_URL}/api/auth/refresh`,
        { refreshToken: currentRefreshToken },
        { headers: { 'Content-Type': 'application/json' } }
      );
      const { accessToken, refreshToken: newRefreshToken } = response.data;
      tokenService.setTokens(accessToken, newRefreshToken);
      return accessToken;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};
```

When HTTP 401 occurs in Axios response interceptor:
1. **Exclude Auth Endpoints**: Requests to `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, and `/api/auth/logout` are never retried to prevent infinite loops.
2. **Single-Flight Coordination**: The first 401 initiates `executeTokenRefresh()`. All other concurrent 401 requests hook into the identical `refreshPromise`.
3. **Queue Replay**: Once the single refresh resolves, all waiting requests have their `Authorization: Bearer <newToken>` header updated and are replayed exactly once (`originalRequest._retry = true`).
4. **Debounced Event Dispatch**: If refresh fails (e.g. refresh token expired or revoked), tokens are wiped, all queued requests reject, and a debounced `auth:unauthorized` event is fired once, triggering a single graceful redirect to `/login`.

---

## 3. Role-Based Access Control (RBAC)

The application enforces four roles matching backend domain entities:

| Role | Permitted Areas | Default Landing | Description |
|---|---|---|---|
| `ADMIN` | `/admin/*` | `/admin/dashboard` | System configuration, staff management, audit trails, and financial reports |
| `RECEPTIONIST` | `/receptionist/*` | `/receptionist/dashboard` | Patient registration, appointment scheduling, queue management, and cashier billing |
| `DOCTOR` | `/doctor/*` | `/doctor/dashboard` | Clinical console, waiting room queue, diagnosis, and prescription authoring |
| `PATIENT` | `/patient/*` | `/patient/dashboard` | Self-service booking, consultation history, and invoice records |

### Route Protection Strategy
- `ProtectedRoute`: Verifies `isAuthenticated`. If false, saves current route in navigation state and redirects to `/login`. If current user's role is not in `allowedRoles`, navigates immediately to `/unauthorized`.
- `PublicOnlyRoute`: Prevents authenticated users from seeing `/login` or `/register`, immediately forwarding them to their authorized role dashboard.

---

## 4. UI Design System

- **Color Palette:** Healthcare SaaS standard: Clinical Sky Blue (`#0284c7`), Forest Health Teal (`#0f766e`), Slate Navy (`#0f172a`), Clean Surface (`#f8fafc`).
- **Component Primitives:** Built on headless Radix UI components (Dialog, DropdownMenu, Select, Tabs, Tooltip, Slot) styled with Tailwind CSS and `class-variance-authority`.
- **Responsive Layout:** Fixed desktop sidebar with collapsible mobile drawer, dynamic breadcrumb tracking, and sticky header.
- **Form Architecture:** Built on `react-hook-form` with `zod` schemas (`zodResolver`). Error states display inline with `aria-invalid` attributes.
