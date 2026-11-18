# SuperKeys

Gestor de contraseñas **local y cifrado** para usar en el iPhone y en el escritorio.
Una sola página, sin frameworks, sin cuentas y sin peticiones a internet.

## Cómo protege tus datos

- La bóveda se cifra en el navegador con **AES-GCM de 256 bits**.
- La clave se deriva de tu **contraseña maestra** con **PBKDF2-SHA256 (310 000 iteraciones)** y una sal aleatoria por bóveda.
- En `localStorage` solo se guarda el sobre cifrado: `{ v, iter, salt, iv, data }`.
- La clave y las contraseñas viven **únicamente en memoria** mientras la bóveda está desbloqueada.
- Todo el código es local (`crypto.js` no carga librerías): funciona sin conexión.

> ⚠️ **No hay recuperación.** Si olvidas la contraseña maestra, los datos son ilegibles.
> Exporta un respaldo de vez en cuando y guárdalo aparte.

> ℹ️ El sitio comparte origen con las demás apps del repo (`leoemg365.github.io`).
> Por eso **nunca** se guarda nada en claro: aun leyendo el `localStorage`, solo hay texto cifrado.

## Uso

1. Abre `index.html` (o la URL publicada) y crea la bóveda con una contraseña maestra larga.
2. Pulsa **＋** para guardar una contraseña: título, usuario, contraseña, sitio y notas.
3. En cada tarjeta: **Copiar clave**, **Copiar usuario**, **Editar**; 👁️ abre el detalle.
4. 🎲 abre el generador (longitud, símbolos, evitar caracteres confusos).
5. ⚙️ abre los ajustes: tema, acento, bloqueo por inactividad, vaciado del portapapeles, respaldos.

El portapapeles se vacía solo a los 30 segundos por defecto, y la bóveda se bloquea a los
5 minutos de inactividad. Bloquear al cambiar de pestaña es opcional y viene **desactivado**,
para que puedas copiar una clave y pegarla en otra app sin que se cierre.

## Instalarla

- **Android (Chrome / Edge):** al abrir la app aparece el aviso **«Instalar la app»**; también
  está en el menú ⋮ → *Instalar aplicación*. Si eliges «Ahora no», no vuelve a insistir en
  ese navegador.
- **iPhone (Safari):** **Compartir** → **Añadir a pantalla de inicio**. Si aún no está
  instalada, la pantalla de inicio de sesión muestra el recordatorio.

Instalarla en el iPhone también evita que Safari borre el almacenamiento del sitio por falta de uso.

## Respaldo

*Ajustes → Exportar respaldo* descarga `superkeys-AAAA-MM-DD.json`, que contiene el sobre
**cifrado** (sirve de poco sin la contraseña maestra). Para restaurar: *Importar respaldo* y
escribe la maestra. Es la forma de pasar las claves del iPhone al escritorio y al revés.

## Estructura

```text
SuperKeys/
├── index.html      Pantallas y modales (sin manejadores en línea)
├── styles.css      Temas claro/oscuro y cuatro acentos
├── crypto.js       PBKDF2, AES-GCM, generador y medidor de fuerza
├── vault.js        Bóveda: alta, desbloqueo, CRUD, racha y respaldos
├── quotes.js       Frases motivacionales y logros (locales)
├── app.js          Interfaz
├── manifest.json   PWA
├── sw.js           Caché para uso sin conexión
└── icons/          192, 512, maskable y apple-touch-icon
```

## Notas

- Los datos **no se sincronizan** entre dispositivos: cada navegador tiene su bóveda. Para
  moverla, exporta e importa el respaldo.
- Añadir una contraseña nueva a la app no la cambia en el sitio real: esto es un almacén,
  no un gestor con auto-relleno.
- La racha de días se guarda en claro (solo el número), porque se muestra en la pantalla de
  bloqueo antes de introducir la maestra.
