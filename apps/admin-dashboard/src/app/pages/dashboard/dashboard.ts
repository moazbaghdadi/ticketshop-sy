import { Component, inject, OnInit, signal } from '@angular/core';
import {
  CancelledTripSummary,
  DashboardOverview,
  OverviewService,
} from '../../services/overview.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardPage implements OnInit {
  private overviewService = inject(OverviewService);

  overview = signal<DashboardOverview | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.overviewService.getOverview().subscribe({
      next: (res) => {
        this.overview.set(res.data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('تعذر تحميل بيانات اللوحة');
        this.loading.set(false);
      },
    });
  }

  dismiss(trip: CancelledTripSummary): void {
    this.overviewService.dismissCancellation(trip.id).subscribe({
      next: () => {
        const current = this.overview();
        if (!current) return;
        this.overview.set({
          ...current,
          cancelledTrips: current.cancelledTrips.filter((t) => t.id !== trip.id),
        });
      },
    });
  }

  formatPrice(price: number): string {
    return price.toLocaleString('ar-SY') + ' ل.س';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('ar-SY', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
}
