import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { DashboardReport, ReportsService } from '../../services/reports.service';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class ReportsPage implements OnInit {
  private reportsService = inject(ReportsService);
  auth = inject(AuthService);

  from = signal<string>('');
  to = signal<string>('');
  report = signal<DashboardReport | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  showEmailModal = signal(false);
  emailRecipient = signal<string>('');
  sending = signal(false);
  sendError = signal<string | null>(null);

  ngOnInit(): void {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    this.from.set(this.toIso(firstOfMonth));
    this.to.set(this.toIso(today));
    this.emailRecipient.set(this.auth.user()?.email ?? '');
  }

  canGenerate(): boolean {
    return !!this.from() && !!this.to() && this.from() <= this.to() && !this.loading();
  }

  generate(): void {
    if (!this.canGenerate()) return;
    this.loading.set(true);
    this.error.set(null);
    this.reportsService.generate(this.from(), this.to()).subscribe({
      next: (res) => {
        this.report.set(res.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.messageFrom(err, 'تعذر إنشاء التقرير'));
      },
    });
  }

  printReport(): void {
    const title = document.title;
    document.title = `Report-${this.from()}_${this.to()}`;
    document.body.classList.add('printing-report');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('printing-report');
      document.title = title;
    }, 50);
  }

  openEmailModal(): void {
    this.sendError.set(null);
    this.emailRecipient.set(this.auth.user()?.email ?? '');
    this.showEmailModal.set(true);
  }

  closeEmailModal(): void {
    this.showEmailModal.set(false);
  }

  sendEmail(): void {
    const recipient = this.emailRecipient().trim();
    if (!recipient) return;
    this.sending.set(true);
    this.sendError.set(null);
    this.reportsService.email(this.from(), this.to(), recipient).subscribe({
      next: () => {
        this.sending.set(false);
        this.showEmailModal.set(false);
        alert('تم إرسال التقرير إلى ' + recipient);
      },
      error: (err) => {
        this.sending.set(false);
        this.sendError.set(this.messageFrom(err, 'تعذر إرسال التقرير'));
      },
    });
  }

  formatPrice(value: number): string {
    return value.toLocaleString('ar-SY-u-nu-latn') + ' ل.س';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('ar-SY-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  private toIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private messageFrom(err: unknown, fallback: string): string {
    const e = err as { error?: { message?: unknown } };
    const msg = e?.error?.message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join('، ');
    return fallback;
  }
}
