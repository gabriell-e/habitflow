import { Component, OnInit } from '@angular/core';
import { IonButton, IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';

import { HabitService } from '../../services/habit.service';

@Component({
  selector: 'app-today',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonSpinner, IonButton],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Hoy</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (habitService.loading()) {
        <div role="status">
          <ion-spinner aria-hidden="true"></ion-spinner>
          <span>Cargando hábitos…</span>
        </div>
      } @else if (habitService.loadError(); as message) {
        <p role="alert">{{ message }}</p>
        <ion-button (click)="habitService.initialize()">Reintentar</ion-button>
      } @else if (habitService.persistenceError(); as message) {
        <p role="alert">{{ message }}</p>
      }
    </ion-content>
  `,
})
export class TodayPage implements OnInit {
  constructor(protected readonly habitService: HabitService) {}

  ngOnInit(): void {
    void this.habitService.initialize();
  }
}
