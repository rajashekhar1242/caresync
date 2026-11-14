# CareSync HCMS — Recruiter Portfolio & Demo Walkthrough Guide

Welcome to the **CareSync** portfolio demonstration. This guide is tailored for engineering hiring managers, technical recruiters, and system architects to quickly explore and evaluate the system's technical capabilities, full-stack workflows, and engineering quality.

---

## 1. Quick Demo Setup (3 Minutes)

Ensure PostgreSQL, Backend, and Frontend are running as described in the [Local Development Guide](DEVELOPMENT.md):

```powershell
# 1. Start Database
docker compose up -d

# 2. Start Spring Boot Backend (in terminal 1)
cd backend; .\mvnw.cmd spring-boot:run

# 3. Start React Frontend (in terminal 2)
cd frontend; npm run dev
```

Navigate to `http://localhost:5173/` in your browser. The login screen includes **Role Quick-Fill Buttons** to instantly log in as any role without manual credential entry.

---

## 2. Synthetic Demo Personas

All demo accounts represent realistic synthetic healthcare data:

| Role | Name & Specialty | Email Identifier | Core Capabilities to Explore |
| :--- | :--- | :--- | :--- |
| **ADMIN** | System Administrator | `admin@caresync.local` | Executive dashboard, doctor management, department setup, financial analytics, immutable audit logs |
| **RECEPTIONIST** | Front Desk Receptionist | `reception@caresync.local` | Walk-in patient registration, doctor availability, appointment booking, patient check-in, live queue desk, counter billing |
| **DOCTOR** | Dr. Sarah Jenkins *(Cardiology)* | `dr.jenkins@caresync.local` | Queue coordination (`call-next`), clinical encounter notes, vitals entry, drug-safety checker, prescription authoring & PDF generation |
| **DOCTOR** | Dr. Raj Patel *(Pediatrics)* | `dr.patel@caresync.local` | Pediatric consultations, schedule management, leave requests |
| **PATIENT** | John Doe | `john.doe@example.com` | Self-booking appointment, medical timeline, active prescriptions, billing payments, profile management |
| **PATIENT** | Eleanor Vance | `eleanor.vance@example.com` | Documented penicillin allergy test case for clinical safety engine |

---

## 3. End-to-End Clinical & Operational Walkthroughs

### Walkthrough 1: Outpatient Arrival to Consultation (Cross-Role)
This workflow demonstrates real-time coordination between Reception, Waiting Room, and Physician:

1. **Reception Check-In (`RECEPTIONIST`):**
   - Click the **Receptionist** demo button and sign in.
   - Go to **Check-In Desk**. You will see today's arriving patients.
   - Click **Check In** on patient John Doe.
   - *Behind the Scenes:* The state machine transitions `BOOKED -> CHECKED_IN`, atomically claims the next daily token (`Token #1`) via `DoctorDayCounter`, and fires a post-commit STOMP event.
2. **Public Waiting Room Display:**
   - In a private/incognito window, open `http://localhost:5173/queue-board` (or navigate via Receptionist Queue menu).
   - Notice that John Doe's token appears immediately as `Token #1 — Waiting`.
   - *Engineering Highlight:* The payload is strictly zero-PII. No patient names or clinical reasons are exposed on public displays.
3. **Clinical Consultation (`DOCTOR`):**
   - Log out and click **Doctor** (`Dr. Sarah Jenkins`).
   - Navigate to **Live Queue**. Notice John Doe is waiting at position #1.
   - Click **Call Next**. The appointment transitions to `IN_CONSULTATION`.
   - Enter clinical vitals: `Blood Pressure: 120/80 mmHg`, `Pulse: 72 bpm`, `Temperature: 98.6°F`, `SpO2: 99%`.
   - Enter diagnosis: `Essential Hypertension — Well Controlled`.
   - Click **Save Consultation**.
4. **Prescription & Safety Screening:**
   - In the prescription section, add medication `Amlodipine 5mg` (Once daily, 30 days).
   - Click **Verify Drug Safety**. The safety engine verifies zero allergy conflicts against the patient's record.
   - Click **Issue Prescription**.
   - Click **Download Prescription PDF** to view the formatted A4 medical document generated on-the-fly via OpenPDF.
5. **Encounter Completion:**
   - Click **Complete Consultation**.
   - *Behind the Scenes:* The appointment status transitions to `COMPLETED`. An event listener invokes `AppointmentBillingPort`, automatically generating an invoice for the consultation fee.

---

### Walkthrough 2: Automated Invoicing to Counter Settlement
This workflow demonstrates exact-decimal financial processing:

1. **Open Receptionist Billing Desk (`RECEPTIONIST`):**
   - Switch back to Receptionist and navigate to **Billing & Invoices**.
   - Locate the newly generated invoice for John Doe's completed consultation (`INV-DEMO-...`).
   - Notice the status is `UNPAID` with balance due `₹600.00`.
2. **Accept Counter Payment:**
   - Click **Record Payment**.
   - Select payment method: `UPI` (or `CASH`).
   - Enter transaction reference: `UPI-TEST-12345`.
   - Submit payment.
   - *Behind the Scenes:* The backend acquires a `PESSIMISTIC_WRITE` lock on the invoice row, records the payment, updates `paid_amount`, and transitions invoice status to `PAID`.
3. **Generate Official Invoice Receipt:**
   - Click **Download Invoice PDF** to view the generated receipt.

---

### Walkthrough 3: Clinical Safety Engine (Allergy Conflict Catch)
Demonstrates medical safety checks preventing medical error:

1. Log in as **Dr. Sarah Jenkins** (`DOCTOR`).
2. Open consultation for patient **Eleanor Vance** (who has a recorded `Penicillin` allergy).
3. Attempt to prescribe `Amoxicillin 500mg`.
4. Click **Verify Drug Safety**:
   - The engine flags a **SEVERE ALLERGY WARNING**: `"Patient has documented allergy to Penicillin which cross-reacts with Amoxicillin."`
   - Prescription issuance is locked until the physician explicitly reviews and submits a documented clinical acknowledgement flag.

---

### Walkthrough 4: Executive Oversight & Immutable Compliance Trail (`ADMIN`)

1. Log in as **Admin** (`admin@caresync.local`).
2. **Executive Analytics:** Navigate to **Reports & Analytics**. View real-time SQL-aggregated metrics:
   - Monthly revenue figures by clinic department.
   - Doctor consultation load rankings.
   - Clinic appointment no-show rates.
3. **Compliance Audit Trail:** Navigate to **Audit Logs**.
   - Search by action `LOGIN_SUCCESS`, `CONSULTATION_SAVED`, or `PAYMENT_RECEIVED`.
   - Observe the immutable record of who performed each action, from which IP address, and at what exact UTC millisecond.
   - *Engineering Highlight:* This table is protected by PostgreSQL trigger `protect_audit_logs_append_only`, ensuring audit records cannot be deleted even by administrators.

---

## 4. Key Engineering Details to Inspect

When evaluating the code in your IDE or browser DevTools:

- **Network Tab (Refresh Mutex):** Inspect `frontend/src/services/api.js`. Notice how multiple concurrent requests during session renewal are queued and resolved with a single refresh call.
- **WebSocket Frames:** In DevTools Network > WS, inspect frames on `/ws`. Observe the clean STOMP frames and zero-PII queue updates.
- **Database Migrations:** Inspect `backend/src/main/resources/db/migration/V1__V12`. Review the partial index `uq_appointment_slot_active` in `V9` and the audit trigger in `V12`.
- **Domain Decoupling:** Inspect `backend/src/main/java/com/caresync/appointment/service/AppointmentBillingPort.java`. Notice how the appointment domain interacts with billing via interface segregation.
