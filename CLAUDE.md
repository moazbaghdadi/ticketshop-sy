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

### Admin Dashboard (apps/admin-dashboard)
- **Framework:** Angular 21 standalone (mirrors customer-app). Runs on port **4201**.
- **Auth:** `AuthService` persists JWT + user in `localStorage`; `authInterceptor` attaches the token and logs the user out on 401; `authGuard` protects routes.
- **Shell:** sticky topbar + right-side sidebar (Arabic/RTL). Sidebar links: `/dashboard`, `/trips`, `/trips/new`, `/bookings`, `/reports`.
- **Routes:** `/login`, `/accept-invitation/:token`, guarded `/dashboard`, `/trips`, `/trips/new`, `/trips/:id/reservations`, `/bookings`, `/bookings/:reference`, `/reports`.
- **Trips page:** lists company trips with date filter + pagination; per-row Cancel (reason dialog) and View Reservations.
- **Reservations page:** shows the 10x4 seat layout via `<lib-seat-layout>` (read-only preview), a bookings table with Print (browser `window.print()` via a `.print-area` element + `@media print` in `styles.css`) and Email buttons, and a "new booking" modal that uses the same layout component for seat selection, allows per-seat gender toggle, and surfaces any gender-override warning returned by the backend.
- **New Trip page (`/trips/new`):** date picker + stations editor (city dropdown, arrival/departure times, move up/down, remove, add) + auto-rendered upper-triangle pair-pricing list (one row per (i&lt;j) station pair). The `availableCities()` helper prevents selecting the same city twice. Client-side validation mirrors `DashboardTripsService.validate()` — ≥2 stations, no duplicates, first-departure/last-arrival required, monotonic times, every upper-triangle price &gt; 0 — and any backend BadRequestException is surfaced verbatim. On success, navigates back to `/trips`.
- **Reports page (`/reports`):** two date pickers (defaults to first-of-month → today) + Generate. Renders totals card, per-day table, and per-route table (ordered by revenue desc). Print uses the same `visibility` trick as tickets via `body.printing-report` in `styles.css` showing only `.report-area`. An email modal pre-fills the current user's email and posts to `POST /dashboard/reports/email`.
- **Bookings search / detail (`/bookings`, `/bookings/:reference`):** cross-trip booking search via `BookingsService` with a combined query box (matches `reference` / `passengerName` / `passengerPhone` ILIKE) + date + status (`past | ongoing | cancelled`) filters, paginated at 20/page. Clicking a row opens the detail page, which defaults to read-only with a lock icon in the title bar. Unlocking enables passenger-info edits (name, phone, email) — "القيمة السابقة: …" hints are driven by a `draft vs original` signal diff and collapse automatically after a successful save (hint logic lives entirely in the component, no hint-reset RPC). Separate Cancel / Reactivate buttons flip `BookingEntity.status` via `POST .../cancel` and `POST .../reactivate`; reactivate 409s with the conflicting seat numbers if another confirmed booking has taken the seats in the interim. Print + Email actions reuse the existing `body.printing-ticket` CSS and the `POST .../email` endpoint. Booking references on the main dashboard "آخر المبيعات" table and the reservations page's bookings table link here (whole-row link on dashboard; cell-scoped `.ref-link` on reservations so Print/Email buttons keep working).

### Backend (backend)
- **Runtime:** Node.js
- **Framework:** NestJS (TypeScript, Strict Mode)
- **Persistence:** PostgreSQL via TypeORM (`synchronize: true` in development only).
- **Feature modules:** `companies/`, `auth/`, `mail/`, `trips/`, `seats/`, `bookings/`, `dashboard/`.
- **Auth:** JWT via `@nestjs/jwt` + `passport-jwt`. Users are created from invitations (CLI-only in v1). Endpoints: `POST /api/v1/auth/login`, `GET /api/v1/auth/invitations/:token`, `POST /api/v1/auth/invitations/:token/accept`, `GET /api/v1/auth/me`. Guard: `JwtAuthGuard`; decorator: `@CurrentUser()`.
- **Trips model:** a `TripEntity` is just `{ id, companyId, date }`. Route shape lives in `trip_stations` (cityId, order, arrivalTime, departureTime) and pricing lives in `trip_segment_prices` (fromCityId, toCityId, price, unique per trip+pair). Every ordered pair of stations on a trip has its own price (pair-priced). `TripsService.searchTrips(from, to, date)` finds trips whose stations include both cities with from.order < to.order and resolves the pair price.
- **Bookings model:** `BookingEntity` persists the boarding/dropoff station IDs (`boardingStationId`, `dropoffStationId`) + passenger fields (`passengerName`, `passengerPhone`, `passengerEmail` nullable). Total price = pair price for (boarding, dropoff) × seat count. `CreateBookingDto` validates nested `passenger: { name, phone, email? }` and rejects invalid boarding/dropoff combinations (not on trip, reversed order, or no segment price).
- **Dashboard trip creation:** `POST /api/v1/dashboard/trips` (guarded, scoped to the caller's `companyId`) via `DashboardTripsService.create()`; validates ≥2 unique stations, monotonic times, and a positive price for every (i<j) station pair.
- **Trip cancellation:** `POST /api/v1/dashboard/trips/:id/cancel` `{ reason }` marks `TripEntity.cancelledAt/cancelledReason` and sets `status='cancelled'` on all of the trip's bookings; `POST /api/v1/dashboard/trips/:id/dismiss-cancellation` records a per-user dismissal in `cancelled_trip_dismissals` (unique on `(userId, tripId)`). `BookingResponse` exposes `tripCancelled`, `tripCancelledAt`, `tripCancelledReason` so the customer confirmation page renders a cancellation banner.
- **Email:** `MailModule` exports a stub `EmailService.send({ to, subject, body })` that only logs; real SMTP comes later.
- **Overview endpoint:** `GET /api/v1/dashboard/overview` returns `{ upcomingTrips[5], latestSales[10], balance, cancelledTrips }` scoped to the caller's company. Upcoming trips exclude cancelled ones; `cancelledTrips` covers the last 30 days and filters out any the current user has already dismissed.
- **Dashboard trips list:** `GET /api/v1/dashboard/trips?date=&page=` (pageSize 20, sorted by date desc) and `GET /api/v1/dashboard/trips/:id/bookings` (trip detail + bookings). Both scoped to the caller's `companyId` (cross-company returns 403 from the `bookings` endpoint; the list endpoint simply filters).
- **Dashboard bookings:** `POST /api/v1/dashboard/bookings` accepts the same `CreateBookingDto` as the customer endpoint but calls `BookingsService.createBookingInternal({ enforceGender: false })`; the response envelope is `{ data: BookingResponse, warning: string | null }` — a gender violation surfaces in `warning` without blocking. `POST /api/v1/dashboard/bookings/:reference/email` sends a stub email for the booking (400 if no `passengerEmail`, 403 cross-company). `GET /api/v1/dashboard/bookings?query=&date=&status=&page=` (pageSize 20, ordered by `createdAt DESC`) returns `{ bookings, total, page, pageSize }` scoped to the caller's `companyId`; `query` ILIKE-matches any of reference / passenger name / phone; `status ∈ past | ongoing | cancelled | all` — `past` and `ongoing` imply `booking.status='confirmed'` and compare `trip.date` against `CURRENT_DATE`, while `cancelled` matches `booking.status='cancelled'` (covers both per-booking and trip-cascade cancellations). `GET /dashboard/bookings/:reference` and `PATCH /dashboard/bookings/:reference` return / update a single booking — PATCH accepts `{ passenger: { name?, phone?, email? } }` only and 400s if the booking is cancelled (nudging the agent to Reactivate). `POST .../cancel` flips `status='confirmed' → 'cancelled'` (400 if already cancelled or trip-level cancelled). `POST .../reactivate` flips it back after re-scanning other confirmed bookings on the trip for seat conflicts → 409 with the overlapping seat numbers if any; 400 if the trip itself is cancelled. All routes are company-scoped via `JwtAuthGuard` + `booking.trip.companyId` check → 403 cross-company.
- **Dashboard reports:** `GET /api/v1/dashboard/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` returns `{ totals, perDay, perRoute }` aggregated from confirmed bookings whose trip date falls in the inclusive range, scoped to the caller's `companyId`. `POST /api/v1/dashboard/reports/email` accepts `{ from, to, recipient }` and dispatches a rendered HTML body via the stub `EmailService`. `perRoute` is sorted by revenue desc; `perDay` by date asc. Invalid dates or inverted ranges → 400.
- **Env vars (new):** `JWT_SECRET`, `JWT_EXPIRES_IN` (default `7d`), `DASHBOARD_BASE_URL` (used by the invite CLI when printing the acceptance URL).
- **Seeder:** `npm run seed` (from the `backend` workspace) rebuilds companies → trips → mock bookings.
- **Invite CLI:** `npm run invite --workspace backend -- --email=<email> --companyId=<uuid>` inserts an invitation row and prints the acceptance URL.

### Shared Library (libs/shared-models)
- **Purpose:** Shared TypeScript types and interfaces between frontend and backend.
- `Trip.company` is a `{ id: string; nameAr: string }` — companies are first-class entities.
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
npm run invite -w backend -- --email=<email> --companyId=<uuid>   # Issue an invitation
```

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
- **Database schema changes** → `synchronize: true` runs in dev; on Railway this means a deploy can silently alter the prod schema. Flag any entity/column change loudly.
- **Port / URL assumptions** — anything hardcoded to `localhost:3000` / `:4200` / `:4201` is a deploy-break.

When in doubt, say so explicitly in the final summary ("⚠ This adds env var X — set it in Railway before deploying"). Silent breakage is the failure mode to avoid.

## Development Notes

- Use the monorepo structure to share types from `libs/shared-models`.
- The customer app currently uses mock data, but is designed to be connected to the `backend` in future iterations.
