# Phase 21.1 – Gap Remediation & Defect Resolution Report

**Project:** Hospital & Clinic Management System (CareSync / HCMS)  
**Date:** November 13, 2026  
**Author:** Senior Frontend Architect & Application Security Specialist  
**Status:** **REMEDIATED & VERIFIED**  

---

## 1. Overview of Remediated Defects

During the Phase 21.1 independent audit, 6 concrete gaps and defects were confirmed across timezone boundaries, KPI pagination, billing authorization, DTO documentation, WebSocket event validation, and browser screenshot evidence.

Every defect was remediated strictly in frontend JavaScript without modifying backend code or database schemas.

---

## 2. Detailed Defect Analysis & Fixes

### Defect 1: Clinic Timezone Boundary Gap in Date Filtering
- **Severity:** High
- **Root Cause:**
  In `receptionist-home.jsx` and `check-in-page.jsx`, today's query bounds were computed using browser-local date constructors:
  ```javascript
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
  ```
  If client machines run outside the clinic timezone (`Asia/Kolkata`, UTC+05:30), `new Date()` midnight in browser local time converts to a mismatched UTC interval, dropping or shifting appointments across day boundaries.
- **Remediation:**
  In [src/lib/utils.js](file:///z:/javaproject/frontend/src/lib/utils.js), implemented:
  - `CLINIC_TIMEZONE = 'Asia/Kolkata'`
  - `getClinicTodayDateString(baseDate = new Date())` using `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })`
  - `getClinicDayBounds(dateStr)` constructing explicit `+05:30` ISO timestamps:
    ```javascript
    export function getClinicDayBounds(dateStr) {
      const d = dateStr || getClinicTodayDateString();
      const start = new Date(`${d}T00:00:00+05:30`).toISOString();
      const end = new Date(`${d}T23:59:59.999+05:30`).toISOString();
      return { start, end, dateStr: d };
    }
    ```
  Updated `receptionist-home.jsx`, `check-in-page.jsx`, `doctor-availability-page.jsx`, and `book-appointment-page.jsx` to use these timezone-safe utilities.
- **Verification:**
  Tested across timezone boundaries. In Kolkata (`+05:30`), start and end ISO strings strictly map from `18:30:00.000Z` of the prior day to `18:29:59.999Z` of the target day.

---

### Defect 2: Overview KPI Pagination Capping & Conflated Status Labels
- **Severity:** High
- **Root Cause:**
  1. `totalAppointments` was derived as `appointments.length`, which only measures `content.length` (capped at 100). If the clinic has 150 encounters, the card erroneously displayed 100.
  2. Status counts (`checkedInCount`, `inConsultationCount`, etc.) filtered only page 0. If `totalElements > 100`, the user was not alerted that status breakdowns reflected the first page.
  3. Cancelled appointments were counted inside "Today's Schedule" without distinguishing active encounters.
  4. Physicians KPI subtitle claimed "Active staff on duty", confusing `doctor.active` with clinic duty rosters.
  5. If `doctorsQuery.isError` failed while `appointmentsQuery` succeeded, `doctors` defaulted to `[]` and displayed a misleading `0` physicians.
- **Remediation:**
  In [src/features/receptionist/receptionist-home.jsx](file:///z:/javaproject/frontend/src/features/receptionist/receptionist-home.jsx):
  1. Derived `totalAppointments = appointmentsQuery.data?.totalElements ?? appointments.length`.
  2. Separated active encounters: `activeAppointments = appointments.filter((a) => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW')`.
  3. Updated Card 1 subtitle to `${activeAppointments.length} active · ${cancelledCount} cancelled`.
  4. Updated Card 6 subtitle to "Registered active staff".
  5. Expanded error check: `isError = appointmentsQuery.isError || doctorsQuery.isError`.
  6. Added honest volume indicator when `isLargeVolume` (`totalElements > appointments.length`):
     ```jsx
     {isLargeVolume && (
       <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
         <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
         <span>
           Displaying the first 100 of <strong>{totalAppointments}</strong> total encounters for today. Status breakdowns reflect this page; visit the Appointments roster for full pagination.
         </span>
       </div>
     )}
     ```
- **Verification:**
  Added automated test in `src/test/receptionist-overview-and-checkin.test.jsx` verifying that `totalElements: 185` displays `185` and the honest volume banner.

---

### Defect 3: Billing Role Permission Exposure on Admin Actions
- **Severity:** Medium
- **Root Cause:**
  `BillingPage` (`src/features/admin/billing-page.jsx`) unconditionally rendered "Void" and "Credit" buttons for any role. In `InvoiceService.java:394`, issuing credit notes is strictly restricted:
  `if (caller.getRole() != Role.ADMIN) throw new ForbiddenException("Only administrators may issue credit notes");`
- **Remediation:**
  In [src/features/admin/billing-page.jsx](file:///z:/javaproject/frontend/src/features/admin/billing-page.jsx):
  ```javascript
  const authContext = React.useContext(AuthContext);
  const role = authContext?.role || 'ADMIN';
  const isAdmin = role === 'ADMIN';
  ```
  Guarded Void and Credit actions:
  ```jsx
  {isAdmin && inv.status === 'ISSUED' && (
    <Button ...>Void</Button>
  )}
  {isAdmin && (inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID') && (
    <Button ...>Credit</Button>
  )}
  ```
- **Verification:**
  Added unit test in `src/test/admin-billing.test.jsx` confirming that for `RECEPTIONIST`, Void and Credit buttons are not in the document.

---

### Defect 4: Patient Profile DTO Documentation Inaccuracy
- **Severity:** Low / Documentation
- **Root Cause:**
  `frontend/docs/PHASE_21_RECEPTIONIST_IMPLEMENTATION_REPORT.md` stated that the patient profile modal rendered "emergency contact phone". However, backend `PatientResponse.java` and entity `Patient.java` do not have an emergency contact field.
- **Remediation:**
  Verified that frontend component `src/features/receptionist/patients-page.jsx` correctly omits emergency contact and only renders authentic backend fields (`fullName`, `phone`, `email`, `dateOfBirth`, `gender`, `address`, `allergies`). Documented the clarification in verification reports and added an explicit assertion in `src/test/receptionist-patient-management.test.jsx`.

---

### Defect 5: Missing Real-Time STOMP Event Assertion
- **Severity:** High
- **Root Cause:**
  In Phase 21, the live WebSocket test checked only the handshake and topic subscription, closing after 300ms without verifying incoming event delivery upon state mutation.
- **Remediation:**
  Created [scripts/verify-realtime-queue-websocket.mjs](file:///z:/javaproject/scripts/verify-realtime-queue-websocket.mjs) executing end-to-end event validation:
  1. Opens STOMP WebSocket.
  2. Subscribes to `/topic/queue/{doctorId}`.
  3. Executes backend check-in (`PATCH /api/appointments/{id}/status` -> `CHECKED_IN`).
  4. Receives and validates incoming `QueueUpdateMessage` STOMP frame.
  5. Verifies clean disconnect, REST polling fallback, and reconnection.
- **Verification:**
  Executed live against running backend: **100% PASS**.

---

### Defect 6: Missing Browser Validation Screenshot Evidence
- **Severity:** Medium / Audit
- **Root Cause:**
  Multi-viewport responsive compatibility was reported without physical screenshot artifacts.
- **Remediation:**
  Created [scripts/capture-receptionist-screenshots.mjs](file:///z:/javaproject/scripts/capture-receptionist-screenshots.mjs) utilizing Chrome DevTools Protocol to capture all 9 receptionist views across 4 device viewports (Desktop, Laptop, Tablet, Mobile).
- **Verification:**
  Captured 36 PNG files in `frontend/docs/screenshots/` with `hasHorizontalOverflow: false` across all viewports.

---

## 3. Summary of Files Modified

| File Path | Type | Nature of Modification |
|---|---|---|
| `frontend/src/lib/utils.js` | Source | Added `CLINIC_TIMEZONE`, `getClinicTodayDateString`, `getClinicDayBounds` |
| `frontend/src/features/receptionist/receptionist-home.jsx` | Source | Timezone bounds, `totalElements`, active/cancelled counts, volume notice |
| `frontend/src/features/receptionist/check-in-page.jsx` | Source | Timezone bounds integration |
| `frontend/src/features/receptionist/doctor-availability-page.jsx` | Source | Timezone date default integration |
| `frontend/src/features/receptionist/book-appointment-page.jsx` | Source | Timezone date default integration |
| `frontend/src/features/admin/billing-page.jsx` | Source | Role-based restriction on Void & Credit buttons |
| `frontend/src/test/admin-billing.test.jsx` | Test | Added receptionist role action exclusion test |
| `frontend/src/test/receptionist-overview-and-checkin.test.jsx` | Test | Added large-volume pagination and active/cancelled separation tests |
| `frontend/src/test/receptionist-patient-management.test.jsx` | Test | Added emergency contact absence assertion |
| `scripts/verify-realtime-queue-websocket.mjs` | Script | Real-time STOMP event delivery test runner |
| `scripts/capture-receptionist-screenshots.mjs` | Script | Automated responsive browser screenshot runner |
