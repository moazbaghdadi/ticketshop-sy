import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BookingResponse } from '@ticketshop-sy/shared-models';
import { ApiService } from '../../services/api.service';
import { BookingService } from '../../services/booking.service';

@Component({
  selector: 'app-confirmation',
  standalone: true,
  templateUrl: './confirmation.html',
  styleUrl: './confirmation.css',
})
export class ConfirmationPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private booking = inject(BookingService);

  response = signal<BookingResponse | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  exportingPdf = signal(false);

  ticketRef = viewChild<ElementRef<HTMLElement>>('ticketRef');

  trip = computed(() => this.response()?.trip ?? null);
  seatNumbers = computed(() => this.response()?.seats.join('، ') ?? '');
  totalPrice = computed(() => this.response()?.totalPrice ?? 0);
  reference = computed(() => this.response()?.reference ?? '');
  passenger = computed(() => this.response()?.passenger ?? null);

  paymentLabel = computed(() => {
    const method = this.response()?.paymentMethod;
    if (method === 'sham-cash') return 'شام كاش';
    if (method === 'syriatel-cash') return 'سيرياتيل كاش';
    return '';
  });

  ngOnInit(): void {
    const ref = this.route.snapshot.paramMap.get('reference');
    if (!ref) {
      this.router.navigate(['/']);
      return;
    }

    // Try to use in-memory booking response first (just completed payment)
    const cached = this.booking.bookingResponse();
    if (cached && cached.reference === ref) {
      this.response.set(cached);
      this.loading.set(false);
      return;
    }

    // Otherwise fetch from backend (page refresh / direct link)
    this.api.getBooking(ref).subscribe({
      next: (res) => {
        this.response.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('لم يتم العثور على الحجز.');
        this.loading.set(false);
      },
    });
  }

  formatPrice(price: number): string {
    return price.toLocaleString('ar-SY-u-nu-latn') + ' ل.س';
  }

  goHome(): void {
    this.booking.reset();
    this.router.navigate(['/']);
  }

  printTicket(): void {
    const reference = this.reference();
    const previousTitle = document.title;
    if (reference) document.title = `Ticket-${reference}`;
    document.body.classList.add('printing-ticket');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('printing-ticket');
      document.title = previousTitle;
    }, 50);
  }

  async downloadPdf(): Promise<void> {
    const node = this.ticketRef()?.nativeElement;
    const reference = this.reference();
    if (!node || this.exportingPdf()) return;

    this.exportingPdf.set(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(node, { backgroundColor: '#ffffff', scale: 2 });
      const imageData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 32;
      const maxWidth = pageWidth - margin * 2;
      const ratio = canvas.height / canvas.width;
      const renderWidth = maxWidth;
      const renderHeight = renderWidth * ratio;
      pdf.addImage(imageData, 'PNG', margin, margin, renderWidth, renderHeight);
      pdf.save(`ticket-${reference || 'booking'}.pdf`);
    } finally {
      this.exportingPdf.set(false);
    }
  }
}
