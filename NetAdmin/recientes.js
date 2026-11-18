/**
 * Copias recientes: panel lateral con las últimas copias para reutilizarlas.
 *
 * - Registra cada texto copiado desde la app (incluidas las Respuestas).
 * - Sugiere hasta 4: primero los de la pestaña activa, luego el resto.
 * - Deduplica: si repites un texto, sube al principio y suma usos.
 * - Persiste en localStorage (historial y estado abierto/cerrado).
 */
(function (global) {
  'use strict';

  const CLAVE = 'netadminRecientes';
  const CLAVE_ABIERTO = 'netadminRecientesAbierto';
  const CLAVE_CONTEXTO = 'recientesContexto';

  const VISIBLES = 4;
  const GUARDADOS = 20;

  let recientes = [];

  function $(id) {
    return document.getElementById(id);
  }

  function cargar() {
    try {
      const crudo = JSON.parse(localStorage.getItem(CLAVE));
      recientes = Array.isArray(crudo) ? crudo.filter((item) => item && item.texto) : [];
    } catch (error) {
      recientes = [];
    }
  }

  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(recientes));
    } catch (error) {
      // Sin espacio: se sigue usando solo en memoria.
    }
  }

  function recortar(texto, max) {
    const limpio = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
    return limpio.length > max ? limpio.slice(0, max - 1) + '…' : limpio;
  }

  function etiquetaPorDefecto(texto) {
    const primera = String(texto).split('\n')[0].trim();
    return recortar(primera, 42) || 'Copia';
  }

  /** Pestaña visible ahora mismo -> origen de las copias que interesan. */
  function origenDePestana() {
    const activo = document.querySelector('.tab.active');
    if (!activo) return '';

    const accion = activo.getAttribute('onclick') || '';
    if (accion.indexOf("'resp'") !== -1) return 'respuesta';
    if (accion.indexOf("'clip'") !== -1) return 'link';
    if (accion.indexOf("'pass'") !== -1) return 'password';
    return '';
  }

  /** Las 4 sugerencias: primero las de la pestaña activa, luego el resto. */
  function sugerencias() {
    const ordenadas = recientes.slice().sort((a, b) => (b.at || 0) - (a.at || 0));
    const contexto = origenDePestana();
    const usarContexto = localStorage.getItem(CLAVE_CONTEXTO) !== '0';

    if (!usarContexto || !contexto) return ordenadas.slice(0, VISIBLES);

    const propias = ordenadas.filter((item) => item.origen === contexto);
    const resto = ordenadas.filter((item) => item.origen !== contexto);

    return propias.concat(resto).slice(0, VISIBLES);
  }

  function boton(texto, titulo, accion) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mini-btn';
    btn.textContent = texto;
    btn.title = titulo;
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      accion();
    });
    return btn;
  }

  function fila(item) {
    // Las copias sin título (por ejemplo una contraseña) se muestran enmascaradas.
    const sensible = !item.etiqueta;

    const row = document.createElement('div');
    row.className = 'reciente-item' + (item.origen === 'respuesta' ? ' es-respuesta' : '');
    if (!sensible) row.title = item.texto;
    row.addEventListener('click', () => copiarItem(item));

    const top = document.createElement('div');
    top.className = 'reciente-top';

    const label = document.createElement('span');
    label.className = 'reciente-label';
    label.textContent = sensible ? 'Copia sin título' : item.etiqueta || etiquetaPorDefecto(item.texto);

    const meta = document.createElement('span');
    meta.className = 'reciente-meta';
    meta.textContent = (item.origen === 'respuesta' ? '💬' : '📋') + ' ×' + (item.usos || 1);

    top.appendChild(label);
    top.appendChild(meta);

    const texto = document.createElement('div');
    texto.className = 'reciente-texto';
    texto.textContent = sensible ? '••••••' : recortar(item.texto, 120);

    const acciones = document.createElement('div');
    acciones.className = 'reciente-actions';
    acciones.appendChild(boton('📋', 'Copiar de nuevo', () => copiarItem(item)));

    if (!sensible) {
      acciones.appendChild(
        boton('👁️', 'Ver completo', () => {
          if (typeof global.openPreview === 'function') {
            global.openPreview(item.etiqueta || etiquetaPorDefecto(item.texto), item.texto, item.texto);
          }
        })
      );
    }

    row.appendChild(top);
    row.appendChild(texto);
    row.appendChild(acciones);

    return row;
  }

  function render() {
    const lista = $('recientes-lista');
    const contador = $('recientes-count');
    if (!lista) return;

    const items = sugerencias();

    if (contador) {
      contador.textContent = String(recientes.length);
      contador.style.display = recientes.length ? 'inline-block' : 'none';
    }

    lista.innerHTML = '';

    if (!items.length) {
      const vacio = document.createElement('div');
      vacio.className = 'recientes-vacio';
      vacio.textContent = 'Aún no hay copias. Copia una respuesta y aparecerá aquí para reutilizarla.';
      lista.appendChild(vacio);
      return;
    }

    items.forEach((item) => lista.appendChild(fila(item)));
  }

  function copiarItem(item) {
    if (typeof global.copy === 'function') {
      global.copy(item.texto, { etiqueta: item.etiqueta, origen: item.origen });
    }
  }

  /**
   * Guarda una copia. Lo llama copy() de la app, así que cualquier botón
   * de copiar de NetAdmin alimenta el panel.
   */
  function registrarCopia(texto, meta) {
    const valor = String(texto == null ? '' : texto).trim();
    if (!valor) return;

    const info = meta || {};
    const existente = recientes.find((item) => item.texto === valor);

    if (existente) {
      existente.usos = (existente.usos || 1) + 1;
      existente.at = Date.now();
      if (info.etiqueta) existente.etiqueta = info.etiqueta;
      if (info.origen) existente.origen = info.origen;
      recientes = [existente].concat(recientes.filter((item) => item !== existente));
    } else {
      recientes.unshift({
        id: Date.now() + '-' + Math.random().toString(16).slice(2),
        texto: valor,
        etiqueta: info.etiqueta || '',
        origen: info.origen || 'otro',
        usos: 1,
        at: Date.now()
      });
    }
    recientes = recientes.slice(0, GUARDADOS);
    guardar();
    render();
  }

  function toggle(force) {
    const panel = $('recientes-panel');
    const tab = $('recientes-tab');
    if (!panel) return;

    const abrir = typeof force === 'boolean' ? force : !panel.classList.contains('open');

    panel.classList.toggle('open', abrir);
    panel.setAttribute('aria-hidden', abrir ? 'false' : 'true');
    if (tab) tab.setAttribute('aria-expanded', abrir ? 'true' : 'false');

    const raiz = $('recientes');
    if (raiz) raiz.classList.toggle('abierto', abrir);

    localStorage.setItem(CLAVE_ABIERTO, abrir ? '1' : '0');

    if (abrir) render();
  }

  function limpiar() {
    if (!recientes.length) return;
    if (!global.confirm('¿Vaciar el historial de copias recientes?')) return;

    recientes = [];
    guardar();
    render();
  }

  /** Lee el portapapeles del sistema (requiere permiso del navegador). */
  async function capturar() {
    try {
      const texto = await navigator.clipboard.readText();
      if (!texto || !texto.trim()) {
        if (typeof global.showToastMsg === 'function') global.showToastMsg('El portapapeles está vacío');
        return;
      }

      registrarCopia(texto, { etiqueta: 'Portapapeles', origen: 'externo' });
      if (typeof global.showToastMsg === 'function') global.showToastMsg('Capturado del portapapeles ✅');
    } catch (error) {
      if (typeof global.showToastMsg === 'function') {
        global.showToastMsg('El navegador no permite leer el portapapeles');
      }
    }
  }

  function guardarPreferencia() {
    const check = $('recientes-contexto');
    localStorage.setItem(CLAVE_CONTEXTO, check && check.checked ? '1' : '0');
    render();
  }

  function init() {
    cargar();
    render();

    const check = $('recientes-contexto');
    if (check) check.checked = localStorage.getItem(CLAVE_CONTEXTO) !== '0';

    if (localStorage.getItem(CLAVE_ABIERTO) === '1') toggle(true);
  }

  global.registrarCopia = registrarCopia;
  global.toggleRecientes = toggle;
  global.limpiarRecientes = limpiar;
  global.capturarPortapapeles = capturar;
  global.guardarPreferenciaRecientes = guardarPreferencia;
  global.renderRecientes = render;

  document.addEventListener('DOMContentLoaded', init);
})(window);
