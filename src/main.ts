import { provideHttpClient } from '@angular/common/http';
import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { IonicRouteStrategy } from '@ionic/angular/ionic-route-strategy';
import { provideIonicAngular } from '@ionic/angular/provide';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { AppearanceService } from './app/services/appearance.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'ios', animated: false }),
    provideHttpClient(),
    provideAppInitializer(() => inject(AppearanceService).initialize()),
    provideRouter(routes),
  ],
}).catch(console.error);
