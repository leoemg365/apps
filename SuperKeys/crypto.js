/**
 * SuperKeys — cifrado de la bóveda.
 *
 * PBKDF2-SHA256 (310 000 iteraciones) para derivar la clave a partir de la
 * contraseña maestra y AES-GCM de 256 bits para cifrar el contenido.
 * La clave nunca se guarda: vive en memoria mientras la bóveda está abierta.
 */
(function (global) {
  'use strict';

  const SuperKeys = (global.SuperKeys = global.SuperKeys || {});

  const ITERACIONES = 310000;
  const LONGITUD_IV = 12;
  const LONGITUD_SALT = 16;

  const codificador = new TextEncoder();
  const decodificador = new TextDecoder();

  function textoABytes(texto) {
    return codificador.encode(String(texto));
  }

  function bytesATexto(bytes) {
    return decodificador.decode(bytes);
  }

  function azar(longitud) {
    const bytes = new Uint8Array(longitud);
    global.crypto.getRandomValues(bytes);
    return bytes;
  }

  function aBase64(bytes) {
    const vista = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binario = '';

    for (let i = 0; i < vista.length; i += 1) {
      binario += String.fromCharCode(vista[i]);
    }

    return global.btoa(binario);
  }

  function deBase64(texto) {
    const binario = global.atob(String(texto));
    const bytes = new Uint8Array(binario.length);

    for (let i = 0; i < binario.length; i += 1) {
      bytes[i] = binario.charCodeAt(i);
    }

    return bytes;
  }

  /** Deriva la clave AES-GCM desde la contraseña maestra. */
  async function derivarClave(password, salt, iteraciones) {
    const material = await global.crypto.subtle.importKey(
      'raw',
      textoABytes(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return global.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: iteraciones || ITERACIONES,
        hash: 'SHA-256'
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /** Cifra un objeto cualquiera. Devuelve el IV y el texto cifrado en base64. */
  async function cifrar(clave, objeto) {
    const iv = azar(LONGITUD_IV);
    const cifrado = await global.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      clave,
      textoABytes(JSON.stringify(objeto))
    );

    return { iv: aBase64(iv), datos: aBase64(cifrado) };
  }

  /** Descifra; lanza error si la clave no es la correcta (falla el tag GCM). */
  async function descifrar(clave, iv, datos) {
    const plano = await global.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: deBase64(iv) },
      clave,
      deBase64(datos)
    );

    return JSON.parse(bytesATexto(plano));
  }

  /* ------------------------------ Generador ------------------------------- */

  const MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const MINUSCULAS = 'abcdefghijkmnopqrstuvwxyz';
  const NUMEROS = '23456789';
  const SIMBOLOS = '!@#$%^&*-_=+?';

  /** Elige un carácter del pool sin sesgo de módulo. */
  function elegir(pool) {
    const limite = 256 - (256 % pool.length);
    let byte = azar(1)[0];

    while (byte >= limite) byte = azar(1)[0];

    return pool[byte % pool.length];
  }

  function generarPassword(opciones) {
    const opcionesFinales = Object.assign(
      { longitud: 20, mayusculas: true, minusculas: true, numeros: true, simbolos: true, evitarAmbiguos: true },
      opciones || {}
    );

    let pool = '';
    const obligatorios = [];

    if (opcionesFinales.mayusculas) {
      pool += MAYUSCULAS;
      obligatorios.push(elegir(MAYUSCULAS));
    }
    if (opcionesFinales.minusculas) {
      pool += MINUSCULAS;
      obligatorios.push(elegir(MINUSCULAS));
    }
    if (opcionesFinales.numeros) {
      pool += NUMEROS;
      obligatorios.push(elegir(NUMEROS));
    }
    if (opcionesFinales.simbolos) {
      pool += SIMBOLOS;
      obligatorios.push(elegir(SIMBOLOS));
    }

    if (!pool) {
      pool = MINUSCULAS + NUMEROS;
      obligatorios.length = 0;
      obligatorios.push(elegir(pool));
    }

    const longitud = Math.max(8, Math.min(64, Number(opcionesFinales.longitud) || 20));
    const caracteres = obligatorios.slice(0, longitud);

    while (caracteres.length < longitud) caracteres.push(elegir(pool));

    // Mezcla Fisher-Yates con azar criptográfico.
    for (let i = caracteres.length - 1; i > 0; i -= 1) {
      const j = azar(1)[0] % (i + 1);
      const tmp = caracteres[i];
      caracteres[i] = caracteres[j];
      caracteres[j] = tmp;
    }

    return caracteres.join('');
  }

  /* ------------------------------- Fuerza --------------------------------- */

  function entropiaBits(password) {
    const valor = String(password || '');
    if (!valor) return 0;

    let alfabeto = 0;
    if (/[a-z]/.test(valor)) alfabeto += 26;
    if (/[A-Z]/.test(valor)) alfabeto += 26;
    if (/[0-9]/.test(valor)) alfabeto += 10;
    if (/[^A-Za-z0-9]/.test(valor)) alfabeto += 33;
    if (alfabeto === 0) return 0;

    return Math.round(valor.length * Math.log2(alfabeto));
  }

  function medirFuerza(password) {
    const bits = entropiaBits(password);

    if (bits < 40) return { bits, nivel: 1, texto: 'Débil' };
    if (bits < 60) return { bits, nivel: 2, texto: 'Aceptable' };
    if (bits < 80) return { bits, nivel: 3, texto: 'Buena' };
    return { bits, nivel: 4, texto: 'Fuerte' };
  }

  SuperKeys.crypto = {
    ITERACIONES,
    LONGITUD_SALT,
    azar,
    aBase64,
    deBase64,
    derivarClave,
    cifrar,
    descifrar,
    generarPassword,
    entropiaBits,
    medirFuerza
  };
})(window);
