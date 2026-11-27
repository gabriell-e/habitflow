import { Component } from '@angular/core';
import { IonButton } from '@ionic/angular/ion-button';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonPopover } from '@ionic/angular/ion-popover';
import { IonRadio } from '@ionic/angular/ion-radio';
import { IonRadioGroup } from '@ionic/angular/ion-radio-group';
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
