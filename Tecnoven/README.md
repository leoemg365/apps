# Tecnoven Formatos

Aplicación web para generar reportes de instalación, activación y solicitud de trabajo,
con inventario de materiales calculado a partir de los reportes guardados.
El proyecto está separado en HTML, CSS y JavaScript, sin frameworks ni proceso de compilación.

## Estructura

```text
Tecnoven_Formatos/
├── index.html                  Estructura de la aplicación (una sola página)
├── README.md
└── assets/
    ├── css/
    │   ├── base.css            Variables, reset y estilos globales
    │   ├── layout.css          Menú, contenido principal, footer y WhatsApp
    │   ├── components.css      Formularios, botones, tablas, paneles y avisos
    │   ├── themes.css          Tema oscuro
    │   └── responsive.css      Adaptación a tablet, escritorio y móvil
    └── js/
        ├── config.js           Versión, novedades y catálogo de materiales
        ├── utils.js            Helpers: DOM, fechas, horas y portapapeles
        ├── ui.js               Navegación, tema, avisos y modales
        ├── reportes.js         Almacén de reportes, inventario y exportación
        ├── inventario.js       Interfaz de Inventario y Reportes guardados
        ├── qr.js               Escáner QR de seriales
        ├── app.js              Punto de entrada (inicializa todo)
        └── forms/
            ├── ficha-instalacion.js   Ficha de trabajo
            ├── activacion.js          Proceso de activación
            └── solicitud.js           Solicitud de trabajo
```

## Cómo abrirla

- **Uso normal:** abre `index.html` con doble clic. El proyecto usa scripts clásicos
  (no módulos ES), por lo que funciona directamente desde `file://`.
- **Escáner QR y ubicación GPS:** la cámara y la geolocalización requieren un contexto
  seguro. Usa `https://` o un servidor local:

  ```bash
  cd Tecnoven_Formatos
  python -m http.server 8000
  ```

  Luego abre `http://localhost:8000`. Si abres el archivo directamente con `file://`,
  el navegador puede denegar el permiso de ubicación.
- Solo el favicon, el icono de WhatsApp y la librería del escáner QR vienen de CDN; el
  resto funciona sin conexión.

## Cómo se usa

1. Se llena un formulario y se pulsa **Generar**: el reporte aparece en el recuadro.
2. **Copiar** lo manda al portapapeles y **Guardar** lo archiva en el navegador.
   - Guardar usa una copia exacta de lo último generado, no los campos actuales.
   - Si el mismo texto ya está guardado, avisa y no lo duplica.
   - Al guardar una **Ficha de trabajo**, sus materiales se suman al inventario.
3. **Inventario** muestra el total por material con el desglose por cliente. Se calcula
   con los reportes guardados, así que no se descuadra nunca.
4. **Reportes** lista lo guardado: ver el texto, copiarlo o eliminarlo (al eliminarlo se
   van también sus materiales del inventario).
5. En Inventario puedes **importar** un reporte pegado a mano y **exportar** todo a JSON
   o CSV.

## Dónde editar cada cosa

| Necesito cambiar... | Archivo |
| --- | --- |
| Textos, campos o secciones del formulario | `index.html` |
| Lista de técnicos | `index.html` (opciones de `#tecnicosSelect`) |
| Catálogo de materiales (nombre y unidad) | `assets/js/config.js` |
| Plantilla del reporte de instalación | `assets/js/forms/ficha-instalacion.js` |
| Ubicación GPS y su línea del reporte | `assets/js/forms/ficha-instalacion.js` |
| Plantilla de activación | `assets/js/forms/activacion.js` |
| Plantilla de solicitud | `assets/js/forms/solicitud.js` |
| Guardado, inventario, importar y exportar | `assets/js/reportes.js` |
| Pantallas de Inventario y Reportes | `assets/js/inventario.js` |
| Versión y novedades | `assets/js/config.js` |
| Navegación, tema oscuro o avisos | `assets/js/ui.js` |
| Colores y estilos generales | `assets/css/base.css` |
| Botones, inputs, tablas y modales | `assets/css/components.css` |
| Comportamiento del escáner QR | `assets/js/qr.js` |

### Publicar una nueva versión

1. Cambia `APP_VERSION` en `assets/js/config.js`.
2. Añade las novedades en `UPDATE_FEATURES` (mismo archivo).
3. Actualiza el número de versión visible en el footer de `index.html`.

El aviso de novedades se muestra una vez por versión y se guarda en `localStorage`
(`lastVersionSeen`, `appliedAppVersion`).

## Datos guardados

| Clave de `localStorage` | Contenido |
| --- | --- |
| `tecnoven.reportes.v3` | Array de reportes: id, tipo, cliente, fecha, nap, texto, materiales y fecha de guardado |
| `tecnoven.migrado.v3` | Marca de que la migración del inventario anterior ya se hizo |
| `inventoryAppItems_v2` / `inventoryAppHistory_v2` | Datos del inventario anterior (solo lectura, no se borran) |
| `darkMode` | Tema claro/oscuro |
| `lastVersionSeen` / `appliedAppVersion` | Control del aviso de novedades |

- El inventario **no** se guarda aparte: se calcula sumando los materiales de los
  reportes guardados.
- La migración es automática y no destructiva: si algo falla, las claves antiguas siguen
  intactas.
- El navegador permite unos 5 MB. La app avisa al pasar de 4 MB; conviene exportar el
  respaldo JSON y borrar reportes antiguos.

## Orden de carga de los scripts

`index.html` carga los scripts con `defer` en este orden:

```text
config.js → utils.js → ui.js → reportes.js → inventario.js → qr.js → forms/*.js → app.js
```

Todos exponen sus funciones en el espacio global `window.Tecnoven`
(`Tecnoven.config`, `Tecnoven.utils`, `Tecnoven.ui`, `Tecnoven.reportes`,
`Tecnoven.inventario`, `Tecnoven.qr`, `Tecnoven.forms`). Si añades un módulo nuevo,
inclúyelo antes de `app.js`.

## Notas

- El inventario se integró en la aplicación: se eliminó `inventario.html` y todo su
  Tailwind/CSS/JS incrustado. Ahora es una sección más, con el mismo menú, tema y avisos.
- Los materiales están definidos una sola vez en `config.js`; los contadores de la ficha,
  la plantilla del reporte y la tabla del inventario leen de ahí.
- El menú acepta hash (`index.html#inventario`); `app.js` abre la sección indicada.
- Se eliminó la sección «Ficha de Inalámbrico», que no se utilizará.
- Los cuatro metrajes usan un único control integrado (`−  valor  +`).
- La ficha incluye **Ubicación GPS** antes de los técnicos; el reporte agrega
  `UBICACIÓN:` antes de `TÉCNICOS:`.
- Los reportes de activación y solicitud se guardan, pero no aportan materiales porque
  esos formularios no los piden.
