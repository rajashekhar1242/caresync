# CareSync HCMS — Architecture Documentation

Welcome to the **CareSync HCMS** architecture documentation. This directory provides an in-depth technical reference for the system's design, modular monolith structure, data models, security controls, and engineering decisions.

---

## Architecture Navigation Index

```text
docs/architecture/
├── README.md                  # This navigation hub
├── system-architecture.md     # High-level architecture, module boundaries & workflows
├── backend-architecture.md    # Spring Boot modular monolith, security & WebSocket implementation
├── frontend-architecture.md   # React 18 SPA, routing, state management & session lifecycle
├── database-architecture.md   # PostgreSQL 16 schema, Flyway migrations & concurrency controls
├── ADRs.md                    # Architectural Decision Records (ADRs 1–9)
└── openapi.yaml               # Canonical OpenAPI 3.0.3 REST API & STOMP specification
```

---

## Document Summaries

### 1. [System Architecture](system-architecture.md)
* **Scope:** Holistic system topology, high-level design principles, communication patterns, and end-to-end healthcare workflows.
* **Key Topics:** Client/Edge/Application/Data tiers, modular monolith rationale, inter-module ports and adapters, zero-PII waiting room displays, and complete clinical visit sequence.

### 2. [Backend Architecture](backend-architecture.md)
* **Scope:** Spring Boot 4.1.2 application architecture running on Java 25 Virtual Threads.
* **Key Topics:** Package organization across all 11 domain modules, Spring Security 7 filter chain, single-use refresh token rotation, replay detection, role-based authorization guards, outpatient slot calculation engine, and STOMP WebSocket broker channel security.

### 3. [Frontend Architecture](frontend-architecture.md)
* **Scope:** React 18.3.1 single-page application built with Vite 6 and Tailwind CSS.
* **Key Topics:** Component organization, declarative React Router configuration, resilient protected route guards, in-memory access token storage, `BroadcastChannel` multi-tab synchronization, single-flight refresh token mutex, and TanStack Query server-state caching.

### 4. [Database Architecture & Schema Design](database-architecture.md)
* **Scope:** PostgreSQL 16 relational data model and schema evolution.
* **Key Topics:** Entity-relationship diagram, Flyway migrations `V1` through `V12`, UUID primary keys, financial `NUMERIC(12,2)` precision, partial unique indexes for double-booking prevention, and the append-only database trigger for compliance audit logs.

### 5. [Architectural Decision Records (ADRs)](ADRs.md)
* **Scope:** The 9 foundational architectural decisions made during system development.
* **Key Decisions:** Modular monolith architecture, Java 25 Virtual Threads, stateless JWT with RTR, frontend refresh token mutex, partial unique indexes, zero-PII WebSocket boards, append-only audit trigger, pure ES6+ JavaScript, and fixed-scale decimal financial arithmetic.

### 6. [OpenAPI 3.0.3 Contract](openapi.yaml)
* **Scope:** The authoritative, machine-readable REST API contract.
* **Coverage:** 40 API paths, 55 HTTP operations, structured error schemas, request/response DTOs, and real-time STOMP queue channel contracts.
