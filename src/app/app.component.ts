import { Location } from '@angular/common';
import { Component, DestroyRef } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { IonApp } from '@ionic/angular/ion-app';
import { IonRouterOutlet } from '@ionic/angular/ion-router-outlet';
import { Platform } from '@ionic/angular/platform';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  template: '<ion-app><ion-router-outlet></ion-router-outlet></ion-app>',
})
export class AppComponent {
  constructor(platform: Platform, location: Location, router: Router, destroyRef: DestroyRef) {
    if (Capacitor.getPlatform() !== 'android') return;

    let canGoBack = false;
    const listener = App.addListener('backButton', (event) => {
      canGoBack = event.canGoBack;
    });
    void listener.catch((error: unknown) => console.warn('No se pudo activar el botón Atrás de Android.', error));

    // Los diálogos de Ionic tienen prioridad sobre el historial de las pestañas.
    const back = platform.backButton.subscribeWithPriority(10, async () => {
      if (canGoBack) location.back();
      else if (router.url !== '/tabs/hoy') await router.navigateByUrl('/tabs/hoy', { replaceUrl: true });
      else await App.exitApp();
    });

    destroyRef.onDestroy(() => {
      back.unsubscribe();
      void listener.then((handle) => handle.remove()).catch(() => undefined);
    });
  }
}
