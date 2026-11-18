/**
 * Configuración general de la aplicación.
 */
(function (global) {
  'use strict';

  const Tecnoven = (global.Tecnoven = global.Tecnoven || {});

  const APP_VERSION = '2.2';

  /**
   * Catálogo único de materiales.
   * `campo` enlaza con el contador de la ficha de trabajo.
   * `etiqueta` es la clave que se escribe en el reporte y se muestra en el inventario.
   */
  const MATERIALES = [
    { campo: 'apc', etiqueta: 'CONECTOR APC', unidad: 'u' },
    { campo: 'upc', etiqueta: 'CONECTOR UPC', unidad: 'u' },
    { campo: 'rg6', etiqueta: 'CONECTOR RG6', unidad: 'u' },
    { campo: 'rj45', etiqueta: 'CONECTOR RJ45', unidad: 'u' },
    { campo: 'splitter', etiqueta: 'SPLITTER TV', unidad: 'u' },
    { campo: 'roseta', etiqueta: 'ROSETA', unidad: 'u' },
    { campo: 'manguita', etiqueta: 'MANGUITA', unidad: 'u' },
    { campo: 'couple', etiqueta: 'COUPLE', unidad: 'u' },
    { campo: 'utp', etiqueta: 'METRAJE UTP', unidad: 'm' },
    { campo: 'drop', etiqueta: 'METRAJE DROP', unidad: 'm' },
    { campo: 'coaxial', etiqueta: 'METRAJE COAXIAL', unidad: 'm' },
    { campo: 'flap', etiqueta: 'METRAJE FLAP', unidad: 'm' },
    { campo: 'mastil', etiqueta: 'MASTIL', unidad: 'u' },
    { campo: 'tensores', etiqueta: 'TENSORES', unidad: 'u' },
    { campo: 'preformados', etiqueta: 'PREFORMADOS', unidad: 'u' },
    { campo: 'grapas', etiqueta: 'GRAPAS y CLAVOS', unidad: 'u' },
    { campo: 'ramplug', etiqueta: 'Ramplug y Tornillos', unidad: 'u' }
  ];

  const UPDATE_FEATURES = [
    '<li><span class="chip new">Nuevo</span>Botón «Guardar» en los tres formularios: los reportes quedan archivados en la aplicación.</li>',
    '<li><span class="chip new">Nuevo</span>Inventario y Reportes guardados dentro de la app, sin página aparte.</li>',
    '<li><span class="chip new">Nuevo</span>Exportar el inventario a JSON o CSV e importar reportes pegados.</li>',
    '<li><span class="chip improved">Mejora</span>Una sola lista de materiales para los contadores, el reporte y el inventario.</li>',
    '<li><span class="chip improved">Mejora</span>El inventario se calcula con los reportes guardados: sin descuadres.</li>',
    '<li><span class="chip fixed">Corregido</span>Los datos del inventario anterior se migran automáticamente.</li>'
  ];

  Tecnoven.config = Object.freeze({
    APP_VERSION,
    MATERIALES,
    UPDATE_FEATURES
  });
})(window);
