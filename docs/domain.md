# CareSync domain rules

Source of truth for business rules. API shapes live in `openapi.yaml`;
if the two disagree, fix both in the same commit.

## Roles
- **ADMIN:** manages departments and doctors; read access to everything; may
  book, cancel, check in and mark no-show. Cannot start or complete
  consultations.
- **RECEPTIONIST:** registers walk-in patients; books, cancels, checks in,
  marks no-show.
- **DOCTOR:** sees own appointments and own patients; starts, completes and
  cancels own appointments; manages own schedule and leaves.
- **PATIENT:** books and cancels own appointments; reads and edits own record.

## Entities (so far)
- User (role) 1-1 Patient (self-registered only; walk-ins have no user).
- User 1-1 Doctor. Doctor N-1 Specialization, N-1 Clinic (IANA `timeZone`).
- Doctor 1-N ScheduleEntry (weekly), 1-N Leave (full days), 1-N Appointment.
- Appointment N-1 Patient.
- Department is standalone and not yet linked to anything.
- Specializations and clinics are read-only reference data (seeded).

## Time
- Instants (`slotStart`, `slotEnd`, `createdAt`...) are UTC: `Instant` in Java,
  `timestamptz` in PostgreSQL, ISO-8601 with `Z` on the wire.
- Schedule times (`LocalTime`) and leave dates (`LocalDate`) have no zone and
  are interpreted in the doctor's clinic time zone (`ZoneId`).
- DST: a local slot start that does not exist (spring-forward gap) is skipped;
  an ambiguous one (fall-back overlap) uses the earlier instant.

## Slot generation (`GET /doctors/{id}/slots?date=`)
1. Take the schedule entries for the weekday of the clinic-local `date`.
2. Walk each range from `startTime` in steps of `slotMinutes`; keep a slot only
   if it ends by `endTime`.
3. Convert each local start/end to UTC.
4. `available = false` if a non-cancelled appointment holds that start instant
   or the start is not in the future.
5. If the day has no slots, report the first matching reason:
   DOCTOR_INACTIVE, OUTSIDE_BOOKING_WINDOW, ON_LEAVE, NO_SCHEDULE.
- Later changes to the schedule or `slotMinutes` never touch existing
  appointments; they keep the stored `slotStart` and `slotEnd`.

## Booking rules
- Window: the slot must start in the future and its clinic-local date must be
  at most today + 30 days.
- No double booking: at most one non-cancelled appointment per
  (doctor, slotStart). Enforced by a partial unique index
  (`WHERE status <> 'CANCELLED'`), not by check-then-insert.
- Check order: validation, INVALID_SLOT, OUTSIDE_BOOKING_WINDOW,
  DOCTOR_UNAVAILABLE, SLOT_ALREADY_BOOKED.
- A leave cannot be created over BOOKED or CHECKED_IN appointments.

## Appointment lifecycle
| From | To | Who | Extra rule |
|------|----|-----|-----------|
| BOOKED | CHECKED_IN | RECEPTIONIST, ADMIN | not before the slot's clinic-local date |
| BOOKED | CANCELLED | PATIENT (own), DOCTOR (own), RECEPTIONIST, ADMIN | `slotStart` at least 2 hours from now |
| BOOKED | NO_SHOW | RECEPTIONIST, ADMIN | not before `slotStart` |
| CHECKED_IN | IN_CONSULTATION | DOCTOR (own) | none |
| IN_CONSULTATION | COMPLETED | DOCTOR (own) | none |

COMPLETED, CANCELLED and NO_SHOW are terminal. Any other transition returns
409 ILLEGAL_STATE_TRANSITION. Order of checks: 404, 403, legality, time rules.

## Access rules
- A DOCTOR's "own patients" are patients with at least one non-cancelled
  appointment with that doctor.
- PATIENT sees only their own record and appointments.
- Every successful `GET /patients/{id}` writes an audit entry (who, role,
  which patient, when). Search results are not audited.
- Frontend route guards are UX only; the backend enforces all of the above.

## Error codes
| Code | HTTP | Meaning |
|------|------|---------|
| VALIDATION_FAILED | 400 | Field validation failed (see `fieldErrors`) |
| MALFORMED_REQUEST | 400 | Unparseable body or wrong types |
| INVALID_SCHEDULE | 400 | Bad weekly schedule |
| INVALID_SLOT | 400 | `slotStart` is not a slot start |
| OUTSIDE_BOOKING_WINDOW | 400 | Slot started or beyond today + 30 days |
| INVALID_CREDENTIALS | 401 | Wrong email or password |
| TOKEN_EXPIRED | 401 | Access token expired; client should refresh |
| INVALID_REFRESH_TOKEN | 401 | Refresh token unknown, expired or used |
| ACCESS_DENIED | 403 | Role or ownership rule |
| RESOURCE_NOT_FOUND | 404 | Missing or not visible to the caller |
| EMAIL_ALREADY_EXISTS | 409 | Email already registered |
| DEPARTMENT_NAME_EXISTS | 409 | Duplicate department name |
| LEAVE_OVERLAP | 409 | Overlaps an existing leave |
| LEAVE_HAS_BOOKED_APPOINTMENTS | 409 | Active appointments in the range |
| SLOT_ALREADY_BOOKED | 409 | Slot taken |
| DOCTOR_UNAVAILABLE | 409 | Doctor inactive or on leave |
| ILLEGAL_STATE_TRANSITION | 409 | Transition not allowed |
| CANCELLATION_WINDOW_CLOSED | 409 | Less than 2 hours before the slot |
| TRANSITION_TOO_EARLY | 409 | Check-in or no-show before its allowed time |

## Not defined yet
Consultations, prescriptions, billing, live queue, reports, audit-log API,
Admin/Receptionist account creation, rescheduling.