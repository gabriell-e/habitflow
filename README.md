# HabitFlow

Proyecto individual de Programación VI de la Universidad del Norte (UniNorte). La aplicación usa Ionic Angular standalone y cuenta con tres pestañas: Hoy, Hábitos y Progreso.

Autor · Gabriel ([gabriell-e](https://github.com/gabriell-e)).

En la pestaña **Hábitos** puedes filtrar por estado, crear hábitos, activarlos con el interruptor y usar el menú de cada tarjeta para editar o eliminar. El formulario admite hábitos de sí o no, cantidad o duración, con frecuencia diaria, por días específicos o por veces a la semana. También puedes añadir una descripción y elegir el color y el icono. Al eliminar un hábito se conservan sus registros.

En **Hoy** puedes completar y deshacer hábitos de sí o no, sumar o corregir cantidades y registrar duraciones manualmente. Los registros se guardan por hábito y fecha local. En **Progreso** puedes consultar el cumplimiento semanal o mensual, las rachas, el calendario y el historial, con un filtro por hábito.

En la primera ejecución la aplicación carga ejemplos desde `src/assets/data/habits.json`. Los cambios se guardan en `localStorage` y se conservan al recargar en el mismo navegador y origen.
Si la carga falla, el botón **Reintentar** vuelve a leer el almacenamiento y, si está vacío, solicita los ejemplos. Si hay datos guardados pero inválidos, se muestra un aviso y se conserva el contenido.

### Capturas

El botón **Apariencia** de la cabecera permite elegir Sistema, Claro u Oscuro. Sistema sigue la preferencia del equipo. La selección se guarda en el navegador. Las capturas usan datos de ejemplo.

| Vista | Claro | Oscuro |
|---|---|---|
| Hoy · móvil | [Ver](docs/screenshots/hoy-claro-390.png) | [Ver](docs/screenshots/hoy-oscuro-390.png) |
| Hábitos · móvil | [Ver](docs/screenshots/habitos-claro-390.png) | [Ver](docs/screenshots/habitos-oscuro-390.png) |
| Progreso · móvil | [Ver](docs/screenshots/progreso-claro-390.png) | [Ver](docs/screenshots/progreso-oscuro-390.png) |
| Progreso · escritorio | [Ver](docs/screenshots/progreso-claro-1366.png) | [Ver](docs/screenshots/progreso-oscuro-1366.png) |
| Formulario · móvil | [Ver](docs/screenshots/formulario-claro-390.png) | [Ver](docs/screenshots/formulario-oscuro-390.png) |

### Cómo se calcula el progreso

- El porcentaje es `100 × completadas / evaluadas`, redondeado al entero más cercano. Cada día programado cerrado aporta una oportunidad. Hoy cuenta si ya se completó.
- Las metas flexibles se evalúan al cerrar la semana, de lunes a domingo. Una meta de 3 con 2 días completados aporta 2 de 3. Para el resumen mensual, la semana pertenece al mes de su domingo.
- Las rachas cuentan días programados consecutivos o semanas comparables consecutivas, según la frecuencia. Las pausas, los días no programados y los períodos abiertos sin completar no rompen la racha.
- La programación se registra a partir de esta versión. Los registros más antiguos siguen en el historial, aunque se desconozca su programación original. Las semanas parciales o con cambios de programación se muestran y quedan fuera del porcentaje y de las rachas semanales.

## Desarrollo

Ionic Angular 9.0.8, Angular 21.2.25 (LTS), Angular CLI y build 21.2.31, TypeScript 5.9.3 e Ionicons 8.1.0.

Con Node.js 24 LTS y npm, ejecutar:

```sh
npm ci
npm start
```

Abre `http://localhost:4200` o la URL que indique la terminal si el puerto está ocupado. El navegador guarda datos distintos para `localhost`, `127.0.0.1` y cada puerto.

Para verificar la aplicación y generar el build de producción en `www/`:

```sh
npm run typecheck
npm run build
npm test
npm run test:browser
```

La prueba de navegador usa el build de `www/` y Chrome instalado. Si Chrome está en otra ubicación, define `CHROME_PATH` con la ruta a su ejecutable. Las pruebas usan un perfil temporal y un reloj de prueba para reproducir los cambios de fecha.

Para regenerar las capturas, define `HABITFLOW_SCREENSHOTS=1` y ejecuta `npm run test:browser` después de compilar. Los PNG se guardan en `docs/screenshots/`.

## APK de debug para Android

El proyecto nativo usa Capacitor 8.6.3, el plugin App 8.1.2 para el botón Atrás, JDK 21 y el Gradle Wrapper incluido. Instala desde Android Studio SDK Platform 36, Build-Tools 35.0.0 y Platform-Tools. La compilación usa Gradle 8.14.3 y Android Gradle Plugin 8.13.0. La configuración de HabitFlow usa `io.github.gabriell_e.habitflow` como identificador de aplicación y `www/` como directorio web. [Requisitos de Capacitor 8](https://capacitorjs.com/docs/updating/8-0)

Desde la raíz del repositorio en PowerShell, comprueba que `JAVA_HOME` apunte al JDK 21 y ajusta `ANDROID_HOME` si el SDK está en otra ruta.

```powershell
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
npm ci
npm run build
npx cap sync android
Push-Location android
.\gradlew.bat :app:assembleDebug
Pop-Location
```

El archivo se genera en `android/app/build/outputs/apk/debug/app-debug.apk`. Cada cambio web requiere volver a compilar Angular y sincronizar los recursos antes de generar el APK. Para probarlo en un teléfono, usa un WebView de Android actualizado y habilita la depuración USB.

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" devices
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Capacitor sirve los recursos empaquetados desde `https://localhost` dentro de la aplicación. El APK y el navegador tienen almacenamientos separados. Una actualización que conserva el identificador y el origen local reutiliza los datos de la aplicación. Borrar sus datos o desinstalarla puede eliminar los registros.
