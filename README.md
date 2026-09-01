# Billetera

Una app personal para llevar el control del dinero del día a día: saldo actual, ingresos, gastos y pagos recurrentes, con resúmenes por día, semana y mes.

Instalable en el celular como una app (PWA), sin necesidad de tienda de aplicaciones.

## Funciones

- Saldo actual, calculado en tiempo real a partir de tus movimientos.
- Registro rápido de ingresos y gastos, con categoría, fecha y nota opcional.
- Resúmenes de ingresos y gastos por hoy, esta semana y este mes.
- Recordatorios de pagos recurrentes (por ejemplo, "línea telefónica" el día 10, "alquiler" el día 31), con aviso cuando están por vencer.
- Historial de movimientos agrupado por día, editable y eliminable.
- Funciona sin conexión una vez instalada, gracias a un service worker.

## Cómo se guardan los datos

Toda la información se guarda en el propio navegador del dispositivo (`localStorage`), sin ningún servidor externo. Eso significa que los datos no se sincronizan entre dispositivos ni quedan respaldados en la nube: si se borran los datos del navegador, se pierde el historial.

## Estructura del proyecto

```
index.html      Estructura de la página
style.css       Estilos y diseño visual
app.js          Lógica de la aplicación (estado, cálculos, interfaz)
manifest.json   Configuración para que sea instalable como app
sw.js           Service worker (funcionamiento sin conexión y caché)
icon-*.png      Íconos de la app
```

## Cómo instalarla

1. Abre el link de la app publicada (GitHub Pages) desde el navegador del celular.
2. En iPhone (Safari): botón de compartir → "Agregar a pantalla de inicio".
3. En Android (Chrome): menú de tres puntos → "Instalar aplicación" o "Agregar a pantalla de inicio".

## Tecnologías

HTML, CSS y JavaScript puro, sin frameworks ni dependencias externas (aparte de las tipografías de Google Fonts).
