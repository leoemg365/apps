/**
 * Interfaz de Inventario y Reportes guardados (solo lectura sobre el almacén).
 */
(function (global) {
  'use strict';

  const Tecnoven = global.Tecnoven;
  const { $ } = Tecnoven.utils;

  const TIPOS = {
    instalacion: 'Instalación',
    soporte: 'Soporte',
    activacion: 'Activación',
    solicitud: 'Solicitud',
    importado: 'Importado'
  };

  const UNIDADES = {
    u: 'u',
    m: 'm'
  };

  function el(tag, options) {
    const node = document.createElement(tag);
    const opts = options || {};

    if (opts.className) node.className = opts.className;
    if (opts.text != null) node.textContent = opts.text;
    if (opts.attrs) {
      Object.keys(opts.attrs).forEach((name) => node.setAttribute(name, opts.attrs[name]));
    }

    return node;
  }

  function etiquetaTipo(tipo) {
    return TIPOS[tipo] || tipo || 'Reporte';
  }

  /* ------------------------------- Inventario ------------------------------- */

  function rellenarClientes(select) {
    if (!select) return;

    const actual = select.value;
    const clientes = Array.from(
      new Set(Tecnoven.reportes.listar().map((reporte) => reporte.cliente).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'es'));

    select.textContent = '';
    select.appendChild(el('option', { text: 'Todos los clientes', attrs: { value: '' } }));
    clientes.forEach((cliente) => {
      select.appendChild(el('option', { text: cliente, attrs: { value: cliente } }));
    });

    select.value = clientes.includes(actual) ? actual : '';
  }

  function renderInventario() {
    const body = $('inventarioCuerpo');
    if (!body) return;

    const filtro = $('filtroClienteInv');
    const filas = Tecnoven.reportes.agregarInventario(filtro ? filtro.value : '');

    body.textContent = '';

    if (!filas.length) {
      const row = el('tr');
      const cell = el('td', { className: 'table-empty', text: 'Todavía no hay materiales: guarda un reporte de la ficha de trabajo.' });
      cell.colSpan = 4;
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    filas.forEach((fila) => {
      const row = el('tr');
      row.appendChild(el('td', { text: fila.clave }));
      row.appendChild(el('td', { text: String(fila.total) }));
      row.appendChild(el('td', { text: UNIDADES[fila.unidad] || fila.unidad || '' }));

      const clientes = el('td', { className: 'col-left' });
      const detalles = el('details');
      const resumen = el('summary', { text: fila.clientes.length + ' cliente(s)' });
      detalles.appendChild(resumen);

      const lista = el('ul');
      fila.clientes.forEach((cliente) => {
        lista.appendChild(el('li', { text: cliente.cliente + ': ' + cliente.total + ' ' + (UNIDADES[fila.unidad] || '') }));
      });

      detalles.appendChild(lista);
      clientes.appendChild(detalles);
      row.appendChild(clientes);

      body.appendChild(row);
    });
  }

  /* -------------------------------- Reportes -------------------------------- */

  function coincide(reporte, busqueda) {
    if (!busqueda) return true;

    const texto = busqueda.toLowerCase();
    const campos = [reporte.cliente, reporte.fecha, reporte.texto, etiquetaTipo(reporte.tipo)];

    if (campos.some((campo) => String(campo || '').toLowerCase().includes(texto))) return true;

    return (reporte.materiales || []).some((material) => material.clave.toLowerCase().includes(texto));
  }

  function tarjetaReporte(reporte) {
    const card = el('article', { className: 'report-card' });
    card.dataset.id = reporte.id;

    const header = el('header');
    const info = el('div');

    const titulo = el('h4', { text: reporte.cliente });
    info.appendChild(titulo);

    const meta = el('p', { className: 'meta' });
    meta.appendChild(el('span', { className: 'tag', text: etiquetaTipo(reporte.tipo) }));
    meta.appendChild(document.createTextNode(
      ' ' + (reporte.fecha || 'sin fecha') + ' · ' + (reporte.materiales || []).length + ' material(es)'
    ));
    info.appendChild(meta);
    header.appendChild(info);

    const acciones = el('div', { className: 'actions' });

    const ver = el('button', { className: 'btn alt', text: 'Ver' });
    ver.type = 'button';
    ver.dataset.accion = 'ver';

    const copiar = el('button', { className: 'btn alt', text: 'Copiar' });
    copiar.type = 'button';
    copiar.dataset.accion = 'copiar';

    const eliminar = el('button', { className: 'link-danger', text: 'Eliminar' });
    eliminar.type = 'button';
    eliminar.dataset.accion = 'eliminar';

    acciones.appendChild(ver);
    acciones.appendChild(copiar);
    acciones.appendChild(eliminar);
    header.appendChild(acciones);

    card.appendChild(header);

    const texto = el('pre', { className: 'texto', text: reporte.texto });
    texto.hidden = true;
    card.appendChild(texto);

    return card;
  }

  function renderReportes() {
    const list = $('reportesLista');
    if (!list) return;

    const tipoFiltro = $('filtroTipoRep');
    const buscador = $('buscarRep');
    const tipo = tipoFiltro ? tipoFiltro.value : '';
    const busqueda = buscador ? buscador.value.trim() : '';

    const reportes = Tecnoven.reportes
      .listar()
      .filter((reporte) => (!tipo || reporte.tipo === tipo) && coincide(reporte, busqueda));

    list.textContent = '';

    if (!reportes.length) {
      list.appendChild(
        el('p', {
          className: 'table-empty',
          text: 'No hay reportes guardados con ese filtro. Genera uno y pulsa «Guardar».'
        })
      );
      return;
    }

    reportes.forEach((reporte) => list.appendChild(tarjetaReporte(reporte)));
  }

  /** Vuelve a pintar ambas vistas (lo llaman los formularios al guardar). */
  function refrescar() {
    if ($('inventarioCuerpo')) {
      rellenarClientes($('filtroClienteInv'));
      renderInventario();
    }

    if ($('reportesLista')) renderReportes();
  }

  /* --------------------------------- Acciones ------------------------------- */

  function descargar(nombre, contenido, tipoMime) {
    const blob = new Blob([contenido], { type: tipoMime });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');

    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function marcaDeTiempo() {
    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return hoy.getFullYear() + mes + dia;
  }

  function descargarJSON() {
    descargar('inventario-' + marcaDeTiempo() + '.json', Tecnoven.reportes.exportarJSON(), 'application/json');
    Tecnoven.ui.showMessage('Respaldo JSON descargado');
  }

  function descargarCSV() {
    const filtro = $('filtroClienteInv');
    const cliente = filtro ? filtro.value : '';
    descargar('inventario-' + marcaDeTiempo() + '.csv', Tecnoven.reportes.exportarCSV(cliente), 'text/csv;charset=utf-8');
    Tecnoven.ui.showMessage('CSV descargado');
  }

  function importarPegado() {
    const input = $('reportePegado');
    const feedback = $('feedbackImportar');
    if (!input || !feedback) return;

    const texto = input.value.trim();

    if (!texto) {
      feedback.className = 'feedback error';
      feedback.textContent = 'Pega primero el texto del reporte.';
      return;
    }

    const datos = Tecnoven.reportes.parsearTexto(texto);

    const resultado = Tecnoven.reportes.guardar({
      tipo: 'importado',
      origen: 'importado',
      cliente: datos.cliente,
      fecha: datos.fecha,
      nap: datos.nap,
      texto,
      materiales: datos.materiales
    });

    if (!resultado.ok) {
      feedback.className = 'feedback error';
      feedback.textContent =
        resultado.motivo === 'duplicado'
          ? 'Ese reporte ya está guardado.'
          : 'El reporte está vacío.';
      return;
    }

    feedback.className = 'feedback ok';
    feedback.textContent =
      'Reporte importado: ' + datos.materiales.length + ' material(es).';
    input.value = '';
    refrescar();
    Tecnoven.ui.showMessage('Reporte importado');
  }

  function manejarClickReportes(event) {
    const boton = event.target.closest('button[data-accion]');
    if (!boton) return;

    const tarjeta = boton.closest('.report-card');
    if (!tarjeta) return;

    const id = tarjeta.dataset.id;
    const reporte = Tecnoven.reportes.obtener(id);
    if (!reporte) return;

    const accion = boton.dataset.accion;

    if (accion === 'ver') {
      const texto = tarjeta.querySelector('.texto');
      if (!texto) return;

      texto.hidden = !texto.hidden;
      boton.textContent = texto.hidden ? 'Ver' : 'Ocultar';
      return;
    }

    if (accion === 'copiar') {
      Tecnoven.utils.copyText(reporte.texto).then(() => Tecnoven.ui.showMessage('Copiado ✅'));
      return;
    }

    if (accion === 'eliminar') {
      if (!global.confirm('¿Eliminar el reporte de ' + reporte.cliente + '? También se quitarán sus materiales del inventario.')) {
        return;
      }

      Tecnoven.reportes.eliminar(id);
      refrescar();
      Tecnoven.ui.showMessage('Reporte eliminado');
    }
  }

  /* --------------------------------- Arranque ------------------------------- */

  function init() {
    Tecnoven.reportes.migrar();

    rellenarClientes($('filtroClienteInv'));
    renderInventario();
    renderReportes();

    const filtroCliente = $('filtroClienteInv');
    if (filtroCliente) filtroCliente.addEventListener('change', renderInventario);

    const filtroTipo = $('filtroTipoRep');
    if (filtroTipo) filtroTipo.addEventListener('change', renderReportes);

    const buscador = $('buscarRep');
    if (buscador) buscador.addEventListener('input', renderReportes);

    const btnImportar = $('btnImportarTexto');
    if (btnImportar) btnImportar.addEventListener('click', importarPegado);

    const btnJSON = $('btnExportarJSON');
    if (btnJSON) btnJSON.addEventListener('click', descargarJSON);

    const btnCSV = $('btnExportarCSV');
    if (btnCSV) btnCSV.addEventListener('click', descargarCSV);

    const lista = $('reportesLista');
    if (lista) lista.addEventListener('click', manejarClickReportes);
  }

  Tecnoven.inventario = {
    init,
    refrescar,
    renderInventario,
    renderReportes
  };
})(window);
