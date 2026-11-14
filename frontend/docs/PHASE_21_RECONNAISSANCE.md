# Phase 21 – Receptionist Dashboard Reconnaissance & Technical Specification

**Project:** Hospital & Clinic Management System (CareSync / HCMS)  
**Date:** November 13, 2026  
**Auditor / Engineer:** Senior Frontend Architect & Spring Boot Integration Specialist  
**Role Scope:** `ROLE_RECEPTIONIST` (`RECEPTIONIST`)  
**Backend:** Spring Boot 4.1.2 · Java 25 LTS · PostgreSQL 16 · Flyway Migrations V1–V12  
**Frontend:** React 18 · Vite 6 · JavaScript ES6+ (JSX) · Tailwind CSS · TanStack Query 5 · Axios  

---

## 1. Executive Summary

Phase 21 implements a dedicated, production-grade **Receptionist Dashboard** for front-desk operations in the CareSync Hospital Management System. The receptionist serves as the operational bridge between arriving patients, clinical departments, physician schedules, encounter check-ins, and waiting room queue flow.

This document compiles the exhaustive reconnaissance of backend controllers, security rules, OpenAPI schemas, DTOs, WebSocket configuration, and frontend architecture, defining exact contracts and role boundaries prior to implementation.

---

## 2. Authentication, RBAC & Role Boundaries

### 2.1 Confirmed Role Permissions (`ROLE_RECEPTIONIST`)

| Domain | Allowed Endpoints | Forbidden Endpoints (HTTP 403) |
|---|---|---|
| **Authentication** | `POST /auth/login`<br>`POST /auth/refresh`<br>`POST /auth/logout`<br>`GET /auth/me` | None |
| **Reference Data** | `GET /clinics`<br>`GET /specializations`<br>`GET /departments` | `POST /departments` (ADMIN)<br>`PUT /departments/{id}` (ADMIN) |
| **Physicians** | `GET /doctors`<br>`GET /doctors/{id}`<br>`GET /doctors/{id}/schedules`<br>`GET /doctors/{id}/leaves`<br>`GET /doctors/{id}/slots` | `POST /doctors` (ADMIN)<br>`PUT /doctors/{id}` (ADMIN)<br>`PUT /doctors/{id}/schedules` (ADMIN/DOCTOR)<br>`POST /doctors/{id}/leaves` (ADMIN/DOCTOR)<br>`DELETE /doctors/{id}/leaves/{id}` (ADMIN/DOCTOR) |
| **Patients** | `GET /patients` (search name/phone)<br>`POST /patients` (register walk-in)<br>`GET /patients/{id}` (view demographic/allergies)<br>`PUT /patients/{id}` (update details) | None (demographic/allergies accessible; access logged via backend `PATIENT_READ` audit event) |
| **Appointments** | `GET /appointments` (unrestricted list with filters)<br>`POST /appointments` (book on behalf of patient)<br>`GET /appointments/{id}`<br>`PATCH /appointments/{id}/status` (`CHECKED_IN`, `CANCELLED`, `NO_SHOW`) | Direct transition to `IN_CONSULTATION` or `COMPLETED` (DOCTOR only) |
| **Queue** | `GET /queue/board` (public clinic display)<br>`GET /queue/doctors/{id}` (detailed doctor queue state)<br>`POST /queue/doctors/{id}/call-next` (permitted for doctor/receptionist) | Client `SEND` frames over WebSocket (rejected by STOMP interceptor) |
| **Billing & Cashier** | `GET /invoices`<br>`GET /invoices/{id}`<br>`GET /appointments/{id}/invoice`<br>`GET /invoices/{id}/pdf`<br>`POST /invoices/{id}/items`<br>`POST /invoices/{id}/payments` | `POST /invoices/{id}/credit-notes` (ADMIN only)<br>`POST /invoices/{id}/void` (ADMIN only) |
| **Clinical** | None | `GET/POST /appointments/{id}/consultation` (DOCTOR/ADMIN)<br>`GET/PUT /consultations/{id}` (DOCTOR/ADMIN)<br>`GET /medicines` (DOCTOR/ADMIN)<br>`POST /prescriptions/check` (DOCTOR/ADMIN)<br>`POST /prescriptions` (DOCTOR only) |
| **Reports** | None | `GET /reports/*` (All endpoints require `ADMIN`) |
| **Audit Logs** | None | `GET /audit-logs` (Requires `ADMIN`) |

---

## 3. Confirmed Endpoints & Exact DTO Contracts

### 3.1 Patient Management

#### A. Patient Search & List (`GET /api/patients`)
- **Authorization:** `@PreAuthorize("hasAnyRole('ADMIN', 'RECEPTIONIST', 'DOCTOR')")`
- **Query Parameters:**
  - `phone`: String, optional regex `^\+?[0-9]{3,15}$`
  - `name`: String, optional length 2–100
  - `page`: Integer (min 0, default 0)
  - `size`: Integer (min 1, max 100, default 20)
- **Response (`200 OK`):** `PageResponse<PatientSummary>`
  ```json
  {
    "content": [
      {
        "id": "uuid",
        "fullName": "Jane Doe",
        "phone": "+919876543210",
        "dateOfBirth": "1990-05-15",
        "gender": "FEMALE"
      }
    ],
    "page": 0,
    "size": 20,
    "totalElements": 1,
    "totalPages": 1
  }
  ```

#### B. Walk-in Patient Registration (`POST /api/patients`)
- **Authorization:** `@PreAuthorize("hasAnyRole('ADMIN', 'RECEPTIONIST')")`
- **Request Body (`PatientRequest`):**
  ```json
  {
    "fullName": "Rajesh Kumar",
    "dateOfBirth": "1985-08-20",
    "gender": "MALE",
    "phone": "+919876543211",
    "email": "rajesh@example.com",
    "address": "42 MG Road, Bengaluru",
    "allergies": ["Penicillin", "Pollen"]
  }
  ```
  *Validation Rules:*
  - `fullName`: required, 2–100 chars
  - `dateOfBirth`: optional, `@PastOrPresent`
  - `gender`: optional enum (`MALE`, `FEMALE`, `OTHER`)
  - `phone`: optional regex `^\+?[0-9]{10,15}$`
  - `email`: optional valid email, max 254 chars
  - `address`: optional, max 500 chars
  - `allergies`: required array (can be empty `[]`), max 50 strings, each 1–100 chars
- **Response (`201 Created`):** `PatientResponse` (`id`, `userId`, `fullName`, `dateOfBirth`, `gender`, `phone`, `email`, `address`, `allergies`, `createdAt`, `updatedAt`)

#### C. Patient Profile Retrieval (`GET /api/patients/{id}`)
- **Authorization:** Accessible to `RECEPTIONIST`. Automatically emits backend `PATIENT_READ` compliance audit log.
- **Response (`200 OK`):** `PatientResponse`

---

### 3.2 Doctor Availability, Schedules & Slots

#### A. Doctors Directory (`GET /api/doctors`)
- **Authorization:** Authenticated (Any)
- **Query Parameters:** `specializationId`, `clinicId`, `name`, `page`, `size`, `sort`
- **Response (`200 OK`):** `PageResponse<DoctorResponse>`
  ```json
  {
    "content": [
      {
        "id": "uuid",
        "userId": "uuid",
        "fullName": "Dr. Sarah Jenkins",
        "specialization": { "id": "uuid", "name": "Cardiology" },
        "department": { "id": "uuid", "name": "Internal Medicine" },
        "clinic": { "id": "uuid", "name": "CareSync Central Clinic", "timeZone": "Asia/Kolkata" },
        "consultationFee": "900.00 INR",
        "slotMinutes": 15,
        "active": true
      }
    ]
  }
  ```

#### B. Doctor Weekly Schedule (`GET /api/doctors/{id}/schedules`)
- **Authorization:** `@PreAuthorize("hasAnyRole('ADMIN', 'RECEPTIONIST', 'DOCTOR')")`
- **Response (`200 OK`):** `WeeklyScheduleResponse`
  ```json
  {
    "doctorId": "uuid",
    "entries": [
      {
        "dayOfWeek": "MONDAY",
        "startTime": "09:00",
        "endTime": "13:00"
      }
    ]
  }
  ```

#### C. Doctor Leaves (`GET /api/doctors/{id}/leaves`)
- **Authorization:** `@PreAuthorize("hasAnyRole('ADMIN', 'RECEPTIONIST', 'DOCTOR')")`
- **Query Parameters:** `from` (LocalDate), `to` (LocalDate)
- **Response (`200 OK`):** `List<LeaveResponse>` (`id`, `doctorId`, `startDate`, `endDate`, `reason`)

#### D. Dynamic Available Slots (`GET /api/doctors/{id}/slots`)
- **Authorization:** Authenticated (Any)
- **Query Parameters:** `date` (YYYY-MM-DD, required)
- **Response (`200 OK`):** `SlotListResponse`
  ```json
  {
    "doctorId": "uuid",
    "clinicId": "uuid",
    "timeZone": "Asia/Kolkata",
    "date": "2026-11-13",
    "slotMinutes": 15,
    "closedReason": null,
    "slots": [
      {
        "start": "2026-11-13T03:30:00Z",
        "end": "2026-11-13T03:45:00Z",
        "available": true
      },
      {
        "start": "2026-11-13T03:45:00Z",
        "end": "2026-11-13T04:00:00Z",
        "available": false
      }
    ]
  }
  ```
  *Closed Reasons (when doctor cannot take appointments):*
  - `DOCTOR_INACTIVE`
  - `OUTSIDE_BOOKING_WINDOW`
  - `ON_LEAVE`
  - `NO_SCHEDULE`

---

### 3.3 Appointment Booking & Status Lifecycle

#### A. Appointment Listing (`GET /api/appointments`)
- **Authorization:** Authenticated (unrestricted for Receptionist across hospital)
- **Query Parameters:**
  - `doctorId`: optional UUID
  - `patientId`: optional UUID
  - `status`: optional list (`BOOKED`, `CHECKED_IN`, `IN_CONSULTATION`, `COMPLETED`, `CANCELLED`, `NO_SHOW`)
  - `from`: optional Instant (ISO UTC)
  - `to`: optional Instant (ISO UTC)
  - `page`: default 0
  - `size`: default 20
  - `sort`: default `slotStart,asc`
- **Response (`200 OK`):** `PageResponse<AppointmentResponse>`

#### B. Booking an Appointment (`POST /api/appointments`)
- **Authorization:** `@PreAuthorize("hasAnyRole('ADMIN', 'RECEPTIONIST', 'PATIENT')")`
- **Request Body (`AppointmentCreateRequest`):**
  ```json
  {
    "doctorId": "uuid",
    "patientId": "uuid",
    "slotStart": "2026-11-13T04:30:00Z",
    "reason": "Routine hypertension follow-up"
  }
  ```
- **Response (`201 Created`):** `AppointmentResponse`

#### C. Receptionist Status Transitions (`PATCH /api/appointments/{id}/status`)
- **Authorization:** Controlled by `StatusTransitionService.java`
- **Request Body (`AppointmentStatusUpdateRequest`):**
  ```json
  {
    "status": "CHECKED_IN",
    "reason": "Patient arrived at reception desk"
  }
  ```
- **Allowed Transitions for `RECEPTIONIST`:**
  1. **Check-In:** `BOOKED` → `CHECKED_IN`
     - Validates `clinicToday >= slotDate` (cannot check in before appointment day).
     - Increments atomic PostgreSQL `doctor_day_counters` sequence.
     - Sets `tokenNumber`, `checkedInAt = Instant.now()`.
     - Publishes `QueueChangedDomainEvent(TOKEN_ISSUED)` over STOMP.
  2. **Cancellation:** `BOOKED` → `CANCELLED`
     - Requires `slotStart > now + 2 hours` (`CANCELLATION_WINDOW_CLOSED` otherwise).
     - Records `cancellationReason`.
  3. **No-Show:** `BOOKED` → `NO_SHOW`
     - Allowed once `now >= slotStart`.

---

### 3.4 Queue Management & Real-Time WebSocket

#### A. REST Queue Endpoints (`/api/queue`)
- `GET /api/queue/board?clinicId={clinicId}`: Public live waiting board grouped by doctor (`QueueBoardResponse`).
- `GET /api/queue/doctors/{doctorId}`: Authenticated (`ADMIN`, `RECEPTIONIST`, `DOCTOR`). Returns detailed `QueueStateResponse` including `nowServing` (QueueEntry), `next` (List<QueueEntry> with patientName, slotStart, tokenNumber), `waitingCount`, and `lastTokenIssued`.
- `POST /api/queue/doctors/{doctorId}/call-next`: Authorized for `DOCTOR` and `RECEPTIONIST`. Advances the lowest-token waiting patient to `IN_CONSULTATION`.

#### B. WebSocket Architecture
- **Transport:** `/ws` with SockJS fallback (`ws://localhost:8080/ws/websocket`).
- **Broker Prefix:** `/topic`
- **Topic Subscription:** `/topic/queue/{doctorId}` (pattern: `^/topic/queue/[A-Za-z0-9-]+$`).
- **Permissions:** Read-only public STOMP subscription (zero PII; only token integers broadcasted).
- **Client Frames:** All client `SEND` frames are rejected by `WebSocketSecurityConfig`.
- **Payload (`QueueUpdateMessage`):**
  ```json
  {
    "type": "QUEUE_UPDATED",
    "event": "TOKEN_ISSUED", // or "PATIENT_CALLED", "CONSULTATION_COMPLETED"
    "doctorId": "uuid",
    "clinicId": "uuid",
    "date": "2026-11-13",
    "nowServing": 1,
    "next": [2, 3, 4],
    "waitingCount": 3,
    "lastTokenIssued": 4,
    "sentAt": "2026-11-13T09:30:00Z"
  }
  ```

---

## 4. Frontend Architecture & Receptionist Navigation

### 4.1 Route Map (`/receptionist/*`)

The receptionist dashboard will be organized inside `src/features/receptionist/` and wired into React Router 7:

```
/receptionist
├── /dashboard           Receptionist Overview & Operational KPIs
├── /patients            Patient Directory & Search
├── /patients/register   Patient Intake & Registration
├── /appointments        Appointment Roster & Daily Operations
├── /appointments/book   Slot Booking Desk
├── /check-in            Dedicated Patient Arrival & Queue Token Issuance
├── /queue               Live Queue Room & WebSocket Monitor
└── /doctors             Doctor Schedules & Availability Matrix
```

### 4.2 Sidebar Navigation Structure (Exact 8 Sections per Step 2)

1. **Overview** (`/receptionist/dashboard`) — Icon: `LayoutDashboard`
2. **Patients** (`/receptionist/patients`) — Icon: `Users`
3. **Register Patient** (`/receptionist/patients/register`) — Icon: `UserPlus`
4. **Appointments** (`/receptionist/appointments`) — Icon: `Calendar`
5. **Book Appointment** (`/receptionist/appointments/book`) — Icon: `CalendarPlus`
6. **Check-in** (`/receptionist/check-in`) — Icon: `CheckCircle2`
7. **Queue Management** (`/receptionist/queue`) — Icon: `Clock`
8. **Doctor Availability** (`/receptionist/doctors`) — Icon: `Stethoscope`

### 4.3 Real Data Strategy for Overview Dashboard (Zero Mocks)

Since `/api/reports/*` returns 403 Forbidden for receptionists, the Overview KPIs will be computed authoritatively from real transactional endpoints:
1. `GET /api/appointments?from={todayStartUtc}&to={todayEndUtc}&size=100`:
   - `Today's Appointments`: Total array count
   - `Checked-In Patients`: Status `CHECKED_IN`
   - `In Consultation`: Status `IN_CONSULTATION`
   - `Completed Encounters`: Status `COMPLETED`
   - `Cancellations`: Status `CANCELLED`
   - `No Shows`: Status `NO_SHOW`
2. `GET /api/doctors`:
   - Active doctors count
3. `GET /api/queue/board?clinicId={clinicId}`:
   - Aggregated clinic waiting tokens and active consultations.

---

## 5. Security & Technical Constraints Checklist

- [x] **No TypeScript:** Pure JavaScript ES6+ (JSX) with JSDoc and Zod schemas.
- [x] **No Backend Modifications:** Zero changes to Java backend, Flyway migrations, or schema.
- [x] **Zero Mocks in Production Code:** Real HTTP APIs and live PostgreSQL data only.
- [x] **No Clinical Data Leakage:** Receptionists cannot view consultation notes, diagnoses, or prescriptions.
- [x] **Session Concurrency:** Use established `apiClient` with single-flight refresh Promise mutex.
- [x] **Audit Compliance:** `GET /api/patients/{id}` calls will trigger backend `PATIENT_READ` audit logs.
- [x] **Graceful WebSocket Degradation:** Automatic reconnect with polling query fallback if WebSocket fails.

---

## 6. Next Subphase

Proceed immediately to **Phase 21.1: Receptionist Layout, Navigation & Routing Configuration**.
