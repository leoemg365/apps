
        /*
         * Copyright (c) 2026 [Leonardo Montiel / Espiral].
         * Todos los derechos reservados.
         */

        document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'F12' || e.keyCode === 123) { e.preventDefault(); return false; }
            if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j')) { e.preventDefault(); return false; }
            if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) { e.preventDefault(); return false; }
        });
        
        const GH = { USER: 'leoemg365', REPO: 'Formatos', FILE: 'db.json' };

        // Copia local del db.json: abre al instante y permite trabajar sin conexión.
        const CACHE_KEY = 'netAdminDbCache';
        const CACHE_VERSION = 1;

        let db = null;
        let isAdmin = false; let adminPass = ''; let ghToken = ''; let fileSha = null; let dbEtag = null;
        let hasUnsavedChanges = false;
        let isSaveCooldown = false; // Esto es para bloquear el spam
        let lastFetchAt = 0;

        let currentRespFilterMain = 'General'; let currentRespFilterSub = 'Todas';
        let currentNewsFilter = 'Todas';
        let currentToolMode = 'rep';
        let currentTab = 'clip';
        let checkTimer = null;

        let dailyExitTime = null; let alarmTriggered = false; const alarmAudio = document.getElementById('alarm-sound');
        let formCallback = null; let confirmCallback = null; let textToCopyFromPreview = ""; let previewTitleActual = "";

        // Vistas pendientes de render: solo se rehace lo que cambió.
        const dirtyViews = new Set(['clip', 'pass', 'resp', 'news', 'tools']);
        let renderScheduled = false;

        // --- Utilidades compartidas ---
        const $id = (id) => document.getElementById(id);

        function normalizar(texto) {
            try {
                return String(texto == null ? '' : texto).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
            } catch (e) {
                return String(texto == null ? '' : texto).toLowerCase();
            }
        }

        function crear(tag, clase, texto) {
            const el = document.createElement(tag);
            if (clase) el.className = clase;
            if (texto != null) el.textContent = texto;
            return el;
        }

        function crearBoton(icono, titulo, datos) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'mini-btn';
            b.textContent = icono;
            if (titulo) b.title = titulo;
            Object.keys(datos || {}).forEach((k) => { b.dataset[k] = datos[k]; });
            return b;
        }

        function debounce(fn, espera) {
            let t = null;
            return function (...args) {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(this, args), espera);
            };
        }

        /** Escapa lo escrito por el usuario y conserva solo <strong> y <br> del formato. */
        function htmlSeguro(texto) {
            const permitidos = [];
            const marcado = String(texto == null ? '' : texto).replace(/<\/?(?:strong|br)\s*\/?>/gi, (tag) => {
                permitidos.push(tag);
                return `\u0000${permitidos.length - 1}\u0000`;
            });
            const escapado = marcado.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return escapado.replace(/\u0000(\d+)\u0000/g, (m, i) => permitidos[Number(i)]);
        }
        
        // REPORTE 5 VARIABLES
        let currentRepMode = 1; let r4Status = 'PRESENTADA'; let finalReportAsterisks = "";
        let r5Nodes = []; let r5Status = 'ACTIVO'; 

        // --- 💬 FRASES DEL ENCABEZADO (rotan solas, una distinta cada día) ---
        const FRASES_SOPORTE = [
            "Cada caso cerrado es un problema menos en la red.",
            "Un buen diagnóstico empieza por escuchar.",
            "La calma es la herramienta más subestimada del soporte.",
            "Documentar hoy es ahorrar tiempo mañana.",
            "No hay falla sin causa: solo pistas por encontrar.",
            "La prisa complica lo que la paciencia resuelve.",
            "Mejor lento y bien, que rápido y dos veces.",
            "Tu registro es la memoria del equipo.",
            "Detrás de cada IP hay una persona esperando.",
            "Precisión, orden y seguimiento: así se cierra un caso.",
            "Si la red no falla, revisa dos veces.",
            "El mejor ticket es el que se documenta bien."
        ];

        function actualizarFraseDelDia() {
            const quoteBox = document.getElementById('daily-quote');
            if (!quoteBox || FRASES_SOPORTE.length === 0) return;

            // Índice determinista por día: cambia a medianoche, no en cada recarga.
            const hoy = new Date();
            const dias = Math.floor(
                (Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - Date.UTC(2026, 0, 1)) / 86400000
            );
            const idx = ((dias % FRASES_SOPORTE.length) + FRASES_SOPORTE.length) % FRASES_SOPORTE.length;

            quoteBox.textContent = "“" + FRASES_SOPORTE[idx] + "”";
            quoteBox.title = "Frase " + (idx + 1) + " de " + FRASES_SOPORTE.length + " · cambia cada día";
        }

        window.onbeforeunload = function() {
            if(hasUnsavedChanges) return "¿Tienes cambios sin guardar. Seguro que quieres salir?";
        };

        window.onload = function() {
            const hourSelects = ['ts-hour','r1-hin','r1-hout','r2-h','r3-hin','r3-hout','r4-hin','r4-hout'];
            hourSelects.forEach(id => {
                const el = document.getElementById(id);
                for(let i=1; i<=12; i++) el.appendChild(new Option(i, i));
                if(id.includes('hin') || id.includes('hout')) el.value = "7";
            });
            document.getElementById('r4-fecha').value = new Date().toLocaleDateString('es-VE');
            document.getElementById('r6-fecha').value = new Date().toLocaleDateString('es-VE');

            const savedName = localStorage.getItem('report_operator');
            if(savedName) document.getElementById('rep-operador').value = savedName;
            loadRepTimes();

            if(localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');

            actualizarFraseDelDia();

            const savedToken = localStorage.getItem('gh_token');
            if(savedToken) document.getElementById('token-admin').value = savedToken;

            checkTimer = setInterval(checkTime, 30000);

            let session = null;
            try { session = JSON.parse(localStorage.getItem('netAdminSession')); } catch (e) { session = null; }
            if(session) {
                isAdmin = session.isAdmin; adminPass = session.adminPass; ghToken = session.ghToken; dailyExitTime = session.exitTime;
                enterApp(session.name, true);

                // --- RESTAURAR ESTADO (PERSISTENCIA) ---
                const lastTab = localStorage.getItem('activeTab');
                const lastTool = localStorage.getItem('activeToolMode');
                const lastRep = localStorage.getItem('activeRepMode');

                if(lastTab && $id(`view-${lastTab}`)) switchTab(lastTab);
                if(lastTool) switchToolMode(lastTool);
                if(lastRep) switchRepMode(parseInt(lastRep));
            }

            // Estado de conexión visible para el usuario.
            window.addEventListener('online', () => { setSyncStatus('online'); fetchData({ silent: true }).catch(() => {}); });
            window.addEventListener('offline', () => setSyncStatus('offline'));

            // Precarga OCR cuando el usuario apunta a la pestaña, no antes.
            const pillOCR = $id('pill-tool-ocr');
            if(pillOCR) pillOCR.addEventListener('pointerenter', () => { loadOCR().catch(() => {}); }, { once: true });

            document.body.addEventListener('click', function unlockAudio() {
                alarmAudio.play().then(() => {
                    alarmAudio.pause();
                    alarmAudio.currentTime = 0;
                }).catch(e => {}); 
                document.body.removeEventListener('click', unlockAudio);
            }, { once: true });

            document.addEventListener('paste', e => {
                if(currentToolMode === 'ocr') {
                    const items = e.clipboardData.items;
                    for (let i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf('image') !== -1) {
                            processOCR(items[i].getAsFile());
                            break;
                        }
                    }
                }
            });

            const dropzone = document.getElementById('ocr-dropzone');
            if(dropzone) {
                dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.style.borderColor = 'var(--primary)'; });
                dropzone.addEventListener('dragleave', e => { e.preventDefault(); dropzone.style.borderColor = 'var(--border)'; });
                dropzone.addEventListener('drop', e => {
                    e.preventDefault(); dropzone.style.borderColor = 'var(--border)';
                    if(e.dataTransfer.files.length > 0) processOCR(e.dataTransfer.files[0]);
                });
            }
        };

        // --- 📱 INSTALACIÓN DE APP A PRUEBA DE FALLOS ---
            try {
                // 1. Service Worker
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('./sw.js').catch(e => console.log('SW:', e));
                }

                // 2. Android PWA
                let deferredPrompt;
                window.addEventListener('beforeinstallprompt', (e) => {
                    e.preventDefault();
                    deferredPrompt = e;
                    const installBtn = document.getElementById('btn-install-app');
                    
                    // IMPORTANTE: Solo actúa si el botón realmente existe en el HTML
                    if(installBtn) {
                        installBtn.classList.remove('hidden');
                        installBtn.addEventListener('click', async () => {
                            installBtn.classList.add('hidden');
                            deferredPrompt.prompt();
                            await deferredPrompt.userChoice;
                            deferredPrompt = null;
                        });
                    }
                });

                // 3. Detector iOS
                const isIos = () => /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
                const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
                if (isIos() && !isStandalone) {
                    setTimeout(() => showToastMsg("Para instalar: Toca 'Compartir' y luego 'Agregar a Inicio' ➕"), 3000);
                }
            } catch (err) {
                console.log("Error silencioso PWA:", err);
            }
            // --------------------------------------------------

        function switchLoginMode(mode) {
            document.getElementById('login-title').innerText = mode === 'admin' ? "Acceso Admin" : "Acceso Soporte";
            document.getElementById('login-mode-support').classList.toggle('hidden', mode === 'admin');
            document.getElementById('login-mode-admin').classList.toggle('hidden', mode !== 'admin');
            if(mode === 'support') document.getElementById('pass-support').focus(); else document.getElementById('pass-admin').focus();
        }

        function setExitTime() {
            let h = parseInt(document.getElementById('ts-hour').value); const m = document.getElementById('ts-min').value; const ampm = document.getElementById('ts-ampm').value;
            if(ampm === 'PM' && h !== 12) h += 12; if(ampm === 'AM' && h === 12) h = 0;
            dailyExitTime = `${String(h).padStart(2,'0')}:${m}`;
        }

        // --- CACHÉ LOCAL DEL db.json ---
        function normalizeDb(entrante) {
            const data = entrante || {};
            if(!data.config) data.config = { supportPass: "45637954", adminPass: "0800" };
            if(!data.electricalNodes) data.electricalNodes = ['Mecocal', 'Ciudad Ojeda'];
            ['clipboard', 'passwords', 'responses', 'news'].forEach(k => { if(!Array.isArray(data[k])) data[k] = []; });
            data.clipboard.forEach(l => { if(!Array.isArray(l.cards)) l.cards = []; });
            data.passwords.forEach(l => { if(!Array.isArray(l.cards)) l.cards = []; });
            data.responses.forEach(l => { if(!Array.isArray(l.cards)) l.cards = []; });
            return data;
        }

        function leerCacheDb() {
            try {
                const crudo = JSON.parse(localStorage.getItem(CACHE_KEY));
                if(!crudo || crudo.v !== CACHE_VERSION || !crudo.json) return null;
                return { db: normalizeDb(JSON.parse(crudo.json)), sha: crudo.sha || null, etag: crudo.etag || null, pendiente: !!crudo.pendiente };
            } catch(e) { return null; }
        }

        function guardarCacheDb(pendiente) {
            if(!db) return;
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    v: CACHE_VERSION,
                    json: JSON.stringify(db),
                    sha: fileSha,
                    etag: dbEtag,
                    pendiente: !!pendiente,
                    at: Date.now()
                }));
            } catch(e) { /* Sin espacio: seguimos solo en memoria. */ }
        }

        // Guarda los cambios locales para que sobrevivan a un cierre o corte de luz.
        const guardarCacheLocal = debounce(() => {
            if(hasUnsavedChanges) guardarCacheDb(true);
        }, 800);

        /** Carga la copia local si existe; no hace red. */
        async function ensureDb() {
            if(db) return db;
            const cache = leerCacheDb();
            if(cache) {
                db = cache.db; fileSha = cache.sha; dbEtag = cache.etag;
                if(cache.pendiente) hasUnsavedChanges = true;
                setSyncStatus(cache.pendiente ? 'offline' : 'cache');
            }
            return db;
        }

        function setSyncStatus(estado) {
            const status = $id('sync-status');
            if(!status) return;
            status.classList.remove('hidden');
            const mapa = {
                online: ['☁️', 'Conectado', 'var(--success)'],
                cache: ['💾', 'Copia local', 'var(--text-sec)'],
                offline: ['⚠️', 'Sin conexión', 'var(--danger)'],
                connecting: ['☁️', 'Conectando...', 'var(--text-sec)'],
                saved: ['☁️', 'Guardado con éxito', 'var(--success)']
            };
            const info = mapa[estado] || mapa.online;
            status.textContent = `${info[0]} ${info[1]}`;
            status.style.color = info[2];
        }

        async function authLogin(mode) {
            const btn = mode === 'admin' ? document.getElementById('btn-login-admin') : document.getElementById('btn-login-support');
            const loader = btn.querySelector('.loader'); const span = btn.querySelector('span:not(.loader)');
            loader.style.display = 'inline-block'; span.innerText = 'Verificando...'; btn.disabled = true;

            try {
                // Primero la copia local (abre al instante), luego la nube.
                await ensureDb();
                if(!db) await fetchData({ render: false });

                if(!db) throw new Error("Sin conexión y sin copia local. Conéctate una vez para poder usar la app offline.");

                if(mode === 'support') {
                    const p = document.getElementById('pass-support').value;
                    if(p !== db.config.supportPass) throw new Error("Contraseña Incorrecta");
                    isAdmin = false; enterApp("Soporte", false);
                } else {
                    const p = document.getElementById('pass-admin').value; const t = document.getElementById('token-admin').value.trim();
                    if(p !== db.config.adminPass) throw new Error("Contraseña Admin Incorrecta");
                    if(!t) throw new Error("Falta Token de GitHub");
                    isAdmin = true; adminPass = p; ghToken = t; localStorage.setItem('gh_token', t);
                    enterApp("Administrador", false);
                }
            } catch(e) {
                const sinRed = (!navigator.onLine || /fetch|network|load failed/i.test(e.message || '')) && !db;
                alert(sinRed ? "Sin conexión y sin copia local. Conéctate una vez para poder usar la app offline." : (e.message || "No se pudo iniciar sesión"));
            }
            finally { loader.style.display = 'none'; span.innerText = mode === 'admin' ? 'Acceso Total' : 'Ingresar'; btn.disabled = false; }
        }

        function enterApp(name, isAuto = false) {
            if(!isAuto) {
                setExitTime();
                localStorage.setItem('netAdminSession', JSON.stringify({ name: name, isAdmin: isAdmin, adminPass: adminPass, ghToken: ghToken, exitTime: dailyExitTime }));
            }
            if(dailyExitTime) {
                let [h, m] = dailyExitTime.split(':'); let ampm = h >= 12 ? 'PM' : 'AM'; let h12 = h % 12 || 12;
                document.getElementById('display-time').innerText = `${h12}:${m} ${ampm}`;
            }

            document.getElementById('login-screen').classList.add('hidden'); document.getElementById('app-container').classList.add('visible');
            document.getElementById('username-display').innerText = name;
            
            if(isAdmin) { 
                document.getElementById('admin-badge').style.display = 'inline-block'; 
                document.getElementById('admin-security-box').classList.remove('hidden'); 
                document.getElementById('r5-admin-tools').classList.remove('hidden');
            }
            if ("Notification" in window) Notification.requestPermission();

            if(db) {
                setSyncStatus(navigator.onLine ? 'online' : 'offline');
                renderAll(); updateR5Dropdown(); updateLivePreview(); checkNotifications();
                if(hasUnsavedChanges) {
                    const btnGuardar = $id('btn-save-batch');
                    if(btnGuardar) btnGuardar.classList.remove('hidden');
                }
                if(isAdmin) { document.getElementById('cfg-sup-pass').value = db.config.supportPass; document.getElementById('cfg-adm-pass').value = db.config.adminPass; }

                // Revalidar con ETag: un 304 no consume cuota. Nunca pisa cambios locales.
                if(Date.now() - lastFetchAt > 60000) {
                    fetchData({ silent: true }).catch(() => setSyncStatus(navigator.onLine ? 'online' : 'offline'));
                }
            } else {
                setSyncStatus('connecting');
                fetchData().catch(() => setSyncStatus('offline'));
            }
        }

        function openSettings() { openModal('settings-modal'); }
        
        function logoutApp() { 
            let msg = hasUnsavedChanges ? "⚠️ TIENES CAMBIOS SIN GUARDAR.\nSi sales ahora, los cambios hechos en esta sesión se perderán para siempre.\n\n¿Seguro que deseas salir y borrar la sesión?" : "¿Seguro que deseas salir y borrar la sesión actual?";
            openConfirm("Cerrar Sesión", msg, false, () => { 
                hasUnsavedChanges = false; localStorage.removeItem('netAdminSession'); location.reload(); 
            }); 
        }

        function markUnsaved(view) {
            hasUnsavedChanges = true;
            const status = $id('sync-status'); if(status) status.classList.add('hidden');
            const btnGuardar = $id('btn-save-batch'); if(btnGuardar) btnGuardar.classList.remove('hidden');

            if(view) dirtyViews.add(view);
            else ['clip', 'pass', 'resp', 'news'].forEach(v => dirtyViews.add(v));

            guardarCacheLocal();
            scheduleRender();
            checkNotifications();
        }

        function markViewDirty(view) { dirtyViews.add(view); scheduleRender(); }

        function scheduleRender() {
            if(renderScheduled) return;
            renderScheduled = true;
            requestAnimationFrame(() => {
                renderScheduled = false;
                renderView(currentTab);
            });
        }

        /** Renderiza una vista solo si está sucia (o si se fuerza). */
        function renderView(view, force = false) {
            if(!db) return;
            if(!force && !dirtyViews.has(view)) return;
            dirtyViews.delete(view);
            if(view === 'clip') renderGeneric('clipboard', 'view-clip');
            else if(view === 'pass') renderGeneric('passwords', 'view-pass');
            else if(view === 'resp') renderResp();
            else if(view === 'news') renderNews();

            aplicarFiltros();
        }

        function renderAll() {
            if(!db) return;
            ['clip', 'pass', 'resp', 'news', 'tools'].forEach(v => dirtyViews.add(v));
            renderView(currentTab, true);
        }

        async function fetchData({ silent = false, render = true, force = false } = {}) {
            const url = `https://api.github.com/repos/${GH.USER}/${GH.REPO}/contents/${GH.FILE}`;
            const headers = {};
            if(isAdmin && ghToken) headers['Authorization'] = `token ${ghToken}`;
            if(dbEtag && !force) headers['If-None-Match'] = dbEtag;

            if(!silent) setSyncStatus('connecting');
            try {
                const res = await fetch(url, { headers, cache: 'no-store' });

                if(res.status === 304) { // Sin cambios: no gasta cuota de la API.
                    lastFetchAt = Date.now();
                    setSyncStatus('online');
                    return db;
                }
                if(!res.ok) throw new Error(`GitHub ${res.status}`);

                const data = await res.json();
                const remoto = normalizeDb(JSON.parse(decodeURIComponent(escape(atob(data.content)))));

                // Si el usuario tiene cambios locales sin guardar, no se pisan.
                if(!db || !hasUnsavedChanges) {
                    db = remoto;
                    fileSha = data.sha;
                    dbEtag = res.headers.get('ETag') || dbEtag;
                    guardarCacheDb();
                    ['clip', 'pass', 'resp', 'news', 'tools'].forEach(v => dirtyViews.add(v));

                    if(render && $id('app-container').classList.contains('visible')) {
                        renderView(currentTab, true);
                        updateR5Dropdown(); updateLivePreview(); checkNotifications();
                        if(isAdmin) { $id('cfg-sup-pass').value = db.config.supportPass; $id('cfg-adm-pass').value = db.config.adminPass; }
                    }
                } else {
                    // Permite guardar encima de la última versión remota.
                    fileSha = data.sha;
                }

                lastFetchAt = Date.now();
                setSyncStatus('online');
                return db;
            } catch(e) {
                if(!silent) setSyncStatus('offline');
                throw e;
            }
        }

        async function pushData() {
            // Si no es Admin o si el temporizador está activo, no hace nada
            if(!isAdmin || isSaveCooldown) return;

            if(!navigator.onLine) {
                alert("Sin conexión: tus cambios están guardados en este dispositivo. Vuelve a intentarlo cuando recuperes internet.");
                return;
            }

            const btn = document.getElementById('btn-save-batch'); 
            const loader = document.getElementById('save-loader'); 
            const txt = document.getElementById('save-text');
            
            loader.style.display = 'inline-block'; 
            txt.innerText = 'Subiendo...'; 
            btn.disabled = true;

            const url = `https://api.github.com/repos/${GH.USER}/${GH.REPO}/contents/${GH.FILE}`;
            // JSON compacto: ~30 % menos bytes que con sangría.
            const contenido = btoa(unescape(encodeURIComponent(JSON.stringify(db))));
            const subir = (sha) => fetch(url, {
                method: 'PUT',
                headers: { 'Authorization': `token ${ghToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: "Update via WebApp (Batch)", content: contenido, sha })
            });
            
            try {
                let res = await subir(fileSha);

                // 409 = alguien guardó antes. Se refresca el sha y se reintenta una vez.
                if(res.status === 409) {
                    const ultimo = await fetch(url, { headers: { 'Authorization': `token ${ghToken}` }, cache: 'no-store' });
                    if(ultimo.ok) {
                        fileSha = (await ultimo.json()).sha;
                        res = await subir(fileSha);
                    }
                }
                if(!res.ok) throw new Error(`GitHub ${res.status}`);

                fileSha = (await res.json()).content.sha;
                hasUnsavedChanges = false;
                guardarCacheDb();

                setSyncStatus('saved');
                setTimeout(() => { if(!hasUnsavedChanges) setSyncStatus('online'); }, 2500);

                // Iniciar el escudo protector de 60 segundos
                iniciarCooldownGuardado();
            } catch(e) { 
                alert(`Error al subir a GitHub (${e.message}). Verifica tu Token.`); 
                loader.style.display = 'none'; 
                txt.innerText = '💾 Guardar en la Nube'; 
                btn.disabled = false;
            }
        }

        // --- NUEVO: MOTOR DE PROTECCIÓN ANTI-SPAM (60 SEG) ---
        function iniciarCooldownGuardado() {
            isSaveCooldown = true;
            const btn = document.getElementById('btn-save-batch');
            const loader = document.getElementById('save-loader');
            const txt = document.getElementById('save-text');
            
            loader.style.display = 'none';
            btn.classList.remove('hidden'); // Lo mantenemos visible para que vea el conteo
            btn.style.background = 'var(--border)'; // Lo pintamos de gris inactivo
            btn.style.color = 'var(--text-sec)';
            btn.style.cursor = 'not-allowed';
            
            let timeLeft = 60; // Los 60 segundos
            txt.innerText = `⏳ Espera ${timeLeft}s`;

            const conteo = setInterval(() => {
                timeLeft--;
                if (timeLeft > 0) {
                    txt.innerText = `⏳ Espera ${timeLeft}s`;
                } else {
                    // Terminó el tiempo
                    clearInterval(conteo);
                    isSaveCooldown = false;
                    
                    // Restauramos los colores originales del botón amarillo
                    btn.style.background = ''; 
                    btn.style.color = '';
                    btn.style.cursor = 'pointer';
                    txt.innerText = '💾 Guardar en la Nube';
                    btn.disabled = false;

                    // Si el usuario no hizo ningún cambio nuevo mientras esperaba, ocultamos el botón
                    if (!hasUnsavedChanges) {
                        btn.classList.add('hidden');
                    }
                }
            }, 1000);
        }

        function checkNotifications() {
            if(!db) return;
            let maxNewsId = db.news.length > 0 ? Math.max(...db.news.map(n => n.id)) : 0;
            let lastSeenNews = parseInt(localStorage.getItem('lastSeenNews')) || 0;
            let bNews = document.getElementById('badge-news'); let unseenNews = db.news.filter(n => n.id > lastSeenNews).length;
            if(unseenNews > 0 && document.getElementById('view-news').classList.contains('hidden')) { bNews.innerText = unseenNews; bNews.style.display = 'inline-block'; } 
            else { bNews.style.display = 'none'; if(!document.getElementById('view-news').classList.contains('hidden')) localStorage.setItem('lastSeenNews', maxNewsId); }

            let maxRespId = 0; let unseenResp = 0; let lastSeenResp = parseInt(localStorage.getItem('lastSeenResp')) || 0;
            db.responses.forEach(list => list.cards.forEach(c => { maxRespId = Math.max(maxRespId, c.id); if(c.id > lastSeenResp) unseenResp++; }));
            let bResp = document.getElementById('badge-resp');
            if(unseenResp > 0 && document.getElementById('view-resp').classList.contains('hidden')) { bResp.innerText = unseenResp; bResp.style.display = 'inline-block'; } 
            else { bResp.style.display = 'none'; if(!document.getElementById('view-resp').classList.contains('hidden')) localStorage.setItem('lastSeenResp', maxRespId); }
        }

        // --- NAVEGACIÓN, BÚSQUEDA GLOBAL Y DELEGACIÓN DE EVENTOS ---
        const VISTAS = ['clip', 'pass', 'resp', 'news', 'tools'];
        const ETIQUETAS_VISTA = { clip: 'Links', pass: 'Contraseñas', resp: 'Respuestas', news: 'Novedades', tools: 'Herramientas' };
        let searchQuery = '';
        const scrollPorVista = {};

        function switchTab(t) {
            if(!VISTAS.includes(t) || !$id(`view-${t}`)) return;
            if(currentTab && scrollPorVista) scrollPorVista[currentTab] = window.scrollY || 0;

            currentTab = t;
            localStorage.setItem('activeTab', t);

            document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === t));
            VISTAS.forEach(v => {
                const view = $id(`view-${v}`);
                if(view) view.classList.toggle('hidden', v !== t);
            });

            renderView(t);
            checkNotifications();
            animarVista($id(`view-${t}`));

            if(Object.prototype.hasOwnProperty.call(scrollPorVista, t)) {
                window.scrollTo(0, scrollPorVista[t]);
            }
        }

        function animarVista(view) {
            if(!view) return;
            if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            view.classList.remove('entrando');
            void view.offsetWidth;
            view.classList.add('entrando');
            Array.from(view.querySelectorAll('.card')).slice(0, 40).forEach((card, i) => {
                card.style.setProperty('--i', Math.min(i, 10));
            });
            clearTimeout(view._animTimer);
            view._animTimer = setTimeout(() => view.classList.remove('entrando'), 700);
        }

        const onSearchInput = debounce(() => {
            const barra = $id('search-bar');
            searchQuery = normalizar(barra ? barra.value : '').trim();

            if(searchQuery) {
                asegurarVistasRenderizadas();
                const conteo = aplicarFiltros();
                if(currentTab !== 'tools' && !conteo[currentTab]) {
                    const destino = VISTAS.find(v => v !== 'tools' && conteo[v] > 0);
                    if(destino) switchTab(destino);
                }
            } else {
                aplicarFiltros();
            }
        }, 150);

        function asegurarVistasRenderizadas() {
            VISTAS.forEach(v => renderView(v));
        }

        function categoriaCoincide(card) {
            if(card.dataset.subcat !== undefined && currentRespFilterSub !== 'Todas' && card.dataset.subcat !== currentRespFilterSub) return false;
            if(card.dataset.cat !== undefined && currentNewsFilter !== 'Todas' && card.dataset.cat !== currentNewsFilter) return false;
            return true;
        }

        /** Única fuente de verdad de qué tarjeta se ve: búsqueda + filtro de categoría. */
        function aplicarFiltros() {
            const q = searchQuery;
            const conteo = { clip: 0, pass: 0, resp: 0, news: 0 };

            VISTAS.forEach(v => {
                const view = $id(`view-${v}`);
                if(!view) return;

                view.querySelectorAll('.card').forEach(card => {
                    if(card.classList.contains('btn-add')) {
                        card.classList.toggle('oculto', !!q);
                        return;
                    }
                    const box = card.closest('.list-box');
                    const tituloCoincide = !!q && !!box && normalizar(box.dataset.buscar || '').includes(q);
                    const coincideBusqueda = !q || tituloCoincide || normalizar(card.dataset.buscar || '').includes(q);
                    const visible = coincideBusqueda && categoriaCoincide(card);
                    card.classList.toggle('oculto', !visible);
                    if(visible && conteo[v] !== undefined) conteo[v]++;
                });

                view.querySelectorAll('.list-box').forEach(box => {
                    if(!box.querySelector('.card')) return;
                    const filtrando = !!q || (v === 'resp' && currentRespFilterSub !== 'Todas') || (v === 'news' && currentNewsFilter !== 'Todas');
                    const visibles = box.querySelectorAll('.card:not(.oculto):not(.btn-add)').length;
                    box.classList.toggle('oculto', filtrando && visibles === 0);
                });

                const tab = document.querySelector(`.tab[data-tab="${v}"]`);
                if(tab) tab.classList.toggle('con-resultados', !!q && conteo[v] > 0);
            });

            const resumen = $id('search-summary');
            if(resumen) {
                if(!q) {
                    resumen.hidden = true;
                    resumen.textContent = '';
                } else {
                    const total = Object.keys(conteo).reduce((suma, k) => suma + conteo[k], 0);
                    const partes = VISTAS.filter(v => conteo[v] > 0).map(v => `${conteo[v]} en ${ETIQUETAS_VISTA[v]}`);
                    resumen.hidden = false;
                    resumen.textContent = total ? `${total} coincidencia${total === 1 ? '' : 's'} · ${partes.join(' · ')}` : 'Sin coincidencias. Prueba con otra palabra.';
                }
            }
            return conteo;
        }

        function limpiarBusqueda() {
            const barra = $id('search-bar');
            if(barra) barra.value = '';
            searchQuery = '';
            aplicarFiltros();
        }

        function vistaDeTipo(type) {
            return type === 'clipboard' ? 'clip' : type === 'passwords' ? 'pass' : type === 'responses' ? 'resp' : 'news';
        }

        /** Un solo listener para todas las tarjetas y botones generados. */
        function alHacerClic(e) {
            const objetivo = e.target.closest ? e.target.closest('[data-action]') : null;
            if(!objetivo || !objetivo.dataset.action || !db) return;

            const d = objetivo.dataset;
            const accion = d.action;

            if(accion === 'reveal') { objetivo.classList.toggle('revelada'); return; }

            const type = d.type;
            const l = parseInt(d.l, 10);
            const c = parseInt(d.c, 10);
            const lista = type && db[type] ? db[type][l] : null;
            const item = lista && lista.cards ? lista.cards[c] : null;

            switch(accion) {
                case 'copy':
                    if(!item) return;
                    if(type === 'passwords') copy(item.pass, { etiqueta: item.label, origen: 'password' });
                    else copy(item.content, { etiqueta: item.label, origen: type === 'responses' ? 'respuesta' : 'link' });
                    break;
                case 'copy-user': if(item) copy(item.user, { etiqueta: item.label, origen: 'password' }); break;
                case 'copy-pass': if(item) copy(item.pass, { etiqueta: item.label, origen: 'password' }); break;
                case 'preview-card':
                    if(!item) return;
                    if(type === 'passwords') openPreview(item.label, `Usuario: ${item.user}\nClave: ${item.pass}`, item.pass);
                    else openPreview(item.label, item.content, item.content);
                    break;
                case 'edit-card':
                    if(type === 'responses') reqAdminEditCardResp(l, c); else reqAdminEditCard(type, l, c);
                    break;
                case 'del-card':
                    reqAdminDel(() => {
                        if(type === 'responses') delCardResp(l, c); else delCard(type, l, c);
                    });
                    break;
                case 'move-card': moveCard(type, l, c, parseInt(d.dir, 10)); break;
                case 'move-list': moveList(type, l, parseInt(d.dir, 10)); break;
                case 'edit-list': reqAdminEditList(type, l); break;
                case 'del-list': reqAdminDel(() => delList(type, l)); break;
                case 'add-card': reqAdminAddCard(type, l); break;
                case 'add-list': crearNuevaLista(type); break;
                case 'preview-news': {
                    const noticia = db.news[parseInt(d.idx, 10)];
                    if(noticia) openPreview(noticia.title, noticia.content, '');
                    break;
                }
                case 'edit-news': reqAdminEditNews(parseInt(d.idx, 10)); break;
                case 'del-news': reqAdminDel(() => delNews(parseInt(d.idx, 10))); break;
                case 'add-news': reqAdminAddNews(); break;
                case 'resp-sub': filterRespSub(d.sc); break;
                case 'news-cat': filterNews(d.sc); break;
                case 'add-resp': reqAdminAddResp(parseInt(d.l, 10)); break;
                case 'remove-r5': removeR5Node(parseInt(d.idx, 10)); break;
            }
        }

        function crearNuevaLista(type) {
            openForm("Nueva Lista", [{ id: 'l_name', p: 'Nombre' }], (v) => {
                db[type].push({ id: Date.now(), title: v[0], cards: [] });
                markUnsaved(vistaDeTipo(type));
            });
        }

        function accionesTarjeta(type, lIdx, cIdx, total) {
            const acciones = crear('div', 'actions');
            if(isAdmin) {
                if(cIdx > 0) acciones.appendChild(crearBoton('⬆️', 'Subir', { action: 'move-card', type, l: lIdx, c: cIdx, dir: -1 }));
                if(cIdx < total - 1) acciones.appendChild(crearBoton('⬇️', 'Bajar', { action: 'move-card', type, l: lIdx, c: cIdx, dir: 1 }));
            }
            acciones.appendChild(crearBoton('👁️', 'Ver completo', { action: 'preview-card', type, l: lIdx, c: cIdx }));
            if(isAdmin) {
                acciones.appendChild(crearBoton('✏️', 'Editar', { action: 'edit-card', type, l: lIdx, c: cIdx }));
                const borrar = crearBoton('🗑️', 'Eliminar', { action: 'del-card', type, l: lIdx, c: cIdx });
                borrar.classList.add('peligro');
                acciones.appendChild(borrar);
            }
            return acciones;
        }

        function tarjetaClip(c, lIdx, cIdx, total) {
            const card = crear('div', 'card');
            card.dataset.action = 'copy';
            card.dataset.type = 'clipboard';
            card.dataset.l = lIdx;
            card.dataset.c = cIdx;
            card.dataset.buscar = normalizar(`${c.label} ${c.content}`);
            card.appendChild(crear('div', 'card-label', c.label));
            card.appendChild(crear('div', 'card-val', c.content));
            card.appendChild(accionesTarjeta('clipboard', lIdx, cIdx, total));
            return card;
        }

        function tarjetaPass(c, lIdx, cIdx, total) {
            const card = crear('div', 'card pass-card');
            card.dataset.buscar = normalizar(`${c.label} ${c.user} ${c.pass}`);
            card.appendChild(crear('div', 'card-label', c.label));

            const filaUser = crear('div', 'cred-row');
            const spanUser = crear('span');
            spanUser.appendChild(document.createTextNode('👤 '));
            const usuario = crear('strong', null, c.user);
            usuario.style.color = 'var(--text-main)';
            spanUser.appendChild(usuario);
            filaUser.appendChild(spanUser);
            filaUser.appendChild(crearBoton('Copiar', 'Copiar usuario', { action: 'copy-user', type: 'passwords', l: lIdx, c: cIdx }));
            card.appendChild(filaUser);

            const filaPass = crear('div', 'cred-row');
            const spanPass = crear('span', 'blur');
            spanPass.dataset.action = 'reveal';
            spanPass.title = 'Toca para mostrar u ocultar';
            spanPass.appendChild(document.createTextNode('🔑 '));
            spanPass.appendChild(crear('strong', null, c.pass));
            filaPass.appendChild(spanPass);
            filaPass.appendChild(crearBoton('Copiar', 'Copiar contraseña', { action: 'copy-pass', type: 'passwords', l: lIdx, c: cIdx }));
            card.appendChild(filaPass);

            card.appendChild(accionesTarjeta('passwords', lIdx, cIdx, total));
            return card;
        }

        function renderGeneric(type, divId) {
            const div = $id(divId);
            if(!div) return;

            const fragmento = document.createDocumentFragment();

            db[type].forEach((list, lIdx) => {
                const box = crear('div', 'list-box');
                box.dataset.buscar = normalizar(list.title);

                const head = crear('div', 'list-head');
                head.appendChild(crear('span', null, list.title));

                if(isAdmin) {
                    const tools = crear('div', 'list-tools');
                    if(lIdx > 0) tools.appendChild(crearBoton('⬆️', 'Subir lista', { action: 'move-list', type, l: lIdx, dir: -1 }));
                    if(lIdx < db[type].length - 1) tools.appendChild(crearBoton('⬇️', 'Bajar lista', { action: 'move-list', type, l: lIdx, dir: 1 }));
                    tools.appendChild(crearBoton('✏️', 'Editar lista', { action: 'edit-list', type, l: lIdx }));
                    const borrarLista = crearBoton('🗑️', 'Eliminar lista', { action: 'del-list', type, l: lIdx });
                    borrarLista.classList.add('peligro');
                    tools.appendChild(borrarLista);
                    head.appendChild(tools);
                }
                box.appendChild(head);

                const grid = crear('div', 'grid');
                list.cards.forEach((c, cIdx) => {
                    grid.appendChild(type === 'clipboard'
                        ? tarjetaClip(c, lIdx, cIdx, list.cards.length)
                        : tarjetaPass(c, lIdx, cIdx, list.cards.length));
                });

                if(isAdmin) {
                    const agregar = crear('button', 'card btn-add', '+ Tarjeta');
                    agregar.type = 'button';
                    agregar.dataset.action = 'add-card';
                    agregar.dataset.type = type;
                    agregar.dataset.l = lIdx;
                    grid.appendChild(agregar);
                }

                box.appendChild(grid);
                fragmento.appendChild(box);
            });

            if(db[type].length === 0) {
                fragmento.appendChild(crear('div', 'vacio', type === 'clipboard' ? 'No hay listas de links todavía.' : 'No hay listas de contraseñas todavía.'));
            }

            if(isAdmin) {
                const nueva = crear('button', 'btn-large btn-crear-lista', '+ Crear Lista');
                nueva.type = 'button';
                nueva.dataset.action = 'add-list';
                nueva.dataset.type = type;
                fragmento.appendChild(nueva);
            }

            div.replaceChildren(fragmento);
        }

        function tarjetaResp(c, lIdx, cIdx, total) {
            const card = crear('div', `card resp-card color-${c.color || 'neutro'}`);
            card.dataset.action = 'copy';
            card.dataset.type = 'responses';
            card.dataset.l = lIdx;
            card.dataset.c = cIdx;
            card.dataset.subcat = c.subcat || '';
            card.dataset.buscar = normalizar(`${c.label} ${c.subcat || ''} ${c.content}`);

            if(c.subcat && c.subcat !== 'General') card.appendChild(crear('span', 'resp-subcat', `📁 ${c.subcat}`));
            card.appendChild(crear('div', 'card-label', c.label));
            card.appendChild(crear('div', 'card-val', c.content));
            card.appendChild(accionesTarjeta('responses', lIdx, cIdx, total));
            return card;
        }

        function renderResp() {
            const grid = $id('resp-grid');
            if(!grid) return;

            const targetList = db.responses.find(r => r.title === currentRespFilterMain);
            const lIdx = targetList ? db.responses.indexOf(targetList) : -1;
            const subcats = new Set(['Todas']);
            const fragmento = document.createDocumentFragment();

            if(targetList) {
                targetList.cards.forEach((c, cIdx) => {
                    if(c.subcat) subcats.add(c.subcat);
                    fragmento.appendChild(tarjetaResp(c, lIdx, cIdx, targetList.cards.length));
                });
            }

            if(!targetList || targetList.cards.length === 0) {
                fragmento.appendChild(crear('div', 'vacio', targetList ? 'Aún no hay respuestas en esta categoría.' : 'No hay respuestas aquí.'));
            }
            grid.replaceChildren(fragmento);

            const subFilterBox = $id('resp-filters-sub');
            subFilterBox.replaceChildren();
            if(subcats.size > 1) {
                subcats.forEach(sc => {
                    const p = crear('button', 'pill pill-sec' + (sc === currentRespFilterSub ? ' active' : ''), sc);
                    p.type = 'button';
                    p.dataset.action = 'resp-sub';
                    p.dataset.sc = sc;
                    subFilterBox.appendChild(p);
                });
            }

            document.querySelectorAll('#resp-filters-main .pill').forEach(p => p.classList.toggle('active', p.textContent.includes(currentRespFilterMain)));

            const tools = $id('resp-admin-tools');
            tools.replaceChildren();
            if(isAdmin && targetList) {
                const btn = crear('button', 'btn-large', `+ Agregar a ${currentRespFilterMain}`);
                btn.type = 'button';
                btn.dataset.action = 'add-resp';
                btn.dataset.l = lIdx;
                tools.appendChild(btn);
            }
        }

        function actualizarPillsResp() {
            document.querySelectorAll('#resp-filters-sub .pill').forEach(p => p.classList.toggle('active', p.textContent === currentRespFilterSub));
            document.querySelectorAll('#resp-filters-main .pill').forEach(p => p.classList.toggle('active', p.textContent.includes(currentRespFilterMain)));
        }

        function filterRespMain(f) { currentRespFilterMain = f; currentRespFilterSub = 'Todas'; limpiarBusqueda(); renderResp(); aplicarFiltros(); }
        function filterRespSub(f) { currentRespFilterSub = f; actualizarPillsResp(); aplicarFiltros(); }

        function tarjetaNews(n, idx, total) {
            const card = crear('div', 'card news-card');
            card.dataset.cat = n.cat || '';
            card.dataset.buscar = normalizar(`${n.title} ${n.cat || ''} ${n.content} ${n.date || ''}`);

            if(n.cat) card.appendChild(crear('div', 'news-cat', n.cat));
            card.appendChild(crear('div', 'news-date', `📅 ${n.date}`));
            card.appendChild(crear('div', 'news-title', n.title));
            card.appendChild(crear('div', 'card-val', n.content));

            const acciones = crear('div', 'actions');
            if(isAdmin) {
                if(idx > 0) acciones.appendChild(crearBoton('⬆️', 'Subir', { action: 'move-list', type: 'news', l: idx, dir: -1 }));
                if(idx < total - 1) acciones.appendChild(crearBoton('⬇️', 'Bajar', { action: 'move-list', type: 'news', l: idx, dir: 1 }));
            }
            acciones.appendChild(crearBoton('👁️', 'Ver completo', { action: 'preview-news', idx }));
            if(isAdmin) {
                acciones.appendChild(crearBoton('✏️', 'Editar', { action: 'edit-news', idx }));
                const borrar = crearBoton('🗑️', 'Eliminar', { action: 'del-news', idx });
                borrar.classList.add('peligro');
                acciones.appendChild(borrar);
            }
            card.appendChild(acciones);
            return card;
        }

        function renderNews() {
            const grid = $id('news-grid');
            if(!grid) return;

            const cats = new Set(['Todas']);
            const fragmento = document.createDocumentFragment();

            db.news.forEach((n, idx) => {
                if(n.cat) cats.add(n.cat);
                fragmento.appendChild(tarjetaNews(n, idx, db.news.length));
            });

            if(db.news.length === 0) fragmento.appendChild(crear('div', 'vacio', 'No hay comunicados.'));
            grid.replaceChildren(fragmento);

            const subFilterBox = $id('news-filters');
            subFilterBox.replaceChildren();
            if(cats.size > 1) {
                cats.forEach(sc => {
                    const p = crear('button', 'pill pill-sec' + (sc === currentNewsFilter ? ' active' : ''), sc);
                    p.type = 'button';
                    p.dataset.action = 'news-cat';
                    p.dataset.sc = sc;
                    subFilterBox.appendChild(p);
                });
            }

            const tools = $id('news-admin-tools');
            tools.replaceChildren();
            if(isAdmin) {
                const btn = crear('button', 'btn-large', '+ Redactar Comunicado');
                btn.type = 'button';
                btn.dataset.action = 'add-news';
                tools.appendChild(btn);
            }
        }

        function actualizarPillsNews() {
            document.querySelectorAll('#news-filters .pill').forEach(p => p.classList.toggle('active', p.textContent === currentNewsFilter));
        }

        function filterNews(f) { currentNewsFilter = f; actualizarPillsNews(); limpiarBusqueda(); aplicarFiltros(); }

        function moveCard(type, lIdx, cIdx, dir) {
            let arr = db[type][lIdx].cards;
            if (dir === -1 && cIdx > 0) [arr[cIdx-1], arr[cIdx]] = [arr[cIdx], arr[cIdx-1]];
            else if (dir === 1 && cIdx < arr.length - 1) [arr[cIdx+1], arr[cIdx]] = [arr[cIdx], arr[cIdx+1]];
            markUnsaved(vistaDeTipo(type));
        }
        function moveList(type, idx, dir) {
            let arr = db[type];
            if (dir === -1 && idx > 0) [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]];
            else if (dir === 1 && idx < arr.length - 1) [arr[idx+1], arr[idx]] = [arr[idx], arr[idx+1]];
            markUnsaved(vistaDeTipo(type));
        }

        // --- 5. HERRAMIENTAS / OCR / CALC / REPORTE 5 ---
        function switchToolMode(mode) {
            localStorage.setItem('activeToolMode', mode);
            currentToolMode = mode;
            ['rep', 'fmt', 'ocr', 'calc'].forEach(m => {
                document.getElementById(`pill-tool-${m}`).classList.toggle('active', mode === m);
                document.getElementById(`tool-box-${m}`).classList.toggle('hidden', mode !== m);
            });
            if(mode === 'ocr') loadOCR().catch(() => {});
        }

        function calcDivisas() {
            let usd = parseFloat(document.getElementById('calc-usd').value) || 0;
            let tasa = parseFloat(document.getElementById('calc-tasa').value) || 0;
            document.getElementById('calc-bs-res').innerText = (usd * tasa).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2});
            calcProrrateo();
        }

        function calcProrrateo() {
            let plan = parseFloat(document.getElementById('calc-plan').value) || 0;
            let dias = parseInt(document.getElementById('calc-dias').value) || 0;
            let tasa = parseFloat(document.getElementById('calc-tasa').value) || 0;
            let resUsd = (plan / 30) * dias;
            document.getElementById('calc-pro-usd').innerText = resUsd.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2});
            if(tasa > 0) document.getElementById('calc-pro-bs').innerText = `Equivale a: ${(resUsd * tasa).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})} Bs`;
            else document.getElementById('calc-pro-bs').innerText = `Ingresa la Tasa arriba para ver en Bs`;
        }

        let calcVal = "";
        function calcInput(k) {
            const screen = document.getElementById('calc-screen');
            if(k === 'C') calcVal = "";
            else if(k === 'DEL') calcVal = calcVal.slice(0, -1);
            else if(k === '=') {
                try { 
                    calcVal = eval(calcVal).toString(); 
                    if(calcVal.includes('.')) calcVal = parseFloat(calcVal).toFixed(2).replace(/\.?0+$/, "");
                } catch(e) { calcVal = "Error"; }
            }
            else { if(calcVal === "Error") calcVal = ""; calcVal += k; }
            screen.value = calcVal || "0";
        }

        // OCR bajo demanda: solo se descarga cuando de verdad se usa.
        let ocrLoader = null;
        function loadOCR() {
            if(window.Tesseract) return Promise.resolve(window.Tesseract);
            if(ocrLoader) return ocrLoader;
            ocrLoader = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
                script.async = true;
                script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('OCR no disponible'));
                script.onerror = () => { ocrLoader = null; reject(new Error('No se pudo cargar el OCR (sin conexión)')); };
                document.head.appendChild(script);
            });
            return ocrLoader;
        }

        async function processOCR(file) {
            if(!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                const img = document.getElementById('ocr-img-preview');
                const instructions = document.getElementById('ocr-instructions');
                img.src = e.target.result; img.style.display = 'inline-block'; instructions.style.display = 'none';
                const status = document.getElementById('ocr-status'); const bar = document.getElementById('ocr-bar');
                const progress = document.getElementById('ocr-progress'); const resultBox = document.getElementById('ocr-result');
                bar.style.display = 'block'; bar.classList.add('activo'); resultBox.value = ''; status.innerHTML = "⏳ Iniciando motor OCR..."; status.style.color = "var(--primary)";
                try {
                    await loadOCR();
                    const result = await Tesseract.recognize(e.target.result, 'spa', {
                        logger: m => { if(m.status === 'recognizing text') { status.innerHTML = `🔍 Escaneando imagen: ${Math.round(m.progress * 100)}%`; progress.style.width = `${m.progress * 100}%`; } else status.innerHTML = `⏳ Preparando... (${m.status})`; }
                    });
                    resultBox.value = result.data.text; status.innerHTML = "✅ Escaneo completado"; status.style.color = "var(--success)";
                } catch(err) { status.innerHTML = `❌ ${err.message || 'Error al leer la imagen'}`; status.style.color = "var(--danger)"; } 
                finally { setTimeout(() => { bar.style.display = 'none'; bar.classList.remove('activo'); progress.style.width = '0%'; }, 1500); }
            };
            reader.readAsDataURL(file);
        }

        function resetOCR() {
            document.getElementById('ocr-input').value = ''; document.getElementById('ocr-img-preview').src = ''; document.getElementById('ocr-img-preview').style.display = 'none';
            document.getElementById('ocr-instructions').style.display = 'block'; document.getElementById('ocr-result').value = '';
            document.getElementById('ocr-status').innerHTML = ''; document.getElementById('ocr-bar').style.display = 'none'; document.getElementById('ocr-progress').style.width = '0%';
        }
        function copyOCR() { copy(document.getElementById('ocr-result').value, {etiqueta: 'Texto OCR', origen: 'herramienta'}); }
        function sendOCRtoFmt() { document.getElementById('tool-text').value = document.getElementById('ocr-result').value; switchToolMode('fmt'); updateTextTools(); }

        // --- REPORTES ---
        function saveRepTimes() {
            const times = {
                r1: { hin: document.getElementById('r1-hin').value, min: document.getElementById('r1-min').value, ain: document.getElementById('r1-ain').value, hout: document.getElementById('r1-hout').value, mout: document.getElementById('r1-mout').value, aout: document.getElementById('r1-aout').value },
                r2: { h: document.getElementById('r2-h').value, m: document.getElementById('r2-m').value, a: document.getElementById('r2-a').value },
                r3: { hin: document.getElementById('r3-hin').value, min: document.getElementById('r3-min').value, ain: document.getElementById('r3-ain').value, hout: document.getElementById('r3-hout').value, mout: document.getElementById('r3-mout').value, aout: document.getElementById('r3-aout').value }
            }; localStorage.setItem('report_times', JSON.stringify(times));
        }

        function loadRepTimes() {
            const savedStr = localStorage.getItem('report_times');
            if (savedStr) {
                try {
                    const t = JSON.parse(savedStr);
                    if(t.r1) { document.getElementById('r1-hin').value = t.r1.hin; document.getElementById('r1-min').value = t.r1.min; document.getElementById('r1-ain').value = t.r1.ain; document.getElementById('r1-hout').value = t.r1.hout; document.getElementById('r1-mout').value = t.r1.mout; document.getElementById('r1-aout').value = t.r1.aout; }
                    if(t.r2) { document.getElementById('r2-h').value = t.r2.h; document.getElementById('r2-m').value = t.r2.m; document.getElementById('r2-a').value = t.r2.a; }
                    if(t.r3) { document.getElementById('r3-hin').value = t.r3.hin; document.getElementById('r3-min').value = t.r3.min; document.getElementById('r3-ain').value = t.r3.ain; document.getElementById('r3-hout').value = t.r3.hout; document.getElementById('r3-mout').value = t.r3.mout; document.getElementById('r3-aout').value = t.r3.aout; }
                } catch(e) {}
            }
        }

        function switchRepMode(mode) {
            localStorage.setItem('activeRepMode', mode);
            currentRepMode = mode;
            for(let i=1; i<=6; i++) {
                document.getElementById(`pill-r${i}`).classList.remove('active'); document.getElementById(`pill-r${i}`).style.background = ''; document.getElementById(`pill-r${i}`).style.color = '';
                document.getElementById(`rep-mode-${i}`).classList.add('hidden');
            }
            const activePill = document.getElementById(`pill-r${mode}`);
            activePill.classList.add('active'); 
            if(mode === 4) { activePill.style.background = 'var(--danger)'; activePill.style.color = 'white'; }
            if(mode === 5) { activePill.style.background = 'var(--warning)'; activePill.style.color = '#5c4e06'; border: 'none';}
            document.getElementById(`rep-mode-${mode}`).classList.remove('hidden'); updateLivePreview();
        }

        function calcAtendidosR1() { let c = parseInt(document.getElementById('r1-cer').value) || 0; let p = parseInt(document.getElementById('r1-pen').value) || 0; document.getElementById('r1-ate').innerText = c + p; }
        function toggleR1Inst() { document.getElementById('r1-inst').classList.toggle('hidden', !document.getElementById('r1-chk-inst').checked); }
        function toggleR1Otro() { document.getElementById('r1-otro-txt').classList.toggle('hidden', !document.getElementById('r1-chk-otro').checked); }

        function setR4Status(status) {
            r4Status = status;
            document.getElementById('btn-r4-pres').style.background = status === 'PRESENTADA' ? 'var(--danger)' : 'var(--bg-surface)'; document.getElementById('btn-r4-pres').style.color = status === 'PRESENTADA' ? 'white' : 'var(--text-main)';
            document.getElementById('btn-r4-solv').style.background = status === 'SOLVENTADA' ? 'var(--success)' : 'var(--bg-surface)'; document.getElementById('btn-r4-solv').style.color = status === 'SOLVENTADA' ? 'white' : 'var(--text-main)'; document.getElementById('btn-r4-solv').style.borderColor = status === 'SOLVENTADA' ? 'var(--success)' : 'var(--border)';
            document.getElementById('r4-hora-fin-box').classList.toggle('hidden', status === 'PRESENTADA'); updateLivePreview();
        }
        function toggleR4Device() {
            const t = document.getElementById('r4-tipo').value;
            document.querySelectorAll('.r4-is-nap').forEach(el => el.classList.toggle('hidden', t !== 'NAP')); document.querySelectorAll('.r4-is-nodo').forEach(el => el.classList.toggle('hidden', t === 'NAP')); updateLivePreview();
        }

        // LÓGICA REPORTE 5
        function reqAdminEditNodes() {
            if(!isAdmin) return;
            openForm("Nodos de Respaldo", [{id:'n_list', p:'Ej: Mecocal, Ciudad Ojeda', type:'textarea', value: (db.electricalNodes || []).join(', ')}], (v) => {
                db.electricalNodes = v[0].split(',').map(s=>s.trim()).filter(Boolean);
                markUnsaved(); updateR5Dropdown();
            });
        }
        function updateR5Dropdown() {
            const sel = document.getElementById('r5-node-select');
            sel.innerHTML = '<option value="">Seleccione Nodo...</option>';
            if(db && db.electricalNodes) db.electricalNodes.forEach(n => sel.appendChild(new Option(n, n)));
        }
        function autoFillTimeR5() {
            if(document.getElementById('r5-node-select').value !== '') {
                const now = new Date(); let h = now.getHours(); let m = now.getMinutes(); let ampm = h >= 12 ? 'PM' : 'AM';
                h = h % 12 || 12; m = m < 10 ? '0'+m : m;
                document.getElementById('r5-time-input').value = `${h < 10 ? '0'+h : h}:${m} ${ampm}`;
            }
        }
        function addR5Node() {
            const name = document.getElementById('r5-node-select').value;
            const time = document.getElementById('r5-time-input').value;
            if(!name) return alert('Selecciona un nodo');
            r5Nodes.push({name, time});
            document.getElementById('r5-node-select').value = ''; document.getElementById('r5-time-input').value = '';
            renderR5Nodes(); updateLivePreview();
        }
        function renderR5Nodes() {
            const box = document.getElementById('r5-nodes-list');
            const fragmento = document.createDocumentFragment();
            r5Nodes.forEach((n, idx) => {
                const d = crear('div', 'r5-node');
                const texto = r5Status === 'ACTIVO' && n.time ? `${n.name} - ${n.time}` : n.name;
                d.appendChild(crear('span', null, texto));
                const quitar = crearBoton('X', 'Quitar nodo', { action: 'remove-r5', idx });
                quitar.classList.add('peligro');
                d.appendChild(quitar);
                fragmento.appendChild(d);
            });
            box.replaceChildren(fragmento);
        }
        function removeR5Node(idx) { r5Nodes.splice(idx, 1); renderR5Nodes(); updateLivePreview(); }
        function setR5Status(s) {
            r5Status = s;
            document.getElementById('btn-r5-act').style.background = s==='ACTIVO'?'var(--warning)':'var(--bg-surface)';
            document.getElementById('btn-r5-act').style.color = s==='ACTIVO'?'#5c4e06':'var(--text-main)';
            document.getElementById('btn-r5-res').style.background = s==='RESTABLECIDO'?'var(--success)':'var(--bg-surface)';
            document.getElementById('btn-r5-res').style.color = s==='RESTABLECIDO'?'white':'var(--text-main)';
            document.getElementById('r5-time-box').classList.toggle('hidden', s==='RESTABLECIDO');
            renderR5Nodes(); updateLivePreview();
        }


        function renderLivePreview() {
            const op = document.getElementById('rep-operador').value || "[Tu Nombre]";
            let htmlText = ""; let plainText = "";

            if(currentRepMode === 1) {
                const hi = `${document.getElementById('r1-hin').value}:${document.getElementById('r1-min').value} ${document.getElementById('r1-ain').value}`;
                const ho = `${document.getElementById('r1-hout').value}:${document.getElementById('r1-mout').value} ${document.getElementById('r1-aout').value}`;
                const cer = parseInt(document.getElementById('r1-cer').value) || 0; const pen = parseInt(document.getElementById('r1-pen').value) || 0;
                let instHtml = document.getElementById('r1-chk-inst').checked ? `\nInstalaciones: ${document.getElementById('r1-inst').value || 0}` : "";
                let acts = []; document.querySelectorAll('.r1-act:checked').forEach(c => acts.push(c.value));
                if(document.getElementById('r1-chk-otro').checked) acts.push(document.getElementById('r1-otro-txt').value || "Otra");
                let actStr = acts.length > 0 ? acts.join(" / ") : "Ninguna";

                htmlText = `<strong>Entrega de Guardia Soporte Técnico</strong>\nOperador: ${op}\nHora: ${hi} a ${ho}\nAtendidos: ${cer+pen}\nCerrados: ${cer}\nPendientes: ${pen}${instHtml}\nActividad: ${actStr}`;
                plainText = `*Entrega de Guardia Soporte Técnico*\nOperador: ${op}\nHora: ${hi} a ${ho}\nAtendidos: ${cer+pen}\nCerrados: ${cer}\nPendientes: ${pen}${instHtml}\nActividad: ${actStr}`;
            } 
            else if(currentRepMode === 2) {
                const h = `${document.getElementById('r2-h').value}:${document.getElementById('r2-m').value} ${document.getElementById('r2-a').value}`;
                let muns = []; document.querySelectorAll('.r2-mun:checked').forEach(c => muns.push(c.value)); let munStr = muns.length > 0 ? muns.join("-") : "Ninguno";
                const cha = document.getElementById('r2-chats').value || 0; const fac = document.getElementById('r2-fac').value || 0; const cer = document.getElementById('r2-cer').value || 0;
                
                htmlText = `<strong>Entrega de Guardia:</strong> ${op}\n<strong>Hora:</strong> ${h}\n<strong>Administración:</strong> ${munStr}\nNúmero de chats reasignado: ${cha}\nFacturas Fiscales: ${fac}\nCasos Cerrados: ${cer}`;
                plainText = `*Entrega de Guardia:* ${op}\n*Hora:* ${h}\n*Administración:* ${munStr}\nNúmero de chats reasignado: ${cha}\nFacturas Fiscales: ${fac}\nCasos Cerrados: ${cer}`;
            }
            else if(currentRepMode === 3) {
                const hi = `${document.getElementById('r3-hin').value}:${document.getElementById('r3-min').value} ${document.getElementById('r3-ain').value}`;
                const ho = `${document.getElementById('r3-hout').value}:${document.getElementById('r3-mout').value} ${document.getElementById('r3-aout').value}`;
                const ins = document.getElementById('r3-inst').value || 0; const est = document.getElementById('r3-estatus').value;
                
                htmlText = `<strong>Entrega de Guardia</strong>\nActividad: Empresarial\nOperador: ${op}\nHora: ${hi} a ${ho}\nInstalaciones: ${ins}\nInforme de instalaciones: ${est}`;
                plainText = `*Entrega de Guardia*\nActividad: Empresarial\nOperador: ${op}\nHora: ${hi} a ${ho}\nInstalaciones: ${ins}\nInforme de instalaciones: ${est}`;
            }
            else if(currentRepMode === 4) {
                const f = document.getElementById('r4-fecha').value || "--/--/----";
                const hi = `${document.getElementById('r4-hin').value}:${document.getElementById('r4-min').value} ${document.getElementById('r4-ain').value}`;
                const ho = r4Status === 'SOLVENTADA' ? `${document.getElementById('r4-hout').value}:${document.getElementById('r4-mout').value} ${document.getElementById('r4-aout').value}` : "--:--";
                const t = document.getElementById('r4-tipo').value;
                const eqStr = t === 'NAP' ? `NAP: ${document.getElementById('r4-nap-city').value}-${document.getElementById('r4-nap-num').value || "X"}` : `${t}: ${document.getElementById('r4-nodo-nom').value || "X"}`;
                const st = document.getElementById('r4-estatus').value;
                const zo = document.getElementById('r4-zona').value || "No especificada";
                const cl = document.getElementById('r4-clientes').value || 0;

                htmlText = `<strong>EMERGENCIA ${r4Status}</strong>\nDepartamento de Soporte Técnico TECNOVEN SERVICES, C.A.\nFecha: ${f}\nHora: ${hi}\nHora fin: ${ho}\n<strong>${eqStr} ${st}</strong>\nZona: ${zo}\nClientes Afectados: ${cl}`;
                plainText = `*EMERGENCIA ${r4Status}*\nDepartamento de Soporte Técnico TECNOVEN SERVICES, C.A.\nFecha: ${f}\nHora: ${hi}\nHora fin: ${ho}\n*${eqStr} ${st}*\nZona: ${zo}\nClientes Afectados: ${cl}`;
            }
            else if(currentRepMode === 5) {
                if(r5Status === 'ACTIVO') {
                    let listH = r5Nodes.map(n => `${n.name}: ${n.time}`).join('<br>');
                    let listP = r5Nodes.map(n => `${n.name}: ${n.time}`).join('\n');
                    htmlText = `<strong>Nodos trabajando con respaldo eléctrico</strong><br>${listH}`;
                    plainText = `*Nodos trabajando con respaldo eléctrico*\n${listP}`;
                } else {
                    let listH = r5Nodes.map(n => n.name).join('<br>');
                    let listP = r5Nodes.map(n => n.name).join('\n');
                    htmlText = `<strong>Servicio eléctrico restablecido</strong><br>${listH}`;
                    plainText = `*Servicio eléctrico restablecido*\n${listP}`;
                }
            }
            else if(currentRepMode === 6) {
            const rev = document.getElementById('r6-rev').value || "";
            const fecha = document.getElementById('r6-fecha').value;
            const now = new Date();
            let h = now.getHours(); let m = now.getMinutes(); let ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12; m = m < 10 ? '0'+m : m;
            const timeStr = `${h < 10 ? '0'+h : h}:${m}${ampm}`;
            const invA = document.getElementById('r6-inv-a').value;
            const invB = document.getElementById('r6-inv-b').value;
            const can = document.getElementById('r6-can').value;

            htmlText = `Revisado por: ${rev}<br>Fecha de Reporte: ${fecha}<br>Hora de Reporte: ${timeStr}<br>Inversores A: ${invA}<br>Inversores B: ${invB}<br>CANALES: ${can}`;
            plainText = `Revisado por: ${rev}\nFecha de Reporte: ${fecha}\nHora de Reporte: ${timeStr}\nInversores A: ${invA}\nInversores B: ${invB}\nCANALES: ${can}`;
            }

            document.getElementById('live-preview-box').innerHTML = htmlSeguro(htmlText); finalReportAsterisks = plainText; 
        }

        // La vista previa se actualiza como máximo cada 120 ms; el guardado, cada 800 ms.
        const guardarEstadoReporte = debounce(() => {
            saveRepTimes();
            const operador = $id('rep-operador');
            if(operador) localStorage.setItem('report_operator', operador.value);
        }, 800);

        const updateLivePreview = debounce(() => {
            renderLivePreview();
            guardarEstadoReporte();
        }, 120);

        function copyGeneratedReport() { renderLivePreview(); if(finalReportAsterisks) copy(finalReportAsterisks, {etiqueta: 'Reporte generado', origen: 'reporte'}); }

        function updateTextTools() { const text = document.getElementById('tool-text').value; document.getElementById('char-count').innerText = text.length; document.getElementById('word-count').innerText = text.trim() === '' ? 0 : text.trim().split(/\s+/).length; }
        function formatText(type) { const el = document.getElementById('tool-text'); if(type === 'UPPER') el.value = el.value.toUpperCase(); if(type === 'LOWER') el.value = el.value.toLowerCase(); if(type === 'TITLE') el.value = el.value.toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase()); updateTextTools(); }
        function copyToolText() { const val = document.getElementById('tool-text').value; if(val.trim() !== '') copy(val, {etiqueta: 'Texto formateado', origen: 'herramienta'}); }

        // --- 7. MODALES, FORMS Y CRUD LOCAL ---
        function openModal(id) { const m = document.getElementById(id); m.classList.remove('hidden'); m.style.display = 'flex'; setTimeout(() => m.classList.add('show'), 10); }
        function closeModal(id) { const m = document.getElementById(id); m.classList.remove('show'); setTimeout(() => { m.style.display = 'none'; m.classList.add('hidden'); }, 300); }

        function openPreview(title, viewText, copyText) {
            document.getElementById('preview-title').innerText = title; document.getElementById('preview-content').innerText = viewText; textToCopyFromPreview = copyText; previewTitleActual = title;
            document.getElementById('btn-copy-preview').style.display = copyText ? 'block' : 'none'; openModal('preview-modal');
        }
        function copyFromPreview() { if(textToCopyFromPreview) copy(textToCopyFromPreview, {etiqueta: previewTitleActual || 'Vista previa', origen: 'preview'}); closeModal('preview-modal'); }

        function openForm(title, fields, onSubmit) {
            document.getElementById('form-title').innerText = title; const container = document.getElementById('form-inputs'); container.replaceChildren();
            fields.forEach(f => {
                let el;
                if(f.type === 'select') {
                    el = document.createElement('select'); el.className = 'big-input';
                    f.options.forEach(opt => { const o = document.createElement('option'); o.value = opt.v; o.text = opt.l; el.appendChild(o); });
                } else if(f.type === 'datalist') {
                    el = document.createElement('input'); el.type = 'text'; el.className = 'big-input'; el.setAttribute('list', f.id+'-list');
                    let dl = document.createElement('datalist'); dl.id = f.id+'-list';
                    f.options.forEach(opt => { const o = document.createElement('option'); o.value = opt; dl.appendChild(o); });
                    container.appendChild(dl);
                } else {
                    el = document.createElement(f.type === 'textarea' ? 'textarea' : 'input'); el.className = 'big-input';
                    if(f.type === 'textarea') el.rows = 4; else el.type = 'text';
                    if(f.type !== 'textarea') el.onkeydown = (e) => { if(e.key === 'Enter') document.getElementById('form-submit').click(); };
                }
                el.id = f.id; el.placeholder = f.p || ''; if(f.value) el.value = f.value;
                
                let wrapper = document.createElement('div');
                if(f.l) { let lbl = document.createElement('label'); lbl.className = 'form-label'; lbl.innerText = f.l; wrapper.appendChild(lbl); }
                wrapper.appendChild(el); container.appendChild(wrapper);
            });
            formCallback = () => {
                const values = fields.map(f => document.getElementById(f.id).value.trim());
                const faltan = fields.some((f, i) => f.required !== false && !values[i]);
                if(faltan) return alert("Completa los campos principales");
                onSubmit(values); closeModal('form-modal');
            };
            document.getElementById('form-submit').onclick = formCallback; openModal('form-modal');
            setTimeout(() => document.getElementById(fields[0].id).focus(), 100);
        }

        function updateSystemPasswords(type) {
            const newPass = type === 'support' ? document.getElementById('cfg-sup-pass').value.trim() : document.getElementById('cfg-adm-pass').value.trim();
            if(!newPass) return alert("La contraseña no puede estar vacía");
            if(type === 'support') db.config.supportPass = newPass; else db.config.adminPass = newPass;
            markUnsaved(); closeModal('settings-modal'); showToastMsg("Clave actualizada en memoria. Recuerda Guardar.");
        }

        function reqAdminDel(callback) { if(!isAdmin) return; openConfirm("Autorización", "Verifica tu identidad.", true, callback); }
        function openConfirm(title, msg, requirePin, onConfirm) {
            document.getElementById('confirm-title').innerText = title; document.getElementById('confirm-msg').innerText = msg;
            const pinArea = document.getElementById('confirm-pin-area'); const pinInput = document.getElementById('sec-pin');
            if(requirePin) { pinArea.classList.remove('hidden'); pinInput.value = ''; } else pinArea.classList.add('hidden');
            confirmCallback = () => { if(requirePin && pinInput.value !== adminPass) return alert("Contraseña incorrecta"); onConfirm(); closeModal('confirm-modal'); };
            document.getElementById('confirm-btn-ok').onclick = confirmCallback; openModal('confirm-modal');
            if(requirePin) setTimeout(() => pinInput.focus(), 100);
        }

        // CRUD AHORA SOLO LOCAL (Llama a markUnsaved)
        function reqAdminAddCard(type, lIdx) {
            let fields = type==='clipboard' ? [{id:'f_title', p:'Título'}, {id:'f_val', p:'IP/Link', type:'textarea'}] : [{id:'f_title', p:'Equipo'}, {id:'f_user', p:'Usuario'}, {id:'f_pass', p:'Contraseña'}];
            openForm("Nueva Tarjeta", fields, (v) => { if(type==='clipboard') db[type][lIdx].cards.push({id:Date.now(), label:v[0], content:v[1]}); else db[type][lIdx].cards.push({id:Date.now(), label:v[0], user:v[1], pass:v[2]}); markUnsaved(vistaDeTipo(type)); });
        }
        
        function reqAdminAddResp(lIdx) { 
            let existingCats = [...new Set(db.responses[lIdx].cards.map(c => c.subcat).filter(Boolean))];
            openForm("Nueva Respuesta", [
                {id:'r_t', l:'Título', p:'Ej: Saludo'}, 
                {id:'r_sc', l:'Subcategoría (Opcional)', type:'datalist', options: existingCats, p:'Ej: Pagos', required: false},
                {id:'r_col', l:'Color', type:'select', options: [{v:'neutro', l:'⚪ Neutro'}, {v:'info', l:'🔵 Información'}, {v:'exito', l:'🟢 Éxito / Pagos'}, {v:'aviso', l:'🟡 Advertencia'}, {v:'urgente', l:'🔴 Urgente'}]},
                {id:'r_c', l:'Mensaje a copiar', type:'textarea'}
            ], (v)=>{ db.responses[lIdx].cards.push({id:Date.now(), label:v[0], subcat:v[1], color:v[2], content:v[3]}); markUnsaved('resp'); }); 
        }

        function reqAdminAddNews() { 
            let existingCats = [...new Set(db.news.map(n => n.cat).filter(Boolean))];
            openForm("Comunicado", [
                {id:'n_t', l:'Título', p:'Ej: Mantenimiento'}, 
                {id:'n_c', l:'Categoría (Opcional)', type:'datalist', options: existingCats, p:'Ej: Administrativo', required: false},
                {id:'n_msg', l:'Mensaje', type:'textarea'}
            ], (v)=>{ db.news.unshift({id:Date.now(), date: new Date().toLocaleDateString('es-VE'), title:v[0], cat:v[1], content:v[2]}); markUnsaved('news'); }); 
        }

        function reqAdminEditList(type, lIdx) { openForm("Editar Lista", [{id:'l_name', p:'Nombre', value: db[type][lIdx].title}], (v)=>{ db[type][lIdx].title = v[0]; markUnsaved(vistaDeTipo(type)); }); }
        
        function reqAdminEditCard(type, lIdx, cIdx) {
            let item = db[type][lIdx].cards[cIdx];
            let fields = type==='clipboard' ? [{id:'f_title', p:'Título', value: item.label}, {id:'f_val', p:'Contenido', type:'textarea', value: item.content}] : [{id:'f_title', p:'Equipo', value: item.label}, {id:'f_user', p:'Usuario', value: item.user}, {id:'f_pass', p:'Contraseña', value: item.pass}];
            openForm("Editar Tarjeta", fields, (v) => { item.label = v[0]; if(type==='clipboard') item.content = v[1]; else { item.user = v[1]; item.pass = v[2]; } markUnsaved(vistaDeTipo(type)); });
        }
        
        function reqAdminEditCardResp(lIdx, cIdx) { 
            let item = db.responses[lIdx].cards[cIdx]; 
            let existingCats = [...new Set(db.responses[lIdx].cards.map(c => c.subcat).filter(Boolean))];
            openForm("Editar Respuesta", [
                {id:'r_t', l:'Título', value: item.label}, 
                {id:'r_sc', l:'Subcategoría', type:'datalist', options: existingCats, value: item.subcat || '', required: false},
                {id:'r_col', l:'Color', type:'select', value: item.color || 'neutro', options: [{v:'neutro', l:'⚪ Neutro'}, {v:'info', l:'🔵 Información'}, {v:'exito', l:'🟢 Éxito'}, {v:'aviso', l:'🟡 Advertencia'}, {v:'urgente', l:'🔴 Urgente'}]},
                {id:'r_c', l:'Mensaje', type:'textarea', value: item.content}
            ], (v)=>{ item.label = v[0]; item.subcat = v[1]; item.color = v[2]; item.content = v[3]; markUnsaved('resp'); }); 
        }

        function reqAdminEditNews(idx) { 
            let item = db.news[idx]; 
            let existingCats = [...new Set(db.news.map(n => n.cat).filter(Boolean))];
            openForm("Editar Comunicado", [
                {id:'n_t', l:'Título', value: item.title}, 
                {id:'n_c', l:'Categoría', type:'datalist', options: existingCats, value: item.cat || '', required: false},
                {id:'n_msg', l:'Cuerpo', type:'textarea', value: item.content}
            ], (v)=>{ item.title = v[0]; item.cat = v[1]; item.content = v[2]; markUnsaved('news'); }); 
        }

        function delCard(type, l, c) { db[type][l].cards.splice(c,1); markUnsaved(vistaDeTipo(type)); } 
        function delList(type, l) { db[type].splice(l,1); markUnsaved(vistaDeTipo(type)); } 
        function delCardResp(lIdx, cIdx) { db.responses[lIdx].cards.splice(cIdx,1); markUnsaved('resp'); } 
        function delNews(idx) { db.news.splice(idx,1); markUnsaved('news'); }

        // UTILS
        async function copy(x, meta) { 
            showToastMsg("Copiado al portapapeles ✅");
            // Alimenta el panel de copias recientes (recientes.js)
            try { if (typeof registrarCopia === 'function') registrarCopia(x, meta); } catch(e) {}
            try { await navigator.clipboard.writeText(x); } 
            catch { const t=document.createElement('textarea'); t.value=x; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); } 
        }
        let toastTimer = null;
        function showToastMsg(msg) {
            const t = document.getElementById('toast');
            if(!t) return;
            t.innerText = msg;
            t.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
        }
        function toggleTheme() { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode')?'dark':'light'); }
        
        // COMPROBADOR DE HORA Y ALARMA NATIVA
        function checkTime() { 
            if(!dailyExitTime || alarmTriggered) return; 
            const now = new Date(); const [h, m] = dailyExitTime.split(':'); const exit = new Date(); exit.setHours(h, m, 0); 
            
            if((exit - now)/1000/60 <= 60 && (exit - now) > 0) { 
                alarmTriggered = true; 
                if(checkTimer) { clearInterval(checkTimer); checkTimer = null; }
                openModal('alarm-modal'); 
                
                try { alarmAudio.play(); } catch(e) { console.log("Audio bloqueado por el navegador"); }
                
                if ("Notification" in window && Notification.permission === "granted") {
                    new Notification("🚨 FIN DE TURNO (NetAdmin)", {
                        body: "Falta 1 hora para tu salida. ¡Recuerda llenar tu Reporte!",
                        icon: "https://cdn-icons-png.flaticon.com/128/4565/4565968.png",
                        vibrate: [200, 100, 200]
                    });
                }
            } 
        }
        
        function stopAlarm() { closeModal('alarm-modal'); alarmAudio.pause(); alarmAudio.currentTime = 0; }

        // --- 6. CONTADOR FLOTANTE (MEMORIA DE VALOR Y POSICIÓN) ---
        const elContador = document.querySelector('.floating-counter');
        const valor = document.getElementById('valor-contador');

        if(elContador && valor) {
            let cuenta = parseInt(localStorage.getItem('contador-valor'), 10) || 0;
            valor.innerText = cuenta;

            const guardarCuenta = () => {
                valor.innerText = cuenta;
                try { localStorage.setItem('contador-valor', cuenta); } catch(e) {}
            };

            const btnSumar = document.getElementById('btn-sumar');
            const btnRestar = document.getElementById('btn-restar');
            const btnReset = document.getElementById('btn-reset');
            if(btnSumar) btnSumar.onclick = () => { cuenta++; guardarCuenta(); };
            if(btnRestar) btnRestar.onclick = () => { cuenta--; guardarCuenta(); };
            if(btnReset) btnReset.onclick = () => { cuenta = 0; guardarCuenta(); };

            // Posición guardada, siempre dentro de la pantalla.
            const limitar = (x, y) => {
                const ancho = elContador.offsetWidth;
                const alto = elContador.offsetHeight;
                return {
                    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - ancho - 8)),
                    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - alto - 8))
                };
            };
            const aplicarPosicion = (x, y) => {
                const p = limitar(x, y);
                elContador.style.bottom = 'auto';
                elContador.style.right = 'auto';
                elContador.style.left = `${p.x}px`;
                elContador.style.top = `${p.y}px`;
                return p;
            };

            try {
                const guardada = JSON.parse(localStorage.getItem('contador-posicion'));
                if(guardada) {
                    const x = parseFloat(guardada.x);
                    const y = parseFloat(guardada.y);
                    if(!isNaN(x) && !isNaN(y)) aplicarPosicion(x, y);
                }
            } catch(e) {}

            let arrastre = null;
            let rafPendiente = false;

            elContador.addEventListener('pointerdown', (e) => {
                if(e.target.closest('button')) return;
                const rect = elContador.getBoundingClientRect();
                arrastre = { id: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
                elContador.classList.add('arrastrando');
                try { elContador.setPointerCapture(e.pointerId); } catch (err) {}
            });

            elContador.addEventListener('pointermove', (e) => {
                if(!arrastre || e.pointerId !== arrastre.id) return;
                const x = e.clientX - arrastre.dx;
                const y = e.clientY - arrastre.dy;
                if(rafPendiente) return;
                rafPendiente = true;
                requestAnimationFrame(() => {
                    rafPendiente = false;
                    if(arrastre) aplicarPosicion(x, y);
                });
            });

            const terminarArrastre = () => {
                if(!arrastre) return;
                arrastre = null;
                elContador.classList.remove('arrastrando');
                try {
                    localStorage.setItem('contador-posicion', JSON.stringify({ x: elContador.style.left, y: elContador.style.top }));
                } catch(e) {}
            };
            elContador.addEventListener('pointerup', terminarArrastre);
            elContador.addEventListener('pointercancel', terminarArrastre);

            window.addEventListener('resize', () => {
                if(!elContador.style.left) return;
                aplicarPosicion(parseFloat(elContador.style.left), parseFloat(elContador.style.top));
            });
        }

        // --- ATAJOS DE TECLADO ---
        function cerrarModalSuperior() {
            const abiertos = Array.from(document.querySelectorAll('.modal-overlay.show'));
            if(abiertos.length) { closeModal(abiertos[abiertos.length - 1].id); return true; }
            const dialogo = document.querySelector('dialog[open]');
            if(dialogo) { dialogo.close(); return true; }
            return false;
        }

        function copiarPrimerResultado() {
            const vista = $id(`view-${currentTab}`);
            if(!vista) return false;
            const tarjeta = vista.querySelector('.card[data-action="copy"]:not(.oculto)');
            if(!tarjeta) return false;
            tarjeta.click();
            return true;
        }

        document.addEventListener('keydown', (e) => {
            if(e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
            const tag = (e.target.tagName || '').toLowerCase();
            const escribiendo = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

            if(e.key === 'Escape') {
                if(!cerrarModalSuperior() && escribiendo) e.target.blur();
                return;
            }
            if(escribiendo) {
                if(e.key === 'Enter' && e.target.id === 'search-bar') copiarPrimerResultado();
                return;
            }
            if(e.key === '/') {
                e.preventDefault();
                const barra = $id('search-bar');
                if(barra) barra.focus();
                return;
            }
            if(/^[1-5]$/.test(e.key)) {
                const destino = VISTAS[parseInt(e.key, 10) - 1];
                if(destino) switchTab(destino);
            }
        });

        // Un único listener para todas las tarjetas generadas (delegación).
        document.addEventListener('click', alHacerClic);

        
        
        // La instalación PWA ya se maneja en el bloque "INSTALACIÓN DE APP A PRUEBA DE FALLOS"
        // del inicio del archivo (register + beforeinstallprompt + detector iOS).


