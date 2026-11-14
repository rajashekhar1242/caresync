CREATE TABLE patients (
    id            UUID PRIMARY KEY,
    user_id       UUID         NULL UNIQUE REFERENCES users(id),
    full_name     VARCHAR(100) NOT NULL,
    date_of_birth DATE         NULL,
    gender        VARCHAR(10)  NULL CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    phone         VARCHAR(20)  NULL,
    email         VARCHAR(254) NULL,
    address       VARCHAR(500) NULL,
    allergies     TEXT[]       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
