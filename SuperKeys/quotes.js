/**
 * SuperKeys — frases motivacionales (todo local, sin red).
 */
(function (global) {
  'use strict';

  const SuperKeys = (global.SuperKeys = global.SuperKeys || {});

  const FRASES = [
    'Cada contraseña fuerte es una puerta que cierras bien.',
    'Proteger lo tuyo también es cuidar tu tiempo.',
    'Un minuto hoy te ahorra un problema mañana.',
    'La constancia es la mejor cerradura.',
    'Orden pequeñito, tranquilidad enorme.',
    'Hoy sumas una llave más a tu tranquilidad.',
    'Los buenos hábitos no se notan: se agradecen.',
    'Tu información vale; trátala como tal.',
    'Mejor lento y seguro, que rápido y expuesto.',
    'Una clave distinta por cada puerta. Siempre.',
    'La seguridad no es un día, es una costumbre.',
    'Empieza pequeño: una entrada a la vez.',
    'Lo que cuidas, crece.',
    'Nadie necesita adivinar tu contraseña.',
    'Hazlo simple para ti, difícil para los demás.',
    'Un respaldo hoy es un respiro mañana.',
    'Tu calma también se guarda aquí.',
    'Cada paso cuenta, incluso el más corto.',
    'No es paranoia, es criterio.',
    'Buen trabajo: eso que guardaste está a salvo.'
  ];

  const LOGROS = {
    primera: '🎉 Primera contraseña guardada. La costumbre empieza así.',
    tres: '🔑 Tres claves a salvo. Ya tienes un llavero.',
    diez: '🏅 Diez entradas. Esto ya es un sistema.',
    fuerte: '💪 Esa contraseña es de las buenas.',
    respaldo: '📦 Respaldo hecho. Dormirás mejor.',
    racha3: '🔥 Tres días seguidos. La constancia manda.',
    racha7: '🏆 Una semana entera. Impecable.'
  };

  function hoyLocal() {
    const ahora = new Date();
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const dia = String(ahora.getDate()).padStart(2, '0');
    return ahora.getFullYear() + '-' + mes + '-' + dia;
  }

  /** Frase determinista por día: no cambia si recargas. */
  function fraseDelDia(fecha) {
    const clave = fecha || hoyLocal();
    let suma = 0;

    for (let i = 0; i < clave.length; i += 1) suma += clave.charCodeAt(i) * (i + 1);

    return FRASES[suma % FRASES.length];
  }

  function fraseAleatoria() {
    const bytes = new Uint8Array(1);
    global.crypto.getRandomValues(bytes);
    return FRASES[bytes[0] % FRASES.length];
  }

  function logro(clave) {
    return LOGROS[clave] || '';
  }

  SuperKeys.quotes = {
    FRASES,
    fraseDelDia,
    fraseAleatoria,
    logro,
    hoyLocal
  };
})(window);
