-- Concurrency guards (PostgreSQL partial unique indexes)
CREATE UNIQUE INDEX uq_appointment_slot_active
    ON appointments (doctor_id, slot_start)
    WHERE status <> 'CANCELLED';

CREATE UNIQUE INDEX uq_appointment_doctor_in_consultation
    ON appointments (doctor_id)
    WHERE status = 'IN_CONSULTATION';

CREATE UNIQUE INDEX uq_payment_method_txn_ref
    ON payments (method, txn_ref)
    WHERE txn_ref IS NOT NULL AND method <> 'CASH';

-- Operational & reporting indexes
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX idx_schedule_entries_doctor_day ON schedule_entries (doctor_id, day_of_week);
CREATE INDEX idx_leaves_doctor_dates ON leaves (doctor_id, start_date, end_date);
CREATE INDEX idx_patients_full_name_lower ON patients (LOWER(full_name));
CREATE INDEX idx_patients_phone ON patients (phone);
CREATE INDEX idx_appointments_patient_slot ON appointments (patient_id, slot_start);
CREATE INDEX idx_appointments_doctor_checked_in ON appointments (doctor_id, checked_in_at) WHERE checked_in_at IS NOT NULL;
CREATE INDEX idx_appointments_clinic_slot ON appointments (clinic_id, slot_start);
CREATE INDEX idx_consultations_patient ON consultations (patient_id);
CREATE INDEX idx_medicines_name_lower ON medicines (LOWER(name));
CREATE INDEX idx_prescriptions_patient_created ON prescriptions (patient_id, created_at DESC);
CREATE INDEX idx_invoices_patient_created ON invoices (patient_id, created_at DESC);
CREATE INDEX idx_invoices_appointment ON invoices (appointment_id);
CREATE INDEX idx_invoices_status ON invoices (status);
CREATE INDEX idx_invoices_created_at ON invoices (created_at);
CREATE INDEX idx_payments_invoice ON payments (invoice_id, created_at);
CREATE INDEX idx_payments_created_at ON payments (created_at);
CREATE INDEX idx_credit_notes_invoice ON credit_notes (invoice_id, created_at);
CREATE INDEX idx_credit_notes_created_at ON credit_notes (created_at);
CREATE INDEX idx_audit_logs_occurred_at ON audit_logs (occurred_at DESC);
CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs (entity_type);
