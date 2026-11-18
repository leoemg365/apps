# Tecnoven Formatos

Aplicación web para generar reportes de instalación, activación y solicitud de trabajo.
El proyecto está separado en HTML, CSS y JavaScript, sin frameworks ni proceso de compilación.

## Estructura

```text
Tecnoven_Formatos/
├── index.html                  Estructura de la aplicación
├── inventario.html             Inventario (misma interfaz, estilos y tema)
├── README.md
└── assets/
    ├── css/
    │   ├── base.css            Variables, reset y estilos globales
    │   ├── layout.css          Menú, contenido principal, footer y WhatsApp
    │   ├── components.css      Formularios, botones, contadores, modales y avisos
    │   ├── themes.css          Tema oscuro
    │   └── responsive.css      Adaptación a tablet, escritorio y móvil
    └── js/
        ├── config.js           Versión de la app y novedades
        ├── utils.js            Helpers: DOM, fechas, horas y portapapeles
        ├── ui.js               Navegación, tema, avisos y modales
        ├── qr.js               Escáner QR de seriales
        ├── inventario.js       Importación de reportes, stock e historial
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

- **Inventario:** `inventario.html` comparte los mismos CSS y módulos JS que
  `index.html`, así que funciona sin conexión (solo el favicon y el icono de WhatsApp
  vienen de CDN). Se abre desde el enlace «Inventario» del menú o directo por URL. El
  tema claro/oscuro y la navegación son los mismos de la aplicación.

## Dónde editar cada cosa

| Necesito cambiar... | Archivo |
| --- | --- |
| Textos, campos o secciones del formulario | `index.html` |
| Lista de técnicos | `index.html` (opciones de `#tecnicosSelect`) |
| Plantilla del reporte de instalación | `assets/js/forms/ficha-instalacion.js` |
| Ubicación GPS y su línea del reporte | `assets/js/forms/ficha-instalacion.js` |
| Plantilla de activación | `assets/js/forms/activacion.js` |
| Plantilla de solicitud | `assets/js/forms/solicitud.js` |
| Versión y novedades | `assets/js/config.js` |
| Navegación, tema oscuro o avisos | `assets/js/ui.js` |
| Colores y estilos generales | `assets/css/base.css` |
| Estilos de botones, inputs, modales | `assets/css/components.css` |
| Tablas, paneles y zona de peligro del inventario | `assets/css/components.css` |
| Lógica del inventario (parseo, stock, historial) | `assets/js/inventario.js` |
| Markup del inventario | `inventario.html` |
| Comportamiento del escáner QR | `assets/js/qr.js` |

### Publicar una nueva versión

1. Cambia `APP_VERSION` en `assets/js/config.js`.
2. Añade las novedades en `UPDATE_FEATURES` (mismo archivo).
3. Actualiza el número de versión visible en el footer de `index.html`.

El aviso de novedades se muestra una vez por versión y se guarda en `localStorage`
(`lastVersionSeen`, `appliedAppVersion`).

## Orden de carga de los scripts

`index.html` carga los scripts con `defer` en este orden:

```text
config.js → utils.js → ui.js → qr.js → forms/*.js → app.js
```

Todos exponen sus funciones en el espacio global `window.Tecnoven`
(`Tecnoven.config`, `Tecnoven.utils`, `Tecnoven.ui`, `Tecnoven.qr`,
`Tecnoven.forms`, `Tecnoven.inventario`). Si añades un módulo nuevo, inclúyelo antes de
`app.js`.

`inventario.html` carga solo `config.js → utils.js → ui.js → inventario.js`.

## Notas

- Se eliminó la sección «Ficha de Inalámbrico», que no se utilizará.
- Los cuatro metrajes ahora usan un único control integrado (`−  valor  +`), sin el
  número duplicado que aparecía antes.
- Los contadores se organizan en dos columnas en escritorio y en una columna en móvil.
- La ficha de trabajo incluye **Ubicación GPS** antes de los técnicos. Al pulsar
  «Obtener ubicación» se solicita permiso y se guardan las coordenadas con el formato
  `latitud, longitud`; el reporte agrega la línea `UBICACIÓN:` antes de `TÉCNICOS:`.
- El inventario se integró en la aplicación: usa los mismos CSS, el mismo menú lateral,
  el mismo tema y los mismos avisos flotantes. Se quitó Tailwind y todo el CSS/JS
  incrustado que traía la versión anterior.
- Los estilos de tabla, paneles, historial y zona de peligro viven en
  `assets/css/components.css`; el tema oscuro los adapta en `themes.css`.
- El menú del inventario enlaza a cada formulario con hash
  (`index.html#proceso-activacion`); `app.js` abre la sección indicada al cargar.
- El inventario conserva las claves de `localStorage` anteriores
  (`inventoryAppItems_v2` e `inventoryAppHistory_v2`), así que los datos ya guardados
  siguen apareciendo.
- El código JavaScript se verificó con pruebas de DOM (generación de reportes,
  contadores, técnicos, GPS, navegación, tema y reinicio de formularios).
