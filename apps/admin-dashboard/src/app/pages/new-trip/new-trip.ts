import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CITIES } from '../../data/cities.data';
import { DriverDto, DriversService } from '../../services/drivers.service';
import {
  CreateDashboardTripRequest,
  TripsService,
} from '../../services/trips.service';

interface StationRow {
  cityId: string;
  arrivalTime: string;
  departureTime: string;
}

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

@Component({
  selector: 'app-new-trip',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './new-trip.html',
  styleUrl: './new-trip.css',
})
export class NewTripPage implements OnInit {
  private tripsService = inject(TripsService);
  private driversService = inject(DriversService);
  private router = inject(Router);

  readonly cities = CITIES;

  date = signal<string>('');
  stations = signal<StationRow[]>([
    { cityId: '', arrivalTime: '', departureTime: '' },
    { cityId: '', arrivalTime: '', departureTime: '' },
  ]);
  prices = signal<Record<string, number | null>>({});

  /**
   * Driver autocomplete state. The user types a name; we ILIKE-search the backend on focus
   * and on each keystroke. If they pick a suggestion, driverId is set; if they keep typing
   * a new name, driverId stays null and the backend find-or-creates by name on submit.
   */
  driverInput = signal<string>('');
  driverId = signal<string | null>(null);
  driverSuggestions = signal<DriverDto[]>([]);
  driverDropdownOpen = signal<boolean>(false);

  /** "Save as template" checkbox + name. Backend writes both rows in one transaction. */
  saveAsTemplate = signal<boolean>(false);
  templateName = signal<string>('');

  submitting = signal(false);
  serverError = signal<string | null>(null);
  validationError = signal<string | null>(null);

  pairs = computed<{ from: StationRow; to: StationRow; fromIndex: number; toIndex: number; key: string }[]>(() => {
    const stations = this.stations();
    const out: { from: StationRow; to: StationRow; fromIndex: number; toIndex: number; key: string }[] = [];
    for (let i = 0; i < stations.length; i++) {
      for (let j = i + 1; j < stations.length; j++) {
        const from = stations[i];
        const to = stations[j];
        if (!from.cityId || !to.cityId) continue;
        out.push({
          from,
          to,
          fromIndex: i,
          toIndex: j,
          key: `${from.cityId}|${to.cityId}`,
        });
      }
    }
    return out;
  });

  ngOnInit(): void {
    this.refreshDriverSuggestions();
  }

  cityName(cityId: string): string {
    return CITIES.find(c => c.id === cityId)?.nameAr ?? cityId;
  }

  onDriverInput(value: string): void {
    this.driverInput.set(value);
    // The user is typing freely → drop any previously locked-in driver id; if they end on a
    // typed-from-scratch name, the backend will find-or-create it on submit.
    this.driverId.set(null);
    this.refreshDriverSuggestions();
  }

  onDriverFocus(): void {
    this.driverDropdownOpen.set(true);
    this.refreshDriverSuggestions();
  }

  onDriverBlur(): void {
    // Defer so an option click registers before we close.
    setTimeout(() => this.driverDropdownOpen.set(false), 150);
  }

  pickDriver(driver: DriverDto): void {
    this.driverInput.set(driver.nameAr);
    this.driverId.set(driver.id);
    this.driverDropdownOpen.set(false);
  }

  private refreshDriverSuggestions(): void {
    this.driversService.list(this.driverInput()).subscribe({
      next: res => this.driverSuggestions.set(res.data.slice(0, 8)),
      error: () => this.driverSuggestions.set([]),
    });
  }

  availableCities(index: number): { id: string; nameAr: string }[] {
    const used = new Set(
      this.stations()
        .map((s, i) => (i === index ? null : s.cityId))
        .filter((id): id is string => !!id),
    );
    return CITIES.filter(c => !used.has(c.id));
  }

  setCity(index: number, cityId: string): void {
    this.updateStation(index, { cityId });
  }

  setArrival(index: number, value: string): void {
    this.updateStation(index, { arrivalTime: value });
  }

  setDeparture(index: number, value: string): void {
    this.updateStation(index, { departureTime: value });
  }

  private updateStation(index: number, patch: Partial<StationRow>): void {
    const next = [...this.stations()];
    next[index] = { ...next[index], ...patch };
    this.stations.set(next);
  }

  addStation(): void {
    this.stations.set([...this.stations(), { cityId: '', arrivalTime: '', departureTime: '' }]);
  }

  removeStation(index: number): void {
    if (this.stations().length <= 2) return;
    const next = this.stations().filter((_, i) => i !== index);
    this.stations.set(next);
  }

  moveUp(index: number): void {
    if (index === 0) return;
    const next = [...this.stations()];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    this.stations.set(next);
  }

  moveDown(index: number): void {
    if (index >= this.stations().length - 1) return;
    const next = [...this.stations()];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    this.stations.set(next);
  }

  priceFor(key: string): number | null {
    return this.prices()[key] ?? null;
  }

  setPrice(key: string, value: number | string | null): void {
    if (value === null || value === '' || value === undefined) {
      this.prices.set({ ...this.prices(), [key]: null });
      return;
    }
    const parsed = Number(value);
    this.prices.set({ ...this.prices(), [key]: Number.isFinite(parsed) ? parsed : null });
  }

  private validate(): string | null {
    if (!this.date()) return 'اختر تاريخ الرحلة';
    if (!this.driverInput().trim()) return 'اختر السائق أو أدخل اسماً جديداً';

    const stations = this.stations();
    if (stations.length < 2) return 'يجب أن تحتوي الرحلة على محطتين على الأقل';

    const cityIds = new Set<string>();
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      if (!s.cityId) return `اختر مدينة المحطة رقم ${i + 1}`;
      if (cityIds.has(s.cityId)) return `المدينة ${this.cityName(s.cityId)} مكررة`;
      cityIds.add(s.cityId);
    }

    const first = stations[0];
    const last = stations[stations.length - 1];
    if (!first.departureTime) return 'يجب إدخال وقت الانطلاق للمحطة الأولى';
    if (!last.arrivalTime) return 'يجب إدخال وقت الوصول للمحطة الأخيرة';
    for (let i = 1; i < stations.length - 1; i++) {
      const s = stations[i];
      if (!s.arrivalTime || !s.departureTime) {
        return `المحطة رقم ${i + 1} تحتاج وقت وصول ووقت انطلاق`;
      }
    }

    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      if (s.arrivalTime && s.departureTime && hmToMinutes(s.departureTime) < hmToMinutes(s.arrivalTime)) {
        return `المحطة ${this.cityName(s.cityId)}: وقت الانطلاق قبل وقت الوصول`;
      }
      if (i + 1 < stations.length) {
        const next = stations[i + 1];
        const leave = s.departureTime || s.arrivalTime;
        const reach = next.arrivalTime || next.departureTime;
        if (leave && reach && hmToMinutes(reach) < hmToMinutes(leave)) {
          return `الانتقال من ${this.cityName(s.cityId)} إلى ${this.cityName(next.cityId)}: الأوقات غير تصاعدية`;
        }
      }
    }

    for (const pair of this.pairs()) {
      const price = this.priceFor(pair.key);
      if (price === null || price <= 0) {
        return `أدخل سعراً موجباً للمسار ${this.cityName(pair.from.cityId)} ← ${this.cityName(pair.to.cityId)}`;
      }
    }

    return null;
  }

  submit(): void {
    const error = this.validate();
    this.validationError.set(error);
    this.serverError.set(null);
    if (error) return;

    if (this.saveAsTemplate() && !this.templateName().trim()) {
      this.validationError.set('أدخل اسماً للقالب أو ألغِ خيار الحفظ كقالب');
      return;
    }

    const stations = this.stations();
    const driverId = this.driverId();
    const body: CreateDashboardTripRequest = {
      date: this.date(),
      driver: driverId ? { id: driverId } : { name: this.driverInput().trim() },
      stations: stations.map((s, i) => ({
        cityId: s.cityId,
        order: i,
        arrivalTime: s.arrivalTime || null,
        departureTime: s.departureTime || null,
      })),
      segmentPrices: this.pairs().map(p => ({
        fromCityId: p.from.cityId,
        toCityId: p.to.cityId,
        price: this.priceFor(p.key)!,
      })),
      saveAsTemplate: this.saveAsTemplate() || undefined,
      templateName: this.saveAsTemplate() ? this.templateName().trim() : undefined,
    };

    this.submitting.set(true);
    this.tripsService.createTrip(body).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigate(['/trips']);
      },
      error: err => {
        this.submitting.set(false);
        const msg =
          typeof err?.error?.message === 'string'
            ? err.error.message
            : Array.isArray(err?.error?.message)
              ? err.error.message.join('، ')
              : 'تعذر حفظ الرحلة';
        this.serverError.set(msg);
      },
    });
  }
}
