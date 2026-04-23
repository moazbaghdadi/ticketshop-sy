import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BookingResponse } from '@ticketshop-sy/shared-models';
import {
  BookingsService,
  UpdateBookingRequest,
} from '../../services/bookings.service';

type PassengerDraft = {
  name: string;
  phone: string;
  email: string;
};

const emptyDraft: PassengerDraft = { name: '', phone: '', email: '' };

@Component({
  selector: 'app-booking-detail',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './booking-detail.html',
  styleUrl: './booking-detail.css',
})
export class BookingDetailPage implements OnInit {
  private bookingsService = inject(BookingsService);
  private route = inject(ActivatedRoute);

  reference = signal<string>('');
  booking = signal<BookingResponse | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  locked = signal(true);
  draft = signal<PassengerDraft>({ ...emptyDraft });
  original = signal<PassengerDraft>({ ...emptyDraft });
  saving = signal(false);
  saveError = signal<string | null>(null);

  cancelling = signal(false);
  reactivating = signal(false);
  actionError = signal<string | null>(null);
  showCancelConfirm = signal(false);

  printing = signal(false);
  emailSending = signal(false);
  emailNotice = signal<string | null>(null);

  canEdit = computed(() => {
    const b = this.booking();
    return !!b && b.status !== 'cancelled' && !b.tripCancelled;
  });

  hasChanges = computed(() => {
    const d = this.draft();
    const o = this.original();
    return d.name !== o.name || d.phone !== o.phone || d.email !== o.email;
  });

  ngOnInit(): void {
    this.reference.set(this.route.snapshot.paramMap.get('reference') ?? '');
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.bookingsService.getDetail(this.reference()).subscribe({
      next: (res) => {
        this.populate(res.data);
        this.loading.set(false);
      },
      error: (err) => {
        const msg = err?.error?.message;
        this.error.set(typeof msg === 'string' ? msg : 'تعذر تحميل الحجز');
        this.loading.set(false);
      },
    });
  }

  private populate(booking: BookingResponse): void {
    this.booking.set(booking);
    const snapshot: PassengerDraft = {
      name: booking.passenger.name ?? '',
      phone: booking.passenger.phone ?? '',
      email: booking.passenger.email ?? '',
    };
    this.draft.set({ ...snapshot });
    this.original.set({ ...snapshot });
    this.locked.set(true);
    this.saveError.set(null);
    this.actionError.set(null);
  }

  toggleLock(): void {
    if (!this.canEdit()) return;
    if (this.locked()) {
      this.locked.set(false);
      this.saveError.set(null);
    } else {
      this.cancelEdit();
    }
  }

  updateDraft(field: keyof PassengerDraft, value: string): void {
    this.draft.set({ ...this.draft(), [field]: value });
  }

  isChanged(field: keyof PassengerDraft): boolean {
    return this.draft()[field] !== this.original()[field];
  }

  cancelEdit(): void {
    this.draft.set({ ...this.original() });
    this.locked.set(true);
    this.saveError.set(null);
  }

  save(): void {
    if (!this.hasChanges()) {
      this.locked.set(true);
      return;
    }
    const d = this.draft();
    const o = this.original();
    const body: UpdateBookingRequest = { passenger: {} };
    if (d.name !== o.name) body.passenger.name = d.name.trim();
    if (d.phone !== o.phone) body.passenger.phone = d.phone.trim();
    if (d.email !== o.email) {
      const trimmed = d.email.trim();
      body.passenger.email = trimmed === '' ? null : trimmed;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.bookingsService.update(this.reference(), body).subscribe({
      next: (res) => {
        this.populate(res.data);
        this.saving.set(false);
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(this.extractError(err, 'تعذر حفظ التعديلات'));
      },
    });
  }

  openCancelConfirm(): void {
    this.actionError.set(null);
    this.showCancelConfirm.set(true);
  }

  closeCancelConfirm(): void {
    this.showCancelConfirm.set(false);
  }

  confirmCancel(): void {
    this.cancelling.set(true);
    this.actionError.set(null);
    this.bookingsService.cancel(this.reference()).subscribe({
      next: (res) => {
        this.populate(res.data);
        this.cancelling.set(false);
        this.showCancelConfirm.set(false);
      },
      error: (err) => {
        this.cancelling.set(false);
        this.showCancelConfirm.set(false);
        this.actionError.set(this.extractError(err, 'تعذر إلغاء الحجز'));
      },
    });
  }

  reactivate(): void {
    this.reactivating.set(true);
    this.actionError.set(null);
    this.bookingsService.reactivate(this.reference()).subscribe({
      next: (res) => {
        this.populate(res.data);
        this.reactivating.set(false);
      },
      error: (err) => {
        this.reactivating.set(false);
        this.actionError.set(this.extractError(err, 'تعذر إعادة تفعيل الحجز'));
      },
    });
  }

  print(): void {
    if (!this.booking()) return;
    const b = this.booking()!;
    const title = document.title;
    document.title = `Ticket-${b.reference}`;
    document.body.classList.add('printing-ticket');
    this.printing.set(true);
    setTimeout(() => {
      window.print();
      document.body.classList.remove('printing-ticket');
      document.title = title;
      this.printing.set(false);
    }, 50);
  }

  emailTicket(): void {
    const b = this.booking();
    if (!b?.passenger.email) return;
    this.emailSending.set(true);
    this.emailNotice.set(null);
    this.bookingsService.email(b.reference).subscribe({
      next: () => {
        this.emailSending.set(false);
        this.emailNotice.set(`تم إرسال التذكرة إلى ${b.passenger.email}`);
      },
      error: (err) => {
        this.emailSending.set(false);
        this.emailNotice.set(this.extractError(err, 'تعذر إرسال التذكرة'));
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

  formatPrice(price: number): string {
    return price.toLocaleString('ar-SY-u-nu-latn') + ' ل.س';
  }

  paymentLabel(method: string): string {
    if (method === 'sham-cash') return 'شام كاش';
    if (method === 'syriatel-cash') return 'سيريتل كاش';
    return method;
  }

  private extractError(err: unknown, fallback: string): string {
    const anyErr = err as { error?: { message?: string | string[] } };
    const msg = anyErr?.error?.message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join('، ');
    return fallback;
  }
}
