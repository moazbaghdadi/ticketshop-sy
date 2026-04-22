import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  DashboardTripListResult,
  DashboardTripSummary,
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

  date = signal<string>('');
  page = signal<number>(1);
  result = signal<DashboardTripListResult | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  cancelTarget = signal<DashboardTripSummary | null>(null);
  cancelReason = signal<string>('');
  cancelling = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.tripsService.list({ date: this.date() || undefined, page: this.page() }).subscribe({
      next: (res) => {
        this.result.set(res.data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('تعذر تحميل الرحلات');
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

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('ar-SY', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  totalPages(total: number, pageSize: number): number {
    return Math.max(1, Math.ceil(total / pageSize));
  }
}
