## 2026-11-10: Phase 0, part 2/5: directory + patients
- [x] Departments: list, create, update (ADMIN writes)
- [x] Doctors: list (specializationId, clinicId, name, page, size, sort), get, create, update
- [x] Weekly schedule: GET, PUT (replace-all); leaves: list, create, delete
- [x] Patients: search (phone/name), create, get (audited), update; allergies as string[]
- [x] Shared: Gender, DayOfWeek, DoctorPage, PatientPage, path params
- [x] Part 1 edits: UserResponse gains patientId/doctorId; register auto-creates Patient; PageResponse description fixed
- New error codes: DEPARTMENT_NAME_EXISTS, INVALID_SCHEDULE, LEAVE_OVERLAP, LEAVE_HAS_BOOKED_APPOINTMENTS
- Open: specialization/clinic entities, department vs specialization, clinic time zone, Gender values, search auditing
- Next: Phase 0 part 3/5: slots + appointments (+ domain.md)


## 2026-11-10: Phase 0, part 4a/5: consultations + prescriptions
- [x] Consultations: GET/POST /appointments/{id}/consultation, GET/PUT /consultations/{id}
- [x] Medicines: GET /medicines (search + pagination)
- [x] POST /prescriptions/check (ALLERGY/INTERACTION, MILD/MODERATE/SEVERE)
- [x] Prescriptions: create (acknowledgeSevereWarnings), get, PDF, GET /patients/{id}/prescriptions
- [x] Edits: COMPLETED requires consultation with diagnosis; Conflict examples
- New error codes: APPOINTMENT_NOT_IN_CONSULTATION, CONSULTATION_ALREADY_EXISTS, CONSULTATION_FINALIZED, CONSULTATION_INCOMPLETE, PRESCRIPTION_ALREADY_EXISTS, SEVERE_WARNING_NOT_ACKNOWLEDGED
- Decision: money = decimal strings with 2 decimals + currency INR (applied in 4b)
- Open: "treated" definition, prescription void/edit, audit scope, admin read access
- Next: Phase 0 part 4b/5: invoices, payments, credit notes

## 2026-11-10: Phase 0, part 4b/5: billing
- [x] Billing tag; invoices: GET /invoices (status, patientId, from, to, page, size), GET /invoices/{id}, GET /appointments/{id}/invoice, GET /invoices/{id}/pdf, POST /invoices/{id}/items
- [x] POST /invoices/{id}/payments (partial payments, PENDING -> PARTIALLY_PAID -> PAID)
- [x] POST /invoices/{id}/credit-notes (ADMIN only, PAID invoices)
- [x] Money = decimal string with 2 decimals, currency INR; consultationFee changed from number to Money
- [x] Edits: BadRequest example OVERPAYMENT, Conflict example INVOICE_IMMUTABLE
- New error codes: OVERPAYMENT, CREDIT_EXCEEDS_INVOICE, INVOICE_IMMUTABLE, INVOICE_NOT_PAID, DUPLICATE_TXN_REF
- Decisions: invoice auto-created in the COMPLETED transition; PAID is never edited, only credit notes; OVERPAYMENT checked after state 409s
- Open: void/remove-item endpoint, txnRef uniqueness, billing audit scope, zero-fee invoices
- Next: Phase 0 part 5/5