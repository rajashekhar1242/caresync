# CareSync — Hospital & Clinic Management System (Frontend)

Modern, accessible, production-oriented single-page application built with React, Vite, Tailwind CSS, shadcn/ui components, and JavaScript (ES6+), integrating with the CareSync Spring Boot modular monolith backend.

---

## 1. Technology Stack

- **UI Framework:** React 18 (ES6+ with JSX)
- **Build & Dev Tool:** Vite 6
- **Styling & Design System:** Tailwind CSS 3.4 with custom clinical healthcare palette and Radix UI primitives (shadcn/ui pattern)
- **Routing:** React Router 7 with role-based protected route guards
- **Server State & Caching:** TanStack Query 5 (React Query)
- **HTTP Client:** Axios 1.7 with concurrency-safe single-flight refresh token mutex
- **Forms & Validation:** React Hook Form 7 + Zod 3 runtime validation schemas
- **Icons:** Lucide React
- **Testing:** Vitest 2 + React Testing Library + jsdom

---

## 2. Directory Structure

```
frontend/
├── docs/
│   ├── BACKEND_API_INVENTORY.md         # Complete backend REST & WS API contracts
│   ├── FRONTEND_ARCHITECTURE.md        # Architecture, security & state design
│   └── JAVASCRIPT_MIGRATION_REPORT.md   # Detailed ES6+ migration report
├── public/                              # Static public assets
├── src/
│   ├── app/
│   │   ├── layouts/
│   │   │   └── app-layout.jsx           # Main shell (Sidebar + Header + Outlet)
│   │   ├── providers/
│   │   │   ├── auth.context.jsx         # Context definitions & useAuth hook
│   │   │   ├── auth.provider.jsx        # Auth state, session hydration, login/logout
│   │   │   ├── query-client.js          # TanStack query client configuration
│   │   │   └── query.provider.jsx       # TanStack React Query provider
│   │   └── router/
│   │       ├── protected-route.jsx      # Role guards & unauthenticated redirects
│   │       ├── root-redirect.jsx        # Root landing redirector
│   │       └── routes.jsx               # React Router route tree
│   ├── components/
│   │   ├── common/
│   │   │   ├── feature-placeholder.jsx  # Modular placeholder for upcoming phases
│   │   │   └── not-found-page.jsx       # 404 handler
│   │   ├── layout/
│   │   │   ├── breadcrumbs.jsx          # Route breadcrumb trail
│   │   │   ├── header.jsx               # Top bar with status, notifications & profile
│   │   │   └── sidebar.jsx              # Role-aware left navigation drawer
│   │   └── ui/                          # Reusable UI component library (17 components)
│   ├── constants/
│   │   └── index.js                     # Routes, roles, storage keys, pagination
│   ├── features/
│   │   ├── admin/admin-home.jsx         # Administrator control console
│   │   ├── auth/login-page.jsx          # Sign-in form with demo credential fillers
│   │   ├── auth/register-page.jsx       # Patient registration form with validation
│   │   ├── auth/unauthorized-page.jsx   # 403 Access Denied presentation
│   │   ├── doctor/doctor-home.jsx       # Physician clinical console
│   │   ├── patient/patient-home.jsx     # Patient health records & appointment portal
│   │   └── receptionist/receptionist-home.jsx # Front desk & queue workspace
│   ├── hooks/
│   │   └── use-toast.js                 # Toast notification hook
│   ├── lib/
│   │   └── utils.js                     # cn (clsx + twMerge), currency & date formatters
│   ├── services/
│   │   ├── api.js                       # Axios instance with single-flight mutex refresh
│   │   ├── auth.service.js              # Typed authentication endpoints
│   │   └── token.service.js             # Session persistence & localStorage management
│   ├── styles/
│   │   └── globals.css                  # Tailwind base directives & clinical HSL variables
│   ├── test/                            # Vitest test suite (8 test files, 24 test cases)
│   ├── types/
│   │   └── index.js                     # JSDoc typedefs & Zod runtime schemas
│   ├── App.jsx                          # App entry with provider composition
│   └── main.jsx                         # React DOM mount point
├── jsconfig.json                        # Path alias mapping (@/* -> src/*)
├── package.json                         # Pure JavaScript dependencies & scripts
├── tailwind.config.js                   # Healthcare SaaS theme tokens
└── vite.config.js                       # Vite dev proxy & Vitest configuration
```

---

## 3. Development Commands

Always run commands inside the `frontend` directory:

```bash
# Install dependencies
npm install

# Start Vite dev server with proxy to backend (http://localhost:5173)
npm run dev

# Run Vitest test suite
npm run test

# Run ESLint validation
npm run lint

# Format code with Prettier
npm run format

# Production build (emits to dist/)
npm run build
```

---

## 4. Key Architectural Highlights

### Token Refresh Mutex (Backend Family Protection)
The Spring Boot backend enforces token rotation and pessimistic row locking on refresh tokens. Replaying an already used refresh token causes the entire token family to be revoked. The frontend Axios interceptor in `src/services/api.js` coordinates concurrent `401 Unauthorized` responses with a single-flight promise queue, executing exactly one refresh call and replaying waiting requests with the newly rotated access token.

### Role-Based Access Control (RBAC)
Four primary clinical roles are supported: `ADMIN`, `RECEPTIONIST`, `DOCTOR`, and `PATIENT`. The router enforces strict authorization:
- Unauthenticated users are redirected to `/login` preserving the target path.
- Authenticated users attempting to access unauthorized areas are redirected to `/unauthorized`.
- Authenticated users landing at `/` are routed to their designated portal.
