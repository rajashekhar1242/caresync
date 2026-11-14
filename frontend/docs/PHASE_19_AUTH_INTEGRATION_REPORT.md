# Phase 19: Real Backend Authentication Integration Report

**Project:** Hospital & Clinic Management System (HCMS / CareSync)  
**Frontend Architecture:** React 18 + Vite 6 + JavaScript (ES6+) + Tailwind CSS + React Router 7 + TanStack Query 5  
**Backend:** Spring Boot 4.1.2 Modular Monolith (PostgreSQL 16, Java 25)  
**Date:** 2026-11-13  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

Phase 19 integrates the CareSync React frontend directly with the production Spring Boot authentication subsystem. The backend enforces high-security token family rotation, replay detection, and rate limiting. Prior to Phase 19, the frontend relied on mock credentials, unsynchronized DTO structures, and uncoordinated token refresh handling that would trigger instant session revocation under normal multi-component page loads.

In this phase, we completed a zero-backend-modification integration that establishes:
- **Strict In-Memory Access Token Storage**: Access tokens are held exclusively in JavaScript memory closures, neutralizing persistent XSS exfiltration vectors.
- **Session-Scoped Refresh Tokens**: Refresh tokens reside in `sessionStorage` to persist across active tab reloads while automatically evaporating when the browser tab is closed.
- **Single-Flight Refresh Mutex**: An in-flight promise coordinator ensures that when multiple concurrent requests receive HTTP 401, exactly **one** refresh request is sent to the backend. Waiting requests are queued and replayed once the new token is acquired, preventing backend replay detection from revoking the user's active session.
- **Full DTO Contract Alignment**: Synchronized frontend request/response schemas with actual Spring Boot DTOs (`AuthResponse`, `TokenResponse`, `UserResponse`, `ErrorResponse`, `RegisterRequest`, `LoginRequest`).
- **Complete Cache Isolation**: `queryClient.clear()` is executed on every logout and unauthorized event to prevent patient and clinical data leakage across user sessions on shared clinical computers.
- **Comprehensive Verification**: 10 test suites containing 43 unit and integration tests passing, zero ESLint issues, and successful production compilation.

---

## 2. Backend API Contracts & Integration Findings

A comprehensive audit of the backend source code (`AuthController.java`, `AuthService.java`, `SecurityConfig.java`, and DTO classes) identified key structural and behavioral contracts:

### 2.1 Endpoint Specification Matrix

| HTTP Method & Path | Backend Request DTO | Backend Response DTO | HTTP Status | Notes / Edge Cases |
|---|---|---|---|---|
| `POST /api/auth/login` | `LoginRequest` (`email`, `password`) | `AuthResponse` (`accessToken`, `refreshToken`, `tokenType`, `expiresIn`, `user`) | 200 OK | Rate limited by Bucket4j (5 req/min/IP). Emits `INVALID_CREDENTIALS` on bad login. |
| `POST /api/auth/register` | `RegisterRequest` (`email`, `password`, `fullName`, `phone`, `dateOfBirth`, `gender`, `address`) | `AuthResponse` (`accessToken`, `refreshToken`, `tokenType`, `expiresIn`, `user`) | 201 Created | `@ResponseStatus(HttpStatus.CREATED)` returns full `AuthResponse`, automatically logging user in. |
| `POST /api/auth/refresh` | `RefreshTokenRequest` (`refreshToken`) | `TokenResponse` (`accessToken`, `refreshToken`, `tokenType`, `expiresIn`) | 200 OK | **Crucial:** Response does **not** include the `user` object. Single-use rotation; reusing an old token revokes all user sessions. |
| `POST /api/auth/logout` | `LogoutRequest` (`refreshToken`) | *None* | 204 No Content | Backend revokes the refresh token and sets `revoked_at`. Returns empty body. |
| `GET /api/auth/me` | *None* (Bearer Token) | `UserResponse` (`id`, `email`, `fullName`, `role`, `patientId`, `doctorId`) | 200 OK | Hydrates authenticated user details and active role associations. |

### 2.2 Critical Mismatches Resolved

1. **`POST /api/auth/register` Response Type**:
   - *Previous Frontend Assumption:* Returned `UserResponse` (`{ id, email, fullName, role }`).
   - *Actual Backend Implementation:* Returns `@ResponseStatus(HttpStatus.CREATED) AuthResponse` containing tokens and `user`.
   - *Resolution:* `authService.register` captures the `AuthResponse`, stores the tokens, updates the user context, and immediately navigates to `/patient/dashboard`.

2. **Empty String Phone Number Validation**:
   - *Backend Constraint:* `RegisterRequest.phone` is annotated with `@Pattern(regexp = "^\\+?[0-9]{10,15}$", message = "Phone must be valid international format")`. It does not have `@NotBlank`.
   - *Risk:* If an empty string `""` is sent from an optional form input, Jakarta Validation rejects it with HTTP 400 `VALIDATION_FAILED`.
   - *Resolution:* `auth.service.js` sanitizes registration payloads: `phone: data.phone?.trim() ? data.phone.trim() : undefined`.

3. **`TokenResponse` Lack of User Object**:
   - *Backend Implementation:* `POST /api/auth/refresh` returns only `{ accessToken, refreshToken, tokenType, expiresIn }`.
   - *Resolution:* In `authService.restoreSession()`, upon receiving rotated tokens, the frontend calls `GET /api/auth/me` using the new access token to fully hydrate the user object before completing the startup restoration cycle.

4. **Error Response Field Standard**:
   - *Backend DTO:* `com.caresync.common.dto.ErrorResponse` exposes `code` (e.g. `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `VALIDATION_FAILED`), `message`, `status`, `path`, and `fieldErrors: [{ field, message }]`.
   - *Resolution:* Standardized frontend Axios interceptors and form helpers to read `error.response?.data?.code` and map `fieldErrors` directly into React Hook Form error states.

---

## 3. Token Security & Storage Architecture

### 3.1 In-Memory Access Token Model
To counter persistent XSS vulnerabilities where malicious scripts or injected dependencies read tokens from `localStorage`, CareSync implements strict in-memory token retention:
- `inMemoryAccessToken` is held solely in JavaScript module scope inside `token.service.js`.
- If an attacker inspects `localStorage` or `sessionStorage`, the active access token is not present.
- Memory access tokens are automatically destroyed when the browser window or tab is closed.

### 3.2 Session-Scoped Refresh Token Model
Refresh tokens are stored in `sessionStorage` (`cs_refresh_token`):
- `sessionStorage` survives tab reloads during active browsing.
- Unlike `localStorage`, `sessionStorage` is strictly scoped to the browser tab and does not persist across separate browser sessions or survive tab termination, drastically reducing the attack window on shared healthcare terminals.
- On `tokenService.clear()`, both `sessionStorage` and legacy `localStorage` keys (`cs_access_token`, `cs_refresh_token`, `cs_user`) are purged.

---

## 4. Single-Flight Token Refresh Mutex (Concurrency Guarantee)

### 4.1 The Replay Revocation Threat
In `AuthService.java` (lines 179-208), the backend implements token-family rotation:
```java
if (token.getRevokedAt() != null) {
    log.warn("Refresh token reuse detected for user: {}", token.getUser().getId());
    refreshTokenRevocationService.revokeAllActiveTokensForUser(token.getUser().getId());
    throw new InvalidTokenException("Refresh token has been revoked - possible replay attack");
}
```
If a dashboard initiates 10 concurrent widget queries when an access token expires:
1. Without a mutex: All 10 requests receive HTTP 401 simultaneously.
2. All 10 requests send `POST /api/auth/refresh` with the current refresh token.
3. The 1st request succeeds and revokes the token in the database.
4. Requests 2 through 10 arrive with the already-revoked token.
5. The backend flags this as a **replay attack**, revokes **all** tokens for the user, and throws an exception, forcibly logging the user out.

### 4.2 Mutex Implementation (`src/services/api.js`)
We designed a non-blocking in-flight Promise mutex:
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

### 4.3 Axios Interceptor Logic
When an outgoing request encounters a 401 error:
1. **Bypass Checks**: If the request URL matches `/auth/login`, `/auth/register`, `/auth/refresh`, or `/auth/logout`, or if `originalRequest._retry === true`, the error rejects immediately without retrying.
2. **Mutex Binding**: The request sets `originalRequest._retry = true` and awaits `executeTokenRefresh()`. All concurrent 401s attach to the single active `refreshPromise`.
3. **Request Replay**: Once resolved, the original request's `Authorization` header is replaced with `Bearer <newAccessToken>`, and the request is re-executed via `apiClient(originalRequest)`.
4. **Debounced Unauthorized Broadcast**: If `executeTokenRefresh()` rejects (e.g., refresh token expired or revoked), all waiting requests reject. A debounced `auth:unauthorized` window event is emitted once within a 1-second window, preventing event floods and flickering redirects.

---

## 5. Verification & Test Evidence

### 5.1 10-Concurrent-Requests Stress Test (`src/test/api-mutex.test.js`)
To verify that the mutex prevents token replay attacks under heavy concurrency, we implemented an automated stress test simulating 10 simultaneous 401 responses:

```javascript
it('coordinates 10 simultaneous 401 requests with exactly 1 refresh call', async () => {
  // 10 concurrent requests initiated with expired token
  const requests = Array.from({ length: 10 }, (_, i) =>
    apiClient.get(`/data/widget-${i}`)
  );
  const responses = await Promise.all(requests);

  // Assertions:
  expect(refreshCallCount).toBe(1); // EXACTLY ONE refresh call
  expect(responses).toHaveLength(10);
  responses.forEach((res) => {
    expect(res.status).toBe(200);
    expect(res.config.headers.Authorization).toBe('Bearer fresh-access-token');
  });
});
```
**Outcome:** PASSED. All 10 requests completed successfully with the refreshed token, with zero replay errors and exactly one backend refresh invocation.

### 5.2 Complete Test Suite Execution
```text
 RUN  v2.1.9 Z:/javaproject/frontend

 ✓ src/test/token.service.test.js (5 tests) 16ms
 ✓ src/test/api-mutex.test.js (7 tests) 37ms
 ✓ src/test/auth.service.test.js (6 tests) 61ms
 ✓ src/test/input.test.jsx (3 tests) 440ms
 ✓ src/test/protected-route.test.jsx (3 tests) 205ms
 ✓ src/test/button.test.jsx (4 tests) 524ms
 ✓ src/test/unauthorized-page.test.jsx (2 tests) 535ms
 ✓ src/test/register-page.test.jsx (3 tests) 825ms
 ✓ src/test/login-page.test.jsx (4 tests) 921ms
 ✓ src/test/auth.provider.test.jsx (6 tests) 406ms

 Test Files  10 passed (10)
      Tests  43 passed (43)
   Duration  12.71s
```

### 5.3 Static Analysis & Production Build
- **ESLint:** `npm.cmd run lint` executed cleanly with 0 errors and 0 warnings.
- **Production Compilation:** `npm.cmd run build` produced optimized production bundles in `dist/` in 7.09s (`index.html`, `index.css: 29.68 kB`, `index.js: 605.02 kB`).
- **Dev Server Startup:** Vite 6.4.6 boots cleanly on `http://localhost:5173`.

---

## 6. Security Guarantees & Operational Considerations

### 6.1 XSS vs. CSRF Architecture Decision
- **Why Bearer Tokens in Memory?** Traditional cookie-based authentication (`HttpOnly`) is protected against XSS reading but introduces Cross-Site Request Forgery (CSRF) vulnerabilities and complicates mobile/cross-origin deployments.
- By storing the short-lived access token in JavaScript memory and transmitting it via the `Authorization: Bearer` header, the application is inherently immune to CSRF attacks (browsers never attach Bearer tokens automatically to cross-origin requests).
- Persistent XSS storage threats are eliminated by never storing access tokens in `localStorage`.

### 6.2 Healthcare Station Cache Eviction
In clinic environments where multiple staff members (receptionist, doctor, nurse) use shared workstations, query cache retention poses a significant privacy risk (HIPAA/GDPR compliance).
- When any user logs out or has their session invalidated, `queryClient.clear()` immediately clears all TanStack Query cache entries.
- A subsequent login by a different staff member is guaranteed to start with empty cache state, requiring clean network authorization and preventing patient records from leaking across logins.

### 6.3 Bootstrap Accounts for Integration Testing
As verified in `StaffAccountBootstrapRunner.java`, the following accounts are automatically provisioned in local and test environments:

| Role | Email | Password |
|---|---|---|
| `ADMIN` | `admin@caresync.com` | `Admin@123456` |
| `DOCTOR` | `doctor@caresync.com` | `Doctor@123456` |
| `RECEPTIONIST` | `receptionist@caresync.com` | `Recep@123456` |

*Note on Patients:* Patient accounts are created dynamically through the `/register` endpoint (`POST /api/auth/register`) or seeded in test profiles.

### 6.4 Rate Limiting Protection
The Spring Boot backend enforces Bucket4j rate limiting on all `/api/auth/*` endpoints (5 requests per minute per IP address). When testing or entering invalid credentials repeatedly, the backend returns HTTP 429 `TOO_MANY_REQUESTS`. The frontend login page gracefully maps HTTP 429 to `"Too many login attempts. Please wait a minute and try again."`

---

## 7. Conclusion & Next Phase Readiness

The frontend authentication subsystem is fully hardened, contract-aligned, and verified against the backend specifications. All authentication flows—login, registration, session restoration, single-flight token rotation, route guards, and cache flushing—function with mathematical consistency and zero backend modifications.

The frontend is ready for **Phase 20: Dashboard & Feature Module Integration** (Patient Queue, Clinical Console, Appointment Scheduling, and Billing).
