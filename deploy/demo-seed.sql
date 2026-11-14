-- =============================================================================
-- CareSync Hospital & Clinic Management System (HCMS)
-- Synthetic Demonstration Seed Script
-- Path: deploy/demo-seed.sql
--
-- PURPOSE:
-- Safely seeds realistic synthetic clinical demonstration data into an existing
-- CareSync database for portfolio evaluation and recruiter walkthroughs.
--
-- INVARIANTS & SAFETY:
-- 1. All records use deterministic synthetic UUIDs with ON CONFLICT DO NOTHING.
-- 2. Fully idempotent: safe to execute multiple times without overwriting data.
-- 3. Passwords use '!LOCKED_REQUIRES_BOOTSTRAP!' sentinel. Credentials are
--    activated on startup via environment variables (e.g. CARESYNC_DEMO_DOCTOR_PASSWORD)
--    or set dynamically through the Admin Portal and registration flows.
-- 4. No plaintext credentials or password hashes are stored in this script.
-- 5. Appointments use dynamic timestamps relative to current clinic day/hour so
--    the queue and arrival desk remain active whether evaluated morning or evening.
-- 6. Enforces PostgreSQL 16+ compatibility and assumes Flyway V1-V12 have run.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Doctor & Patient User Accounts (Identity Module)
-- -----------------------------------------------------------------------------
-- Uses '!LOCKED_REQUIRES_BOOTSTRAP!' sentinel. Passwords remain locked until
-- configured via environment variables or set by the user/administrator.
INSERT INTO users (id, email, password_hash, full_name, role)
VALUES
    -- Doctor 1: Dr. Sarah Jenkins (Cardiology)
    ('00000000-0000-4000-8000-000000000101', 'dr.jenkins@caresync.local',
     '!LOCKED_REQUIRES_BOOTSTRAP!', 'Dr. Sarah Jenkins', 'DOCTOR'),

    -- Doctor 2: Dr. Raj Patel (Pediatrics)
    ('00000000-0000-4000-8000-000000000102', 'dr.patel@caresync.local',
     '!LOCKED_REQUIRES_BOOTSTRAP!', 'Dr. Raj Patel', 'DOCTOR'),

    -- Patient 1: John Doe
    ('00000000-0000-4000-8000-000000000201', 'john.doe@example.com',
     '!LOCKED_REQUIRES_BOOTSTRAP!', 'John Doe', 'PATIENT'),

    -- Patient 2: Eleanor Vance
    ('00000000-0000-4000-8000-000000000202', 'eleanor.vance@example.com',
     '!LOCKED_REQUIRES_BOOTSTRAP!', 'Eleanor Vance', 'PATIENT')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Doctor Profiles & Clinical Schedules (Doctor Module)
-- -----------------------------------------------------------------------------
-- Dr. Sarah Jenkins: Cardiology at CareSync Banjara Hills
INSERT INTO doctors (id, user_id, specialization_id, clinic_id, department_id, phone, consultation_fee, slot_minutes, active)
VALUES
    ('d0c70000-0000-4000-8000-000000000001',
     '00000000-0000-4000-8000-000000000101',
     'b1000000-0000-4000-8000-000000000001', -- Cardiology
     'a1b2c3d4-0000-4000-8000-000000000001', -- CareSync Banjara Hills
     'c1000000-0000-4000-8000-000000000001', -- Cardiology Department
     '+91-98480-12345',
     600.00,
     15,
     TRUE)
ON CONFLICT (id) DO NOTHING;

-- Dr. Raj Patel: Pediatrics at CareSync Jubilee Hills
INSERT INTO doctors (id, user_id, specialization_id, clinic_id, department_id, phone, consultation_fee, slot_minutes, active)
VALUES
    ('d0c70000-0000-4000-8000-000000000002',
     '00000000-0000-4000-8000-000000000102',
     'b1000000-0000-4000-8000-000000000008', -- Pediatrics
     'a1b2c3d4-0000-4000-8000-000000000002', -- CareSync Jubilee Hills
     'c1000000-0000-4000-8000-000000000004', -- Pediatrics Department
     '+91-98480-67890',
     500.00,
     15,
     TRUE)
ON CONFLICT (id) DO NOTHING;

-- Weekly Schedules (Monday-Friday, 08:00 - 20:00)
INSERT INTO schedule_entries (id, doctor_id, day_of_week, start_time, end_time)
VALUES
    ('e0010000-0000-4000-8000-000000000001', 'd0c70000-0000-4000-8000-000000000001', 'MONDAY', '08:00:00', '20:00:00'),
    ('e0010000-0000-4000-8000-000000000002', 'd0c70000-0000-4000-8000-000000000001', 'TUESDAY', '08:00:00', '20:00:00'),
    ('e0010000-0000-4000-8000-000000000003', 'd0c70000-0000-4000-8000-000000000001', 'WEDNESDAY', '08:00:00', '20:00:00'),
    ('e0010000-0000-4000-8000-000000000004', 'd0c70000-0000-4000-8000-000000000001', 'THURSDAY', '08:00:00', '20:00:00'),
    ('e0010000-0000-4000-8000-000000000005', 'd0c70000-0000-4000-8000-000000000001', 'FRIDAY', '08:00:00', '20:00:00'),
    ('e0010000-0000-4000-8000-000000000006', 'd0c70000-0000-4000-8000-000000000001', 'SATURDAY', '08:00:00', '20:00:00'),
    ('e0010000-0000-4000-8000-000000000007', 'd0c70000-0000-4000-8000-000000000001', 'SUNDAY', '08:00:00', '20:00:00'),
    ('e0020000-0000-4000-8000-000000000001', 'd0c70000-0000-4000-8000-000000000002', 'MONDAY', '08:00:00', '20:00:00'),
    ('e0020000-0000-4000-8000-000000000002', 'd0c70000-0000-4000-8000-000000000002', 'TUESDAY', '08:00:00', '20:00:00'),
    ('e0020000-0000-4000-8000-000000000003', 'd0c70000-0000-4000-8000-000000000002', 'WEDNESDAY', '08:00:00', '20:00:00'),
    ('e0020000-0000-4000-8000-000000000004', 'd0c70000-0000-4000-8000-000000000002', 'THURSDAY', '08:00:00', '20:00:00'),
    ('e0020000-0000-4000-8000-000000000005', 'd0c70000-0000-4000-8000-000000000002', 'FRIDAY', '08:00:00', '20:00:00'),
    ('e0020000-0000-4000-8000-000000000006', 'd0c70000-0000-4000-8000-000000000002', 'SATURDAY', '08:00:00', '20:00:00'),
    ('e0020000-0000-4000-8000-000000000007', 'd0c70000-0000-4000-8000-000000000002', 'SUNDAY', '08:00:00', '20:00:00')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Patient Clinical Profiles (Patient Module)
-- -----------------------------------------------------------------------------
INSERT INTO patients (id, user_id, full_name, date_of_birth, gender, phone, email, address, allergies)
VALUES
    ('ba710000-0000-4000-8000-000000000001',
     '00000000-0000-4000-8000-000000000201',
     'John Doe',
     '1985-06-15',
     'MALE',
     '+91-98765-43210',
     'john.doe@example.com',
     'Flat 402, Green Meadows, Banjara Hills, Hyderabad',
     '{}'),

    ('ba710000-0000-4000-8000-000000000002',
     '00000000-0000-4000-8000-000000000202',
     'Eleanor Vance',
     '1992-05-14',
     'FEMALE',
     '+91-98765-11223',
     'eleanor.vance@example.com',
     'Plot 12, Hill View Enclave, Jubilee Hills, Hyderabad',
     '{"Penicillin"}')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Sample Clinical Workflow: Completed Visit, Consultation & Rx
-- -----------------------------------------------------------------------------
-- Appointment 1: Completed cardiology appointment for John Doe
INSERT INTO appointments (
    id, doctor_id, patient_id, clinic_id,
    slot_start, slot_end, status, reason,
    token_number, checked_in_at, created_at, updated_at, version
) VALUES (
    'a9970000-0000-4000-8000-000000000001',
    'd0c70000-0000-4000-8000-000000000001', -- Dr. Jenkins
    'ba710000-0000-4000-8000-000000000001', -- John Doe
    'a1b2c3d4-0000-4000-8000-000000000001', -- Banjara Hills
    TIMESTAMPTZ '2026-11-10 10:00:00+05:30',
    TIMESTAMPTZ '2026-11-10 10:15:00+05:30',
    'COMPLETED',
    'Routine cardiology follow-up and blood pressure check',
    1,
    TIMESTAMPTZ '2026-11-10 09:45:00+05:30',
    TIMESTAMPTZ '2026-11-09 14:00:00+05:30',
    TIMESTAMPTZ '2026-11-10 10:30:00+05:30',
    1
) ON CONFLICT (id) DO NOTHING;

-- Consultation Record
INSERT INTO consultations (
    id, appointment_id, patient_id, doctor_id,
    vitals_blood_pressure, vitals_pulse, vitals_temperature, vitals_weight_kg, vitals_spo2,
    symptoms, diagnosis, notes, follow_up_date, finalized_at, created_at, updated_at
) VALUES (
    'c0450000-0000-4000-8000-000000000001',
    'a9970000-0000-4000-8000-000000000001',
    'ba710000-0000-4000-8000-000000000001',
    'd0c70000-0000-4000-8000-000000000001',
    '120/80',
    72,
    36.8,
    70.5,
    98,
    'Occasional mild fatigue and slight dizziness upon waking.',
    'Stage 1 Essential Hypertension (controlled).',
    'Dietary sodium reduction advised. Continue moderate aerobic exercise.',
    DATE '2026-12-10',
    TIMESTAMPTZ '2026-11-10 10:25:00+05:30',
    TIMESTAMPTZ '2026-11-10 10:15:00+05:30',
    TIMESTAMPTZ '2026-11-10 10:25:00+05:30'
) ON CONFLICT (id) DO NOTHING;

-- Prescription Header
INSERT INTO prescriptions (
    id, consultation_id, appointment_id, patient_id, doctor_id,
    severe_warnings_acknowledged, created_at
) VALUES (
    '97ec0000-0000-4000-8000-000000000001',
    'c0450000-0000-4000-8000-000000000001',
    'a9970000-0000-4000-8000-000000000001',
    'ba710000-0000-4000-8000-000000000001',
    'd0c70000-0000-4000-8000-000000000001',
    FALSE,
    TIMESTAMPTZ '2026-11-10 10:26:00+05:30'
) ON CONFLICT (id) DO NOTHING;

-- Prescription Item (Dolo 650 as needed)
INSERT INTO prescription_items (
    id, prescription_id, medicine_id, dosage, frequency, duration_days, instructions, sort_order
) VALUES (
    '97e10000-0000-4000-8000-000000000001',
    '97ec0000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002', -- Dolo 650
    '650 mg',
    'As needed for fever/headache',
    3,
    'Take after meals with plenty of water',
    1
) ON CONFLICT (id) DO NOTHING;

-- Paid Invoice
INSERT INTO invoices (
    id, invoice_number, appointment_id, patient_id, doctor_id, clinic_id,
    status, currency, total, amount_paid, credited_total, paid_at, created_at, updated_at
) VALUES (
    '14000000-0000-4000-8000-000000000001',
    'INV-DEMO-00001',
    'a9970000-0000-4000-8000-000000000001',
    'ba710000-0000-4000-8000-000000000001',
    'd0c70000-0000-4000-8000-000000000001',
    'a1b2c3d4-0000-4000-8000-000000000001',
    'PAID',
    'INR',
    600.00,
    600.00,
    0.00,
    TIMESTAMPTZ '2026-11-10 10:35:00+05:30',
    TIMESTAMPTZ '2026-11-10 10:30:00+05:30',
    TIMESTAMPTZ '2026-11-10 10:35:00+05:30'
) ON CONFLICT (id) DO NOTHING;

-- Invoice Item
INSERT INTO invoice_items (
    id, invoice_id, description, quantity, unit_price, line_total, sort_order, created_at
) VALUES (
    '14010000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000001',
    'Specialist Consultation - Cardiology (Dr. Sarah Jenkins)',
    1,
    600.00,
    600.00,
    1,
    TIMESTAMPTZ '2026-11-10 10:30:00+05:30'
) ON CONFLICT (id) DO NOTHING;

-- Payment Record
INSERT INTO payments (
    id, invoice_id, amount, method, txn_ref, received_by, received_by_name, created_at
) VALUES (
    '9a900000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000001',
    600.00,
    'UPI',
    'UPI-DEMO-20261110-0001',
    '00000000-0000-4000-8000-000000000002', -- Front Desk Receptionist
    'Front Desk Receptionist',
    TIMESTAMPTZ '2026-11-10 10:35:00+05:30'
) ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Active Queue & Today's Waiting Patient (Time-Independent)
-- -----------------------------------------------------------------------------
-- Appointment 2: Today's Checked-In appointment (Dr. Jenkins + John Doe)
-- Uses dynamic date_trunc relative to NOW() in Asia/Kolkata so the patient is
-- ALWAYS actively waiting in today's queue, whether evaluated morning or evening!
INSERT INTO appointments (
    id, doctor_id, patient_id, clinic_id,
    slot_start, slot_end, status, reason,
    token_number, checked_in_at, created_at, updated_at, version
) VALUES (
    'a9970000-0000-4000-8000-000000000002',
    'd0c70000-0000-4000-8000-000000000001', -- Dr. Jenkins
    'ba710000-0000-4000-8000-000000000001', -- John Doe
    'a1b2c3d4-0000-4000-8000-000000000001', -- Banjara Hills
    (date_trunc('hour', NOW() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata',
    (date_trunc('hour', NOW() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '15 minutes') AT TIME ZONE 'Asia/Kolkata',
    'CHECKED_IN',
    'Follow-up blood pressure evaluation and medication review',
    1,
    (date_trunc('hour', NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '5 minutes') AT TIME ZONE 'Asia/Kolkata',
    (date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') + TIME '08:00:00') AT TIME ZONE 'Asia/Kolkata',
    (date_trunc('hour', NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '5 minutes') AT TIME ZONE 'Asia/Kolkata',
    1
) ON CONFLICT (id) DO NOTHING;

-- Update Doctor's Daily Counter so next token is 2
INSERT INTO doctor_day_counters (doctor_id, counter_date, last_token)
VALUES (
    'd0c70000-0000-4000-8000-000000000001',
    (NOW() AT TIME ZONE 'Asia/Kolkata')::date,
    1
) ON CONFLICT (doctor_id, counter_date) DO UPDATE
SET last_token = GREATEST(doctor_day_counters.last_token, 1);

-- -----------------------------------------------------------------------------
-- 6. Today's Arrival Desk Booking (Ready for Receptionist Check-In)
-- -----------------------------------------------------------------------------
-- Appointment 3: Booked for today, 30 minutes from current hour.
-- Enables reviewers to test the Receptionist Check-In desk live at any hour!
INSERT INTO appointments (
    id, doctor_id, patient_id, clinic_id,
    slot_start, slot_end, status, reason,
    created_at, updated_at, version
) VALUES (
    'a9970000-0000-4000-8000-000000000003',
    'd0c70000-0000-4000-8000-000000000001', -- Dr. Jenkins
    'ba710000-0000-4000-8000-000000000002', -- Eleanor Vance (Penicillin Allergy)
    'a1b2c3d4-0000-4000-8000-000000000001', -- Banjara Hills
    (date_trunc('hour', NOW() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '30 minutes') AT TIME ZONE 'Asia/Kolkata',
    (date_trunc('hour', NOW() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '45 minutes') AT TIME ZONE 'Asia/Kolkata',
    'BOOKED',
    'Cardiac consultation and pre-employment assessment',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    0
) ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. Future Scheduled Booking (Tomorrow)
-- -----------------------------------------------------------------------------
-- Appointment 4: Eleanor Vance booked with Dr. Jenkins tomorrow at 11:00 AM
INSERT INTO appointments (
    id, doctor_id, patient_id, clinic_id,
    slot_start, slot_end, status, reason,
    created_at, updated_at, version
) VALUES (
    'a9970000-0000-4000-8000-000000000004',
    'd0c70000-0000-4000-8000-000000000001', -- Dr. Jenkins
    'ba710000-0000-4000-8000-000000000002', -- Eleanor Vance
    'a1b2c3d4-0000-4000-8000-000000000001', -- Banjara Hills
    (date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '1 day' + TIME '11:00:00') AT TIME ZONE 'Asia/Kolkata',
    (date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '1 day' + TIME '11:15:00') AT TIME ZONE 'Asia/Kolkata',
    'BOOKED',
    'Pre-employment cardiac clearance and ECG evaluation',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    0
) ON CONFLICT (id) DO NOTHING;

COMMIT;
