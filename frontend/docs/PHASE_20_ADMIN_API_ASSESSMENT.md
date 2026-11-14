# Phase 20: Admin API Reconnaissance & Assessment Report

**Project:** Hospital & Clinic Management System (HCMS / CareSync)  
**Role:** Senior Frontend Architect & Spring Boot Integration Engineer  
**Date:** 2026-11-13  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

This reconnaissance assessment identifies all available and unavailable backend endpoints for the **Phase 20 Admin Dashboard**. Every endpoint, HTTP method, query parameter, request body, and response DTO documented below has been verified directly in the Spring Boot 4.1.2 backend source code (`backend/src/main/java/com/caresync/`) and the OpenAPI specification (`docs/openapi.yaml`).

Under no circumstances does the frontend invent fake endpoints or fabricated datasets. Missing capabilities (such as generic staff management or application configuration endpoints) are explicitly flagged as unavailable so that the UI can present appropriate "Not yet available" state indicators rather than mock interfaces.

---

## 2. Admin API Endpoint Inventory

| Feature | Actual Endpoint | HTTP Method | Required Role | Request / Query DTO | Response DTO | Integration Status |
|---|---|---|---|---|---|---|
| **Dashboard Summary** | `/api/reports/dashboard` | `GET` | `ADMIN` | `clinicId?` (UUID) | `DashboardSummaryResponse` | **Available** |
| **Revenue Report** | `/api/reports/revenue` | `GET` | `ADMIN` | `from`, `to`, `clinicId?`, `groupBy=DAY` (DAY/WEEK/MONTH) | `RevenueReportResponse` | **Available** |
| **Dept Appointments** | `/api/reports/appointments-by-department` | `GET` | `ADMIN` | `from`, `to`, `clinicId?` | `AppointmentsByDepartmentResponse` | **Available** |
| **No-Show Rate Report** | `/api/reports/no-show-rate` | `GET` | `ADMIN` | `from`, `to`, `clinicId?` | `NoShowRateResponse` | **Available** |
| **Top Doctors Report** | `/api/reports/top-doctors` | `GET` | `ADMIN` | `from`, `to`, `clinicId?`, `rankBy`, `limit` (1-20) | `TopDoctorsResponse` | **Available** |
| **Departments: List** | `/api/departments` | `GET` | Authenticated | None | `List<DepartmentResponse>` | **Available** |
| **Departments: Create** | `/api/departments` | `POST` | `ADMIN` | `DepartmentRequest` (`name`, `description?`) | `DepartmentResponse` (201 Created) | **Available** |
| **Departments: Update** | `/api/departments/{id}` | `PUT` | `ADMIN` | `DepartmentRequest` (`name`, `description?`) | `DepartmentResponse` (200 OK) | **Available** |
| **Departments: Delete** | `/api/departments/{id}` | `DELETE` | N/A | None | None | **Unavailable** (Backend has no delete endpoint) |
| **Doctors: List** | `/api/doctors` | `GET` | Authenticated | `specializationId?`, `clinicId?`, `name?`, `page`, `size`, `sort` | `PageResponse<DoctorResponse>` | **Available** |
| **Doctors: Create** | `/api/doctors` | `POST` | `ADMIN` | `DoctorCreateRequest` | `DoctorResponse` (201 Created) | **Available** |
| **Doctors: Get Details** | `/api/doctors/{id}` | `GET` | Authenticated | None | `DoctorResponse` (200 OK) | **Available** |
| **Doctors: Update** | `/api/doctors/{id}` | `PUT` | `ADMIN` | `DoctorUpdateRequest` (`active` toggle) | `DoctorResponse` (200 OK) | **Available** |
| **Doctors: Delete** | `/api/doctors/{id}` | `DELETE` | N/A | None | None | **Unavailable** (Soft toggle via active flag in PUT) |
| **Specializations: List** | `/api/specializations` | `GET` | Authenticated | None | `List<SpecializationResponse>` | **Available** |
| **Clinics: List** | `/api/clinics` | `GET` | Authenticated | None | `List<ClinicResponse>` | **Available** |
| **Staff Management** | `/api/staff` or `/api/users` | N/A | N/A | N/A | N/A | **Unavailable** (Only bootstrap runner exists; no generic user CRUD) |
| **Appointments: List** | `/api/appointments` | `GET` | `ADMIN` (unrestricted) | `doctorId?`, `patientId?`, `status?`, `from?`, `to?`, `page`, `size`, `sort` | `PageResponse<AppointmentResponse>` | **Available** |
| **Appointments: Get Details** | `/api/appointments/{id}` | `GET` | `ADMIN` | None | `AppointmentResponse` | **Available** |
| **Appointments: Cancel** | `/api/appointments/{id}/status` | `PATCH` | `ADMIN` | `AppointmentStatusUpdateRequest` (`status: CANCELLED`, `reason?`) | `AppointmentResponse` | **Available** |
| **Patients: Search / List** | `/api/patients` | `GET` | `ADMIN`, `RECEPTIONIST`, `DOCTOR` | `phone?`, `name?`, `page`, `size` | `PageResponse<PatientSummary>` | **Available** |
| **Patients: Get Details** | `/api/patients/{id}` | `GET` | `ADMIN`, `RECEPTIONIST`, `DOCTOR`, `PATIENT` | None | `PatientResponse` | **Available** |
| **Patients: Create** | `/api/patients` | `POST` | `ADMIN`, `RECEPTIONIST` | `PatientRequest` | `PatientResponse` (201 Created) | **Available** |
| **Patients: Update** | `/api/patients/{id}` | `PUT` | `ADMIN`, `RECEPTIONIST`, `PATIENT` | `PatientRequest` | `PatientResponse` (200 OK) | **Available** |
| **Patients: Delete** | `/api/patients/{id}` | `DELETE` | N/A | None | None | **Unavailable** (Medical record retention prohibits patient deletion) |
| **Invoices: List** | `/api/invoices` | `GET` | `ADMIN`, `RECEPTIONIST`, `PATIENT` | `status?`, `patientId?`, `from?`, `to?`, `page`, `size` | `PageResponse<InvoiceSummary>` | **Available** |
| **Invoices: Get Details** | `/api/invoices/{id}` | `GET` | `ADMIN`, `RECEPTIONIST`, `PATIENT` | None | `InvoiceResponse` | **Available** |
| **Invoices: PDF Download** | `/api/invoices/{id}/pdf` | `GET` | `ADMIN`, `RECEPTIONIST`, `PATIENT` | None | `application/pdf` binary | **Available** |
| **Invoices: Void** | `/api/invoices/{id}/void` | `POST` | `ADMIN` | `VoidInvoiceRequest` (`reason`) | `InvoiceResponse` (200 OK) | **Available** |
| **Invoices: Credit Note** | `/api/invoices/{id}/credit-notes` | `POST` | `ADMIN` | `CreditNoteRequest` (`amount`, `reason`) | `CreditNoteResponse` (201 Created) | **Available** |
| **Audit Logs: List** | `/api/audit-logs` | `GET` | `ADMIN` | `userId?`, `action?`, `entityType?`, `from?`, `to?`, `page`, `size` | `PageResponse<AuditLogResponse>` | **Available** |
| **Settings** | `/api/settings` | N/A | N/A | N/A | N/A | **Unavailable** (No settings endpoint in backend) |

---

## 3. Detailed Data Contract Findings

### 3.1 Overview & Reports Contracts
- **`GET /api/reports/dashboard` (`DashboardSummaryResponse`)**:
  - `today`: `LocalDate` (clinic local date).
  - `appointmentsToday`: `AppointmentCounts` (`total`, `booked`, `checkedIn`, `inConsultation`, `completed`, `cancelled`, `noShow`).
  - `waitingNow`: `long` (number of checked-in patients awaiting consultation).
  - `activeDoctors`: `long`.
  - `collectedToday`: `String` (decimal format e.g. `"1500.00"`).
  - `collectedThisMonth`: `String` (decimal format e.g. `"45000.00"`).
  - `outstandingBalance`: `String` (uncollected balances on open invoices).
  - `unpaidInvoiceCount`: `long`.
  - `currency`: Enum (`INR`, `USD`, `EUR`, `GBP`).

- **`GET /api/reports/revenue` (`RevenueReportResponse`)**:
  - `totals`: `RevenueFigures` (`invoiced`, `collected`, `credited`, `net`).
  - `buckets`: `List<RevenueBucket>` where each bucket has `period`, `invoiceCount`, `invoiced`, `collected`, `credited`, `net`.
  - Allows grouping by `DAY`, `WEEK`, or `MONTH`.

- **`GET /api/reports/appointments-by-department` (`AppointmentsByDepartmentResponse`)**:
  - `departments`: `List<DepartmentAppointmentCounts>` containing `departmentId`, `departmentName`, `total`, `booked`, `checkedIn`, `inConsultation`, `completed`, `cancelled`, `noShow`.

### 3.2 Department Contract
- `DepartmentResponse`: `{ id, name, description }`.
- `DepartmentRequest`: `{ name: string (2-100 chars), description?: string (max 500 chars) }`.
- Note: Department creation fails with `409 DEPARTMENT_NAME_EXISTS` if a duplicate case-insensitive name is provided.

### 3.3 Doctor Contract
- `DoctorResponse`: `{ id, userId, fullName, specializationId, clinicId, departmentId, consultationFee, slotMinutes, active }`.
- Contact fields (`email`, `phone`) are intentionally omitted from `DoctorResponse` in the backend.
- Creation requires `{ fullName, email, password, phone?, specializationId, clinicId, departmentId, consultationFee, slotMinutes }`.
- Updating requires `{ fullName, phone?, specializationId, clinicId, departmentId, consultationFee, slotMinutes, active }`.

### 3.4 Appointment Monitoring Contract
- `AppointmentResponse`: `{ id, doctorId, doctorName, patientId, patientName, clinicId, timeZone, slotStart, slotEnd, status, reason, cancellationReason, tokenNumber, createdAt, updatedAt }`.
- `status` values: `BOOKED`, `CHECKED_IN`, `IN_CONSULTATION`, `COMPLETED`, `CANCELLED`, `NO_SHOW`.
- Admin cancellation: `PATCH /api/appointments/{id}/status` with `{ status: "CANCELLED", reason: "Administrative cancellation" }`.

### 3.5 Patient Management Contract
- `PatientSummary`: `{ id, fullName, phone, dateOfBirth, gender }`.
- `PatientResponse`: `{ id, userId, fullName, dateOfBirth, gender, phone, email, address, allergies: string[], createdAt, updatedAt }`.
- `PatientRequest`: `{ fullName, phone, email?, dateOfBirth, gender, address?, allergies?: string[] }`.

### 3.6 Billing & Financial Contract
- `InvoiceSummary`: `{ id, invoiceNumber, appointmentId, patientId, patientName, clinicId, totalAmount, amountPaid, balanceDue, status, createdAt }`.
- Financial Semantics:
  - `invoiced` represents the billed amount.
  - `collected` / `amountPaid` represents actual payments collected.
  - `balanceDue` is the remaining unpaid portion.
  - `credited` represents refund/credit note amounts.

### 3.7 Audit Log Contract
- `AuditLogResponse`: `{ id, occurredAt, userId, userName, userRole, action, entityType, entityId, patientId, details, ipAddress }`.
- Standard pagination with 0-indexed `page` and `size`.

---

## 4. Architectural Strategy for Missing Capabilities

1. **Staff Management (`/admin/staff` or `/admin/users`)**:
   - The backend contains a bootstrap runner (`StaffAccountBootstrapRunner`) for the static seed accounts (`admin@caresync.com`, `doctor@caresync.com`, `receptionist@caresync.com`), but no generic staff administration REST controller or table.
   - The UI will display a clean "Staff Management Not Available" banner explaining that staff provisioning is currently managed via database migration and bootstrap scripts, with a future REST capability planned.
2. **Settings (`/admin/settings`)**:
   - The UI will provide an informative system settings view showing active application metadata (environment, version, connected clinic timezone, security policy), while marking dynamic config edits as "Read-only in current release".
3. **Department Deletion**:
   - The Department UI will support Create and Edit actions, but omit Delete actions as the backend lacks a DELETE endpoint (departments have foreign key constraints with doctors and appointments).

---

## 5. Next Steps

Proceed directly to:
1. Update Sidebar and Router to link all 10 Admin sections with dedicated routes and active highlighting.
2. Build API service modules in `src/services/` for Admin (`reports.service.js`, `departments.service.js`, `doctors.service.js`, `appointments.service.js`, `patients.service.js`, `billing.service.js`, `audit.service.js`).
3. Build TanStack Query hooks in `src/hooks/` for each service.
4. Implement Overview dashboard with real KPI cards and Recharts visualizations using `/api/reports/dashboard`, `/api/reports/revenue`, and `/api/reports/appointments-by-department`.
5. Implement Department Management (`/admin/departments`), Doctor Management (`/admin/doctors`), Appointment Monitoring (`/admin/appointments`), Patient Directory (`/admin/patients`), Billing & Revenue (`/admin/billing`), Reports (`/admin/reports`), Audit Logs (`/admin/audit-logs`), Staff Notice (`/admin/staff`), and Settings (`/admin/settings`).
6. Comprehensive testing and verification.
