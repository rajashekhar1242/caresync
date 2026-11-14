# Hospital & Clinic Management System (CareSync / HCMS)
## Backend API Inventory & Contract Specification

> **Source of Truth:** Spring Boot Controller implementations and `docs/openapi.yaml`.  
> **Prepared for:** Phase 18 Frontend Foundation.

---

## 1. Global Conventions

### A. Authentication & Tokens
- **Mechanism:** Stateless JWT (Bearer scheme) with SHA-256 hashed refresh tokens.
- **Authorization Header:** `Authorization: Bearer <accessToken>`
- **Access Token Expiry:** Configured by default to 900 seconds (15 minutes).
- **Refresh Token Expiry:** 604,800 seconds (7 days).
- **Refresh Token Storage & Transport:**
  - The backend returns refresh tokens directly in HTTP response bodies (`AuthResponse` and `TokenResponse`), **NOT in HttpOnly cookies**.
  - **Security Trade-Off:** Storing refresh tokens in memory or `sessionStorage` avoids cross-site tracking but exposes tokens to malicious in-page scripts if XSS occurs. However, CareSync implements strict **token rotation with automatic reuse detection**: if a token is reused or replayed, the backend revokes the entire user token family immediately.
  - **Client-Side Concurrency Safeguard:** When multiple concurrent API calls fail with HTTP 401, the frontend Axios interceptor must serialize refresh calls using a promise queue/mutex to prevent racing multiple refresh calls with the same token (which would trigger the backend's replay revocation and log the user out).

### B. Standard Response Structures
- **Single Entities:** Returned directly as JSON objects (e.g., `DoctorResponse`, `PatientResponse`).
- **Paginated Lists:** Standard `PageResponse<T>` wrapper:
  ```json
  {
    "content": [ ... ],
    "page": 0,
    "size": 20,
    "totalElements": 150,
    "totalPages": 8
  }
  ```
  - `page`: 0-indexed integer.
  - `size`: Items per page (default: 20, max: 100).
  - `sort`: Comma-separated field and direction (e.g. `slotStart,asc`, `fullName,asc`).

### C. Standard Error Response Structure
All non-2xx responses conform to `ErrorResponse`:
```json
{
  "timestamp": "2026-11-13T09:30:00Z",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "message": "Validation failed for one or more fields",
  "path": "/api/appointments",
  "fieldErrors": [
    {
      "field": "slotStart",
      "message": "Must be a future slot"
    }
  ]
}
```

### D. Date & Timezone Conventions
- **Dates (`LocalDate`):** `YYYY-MM-DD` (e.g. `2026-11-13`).
- **Instants (`Instant`):** ISO-8601 UTC string `YYYY-MM-DDTHH:mm:ssZ` (e.g. `2026-11-13T10:30:00Z`).
- **Time (`LocalTime`):** 24-hour `HH:mm` (e.g. `09:00`, `18:30`).
- **Clinic Timezone:** Default `Asia/Kolkata` (resolved per clinic).

### E. CORS Configuration
- **Allowed Origins:** `http://localhost:3000`, `http://localhost:5173` (configured in `application-dev.yml`).
- **Allowed Methods:** `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`.
- **Allowed Headers:** `Authorization`, `Content-Type`, `Accept`.
- **Exposed Headers:** `Content-Disposition`, `Cache-Control`, `Retry-After`.
- **Credentials:** `allowCredentials: true`.

### F. WebSocket (STOMP) Conventions
- **Endpoint:** `/ws` with SockJS fallback.
- **Broker Prefix:** `/topic`
- **Application Prefix:** `/app`
- **Allowed Subscription:** Strictly `/topic/queue/{doctorId}` (public token numbers only, no patient PII).
- **Client Messages:** All client `SEND` frames are rejected by `WebSocketSecurityConfig`.

---

## 2. Roles and Authorities

The system enforces four distinct roles:
1. `ROLE_ADMIN` (`ADMIN`)
2. `ROLE_RECEPTIONIST` (`RECEPTIONIST`)
3. `ROLE_DOCTOR` (`DOCTOR`)
4. `ROLE_PATIENT` (`PATIENT`)

User Principal payload returned by `/api/auth/me` and `/api/auth/login`:
```typescript
interface UserResponse {
  id: string; // UUID
  email: string;
  fullName: string;
  role: 'ADMIN' | 'RECEPTIONIST' | 'DOCTOR' | 'PATIENT';
  patientId: string | null; // populated if role == PATIENT
  doctorId: string | null;  // populated if role == DOCTOR
}
```

---

## 3. Complete Endpoint Inventory

### Authentication (`/api/auth`)

| Method | Path | Auth / Role | Request Body | Query Params | Success Response | Error Codes |
|---|---|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | `RegisterRequest` (`fullName`, `email`, `password`, `phone?`) | None | `201 Created` → `AuthResponse` | `400 VALIDATION_FAILED`, `409 EMAIL_ALREADY_EXISTS` |
| `POST` | `/api/auth/login` | Public | `LoginRequest` (`email`, `password`) | None | `200 OK` → `AuthResponse` | `400 VALIDATION_FAILED`, `401 INVALID_CREDENTIALS` |
| `POST` | `/api/auth/refresh` | Public | `RefreshRequest` (`refreshToken`) | None | `200 OK` → `TokenResponse` | `400 VALIDATION_FAILED`, `401 INVALID_REFRESH_TOKEN` |
| `POST` | `/api/auth/logout` | Public | `RefreshRequest` (`refreshToken`) | None | `204 No Content` | None |
| `GET` | `/api/auth/me` | Authenticated (Any) | None | None | `200 OK` → `UserResponse` | `401 UNAUTHORIZED`, `404 RESOURCE_NOT_FOUND` |

*Note:* Self-registration (`POST /api/auth/register`) only registers users with role `PATIENT`. All other roles must be provisioned by administrators or bootstrapped.

---

### Reference Data (`/api`)

| Method | Path | Auth / Role | Request Body | Query Params | Success Response | Error Codes |
|---|---|---|---|---|---|---|
| `GET` | `/api/clinics` | Authenticated (Any) | None | None | `200 OK` → `ClinicResponse[]` | `401 UNAUTHORIZED` |
| `GET` | `/api/specializations` | Authenticated (Any) | None | None | `200 OK` → `SpecializationResponse[]` | `401 UNAUTHORIZED` |
| `GET` | `/api/departments` | Authenticated (Any) | None | None | `200 OK` → `DepartmentResponse[]` | `401 UNAUTHORIZED` |
| `POST` | `/api/departments` | `ADMIN` | `DepartmentRequest` (`name`, `description?`) | None | `201 Created` → `DepartmentResponse` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED`, `409 DEPARTMENT_NAME_EXISTS` |
| `PUT` | `/api/departments/{id}` | `ADMIN` | `DepartmentRequest` (`name`, `description?`) | None | `200 OK` → `DepartmentResponse` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND`, `409 DEPARTMENT_NAME_EXISTS` |

---

### Doctors & Schedules (`/api/doctors`)

| Method | Path | Auth / Role | Request Body | Query Params | Success Response | Error Codes |
|---|---|---|---|---|---|---|
| `GET` | `/api/doctors` | Authenticated (Any) | None | `specializationId?`, `clinicId?`, `name?`, `page=0`, `size=20`, `sort=fullName,asc` | `200 OK` → `PageResponse<DoctorResponse>` | `400 VALIDATION_FAILED`, `401 UNAUTHORIZED` |
| `POST` | `/api/doctors` | `ADMIN` | `DoctorCreateRequest` | None | `201 Created` → `DoctorResponse` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED`, `409 EMAIL_ALREADY_EXISTS` |
| `GET` | `/api/doctors/{id}` | Authenticated (Any) | None | None | `200 OK` → `DoctorResponse` | `401 UNAUTHORIZED`, `404 RESOURCE_NOT_FOUND` |
| `PUT` | `/api/doctors/{id}` | `ADMIN` | `DoctorUpdateRequest` | None | `200 OK` → `DoctorResponse` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `GET` | `/api/doctors/{id}/schedules` | `ADMIN`, `RECEPTIONIST`, `DOCTOR` | None | None | `200 OK` → `WeeklyScheduleResponse` | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `PUT` | `/api/doctors/{id}/schedules` | `ADMIN`, `DOCTOR` (own) | `WeeklyScheduleRequest` (`entries[]`) | None | `200 OK` → `WeeklyScheduleResponse` | `400 INVALID_SCHEDULE`, `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `GET` | `/api/doctors/{id}/leaves` | `ADMIN`, `RECEPTIONIST`, `DOCTOR` | None | `from?`, `to?` | `200 OK` → `LeaveResponse[]` | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `POST` | `/api/doctors/{id}/leaves` | `ADMIN`, `DOCTOR` (own) | `LeaveRequest` (`startDate`, `endDate`, `reason?`) | None | `201 Created` → `LeaveResponse` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED`, `409 LEAVE_OVERLAP`, `409 LEAVE_HAS_BOOKED_APPOINTMENTS` |
| `DELETE` | `/api/doctors/{id}/leaves/{leaveId}` | `ADMIN`, `DOCTOR` (own) | None | None | `204 No Content` | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `GET` | `/api/doctors/{id}/slots` | Authenticated (Any) | None | `date` (YYYY-MM-DD, required) | `200 OK` → `SlotListResponse` | `400 OUTSIDE_BOOKING_WINDOW`, `404 RESOURCE_NOT_FOUND` |

---

### Patients (`/api/patients`)

| Method | Path | Auth / Role | Request Body | Query Params | Success Response | Error Codes |
|---|---|---|---|---|---|---|
| `GET` | `/api/patients` | `ADMIN`, `RECEPTIONIST`, `DOCTOR` | None | `phone?`, `name?`, `page=0`, `size=20` | `200 OK` → `PageResponse<PatientSummary>` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED` |
| `POST` | `/api/patients` | `ADMIN`, `RECEPTIONIST` | `PatientRequest` | None | `201 Created` → `PatientResponse` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED` |
| `GET` | `/api/patients/{id}` | `ADMIN`, `RECEPTIONIST`, `DOCTOR` (assigned), `PATIENT` (own) | None | None | `200 OK` → `PatientResponse` | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `PUT` | `/api/patients/{id}` | `ADMIN`, `RECEPTIONIST`, `PATIENT` (own) | `PatientRequest` | None | `200 OK` → `PatientResponse` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |

---

### Appointments (`/api/appointments`)

| Method | Path | Auth / Role | Request Body | Query Params | Success Response | Error Codes |
|---|---|---|---|---|---|---|
| `GET` | `/api/appointments` | Authenticated (Scoped by role) | None | `doctorId?`, `patientId?`, `status?`, `from?`, `to?`, `page=0`, `size=20`, `sort=slotStart,asc` | `200 OK` → `PageResponse<AppointmentResponse>` | `400 VALIDATION_FAILED`, `401 UNAUTHORIZED` |
| `POST` | `/api/appointments` | `ADMIN`, `RECEPTIONIST`, `PATIENT` | `AppointmentCreateRequest` (`doctorId`, `patientId`, `slotStart`, `reason?`) | None | `201 Created` → `AppointmentResponse` | `400 INVALID_SLOT`, `400 OUTSIDE_BOOKING_WINDOW`, `409 SLOT_ALREADY_BOOKED`, `409 DOCTOR_UNAVAILABLE` |
| `GET` | `/api/appointments/{id}` | Scoped: `ADMIN`, `RECEPTIONIST`, `DOCTOR` (assigned), `PATIENT` (own) | None | None | `200 OK` → `AppointmentResponse` | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `PATCH` | `/api/appointments/{id}/status` | Scoped by transition | `AppointmentStatusUpdateRequest` (`status`, `reason?`) | None | `200 OK` → `AppointmentResponse` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED`, `409 ILLEGAL_STATE_TRANSITION`, `409 CANCELLATION_WINDOW_CLOSED` |

**Allowed Status Transitions:**
- `BOOKED` → `CHECKED_IN` (Receptionist)
- `BOOKED` → `CANCELLED` (Patient before 2h cutoff; Receptionist/Admin anytime)
- `CHECKED_IN` → `IN_CONSULTATION` (Doctor via `/call-next` or direct status transition)
- `IN_CONSULTATION` → `COMPLETED` (Doctor when consultation finalized)
- `BOOKED` → `NO_SHOW` (Automated / Receptionist after day closes)

---

### Queue (`/api/queue`)

| Method | Path | Auth / Role | Request Body | Query Params | Success Response | Error Codes |
|---|---|---|---|---|---|---|
| `GET` | `/api/queue/board` | **Public** (Anonymous) | None | `clinicId` (required) | `200 OK` → `QueueBoardResponse` (Cache-Control: no-store) | `400 VALIDATION_FAILED`, `404 RESOURCE_NOT_FOUND` |
| `GET` | `/api/queue/doctors/{id}` | `ADMIN`, `RECEPTIONIST`, `DOCTOR` (own) | None | None | `200 OK` → `QueueStateResponse` | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `POST` | `/api/queue/doctors/{id}/call-next` | `DOCTOR` (own) | None | None | `200 OK` → `QueueStateResponse` | `403 ACCESS_DENIED`, `409 QUEUE_EMPTY`, `409 CONSULTATION_IN_PROGRESS` |

---

### Consultations & Prescriptions (`/api`)

| Method | Path | Auth / Role | Request Body | Query Params | Success Response | Error Codes |
|---|---|---|---|---|---|---|
| `GET` | `/api/appointments/{id}/consultation` | Scoped: `ADMIN`, `DOCTOR` (assigned), `PATIENT` (own) | None | None | `200 OK` → `ConsultationResponse` | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `POST` | `/api/appointments/{id}/consultation` | `DOCTOR` (assigned) | `ConsultationRequest` (`symptoms`, `diagnosis`, `notes?`) | None | `201 Created` → `ConsultationResponse` | `403 ACCESS_DENIED`, `409 APPOINTMENT_NOT_IN_CONSULTATION`, `409 CONSULTATION_ALREADY_EXISTS` |
| `GET` | `/api/consultations/{id}` | Scoped | None | None | `200 OK` → `ConsultationResponse` | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `PUT` | `/api/consultations/{id}` | `DOCTOR` (assigned) | `ConsultationRequest` | None | `200 OK` → `ConsultationResponse` | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND`, `409 CONSULTATION_FINALIZED` |
| `GET` | `/api/medicines` | `ADMIN`, `DOCTOR` | None | `name?`, `page=0`, `size=20` | `200 OK` → `PageResponse<MedicineResponse>` | `403 ACCESS_DENIED` |
| `POST` | `/api/prescriptions/check` | `ADMIN`, `DOCTOR` | `PrescriptionCheckRequest` (`patientId`, `medicineIds[]`) | None | `200 OK` → `PrescriptionCheckResponse` (`safe`, `interactions[]`, `allergyWarnings[]`) | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED` |
| `POST` | `/api/prescriptions` | `DOCTOR` (assigned) | `PrescriptionCreateRequest` | None | `201 Created` → `PrescriptionResponse` | `403 ACCESS_DENIED`, `409 PRESCRIPTION_ALREADY_EXISTS`, `409 SEVERE_WARNING_NOT_ACKNOWLEDGED` |
| `GET` | `/api/prescriptions/{id}` | Scoped | None | None | `200 OK` → `PrescriptionResponse` | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `GET` | `/api/prescriptions/{id}/pdf` | Scoped | None | None | `200 OK` → Binary PDF (`Content-Type: application/pdf`, `Content-Disposition: attachment`) | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `GET` | `/api/patients/{id}/prescriptions` | Scoped | None | `page=0`, `size=20` | `200 OK` → `PageResponse<PrescriptionResponse>` | `403 ACCESS_DENIED` |

---

### Billing & Invoices (`/api`)

| Method | Path | Auth / Role | Request Body | Query Params | Success Response | Error Codes |
|---|---|---|---|---|---|---|
| `GET` | `/api/invoices` | `ADMIN`, `RECEPTIONIST`, `PATIENT` (own) | None | `status?`, `patientId?`, `from?`, `to?`, `page=0`, `size=20` | `200 OK` → `PageResponse<InvoiceSummary>` | `403 ACCESS_DENIED` |
| `GET` | `/api/invoices/{id}` | Scoped | None | None | `200 OK` → `InvoiceResponse` | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `GET` | `/api/appointments/{id}/invoice` | Scoped | None | None | `200 OK` → `InvoiceResponse` | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `GET` | `/api/invoices/{id}/pdf` | Scoped | None | None | `200 OK` → Binary PDF (`application/pdf`) | `403 ACCESS_DENIED`, `404 RESOURCE_NOT_FOUND` |
| `POST` | `/api/invoices/{id}/items` | `ADMIN`, `RECEPTIONIST` | `InvoiceItemRequest` (`description`, `unitPrice`, `quantity`) | None | `201 Created` → `InvoiceItemResponse` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED`, `409 INVOICE_IMMUTABLE` |
| `POST` | `/api/invoices/{id}/payments` | `ADMIN`, `RECEPTIONIST` | `PaymentRequest` (`amount`, `method`, `txnRef?`, `notes?`) | None | `201 Created` → `PaymentResponse` | `400 OVERPAYMENT`, `409 DUPLICATE_TXN_REF`, `409 INVOICE_IMMUTABLE` |
| `POST` | `/api/invoices/{id}/credit-notes` | `ADMIN` | `CreditNoteRequest` (`amount`, `reason`) | None | `201 Created` → `CreditNoteResponse` | `400 CREDIT_EXCEEDS_INVOICE`, `409 INVOICE_NOT_PAID` |
| `POST` | `/api/invoices/{id}/void` | `ADMIN` | `VoidInvoiceRequest` (`reason`) | None | `200 OK` → `InvoiceResponse` | `409 INVOICE_HAS_PAYMENTS`, `409 INVOICE_IMMUTABLE` |

---

### Reports & Analytics (`/api/reports`)

| Method | Path | Auth / Role | Request Body | Query Params | Success Response | Error Codes |
|---|---|---|---|---|---|---|
| `GET` | `/api/reports/revenue` | `ADMIN` | None | `from`, `to`, `clinicId?`, `groupBy=DAY` (DAY/WEEK/MONTH) | `200 OK` → `RevenueReportResponse` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED` |
| `GET` | `/api/reports/appointments-by-department` | `ADMIN` | None | `from`, `to`, `clinicId?` | `200 OK` → `AppointmentsByDepartmentResponse` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED` |
| `GET` | `/api/reports/no-show-rate` | `ADMIN` | None | `from`, `to`, `clinicId?` | `200 OK` → `NoShowRateResponse` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED` |
| `GET` | `/api/reports/top-doctors` | `ADMIN` | None | `from`, `to`, `clinicId?`, `rankBy=COMPLETED_APPOINTMENTS`, `limit=5` | `200 OK` → `TopDoctorsResponse` | `400 VALIDATION_FAILED`, `403 ACCESS_DENIED` |
| `GET` | `/api/reports/dashboard` | `ADMIN` | None | `clinicId?` | `200 OK` → `DashboardSummaryResponse` | `403 ACCESS_DENIED` |

---

### Audit Logs (`/api/audit-logs`)

| Method | Path | Auth / Role | Request Body | Query Params | Success Response | Error Codes |
|---|---|---|---|---|---|---|
| `GET` | `/api/audit-logs` | `ADMIN` | None | `userId?`, `action?`, `entityType?`, `from?`, `to?`, `page=0`, `size=20` | `200 OK` → `PageResponse<AuditLogResponse>` | `403 ACCESS_DENIED` |
