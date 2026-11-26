# HabitFlow

Proyecto individual de Programación VI de la Universidad del Norte (UniNorte). La aplicación usa Ionic Angular standalone y cuenta con tres pestañas: Hoy, Hábitos y Progreso.

Autor · Gabriel ([gabriell-e](https://github.com/gabriell-e)).

En la pestaña **Hábitos** puedes filtrar por estado, crear hábitos, activarlos con el interruptor y usar el menú de cada tarjeta para editar o eliminar. El formulario admite hábitos de sí o no, cantidad o duración, con frecuencia diaria, por días específicos o por veces a la semana. También puedes añadir una descripción y elegir el color y el icono. Al eliminar un hábito se conservan sus registros.

En **Hoy** puedes completar y deshacer hábitos de sí o no, sumar o corregir cantidades y registrar duraciones manualmente. Los registros se guardan por hábito y fecha local. En **Progreso** puedes consultar el cumplimiento semanal o mensual, las rachas, el calendario y el historial, con un filtro por hábito.

En la primera ejecución la aplicación carga ejemplos desde `src/assets/data/habits.json`. Los cambios se guardan en `localStorage` y se conservan al recargar en el mismo navegador y origen.

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

Stack inicial con Ionic Angular 9.0.8, Angular 21.2.25 (LTS), TypeScript 5.9.3 e Ionicons 8.1.0.

Con Node.js 24 LTS y npm, ejecutar:

```sh
npm ci
npm start
```

Para comprobar los tipos y compilar para producción:

```sh
npm run typecheck
npm run build
npm test
npm run test:browser
```

La prueba de navegador usa el build de `www/` y Chrome instalado. Si Chrome está en otra ubicación, define `CHROME_PATH` con la ruta a su ejecutable. Las pruebas usan un perfil temporal y un reloj de prueba para reproducir los cambios de fecha.

Para regenerar las capturas, define `HABITFLOW_SCREENSHOTS=1` y ejecuta `npm run test:browser` después de compilar. Los PNG se guardan en `docs/screenshots/`.
