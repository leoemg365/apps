/**
 * SuperKeys — interfaz: bloqueo, bóveda, generador, ajustes y respaldos.
 */
(function (global) {
  'use strict';

  const SuperKeys = global.SuperKeys;
  const vault = SuperKeys.vault;
  const cripto = SuperKeys.crypto;
  const frases = SuperKeys.quotes;

  const PREFERENCIAS = 'superkeys.prefs';
  const NOVEDADES_VISTAS = 'superkeys.novedades';

  const $ = (id) => document.getElementById(id);

  const estado = {
    filtro: 'todas',
    categoria: '',
    busqueda: '',
    edicion: null,
    generadorDesdeItem: false,
    verId: null,
    claveVisible: false,
    temporizadorBloqueo: null,
    temporizadorPortapapeles: null,
    ultimaActividad: 0
  };

  /* ------------------------------- Utilidades ------------------------------ */

  function crear(tag, clase, texto) {
    const nodo = document.createElement(tag);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function toast(mensaje) {
    const caja = $('toast');
    if (!caja) return;

    caja.textContent = mensaje;
    caja.classList.add('visible');

    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => caja.classList.remove('visible'), 2600);
  }

  function abrirModal(id) {
    const modal = $(id);
    if (modal) modal.classList.remove('oculto');
  }

  function cerrarModal(id) {
    const modal = $(id);
    if (modal) modal.classList.add('oculto');
  }

  function leerPreferencias() {
    try {
      return JSON.parse(localStorage.getItem(PREFERENCIAS)) || {};
    } catch (error) {
      return {};
    }
  }

  function guardarPreferencias(cambios) {
    const actuales = leerPreferencias();
    localStorage.setItem(PREFERENCIAS, JSON.stringify(Object.assign({}, actuales, cambios)));
  }

  /* --------------------------------- Tema ---------------------------------- */

  function temaDelSistema() {
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  }

  function aplicarTema(tema, acento) {
    const elegido = tema === 'auto' ? temaDelSistema() : tema || 'claro';

    document.body.dataset.tema = elegido;
    if (acento) document.body.dataset.acento = acento;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const color = getComputedStyle(document.body).getPropertyValue('--fondo-2').trim();
      if (color) meta.setAttribute('content', color);
    }
  }

  function iniciarTema() {
    const preferencias = leerPreferencias();
    aplicarTema(preferencias.tema || 'auto', preferencias.acento || 'vino');

    if (global.matchMedia) {
      const consulta = global.matchMedia('(prefers-color-scheme: dark)');
      if (typeof consulta.addEventListener === 'function') {
        consulta.addEventListener('change', () => {
          const tema = leerPreferencias().tema || 'auto';
          if (tema === 'auto') aplicarTema('auto', leerPreferencias().acento);
        });
      }
    }
  }

  /* ------------------------------ Portapapeles ----------------------------- */

  async function escribirPortapapeles(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (error) {
      const area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();

      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (fallo) {
        ok = false;
      }

      document.body.removeChild(area);
      return ok;
    }
  }

  function programarLimpiezaPortapapeles() {
    const segundos = Number(vault.ajustes().limpiarPortapapeles);
    clearTimeout(estado.temporizadorPortapapeles);

    if (!segundos) return;

    estado.temporizadorPortapapeles = setTimeout(() => {
      escribirPortapapeles('');
    }, segundos * 1000);
  }

  async function copiar(texto, etiqueta) {
    if (!texto) {
      toast('No hay nada que copiar');
      return;
    }

    const ok = await escribirPortapapeles(texto);

    if (!ok) {
      toast('No se pudo copiar');
      return;
    }

    const segundos = Number(vault.ajustes().limpiarPortapapeles);
    toast(etiqueta + ' copiado' + (segundos ? ' · se borra en ' + segundos + ' s' : ''));
    programarLimpiezaPortapapeles();
  }

  /* ------------------------------- Bloqueo --------------------------------- */

  function segundosDeInactividad() {
    return Number(vault.ajustes().bloqueoMin) * 60000;
  }

  function reiniciarTemporizador() {
    clearTimeout(estado.temporizadorBloqueo);

    const espera = segundosDeInactividad();
    if (!espera) return;

    estado.ultimaActividad = Date.now();
    estado.temporizadorBloqueo = setTimeout(() => bloquear('Cerrada por inactividad'), espera);
  }

  function marcarActividad() {
    if (!vault.estado()) return;
    if (Date.now() - estado.ultimaActividad < 1500) return;
    reiniciarTemporizador();
  }

  function bloquear(motivo) {
    clearTimeout(estado.temporizadorBloqueo);
    clearTimeout(estado.temporizadorPortapapeles);

    vault.bloquear();

    $('app').classList.add('oculto');
    $('pantalla-bloqueo').classList.remove('oculto');
    $('maestra').value = '';
    $('error-bloqueo').textContent = '';

    ['modal-ver', 'modal-item', 'modal-generador', 'modal-ajustes'].forEach(cerrarModal);

    prepararPantallaBloqueo();

    if (motivo) toast(motivo);
  }

  function prepararPantallaBloqueo() {
    const hayBoveda = vault.existe();

    $('form-crear').classList.toggle('oculto', hayBoveda);
    $('form-desbloquear').classList.toggle('oculto', !hayBoveda);
    $('frase-dia').textContent = frases.fraseDelDia();

    if (!hayBoveda) {
      $('racha-texto').textContent = '';
      return;
    }

    const racha = leerRachaGuardada();
    $('racha-texto').textContent = racha
      ? '🔥 ' + racha + ' día(s) seguidos · ' + frases.fraseAleatoria()
      : '';
  }

  /** La racha se conoce tras desbloquear; se guarda un resumen no sensible. */
  function leerRachaGuardada() {
    try {
      const guardado = JSON.parse(localStorage.getItem('superkeys.racha'));
      return guardado && guardado.consecutivos ? guardado.consecutivos : 0;
    } catch (error) {
      return 0;
    }
  }

  /* ------------------------------- Entrar ---------------------------------- */

  function entrar() {
    $('pantalla-bloqueo').classList.add('oculto');
    $('app').classList.remove('oculto');

    const ajustes = vault.ajustes();
    aplicarTema(ajustes.tema, ajustes.acento);
    guardarPreferencias({ tema: ajustes.tema, acento: ajustes.acento });

    // Resumen de racha para la próxima pantalla de bloqueo.
    const racha = vault.racha();
    localStorage.setItem('superkeys.racha', JSON.stringify({ consecutivos: racha.consecutivos }));

    render();
    reiniciarTemporizador();

    if (localStorage.getItem(NOVEDADES_VISTAS) !== '1.0') {
      abrirModal('modal-novedades');
      localStorage.setItem(NOVEDADES_VISTAS, '1.0');
    }
  }

  /* -------------------------------- Render --------------------------------- */

  function categoriasDisponibles() {
    const vistas = new Set();
    vault.listar().forEach((item) => vistas.add(item.categoria || 'General'));
    return Array.from(vistas).sort((a, b) => a.localeCompare(b, 'es'));
  }

  function renderFiltros() {
    const caja = $('filtros');
    caja.textContent = '';

    const opciones = [{ id: 'todas', texto: 'Todas' }, { id: 'favoritos', texto: '⭐ Favoritas' }];
    categoriasDisponibles().forEach((categoria) => opciones.push({ id: 'cat:' + categoria, texto: categoria }));

    opciones.forEach((opcion) => {
      const boton = crear('button', 'chip', opcion.texto);
      boton.type = 'button';
      boton.dataset.filtro = opcion.id;

      const activo =
        estado.filtro === 'cat'
          ? opcion.id === 'cat:' + estado.categoria
          : opcion.id === estado.filtro;

      if (activo) boton.classList.add('activo');

      boton.addEventListener('click', () => {
        if (opcion.id === 'todas' || opcion.id === 'favoritos') {
          estado.filtro = opcion.id;
          estado.categoria = '';
        } else {
          estado.filtro = 'cat';
          estado.categoria = opcion.id.slice(4);
        }
        render();
      });

      caja.appendChild(boton);
    });
  }

  function itemsVisibles() {
    let items = vault.buscar(estado.busqueda);

    if (estado.filtro === 'favoritos') items = items.filter((item) => item.favorito);
    if (estado.filtro === 'cat') items = items.filter((item) => (item.categoria || 'General') === estado.categoria);

    return items.sort((a, b) => {
      if (!!b.favorito !== !!a.favorito) return b.favorito ? 1 : -1;
      return String(a.titulo).localeCompare(String(b.titulo), 'es');
    });
  }

  function tarjeta(item) {
    const caja = crear('article', 'entrada' + (item.favorito ? ' favorita' : ''));

    const cabecera = crear('div', 'entrada-cabecera');
    const datos = crear('div');
    datos.appendChild(crear('h2', 'entrada-titulo', (item.favorito ? '⭐ ' : '') + item.titulo));

    if (item.usuario) datos.appendChild(crear('p', 'entrada-usuario', '👤 ' + item.usuario));
    if (item.sitio) datos.appendChild(crear('p', 'entrada-sitio', '🌐 ' + item.sitio));

    cabecera.appendChild(datos);

    const ver = crear('button', 'boton-icono', '👁️');
    ver.type = 'button';
    ver.title = 'Ver detalle';
    ver.addEventListener('click', () => abrirVer(item.id));
    cabecera.appendChild(ver);

    const acciones = crear('div', 'entrada-acciones');

    const copiarClave = crear('button', 'boton primario', 'Copiar clave');
    copiarClave.type = 'button';
    copiarClave.addEventListener('click', () => copiar(item.password, 'Contraseña'));

    const copiarUsuario = crear('button', 'boton', 'Copiar usuario');
    copiarUsuario.type = 'button';
    copiarUsuario.disabled = !item.usuario;
    copiarUsuario.addEventListener('click', () => copiar(item.usuario, 'Usuario'));

    const editar = crear('button', 'boton', 'Editar');
    editar.type = 'button';
    editar.addEventListener('click', () => abrirFormulario(item.id));

    acciones.appendChild(copiarClave);
    acciones.appendChild(copiarUsuario);
    acciones.appendChild(editar);

    caja.appendChild(cabecera);
    caja.appendChild(acciones);

    return caja;
  }

  function render() {
    renderFiltros();

    const lista = $('lista');
    lista.textContent = '';

    const items = itemsVisibles();

    if (!items.length) {
      const vacia = crear('div', 'vacia');
      vacia.appendChild(crear('span', 'vacia-icono', '🗝️'));
      vacia.appendChild(crear('p', null, vault.listar().length
        ? 'No hay resultados con ese filtro.'
        : 'Tu bóveda está vacía. Pulsa + para guardar tu primera contraseña.'));
      vacia.appendChild(crear('p', null, frases.fraseDelDia()));
      lista.appendChild(vacia);
    } else {
      items.forEach((item) => lista.appendChild(tarjeta(item)));
    }

    const stats = vault.estadisticas();
    const partes = [stats.total + ' entrada(s)'];
    if (stats.debiles) partes.push('⚠️ ' + stats.debiles + ' débil(es)');
    if (stats.repetidas) partes.push('♻️ ' + stats.repetidas + ' repetida(s)');
    $('resumen').textContent = partes.join(' · ');
  }

  /* ------------------------------ Ver entrada ------------------------------ */

  function abrirVer(id) {
    const item = vault.obtener(id);
    if (!item) return;

    estado.verId = id;
    estado.claveVisible = false;

    $('ver-titulo').textContent = item.titulo;
    $('ver-usuario').textContent = item.usuario || '—';
    $('ver-password').textContent = '••••••••';
    $('ver-sitio').textContent = item.sitio || '—';
    $('ver-categoria').textContent = item.categoria || 'General';
    $('ver-notas').textContent = item.notas || '—';

    $('ver-copiar-usuario').disabled = !item.usuario;

    abrirModal('modal-ver');
  }

  function alternarClaveVer() {
    const item = vault.obtener(estado.verId);
    if (!item) return;

    estado.claveVisible = !estado.claveVisible;
    $('ver-password').textContent = estado.claveVisible ? item.password : '••••••••';
  }

  /* --------------------------- Crear / editar ------------------------------ */

  function abrirFormulario(id) {
    const item = id ? vault.obtener(id) : null;

    estado.edicion = id || null;

    $('item-titulo').textContent = item ? 'Editar entrada' : 'Nueva contraseña';
    $('item-titulo-campo').value = item ? item.titulo : '';
    $('item-usuario').value = item ? item.usuario : '';
    $('item-password').value = item ? item.password : '';
    $('item-sitio').value = item ? item.sitio : '';
    $('item-categoria').value = item ? item.categoria : 'General';
    $('item-notas').value = item ? item.notas : '';
    $('item-favorito').checked = item ? !!item.favorito : false;

    $('item-eliminar').classList.toggle('oculto', !item);
    actualizarMedidorItem();

    abrirModal('modal-item');
    setTimeout(() => $('item-titulo-campo').focus(), 120);
  }

  function actualizarMedidorItem() {
    const valor = $('item-password').value;
    const fuerza = cripto.medirFuerza(valor);
    const barra = $('item-medidor');

    barra.style.width = (fuerza.nivel / 4) * 100 + '%';
    barra.style.background = ['#c62828', '#c62828', '#b7791f', '#1e8e3e', '#1e8e3e'][fuerza.nivel];
  }

  async function guardarItem(evento) {
    evento.preventDefault();

    const titulo = $('item-titulo-campo').value.trim();
    const password = $('item-password').value;

    if (!titulo) {
      toast('Ponle un título');
      $('item-titulo-campo').focus();
      return;
    }

    if (!password) {
      toast('Falta la contraseña');
      $('item-password').focus();
      return;
    }

    const datos = {
      titulo,
      usuario: $('item-usuario').value,
      password,
      sitio: $('item-sitio').value,
      categoria: $('item-categoria').value,
      notas: $('item-notas').value,
      favorito: $('item-favorito').checked
    };

    const totalAntes = vault.listar().length;
    let mensaje = '';

    if (estado.edicion) {
      await vault.actualizar(estado.edicion, datos);
      mensaje = 'Entrada actualizada';
    } else {
      await vault.agregar(datos);
      mensaje = totalAntes === 0 ? frases.logro('primera') : totalAntes === 2 ? frases.logro('tres') : 'Contraseña guardada';
    }

    if (vault.ajustes().mensajes && cripto.medirFuerza(password).nivel >= 3) {
      mensaje = frases.logro('fuerte');
    }

    if (mensaje) toast(mensaje);

    cerrarModal('modal-item');
    render();
    reiniciarTemporizador();
  }

  async function eliminarItem() {
    if (!estado.edicion) return;

    if (!global.confirm('¿Eliminar esta entrada? No se puede deshacer.')) return;

    await vault.eliminar(estado.edicion);
    estado.edicion = null;

    cerrarModal('modal-item');
    render();
    toast('Entrada eliminada');
  }

  /* ------------------------------- Generador ------------------------------- */

  function opcionesGenerador() {
    return {
      longitud: Number($('generador-longitud').value),
      mayusculas: $('generador-mayusculas').checked,
      minusculas: true,
      numeros: $('generador-numeros').checked,
      simbolos: $('generador-simbolos').checked,
      evitarAmbiguos: $('generador-ambiguos').checked
    };
  }

  function generar() {
    const valor = cripto.generarPassword(opcionesGenerador());
    $('generador-resultado').textContent = valor;
    return valor;
  }

  function abrirGenerador(desdeItem) {
    estado.generadorDesdeItem = !!desdeItem;
    $('generador-usar').classList.toggle('oculto', !desdeItem);
    $('generador-longitud-valor').textContent = $('generador-longitud').value;
    generar();
    abrirModal('modal-generador');
  }

  function usarGenerado() {
    const valor = $('generador-resultado').textContent;
    $('item-password').value = valor;
    actualizarMedidorItem();
    cerrarModal('modal-generador');
  }

  /* -------------------------------- Ajustes -------------------------------- */

  function abrirAjustes() {
    const ajustes = vault.ajustes();

    $('ajuste-tema').value = ajustes.tema;
    $('ajuste-acento').value = ajustes.acento;
    $('ajuste-bloqueo').value = String(ajustes.bloqueoMin);
    $('ajuste-portapapeles').value = String(ajustes.limpiarPortapapeles);
    $('ajuste-ocultar').checked = !!ajustes.bloquearAlOcultar;
    $('ajuste-mensajes').checked = !!ajustes.mensajes;

    abrirModal('modal-ajustes');
  }

  async function cambiarAjuste(cambios) {
    const ajustes = await vault.guardarAjustes(cambios);
    guardarPreferencias({ tema: ajustes.tema, acento: ajustes.acento });
    aplicarTema(ajustes.tema, ajustes.acento);
    reiniciarTemporizador();
  }

  function descargar(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');

    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);

    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function exportarRespaldo() {
    const fecha = new Date().toISOString().slice(0, 10);
    descargar('superkeys-' + fecha + '.json', vault.exportar(), 'application/json');
    toast(frases.logro('respaldo') || 'Respaldo descargado');
  }

  function importarRespaldo(archivo) {
    if (!archivo) return;

    const lector = new FileReader();

    lector.onload = () => {
      const resultado = vault.importar(String(lector.result || ''));

      if (!resultado.ok) {
        toast(resultado.motivo);
        return;
      }

      cerrarModal('modal-ajustes');
      bloquear();
      toast('Respaldo importado. Escribe tu contraseña maestra.');
    };

    lector.onerror = () => toast('No se pudo leer el archivo');
    lector.readAsText(archivo);
  }

  async function borrarBoveda() {
    if (!global.confirm('¿Borrar la bóveda de este dispositivo? No se puede deshacer.')) return;
    if (!global.confirm('Última confirmación: se perderán todas las entradas guardadas aquí.')) return;

    vault.borrarTodo();
    cerrarModal('modal-ajustes');
    bloquear();
    toast('Bóveda eliminada');
  }

  /* -------------------------------- Eventos -------------------------------- */

  function unirEventos() {
    // Crear bóveda
    $('form-crear').addEventListener('submit', async (evento) => {
      evento.preventDefault();

      const primera = $('nueva-maestra').value;
      const repetida = $('repetir-maestra').value;
      const error = $('error-bloqueo');

      error.textContent = '';

      if (primera.length < 8) {
        error.textContent = 'Usa al menos 8 caracteres.';
        return;
      }

      if (primera !== repetida) {
        error.textContent = 'Las contraseñas no coinciden.';
        return;
      }

      if (cripto.medirFuerza(primera).nivel < 2) {
        error.textContent = 'Esa contraseña maestra es muy débil: usa una más larga.';
        return;
      }

      try {
        await vault.crear(primera);
        $('nueva-maestra').value = '';
        $('repetir-maestra').value = '';
        entrar();
        toast('Bóveda creada 🔐');
      } catch (fallo) {
        error.textContent = 'No se pudo crear la bóveda: ' + fallo.message;
      }
    });

    // Desbloquear
    $('form-desbloquear').addEventListener('submit', async (evento) => {
      evento.preventDefault();

      const password = $('maestra').value;
      const error = $('error-bloqueo');

      error.textContent = '';
      $('maestra').disabled = true;

      const ok = await vault.desbloquear(password);

      $('maestra').disabled = false;

      if (!ok) {
        error.textContent = 'Contraseña incorrecta.';
        $('maestra').value = '';
        $('maestra').focus();
        return;
      }

      $('maestra').value = '';
      entrar();
    });

    // Ver / ocultar contraseñas del bloqueo
    document.querySelectorAll('.ojo[data-ver]').forEach((boton) => {
      boton.addEventListener('click', () => {
        const campo = $(boton.dataset.ver);
        const mostrar = campo.type === 'password';
        campo.type = mostrar ? 'text' : 'password';
        boton.textContent = mostrar ? '🙈' : '👁️';
      });
    });

    // Medidor de la contraseña maestra
    $('nueva-maestra').addEventListener('input', (evento) => {
      const fuerza = cripto.medirFuerza(evento.target.value);
      const barra = $('medidor-barra');

      barra.style.width = (fuerza.nivel / 4) * 100 + '%';
      barra.style.background = ['#c62828', '#c62828', '#b7791f', '#1e8e3e', '#1e8e3e'][fuerza.nivel];
      $('medidor-texto').textContent = evento.target.value
        ? fuerza.texto + ' · ' + fuerza.bits + ' bits'
        : 'Mínimo 8 caracteres.';
    });

    // Cabecera
    $('btn-bloquear').addEventListener('click', () => bloquear('Bóveda bloqueada'));
    $('btn-ajustes').addEventListener('click', abrirAjustes);
    $('btn-generador').addEventListener('click', () => abrirGenerador(false));
    $('btn-nueva').addEventListener('click', () => abrirFormulario(null));

    // Buscador
    $('buscar').addEventListener('input', (evento) => {
      estado.busqueda = evento.target.value;
      render();
    });

    // Modales: cerrar
    document.querySelectorAll('[data-cerrar]').forEach((boton) => {
      boton.addEventListener('click', () => cerrarModal(boton.dataset.cerrar));
    });

    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('click', (evento) => {
        if (evento.target === modal) modal.classList.add('oculto');
      });
    });

    // Ver entrada
    $('btn-ver-ojo').addEventListener('click', alternarClaveVer);
    $('ver-copiar-usuario').addEventListener('click', () => {
      const item = vault.obtener(estado.verId);
      if (item) copiar(item.usuario, 'Usuario');
    });
    $('ver-copiar-password').addEventListener('click', () => {
      const item = vault.obtener(estado.verId);
      if (item) copiar(item.password, 'Contraseña');
    });
    $('ver-editar').addEventListener('click', () => {
      cerrarModal('modal-ver');
      abrirFormulario(estado.verId);
    });

    // Formulario de entrada
    $('form-item').addEventListener('submit', guardarItem);
    $('item-eliminar').addEventListener('click', eliminarItem);
    $('item-password').addEventListener('input', actualizarMedidorItem);
    $('item-generar').addEventListener('click', () => abrirGenerador(true));

    // Generador
    $('generador-longitud').addEventListener('input', (evento) => {
      $('generador-longitud-valor').textContent = evento.target.value;
      generar();
    });
    ['generador-mayusculas', 'generador-numeros', 'generador-simbolos', 'generador-ambiguos'].forEach((id) => {
      $(id).addEventListener('change', generar);
    });
    $('generador-regenerar').addEventListener('click', generar);
    $('generador-copiar').addEventListener('click', () => copiar($('generador-resultado').textContent, 'Contraseña'));
    $('generador-usar').addEventListener('click', usarGenerado);

    // Ajustes
    $('ajuste-tema').addEventListener('change', (evento) => cambiarAjuste({ tema: evento.target.value }));
    $('ajuste-acento').addEventListener('change', (evento) => cambiarAjuste({ acento: evento.target.value }));
    $('ajuste-bloqueo').addEventListener('change', (evento) => cambiarAjuste({ bloqueoMin: Number(evento.target.value) }));
    $('ajuste-portapapeles').addEventListener('change', (evento) => cambiarAjuste({ limpiarPortapapeles: Number(evento.target.value) }));
    $('ajuste-ocultar').addEventListener('change', (evento) => cambiarAjuste({ bloquearAlOcultar: evento.target.checked }));
    $('ajuste-mensajes').addEventListener('change', (evento) => cambiarAjuste({ mensajes: evento.target.checked }));

    $('btn-exportar').addEventListener('click', exportarRespaldo);
    $('btn-importar').addEventListener('click', () => $('archivo-respaldo').click());
    $('archivo-respaldo').addEventListener('change', (evento) => {
      importarRespaldo(evento.target.files && evento.target.files[0]);
      evento.target.value = '';
    });
    $('btn-borrar-boveda').addEventListener('click', borrarBoveda);

    // Actividad y bloqueo automático
    ['click', 'keydown', 'touchstart'].forEach((tipo) => {
      document.addEventListener(tipo, marcarActividad, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && vault.estado() && vault.ajustes().bloquearAlOcultar) {
        bloquear('Bloqueada al salir');
      }
    });

    // Enter en el desbloqueo
    $('maestra').addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') $('form-desbloquear').requestSubmit();
    });
  }

  /* --------------------------------- Init ---------------------------------- */

  function init() {
    iniciarTema();
    unirEventos();
    prepararPantallaBloqueo();

    if (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) {
      document.documentElement.classList.add('pwa');
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
