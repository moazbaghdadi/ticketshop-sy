import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BookingService } from '../../services/booking.service';
import { CitySelectorComponent } from './city-selector/city-selector';
import { City } from '../../models/booking.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule, CitySelectorComponent],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomePage {
  private router = inject(Router);
  booking = inject(BookingService);

  showCitySelector = signal(false);
  citySelectorTarget = signal<'from' | 'to'>('from');

  openCitySelector(target: 'from' | 'to'): void {
    this.citySelectorTarget.set(target);
    this.showCitySelector.set(true);
  }

  onCitySelected(city: City): void {
    if (this.citySelectorTarget() === 'from') {
      this.booking.fromCity.set(city);
    } else {
      this.booking.toCity.set(city);
    }
    this.showCitySelector.set(false);
  }

  swapCities(): void {
    this.booking.swapCities();
  }

  search(): void {
    if (!this.booking.fromCity() || !this.booking.toCity()) return;
    this.router.navigate(['/timetable']);
  }
}
