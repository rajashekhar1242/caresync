-- Deterministic synthetic dataset for Phase 16 Large-Scale Performance & Reporting Tests
-- Safe for isolated benchmark DB only. Preserves V10/V11 seed rows.
BEGIN;

-- 1. Clinics: add 2 more (total 5)
INSERT INTO clinics (id, name, address, time_zone) VALUES
    ('e0000001-0000-4000-8000-000000000004', 'HCMS North Campus', 'Sector 18, Gurugram', 'Asia/Kolkata'),
    ('e0000001-0000-4000-8000-000000000005', 'HCMS West Clinic', 'Bandra West, Mumbai', 'Asia/Kolkata')
ON CONFLICT (id) DO NOTHING;

-- 2. Departments: add 21 more (total 25)
INSERT INTO departments (id, name, description)
SELECT
    ('e0000002-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
    'Synthetic Dept ' || lpad(i::text, 2, '0'),
    'Synthetic department ' || i
FROM generate_series(5, 25) AS s(i)
ON CONFLICT DO NOTHING;

-- 3. 100 synthetic doctors (+ users + 7-day schedules)
INSERT INTO users (id, email, password_hash, full_name, role, created_at)
SELECT
    ('e0000003-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
    'scale.doc.' || i || '@perf.local',
    '$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5L3n8P9s5t9b9y7V0cT9J8V2R3X2u',
    'Dr. Scale ' || lpad(i::text, 3, '0'),
    'DOCTOR',
    NOW() - interval '200 days'
FROM generate_series(1, 100) AS s(i)
ON CONFLICT (id) DO NOTHING;

UPDATE users
SET password_hash = (SELECT password_hash FROM users WHERE email = 'admin@caresync.local')
WHERE email = 'scale.doc.1@perf.local';

WITH clinic_ids AS (
    SELECT id, row_number() OVER (ORDER BY id) AS rn FROM clinics
),
dept_ids AS (
    SELECT id, row_number() OVER (ORDER BY id) AS rn FROM departments
),
spec_ids AS (
    SELECT id, row_number() OVER (ORDER BY id) AS rn FROM specializations
)
INSERT INTO doctors (id, user_id, specialization_id, clinic_id, department_id, phone, consultation_fee, slot_minutes, active)
SELECT
    ('e0000004-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
    ('e0000003-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
    (SELECT id FROM spec_ids WHERE rn = ((i - 1) % 8) + 1),
    (SELECT id FROM clinic_ids WHERE rn = ((i - 1) % 5) + 1),
    (SELECT id FROM dept_ids WHERE rn = ((i - 1) % 25) + 1),
    '92000' || lpad(i::text, 5, '0'),
    (300 + ((i % 10) * 100))::numeric(12, 2),
    15,
    TRUE
FROM generate_series(1, 100) AS s(i)
ON CONFLICT (id) DO NOTHING;

INSERT INTO schedule_entries (id, doctor_id, day_of_week, start_time, end_time)
SELECT
    ('e0000005-0000-4000-8000-' || lpad(to_hex((d - 1) * 7 + dow_idx), 12, '0'))::uuid,
    ('e0000004-0000-4000-8000-' || lpad(to_hex(d), 12, '0'))::uuid,
    dow_name,
    TIME '08:00',
    TIME '18:00'
FROM generate_series(1, 100) AS d,
     (VALUES (1,'MONDAY'),(2,'TUESDAY'),(3,'WEDNESDAY'),(4,'THURSDAY'),(5,'FRIDAY'),(6,'SATURDAY'),(7,'SUNDAY')) AS dow(dow_idx, dow_name)
ON CONFLICT (id) DO NOTHING;

-- 4. 10,000 synthetic patients
INSERT INTO patients (id, user_id, full_name, date_of_birth, gender, phone, email, address, allergies, created_at, updated_at)
SELECT
    ('e0000006-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
    NULL,
    'Pat' || lpad(i::text, 5, '0') || ' Kumar',
    DATE '1965-01-01' + ((i * 7) % 15000),
    CASE i % 3 WHEN 0 THEN 'MALE' WHEN 1 THEN 'FEMALE' ELSE 'OTHER' END,
    '91000' || lpad(i::text, 5, '0'),
    'pat' || i || '@perf.local',
    'Street ' || (i % 500) || ', City Block ' || (i % 40),
    CASE i % 5 WHEN 0 THEN ARRAY['Penicillin'] WHEN 1 THEN ARRAY['Sulfa','Aspirin'] ELSE '{}'::text[] END,
    NOW() - ((i % 180) || ' days')::interval,
    NOW() - ((i % 180) || ' days')::interval
FROM generate_series(1, 10000) AS s(i)
ON CONFLICT (id) DO NOTHING;

-- 5. 50,000 appointments (spread deterministically across 100 doctors x 500 unique 15-min slots)
-- Rows 49,501..50,000 sit on today in Asia/Kolkata with CHECKED_IN / IN_CONSULTATION / BOOKED states
INSERT INTO appointments (id, doctor_id, patient_id, clinic_id, slot_start, slot_end, status, reason, token_number, checked_in_at, created_at, updated_at, version)
SELECT
    ('e0000007-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid AS id,
    d.id AS doctor_id,
    ('e0000006-0000-4000-8000-' || lpad(to_hex(((i - 1) % 10000) + 1), 12, '0'))::uuid AS patient_id,
    d.clinic_id,
    slot_ts,
    slot_ts + interval '15 minutes',
    status_val,
    'Synthetic visit #' || i,
    CASE WHEN status_val IN ('CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED') THEN ((i - 1) / 100) + 1 ELSE NULL END,
    CASE WHEN status_val IN ('CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED') THEN
        CASE WHEN i > 49500 THEN date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' + (((i - 1) / 100) * interval '1 minute')
             ELSE slot_ts END
    ELSE NULL END,
    slot_ts - interval '1 day',
    slot_ts,
    0
FROM (
    SELECT
        i,
        ((i - 1) % 100) + 1 AS doc_num,
        ((i - 1) / 100) AS slot_seq,
        CASE
            WHEN i > 49900 THEN 'IN_CONSULTATION'
            WHEN i > 49600 THEN 'CHECKED_IN'
            WHEN i > 49500 THEN 'BOOKED'
            WHEN i % 20 = 0 THEN 'NO_SHOW'
            WHEN i % 15 = 0 THEN 'CANCELLED'
            WHEN i % 10 = 1 THEN 'BOOKED'
            ELSE 'COMPLETED'
        END AS status_val,
        CASE
            WHEN i > 49500 THEN (date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata') + interval '9 hours' + (((i - 49501) / 100) * interval '15 minutes')
            ELSE (NOW() - interval '180 days') + (((i - 1) / 100) * interval '30 minutes')
        END AS slot_ts
    FROM generate_series(1, 50000) AS s(i)
) gen
JOIN doctors d ON d.id = ('e0000004-0000-4000-8000-' || lpad(to_hex(gen.doc_num), 12, '0'))::uuid
ON CONFLICT (id) DO NOTHING;

-- 5b. Sync doctor_day_counters for today's synthetic queues
INSERT INTO doctor_day_counters (doctor_id, counter_date, last_token)
SELECT
    ('e0000004-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
    (NOW() AT TIME ZONE 'Asia/Kolkata')::date,
    5
FROM generate_series(1, 100) AS s(i)
ON CONFLICT (doctor_id, counter_date) DO UPDATE SET last_token = GREATEST(doctor_day_counters.last_token, EXCLUDED.last_token);

-- 6. 30,000 invoices (matching first 30,000 appointments; mix of PAID, PARTIALLY_PAID, PENDING, and 1,500 VOID)
INSERT INTO invoices (id, invoice_number, appointment_id, patient_id, doctor_id, clinic_id, status, currency, total, amount_paid, credited_total, paid_at, void_reason, created_at, updated_at)
SELECT
    ('e0000008-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
    'INV-PERF-' || lpad(nextval('invoice_number_seq')::text, 8, '0'),
    a.id,
    a.patient_id,
    a.doctor_id,
    a.clinic_id,
    inv_status,
    'INR',
    500.00,
    CASE inv_status WHEN 'PAID' THEN 500.00 WHEN 'PARTIALLY_PAID' THEN 250.00 ELSE 0.00 END,
    CASE WHEN inv_status = 'PAID' AND i % 40 = 0 THEN 50.00 ELSE 0.00 END,
    CASE WHEN inv_status = 'PAID' THEN a.slot_start + interval '20 minutes' ELSE NULL END,
    CASE WHEN inv_status = 'VOID' THEN 'Synthetic voided invoice' ELSE NULL END,
    a.slot_start + interval '15 minutes',
    a.slot_start + interval '20 minutes'
FROM (
    SELECT
        i,
        CASE
            WHEN i % 20 = 0 THEN 'VOID'
            WHEN i % 10 = 1 THEN 'PENDING'
            WHEN i % 10 = 2 THEN 'PARTIALLY_PAID'
            ELSE 'PAID'
        END AS inv_status
    FROM generate_series(1, 30000) AS s(i)
) g
JOIN appointments a ON a.id = ('e0000007-0000-4000-8000-' || lpad(to_hex(g.i), 12, '0'))::uuid
ON CONFLICT (id) DO NOTHING;

-- 7. 40,000 payments against non-VOID invoices
INSERT INTO payments (id, invoice_id, amount, method, txn_ref, received_by, received_by_name, created_at)
SELECT
    ('e0000009-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
    inv.id,
    250.00,
    CASE i % 4 WHEN 0 THEN 'CASH' WHEN 1 THEN 'CARD' WHEN 2 THEN 'UPI' ELSE 'NET_BANKING' END,
    CASE WHEN i % 4 = 0 THEN NULL ELSE 'PERF-TXN-' || i END,
    '00000000-0000-4000-8000-000000000001',
    'System Administrator',
    inv.created_at + interval '2 minutes'
FROM (
    SELECT
        i,
        ((i - 1) % 30000) + 1 AS inv_num
    FROM generate_series(1, 40000) AS s(i)
) p
JOIN invoices inv ON inv.id = ('e0000008-0000-4000-8000-' || lpad(to_hex(
    CASE WHEN p.inv_num % 20 = 0 THEN p.inv_num - 1 ELSE p.inv_num END
), 12, '0'))::uuid
ON CONFLICT (id) DO NOTHING;

-- Credit notes for every 40th invoice that is PAID
INSERT INTO credit_notes (id, credit_note_number, invoice_id, amount, reason, created_by, created_by_name, created_at)
SELECT
    ('e000000a-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
    'CN-PERF-' || lpad(nextval('credit_note_number_seq')::text, 8, '0'),
    inv.id,
    50.00,
    'Synthetic partial credit note',
    '00000000-0000-4000-8000-000000000001',
    'System Administrator',
    inv.created_at + interval '1 day'
FROM generate_series(40, 30000, 40) AS s(i)
JOIN invoices inv ON inv.id = ('e0000008-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid
WHERE inv.status = 'PAID'
ON CONFLICT (id) DO NOTHING;

-- 8. 100,000 audit_logs rows
INSERT INTO audit_logs (id, occurred_at, user_id, user_name, user_role, action, entity_type, entity_id, patient_id, details, ip_address)
SELECT
    ('e000000b-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
    NOW() - ((i % 180) || ' days')::interval - ((i % 86400) || ' seconds')::interval,
    ('e0000003-0000-4000-8000-' || lpad(to_hex(((i - 1) % 100) + 1), 12, '0'))::uuid,
    'Dr. Scale ' || lpad((((i - 1) % 100) + 1)::text, 3, '0'),
    'DOCTOR',
    CASE i % 4 WHEN 0 THEN 'PATIENT_READ' WHEN 1 THEN 'CONSULTATION_READ' WHEN 2 THEN 'INVOICE_READ' ELSE 'PRESCRIPTION_READ' END,
    CASE i % 4 WHEN 0 THEN 'PATIENT' WHEN 1 THEN 'CONSULTATION' WHEN 2 THEN 'INVOICE' ELSE 'PRESCRIPTION' END,
    ('e0000006-0000-4000-8000-' || lpad(to_hex(((i - 1) % 10000) + 1), 12, '0'))::uuid,
    ('e0000006-0000-4000-8000-' || lpad(to_hex(((i - 1) % 10000) + 1), 12, '0'))::uuid,
    'Synthetic audit entry #' || i,
    '10.99.' || ((i / 250) % 250) || '.' || ((i % 250) + 1)
FROM generate_series(1, 100000) AS s(i)
ON CONFLICT (id) DO NOTHING;

COMMIT;
ANALYZE;
