# HabitFlow

Proyecto individual de Programación VI de la Universidad del Norte (UniNorte). La aplicación usa Ionic Angular standalone y cuenta con tres pestañas: Hoy, Hábitos y Progreso.

En la pestaña **Hábitos** puedes crear, editar, activar, desactivar y eliminar hábitos. El formulario admite hábitos de sí o no, cantidad o duración, con frecuencia diaria, por días específicos o por veces a la semana. También puedes añadir una descripción y elegir el color y el icono. Al eliminar un hábito se conservan sus registros.

Al iniciar Hoy o Hábitos por primera vez, la aplicación carga ejemplos desde `src/assets/data/habits.json`. Los cambios se guardan en `localStorage` y se conservan al recargar en el mismo navegador y origen. El registro diario desde la interfaz queda para una fase posterior.

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
```
