# HabitFlow

Proyecto individual de Programación VI de la Universidad del Norte (UniNorte). La aplicación usa Ionic Angular standalone y cuenta con tres pestañas: Hoy, Hábitos y Progreso.

En la primera ejecución, Hoy carga hábitos de ejemplo desde `src/assets/data/habits.json`. El servicio guarda los hábitos y sus registros diarios en colecciones separadas dentro de `localStorage`. Los datos quedan en el navegador para ese origen. La creación, edición y registro manual están disponibles a nivel de servicio.

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
