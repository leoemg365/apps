/**
 * Punto de entrada: inicializa la interfaz y cada formulario.
 */
(function (global) {
  'use strict';

  const Tecnoven = global.Tecnoven;
  const { setFechaHoy, setHoraAhora } = Tecnoven.utils;

  function init() {
    Tecnoven.ui.initNavigation();
    Tecnoven.ui.initTheme();
    Tecnoven.qr.init();

    Tecnoven.forms.fichaInstalacion.init();
    Tecnoven.forms.activacion.init();
    Tecnoven.forms.solicitud.init();

    // Estado inicial: la sección pedida en la URL (#proceso-activacion) o la ficha.
    const requested = (global.location.hash || '').replace('#', '');
    const initialSection = document.getElementById(requested) ? requested : 'ficha-instalacion';
    Tecnoven.ui.showSection(initialSection);

    setFechaHoy('fecha');
    setHoraAhora('horaInicio');

    Tecnoven.ui.initUpdates();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
