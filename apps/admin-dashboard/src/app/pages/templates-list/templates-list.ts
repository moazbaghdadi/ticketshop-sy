import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CITIES } from '../../data/cities.data';
import {
  TripTemplateDto,
  TripTemplatesService,
} from '../../services/trip-templates.service';

interface InstantiateState {
  template: TripTemplateDto;
  date: string;
  firstDepartureTime: string;
  submitting: boolean;
  error: string | null;
}

@Component({
  selector: 'app-templates-list',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './templates-list.html',
  styleUrl: './templates-list.css',
})
export class TemplatesListPage implements OnInit {
  private service = inject(TripTemplatesService);
  private router = inject(Router);

  templates = signal<TripTemplateDto[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  instantiateState = signal<InstantiateState | null>(null);
  deleteTarget = signal<TripTemplateDto | null>(null);
  deleting = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (res) => {
        this.templates.set(res.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('تعذر جلب القوالب');
      },
    });
  }

  cityName(cityId: string): string {
    return CITIES.find((c) => c.id === cityId)?.nameAr ?? cityId;
  }

  routeLabel(t: TripTemplateDto): string {
    const sorted = [...t.stations].sort((a, b) => a.order - b.order);
    if (sorted.length === 0) return '—';
    return `${this.cityName(sorted[0].cityId)} ← ${this.cityName(sorted[sorted.length - 1].cityId)}`;
  }

  startInstantiate(t: TripTemplateDto): void {
    this.instantiateState.set({
      template: t,
      date: '',
      firstDepartureTime: '',
      submitting: false,
      error: null,
    });
  }

  setInstantiateDate(value: string): void {
    const s = this.instantiateState();
    if (!s) return;
    this.instantiateState.set({ ...s, date: value, error: null });
  }

  setInstantiateTime(value: string): void {
    const s = this.instantiateState();
    if (!s) return;
    this.instantiateState.set({ ...s, firstDepartureTime: value, error: null });
  }

  cancelInstantiate(): void {
    this.instantiateState.set(null);
  }

  confirmInstantiate(): void {
    const s = this.instantiateState();
    if (!s) return;
    if (!s.date || !s.firstDepartureTime) {
      this.instantiateState.set({ ...s, error: 'أدخل التاريخ ووقت الانطلاق' });
      return;
    }
    this.instantiateState.set({ ...s, submitting: true, error: null });
    this.service
      .instantiate(s.template.id, { date: s.date, firstDepartureTime: s.firstDepartureTime })
      .subscribe({
        next: () => {
          this.instantiateState.set(null);
          this.router.navigate(['/trips']);
        },
        error: (err) => {
          this.instantiateState.set({
            ...s,
            submitting: false,
            error: this.formatError(err, 'تعذر إنشاء الرحلة'),
          });
        },
      });
  }

  startDelete(t: TripTemplateDto): void {
    this.deleteTarget.set(t);
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  confirmDelete(): void {
    const t = this.deleteTarget();
    if (!t) return;
    this.deleting.set(true);
    this.service.remove(t.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteTarget.set(null);
        this.load();
      },
      error: (err) => {
        this.deleting.set(false);
        this.error.set(this.formatError(err, 'تعذر حذف القالب'));
      },
    });
  }

  private formatError(err: unknown, fallback: string): string {
    const e = err as { error?: { message?: string | string[] } };
    const msg = e?.error?.message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join('، ');
    return fallback;
  }
}
