/**
 * Solicitud de Trabajo.
 */
(function (global) {
  'use strict';

  const Tecnoven = global.Tecnoven;
  const { $, toNA, copyText } = Tecnoven.utils;
  const { showMessage } = Tecnoven.ui;

  /** Copia exacta del último reporte generado, para el botón Guardar. */
  let ultimoGenerado = null;

  function generarReporte() {
    const servicio = $('servicioSol').value;
    const napRegion = $('napRegionSol').value;
    const napNumber = $('napNumberSol').value;
    const cliente = $('clienteSol').value;
    const nap = napRegion && napNumber ? `${napRegion}-${napNumber}` : '';

    const lineas = [
      'SOLICITUD DE TRABAJO',
      `Servicio: ${toNA(servicio)}`,
      `NAP: ${toNA(nap)}`,
      `Nombre: ${toNA(cliente)}`
    ];

    $('resultadoSol').textContent = lineas.join('\n');

    ultimoGenerado = {
      tipo: 'solicitud',
      cliente: toNA(cliente),
      fecha: '',
      nap,
      texto: $('resultadoSol').textContent,
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
    const texto = $('resultadoSol').textContent;

    if (!texto) {
      showMessage('Genera el reporte primero.');
      return;
    }

    await copyText(texto);
    showMessage('Copiado al portapapeles ✅');
  }

  function nuevoFormato() {
    document
      .querySelectorAll('#solicitud input, #solicitud select')
      .forEach((el) => {
        if (el.type !== 'button') el.value = '';
      });

    ultimoGenerado = null;
    $('resultadoSol').textContent = '';
  }

  function init() {
    $('btnGenerarSol').addEventListener('click', generarReporte);
    $('btnCopiarSol').addEventListener('click', copiarReporte);
    $('btnGuardarSol').addEventListener('click', guardarReporte);
    $('btnNuevoSol').addEventListener('click', nuevoFormato);
  }

  Tecnoven.forms = Tecnoven.forms || {};
  Tecnoven.forms.solicitud = { init };
})(window);
