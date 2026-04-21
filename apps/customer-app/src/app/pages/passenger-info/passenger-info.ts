import { Component, computed, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { HeaderComponent } from '../../shared/header/header';

const PHONE_PATTERN = /^\+?[0-9 \-]{6,30}$/;

@Component({
  selector: 'app-passenger-info',
  standalone: true,
  imports: [HeaderComponent, ReactiveFormsModule],
  templateUrl: './passenger-info.html',
  styleUrl: './passenger-info.css',
})
export class PassengerInfoPage {
  private router = inject(Router);
  booking = inject(BookingService);

  trip = computed(() => this.booking.selectedTrip());

  form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(PHONE_PATTERN)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(180)],
    }),
  });

  constructor() {
    const existing = this.booking.passenger();
    if (existing) {
      this.form.patchValue({
        name: existing.name,
        phone: existing.phone,
        email: existing.email ?? '',
      });
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, phone, email } = this.form.getRawValue();
    this.booking.passenger.set({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() ? email.trim() : null,
    });
    this.router.navigate(['/payment']);
  }

  back(): void {
    this.router.navigate(['/seat-selection']);
  }
}
