-- Phase G: PostgreSQL Query Plans & Index Statistics on Synthetic Dataset
\pset pager off
\x off

SELECT name, setting, unit FROM pg_settings
WHERE name IN ('max_connections', 'shared_buffers', 'work_mem', 'effective_cache_size', 'lc_collate', 'lc_ctype');

SELECT 'clinics' AS tbl, COUNT(*) FROM clinics
UNION ALL SELECT 'departments', COUNT(*) FROM departments
UNION ALL SELECT 'doctors', COUNT(*) FROM doctors
UNION ALL SELECT 'patients', COUNT(*) FROM patients
UNION ALL SELECT 'appointments', COUNT(*) FROM appointments
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'credit_notes', COUNT(*) FROM credit_notes
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs;

\echo '=== 1. Doctor Schedule Lookup ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, day_of_week, start_time, end_time
FROM schedule_entries
WHERE doctor_id = 'e0000004-0000-4000-8000-000000000001';

\echo '=== 2. Available Slot Lookup (Leaves + Appointments) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT slot_start, status
FROM appointments
WHERE doctor_id = 'e0000004-0000-4000-8000-000000000001'
  AND slot_start >= NOW() - interval '1 day'
  AND slot_start < NOW() + interval '1 day'
  AND status <> 'CANCELLED';

\echo '=== 3a. Patient Search - Phone Prefix (Staff) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, full_name, phone
FROM patients
WHERE phone LIKE '910001%' ESCAPE '\'
ORDER BY full_name ASC, id ASC
LIMIT 20;

\echo '=== 3b. Patient Search - Name Substring (Staff) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, full_name, phone
FROM patients
WHERE LOWER(full_name) LIKE '%pat005%' ESCAPE '\'
ORDER BY full_name ASC, id ASC
LIMIT 20;

\echo '=== 3c. Patient Search - Doctor Scoped EXISTS ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.full_name, p.phone
FROM patients p
WHERE EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.doctor_id = 'e0000004-0000-4000-8000-000000000001'
      AND a.patient_id = p.id
      AND a.status <> 'CANCELLED'
)
ORDER BY p.full_name ASC, p.id ASC
LIMIT 20;

\echo '=== 4. Appointment Listings (Doctor Scoped + Sort) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT a.id, a.slot_start, a.status, d.id, p.id, c.id
FROM appointments a
JOIN doctors d ON d.id = a.doctor_id
JOIN patients p ON p.id = a.patient_id
JOIN clinics c ON c.id = a.clinic_id
WHERE a.doctor_id = 'e0000004-0000-4000-8000-000000000001'
ORDER BY a.slot_start ASC, a.id ASC
LIMIT 20;

\echo '=== 5. Appointment Booking Exclusivity Check ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT CASE WHEN COUNT(id) > 0 THEN true ELSE false END
FROM appointments
WHERE doctor_id = 'e0000004-0000-4000-8000-000000000001'
  AND slot_start = NOW()
  AND status <> 'CANCELLED';

\echo '=== 6. Queue Board Token Query (20 Doctors in Clinic 1) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT a.doctor_id, a.status, a.token_number
FROM appointments a
WHERE a.doctor_id IN (
    SELECT id FROM doctors WHERE clinic_id = 'a1b2c3d4-0000-4000-8000-000000000001'
)
  AND (
      a.status = 'IN_CONSULTATION'
      OR (a.status = 'CHECKED_IN'
          AND a.checked_in_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
          AND a.checked_in_at < (date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata') + interval '1 day')
  )
ORDER BY a.doctor_id ASC, a.token_number ASC;

\echo '=== 7. Invoice Retrieval (Filtered by Status + Created Desc) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT i.id, i.invoice_number, i.status, i.total, i.created_at
FROM invoices i
WHERE i.status = 'PAID'
ORDER BY i.created_at DESC
LIMIT 20;

\echo '=== 8. Payment History by Invoice ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, amount, method, txn_ref, created_at
FROM payments
WHERE invoice_id = 'e0000008-0000-4000-8000-000000000002'
ORDER BY created_at ASC;

\echo '=== 9a. Report - Revenue Invoiced by DAY (30 days, all clinics) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT to_char(i.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS period,
       COUNT(*) AS invoice_count,
       COALESCE(SUM(i.total), 0.00) AS invoiced
FROM invoices i
WHERE i.status <> 'VOID'
  AND i.created_at >= NOW() - interval '30 days'
  AND i.created_at < NOW()
GROUP BY period;

\echo '=== 9b. Report - Revenue Collected by DAY (180 days, all clinics) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT to_char(p.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS period,
       COALESCE(SUM(p.amount), 0.00) AS collected
FROM payments p
JOIN invoices i ON p.invoice_id = i.id
WHERE p.created_at >= NOW() - interval '180 days'
  AND p.created_at < NOW()
GROUP BY period;

\echo '=== 10. Report - Appointments by Department (180 days, all clinics) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT dept.id, dept.name,
       COUNT(a.id) AS total,
       COUNT(a.id) FILTER (WHERE a.status = 'COMPLETED') AS completed,
       COUNT(a.id) FILTER (WHERE a.status = 'NO_SHOW') AS no_show
FROM departments dept
LEFT JOIN doctors d ON d.department_id = dept.id
LEFT JOIN appointments a ON a.doctor_id = d.id
    AND a.slot_start >= NOW() - interval '180 days'
    AND a.slot_start < NOW()
GROUP BY dept.id, dept.name
ORDER BY total DESC, dept.name ASC;

\echo '=== 11. Report - Top Doctors (180 days, all clinics) ==='
EXPLAIN (ANALYZE, BUFFERS)
WITH appt_stats AS (
    SELECT a.doctor_id,
           COUNT(*) FILTER (WHERE a.status = 'COMPLETED') AS completed_appointments,
           COUNT(*) FILTER (WHERE a.status = 'NO_SHOW') AS no_shows
    FROM appointments a
    WHERE a.slot_start >= NOW() - interval '180 days'
      AND a.slot_start < NOW()
    GROUP BY a.doctor_id
),
pay_stats AS (
    SELECT i.doctor_id,
           COALESCE(SUM(p.amount), 0.00) AS collected
    FROM payments p
    JOIN invoices i ON p.invoice_id = i.id
    WHERE p.created_at >= NOW() - interval '180 days'
      AND p.created_at < NOW()
    GROUP BY i.doctor_id
)
SELECT d.id, u.full_name, dept.name,
       COALESCE(appt.completed_appointments, 0),
       COALESCE(appt.no_shows, 0),
       COALESCE(pay.collected, 0.00)
FROM doctors d
JOIN users u ON d.user_id = u.id
JOIN departments dept ON d.department_id = dept.id
LEFT JOIN appt_stats appt ON appt.doctor_id = d.id
LEFT JOIN pay_stats pay ON pay.doctor_id = d.id
WHERE COALESCE(appt.completed_appointments, 0) > 0 OR COALESCE(pay.collected, 0) > 0
ORDER BY completed_appointments DESC, u.full_name ASC, d.id ASC
LIMIT 10;

\echo '=== 12. Report - Dashboard Today Appointments ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*) FILTER (WHERE a.slot_start >= NOW() - interval '12 hours' AND a.slot_start < NOW() + interval '12 hours') AS total,
       COUNT(*) FILTER (WHERE a.status = 'CHECKED_IN' AND a.checked_in_at >= NOW() - interval '12 hours' AND a.checked_in_at < NOW() + interval '12 hours') AS waiting_now
FROM appointments a
WHERE (a.slot_start >= NOW() - interval '12 hours' AND a.slot_start < NOW() + interval '12 hours')
   OR (a.status = 'CHECKED_IN' AND a.checked_in_at >= NOW() - interval '12 hours' AND a.checked_in_at < NOW() + interval '12 hours');

\echo '=== 13. Audit Logs Filtered by User + Sorted Occurred Desc ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, occurred_at, action, entity_type
FROM audit_logs
WHERE user_id = 'e0000003-0000-4000-8000-000000000001'
ORDER BY occurred_at DESC
LIMIT 20;

\echo '=== Table & Index Scan Summary ==='
SELECT relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch, pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

\echo '=== Index Usage ==='
SELECT relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS idx_size
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC, relname ASC;
