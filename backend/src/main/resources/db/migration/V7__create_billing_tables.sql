CREATE SEQUENCE invoice_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE credit_note_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE invoices (
    id             UUID PRIMARY KEY,
    invoice_number VARCHAR(32)    NOT NULL UNIQUE,
    appointment_id UUID           NOT NULL REFERENCES appointments(id),
    patient_id     UUID           NOT NULL REFERENCES patients(id),
    doctor_id      UUID           NOT NULL REFERENCES doctors(id),
    clinic_id      UUID           NOT NULL REFERENCES clinics(id),
    status         VARCHAR(20)    NOT NULL CHECK (status IN ('PENDING', 'PARTIALLY_PAID', 'PAID', 'VOID')),
    currency       VARCHAR(3)     NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
    total          NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total >= 0),
    amount_paid    NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
    credited_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (credited_total >= 0),
    paid_at        TIMESTAMPTZ    NULL,
    void_reason    VARCHAR(500)   NULL,
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE invoice_items (
    id          UUID PRIMARY KEY,
    invoice_id  UUID           NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description VARCHAR(200)   NOT NULL,
    quantity    INTEGER        NOT NULL CHECK (quantity >= 1 AND quantity <= 100),
    unit_price  NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    line_total  NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
    sort_order  INTEGER        NOT NULL,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
    id               UUID PRIMARY KEY,
    invoice_id       UUID           NOT NULL REFERENCES invoices(id),
    amount           NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    method           VARCHAR(20)    NOT NULL CHECK (method IN ('CASH', 'CARD', 'UPI', 'NET_BANKING')),
    txn_ref          VARCHAR(100)   NULL,
    received_by      UUID           NOT NULL REFERENCES users(id),
    received_by_name VARCHAR(100)   NOT NULL,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE credit_notes (
    id                 UUID PRIMARY KEY,
    credit_note_number VARCHAR(32)    NOT NULL UNIQUE,
    invoice_id         UUID           NOT NULL REFERENCES invoices(id),
    amount             NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    reason             VARCHAR(500)   NOT NULL,
    created_by         UUID           NOT NULL REFERENCES users(id),
    created_by_name    VARCHAR(100)   NOT NULL,
    created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
