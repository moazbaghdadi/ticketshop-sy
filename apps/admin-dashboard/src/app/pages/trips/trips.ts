import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TripTemplatesService } from '../../services/trip-templates.service';
import {
  DashboardTripListResult,
  DashboardTripSummary,
  TripSortDir,
  TripSortField,
  TripStatusFilter,
  TripsService,
} from '../../services/trips.service';

@Component({
  selector: 'app-trips',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './trips.html',
  styleUrl: './trips.css',
})
export class TripsPage implements OnInit {
  private tripsService = inject(TripsService);
  auth = inject(AuthService);

  date = signal<string>('');
  tripId = signal<string>('');
  route = signal<string>('');
  departureFrom = signal<string>('');
  departureTo = signal<string>('');
  arrivalFrom = signal<string>('');
  arrivalTo = signal<string>('');
  status = signal<TripStatusFilter>('all');

  sortBy = signal<TripSortField>('date');
  sortDir = signal<TripSortDir>('desc');

  page = signal<number>(1);
  result = signal<DashboardTripListResult | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  cancelTarget = signal<DashboardTripSummary | null>(null);
  cancelReason = signal<string>('');
  cancelling = signal(false);

  saveTemplateTarget = signal<DashboardTripSummary | null>(null);
  saveTemplateName = signal<string>('');
  savingTemplate = signal(false);
  saveTemplateError = signal<string | null>(null);
  saveTemplateSuccess = signal<string | null>(null);

  private templatesService = inject(TripTemplatesService);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.tripsService
      .list({
        date: this.date() || undefined,
        tripId: this.tripId().trim() || undefined,
        route: this.route().trim() || undefined,
        departureFrom: this.departureFrom() || undefined,
        departureTo: this.departureTo() || undefined,
        arrivalFrom: this.arrivalFrom() || undefined,
        arrivalTo: this.arrivalTo() || undefined,
        status: this.status() === 'all' ? undefined : this.status(),
        sortBy: this.sortBy(),
        sortDir: this.sortDir(),
        page: this.page(),
      })
      .subscribe({
        next: (res) => {
          this.result.set(res.data);
          this.loading.set(false);
        },
        error: (err) => {
          const msg = err?.error?.message;
          this.error.set(typeof msg === 'string' ? msg : 'تعذر تحميل الرحلات');
          this.loading.set(false);
        },
      });
  }

  applyFilter(): void {
    this.page.set(1);
    this.load();
  }

  clearFilter(): void {
    this.date.set('');
    this.tripId.set('');
    this.route.set('');
    this.departureFrom.set('');
    this.departureTo.set('');
    this.arrivalFrom.set('');
    this.arrivalTo.set('');
    this.status.set('all');
    this.sortBy.set('date');
    this.sortDir.set('desc');
    this.page.set(1);
    this.load();
  }

  hasActiveFilters(): boolean {
    return !!(
      this.date() ||
      this.tripId().trim() ||
      this.route().trim() ||
      this.departureFrom() ||
      this.departureTo() ||
      this.arrivalFrom() ||
      this.arrivalTo() ||
      this.status() !== 'all'
    );
  }

  toggleSort(field: TripSortField): void {
    if (this.sortBy() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDir.set(field === 'route' ? 'asc' : 'desc');
    }
    this.page.set(1);
    this.load();
  }

  nextPage(): void {
    const r = this.result();
    if (!r) return;
    if (this.page() * r.pageSize >= r.total) return;
    this.page.set(this.page() + 1);
    this.load();
  }

  prevPage(): void {
    if (this.page() <= 1) return;
    this.page.set(this.page() - 1);
    this.load();
  }

  openCancel(trip: DashboardTripSummary): void {
    this.cancelTarget.set(trip);
    this.cancelReason.set('');
  }

  closeCancel(): void {
    this.cancelTarget.set(null);
    this.cancelReason.set('');
  }

  confirmCancel(): void {
    const trip = this.cancelTarget();
    const reason = this.cancelReason().trim();
    if (!trip || !reason) return;

    this.cancelling.set(true);
    this.tripsService.cancel(trip.id, reason).subscribe({
      next: () => {
        this.cancelling.set(false);
        this.closeCancel();
        this.load();
      },
      error: () => {
        this.cancelling.set(false);
        this.error.set('تعذر إلغاء الرحلة');
      },
    });
  }

  openSaveAsTemplate(trip: DashboardTripSummary): void {
    this.saveTemplateTarget.set(trip);
    this.saveTemplateName.set('');
    this.saveTemplateError.set(null);
    this.saveTemplateSuccess.set(null);
  }

  closeSaveAsTemplate(): void {
    this.saveTemplateTarget.set(null);
    this.saveTemplateName.set('');
    this.saveTemplateError.set(null);
  }

  confirmSaveAsTemplate(): void {
    const trip = this.saveTemplateTarget();
    const name = this.saveTemplateName().trim();
    if (!trip || !name) {
      this.saveTemplateError.set('أدخل اسم القالب');
      return;
    }
    this.savingTemplate.set(true);
    this.saveTemplateError.set(null);
    this.templatesService.saveAsTemplate(trip.id, name).subscribe({
      next: () => {
        this.savingTemplate.set(false);
        this.saveTemplateSuccess.set('تم حفظ القالب');
        this.saveTemplateTarget.set(null);
      },
      error: (err) => {
        this.savingTemplate.set(false);
        const e = err as { error?: { message?: string | string[] } };
        const msg = e?.error?.message;
        this.saveTemplateError.set(
          typeof msg === 'string'
            ? msg
            : Array.isArray(msg)
              ? msg.join('، ')
              : 'تعذر حفظ القالب',
        );
      },
    });
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('ar-SY-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  totalPages(total: number, pageSize: number): number {
    return Math.max(1, Math.ceil(total / pageSize));
  }
}
