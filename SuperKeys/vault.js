/**
 * SuperKeys — bóveda: creación, desbloqueo, CRUD y respaldos.
 *
 * En localStorage solo se guarda el sobre cifrado. El contenido descifrado
 * (items, ajustes y racha) vive en memoria mientras la bóveda está abierta.
 */
(function (global) {
  'use strict';

  const SuperKeys = global.SuperKeys;
  const cripto = SuperKeys.crypto;

  const CLAVE = 'superkeys.vault';
  const VERSION = 1;

  const AJUSTES_POR_DEFECTO = {
    tema: 'auto',
    acento: 'vino',
    bloqueoMin: 5,
    limpiarPortapapeles: 30,
    bloquearAlOcultar: false,
    mensajes: true
  };

  let claveCripto = null;
  let saltBytes = null;
  let iteraciones = cripto.ITERACIONES;
  let datos = null;
  let desbloqueada = false;
  let creada = null;

  /* ------------------------------ Utilidades ------------------------------ */

  function uid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'i-' + Date.now().toString(36) + '-' + Math.random().toString(16).slice(2);
  }

  function fechaLocal(desplazamientoDias) {
    const fecha = new Date(Date.now() - (desplazamientoDias || 0) * 86400000);
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return fecha.getFullYear() + '-' + mes + '-' + dia;
  }

  function leerSobre() {
    try {
      const crudo = JSON.parse(localStorage.getItem(CLAVE));
      return crudo && crudo.data && typeof crudo.salt === 'string' ? crudo : null;
    } catch (error) {
      return null;
    }
  }

  function datosIniciales() {
    return {
      items: [],
      ajustes: Object.assign({}, AJUSTES_POR_DEFECTO),
      racha: { ultima: '', consecutivos: 0, total: 0 },
      creado: Date.now()
    };
  }

  /** Completa campos que falten si la bóveda viene de una versión anterior. */
  function normalizar(contenido) {
    const base = datosIniciales();

    if (!contenido || typeof contenido !== 'object') return base;

    return {
      items: Array.isArray(contenido.items) ? contenido.items : [],
      ajustes: Object.assign({}, AJUSTES_POR_DEFECTO, contenido.ajustes || {}),
      racha: Object.assign({}, base.racha, contenido.racha || {}),
      creado: contenido.creado || base.creado
    };
  }

  function estado() {
    return desbloqueada;
  }

  function existe() {
    return !!leerSobre();
  }

  function contenido() {
    return datos;
  }

  function ajustes() {
    return datos ? datos.ajustes : Object.assign({}, AJUSTES_POR_DEFECTO);
  }

  /* -------------------------------- Apertura ------------------------------- */

  async function crear(password) {
    if (existe()) throw new Error('Ya existe una bóveda');

    saltBytes = cripto.azar(cripto.LONGITUD_SALT);
    iteraciones = cripto.ITERACIONES;
    claveCripto = await cripto.derivarClave(password, saltBytes, iteraciones);
    datos = datosIniciales();
    desbloqueada = true;
    creada = Date.now();
    registrarRacha();

    await guardar();
    return true;
  }

  async function desbloquear(password) {
    const sobre = leerSobre();
    if (!sobre) return false;

    try {
      const clave = await cripto.derivarClave(
        password,
        cripto.deBase64(sobre.salt),
        sobre.iter || cripto.ITERACIONES
      );
      const plano = await cripto.descifrar(clave, sobre.iv, sobre.data);

      claveCripto = clave;
      saltBytes = cripto.deBase64(sobre.salt);
      iteraciones = sobre.iter || cripto.ITERACIONES;
      creada = sobre.creado || null;
      datos = normalizar(plano);
      desbloqueada = true;

      registrarRacha();
      await guardar();
      return true;
    } catch (error) {
      claveCripto = null;
      datos = null;
      desbloqueada = false;
      return false;
    }
  }

  function bloquear() {
    claveCripto = null;
    saltBytes = null;
    datos = null;
    desbloqueada = false;
  }

  async function guardar() {
    if (!desbloqueada || !claveCripto) throw new Error('Bóveda bloqueada');

    const { iv, datos: cifrado } = await cripto.cifrar(claveCripto, datos);

    const sobre = {
      v: VERSION,
      iter: iteraciones,
      salt: cripto.aBase64(saltBytes),
      iv: iv,
      data: cifrado,
      creado: creada || Date.now(),
      actualizado: Date.now()
    };

    localStorage.setItem(CLAVE, JSON.stringify(sobre));
    return sobre;
  }

  /* --------------------------------- Ítems --------------------------------- */

  function listar() {
    return datos ? datos.items.slice() : [];
  }

  function obtener(id) {
    if (!datos) return null;
    return datos.items.find((item) => item.id === id) || null;
  }

  function buscar(texto) {
    const consulta = String(texto || '').trim().toLowerCase();
    if (!consulta) return listar();

    return listar().filter((item) => {
      return [item.titulo, item.usuario, item.sitio, item.categoria, item.notas]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(consulta));
    });
  }

  async function agregar(entrada) {
    if (!datos) throw new Error('Bóveda bloqueada');

    const ahora = Date.now();
    const item = {
      id: uid(),
      titulo: String(entrada.titulo || 'Sin título').trim(),
      usuario: String(entrada.usuario || '').trim(),
      password: String(entrada.password || ''),
      sitio: String(entrada.sitio || '').trim(),
      categoria: String(entrada.categoria || 'General'),
      notas: String(entrada.notas || ''),
      favorito: !!entrada.favorito,
      creado: ahora,
      actualizado: ahora
    };

    datos.items.push(item);
    await guardar();
    return item;
  }

  async function actualizar(id, cambios) {
    if (!datos) throw new Error('Bóveda bloqueada');

    const item = datos.items.find((entrada) => entrada.id === id);
    if (!item) return null;

    Object.keys(cambios || {}).forEach((campo) => {
      if (campo === 'id' || campo === 'creado') return;
      item[campo] = cambios[campo];
    });

    item.actualizado = Date.now();
    await guardar();
    return item;
  }

  async function eliminar(id) {
    if (!datos) throw new Error('Bóveda bloqueada');

    const antes = datos.items.length;
    datos.items = datos.items.filter((item) => item.id !== id);
    if (datos.items.length === antes) return false;

    await guardar();
    return true;
  }

  /* -------------------------------- Ajustes -------------------------------- */

  async function guardarAjustes(cambios) {
    if (!datos) throw new Error('Bóveda bloqueada');

    datos.ajustes = Object.assign({}, datos.ajustes, cambios || {});
    await guardar();
    return datos.ajustes;
  }

  /* --------------------------------- Racha --------------------------------- */

  function registrarRacha() {
    if (!datos) return;

    if (!datos.racha) datos.racha = { ultima: '', consecutivos: 0, total: 0 };

    const hoy = fechaLocal(0);
    if (datos.racha.ultima === hoy) return;

    datos.racha.consecutivos =
      datos.racha.ultima === fechaLocal(1) ? (datos.racha.consecutivos || 0) + 1 : 1;
    datos.racha.ultima = hoy;
    datos.racha.total = (datos.racha.total || 0) + 1;
  }

  function racha() {
    return datos ? datos.racha : { ultima: '', consecutivos: 0, total: 0 };
  }

  /* ------------------------------- Estadísticas ---------------------------- */

  function estadisticas() {
    const items = listar();
    const conteo = new Map();
    let fuertes = 0;
    let debiles = 0;

    items.forEach((item) => {
      const fuerza = cripto.medirFuerza(item.password);
      if (fuerza.nivel >= 3) fuertes += 1;
      if (fuerza.nivel <= 2) debiles += 1;

      const clave = item.password;
      conteo.set(clave, (conteo.get(clave) || 0) + 1);
    });

    let repetidas = 0;
    conteo.forEach((veces) => {
      if (veces > 1) repetidas += veces;
    });

    return { total: items.length, fuertes, debiles, repetidas };
  }

  /* -------------------------------- Respaldo ------------------------------- */

  /** El respaldo es el mismo sobre cifrado: sin la maestra no sirve de nada. */
  function exportar() {
    const sobre = leerSobre();
    if (!sobre) throw new Error('No hay bóveda para exportar');

    return JSON.stringify(
      { app: 'SuperKeys', exportado: new Date().toISOString(), sobre },
      null,
      2
    );
  }

  function validarRespaldo(texto) {
    let crudo;

    try {
      crudo = JSON.parse(texto);
    } catch (error) {
      return { ok: false, motivo: 'El archivo no es un JSON válido.' };
    }

    const sobre = crudo && crudo.sobre ? crudo.sobre : crudo;

    if (!sobre || typeof sobre.salt !== 'string' || !sobre.iv || !sobre.data) {
      return { ok: false, motivo: 'El archivo no parece un respaldo de SuperKeys.' };
    }

    return { ok: true, sobre };
  }

  /** Reemplaza la bóveda local por el respaldo. Desbloquéala después. */
  function importar(texto) {
    const revisado = validarRespaldo(texto);
    if (!revisado.ok) return revisado;

    localStorage.setItem(CLAVE, JSON.stringify(revisado.sobre));
    bloquear();

    return { ok: true };
  }

  function borrarTodo() {
    localStorage.removeItem(CLAVE);
    bloquear();
  }

  SuperKeys.vault = {
    CLAVE,
    AJUSTES_POR_DEFECTO,
    existe,
    estado,
    contenido,
    ajustes,
    crear,
    desbloquear,
    bloquear,
    guardar,
    listar,
    obtener,
    buscar,
    agregar,
    actualizar,
    eliminar,
    guardarAjustes,
    racha,
    estadisticas,
    exportar,
    importar,
    borrarTodo
  };
})(window);
