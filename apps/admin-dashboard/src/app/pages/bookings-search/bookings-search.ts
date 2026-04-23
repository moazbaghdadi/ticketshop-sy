import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  BookingStatusFilter,
  BookingsSearchResult,
  BookingsService,
} from '../../services/bookings.service';

@Component({
  selector: 'app-bookings-search',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './bookings-search.html',
  styleUrl: './bookings-search.css',
})
export class BookingsSearchPage implements OnInit {
  private bookingsService = inject(BookingsService);

  query = signal<string>('');
  date = signal<string>('');
  status = signal<BookingStatusFilter>('all');

  page = signal<number>(1);
  result = signal<BookingsSearchResult | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.bookingsService
      .search({
        query: this.query().trim() || undefined,
        date: this.date() || undefined,
        status: this.status() === 'all' ? undefined : this.status(),
        page: this.page(),
      })
      .subscribe({
        next: (res) => {
          this.result.set(res.data);
          this.loading.set(false);
        },
        error: (err) => {
          const msg = err?.error?.message;
          this.error.set(typeof msg === 'string' ? msg : 'تعذر تحميل الحجوزات');
          this.loading.set(false);
        },
      });
  }

  applyFilter(): void {
    this.page.set(1);
    this.load();
  }

  clearFilter(): void {
    this.query.set('');
    this.date.set('');
    this.status.set('all');
    this.page.set(1);
    this.load();
  }

  hasActiveFilters(): boolean {
    return !!(this.query().trim() || this.date() || this.status() !== 'all');
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

  totalPages(total: number, pageSize: number): number {
    return Math.max(1, Math.ceil(total / pageSize));
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('ar-SY-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  formatPrice(price: number): string {
    return price.toLocaleString('ar-SY-u-nu-latn') + ' ل.س';
  }

  statusLabel(status: string, tripCancelled: boolean): string {
    if (tripCancelled) return 'الرحلة ملغاة';
    if (status === 'cancelled') return 'ملغي';
    return 'مؤكد';
  }
}
