# TicketShop Syria (Monorepo)

A monorepo containing the TicketShop Syria ecosystem, including the customer booking app, admin dashboard, shared libraries, and backend services.

## Project Structure

```text
ticketshop-sy/
├── apps/
│   ├── customer-app/        # Angular 21 mobile-first click-dummy (Arabic/RTL)
│   └── admin-dashboard/     # Angular 21 travel-companies dashboard (port 4201)
├── libs/
│   ├── shared-models/       # Shared TypeScript interfaces (e.g., TravelRoute)
│   └── shared-ui/           # Shared standalone Angular components (SeatLayoutComponent)
├── backend/                 # Node.js/NestJS/TypeScript backend service
└── package.json             # Root workspace management and helper scripts
```

## Tech Stack

### Customer App (apps/customer-app)
- **Framework:** Angular 21 (standalone components, signals API)
- **UI:** Angular Material, Pure CSS (no Tailwind/Bootstrap)
- **Internationalization:** RTL layout (`dir="rtl" lang="ar"`)
- **Features:** Mock trip generator, seat gender system, timetable sorting.
- **Confirmation page:** the issued ticket card sits inside a `.print-area` element. A "طباعة التذكرة" button calls `window.print()` after toggling `body.printing-ticket` (the global rule in `styles.css` hides everything else during print). A "تنزيل PDF" button lazily imports `html2canvas-pro` + `jspdf`, renders the ticket node to canvas, and saves it as `ticket-<reference>.pdf`. Both deps are dynamic-imported so they only ship when the user actually clicks Download — they do not bloat the initial bundle.

### Admin Dashboard (apps/admin-dashboard)
- **Framework:** Angular 21 standalone (mirrors customer-app). Runs on port **4201**.
- **Auth:** `AuthService` persists JWT + user in `localStorage`; `authInterceptor` attaches the token and logs the user out on 401; `authGuard` protects routes; `adminGuard` (in `guards/admin.guard.ts`) redirects non-admin users to `/dashboard` and is layered on top of `authGuard` for admin-only routes. `AuthService` exposes `isAdmin = computed(() => user()?.role === 'admin')` for template use.
- **Roles:** users carry one of `UserRole = 'admin' | 'sales'` (centralized in `libs/shared-models`). **admin** = full access; **sales** = read-only across the dashboard but full booking lifecycle (create / edit passenger / cancel / reactivate / print / email). Admin-only UI affordances (the `/trips/new` sidebar link, the per-row Cancel button + modal on `/trips`, the "إرسال بالبريد" button + modal on `/reports`) are wrapped in `@if (auth.isAdmin())` and hidden entirely for sales users; backend enforcement is the source of truth (see Backend → "Authorization").
- **Shell:** sticky topbar + right-side sidebar (Arabic/RTL). Sidebar links: `/dashboard`, `/trips`, `/trips/new` *(admin only)*, `/drivers` *(admin only)*, `/trips/templates` *(admin only)*, `/bookings`, `/reports`.
- **Routes:** `/login`, `/accept-invitation/:token`, guarded `/dashboard`, `/trips`, `/trips/new` *(adminGuard)*, `/drivers` *(adminGuard)*, `/trips/templates` *(adminGuard)*, `/trips/templates/new` *(adminGuard)*, `/trips/templates/:id/edit` *(adminGuard)*, `/trips/:id/reservations`, `/bookings`, `/bookings/:reference`, `/reports`.
- **Trips page:** lists company trips with date filter + pagination; per-row Cancel (reason dialog) and View Reservations.
- **Reservations page:** shows the 10x4 seat layout via `<lib-seat-layout>` (read-only preview), a bookings table with Print (browser `window.print()` via a `.print-area` element + `@media print` in `styles.css`) and Email buttons, and a "new booking" modal that uses the same layout component for seat selection, allows per-seat gender toggle, and surfaces any gender-override warning returned by the backend. The payment-method `<select>` lists `cash` (دفع نقدي) **first** as the default — this is the staff-only payment method the customer app does not expose; all three are mocked at the backend.
- **New Trip page (`/trips/new`):** date picker + driver autocomplete (typing ILIKE-searches the company's active drivers; picking a suggestion locks in `driverId`, otherwise the backend find-or-creates by name on submit) + stations editor (city dropdown, arrival/departure times, move up/down, remove, add) + auto-rendered upper-triangle pair-pricing list (one row per (i&lt;j) station pair) + a "حفظ كقالب" checkbox with a name field that, when set, asks the backend to also write a `TripTemplate` snapshot in the same transaction. The `availableCities()` helper prevents selecting the same city twice. Client-side validation mirrors `DashboardTripsService.validate()` — ≥2 stations, no duplicates, first-departure/last-arrival required, monotonic times, every upper-triangle price &gt; 0 — and any backend BadRequestException is surfaced verbatim. On success, navigates back to `/trips`.
- **Drivers page (`/drivers`):** admin-only list with ILIKE search + add/inline-rename/delete. Delete starts un-confirmed; if the backend returns a 409 (driver assigned to upcoming trips), a dialog shows the conflict info and asks the user to pick a replacement driver — submitting re-issues the DELETE with `?replacementDriverId=<id>` so the upcoming trips are reassigned and the driver is soft-deleted in one backend transaction. Past trips keep showing the original driver name even after soft delete.
- **Templates pages (`/trips/templates`, `/trips/templates/new`, `/trips/templates/:id/edit`):** admin-only. The list shows name + route + driver + station count + per-row "إنشاء رحلة" (instantiate dialog: date + first-departure-time → backend computes every station time from offsets) and edit/delete. The form lets the user enter HH:mm times for stations (purely as editing convenience; the form converts to/from offsets via an arbitrary `06:00` anchor at load and computes offsets relative to the first station's departure on save). The `/trips` list also exposes a "حفظ كقالب" row action (admin-only) that opens a small modal asking for a template name, which calls `POST /api/v1/dashboard/trips/:id/save-as-template` and snapshots the trip into a fresh template. Templates are decoupled from the trip they were created from — editing one never touches the other.
- **Reports page (`/reports`):** two date pickers (defaults to first-of-month → today) + Generate. Renders totals card, per-day table, and per-route table (ordered by revenue desc). Print uses the same `visibility` trick as tickets via `body.printing-report` in `styles.css` showing only `.report-area`. An email modal pre-fills the current user's email and posts to `POST /dashboard/reports/email`.
- **Bookings search / detail (`/bookings`, `/bookings/:reference`):** cross-trip booking search via `BookingsService` with a combined query box (matches `reference` / `passengerName` / `passengerPhone` ILIKE) + date + status (`past | ongoing | cancelled`) filters, paginated at 20/page. Clicking a row opens the detail page, which defaults to read-only with a lock icon in the title bar. Unlocking enables passenger-info edits (name, phone, email) — "القيمة السابقة: …" hints are driven by a `draft vs original` signal diff and collapse automatically after a successful save (hint logic lives entirely in the component, no hint-reset RPC). Separate Cancel / Reactivate buttons flip `BookingEntity.status` via `POST .../cancel` and `POST .../reactivate`; reactivate 409s with the conflicting seat numbers if another confirmed booking has taken the seats in the interim. Print + Email actions reuse the existing `body.printing-ticket` CSS and the `POST .../email` endpoint. Booking references on the main dashboard "آخر المبيعات" table and the reservations page's bookings table link here (whole-row link on dashboard; cell-scoped `.ref-link` on reservations so Print/Email buttons keep working).

### Backend (backend)
- **Runtime:** Node.js
- **Framework:** NestJS (TypeScript, Strict Mode)
- **Persistence:** PostgreSQL via TypeORM (`synchronize: true` in development only).
- **Feature modules:** `companies/`, `auth/`, `mail/`, `drivers/`, `trips/`, `trip-templates/`, `seats/`, `bookings/`, `dashboard/`.
- **Auth:** JWT via `@nestjs/jwt` + `passport-jwt`. Users are created from invitations (CLI-only in v1). Endpoints: `POST /api/v1/auth/login`, `GET /api/v1/auth/invitations/:token`, `POST /api/v1/auth/invitations/:token/accept`, `GET /api/v1/auth/me`. Guard: `JwtAuthGuard`; decorator: `@CurrentUser()`. JWT payload carries `role: UserRole`; `JwtStrategy.validate()` rejects unknown roles with 401 (defends against legacy tokens — the frontend interceptor logs the user out and forces a re-login).
- **Authorization (roles):** `UserRole = 'admin' | 'sales'` (imported from `@ticketshop-sy/shared-models`). `UserEntity.role` and `InvitationEntity.role` are non-null `text` columns; the role is fixed at invitation time and copied onto the user when the invite is accepted. Per-handler RBAC uses `@Roles(...roles)` (in `auth/decorators/roles.decorator.ts`) + `RolesGuard` (in `auth/guards/roles.guard.ts`); a handler with no `@Roles()` metadata stays open to both roles. Admin-only surfaces: every `/dashboard/drivers/*` and `/dashboard/trip-templates/*` endpoint, plus `POST /dashboard/trips`, `POST /dashboard/trips/:id/cancel`, `POST /dashboard/trips/:id/save-as-template`, and `POST /dashboard/reports/email`. All other dashboard endpoints (including `POST /dashboard/bookings`, `PATCH .../bookings/:ref`, `POST .../cancel`, `POST .../reactivate`, `POST .../email`, and `POST /trips/:id/dismiss-cancellation`) stay open to both `admin` and `sales`.
- **Trips model:** a `TripEntity` is just `{ id, companyId, driverId, date }`. Route shape lives in `trip_stations` (cityId, order, arrivalTime, departureTime) and pricing lives in `trip_segment_prices` (fromCityId, toCityId, price, unique per trip+pair). Every ordered pair of stations on a trip has its own price (pair-priced). `trips.driverId` is NOT NULL (FK to `drivers`). `TripsService.searchTrips(from, to, date)` finds trips whose stations include both cities with from.order < to.order and resolves the pair price.
- **Drivers model:** `DriverEntity { id, companyId, nameAr, deletedAt: timestamptz | null, createdAt }`. Soft delete via `deletedAt` — the listing endpoint filters `WHERE deletedAt IS NULL`, but trip joins still resolve the row so historical/past trips keep showing the original driver name. `POST/GET/PATCH /api/v1/dashboard/drivers` are admin-only CRUD; `POST` is find-or-create on case-insensitive trim within the company. `DELETE /api/v1/dashboard/drivers/:id` soft-deletes when no upcoming trip references the driver, otherwise returns **409** with `{ message, upcomingTripCount, sampleTripDates }`; passing `?replacementDriverId=<id>` reassigns those upcoming trips and soft-deletes in one `DataSource.transaction`. The trip-create payload accepts `driver: { id?, name? }` — exactly one of `id` or `name` is required, with `name` triggering find-or-create.
- **Trip templates model:** `TripTemplateEntity { id, companyId, nameAr, driverId, createdAt }` plus `trip_template_stations` (per-station `arrivalOffsetMin` + `departureOffsetMin`, in INTEGER minutes from the template's reference point — first station's departure = 0) and `trip_template_segment_prices` (full upper-triangle, mirroring `trip_segment_prices`). All offset/instantiate math lives in `template.mapper.ts` (pure, unit-tested). Endpoints (admin-only) under `/api/v1/dashboard/trip-templates`: GET list, GET/:id, POST, PATCH (full replace of stations + prices), DELETE, and `POST /:id/instantiate { date, firstDepartureTime }` which clones into a fresh trip with every station's HH:mm computed as `firstDepartureTime + offset`. `POST /api/v1/dashboard/trips/:id/save-as-template { name }` snapshots an existing trip into a new template (offsets computed from the trip's first-station departureTime). `CreateDashboardTripDto` also accepts `saveAsTemplate: boolean` + `templateName: string`; when true, the trip-create endpoint writes both rows in one `DataSource.transaction`. Templates are decoupled from the trip they came from — editing the template never touches the trip and vice versa.
- **Bookings model:** `BookingEntity` persists the boarding/dropoff station IDs (`boardingStationId`, `dropoffStationId`) + passenger fields (`passengerName`, `passengerPhone`, `passengerEmail` nullable). Total price = pair price for (boarding, dropoff) × seat count. `CreateBookingDto` validates nested `passenger: { name, phone, email? }` and rejects invalid boarding/dropoff combinations (not on trip, reversed order, or no segment price). `paymentMethod` is one of `'sham-cash' | 'syriatel-cash' | 'cash'`; `cash` is staff-only — the customer-facing `BookingsService.createBooking()` rejects it with 400, while `BookingsService.createBookingInternal()` (used by the dashboard) permits all three. Customer + dashboard share the same DTO; the gate lives in the service so a single shared validation surface is preserved.
- **Segment-aware seat occupancy:** A seat is "occupied" for a requested boarding→dropoff segment only if an existing **confirmed** booking's segment overlaps (half-open: touching at a station does NOT overlap, so a passenger dropping off at X frees the seat for another boarding at X). Implemented via `segmentsOverlap(aStart, aEnd, bStart, bEnd)` in `libs/shared-models` — shared by the customer seat-selection page, admin-dashboard new-booking modal, backend `SeatsService.getSeatsForTrip`, `BookingsService.createBookingInternal`, and `DashboardBookingsService.reactivate`. Cancelled bookings never block — filtered out at the `WHERE status='confirmed'` boundary.
- **Booking-create concurrency:** `BookingsService.createBookingInternal` and `DashboardBookingsService.reactivate` run inside `DataSource.transaction` with `SELECT ... FOR UPDATE` on the `trips` row (via TypeORM `lock: { mode: 'pessimistic_write' }`). Concurrent booking creates on the same trip serialize at the trip level, preventing the seat-occupancy read + insert from racing.
- **Seats endpoint:** `GET /api/v1/trips/:tripId/seats?boardingStationId=&dropoffStationId=` — both query params are optional but must be provided together; unknown station IDs, mismatched-to-trip station IDs, and reversed boarding/dropoff all 400. Omitting both returns the legacy "every confirmed booking occupies" view (used by dashboard read-only previews).
- **Dashboard trip creation:** `POST /api/v1/dashboard/trips` (guarded, scoped to the caller's `companyId`) via `DashboardTripsService.create()`; validates ≥2 unique stations, monotonic times, and a positive price for every (i<j) station pair. Requires `driver: { id?, name? }` and resolves it via `DriversService.resolveActive()` / `findOrCreate()`. When `saveAsTemplate=true` is set with `templateName`, both the trip and a `TripTemplate` snapshot are written in one `DataSource.transaction`.
- **Trip cancellation:** `POST /api/v1/dashboard/trips/:id/cancel` `{ reason }` marks `TripEntity.cancelledAt/cancelledReason` and sets `status='cancelled'` on all of the trip's bookings; `POST /api/v1/dashboard/trips/:id/dismiss-cancellation` records a per-user dismissal in `cancelled_trip_dismissals` (unique on `(userId, tripId)`). `BookingResponse` exposes `tripCancelled`, `tripCancelledAt`, `tripCancelledReason` so the customer confirmation page renders a cancellation banner.
- **Email:** `MailModule` exports a stub `EmailService.send({ to, subject, body })` that only logs; real SMTP comes later.
- **Overview endpoint:** `GET /api/v1/dashboard/overview` returns `{ upcomingTrips[5], latestSales[10], balance, cancelledTrips }` scoped to the caller's company. Upcoming trips exclude cancelled ones; `cancelledTrips` covers the last 30 days and filters out any the current user has already dismissed.
- **Dashboard trips list:** `GET /api/v1/dashboard/trips?date=&page=` (pageSize 20, sorted by date desc) and `GET /api/v1/dashboard/trips/:id/bookings` (trip detail + bookings). Both scoped to the caller's `companyId` (cross-company returns 403 from the `bookings` endpoint; the list endpoint simply filters).
- **Dashboard bookings:** `POST /api/v1/dashboard/bookings` accepts the same `CreateBookingDto` as the customer endpoint but calls `BookingsService.createBookingInternal({ enforceGender: false })`; the response envelope is `{ data: BookingResponse, warning: string | null }` — a gender violation surfaces in `warning` without blocking. `POST /api/v1/dashboard/bookings/:reference/email` sends a stub email for the booking (400 if no `passengerEmail`, 403 cross-company). `GET /api/v1/dashboard/bookings?query=&date=&status=&page=` (pageSize 20, ordered by `createdAt DESC`) returns `{ bookings, total, page, pageSize }` scoped to the caller's `companyId`; `query` ILIKE-matches any of reference / passenger name / phone; `status ∈ past | ongoing | cancelled | all` — `past` and `ongoing` imply `booking.status='confirmed'` and compare `trip.date` against `CURRENT_DATE`, while `cancelled` matches `booking.status='cancelled'` (covers both per-booking and trip-cascade cancellations). `GET /dashboard/bookings/:reference` and `PATCH /dashboard/bookings/:reference` return / update a single booking — PATCH accepts `{ passenger: { name?, phone?, email? } }` only and 400s if the booking is cancelled (nudging the agent to Reactivate). `POST .../cancel` flips `status='confirmed' → 'cancelled'` (400 if already cancelled or trip-level cancelled). `POST .../reactivate` flips it back after re-scanning other confirmed bookings on the trip for seat conflicts → 409 with the overlapping seat numbers if any; 400 if the trip itself is cancelled. `GET /api/v1/dashboard/bookings/export?query=&date=&status=` returns the same filtered set as the search endpoint (no pagination) as a UTF-8 BOM-prefixed CSV (`text/csv`, `Content-Disposition: attachment; filename="bookings-YYYY-MM-DD.csv"`); Arabic headers, status translated (`مؤكَّد` / `ملغى`), commas in passenger names are RFC-4180 quoted — opens cleanly in Excel. All routes are company-scoped via `JwtAuthGuard` + `booking.trip.companyId` check → 403 cross-company.
- **Dashboard reports:** `GET /api/v1/dashboard/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` returns `{ totals, perDay, perRoute }` aggregated from confirmed bookings whose trip date falls in the inclusive range, scoped to the caller's `companyId`. `POST /api/v1/dashboard/reports/email` accepts `{ from, to, recipient }` and dispatches a rendered HTML body via the stub `EmailService`. `perRoute` is sorted by revenue desc; `perDay` by date asc. Invalid dates or inverted ranges → 400.
- **Env vars (new):** `JWT_SECRET`, `JWT_EXPIRES_IN` (default `7d`), `DASHBOARD_BASE_URL` (used by the invite CLI when printing the acceptance URL).
- **Seeder:** `npm run seed` (from the `backend` workspace) rebuilds companies → trips → mock bookings.
- **Invite CLI:** `npm run invite --workspace backend -- --email=<email> --companyId=<uuid> --role=admin|sales` inserts an invitation row and prints the acceptance URL. `--role` is required; the role flows onto the created user when the invitation is accepted.
- **Role migration CLI:** `npm run migrate:roles --workspace backend` is a one-shot script that flips any legacy `users.role = 'agent'` rows to `'admin'`. Run it once per environment after deploying the role rework, then it can be left alone (re-running is a no-op).

### Shared Library (libs/shared-models)
- **Purpose:** Shared TypeScript types and interfaces between frontend and backend.
- `Trip.company` is a `{ id: string; nameAr: string }` — companies are first-class entities.
- `Driver` is a `{ id: string; nameAr: string }` — used by both the dashboard's `DriverDto` and the trip endpoints' driver resolution.
- `Trip.stations` is a `TripStation[]` carrying the full ordered route (cityId, nameAr, order, arrivalTime, departureTime). `Trip.from/to/departureTime/arrivalTime/duration/durationMinutes/stops/price` are **derived for the searched pair** — `price` is the segment price for that exact pair; `stops` counts intermediates strictly between `from` and `to`.

### Shared UI (libs/shared-ui)
- Standalone Angular components consumed by both apps via the TypeScript path alias `@ticketshop-sy/shared-ui` → `libs/shared-ui/src/public-api.ts`.
- `SeatLayoutComponent` (selector `lib-seat-layout`) renders the 10x4 bus grid and emits `seatTap`. Inputs: `seats`, `selections` (seatId+gender list), `pendingSeatId`, `disabled`, `showLegend`. CSS uses neutral custom-property fallbacks (`--color-seat-male`, etc.) so host apps can theme it via their own `:root` vars. Both the customer seat-selection page and the dashboard reservations page use it.

## Common Commands

All commands can be run from the project root using npm workspaces:

```bash
# Customer App
npm run start:app     # Run customer app in dev mode
npm run build:app     # Build customer app for production
npm run deploy:app    # Deploy customer app to GitHub Pages

# Admin Dashboard
npm run start:admin   # Run admin dashboard in dev mode (port 4201)
npm run build:admin   # Build admin dashboard for production

# Backend
npm run start:backend     # Run backend service
npm run build:backend     # Build backend service
npm run seed -w backend   # Rebuild companies → trips → mock bookings
npm run invite -w backend -- --email=<email> --companyId=<uuid> --role=admin|sales   # Issue an invitation
npm run migrate:roles -w backend   # One-shot: flip legacy role='agent' rows to 'admin'
npm run test -w backend       # Unit tests (Jest, mocked deps)
npm run test:e2e -w backend   # E2E tests against an ephemeral Postgres (Testcontainers — Docker required)
```

### E2E test suite (`backend/test/`)

End-to-end tests live in `backend/test/*.e2e-spec.ts` and run against a real Postgres started by Testcontainers (`@testcontainers/postgresql`). They require a running Docker daemon — CI must expose `/var/run/docker.sock` or set `DOCKER_HOST`. Coverage spans the major HTTP surfaces (auth, trips search, dashboard trips/bookings/overview/reports, seats, customer bookings) plus the SQL-level `FOR UPDATE` concurrency path that satisfies coding rule #2 below ("any new transactional / locking code path needs at least one integration test against a real Postgres").

## Flow (Customer App)

1. **Home** → select cities + date → Search
2. **Timetable** → sort by departure time / duration / price → tap a trip
3. **Seat Selection** → pick active gender (male/female) → tap seats → Continue
4. **Passenger Info** → enter name (required) + phone (required) + email (optional) → Continue
5. **Payment** → pick payment method → Pay
6. **Confirmation** → view ticket → Back to Home

## Deployment

Three independent targets, each auto-deployed from GitHub on push to `master`:

| Target | Platform | Build command | Notes |
|---|---|---|---|
| `backend/` | **Railway** | `npm run build:backend` | Runs `nest build`; env vars configured in Railway dashboard (DB creds, `JWT_SECRET`, `JWT_EXPIRES_IN`, `DASHBOARD_BASE_URL`, CORS origins). |
| `apps/customer-app/` | **GitHub Pages** | `npm run build:app` / `npm run deploy:app` | Manual deploy via `gh-pages`; no env vars. |
| `apps/admin-dashboard/` | **Netlify** | `npm run build:admin` | SPA redirects handled by `apps/admin-dashboard/public/_redirects` (or `netlify.toml`). `environment.apiUrl` must point at the Railway backend URL. |

### Deployment-impact rule

**Before finishing any task, audit whether the changes could break deployment on any of the three targets.** If yes, you MUST either (a) make the aligning change in this PR, or (b) call out the required manual step explicitly in the final summary — do not silently ship a change that depends on the user updating an external system.

Changes that trigger this audit:

- **New or changed env vars** (anything read from `process.env` in backend, or `environment.*` in a frontend) → list them for the user to set in Railway / Netlify.
- **New build steps, scripts, or build-time dependencies** → confirm Railway / Netlify / gh-pages pipelines still succeed (e.g., new `postinstall`, new tool in `devDependencies` that needs to be in `dependencies`, new CLI that expects a binary in the image).
- **CORS / cookie / auth config** → backend `origin` list must include the Netlify + GitHub Pages URLs; any same-origin assumption is a red flag.
- **API contract changes** (new routes, renamed response fields, new required request fields, changed base path) → both frontends consume the backend, so contract drift breaks the deployed apps even if local `npm run start:*` works.
- **Routing changes in admin-dashboard** → SPA needs the `_redirects` rule; verify a new top-level route still resolves after a hard refresh on Netlify.
- **Shared-models changes** → both frontends re-bundle; verify both builds pass, not just the one being edited.
- **Database schema changes** → write a TypeORM migration in the same PR. Do **not** rely on `synchronize: true` to apply schema changes on Railway, and do **not** propose re-running the seeder as a recovery path — both leave dead-tuple bloat that filled the 500 MB Railway volume on 2026-04-26 and crash-looped Postgres. One-shot bootstrap helpers (e.g. `ensureRoleColumnBackfilled()`) are a smell; prefer an explicit migration. The seeder runs once per environment at bootstrap; after that, real data only.
- **Port / URL assumptions** — anything hardcoded to `localhost:3000` / `:4200` / `:4201` is a deploy-break.

When in doubt, say so explicitly in the final summary ("⚠ This adds env var X — set it in Railway before deploying"). Silent breakage is the failure mode to avoid.

### Driver rework — one-time deployment notes

The shift to NOT-NULL `trips.driverId` requires a one-shot pre-sync backfill on each environment:

1. **Deploy the backend.** `main.ts` and `seeder/seed.ts` call `ensureDriversBackfilled()` (in `backend/src/common/bootstrap/ensure-drivers-backfilled.ts`) before NestFactory boots — it idempotently creates the `drivers` table, adds nullable `trips.driverId` if missing, and inserts one `'سائق افتراضي'` per company that has trips with NULL driverId, backfilling those trips. After the helper runs, TypeORM `synchronize: true` can safely ALTER `trips.driverId` to NOT NULL because every existing row has a value.
2. The first thing each company should do post-deploy is rename the auto-created default driver from the `/drivers` page (or delete it after assigning real drivers).

### Role rework — one-time deployment notes

The shift from a single `'agent'` role to `'admin' | 'sales'` requires a one-shot migration on each environment:

1. **Deploy the backend.** Both `main.ts` and `seeder/seed.ts` call `ensureRoleColumnBackfilled()` (in `backend/src/common/bootstrap/ensure-role-column.ts`) before NestFactory boots — it adds `users.role` and `invitations.role` as nullable if missing and backfills any nulls to `'admin'`, so TypeORM's subsequent `synchronize: true` can mark the columns NOT NULL without tripping `column "role" contains null values`. Idempotent and safe to leave in place.
2. **Run `npm run migrate:roles -w backend`** against the deployed DB to flip existing `users.role='agent'` → `'admin'`. Until this runs, those users will get 401s on every request (their JWT carries `role='agent'`, which the new `JwtStrategy.validate()` rejects), forcing them to re-login — but they cannot log in successfully because the login response would carry `'agent'`. Run the migration immediately after deploy. (Not needed on environments that never had `'agent'` rows — the pre-sync backfill above handles fresh-from-null cases.)
3. From now on, every `npm run invite` call must include `--role=admin|sales` (the flag is required).

## Backend coding rules (lessons learned)

These rules are not stylistic — each one comes from a real production failure. Follow them when writing backend code.

1. **`lock: pessimistic_*` and `relations` must not appear in the same `findOne` call.** TypeORM's default `relationLoadStrategy: 'join'` turns relations into `LEFT JOIN`s, and Postgres rejects `SELECT … FOR UPDATE` over the nullable side of an outer join. Either scope the lock with `tables: ['<root_table>']` (so it becomes `FOR UPDATE OF "<root_table>"`), or split: take the lock first with a bare `manager.query('SELECT id FROM x WHERE id=$1 FOR UPDATE', [...])` (or a no-relations `findOne`), then load the relations in a second read inside the same transaction.
2. **Any new transactional / locking code path needs at least one integration test against a real Postgres** (testcontainer or local docker — not the mocked `EntityManager` we use elsewhere). Mocked tests validate control flow but not the SQL, and SQL is exactly what's at risk in this category.
3. **Mentally compile the SQL before merging a TypeORM change.** If a reviewer can't predict the resulting query within ±1 join, rewrite it as `QueryBuilder` (where the SQL is visible in the source) or split it into smaller statements. ORM API options compose in non-obvious ways at the SQL layer.
4. **`GlobalExceptionFilter` must always log non-`HttpException` errors with stack + request context** (method, URL, redacted body). Silent 500s are forbidden — they cost a full reproduce-locally cycle to debug. Covered by `backend/src/common/filters/http-exception.filter.spec.ts`; if you change the filter, keep the test passing.
5. **All HTTP requests get `[req]` / `[res]` log lines via `LoggingInterceptor`** (in `backend/src/common/interceptors/logging.interceptor.ts`), and any request body that contains PII must be summarized through `summarizeForLog` (in `backend/src/common/util/log-redact.ts`) before it touches a logger. Sensitive keys (`passenger`, `password`, `token`, `authorization`, …) collapse to `<redacted>`. Add new sensitive keys to `REDACTED_KEYS` rather than scattering ad-hoc redaction at call sites.

## Development Notes

- Use the monorepo structure to share types from `libs/shared-models`.
- The customer app currently uses mock data, but is designed to be connected to the `backend` in future iterations.
