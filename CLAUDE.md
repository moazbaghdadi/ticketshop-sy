# TicketShop Syria

Arabic (RTL) mobile-first click-dummy for a Syrian regional bus ticket booking app. Built with Angular 21, standalone components, and Angular Material. No real backend — all data is hardcoded mock data.

## Tech Stack

- Angular 21 (standalone components, signals API)
- Angular Material (icons, fonts, theming)
- Pure CSS styling (no Tailwind/Bootstrap)
- RTL layout (`dir="rtl" lang="ar"`)

## Project Structure

```
src/app/
  models/booking.model.ts          # City, Trip, Seat, SeatGender, PaymentMethod interfaces
  data/cities.data.ts              # 12 Syrian cities
  data/trips.data.ts               # Mock trip generator + seeded seat generator (with gender)
  services/booking.service.ts      # Signal-based shared state across pages
  shared/header/                   # Reusable header with gradient + back button
  pages/
    home/                          # Search page (from/to cities, date)
    home/city-selector/            # Full-screen city picker modal
    timetable/                     # Trip results with date scroll, trip cards, sort bar
    seat-selection/                # CSS Grid bus seat map (2+aisle+2) with gender coloring
    payment/                       # Sham Cash / Syriatel Cash selection
    confirmation/                  # Ticket display with booking ref + QR placeholder
```

## Flow

1. Home → select cities + date → Search
2. Timetable → sort by departure time / duration / price → tap a trip
3. Seat Selection → pick active gender (male/female) → tap seats → Continue
4. Payment → pick payment method → Pay
5. Confirmation → view ticket → Back to Home

## Running

```bash
ng serve        # dev server on http://localhost:4200
ng build        # production build to dist/
```

## Deployment (GitHub Pages)

The app is deployed to GitHub Pages via `angular-cli-ghpages`:

```bash
ng deploy --base-href=/ticketshop-sy/
```

Live URL: `https://<github-username>.github.io/ticketshop-sy/`

## Current State

- All 5 pages implemented and working end-to-end
- Full Arabic UI, RTL layout
- Mobile-first responsive design (optimized for ~375px width)
- Mock data: 12 cities, 5 bus companies (الأهلية، القدموس، الزنوبية، النورس، الأمانة)
- Prices in SYP, seeded trip and seat generation per route/date
- **Seat gender system**: occupied seats are pre-colored blue (male) / pink (female); user picks active gender before selecting seats; gender-proximity validation blocks conflicting bookings; same-session bookings exempt (family/group rule)
- **Timetable sorting**: sort by departure time (default), trip duration, or price
- **Color palette**: indigo (#4338CA) primary + amber (#D97706) accent; gradient headers
- No tests written (click-dummy, not production code)
- No authentication, no backend, no real payments
