import { City, Trip, Seat } from '../models/booking.model';

const COMPANIES = ['الأهلية', 'القدموس', 'الزنوبية', 'النورس', 'الأمانة'];

const TRIP_TEMPLATES = [
  { depHour: 6, depMin: 0 },
  { depHour: 7, depMin: 30 },
  { depHour: 9, depMin: 0 },
  { depHour: 11, depMin: 15 },
  { depHour: 13, depMin: 0 },
  { depHour: 15, depMin: 30 },
  { depHour: 18, depMin: 0 },
];

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} دقيقة`;
  if (m === 0) return `${h} ساعات`;
  return `${h} ساعات و ${m} دقيقة`;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

export function generateTrips(from: City, to: City, date: string): Trip[] {
  const seed = (from.id + to.id + date).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = seededRandom(seed);

  const baseDuration = 120 + Math.floor(rand() * 180);
  const basePrice = 25000 + Math.floor(rand() * 50000);

  return TRIP_TEMPLATES.map((t, i) => {
    const durationVariance = Math.floor(rand() * 60) - 30;
    const durationMinutes = Math.max(60, baseDuration + durationVariance);
    const arrivalMinutes = t.depHour * 60 + t.depMin + durationMinutes;
    const arrHour = Math.floor(arrivalMinutes / 60) % 24;
    const arrMin = arrivalMinutes % 60;
    const priceVariance = Math.floor(rand() * 15000) - 5000;
    const stops = Math.floor(rand() * 4);

    return {
      id: `trip-${from.id}-${to.id}-${date}-${i}`,
      from,
      to,
      company: COMPANIES[Math.floor(rand() * COMPANIES.length)],
      departureTime: `${pad(t.depHour)}:${pad(t.depMin)}`,
      arrivalTime: `${pad(arrHour)}:${pad(arrMin)}`,
      duration: formatDuration(durationMinutes),
      durationMinutes,
      stops,
      price: Math.round((basePrice + priceVariance) / 1000) * 1000,
      date,
    };
  });
}

export function generateSeats(tripSeed: number = 42): Seat[] {
  const rand = seededRandom(tripSeed);
  const seats: Seat[] = [];
  let id = 1;

  for (let row = 0; row < 10; row++) {
    // Each side (left pair cols 0-1, right pair cols 2-3) gets one consistent gender
    // for all its occupied seats so no mixed-gender pairs exist pre-occupied
    const leftGender: 'male' | 'female' = rand() < 0.5 ? 'male' : 'female';
    const rightGender: 'male' | 'female' = rand() < 0.5 ? 'male' : 'female';

    for (let col = 0; col < 4; col++) {
      const isOccupied = rand() < 0.3;
      const seatGender: 'male' | 'female' = col < 2 ? leftGender : rightGender;
      seats.push({
        id: id++,
        row,
        col,
        status: isOccupied ? 'occupied' : 'available',
        gender: isOccupied ? seatGender : undefined,
      });
    }
  }
  return seats;
}
