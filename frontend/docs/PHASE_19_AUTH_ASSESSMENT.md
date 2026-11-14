# CareSync — Phase 19: Backend Authentication Initial Assessment

**Date:** November 13, 2026  
**Document:** `frontend/docs/PHASE_19_AUTH_ASSESSMENT.md`  
**System:** CareSync — Hospital & Clinic Management System (HCMS)  
**Authors:** Senior React & Spring Boot Integration Engineering  

---

## 1. Current Frontend Authentication Implementation

The frontend scaffold created during Phase 18 established the baseline authentication modules:

1. **`src/services/token.service.js`**:
   - Maintains `inMemoryAccessToken` and `inMemoryRefreshToken`.
   - Currently persists **both** access and refresh tokens to `localStorage`.
   - Persists user profile to `localStorage`.
2. **`src/services/api.js`**:
   - Axios client with `baseURL` defaulting to `/api`, timeout 15000ms.
   - Request interceptor injecting `Authorization: Bearer <accessToken>`.
   - Response interceptor handling HTTP 401 with an initial queue-based mutex.
   - Excludes `/auth/login`, `/auth/refresh`, `/auth/register` (missing `/auth/logout`).
   - Emits `auth:unauthorized` window event on failure.
3. **`src/services/auth.service.js`**:
   - Wraps endpoints for `login`, `register`, `refreshToken`, `logout`, and `getCurrentUser`.
4. **`src/app/providers/auth.provider.jsx` & `auth.context.jsx`**:
   - Supplies `user`, `role`, `isAuthenticated`, `isLoading`, `login`, `register`, `logout`.
   - Attempts session restoration on mount by reading access token from storage.
5. **`src/features/auth/login-page.jsx` & `register-page.jsx`**:
   - Forms using React Hook Form and Zod validation schemas.

---

## 2. Actual Backend Authentication Contract

Inspection of the actual backend Java codebase (`backend/src/main/java/com/caresync/auth/` and `SecurityConfig.java`) reveals the following authoritative API contracts:

### A. Endpoints & Controller Mapping (`AuthController.java`)

| Method | Endpoint | Request Body | Response Status | Response Body |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | `RegisterRequest` | `201 Created` | `AuthResponse` |
| `POST` | `/api/auth/login` | `LoginRequest` | `200 OK` | `AuthResponse` |
| `POST` | `/api/auth/refresh` | `RefreshRequest` | `200 OK` | `TokenResponse` |
| `POST` | `/api/auth/logout` | `RefreshRequest` | `204 No Content` | *Empty body* |
| `GET` | `/api/auth/me` | *None* | `200 OK` | `UserResponse` |

### B. Request & Response DTO Structures

1. **`LoginRequest`**:
   ```json
   {
     "email": "user@example.com",
     "password": "rawPassword"
   }
   ```
2. **`RegisterRequest`**:
   ```json
   {
     "fullName": "Jane Doe",
     "email": "jane@example.com",
     "password": "Password123",
     "phone": "9876543210"
   }
   ```
   *Constraint:* `phone` is validated by `@Pattern(regexp = "^\\+?[0-9]{10,15}$")`. If sent as an empty string `""`, validation fails! If omitted or `null`, validation succeeds.
3. **`RefreshRequest`**:
   ```json
   {
     "refreshToken": "raw-refresh-token-string"
   }
   ```
4. **`AuthResponse`**:
   ```json
   {
     "accessToken": "jwt-token-string",
     "refreshToken": "raw-refresh-token-string",
     "tokenType": "Bearer",
     "expiresIn": 900,
     "user": {
       "id": "uuid",
       "email": "user@example.com",
       "fullName": "Jane Doe",
       "role": "PATIENT",
       "patientId": "uuid-or-null",
       "doctorId": "uuid-or-null"
     }
   }
   ```
5. **`TokenResponse`**:
   ```json
   {
     "accessToken": "jwt-token-string",
     "refreshToken": "raw-refresh-token-string",
     "tokenType": "Bearer",
     "expiresIn": 900
   }
   ```
   *Crucial Detail:* `TokenResponse` does **not** contain the `user` object.
6. **`UserResponse`**:
   ```json
   {
     "id": "uuid",
     "email": "user@example.com",
     "fullName": "Jane Doe",
     "role": "PATIENT",
     "patientId": "uuid-or-null",
     "doctorId": "uuid-or-null"
   }
   ```
   *Crucial Detail:* The backend record does **not** include `phone` or `active`.
7. **`ErrorResponse`**:
   ```json
   {
     "timestamp": "2026-11-13T01:21:00Z",
     "status": 401,
     "code": "INVALID_CREDENTIALS",
     "message": "Invalid email or password",
     "path": "/api/auth/login",
     "fieldErrors": []
   }
   ```
   *Crucial Detail:* The backend error code field is named `code`, not `errorCode`.

---

## 3. Differences Between Frontend Assumptions and Backend Implementation

| Dimension | Frontend Phase 18 Assumption | Actual Backend Reality | Action Required |
|---|---|---|---|
| **Registration Response** | Assumed `UserResponse` | Returns `AuthResponse` (`201 Created`) with initial token pair and user | Update `authService.register` and types to handle `AuthResponse` |
| **User DTO Fields** | Assumed `{ id, fullName, email, role, phone, active }` | Returns `{ id, email, fullName, role, patientId, doctorId }` | Update `src/types/index.js` JSDoc & Zod schemas |
| **Error DTO Field** | Assumed `errorCode` | Field is named `code` (e.g. `code: "INVALID_CREDENTIALS"`) | Support both `code` and fallback `errorCode` in UI error handlers |
| **Phone in Registration** | Form defaulted to `""` (empty string) | Backend fails Bean Validation if `phone` is empty string (`@Pattern`) | Sanitize empty phone to `undefined`/omit prior to API dispatch |
| **Logout Response** | Expected standard 200 JSON | Returns `204 No Content` (empty body) | Handle 204 status without JSON parse error |
| **Logout Endpoint in Interceptor** | Missing from refresh exclusion list | Must never trigger refresh | Add `/auth/logout` to refresh exclusion list in `api.js` |
| **Access Token Storage** | Persisted in `localStorage` | Security requirement: Memory only | Refactor `tokenService` to keep access token in JS memory |
| **Refresh Token Storage** | Persisted in `localStorage` | Requirement: `sessionStorage` | Refactor `tokenService` to use `sessionStorage` |
| **Session Restoration** | Checked for stored access token on mount | Access token is in memory; on reload it is null | Read refresh token from `sessionStorage`, call `/api/auth/refresh`, then `/api/auth/me` |

---

## 4. Security Concerns & Concurrency Risks

1. **Token Replay Family Revocation Hazard:**
   - In `AuthService.java` lines 179-191:
     If a refresh token with `revokedAt != null` is presented, `refreshTokenRevocationService.revokeAllActiveTokensForUser(userId)` is executed immediately.
   - If multiple parallel requests on a dashboard hit 401 and concurrently dispatch refresh calls with the current refresh token, only the first request succeeds; the subsequent requests encounter a revoked token and revoke the entire token family!
   - **Resolution:** A strictly coordinated single-flight promise mutex in `src/services/api.js` that serializes refresh execution, queuing all 401 callers until the single refresh resolves, then replaying them with the new access token.
2. **Cross-Site Scripting (XSS) Risks of Browser Tokens:**
   - Because the backend does not use `HttpOnly` cookies, both tokens are exposed to JavaScript.
   - Storing access tokens in `localStorage` makes them permanently accessible to any script executing on the origin until manually cleared.
   - **Mitigation:**
     - Access tokens are kept strictly in JavaScript runtime memory (`inMemoryAccessToken`). An XSS attacker cannot extract an access token from persistent storage.
     - Refresh tokens are kept in `sessionStorage` (cleared when the browser tab closes) rather than `localStorage`.
     - Sensitive tokens are never printed in logs or UI alerts.

---

## 5. Required Changes

1. **`frontend/src/services/token.service.js`**:
   - Access token: In-memory only (`this.inMemoryAccessToken`). Never read or write to `localStorage`/`sessionStorage`.
   - Refresh token: Stored in `sessionStorage` (`STORAGE_KEYS.REFRESH_TOKEN`).
   - User: In-memory with optional session cache.
   - Clear: Resets in-memory variables and removes keys from `sessionStorage`.
2. **`frontend/src/services/api.js`**:
   - Single-flight refresh mutex using a shared `refreshPromise`.
   - If `refreshPromise` exists, enqueue waiting callers to await the resolved new token.
   - Exclude `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`.
   - Maximum 1 retry per request (`originalRequest._retry = true`).
   - Debounced/single dispatch of `auth:unauthorized` event on session termination.
   - Error parser normalizing backend `code` and `fieldErrors`.
3. **`frontend/src/services/auth.service.js`**:
   - `login(payload)`: calls `POST /api/auth/login`, updates memory/session, returns `AuthResponse`.
   - `register(payload)`: sanitizes empty `phone`, calls `POST /api/auth/register`, updates memory/session, returns `AuthResponse`.
   - `restoreSession()`: reads refresh token from `sessionStorage`, calls `POST /api/auth/refresh`, updates memory/session, calls `GET /api/auth/me`, returns user.
   - `logout()`: sends refresh token to `POST /api/auth/logout`, clears tokens and query cache.
4. **`frontend/src/app/providers/auth.provider.jsx`**:
   - Updates `verifySession()`: if refresh token exists in `sessionStorage`, calls `restoreSession()`. If successful, sets user; if failed, clears session and sets `isLoading(false)`.
   - On `logout()`, clears `queryClient` (`queryClient.clear()`) to wipe user-specific cache.
5. **`frontend/src/features/auth/login-page.jsx`**:
   - Post-login navigation: checks if `location.state?.from?.pathname` is authorized for the user's actual role; if not, falls back to `ROLE_DEFAULT_REDIRECT[user.role]`.
6. **`frontend/src/features/auth/register-page.jsx`**:
   - Sanitizes empty phone input to prevent `VALIDATION_FAILED` from backend.
   - Connects backend validation field errors to form fields if present.

---

## 6. Test Strategy

1. **Token Service Unit Tests (`src/test/token.service.test.js`)**:
   - Verifies access token remains in memory only.
   - Verifies refresh token persists to `sessionStorage`.
   - Verifies `clear()` removes session items and memory references.
2. **Axios Single-Flight Mutex Concurrency Test (`src/test/api-mutex.test.js`)**:
   - Simulates **10 simultaneous API requests** that return 401.
   - Asserts:
     - Exactly 1 refresh HTTP request is made (`POST /api/auth/refresh`).
     - All 10 original requests are retried with the new access token.
     - 0 token replay errors.
     - Exactly 1 `auth:unauthorized` event fired if refresh fails.
3. **Auth Service Tests (`src/test/auth.service.test.js`)**:
   - Verifies login, register, restoreSession, logout, and getCurrentUser.
4. **Auth Provider Integration Tests (`src/test/auth.provider.test.jsx`)**:
   - Tests session restoration on startup when refresh token exists.
   - Tests unauthenticated fallback when refresh token is absent or invalid.
5. **Verification Suite**:
   - `npm run lint`
   - `npm run test`
   - `npm run build`
   - `npm run dev` probe
