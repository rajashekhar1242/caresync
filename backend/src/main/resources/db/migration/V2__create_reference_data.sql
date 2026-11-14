CREATE TABLE clinics (
    id        UUID PRIMARY KEY,
    name      VARCHAR(150) NOT NULL,
    address   VARCHAR(500) NULL,
    time_zone VARCHAR(64)  NOT NULL
);

CREATE TABLE specializations (
    id   UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE UNIQUE INDEX uq_specializations_name_lower ON specializations (LOWER(name));

CREATE TABLE departments (
    id          UUID PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(500) NULL
);

CREATE UNIQUE INDEX uq_departments_name_lower ON departments (LOWER(name));
