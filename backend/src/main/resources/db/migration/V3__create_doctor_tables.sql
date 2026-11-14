CREATE TABLE doctors (
    id                UUID PRIMARY KEY,
    user_id           UUID           NOT NULL UNIQUE REFERENCES users(id),
    specialization_id UUID           NOT NULL REFERENCES specializations(id),
    clinic_id         UUID           NOT NULL REFERENCES clinics(id),
    department_id     UUID           NOT NULL REFERENCES departments(id),
    phone             VARCHAR(20)    NULL,
    consultation_fee  NUMERIC(12, 2) NOT NULL CHECK (consultation_fee >= 0),
    slot_minutes      INTEGER        NOT NULL CHECK (slot_minutes >= 5 AND slot_minutes <= 120 AND slot_minutes % 5 = 0),
    active            BOOLEAN        NOT NULL DEFAULT TRUE
);

CREATE TABLE schedule_entries (
    id          UUID PRIMARY KEY,
    doctor_id   UUID        NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    day_of_week VARCHAR(15) NOT NULL CHECK (day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY')),
    start_time  TIME        NOT NULL,
    end_time    TIME        NOT NULL,
    CHECK (start_time < end_time)
);

CREATE TABLE leaves (
    id         UUID PRIMARY KEY,
    doctor_id  UUID         NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    start_date DATE         NOT NULL,
    end_date   DATE         NOT NULL,
    reason     VARCHAR(255) NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CHECK (end_date >= start_date)
);
