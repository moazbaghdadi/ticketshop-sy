import { Component, input } from '@angular/core';
import { Location } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent {
  title = input.required<string>();
  showBack = input(true);

  constructor(private location: Location) {}

  goBack(): void {
    this.location.back();
  }
}
