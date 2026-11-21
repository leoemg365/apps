/* Publica la carpeta NetAdmin en GitHub usando la API de Git Data (sin git local). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..');
const localRoot = path.resolve(__dirname);
const API = 'https://api.github.com';

const config = fs.readFileSync(path.join(repoRoot, '.git', 'config'), 'utf8');
const remoto = config.match(/url\s*=\s*https:\/\/([^:]+):([^@]+)@github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?\s*$/m);
if (!remoto) throw new Error('No pude leer el remoto del .git/config');
const [, USUARIO, TOKEN, OWNER, REPO] = remoto;
const BRANCH = (config.match(/\[branch "([^"]+)"\]/) || [, 'main'])[1];

async function gh(ruta, opciones = {}) {
  const res = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': 'NetAdmin-Push',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opciones.headers || {})
    }
  });
  const texto = await res.text();
  let data;
  try { data = JSON.parse(texto); } catch { data = texto; }
  if (!res.ok) {
    const detalle = typeof data === 'string' ? data.slice(0, 300) : data.message;
    throw new Error(`GitHub ${res.status} en ${ruta}: ${detalle}`);
  }
  return data;
}

function shaBlob(buffer) {
  return crypto.createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
}

function listar(dir, base, salida = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === '.git' || entrada.name === 'node_modules') continue;
    const abs = path.join(dir, entrada.name);
    const rel = path.relative(base, abs).split(path.sep).join('/');
    if (entrada.isDirectory()) listar(abs, base, salida);
    else salida.push(rel);
  }
  return salida;
}

(async () => {
  const repo = await gh(`/repos/${OWNER}/${REPO}`);
  const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const headSha = ref.object.sha;
  const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits/${headSha}`);
  const arbol = await gh(`/repos/${OWNER}/${REPO}/git/trees/${commit.tree.sha}?recursive=1`);
  const remotos = new Map(arbol.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));

  const prefijo = path.basename(localRoot) + '/';
  const archivos = listar(localRoot, localRoot);
  const cambios = [];

  for (const rel of archivos) {
    const rutaRepo = prefijo + rel;
    const contenido = fs.readFileSync(path.join(localRoot, rel));
    const sha = shaBlob(contenido);
    if (remotos.get(rutaRepo) !== sha) cambios.push({ rutaRepo, contenido, sha });
  }

  console.log(`Repo: ${OWNER}/${REPO} · rama ${BRANCH} · HEAD ${headSha.slice(0, 7)}`);
  console.log(`Archivos locales: ${archivos.length} · con cambios: ${cambios.length}`);
  for (const c of cambios) console.log(`  ~ ${c.rutaRepo}`);

  if (cambios.length === 0) {
    console.log('Nada que subir: el remoto ya coincide.');
    return;
  }

  const entradas = [];
  for (const c of cambios) {
    const blob = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: c.contenido.toString('base64'), encoding: 'base64' })
    });
    entradas.push({ path: c.rutaRepo, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const nuevoArbol = await gh(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: commit.tree.sha, tree: entradas })
  });

  const titulo = 'NetAdmin: arranque offline, render dirigido y animaciones';
  const cuerpo = [
    '- Carga diferida de OCR y service worker con precaché y estrategias de caché.',
    '- Copia local del db.json con ETag, cambios pendientes persistentes y reintento 409.',
    '- Render por vista, delegación de eventos y DOM seguro (sin innerHTML con datos).',
    '- Búsqueda global indexada con debounce, resumen y salto a la pestaña con resultados.',
    '- Transiciones y animaciones, content-visibility y soporte de prefers-reduced-motion.',
    '- Atajos de teclado, contador con límites de pantalla y corrección de bugs (openForm, PWA duplicada, alarma).'
  ].join('\n');

  const nuevoCommit = await gh(`/repos/${OWNER}/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: `${titulo}\n\n${cuerpo}`,
      tree: nuevoArbol.sha,
      parents: [headSha],
      author: { name: 'leoemg365', email: '230426117+leoemg365@users.noreply.github.com' },
      committer: { name: 'leoemg365', email: '230426117+leoemg365@users.noreply.github.com' }
    })
  });

  await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: nuevoCommit.sha, force: false })
  });

  console.log(`Commit creado: ${nuevoCommit.sha}`);
  console.log(`Push OK -> https://github.com/${OWNER}/${REPO}/commit/${nuevoCommit.sha}`);
})().catch((e) => {
  console.error('FALLÓ:', e.message);
  process.exitCode = 1;
});
