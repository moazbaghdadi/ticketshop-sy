import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CITIES } from '../../data/cities.data';
import { DriverDto, DriversService } from '../../services/drivers.service';
import {
  CreateTripTemplateRequest,
  TripTemplatesService,
} from '../../services/trip-templates.service';

interface StationRow {
  cityId: string;
  arrivalTime: string;
  departureTime: string;
}

const ANCHOR_HM = '06:00';

function hmToMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function minToHm(min: number): string {
  const wrapped = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/**
 * Templates store offsets (minutes from the first station's departure). The form lets the
 * user enter HH:mm times anchored at 06:00 — purely for editing convenience. On save we
 * translate back to offsets; on load we render offsets as HH:mm relative to the same anchor.
 * The displayed times are arbitrary — only the offsets matter.
 */
@Component({
  selector: 'app-template-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './template-form.html',
  styleUrl: './template-form.css',
})
export class TemplateFormPage implements OnInit {
  private templatesService = inject(TripTemplatesService);
  private driversService = inject(DriversService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly cities = CITIES;
  templateId = signal<string | null>(null);
  loading = signal(false);

  nameAr = signal<string>('');
  driverInput = signal<string>('');
  driverId = signal<string | null>(null);
  driverSuggestions = signal<DriverDto[]>([]);
  driverDropdownOpen = signal<boolean>(false);

  stations = signal<StationRow[]>([
    { cityId: '', arrivalTime: '', departureTime: ANCHOR_HM },
    { cityId: '', arrivalTime: '', departureTime: '' },
  ]);
  prices = signal<Record<string, number | null>>({});

  submitting = signal(false);
  validationError = signal<string | null>(null);
  serverError = signal<string | null>(null);

  pairs = computed<{ from: StationRow; to: StationRow; key: string }[]>(() => {
    const stations = this.stations();
    const out: { from: StationRow; to: StationRow; key: string }[] = [];
    for (let i = 0; i < stations.length; i++) {
      for (let j = i + 1; j < stations.length; j++) {
        const from = stations[i];
        const to = stations[j];
        if (!from.cityId || !to.cityId) continue;
        out.push({ from, to, key: `${from.cityId}|${to.cityId}` });
      }
    }
    return out;
  });

  ngOnInit(): void {
    this.refreshDriverSuggestions();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.templateId.set(id);
      this.loadTemplate(id);
    }
  }

  private loadTemplate(id: string): void {
    this.loading.set(true);
    this.templatesService.get(id).subscribe({
      next: (res) => {
        const t = res.data;
        this.nameAr.set(t.nameAr);
        this.driverInput.set(t.driver.nameAr);
        this.driverId.set(t.driver.id);
        const anchor = hmToMin(ANCHOR_HM);
        const sorted = [...t.stations].sort((a, b) => a.order - b.order);
        this.stations.set(
          sorted.map((s, i) => ({
            cityId: s.cityId,
            arrivalTime: i === 0 ? '' : minToHm(anchor + s.arrivalOffsetMin),
            departureTime:
              i === sorted.length - 1 ? '' : minToHm(anchor + s.departureOffsetMin),
          })),
        );
        const priceMap: Record<string, number | null> = {};
        for (const p of t.segmentPrices) {
          priceMap[`${p.fromCityId}|${p.toCityId}`] = p.price;
        }
        this.prices.set(priceMap);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.serverError.set('تعذر جلب القالب');
      },
    });
  }

  cityName(cityId: string): string {
    return CITIES.find((c) => c.id === cityId)?.nameAr ?? cityId;
  }

  availableCities(index: number): { id: string; nameAr: string }[] {
    const used = new Set(
      this.stations()
        .map((s, i) => (i === index ? null : s.cityId))
        .filter((id): id is string => !!id),
    );
    return CITIES.filter((c) => !used.has(c.id));
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
    this.stations.set([
      ...this.stations(),
      { cityId: '', arrivalTime: '', departureTime: '' },
    ]);
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

  onDriverInput(value: string): void {
    this.driverInput.set(value);
    this.driverId.set(null);
    this.refreshDriverSuggestions();
  }

  onDriverFocus(): void {
    this.driverDropdownOpen.set(true);
    this.refreshDriverSuggestions();
  }

  onDriverBlur(): void {
    setTimeout(() => this.driverDropdownOpen.set(false), 150);
  }

  pickDriver(driver: DriverDto): void {
    this.driverInput.set(driver.nameAr);
    this.driverId.set(driver.id);
    this.driverDropdownOpen.set(false);
  }

  private refreshDriverSuggestions(): void {
    this.driversService.list(this.driverInput()).subscribe({
      next: (res) => this.driverSuggestions.set(res.data.slice(0, 8)),
      error: () => this.driverSuggestions.set([]),
    });
  }

  private validate(): string | null {
    if (!this.nameAr().trim()) return 'أدخل اسم القالب';
    if (!this.driverInput().trim()) return 'اختر السائق أو أدخل اسماً جديداً';

    const stations = this.stations();
    if (stations.length < 2) return 'يجب أن يحتوي القالب على محطتين على الأقل';

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
      if (s.arrivalTime && s.departureTime && hmToMin(s.departureTime) < hmToMin(s.arrivalTime)) {
        return `المحطة ${this.cityName(s.cityId)}: وقت الانطلاق قبل وقت الوصول`;
      }
      if (i + 1 < stations.length) {
        const next = stations[i + 1];
        const leave = s.departureTime || s.arrivalTime;
        const reach = next.arrivalTime || next.departureTime;
        if (leave && reach && hmToMin(reach) < hmToMin(leave)) {
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
    const err = this.validate();
    this.validationError.set(err);
    this.serverError.set(null);
    if (err) return;

    // Convert HH:mm fields to offsets relative to the first station's departure.
    const stations = this.stations();
    const firstDepMin = hmToMin(stations[0].departureTime);
    const driverIdValue = this.driverId();
    const body: CreateTripTemplateRequest = {
      nameAr: this.nameAr().trim(),
      driver: driverIdValue ? { id: driverIdValue } : { name: this.driverInput().trim() },
      stations: stations.map((s, i) => {
        const isFirst = i === 0;
        const isLast = i === stations.length - 1;
        const arrivalOffset = isFirst ? 0 : hmToMin(s.arrivalTime) - firstDepMin;
        const departureOffset = isLast
          ? arrivalOffset
          : isFirst
            ? 0
            : hmToMin(s.departureTime) - firstDepMin;
        return {
          cityId: s.cityId,
          order: i,
          arrivalOffsetMin: this.normalizeOffset(arrivalOffset),
          departureOffsetMin: this.normalizeOffset(departureOffset),
        };
      }),
      segmentPrices: this.pairs().map((p) => ({
        fromCityId: p.from.cityId,
        toCityId: p.to.cityId,
        price: this.priceFor(p.key)!,
      })),
    };

    this.submitting.set(true);
    const id = this.templateId();
    const obs = id ? this.templatesService.update(id, body) : this.templatesService.create(body);
    obs.subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigate(['/trips/templates']);
      },
      error: (httpErr) => {
        this.submitting.set(false);
        const e = httpErr as { error?: { message?: string | string[] } };
        const msg = e?.error?.message;
        this.serverError.set(
          typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join('، ') : 'تعذر حفظ القالب',
        );
      },
    });
  }

  /** If the user crosses midnight in the form, the diff comes out negative — wrap forward. */
  private normalizeOffset(min: number): number {
    return min < 0 ? min + 24 * 60 : min;
  }
}
