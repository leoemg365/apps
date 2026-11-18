/**
 * Inventario: importación de reportes, stock por cliente, historial y borrado.
 */
(function (global) {
  'use strict';

  const Tecnoven = global.Tecnoven;
  const { $ } = Tecnoven.utils;

  const INVENTORY_KEY = 'inventoryAppItems_v2';
  const HISTORY_KEY = 'inventoryAppHistory_v2';

  const MATERIAL_FIELDS = [
    'CONECTOR APC',
    'CONECTOR UPC',
    'CONECTOR RG6',
    'CONECTOR RJ45',
    'SPLITTER TV',
    'ROSETA',
    'MANGUITA',
    'COUPLE',
    'METRAJE UTP',
    'METRAJE DROP',
    'METRAJE COAXIAL',
    'METRAJE FLAP',
    'MASTIL',
    'TENSORES',
    'PREFORMADOS',
    'GRAPAS y CLAVOS',
    'Ramplug y Tornillos'
  ];

  let inventory = [];
  let history = [];

  /** Crea un elemento con clase, texto y atributos. */
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

  /** Identificador único del item o del reporte. */
  function uid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function load() {
    try {
      inventory = JSON.parse(localStorage.getItem(INVENTORY_KEY)) || [];
    } catch (error) {
      inventory = [];
    }

    try {
      history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch (error) {
      history = [];
    }
  }

  function save() {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  /**
   * Extrae fecha, cliente y materiales del texto del reporte.
   * Formato esperado, una línea por campo: "CLAVE: valor".
   */
  function parseReportText(text) {
    const data = { items: [] };

    String(text)
      .split(/\r?\n/)
      .forEach((line) => {
        const index = line.indexOf(':');
        if (index === -1) return;

        const rawKey = line.slice(0, index).trim();
        const key = rawKey.toUpperCase();
        const value = line.slice(index + 1).trim();

        if (key === 'FECHA') {
          data.entryDate = value;
        } else if (key === 'NOMBRE DE CLIENTE') {
          data.clientName = value;
        } else if (
          value &&
          value.toLowerCase() !== 'n/a' &&
          MATERIAL_FIELDS.some((field) => field.toUpperCase() === key)
        ) {
          data.items.push({ name: rawKey, value });
        }
      });

    return data;
  }

  function renderInventory() {
    const body = $('inventarioCuerpo');
    if (!body) return;

    body.textContent = '';

    if (!inventory.length) {
      const row = el('tr');
      const cell = el('td', { className: 'table-empty', text: 'No hay items en el inventario.' });
      cell.colSpan = 4;
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    inventory
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .forEach((item) => {
        const row = el('tr');
        row.appendChild(el('td', { text: item.itemName }));
        row.appendChild(el('td', { text: item.itemValue }));
        row.appendChild(el('td', { text: item.clientName }));

        const actions = el('td');
        const button = el('button', { className: 'link-danger', text: 'Eliminar' });
        button.type = 'button';
        button.dataset.id = item.id;
        button.setAttribute('aria-label', 'Eliminar ' + item.itemName + ' de ' + item.clientName);
        actions.appendChild(button);
        row.appendChild(actions);

        body.appendChild(row);
      });
  }

  function renderHistory() {
    const list = $('historialLista');
    if (!list) return;

    list.textContent = '';

    if (!history.length) {
      list.appendChild(el('p', { className: 'table-empty', text: 'No hay reportes en el historial.' }));
      return;
    }

    history
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .forEach((report) => {
        const card = el('article', { className: 'report-card' });

        const header = el('header');
        const info = el('div');
        info.appendChild(el('h4', { text: report.clientName }));
        info.appendChild(el('p', { className: 'meta', text: 'Fecha: ' + report.entryDate }));
        header.appendChild(info);

        const remove = el('button', { className: 'link-danger', text: 'Eliminar' });
        remove.type = 'button';
        remove.dataset.reportId = report.reportId;
        remove.setAttribute('aria-label', 'Eliminar el reporte de ' + report.clientName);
        header.appendChild(remove);
        card.appendChild(header);

        const wrap = el('div', { className: 'table-wrap' });
        const table = el('table', { className: 'data-table' });

        const head = el('thead');
        const headRow = el('tr');
        headRow.appendChild(el('th', { text: 'Item' }));
        headRow.appendChild(el('th', { text: 'Cantidad' }));
        head.appendChild(headRow);
        table.appendChild(head);

        const body = el('tbody');
        (report.items || []).forEach((item) => {
          const row = el('tr');
          row.appendChild(el('td', { text: item.name }));
          row.appendChild(el('td', { text: item.value }));
          body.appendChild(row);
        });
        table.appendChild(body);

        wrap.appendChild(table);
        card.appendChild(wrap);
        list.appendChild(card);
      });
  }

  function setFeedback(message, isError) {
    const feedback = $('feedbackProceso');
    if (!feedback) return;

    feedback.className = 'feedback ' + (isError ? 'error' : 'ok');
    feedback.textContent = message;
  }

  function handleProcess() {
    const input = $('reporteInput');
    if (!input) return;

    const text = input.value.trim();

    if (!text) {
      setFeedback('Pega primero el reporte de trabajo.', true);
      return;
    }

    try {
      const parsed = parseReportText(text);

      if (!parsed.entryDate) throw new Error("falta la línea 'FECHA'.");
      if (!parsed.clientName) throw new Error("falta la línea 'NOMBRE DE CLIENTE'.");
      if (!parsed.items.length) throw new Error('no se encontraron materiales válidos.');

      const reportId = uid();
      const createdAt = Date.now();

      history.push({
        reportId,
        clientName: parsed.clientName,
        entryDate: parsed.entryDate,
        items: parsed.items,
        createdAt
      });

      parsed.items.forEach((item) => {
        inventory.push({
          id: uid(),
          reportId,
          itemName: item.name,
          itemValue: item.value,
          clientName: parsed.clientName,
          entryDate: parsed.entryDate,
          createdAt
        });
      });

      save();
      renderInventory();
      renderHistory();

      setFeedback('Reporte agregado: ' + parsed.items.length + ' item(s).', false);
      input.value = '';
      Tecnoven.ui.showMessage('Reporte añadido al inventario');
    } catch (error) {
      setFeedback('Error: ' + error.message, true);
    }
  }

  function handleInventoryClick(event) {
    const button = event.target.closest('button[data-id]');
    if (!button) return;

    const item = inventory.find((entry) => entry.id === button.dataset.id);
    if (!item) return;

    if (!global.confirm('¿Eliminar "' + item.itemName + '"? Esta acción no se puede deshacer.')) {
      return;
    }

    inventory = inventory.filter((entry) => entry.id !== item.id);

    const report = history.find((entry) => entry.reportId === item.reportId);
    if (report) {
      report.items = report.items.filter(
        (entry) => !(entry.name === item.itemName && entry.value === item.itemValue)
      );
      if (!report.items.length) {
        history = history.filter((entry) => entry.reportId !== report.reportId);
      }
    }

    save();
    renderInventory();
    renderHistory();
    Tecnoven.ui.showMessage('Item eliminado');
  }

  function handleHistoryClick(event) {
    const button = event.target.closest('button[data-report-id]');
    if (!button) return;

    if (!global.confirm('¿Eliminar este reporte completo del historial y del inventario?')) {
      return;
    }

    const reportId = button.dataset.reportId;

    history = history.filter((entry) => entry.reportId !== reportId);
    inventory = inventory.filter((entry) => entry.reportId !== reportId);

    save();
    renderInventory();
    renderHistory();
    Tecnoven.ui.showMessage('Reporte eliminado');
  }

  function handleDeleteAll() {
    if (
      !global.confirm(
        '¿ESTÁS SEGURO? Se borrará TODO el inventario y TODO el historial de forma permanente.'
      )
    ) {
      return;
    }

    inventory = [];
    history = [];

    save();
    renderInventory();
    renderHistory();
    setFeedback('', false);
    Tecnoven.ui.showMessage('Datos eliminados');
  }

  function init() {
    load();
    renderInventory();
    renderHistory();

    Tecnoven.ui.initNavigation();
    Tecnoven.ui.initTheme();
    Tecnoven.ui.showSection('inventario-section');

    const processBtn = $('btnProcesar');
    if (processBtn) processBtn.addEventListener('click', handleProcess);

    const inventoryBody = $('inventarioCuerpo');
    if (inventoryBody) inventoryBody.addEventListener('click', handleInventoryClick);

    const historyList = $('historialLista');
    if (historyList) historyList.addEventListener('click', handleHistoryClick);

    const clearBtn = $('btnBorrarTodo');
    if (clearBtn) clearBtn.addEventListener('click', handleDeleteAll);
  }

  Tecnoven.inventario = {
    parseReportText,
    init
  };

  document.addEventListener('DOMContentLoaded', init);
})(window);
