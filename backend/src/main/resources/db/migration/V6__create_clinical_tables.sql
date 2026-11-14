CREATE TABLE consultations (
    id                    UUID PRIMARY KEY,
    appointment_id        UUID          NOT NULL UNIQUE REFERENCES appointments(id),
    patient_id            UUID          NOT NULL REFERENCES patients(id),
    doctor_id             UUID          NOT NULL REFERENCES doctors(id),
    vitals_blood_pressure VARCHAR(10)   NULL,
    vitals_pulse          INTEGER       NULL CHECK (vitals_pulse IS NULL OR (vitals_pulse >= 20 AND vitals_pulse <= 300)),
    vitals_temperature    NUMERIC(4, 1) NULL CHECK (vitals_temperature IS NULL OR (vitals_temperature >= 30.0 AND vitals_temperature <= 45.0)),
    vitals_weight_kg      NUMERIC(5, 1) NULL CHECK (vitals_weight_kg IS NULL OR (vitals_weight_kg >= 0.5 AND vitals_weight_kg <= 500.0)),
    vitals_spo2           INTEGER       NULL CHECK (vitals_spo2 IS NULL OR (vitals_spo2 >= 0 AND vitals_spo2 <= 100)),
    symptoms              VARCHAR(2000) NULL,
    diagnosis             VARCHAR(2000) NULL,
    notes                 VARCHAR(5000) NULL,
    follow_up_date        DATE          NULL,
    finalized_at          TIMESTAMPTZ   NULL,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE medicines (
    id           UUID PRIMARY KEY,
    name         VARCHAR(200) NOT NULL,
    generic_name VARCHAR(200) NOT NULL,
    strength     VARCHAR(100) NOT NULL,
    form         VARCHAR(20)  NOT NULL CHECK (form IN ('TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'DROPS', 'INHALER', 'OTHER')),
    drug_class   VARCHAR(150) NULL
);

CREATE TABLE drug_interactions (
    id            UUID PRIMARY KEY,
    medicine_a_id UUID         NOT NULL REFERENCES medicines(id),
    medicine_b_id UUID         NOT NULL REFERENCES medicines(id),
    severity      VARCHAR(20)  NOT NULL CHECK (severity IN ('MILD', 'MODERATE', 'SEVERE')),
    message       VARCHAR(500) NOT NULL,
    CHECK (medicine_a_id < medicine_b_id),
    UNIQUE (medicine_a_id, medicine_b_id)
);

CREATE TABLE prescriptions (
    id                           UUID PRIMARY KEY,
    consultation_id              UUID        NOT NULL UNIQUE REFERENCES consultations(id),
    appointment_id               UUID        NOT NULL REFERENCES appointments(id),
    patient_id                   UUID        NOT NULL REFERENCES patients(id),
    doctor_id                    UUID        NOT NULL REFERENCES doctors(id),
    severe_warnings_acknowledged BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE prescription_items (
    id              UUID PRIMARY KEY,
    prescription_id UUID         NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    medicine_id     UUID         NOT NULL REFERENCES medicines(id),
    dosage          VARCHAR(100) NOT NULL,
    frequency       VARCHAR(100) NOT NULL,
    duration_days   INTEGER      NOT NULL CHECK (duration_days >= 1 AND duration_days <= 365),
    instructions    VARCHAR(500) NULL,
    sort_order      INTEGER      NOT NULL,
    UNIQUE (prescription_id, medicine_id)
);

CREATE TABLE prescription_warnings (
    id              UUID PRIMARY KEY,
    prescription_id UUID         NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    warning_type    VARCHAR(20)  NOT NULL CHECK (warning_type IN ('ALLERGY', 'INTERACTION')),
    severity        VARCHAR(20)  NOT NULL CHECK (severity IN ('MILD', 'MODERATE', 'SEVERE')),
    medicine_a_id   UUID         NOT NULL,
    medicine_a_name VARCHAR(200) NOT NULL,
    medicine_b_id   UUID         NULL,
    medicine_b_name VARCHAR(200) NULL,
    message         VARCHAR(500) NOT NULL,
    sort_order      INTEGER      NOT NULL
);
