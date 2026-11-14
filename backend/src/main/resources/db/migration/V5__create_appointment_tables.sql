CREATE TABLE appointments (
    id                  UUID PRIMARY KEY,
    doctor_id           UUID         NOT NULL REFERENCES doctors(id),
    patient_id          UUID         NOT NULL REFERENCES patients(id),
    clinic_id           UUID         NOT NULL REFERENCES clinics(id),
    slot_start          TIMESTAMPTZ  NOT NULL,
    slot_end            TIMESTAMPTZ  NOT NULL,
    status              VARCHAR(25)  NOT NULL CHECK (status IN ('BOOKED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
    reason              VARCHAR(500) NULL,
    cancellation_reason VARCHAR(500) NULL,
    token_number        INTEGER      NULL CHECK (token_number IS NULL OR token_number >= 1),
    checked_in_at       TIMESTAMPTZ  NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    version             INTEGER      NOT NULL DEFAULT 0
);

CREATE TABLE doctor_day_counters (
    doctor_id    UUID    NOT NULL REFERENCES doctors(id),
    counter_date DATE    NOT NULL,
    last_token   INTEGER NOT NULL DEFAULT 0 CHECK (last_token >= 0),
    PRIMARY KEY (doctor_id, counter_date)
);
