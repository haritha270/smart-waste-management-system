# ♻️ Smart Waste Management System

A complete full-stack civic technology application that empowers citizens to report waste issues and enables municipal administrators to manage, track, and resolve complaints directly with a live map, analytics, and instant notifications.

> **Cleaner Cities. Smarter Waste Management.**
> Report waste problems, track resolution, message administrators, and build a cleaner community.

---

## 📌 Table of contents

1. [Project overview](#1-project-overview)
2. [Features](#2-features)
3. [Technologies used](#3-technologies-used)
4. [Project structure](#4-project-structure)
5. [Installation steps](#5-installation-steps)
6. [How to run the project](#6-how-to-run-the-project)
7. [Database setup](#7-database-setup)
8. [User Accounts & Roles](#8-user-accounts--roles)
9. [Project workflow](#9-project-workflow)
10. [Pages](#10-pages)
11. [API reference](#11-api-reference)
12. [Validation & error handling](#12-validation--error-handling)
13. [Testing checklist](#13-testing-checklist)
14. [Future enhancements](#14-future-enhancements)

---

## 1. Project overview

Municipalities often receive garbage complaints through fragmented channels with no tracking, no citizen feedback, and slow resolution.

**Smart Waste Management System** provides a direct, transparent citizen-to-administrator workflow:

* Every report gets a **unique complaint ID** (`WM1001`, `WM1002`, …).
* Every report moves through a streamlined 3-stage pipeline: **Pending → In Progress → Resolved**.
* Every status change and remark is logged to an **audit trail / timeline**.
* Citizens can send **direct messages / inquiries** to the municipal administrator.
* Administrators receive **instant in-app notifications** for new registrations, complaints, and citizen messages.
* Reports are shown on an **interactive OpenStreetMap** with color-coded markers.
* Administrators get **live charts** for status breakdown, priority distribution, 30-day reporting trends, and locality hotspots.

The application is lightweight and production-ready: it runs on a single machine with one command and requires no paid API keys or external services.

---

## 2. Features

## 2. Features

### Citizen
* Register / login with session-based authentication
* Report waste with title, description, **live camera photo capture** or **file upload**, address, **latitude/longitude** (via map pin or GPS)
* Instant unique complaint ID with a copy button after submission
* Dashboard with complaint statistics, recent reports, and status guide
* **My Complaints** page with status filters + search
* Report detail page with image preview, coordinates, mini map, assigned worker info, and **status timeline**
* **Direct messaging to Administrator** for questions or urgency escalation
* In-app notification center with unread badge and "mark all as read"
* Profile & settings (update contact details, change password)

### Field Collection Worker
* **Admin-Added Account**: Worker accounts are created and managed directly by administrators (no public self-registration)
* **In-App Assignment Notifications**: When an administrator assigns a task, the worker gets an unread notification in the app's Notifications page, with a direct link to Assigned Tasks. This works independently of email configuration.
* **Work Order Email Notification**: When Admin assigns work, the worker receives an official **Email notification** (not an in-app ping) containing:
  * Complainant Citizen Name, Phone (`tel:` click-to-call), and Address
  * Exact waste location and GPS coordinates
  * **Live Turn-by-Turn GPS Map Directions link**
  * **"Yes / No" Work Completion Buttons**:
    * **"✅ Yes, I completed the work"** (instantly marks task resolved, completes assignment, and alerts citizen & admin)
    * **"⏳ No, work in progress"** (acknowledges assignment and updates status to In Progress)
* **Worker Dispatch Mailbox (`#/worker/tasks`)**: View all assignment emails sent to the worker's account directly inside the portal with live action triggers
* **Worker Dashboard & Tasks Board**: Real-time KPI cards, active/resolved task filters, and manual "I completed the work" modal

### Administrator
* **Worker Management (Add & Remove Workers)**:
  * Add new field workers with designated zone, vehicle, and credentials
  * **Remove / Delete Workers**: Remove worker accounts from the system with automatic re-assignment/reset of active tasks
* **Task Assignment**: Assign waste complaints to field collection workers (triggers instant rich work order email to worker and in-app notice to citizen)
* **Exclusive Access to Clear / Delete Complaints**:
  * Only the Administrator has permission to delete or clear complaints
  * **Clear Individual Complaints**: Trash button on complaint row and detail view
  * **Clear Completed Complaints**: One-click bulk clear button on the Manage Complaints toolbar to purge resolved tasks
* **Dashboard & KPI Analytics**: Real-time counters, status distribution, 30-day submission trends, and locality hotspots
* **Citizens & Users Directory**: View all registered citizens and their complaint history
* **In-App Notification Center**: Instant alerts on new citizen registrations, reports, citizen messages, and worker task completions
* **Live Waste Map**: Interactive OpenStreetMap showing active and resolved complaints across all city zones

---

## 3. Technologies used

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (custom design system), modern JavaScript ES modules – **no build step** |
| Charts | Chart.js (vendored locally, works offline) |
| Maps | Leaflet + OpenStreetMap tiles (free, no API key required) |
| Backend | Node.js 20+ and Express REST API |
| Database | SQLite schema via `sql.js` (SQLite compiled to WebAssembly) – zero native C++ compiler needed |
| Auth | Server-side sessions + `httpOnly` cookies, scrypt password hashing |
| Uploads | Multer (live camera capture & image file upload, JPG/PNG/WEBP/GIF, 3 MB limit) |
| Dev tools | `npm start` is all that's required |

---

## 4. Project structure

```
├── package.json
├── README.md
├── data/
│   └── wms.sqlite              # SQLite database (created automatically on first run)
├── uploads/
│   └── report-*.jpg|png        # Uploaded complaint photos
├── server/
│   ├── index.js                # Express bootstrap: static files, API routes, SPA fallback
│   ├── db.js                   # Database schema, query helpers, and file persistence
│   ├── seed.js                 # Database seeder with sample Admin, Workers & Citizens
│   ├── middleware/
│   │   └── auth.js             # Session authentication and role guards
│   ├── routes/
│   │   ├── auth.js             # Register, login, logout, forgot-password, profile
│   │   ├── reports.js          # Create report, my reports, detail, map data, citizen messaging
│   │   ├── worker.js           # Worker dashboard, assigned tasks, map tracking, completion
│   │   ├── notifications.js    # Notification center (alerts, read/unread)
│   │   └── admin.js            # Admin stats, workers CRUD, task assignment, users, analytics
│   └── utils/
│       ├── helpers.js          # Password hashing, status workflows, notifications
│       ├── upload.js           # Multer file upload handler
│       └── serialize.js        # Report and worker query serializer
└── public/
    ├── index.html              # SPA shell
    ├── assets/videos/          # Hero background video (cleaning van + field worker loop)
    ├── css/styles.css          # Design system, camera viewfinder & dark/light UI tokens
    ├── vendor/                 # Local Chart.js + Leaflet
    └── js/
        ├── app.js              # Router, role guards, layout management
        ├── api.js              # Fetch wrapper & session management
        ├── ui.js               # Badges, stepper, toasts, modals, skeleton loaders
        ├── icons.js            # SVG icons
        └── pages/
            ├── landing.js  about.js  login.js  register.js  forgot-password.js
            ├── report-detail.js  map.js  notifications.js  profile.js
            ├── citizen/   (dashboard, report-new, my-reports)
            ├── worker/    (dashboard, tasks)
            └── admin/     (dashboard, reports, workers, users, analytics, notifications)
```

---

## 5. Installation steps

**Prerequisites:** [Node.js](https://nodejs.org) 18 or newer and npm.

```bash
# 1. Open the project folder
cd "waste management system"

# 2. Install dependencies
npm install

# 3. Start the application
npm start
```

---

## 6. How to run the project

| Command | Description |
|---|---|
| `npm start` | Start the server on port 3000 |
| `npm run dev` | Run development server |
| `npm run seed` | Reset and reseed the database with demo accounts |
| `PORT=4000 npm start` | Run on a custom port |

Open **http://localhost:3000** in your browser.

---

## 6b. Worker email notification (1-minute delivery)

When an admin assigns a complaint to a worker (`POST /api/admin/reports/:code/assign`), a rich
**Work Order email** is scheduled and delivered to the worker's Gmail **1 minute (60 seconds)
after the assignment**, containing citizen contact details, GPS/map links and the one-click
**Yes / No completion** buttons. The email is also always visible in the worker's in-app
Dispatch Mailbox (`#/worker/tasks`).

Scheduled deliveries survive server restarts: on boot, overdue emails are flushed immediately
and pending ones keep their countdown.

To send **real Gmail** (instead of only the in-app mailbox), copy the env template and add your
Gmail address plus an [App Password](https://myaccount.google.com/apppasswords):

```bash
cp .env.example .env
# edit .env → set GMAIL_USER and GMAIL_APP_PASSWORD, then restart npm start
```

Without these credentials, assignments remain available in the worker portal mailbox but are
not sent as email. The Admin Portal will show a warning when SMTP is not configured, and the
worker mailbox distinguishes portal-only copies, successfully sent emails, and delivery
failures. Check the server logs for SMTP failure details. Use the worker's real email address
when creating the worker account.

---

## 7. Database setup

The SQLite database file `data/wms.sqlite` is automatically created and initialized on first boot.

### Tables

| Table | Key columns | Purpose |
|---|---|---|
| `users` | id, name, email (unique), phone, password_hash, role (`citizen` \| `worker` \| `admin`), address, city, active | User accounts and credentials |
| `workers` | id, user_id, employee_code (unique), zone, vehicle, specialization, status | Worker duty details and operating zones |
| `reports` | id, report_code, user_id, title, description, image_url, address, locality, latitude, longitude, reported_at, status (`pending` \| `assigned` \| `in_progress` \| `resolved`), priority, assigned_worker_id, resolved_at | Waste complaint records |
| `assignments` | id, report_id, worker_id, assigned_by, assigned_at, status (`active` \| `completed` \| `reassigned`), note, completed_at | Task assignment log |
| `status_history` | report_id, from_status, to_status, changed_by, changed_by_role, note, created_at | Audit trail / timeline of actions and remarks |
| `notifications` | user_id, title, message, type, report_code, link, is_read, created_at | In-app alerts for Citizens, Workers and Admins |
| `sessions` | token, user_id, expires_at | Active login sessions |
| `password_resets` | id, user_id, token, otp_code, expires_at, used | Password recovery tokens & OTP codes |

---

## 8. User Accounts & Roles

| Role | How Account is Created | Default Demo Account | Capabilities |
|---|---|---|---|
| **Citizen** | Self-register via `#/register` | `priya@example.com` / `Citizen@123` | Report waste with live camera/upload & GPS, track timeline, direct message admin |
| **Field Worker** | **Added exclusively by Admin** in `#/admin/workers` | `worker.ravi@smartwms.gov` / `Worker@123` | View assigned tasks, citizen contact details, GPS map directions, click **"I completed the work"** |
| **Administrator** | Pre-seeded or created via Admin Portal | `admin@smartwms.gov` / `Admin@123` | Full control: Add workers, assign tasks to workers, manage complaints, view analytics & map |

---

## 9. Project workflow

```
  [ Citizen ]                    [ Administrator ]                    [ Field Worker ]
       │                                │                                    │
       ├─ Submits Waste Complaint ─────►│                                    │
       │  (Photo + GPS Coordinates)     │ (Admin notified)                   │
       │                                ├─ Assigns Task to Worker ──────────►│ (Worker notified)
       │                                │  (Citizen notified)                │
       │                                │                                    ├─ Views Address & Map Navigation
       │                                │                                    ├─ Starts Collection (In Progress)
       │◄── Notified of Resolution ─────┼◄── Worker clicks ──────────────────┤
       │   (Status: Resolved)           │   "I completed the work"           │
```

---

## 10. Pages

* **Public:** Home (Hero, Workflow, Statistics, How You Can Help) · About · Login · Register · Forgot Password
* **Citizen:** Dashboard · Report Waste (Live Camera / File Upload + Map Pin / GPS) · My Complaints · Complaint Details · Waste Map · Notification Center · Profile & Settings
* **Worker:** Worker Dashboard · Assigned Tasks (with Map Directions & "I completed the work") · Complaint Details · Waste Map · Notifications · Profile
* **Administrator:** Admin Dashboard · Manage Complaints (Assign Worker modal) · Manage Workers (Add Worker modal) · Citizens Directory · Analytics · Notification Center · Waste Map · Profile

---

## 11. API reference

All endpoints return JSON (`{ ok, message?, ... }`) and live under `/api`.

### Auth
| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/register` | Public (Citizen registration) |
| POST | `/api/auth/login` | Public (Shared login for Citizen, Worker, Admin) |
| POST | `/api/auth/forgot-password` | Public (generates 6-digit OTP reset code) |
| POST | `/api/auth/reset-password` | Public (verifies code and updates password) |
| POST | `/api/auth/logout` | Logged in |
| GET | `/api/auth/me` | Logged in |
| PUT | `/api/auth/me` | Logged in (profile / password) |

### Worker Portal (`/api/worker`)
| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/api/worker/summary` | Worker | Workload statistics (Active, Assigned, In Progress, Resolved) |
| GET | `/api/worker/tasks?status=` | Worker | Assigned tasks list with citizen address and GPS coordinates |
| GET | `/api/worker/tasks/:code` | Worker | Detailed task view with status timeline and complainant info |
| POST | `/api/worker/tasks/:code/status` | Worker | Update task status (`in_progress`, `resolved` / "I completed the work") |

### Administrator (`/api/admin`)
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/workers` | List all field workers with active task counts |
| POST | `/api/admin/workers` | Add a new field collection worker (Admin-only creation) |
| PATCH | `/api/admin/workers/:id` | Update worker zone, vehicle, or status (`active`, `on_leave`, `inactive`) |
| POST | `/api/admin/reports/:code/assign` | Assign complaint to worker (triggers notifications) |
| GET | `/api/admin/stats` | Dashboard counters & summaries |
| GET | `/api/admin/reports` | Filtered complaints list |
| PATCH | `/api/admin/reports/:code/status` | Update status (`in_progress`, `resolved`) with remarks |
| GET | `/api/admin/users` | Registered citizens directory |
| GET | `/api/admin/analytics` | Status mix, 30-day trends, locality hotspots |

---

## 12. Validation & error handling

* **Input Validation**: Required fields (title ≥ 5 chars, description ≥ 10 chars, valid coordinates, valid email, password ≥ 6 chars) validated on both client and server.
* **Photo Constraints**: Allowed formats (`image/jpeg`, `image/png`, `image/webp`, `image/gif`), max size 3 MB.
* **Role Guards**: Express middleware rejects unauthorized requests with `401 Unauthorized` or `403 Forbidden`.
* **User Feedback**: Instant toast notifications, inline validation errors, confirmation dialogs, and skeleton loading states.

---

## 13. Testing checklist

* [x] Register citizen & admin accounts
* [x] Admin receives instant notification when citizen registers
* [x] Citizen submits waste report with photo and coordinates
* [x] Admin receives notification with complaint code and locality
* [x] Citizen sends message to admin; admin receives notification
* [x] Admin changes complaint status to *In Progress* and *Resolved* with remarks
* [x] Citizen timeline updates and citizen receives resolution notification
* [x] Waste map displays complaints accurately
* [x] Full responsive behavior on mobile and desktop

---

## License

MIT – free for civic and academic use. Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
