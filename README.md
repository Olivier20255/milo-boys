# MILO BOYS — Integrated School Management System

Production full-stack School Management Information System (SMIS) built with React, TypeScript, Tailwind CSS, shadcn/ui, Express, Drizzle ORM, Cloud SQL (PostgreSQL), and Firebase Authentication.

## Architecture & Modules

- **Authentication & 7-Role RBAC**: Firebase Authentication (Google Sign-In) verified on Express API endpoints with server-enforced permissions for Super Administrator, School Administrator, Headteacher/Principal, Teacher, Accountant, Student, and Parent/Guardian.
- **Dashboard**: Real-time PostgreSQL KPIs and Recharts visualizations across enrollment, fee collections, attendance, and examination analytics.
- **Student Management**: Admissions, duplicate admission number prevention, guardian & emergency contacts, restricted medical fields, photo uploads, printable ID cards, admission forms, status transitions, bulk promotions, and Excel/PDF exports.
- **Academic Administration**: Academic years, terms, classes, streams, subjects, teacher-subject allocations, and enrollments.
- **Examinations & Results**: Configurable KCSE grading scales, marks entry, 5-stage workflow (`DRAFT -> SUBMITTED -> VERIFIED -> FINALIZED -> PUBLISHED`), authorized reopening with audit reason, and printable report cards.
- **Finance & Fees**: Termly fee structures, student ledgers, bursary/discount adjustments, transactional payments with sequential receipts, collection reports, and M-Pesa Daraja STK Push integration.
- **Attendance & Timetable**: Daily student/staff attendance with audited corrections, and weekly class/teacher timetables with automatic teacher, class, and room conflict detection.
- **Security & Compliance**: Rate limiting, Zod input validation, parameterized SQL via Drizzle ORM, path-confined file uploads, data minimization aligned with the Kenya Data Protection Act (2019), immutable audit logs, and JSON backup exports.

## Setup & Commands

1. Configure environment variables (`.env.example` lists optional M-Pesa, SMTP, and SMS variables; Cloud SQL runtime variables `SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD` are injected by the platform).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run tests:
   ```bash
   npm test
   ```
4. Type-check and build:
   ```bash
   npm run lint
   npm run build
   ```
5. Start development / production server:
   ```bash
   npm run dev
   ```

## Core REST API Endpoints

- `GET /api/auth/me` — Verify Firebase ID token, sync user & permissions, seed initial academic data.
- `GET /api/dashboard` — Live PostgreSQL KPIs and chart series.
- `GET/POST/PATCH /api/students`, `POST /api/students/:id/status`, `POST /api/students/promote`, `POST /api/students/:id/photo`
- `GET /api/academics/overview`, `POST /api/academics/{years,terms,classes,streams,subjects,assignments}`
- `GET/POST /api/examinations`, `POST /api/examinations/:id/marks`, `POST /api/examinations/:id/transition`, `GET /api/examinations/:id/report-card/:studentId`
- `GET/POST /api/finance/structures`, `GET /api/finance/student-fees`, `POST /api/finance/payments`, `POST /api/finance/mpesa/stk-push`, `GET /api/finance/reports`
- `GET/POST /api/attendance/students`, `GET/POST /api/attendance/staff`
- `GET/POST/PATCH /api/staff`, `POST /api/staff/:id/documents`
- `GET/POST/DELETE /api/timetable`
- `GET/POST /api/communication/{announcements,messages}`
- `GET/POST/PATCH /api/admin/users`, `PATCH /api/admin/settings`, `GET /api/admin/audit-logs`, `GET /api/admin/backup`
