import { Component } from '@angular/core';
import { IonButton, IonIcon, IonPopover, IonRadio, IonRadioGroup } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { contrastOutline, leafOutline } from 'ionicons/icons';

import { AppearanceService } from '../../services/appearance.service';

@Component({
  selector: 'app-brand',
  imports: [IonButton, IonIcon, IonPopover, IonRadio, IonRadioGroup],
  templateUrl: './app-brand.component.html',
  styleUrl: './app-brand.component.scss',
})
export class AppBrandComponent {
  constructor(protected readonly appearance: AppearanceService) {
    addIcons({ contrastOutline, leafOutline });
  }
}
