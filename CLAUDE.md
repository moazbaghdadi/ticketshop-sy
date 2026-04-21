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
│   └── shared-ui/           # Shared Angular components (empty placeholder — seat layout to come)
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
- **Shell:** sticky topbar + right-side sidebar (Arabic/RTL). Sidebar currently has one active link (`/dashboard`); later commits will enable Trips / New Trip / Reports.
- **Routes:** `/login`, `/accept-invitation/:token`, guarded `/dashboard`.

### Backend (backend)
- **Runtime:** Node.js
- **Framework:** NestJS (TypeScript, Strict Mode)
- **Persistence:** PostgreSQL via TypeORM (`synchronize: true` in development only).
- **Feature modules:** `companies/`, `auth/`, `mail/`, `trips/`, `seats/`, `bookings/`.
- **Auth:** JWT via `@nestjs/jwt` + `passport-jwt`. Users are created from invitations (CLI-only in v1). Endpoints: `POST /api/v1/auth/login`, `GET /api/v1/auth/invitations/:token`, `POST /api/v1/auth/invitations/:token/accept`, `GET /api/v1/auth/me`. Guard: `JwtAuthGuard`; decorator: `@CurrentUser()`.
- **Trips model:** a `TripEntity` is just `{ id, companyId, date }`. Route shape lives in `trip_stations` (cityId, order, arrivalTime, departureTime) and pricing lives in `trip_segment_prices` (fromCityId, toCityId, price, unique per trip+pair). Every ordered pair of stations on a trip has its own price (pair-priced). `TripsService.searchTrips(from, to, date)` finds trips whose stations include both cities with from.order < to.order and resolves the pair price.
- **Bookings model:** `BookingEntity` persists the boarding/dropoff station IDs (`boardingStationId`, `dropoffStationId`) + passenger fields (`passengerName`, `passengerPhone`, `passengerEmail` nullable). Total price = pair price for (boarding, dropoff) × seat count. `CreateBookingDto` validates nested `passenger: { name, phone, email? }` and rejects invalid boarding/dropoff combinations (not on trip, reversed order, or no segment price).
- **Dashboard trip creation:** `POST /api/v1/dashboard/trips` (guarded, scoped to the caller's `companyId`) via `DashboardTripsService.create()`; validates ≥2 unique stations, monotonic times, and a positive price for every (i<j) station pair.
- **Trip cancellation:** `POST /api/v1/dashboard/trips/:id/cancel` `{ reason }` marks `TripEntity.cancelledAt/cancelledReason` and sets `status='cancelled'` on all of the trip's bookings; `POST /api/v1/dashboard/trips/:id/dismiss-cancellation` records a per-user dismissal in `cancelled_trip_dismissals` (unique on `(userId, tripId)`). `BookingResponse` exposes `tripCancelled`, `tripCancelledAt`, `tripCancelledReason` so the customer confirmation page renders a cancellation banner.
- **Email:** `MailModule` exports a stub `EmailService.send({ to, subject, body })` that only logs; real SMTP comes later.
- **Env vars (new):** `JWT_SECRET`, `JWT_EXPIRES_IN` (default `7d`), `DASHBOARD_BASE_URL` (used by the invite CLI when printing the acceptance URL).
- **Seeder:** `npm run seed` (from the `backend` workspace) rebuilds companies → trips → mock bookings.
- **Invite CLI:** `npm run invite --workspace backend -- --email=<email> --companyId=<uuid>` inserts an invitation row and prints the acceptance URL.

### Shared Library (libs/shared-models)
- **Purpose:** Shared TypeScript types and interfaces between frontend and backend.
- `Trip.company` is a `{ id: string; nameAr: string }` — companies are first-class entities.
- `Trip.stations` is a `TripStation[]` carrying the full ordered route (cityId, nameAr, order, arrivalTime, departureTime). `Trip.from/to/departureTime/arrivalTime/duration/durationMinutes/stops/price` are **derived for the searched pair** — `price` is the segment price for that exact pair; `stops` counts intermediates strictly between `from` and `to`.

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

The customer app is configured for deployment to GitHub Pages.
Run `npm run deploy:app` from the root to build and deploy.

## Development Notes

- Use the monorepo structure to share types from `libs/shared-models`.
- The customer app currently uses mock data, but is designed to be connected to the `backend` in future iterations.
