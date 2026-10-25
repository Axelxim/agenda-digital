import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { registerLocaleData } from '@angular/common'; //cambia la informacion del paquete en este caso a español
import localeEs from '@angular/common/locales/es';//Aqui se importa el paquete de español

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { LOCALE_ID } from '@angular/core';//¿Qué configuración regional debo usar por defecto?

registerLocaleData(localeEs);//llamamos el paquete de español para que se pueda usar en la aplicacion

bootstrapApplication(AppComponent, {
  providers: [//providers contiene cosas que Angular va a dejar disponibles de forma global para toda la aplicación.
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    { provide: LOCALE_ID, useValue: 'es' },
  ],
  
});
