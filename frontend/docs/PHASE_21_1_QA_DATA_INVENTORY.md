# Phase 21.1 – Safe QA Test Data Inventory & Retention Policy

**Project:** Hospital & Clinic Management System (CareSync / HCMS)  
**Date:** November 13, 2026  
**Auditor:** Application Security Reviewer & PostgreSQL Database Administrator  
**Database:** PostgreSQL 16.15 (Container `caresync-postgres`) · Database `caresync`  
**Policy Status:** **NON-DESTRUCTIVE RETENTION ENFORCED (Zero Records Deleted)**  

---

## 1. QA Test Data Retention Policy

In strict accordance with healthcare compliance standards and Phase 21.1 instructions:
1. **Zero Destructive Cleanup:** No synthetic patient records, appointment encounters, token sequences, invoices, or audit events were deleted.
2. **Append-Only Immutability:** Audit records are strictly guarded by PostgreSQL trigger `protect_audit_logs_append_only` (Flyway migration `V12`), prohibiting `UPDATE` or `DELETE`.
3. **Financial Immutability:** Invoices generated during automated clinical flow testing (`INV-2026-000001`, `INV-2026-000002`, `INV-2026-000003`) remain in status `VOID` with intact sequence linkage.

---

## 2. Master Patient Records Inventory

| # | Patient UUID | Full Name | Contact Phone | Created At (UTC) | Retention Status | Purpose / Source |
|---|---|---|---|---|---|---|
| 1 | `c0785e1d-68fc-4cb9-99da-49724d29e2b6` | QA Live Automated Patient | `+919876543299` | 2026-11-13 08:17:44 | **RETAIN** | Phase 20.1 Auth RBAC Test |
| 2 | `e87e94a0-3d0c-4b8f-85fb-bbd16407b819` | QA Live Patient Record | `+919875941001` | 2026-11-13 08:17:45 | **RETAIN** | Phase 20.1 Clinical Patient |
| 3 | `d253ac6f-b667-40ad-ad10-1cb16fd10ae3` | QA Live Automated Patient | `+919876543299` | 2026-11-13 08:23:10 | **RETAIN** | Regression Test Pass |
| 4 | `6bec68f0-e884-4946-be38-cf2e590a2fa9` | QA Live Patient Record | `+919878355162` | 2026-11-13 08:23:10 | **RETAIN** | Regression Test Pass |
| 5 | `f04ff0e3-eb87-4557-b933-0f921dd30a7d` | QA Live Automated Patient | `+919876543299` | 2026-11-13 08:24:46 | **RETAIN** | Regression Test Pass |
| 6 | `4e762f05-365f-46b2-8f6c-deb88ff56308` | QA Live Patient Record | `+919873539483` | 2026-11-13 08:24:47 | **RETAIN** | Cancellation Test Pass |
| 7 | `3d88ac04-6cd7-4351-bd9a-4ec50691cd88` | QA Live Automated Patient | `+919876543299` | 2026-11-13 08:26:29 | **RETAIN** | Clinical Billing Test Pass |
| 8 | `cf63b2c3-1ce1-4bfb-9b4f-5b18232d0092` | QA Live Patient Record | `+919877262838` | 2026-11-13 08:26:29 | **RETAIN** | Consultation Billing Pass |
| 9 | `176779b0-7713-41c7-8273-4de62d21db91` | QA Live Automated Patient | `+919876543299` | 2026-11-13 08:27:58 | **RETAIN** | Live Integration Baseline |
| 10 | `af60920b-b5f2-4c53-bb19-3d30de4fbd10` | QA Live Patient Record | `+919877273973` | 2026-11-13 08:27:59 | **RETAIN** | Appointment Flow Pass |
| 11 | `d52eaba0-32b5-4486-bcf3-910fbc856549` | QA Receptionist Patient 1794560685841 | `+919870685841` | 2026-11-13 09:04:46 | **RETAIN** | Phase 21 Reception Intake |
| 12 | `a4137a23-3cb5-467d-80df-cf617b83150d` | QA Receptionist Patient 1794560828881 | `+919870828881` | 2026-11-13 09:07:09 | **RETAIN** | Phase 21 Check-in Pass |
| 13 | `a884bfb0-14ea-4a7c-a68d-c213f41a4faf` | WS Test Patient 1794562867515 | `+919872867515` | 2026-11-13 09:41:07 | **RETAIN** | Phase 21.1 WebSocket Test |
| 14 | `f73d9a76-353f-488c-8886-02b90e3056ca` | QA Live Automated Patient | `+919876543299` | 2026-11-13 09:43:45 | **RETAIN** | Phase 21.1 Admin Regression |
| 15 | `8ee0dcf0-3ebe-4cfd-99f1-56b4636d1a4a` | QA Live Patient Record | `+919879185424` | 2026-11-13 09:43:45 | **RETAIN** | Phase 21.1 Admin Regression |
| 16 | `431185fc-bfd2-4b64-9c60-552e3c50ec4d` | QA Receptionist Patient 1794563034414 | `+919873034414` | 2026-11-13 09:43:54 | **RETAIN** | Phase 21.1 Receptionist Pass |

---

## 3. Hospital Appointments Ledger Inventory

| # | Encounter UUID | Attending Physician | Patient Record | Slot Start (UTC) | Status | Token # | Retention Status |
|---|---|---|---|---|---|---|---|
| 1 | `c128a7bc-9717-40f2-be9d-34636a5c5292` | Dr. QA Integration Doctor Updated | QA Live Patient Record | 2026-11-14 03:30 | `CANCELLED` | — | **RETAIN** |
| 2 | `e5466170-0079-4c4d-a700-062b3538b411` | Dr. QA Integration Doctor Updated | QA Live Patient Record | 2026-11-14 03:30 | `CANCELLED` | — | **RETAIN** |
| 3 | `3a936c82-ca73-4f84-aaf8-0015fdaf8cd7` | Dr. QA Integration Doctor Updated | QA Live Patient Record | 2026-11-13 08:30 | `COMPLETED` | #1 | **RETAIN** |
| 4 | `671efd57-fc83-4880-b813-a01152dfa30a` | Dr. QA Integration Doctor Updated | QA Live Patient Record | 2026-11-14 03:30 | `CANCELLED` | — | **RETAIN** |
| 5 | `32bfa844-25af-497e-b39e-515887f21e47` | Dr. QA Integration Doctor Updated | QA Live Patient Record | 2026-11-13 08:30 | `COMPLETED` | #1 | **RETAIN** |
| 6 | `70433be7-2c72-4c3c-be04-bd17d9273241` | Dr. QA Integration Doctor Updated | QA Receptionist Patient | 2026-11-13 09:30 | `CHECKED_IN` | #1 | **RETAIN** |
| 7 | `674d00db-c7c4-44d2-8396-bd19485dfc71` | Dr. QA Integration Doctor Updated | WS Test Patient | 2026-11-13 10:00 | `CHECKED_IN` | #2 | **RETAIN** |
| 8 | `b127c6eb-8590-4d9b-ae6b-d3b04999c391` | Dr. QA Integration Doctor Updated | QA Live Patient Record | 2026-11-14 03:30 | `CANCELLED` | — | **RETAIN** |
| 9 | `3278b357-938c-49bd-8bde-52a60bc3f954` | Dr. QA Integration Doctor Updated | QA Live Patient Record | 2026-11-13 08:30 | `COMPLETED` | #1 | **RETAIN** |
| 10 | `0528061e-ea9e-4ede-b544-f37260ca119d` | Dr. QA Integration Doctor Updated | QA Receptionist Patient | 2026-11-13 09:45 | `CHECKED_IN` | #2 | **RETAIN** |

---

## 4. Billing Invoices & Financial Records Inventory

| # | Invoice UUID | Invoice Number | Associated Appointment | Status | Total Billed | Amount Paid | Void Reason | Retention Status |
|---|---|---|---|---|---|---|---|---|
| 1 | `bf7cc734-d6e2-4477-924b-c5bb494f099e` | `INV-2026-000001` | `3a936c82-ca73-4f84-aaf8-0015fdaf8cd7` | `VOID` | ₹900.00 | ₹0.00 | QA live test void on unpaid invoice | **RETAIN** |
| 2 | `59ba4908-de18-4c5d-af8e-6cf291f6f639` | `INV-2026-000002` | `32bfa844-25af-497e-b39e-515887f21e47` | `VOID` | ₹900.00 | ₹0.00 | QA live test void on unpaid invoice | **RETAIN** |
| 3 | `fdcdab46-389f-4c6f-95e7-3f1627eaf261` | `INV-2026-000003` | `3278b357-938c-49bd-8bde-52a60bc3f954` | `VOID` | ₹900.00 | ₹0.00 | QA live test void on unpaid invoice | **RETAIN** |

---

## 5. Doctor Day Queue Counters Inventory

| Doctor UUID | Clinic Date (Kolkata) | Last Token Minted | Retention Status |
|---|---|---|---|
| `b9f7c8b9-4b41-412b-bf76-2d30ab685f55` | `2026-11-13` | 1 | **RETAIN** |
| `cde4991b-0563-4083-b085-11f4b5fdda46` | `2026-11-13` | 1 | **RETAIN** |
| `39f0f54c-9010-4890-86d3-56a17fa55bcd` | `2026-11-13` | 2 | **RETAIN** |
| `076a61a5-4d7a-4f75-b534-a8b5ab8c69f2` | `2026-11-13` | 2 | **RETAIN** |

---

## 6. Immutable Audit Trail Ledger Status

A total of **27 append-only audit events** reside in `public.audit_logs`. Every audit event was verified to retain its original actor, target entity, client IP address, timestamp, and action code:
- `PATIENT_READ`: 9 events (emitted by audited profile lookups)
- `INVOICE_CREATED`: 3 events (emitted upon appointment completion)
- `INVOICE_VOIDED`: 3 events (emitted upon administrative void)
- `INVOICE_PDF_DOWNLOADED`: 3 events (emitted upon OpenPDF stream)
- `CONSULTATION_CREATED`: 3 events
- `CONSULTATION_FINALIZED`: 3 events
- `INVOICE_READ`: 3 events

All 27 events are permanently preserved under PostgreSQL trigger constraints.
