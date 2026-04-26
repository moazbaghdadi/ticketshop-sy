import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DriverDeleteConflict, DriverDto, DriversService } from '../../services/drivers.service';

interface DeleteState {
  driver: DriverDto;
  upcomingTripCount: number;
  sampleTripDates: string[];
  replacementId: string;
  submitting: boolean;
  error: string | null;
}

@Component({
  selector: 'app-drivers',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './drivers.html',
  styleUrl: './drivers.css',
})
export class DriversPage implements OnInit {
  private driversService = inject(DriversService);

  query = signal<string>('');
  drivers = signal<DriverDto[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  newName = signal<string>('');
  creating = signal<boolean>(false);
  createError = signal<string | null>(null);

  editingId = signal<string | null>(null);
  editingName = signal<string>('');
  editError = signal<string | null>(null);
  saving = signal<boolean>(false);

  deleteState = signal<DeleteState | null>(null);

  /** Active drivers other than the one being deleted — eligible replacements. */
  replacementCandidates = computed<DriverDto[]>(() => {
    const ds = this.deleteState();
    if (!ds) return [];
    return this.drivers().filter((d) => d.id !== ds.driver.id);
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.driversService.list(this.query()).subscribe({
      next: (res) => {
        this.drivers.set(res.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('تعذر جلب قائمة السائقين');
      },
    });
  }

  onSearch(): void {
    this.load();
  }

  create(): void {
    const name = this.newName().trim();
    if (!name) {
      this.createError.set('أدخل اسم السائق');
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    this.driversService.create(name).subscribe({
      next: () => {
        this.creating.set(false);
        this.newName.set('');
        this.load();
      },
      error: (err) => {
        this.creating.set(false);
        this.createError.set(this.formatError(err, 'تعذر إضافة السائق'));
      },
    });
  }

  startEdit(driver: DriverDto): void {
    this.editingId.set(driver.id);
    this.editingName.set(driver.nameAr);
    this.editError.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editingName.set('');
    this.editError.set(null);
  }

  saveEdit(): void {
    const id = this.editingId();
    if (!id) return;
    const name = this.editingName().trim();
    if (!name) {
      this.editError.set('أدخل اسم السائق');
      return;
    }
    this.saving.set(true);
    this.editError.set(null);
    this.driversService.rename(id, name).subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelEdit();
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.editError.set(this.formatError(err, 'تعذر تعديل السائق'));
      },
    });
  }

  /**
   * First call: try delete with no replacement. On 409 conflict, populate deleteState
   * and prompt the user to pick a replacement; on success, refresh.
   */
  startDelete(driver: DriverDto): void {
    this.driversService.remove(driver.id).subscribe({
      next: () => this.load(),
      error: (err) => {
        if (err?.status === 409 && err?.error) {
          const conflict = err.error as DriverDeleteConflict;
          this.deleteState.set({
            driver,
            upcomingTripCount: conflict.upcomingTripCount,
            sampleTripDates: conflict.sampleTripDates,
            replacementId: '',
            submitting: false,
            error: null,
          });
        } else {
          this.error.set(this.formatError(err, 'تعذر حذف السائق'));
        }
      },
    });
  }

  setReplacement(id: string): void {
    const state = this.deleteState();
    if (!state) return;
    this.deleteState.set({ ...state, replacementId: id, error: null });
  }

  cancelDelete(): void {
    this.deleteState.set(null);
  }

  confirmDelete(): void {
    const state = this.deleteState();
    if (!state) return;
    if (!state.replacementId) {
      this.deleteState.set({ ...state, error: 'اختر سائقاً بديلاً' });
      return;
    }
    this.deleteState.set({ ...state, submitting: true, error: null });
    this.driversService.remove(state.driver.id, state.replacementId).subscribe({
      next: () => {
        this.deleteState.set(null);
        this.load();
      },
      error: (err) => {
        this.deleteState.set({
          ...state,
          submitting: false,
          error: this.formatError(err, 'تعذر إعادة تعيين الرحلات وحذف السائق'),
        });
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
