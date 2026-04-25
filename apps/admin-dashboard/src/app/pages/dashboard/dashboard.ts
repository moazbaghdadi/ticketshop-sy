import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import {
  CancelledTripSummary,
  DashboardOverview,
  OverviewService,
} from '../../services/overview.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, BaseChartDirective],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardPage implements OnInit {
  private overviewService = inject(OverviewService);

  overview = signal<DashboardOverview | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  revenueTrendData = computed<ChartConfiguration<'line'>['data']>(() => {
    const series = this.overview()?.salesLast30Days ?? [];
    return {
      labels: series.map((p) => this.formatShortDate(p.date)),
      datasets: [
        {
          data: series.map((p) => p.revenue),
          label: 'الإيرادات',
          borderColor: '#4338ca',
          backgroundColor: 'rgba(67, 56, 202, 0.12)',
          pointBackgroundColor: '#4338ca',
          pointRadius: 2,
          borderWidth: 2,
          fill: true,
          tension: 0.3,
        },
      ],
    };
  });

  revenueTrendOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => this.formatPrice(Number(ctx.parsed.y)),
        },
      },
    },
    scales: {
      x: {
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10,
          color: '#6b7280',
        },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: '#6b7280',
          callback: (value) => this.formatCompact(Number(value)),
        },
        grid: { color: '#e5e7eb' },
      },
    },
  };

  topRoutesData = computed<ChartConfiguration<'bar'>['data']>(() => {
    const routes = this.overview()?.topRoutes ?? [];
    return {
      labels: routes.map((r) => `${r.fromCity} ← ${r.toCity}`),
      datasets: [
        {
          data: routes.map((r) => r.revenue),
          label: 'الإيرادات',
          backgroundColor: 'rgba(217, 119, 6, 0.85)',
          borderColor: '#d97706',
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    };
  });

  topRoutesOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => this.formatPrice(Number(ctx.parsed.x)),
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          color: '#6b7280',
          callback: (value) => this.formatCompact(Number(value)),
        },
        grid: { color: '#e5e7eb' },
      },
      y: {
        ticks: { color: '#111827' },
        grid: { display: false },
      },
    },
  };

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
    return price.toLocaleString('ar-SY-u-nu-latn') + ' ل.س';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('ar-SY-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  private formatShortDate(iso: string): string {
    const d = new Date(iso);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${dd}/${mm}`;
  }

  private formatCompact(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
    return value.toString();
  }
}
