#!/usr/bin/env node
/**
 * immaterial.mjs — generative-art render CLI for the Immaterial Fornebu engine.
 *
 * Commands:
 *   batch     N random generations -> numbered clips (+stills), seeds saved
 *   generate  one clip/still from a given or random hash
 *   similar   variations of one generation (same seed, new framing) or
 *             style-matched new seeds (same color scheme / fidelity / fluidity)
 *   identify  file -> which seed (hash) made it
 *   features  hash -> its derived features (no browser, instant)
 *
 * Every render writes: <name>.mp4/.png + <name>.json sidecar {hash, features,
 * params} + a line in <out>/manifest.jsonl. Hash is also embedded in mp4
 * metadata (comment tag) so identify works on the file alone.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { execFileSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DEFAULT_REPO = '/Users/magic/Creations/entangled-grail/immaterial-fornebu';
const GPU_ARGS = ['--use-angle=metal'];

// ---------- args ----------
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

// ---------- features (pure node, from features-script.js) ----------
function loadFeatures(repo) {
  const src = fs.readFileSync(path.join(repo, 'features-script.js'), 'utf8');
  const fn = new Function('window', src + '\nreturn calculateFeatures;');
  return fn({});
}

function randomHash() {
  let h = '0x';
  for (let i = 0; i < 64; i++) h += Math.floor(Math.random() * 16).toString(16);
  return h;
}

// ---------- server ----------
function serveRepo(repo) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = path.join(repo, urlPath === '/' ? 'index.html' : urlPath);
      if (!file.startsWith(repo) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ---------- render core ----------
async function waitPaint(page, maxMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const buf = await page.screenshot({ timeout: 20000 }).catch(() => null);
    if (buf && buf.length > 100000) return Date.now() - t0;
    await page.waitForTimeout(500);
  }
  throw new Error('scene never painted (90s)');
}

function ffmpeg(argsArr) { execFileSync('ffmpeg', ['-y', '-v', 'error', ...argsArr]); }

async function renderOne(browser, baseUrl, opts) {
  // opts: {hash, width, height, ratio, scale, duration (s, 0 = still only), still, outBase}
  const { hash, width, height, ratio, scale, duration, still, outBase } = opts;
  const url = `${baseUrl}/index.html?hash=${hash}&aspectRatio=${ratio}` + (scale ? `&scale=${scale}` : '');
  const ctxOpts = { viewport: { width, height } };
  if (duration > 0) ctxOpts.recordVideo = { dir: path.dirname(outBase), size: { width, height } };
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const paintMs = await waitPaint(page);
  await page.waitForTimeout(800);
  const files = {};
  if (still || duration === 0) {
    await page.screenshot({ path: outBase + '.png' });
    files.png = outBase + '.png';
  }
  if (duration > 0) {
    await page.waitForTimeout(duration * 1000);
    const vid = page.video();
    await ctx.close();
    const raw = await vid.path();
    const start = paintMs / 1000 + 0.7; // drop pre-paint black lead-in
    ffmpeg(['-ss', String(start), '-i', raw, '-t', String(duration), '-an',
      '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
      '-metadata', `comment=immaterial-fornebu hash=${hash}`,
      '-metadata', `title=immaterial ${hash.slice(0, 10)}`,
      outBase + '.mp4']);
    fs.unlinkSync(raw);
    files.mp4 = outBase + '.mp4';
  } else {
    await ctx.close();
  }
  return { files, paintMs };
}

function writeSidecar(outBase, record) {
  fs.writeFileSync(outBase + '.json', JSON.stringify(record, null, 2));
  const manifest = path.join(path.dirname(outBase), 'manifest.jsonl');
  fs.appendFileSync(manifest, JSON.stringify(record) + '\n');
}

function openFile(f) { try { execFileSync('open', [f]); } catch {} }

// ---------- commands ----------
async function cmdBatch(args) {
  const repo = args.repo || DEFAULT_REPO;
  const count = parseInt(args.count || '10');
  const ratio = parseFloat(args.ratio || '0.5625');
  const width = parseInt(args.width || '1280');
  const height = args.height ? parseInt(args.height) : Math.round(width * ratio);
  const scale = args.scale || null;
  const still = !!args.stills || !!args.images;
  const clipsToo = !(args['images-only']);
  // --durations "10,60,120" cycles per clip; --duration N uniform
  let durations;
  if (args.durations) durations = args.durations.split(',').map(Number);
  else durations = [parseInt(args.duration || '120')];
  if (args['images-only']) durations = [0];
  const outDir = path.resolve(args.out || `./immaterial-batch-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const seqStart = parseInt(args['seq-start'] || '1');
  const prefix = args.prefix || '';
  const openAsReady = !!args['open-as-ready'];
  const calcFeatures = loadFeatures(repo);
  const { server, port } = await serveRepo(repo);
  const browser = await chromium.launch({ args: GPU_ARGS });
  console.log(`batch: ${count} generations -> ${outDir}`);
  for (let i = 0; i < count; i++) {
    const n = seqStart + i;
    const hash = args.hash || randomHash();
    const duration = clipsToo ? durations[i % durations.length] : 0;
    const name = `${prefix}${String(n).padStart(3, '0')}_${hash.slice(2, 10)}`;
    const outBase = path.join(outDir, name);
    const features = calcFeatures({ hash });
    process.stdout.write(`[${n}/${seqStart + count - 1}] ${hash} ${duration}s "${features['color scheme']}" ... `);
    try {
      const { files } = await renderOne(browser, `http://127.0.0.1:${port}`, { hash, width, height, ratio, scale, duration, still, outBase });
      writeSidecar(outBase, { name, hash, features, params: { ratio, width, height, scale, duration }, files, created: new Date().toISOString() });
      console.log('ok');
      console.log(`READY ${files.mp4 || files.png}`);
      if (openAsReady) openFile(files.mp4 || files.png);
    } catch (e) { console.log('FAIL', String(e).slice(0, 100)); }
  }
  await browser.close();
  server.close();
  console.log('BATCH DONE ' + outDir);
}

async function cmdGenerate(args) {
  args.count = '1';
  if (args.hash) args['seq-start'] = args['seq-start'] || '1';
  await cmdBatch(args);
}

function resolveHashFrom(from, cwd) {
  if (/^0x[0-9a-fA-F]{64}$/.test(from)) return from;
  // a file: sidecar json first, then mp4 metadata, then manifest
  const p = path.resolve(cwd || '.', from);
  const side = p.replace(/\.(mp4|png|webm|gif)$/, '.json');
  if (fs.existsSync(side)) return JSON.parse(fs.readFileSync(side, 'utf8')).hash;
  try {
    const meta = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=comment', '-of', 'csv=p=0', p]).toString();
    const m = meta.match(/hash=(0x[0-9a-fA-F]{64})/);
    if (m) return m[1];
  } catch {}
  const manifest = path.join(path.dirname(p), 'manifest.jsonl');
  if (fs.existsSync(manifest)) {
    const base = path.basename(p).replace(/\.[^.]+$/, '');
    for (const line of fs.readFileSync(manifest, 'utf8').trim().split('\n')) {
      const r = JSON.parse(line);
      if (r.name === base) return r.hash;
    }
  }
  throw new Error('cannot resolve hash from: ' + from);
}

async function cmdIdentify(args) {
  const repo = args.repo || DEFAULT_REPO;
  const hash = resolveHashFrom(args._[1]);
  const features = loadFeatures(repo)({ hash });
  console.log(JSON.stringify({ hash, features }, null, 2));
}

async function cmdFeatures(args) {
  const repo = args.repo || DEFAULT_REPO;
  const hash = args._[1];
  console.log(JSON.stringify({ hash, features: loadFeatures(repo)({ hash }) }, null, 2));
}

async function cmdSimilar(args) {
  const repo = args.repo || DEFAULT_REPO;
  const from = args.from || args._[1];
  if (!from) throw new Error('similar needs --from <hash|file>');
  const hash = resolveHashFrom(from);
  const calcFeatures = loadFeatures(repo);
  const ref = calcFeatures({ hash });
  const count = parseInt(args.count || '5');

  if (args.style) {
    // mine new seeds whose style matches the reference
    const matchKeys = (args.match || 'color scheme').split('+'); // e.g. "color scheme+fluidity"
    const found = [];
    let tries = 0;
    while (found.length < count && tries < 500000) {
      tries++;
      const h = randomHash();
      const f = calcFeatures({ hash: h });
      if (matchKeys.every(k => String(f[k.trim()]) === String(ref[k.trim()]))) found.push(h);
    }
    console.log(`style-mined ${found.length} seeds in ${tries} tries (match: ${args.match || 'color scheme'})`);
    for (const [i, h] of found.entries()) {
      const sub = { ...args, hash: h, count: '1', 'seq-start': String(parseInt(args['seq-start'] || '1') + i), prefix: args.prefix || 'style_' };
      await cmdBatch(sub);
    }
    return;
  }

  // same seed, new framing: vary aspect ratio and scale (zoom)
  // defaults tuned for coherent alternate shots of the SAME generation
  const ratios = (args.ratios || '0.5625,0.5625,1,0.42,0.75').split(',').map(Number);
  const scales = (args.scales || '2,3,2,4,1.5').split(',').map(Number);
  for (let i = 0; i < count; i++) {
    const sub = {
      ...args, hash, count: '1',
      ratio: String(ratios[i % ratios.length]),
      scale: String(scales[i % scales.length]),
      'seq-start': String(parseInt(args['seq-start'] || '1') + i),
      prefix: args.prefix || 'var_',
    };
    await cmdBatch(sub);
  }
}

// ---------- main ----------
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const commands = { batch: cmdBatch, generate: cmdGenerate, similar: cmdSimilar, identify: cmdIdentify, features: cmdFeatures };
if (!cmd || !commands[cmd]) {
  console.log(`usage: immaterial.mjs <batch|generate|similar|identify|features> [options]

  batch     --count 10 --duration 120 | --durations 10,60,120  --out DIR
            --ratio 0.5625 --width 1280 [--height H] [--scale S]
            [--stills] [--images-only] [--open-as-ready] [--prefix P] [--seq-start N]
  generate  --hash 0x... (or random) [same options as batch]
  similar   --from <hash|file> --count 5
              default: same seed, varied framing (--ratios a,b,.. --scales a,b,..)
              --style [--match "color scheme+fluidity+fidelity"]: new seeds, same look
  identify  <file.mp4|file.png|hash>   -> seed + features
  features  <hash>                     -> derived features (instant, no browser)`);
  process.exit(1);
}
commands[cmd](args).catch(e => { console.error('ERROR', e.message); process.exit(1); });
