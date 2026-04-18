import { Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { City } from '../../../models/booking.model';
import { CITIES } from '../../../data/cities.data';

@Component({
  selector: 'app-city-selector',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './city-selector.html',
  styleUrl: './city-selector.css',
})
export class CitySelectorComponent {
  citySelected = output<City>();
  closed = output<void>();

  searchQuery = signal('');
  cities = CITIES;

  get filteredCities(): City[] {
    const query = this.searchQuery();
    if (!query) return this.cities;
    return this.cities.filter(c => c.nameAr.includes(query));
  }

  selectCity(city: City): void {
    this.citySelected.emit(city);
  }

  close(): void {
    this.closed.emit();
  }
}
