/**
 * Almacén de reportes: guardado, materiales, inventario derivado y exportación.
 * Es la única fuente de verdad de los datos de la aplicación.
 */
(function (global) {
  'use strict';

  const Tecnoven = global.Tecnoven;
  const { toNA } = Tecnoven.utils;
  const { MATERIALES } = Tecnoven.config;

  const STORAGE_KEY = 'tecnoven.reportes.v3';
  const MIGRATION_FLAG = 'tecnoven.migrado.v3';
  const LEGACY_ITEMS_KEY = 'inventoryAppItems_v2';
  const LEGACY_HISTORY_KEY = 'inventoryAppHistory_v2';

  /** Aviso cuando el almacenamiento se acerca al límite del navegador. */
  const LIMITE_AVISO = 4 * 1024 * 1024;

  let cache = null;
  let avisoDado = false;

  /* ------------------------------ Persistencia ------------------------------ */

  function cargar() {
    if (cache) return cache;

    try {
      const crudo = JSON.parse(localStorage.getItem(STORAGE_KEY));
      cache = Array.isArray(crudo) ? crudo : [];
    } catch (error) {
      cache = [];
    }

    return cache;
  }

  function persistir() {
    const serializado = JSON.stringify(cargar());
    localStorage.setItem(STORAGE_KEY, serializado);

    // Aproximación: cada carácter UTF-16 ocupa 2 bytes.
    if (serializado.length * 2 > LIMITE_AVISO && !avisoDado) {
      avisoDado = true;
      Tecnoven.ui.showMessage('El almacenamiento va lleno: exporta un respaldo y borra reportes antiguos.');
    }
  }

  /** Normaliza el texto para comparar y guardar. */
  function normalizarTexto(texto) {
    return String(texto == null ? '' : texto)
      .replace(/\r\n/g, '\n')
      .replace(/\s+$/, '')
      .trim();
  }

  /** Huella estable del texto, para no guardar dos veces el mismo reporte. */
  function huella(texto) {
    const cadena = normalizarTexto(texto);
    let hash = 5381;

    for (let i = 0; i < cadena.length; i += 1) {
      hash = ((hash << 5) + hash + cadena.charCodeAt(i)) | 0;
    }

    return (hash >>> 0).toString(36) + '-' + cadena.length;
  }

  function uid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(16).slice(2);
  }

  /* --------------------------------- Lectura -------------------------------- */

  /** Reportes ordenados del más reciente al más antiguo. */
  function listar() {
    return cargar()
      .slice()
      .sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));
  }

  function obtener(id) {
    return cargar().find((reporte) => reporte.id === id) || null;
  }

  /** Materiales de un reporte en formato del catálogo. */
  function materialesDe(contadores) {
    return MATERIALES.map((material) => ({
      clave: material.etiqueta,
      cantidad: toNA(contadores ? contadores[material.campo] : '')
    })).filter((material) => material.cantidad !== 'n/a');
  }

  /* --------------------------------- Escritura ------------------------------ */

  /**
   * Guarda un reporte. Devuelve { ok, motivo } y nunca lanza.
   * Motivos: 'vacio' (sin texto), 'duplicado' (ya existe el mismo texto).
   */
  function guardar(datos) {
    const entrada = datos || {};
    const texto = normalizarTexto(entrada.texto);

    if (!texto) return { ok: false, motivo: 'vacio' };

    const lista = cargar();
    const firma = huella(texto);

    if (lista.some((reporte) => huella(reporte.texto) === firma)) {
      return { ok: false, motivo: 'duplicado' };
    }

    const reporte = {
      id: uid(),
      tipo: entrada.tipo || 'ficha',
      cliente: toNA(entrada.cliente),
      fecha: entrada.fecha || '',
      nap: entrada.nap || '',
      texto,
      materiales: Array.isArray(entrada.materiales)
        ? entrada.materiales.filter((item) => item && item.clave && item.cantidad !== 'n/a')
        : [],
      origen: entrada.origen || 'app',
      creadoEn: Date.now()
    };

    lista.push(reporte);
    persistir();

    return { ok: true, reporte };
  }

  function eliminar(id) {
    const lista = cargar();
    const indice = lista.findIndex((reporte) => reporte.id === id);

    if (indice === -1) return false;

    lista.splice(indice, 1);
    persistir();
    return true;
  }

  /* ------------------------------ Inventario ------------------------------- */

  function parsearCantidad(valor) {
    const numero = parseFloat(String(valor).replace(',', '.'));
    return Number.isFinite(numero) ? numero : 0;
  }

  function redondear(valor) {
    return Math.round(valor * 100) / 100;
  }

  /**
   * Suma los materiales de todos los reportes (opcionalmente de un cliente).
   * Devuelve filas en el orden del catálogo, solo con materiales usados.
   */
  function agregarInventario(filtroCliente) {
    const acumulado = new Map();

    listar().forEach((reporte) => {
      if (filtroCliente && reporte.cliente !== filtroCliente) return;

      (reporte.materiales || []).forEach((item) => {
        const cantidad = parsearCantidad(item.cantidad);
        const fila = acumulado.get(item.clave) || { total: 0, clientes: new Map() };

        fila.total += cantidad;
        fila.clientes.set(reporte.cliente, (fila.clientes.get(reporte.cliente) || 0) + cantidad);
        acumulado.set(item.clave, fila);
      });
    });

    return MATERIALES.filter((material) => acumulado.has(material.etiqueta)).map((material) => {
      const fila = acumulado.get(material.etiqueta);

      return {
        clave: material.etiqueta,
        unidad: material.unidad,
        total: redondear(fila.total),
        clientes: Array.from(fila.clientes.entries())
          .map(([cliente, total]) => ({ cliente, total: redondear(total) }))
          .sort((a, b) => b.total - a.total)
      };
    });
  }

  /* -------------------------------- Importar -------------------------------- */

  /** Lee un reporte pegado a mano. Devuelve { fecha, cliente, nap, materiales }. */
  function parsearTexto(texto) {
    const datos = { materiales: [] };

    normalizarTexto(texto)
      .split('\n')
      .forEach((linea) => {
        const separador = linea.indexOf(':');
        if (separador === -1) return;

        const clave = linea.slice(0, separador).trim();
        const valor = linea.slice(separador + 1).trim();
        const claveMayus = clave.toUpperCase();

        if (claveMayus === 'FECHA') {
          datos.fecha = valor;
        } else if (claveMayus === 'NOMBRE DE CLIENTE' || claveMayus === 'NOMBRE') {
          datos.cliente = valor;
        } else if (claveMayus === 'NAP') {
          datos.nap = valor;
        } else {
          const material = MATERIALES.find((item) => item.etiqueta.toUpperCase() === claveMayus);
          if (material && valor && valor.toLowerCase() !== 'n/a') {
            datos.materiales.push({ clave: material.etiqueta, cantidad: valor });
          }
        }
      });

    return datos;
  }

  /* ------------------------------- Exportar --------------------------------- */

  function exportarJSON() {
    return JSON.stringify(listar(), null, 2);
  }

  function csvCelda(valor) {
    const texto = String(valor == null ? '' : valor);
    return /[";\r\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
  }

  /** CSV con separador ";" (Excel en español) y BOM para acentos. */
  function exportarCSV(filtroCliente) {
    const unidades = new Map(MATERIALES.map((material) => [material.etiqueta, material.unidad]));
    const filas = [['Reporte', 'Fecha', 'Cliente', 'Tipo', 'Item', 'Cantidad', 'Unidad']];

    listar().forEach((reporte) => {
      if (filtroCliente && reporte.cliente !== filtroCliente) return;
      if (!(reporte.materiales || []).length) return;

      reporte.materiales.forEach((material) => {
        filas.push([
          reporte.id,
          reporte.fecha,
          reporte.cliente,
          reporte.tipo,
          material.clave,
          material.cantidad,
          unidades.get(material.clave) || ''
        ]);
      });
    });

    return '\uFEFF' + filas.map((fila) => fila.map(csvCelda).join(';')).join('\r\n');
  }

  /* -------------------------------- Migración ------------------------------- */

  function textoDeReporteViejo(viejo) {
    const lineas = [];

    if (viejo.entryDate) lineas.push('FECHA: ' + viejo.entryDate);
    if (viejo.clientName) lineas.push('NOMBRE DE CLIENTE: ' + viejo.clientName);
    (viejo.items || []).forEach((item) => lineas.push(item.name + ': ' + item.value));
    lineas.push('(Reporte migrado del inventario anterior)');

    return lineas.join('\n');
  }

  /**
   * Convierte el inventario anterior (items + historial) al formato nuevo.
   * No borra las claves antiguas: si algo falla, siguen ahí.
   */
  function migrar() {
    if (localStorage.getItem(MIGRATION_FLAG) === '1') {
      return { migrado: false, agregados: 0 };
    }

    let items = [];
    let historial = [];

    try {
      items = JSON.parse(localStorage.getItem(LEGACY_ITEMS_KEY)) || [];
    } catch (error) {
      items = [];
    }

    try {
      historial = JSON.parse(localStorage.getItem(LEGACY_HISTORY_KEY)) || [];
    } catch (error) {
      historial = [];
    }

    if (!items.length && !historial.length) {
      localStorage.setItem(MIGRATION_FLAG, '1');
      return { migrado: false, agregados: 0 };
    }

    const lista = cargar();
    const firmas = new Set(lista.map((reporte) => huella(reporte.texto)));
    let agregados = 0;

    const agregar = (reporte) => {
      const firma = huella(reporte.texto);
      if (firmas.has(firma)) return;

      firmas.add(firma);
      lista.push(reporte);
      agregados += 1;
    };

    historial.forEach((viejo) => {
      agregar({
        id: viejo.reportId || uid(),
        tipo: 'ficha',
        cliente: toNA(viejo.clientName),
        fecha: viejo.entryDate || '',
        nap: '',
        texto: textoDeReporteViejo(viejo),
        materiales: (viejo.items || []).map((item) => ({ clave: item.name, cantidad: item.value })),
        origen: 'migrado',
        creadoEn: viejo.createdAt || Date.now()
      });
    });

    // Items que quedaron sin reporte en el historial antiguo.
    const idsHistorial = new Set(historial.map((viejo) => viejo.reportId));
    const sueltos = new Map();

    items.forEach((item) => {
      if (idsHistorial.has(item.reportId)) return;

      const clave = item.reportId || 'sin-reporte';
      if (!sueltos.has(clave)) sueltos.set(clave, []);
      sueltos.get(clave).push(item);
    });

    sueltos.forEach((grupo, clave) => {
      agregar({
        id: 'migrado-' + clave,
        tipo: 'ficha',
        cliente: toNA(grupo[0].clientName),
        fecha: grupo[0].entryDate || '',
        nap: '',
        texto: textoDeReporteViejo({ entryDate: grupo[0].entryDate, clientName: grupo[0].clientName, items: grupo.map((item) => ({ name: item.itemName, value: item.itemValue })) }),
        materiales: grupo.map((item) => ({ clave: item.itemName, cantidad: item.itemValue })),
        origen: 'migrado',
        creadoEn: grupo[0].createdAt || Date.now()
      });
    });

    if (agregados) persistir();
    localStorage.setItem(MIGRATION_FLAG, '1');

    return { migrado: agregados > 0, agregados };
  }

  Tecnoven.reportes = {
    STORAGE_KEY,
    listar,
    obtener,
    guardar,
    eliminar,
    materialesDe,
    agregarInventario,
    parsearTexto,
    exportarJSON,
    exportarCSV,
    migrar,
    huella
  };
})(window);
