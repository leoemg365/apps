/**
 * Proceso de Activación.
 */
(function (global) {
  'use strict';

  const Tecnoven = global.Tecnoven;
  const { $, toNA, copyText } = Tecnoven.utils;
  const { showMessage } = Tecnoven.ui;

  /** Copia exacta del último reporte generado, para el botón Guardar. */
  let ultimoGenerado = null;

  function generarReporte() {
    const tipoActivacion = $('tipoActivacion').value;
    const cliente = $('clienteAct').value;
    const napRegion = $('napRegionAct').value;
    const napNumber = $('napNumberAct').value;
    const puerto = $('puertoAct').value;
    const serial = $('serialAct').value;
    const nap = napRegion && napNumber ? `${napRegion}-${napNumber}` : '';

    const lineas = [
      `ACTIVACIÓN: ${tipoActivacion}`,
      `NOMBRE DE CLIENTE: ${toNA(cliente)}`,
      `NAP: ${toNA(nap)}`,
      `PUERTO: ${toNA(puerto)}`,
      `SERIAL: ${toNA(serial)}`
    ];

    $('resultadoAct').textContent = lineas.join('\n');

    ultimoGenerado = {
      tipo: 'activacion',
      cliente: toNA(cliente),
      fecha: '',
      nap,
      texto: $('resultadoAct').textContent,
      materiales: []
    };
  }

  function guardarReporte() {
    if (!ultimoGenerado) {
      showMessage('Genera el reporte primero.');
      return;
    }

    const resultado = Tecnoven.reportes.guardar(ultimoGenerado);

    if (resultado.ok) {
      Tecnoven.inventario.refrescar();
      showMessage('Reporte guardado ✅');
    } else if (resultado.motivo === 'duplicado') {
      showMessage('Este reporte ya está guardado');
    } else {
      showMessage('El reporte está vacío');
    }
  }

  async function copiarReporte() {
    const texto = $('resultadoAct').textContent;

    if (!texto) {
      showMessage('Genera el reporte primero.');
      return;
    }

    await copyText(texto);
    showMessage('Copiado al portapapeles ✅');
  }

  function nuevoFormato() {
    document
      .querySelectorAll('#proceso-activacion input, #proceso-activacion select')
      .forEach((el) => {
        if (el.type !== 'button') el.value = '';
      });

    ultimoGenerado = null;
    $('resultadoAct').textContent = '';
  }

  function init() {
    $('btnGenerarAct').addEventListener('click', generarReporte);
    $('btnCopiarAct').addEventListener('click', copiarReporte);
    $('btnGuardarAct').addEventListener('click', guardarReporte);
    $('btnNuevoAct').addEventListener('click', nuevoFormato);
  }

  Tecnoven.forms = Tecnoven.forms || {};
  Tecnoven.forms.activacion = { init };
})(window);
