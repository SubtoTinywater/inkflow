'use strict';
/* InkFlow Studio: raster drawing + frame animation. Every action the UI performs
   goes through the same functions the MCP bridge calls (see API at the bottom). */
const $ = s => document.querySelector(s);
const S = { w: 1280, h: 720, layers: [], nf: 1, f: 0, li: 0, fps: 12, onion: true, z: 1, ox: 0, oy: 0,
  tool: 'brush', color: '#1b1b1f', size: 8, op: 1, stab: .4, sym: false, solid: false, playing: false, nid: 1 };
const cels = new Map(), undoS = [], redoS = [];
const mk = (w = S.w, h = S.h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const key = (l, f) => l.id + ':' + f;
const cel = (l, f = S.f) => { const k = key(l, f); if (!cels.has(k)) cels.set(k, mk()); return cels.get(k); };
const copy = c => { const n = mk(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(x => x + x).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

/* ---------- document ---------- */
function newDoc(w = 1280, h = 720, fps = 12, frames = 1) {
  cels.clear(); undoS.length = redoS.length = 0;
  Object.assign(S, { w, h, fps, nf: frames, f: 0, li: 0, layers: [], nid: 1 });
  comp.width = tmp.width = w; comp.height = tmp.height = h;
  addLayer('Layer 1'); fit(); ui();
}
function addLayer(name) {
  const l = { id: S.nid++, name: name || 'Layer ' + S.nid, vis: true, op: 1, blend: 'source-over' };
  S.layers.splice(S.layers.length ? S.li + 1 : 0, 0, l);
  S.li = S.layers.indexOf(l); return l;
}
function delLayer() {
  if (S.layers.length < 2) return;
  const [l] = S.layers.splice(S.li, 1);
  for (let f = 0; f < S.nf; f++) cels.delete(key(l, f));
  S.li = clamp(S.li, 0, S.layers.length - 1);
}
function dupLayer() {
  const src = S.layers[S.li], l = { ...src, id: S.nid++, name: src.name + ' copy' };
  for (let f = 0; f < S.nf; f++) if (cels.has(key(src, f))) cels.set(key(l, f), copy(cels.get(key(src, f))));
  S.layers.splice(S.li + 1, 0, l); S.li++;
}
function moveLayer(d) {
  const j = S.li + d; if (j < 0 || j >= S.layers.length) return;
  [S.layers[S.li], S.layers[j]] = [S.layers[j], S.layers[S.li]]; S.li = j;
}
function insertFrame(at, dup) {
  for (const l of S.layers) {
    for (let k = S.nf - 1; k >= at; k--) { const c = cels.get(key(l, k)); if (c) { cels.set(key(l, k + 1), c); cels.delete(key(l, k)); } }
    const src = cels.get(key(l, at - 1)); if (dup && src) cels.set(key(l, at), copy(src));
  }
  S.nf++; S.f = at;
}
function deleteFrame(f) {
  if (S.nf === 1) { S.layers.forEach(l => cels.delete(key(l, 0))); return; }
  for (const l of S.layers) {
    cels.delete(key(l, f));
    for (let k = f; k < S.nf - 1; k++) { const c = cels.get(key(l, k + 1)); if (c) { cels.set(key(l, k), c); cels.delete(key(l, k + 1)); } }
  }
  S.nf--; S.f = clamp(S.f, 0, S.nf - 1);
}

/* ---------- compositing ---------- */
const comp = mk(), tmp = mk();
function flatten(ctx, f, paper) {
  if (paper) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S.w, S.h); }
  for (const l of S.layers) {
    const c = cels.get(key(l, f)); if (!l.vis || !c) continue;
    ctx.globalAlpha = l.op; ctx.globalCompositeOperation = l.blend; ctx.drawImage(c, 0, 0);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
const view = $('#view'), vctx = view.getContext('2d');
let raf = 0;
function render() { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }
function draw() {
  const r = view.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  if (view.width !== r.width * dpr | 0) { view.width = r.width * dpr; view.height = r.height * dpr; }
  vctx.setTransform(1, 0, 0, 1, 0, 0); vctx.clearRect(0, 0, view.width, view.height);
  vctx.setTransform(S.z * dpr, 0, 0, S.z * dpr, S.ox * dpr, S.oy * dpr);
  const cc = comp.getContext('2d'); cc.clearRect(0, 0, S.w, S.h); flatten(cc, S.f, true);
  if (S.onion && !S.playing) {
    for (const [d, a] of [[-1, .28], [1, .14]]) {
      const g = S.f + d; if (g < 0 || g >= S.nf) continue;
      const tc = tmp.getContext('2d'); tc.clearRect(0, 0, S.w, S.h); flatten(tc, g, false);
      cc.globalAlpha = a; cc.drawImage(tmp, 0, 0); cc.globalAlpha = 1;
    }
  }
  vctx.shadowColor = 'rgba(0,0,0,.5)'; vctx.shadowBlur = 24; vctx.fillStyle = '#fff'; vctx.fillRect(0, 0, S.w, S.h); vctx.shadowBlur = 0;
  vctx.imageSmoothingEnabled = S.z < 1; vctx.drawImage(comp, 0, 0);
}
function fit() {
  const r = view.getBoundingClientRect(); S.z = Math.min((r.width - 60) / S.w, (r.height - 60) / S.h);
  S.ox = (r.width - S.w * S.z) / 2; S.oy = (r.height - S.h * S.z) / 2; render();
}
function zoomAt(k, x, y) {
  const nz = clamp(S.z * k, .1, 16); S.ox = x - (x - S.ox) * nz / S.z; S.oy = y - (y - S.oy) * nz / S.z; S.z = nz; render();
}

/* ---------- painting primitives ---------- */
function seg(ctx, a, b, size, color, sym) {
  ctx.strokeStyle = color; ctx.lineCap = ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(.5, size * (.25 + .75 * (b.p ?? 1)));
  for (const m of sym ? [false, true] : [false]) {
    const X = x => m ? S.w - x : x;
    ctx.beginPath(); ctx.moveTo(X(a.x), a.y); ctx.lineTo(X(b.x) + (a.x === b.x && a.y === b.y ? .01 : 0), b.y); ctx.stroke();
  }
}
function shape(ctx, type, a, b, size, color, solid, sym) {
  ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round';
  for (const m of sym ? [false, true] : [false]) {
    const X = x => m ? S.w - x : x;
    ctx.beginPath();
    if (type === 'line') { ctx.moveTo(X(a.x), a.y); ctx.lineTo(X(b.x), b.y); }
    else if (type === 'rect') ctx.rect(Math.min(X(a.x), X(b.x)), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    else ctx.ellipse(X((a.x + b.x) / 2), (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, 7);
    solid && type !== 'line' ? ctx.fill() : ctx.stroke();
  }
}
function composite(target, base, stk, op, erase) {
  const t = target.getContext('2d');
  if (base) { t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1; t.clearRect(0, 0, S.w, S.h); t.drawImage(base, 0, 0); }
  t.globalAlpha = op; t.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  t.drawImage(stk, 0, 0); t.globalAlpha = 1; t.globalCompositeOperation = 'source-over';
}
function flood(maskSrc, target, x, y, hex, tol = 32) {
  const W = S.w, H = S.h; x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
  const d = maskSrc.getContext('2d').getImageData(0, 0, W, H).data;
  const out = target.getContext('2d'), im = out.getImageData(0, 0, W, H), o = im.data, [r, g, b] = rgb(hex);
  const i0 = (y * W + x) * 4, t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
  const m = i => Math.abs(d[i] - t[0]) + Math.abs(d[i + 1] - t[1]) + Math.abs(d[i + 2] - t[2]) + Math.abs(d[i + 3] - t[3]) <= tol * 2;
  const seen = new Uint8Array(W * H), st = [x, y];
  const paint = j => { o[j * 4] = r; o[j * 4 + 1] = g; o[j * 4 + 2] = b; o[j * 4 + 3] = 255; };
  while (st.length) {
    const yy = st.pop(), xx = st.pop();
    if (seen[yy * W + xx] || !m((yy * W + xx) * 4)) continue;
    let a = xx, e = xx;
    while (a > 0 && !seen[yy * W + a - 1] && m((yy * W + a - 1) * 4)) a--;
    while (e < W - 1 && !seen[yy * W + e + 1] && m((yy * W + e + 1) * 4)) e++;
    for (let k = a; k <= e; k++) {
      const j = yy * W + k; seen[j] = 1; paint(j);
      for (const ny of [yy - 1, yy + 1]) if (ny >= 0 && ny < H && !seen[ny * W + k] && m((ny * W + k) * 4)) st.push(k, ny);
    }
  }
  /* grow by 1px so anti-aliased line edges don't leave halos */
  for (let j = 0; j < W * H; j++) if (seen[j]) for (const n of [j - 1, j + 1, j - W, j + W]) if (n >= 0 && n < W * H && !seen[n] && o[n * 4 + 3] < 255) { const q = n * 4; if (d[q + 3] > 0 && d[q] + d[q + 1] + d[q + 2] < 600) paint(n); }
  out.putImageData(im, 0, 0);
}
function flatSnapshot(f) { const c = mk(); flatten(c.getContext('2d'), f, true); return c; }

/* ---------- undo ---------- */
function snap() { const l = S.layers[S.li]; undoS.push({ id: l.id, f: S.f, c: copy(cel(l)) }); if (undoS.length > 40) undoS.shift(); redoS.length = 0; }
function swapHist(from, to) {
  const e = from.pop(); if (!e) return; const l = S.layers.find(x => x.id === e.id); if (!l) return;
  to.push({ id: e.id, f: e.f, c: copy(cel(l, e.f)) });
  const t = cel(l, e.f).getContext('2d'); t.clearRect(0, 0, S.w, S.h); t.drawImage(e.c, 0, 0); render();
}

/* ---------- pointer input ---------- */
let G = null, pan = null, space = false;
const pos = e => { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left - S.ox) / S.z, y: (e.clientY - r.top - S.oy) / S.z, p: e.pointerType === 'pen' ? (e.pressure || .5) : 1 }; };
view.addEventListener('pointerdown', e => {
  view.setPointerCapture(e.pointerId);
  if (e.button === 1 || space || S.tool === 'hand') { pan = { x: e.clientX, y: e.clientY, ox: S.ox, oy: S.oy }; return; }
  const l = S.layers[S.li]; if (!l || !l.vis || S.playing) return;
  const p = pos(e), t = S.tool;
  if (t === 'picker') { const px = comp.getContext('2d').getImageData(clamp(p.x | 0, 0, S.w - 1), clamp(p.y | 0, 0, S.h - 1), 1, 1).data; setColor('#' + [...px.slice(0, 3)].map(v => v.toString(16).padStart(2, '0')).join('')); return; }
  snap();
  if (t === 'fill') { flood(flatSnapshot(S.f), cel(l), p.x, p.y, S.color); render(); return; }
  G = { base: copy(cel(l)), stk: mk(), a: p, last: p, sp: p, l };
});
view.addEventListener('pointermove', e => {
  if (pan) { S.ox = pan.ox + e.clientX - pan.x; S.oy = pan.oy + e.clientY - pan.y; render(); return; }
  if (!G) return;
  const p = pos(e), t = S.tool, sc = G.stk.getContext('2d');
  if (['brush', 'pencil', 'eraser'].includes(t)) {
    const k = 1 - S.stab * .92; G.sp = { x: G.sp.x + (p.x - G.sp.x) * k, y: G.sp.y + (p.y - G.sp.y) * k, p: p.p };
    seg(sc, G.last, G.sp, t === 'pencil' ? S.size * .5 : S.size, t === 'eraser' ? '#000' : S.color, S.sym); G.last = G.sp;
  } else { sc.clearRect(0, 0, S.w, S.h); shape(sc, t, G.a, p, S.size, S.color, S.solid, S.sym); }
  composite(cel(G.l), G.base, G.stk, S.op * (t === 'pencil' ? .85 : 1), t === 'eraser'); render();
});
const up = () => { G = null; pan = null; };
view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
view.addEventListener('wheel', e => { e.preventDefault(); const r = view.getBoundingClientRect(); e.ctrlKey || e.metaKey || !e.shiftKey ? zoomAt(e.deltaY < 0 ? 1.1 : .9, e.clientX - r.left, e.clientY - r.top) : (S.ox -= e.deltaY, render()); }, { passive: false });

/* ---------- UI ---------- */
const TOOLS = [['brush', 'Brush', 'B'], ['pencil', 'Pencil', 'P'], ['eraser', 'Erase', 'E'], ['fill', 'Fill', 'G'], ['line', 'Line', 'L'], ['rect', 'Rect', 'R'], ['ellipse', 'Oval', 'O'], ['picker', 'Pick', 'I'], ['hand', 'Pan', 'H']];
const SW = '#1b1b1f #6b7080 #ffffff #e5484d #ff9f43 #ffd43b #4cc38a #3bb4c1 #5b7cfa #9b6bff #e879b9 #8a5a44 #f5d0b5 #2c5f4a #1f3a8a #fbe9a8'.split(' ');
function setColor(c) { S.color = c; $('#color').value = c; }
function setTool(t) { S.tool = t; document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); view.style.cursor = t === 'hand' ? 'grab' : 'crosshair'; }
function ui() {
  $('#layers').innerHTML = '';
  S.layers.forEach((l, i) => {
    const d = document.createElement('div'); d.className = 'layer' + (i === S.li ? ' sel' : '');
    const eye = document.createElement('button'); eye.textContent = l.vis ? 'Show' : 'Hide'; eye.onclick = e => { e.stopPropagation(); l.vis = !l.vis; ui(); render(); };
    const n = document.createElement('span'); n.textContent = l.name; n.ondblclick = () => { l.name = prompt('Layer name', l.name) || l.name; ui(); };
    d.append(n, eye); d.onclick = () => { S.li = i; ui(); }; $('#layers').append(d);
  });
  const L = S.layers[S.li]; $('#lop').value = L.op * 100; $('#lblend').value = L.blend;
  const fr = $('#frames'); fr.innerHTML = '';
  for (let f = 0; f < S.nf; f++) { const b = document.createElement('button'); b.textContent = f + 1; b.className = f === S.f ? 'on' : ''; b.onclick = () => { S.f = f; ui(); render(); }; fr.append(b); }
  fr.children[S.f]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  $('#fps').value = S.fps; $('#sym').classList.toggle('on', S.sym); $('#shapeFill').classList.toggle('on', S.solid); $('#play').textContent = S.playing ? 'Stop' : 'Play';
}
TOOLS.forEach(([t, name, k]) => { const b = document.createElement('button'); b.textContent = name; b.dataset.t = t; b.title = `${name} (${k})`; b.onclick = () => setTool(t); $('#tools').append(b); });
SW.forEach(c => { const i = document.createElement('i'); i.style.background = c; i.onclick = () => setColor(c); $('#sw').append(i); });
$('#size').oninput = e => { S.size = +e.target.value; $('#sizeV').textContent = S.size; };
$('#op').oninput = e => S.op = e.target.value / 100;
$('#stab').oninput = e => S.stab = e.target.value / 100;
$('#color').oninput = e => S.color = e.target.value;
$('#sym').onclick = () => { S.sym = !S.sym; ui(); }; $('#shapeFill').onclick = () => { S.solid = !S.solid; ui(); };
$('#undo').onclick = () => swapHist(undoS, redoS); $('#redo').onclick = () => swapHist(redoS, undoS);
$('#zin').onclick = () => zoomAt(1.25, view.clientWidth / 2, view.clientHeight / 2); $('#zout').onclick = () => zoomAt(.8, view.clientWidth / 2, view.clientHeight / 2); $('#fit').onclick = fit;
$('#newdoc').onclick = () => { const s = prompt('Canvas size (width x height)', '1280x720'); if (!s) return; const [w, h] = s.split(/[x,]/).map(Number); if (w > 0 && h > 0) newDoc(clamp(w, 16, 4096), clamp(h, 16, 4096), S.fps); };
$('#ladd').onclick = () => { addLayer(); ui(); }; $('#ldup').onclick = () => { dupLayer(); ui(); render(); }; $('#ldel').onclick = () => { delLayer(); ui(); render(); };
$('#lup').onclick = () => { moveLayer(1); ui(); render(); }; $('#ldn').onclick = () => { moveLayer(-1); ui(); render(); };
$('#lop').oninput = e => { S.layers[S.li].op = e.target.value / 100; render(); }; $('#lblend').onchange = e => { S.layers[S.li].blend = e.target.value; render(); };
$('#fadd').onclick = () => { insertFrame(S.f + 1, false); ui(); render(); }; $('#fdup').onclick = () => { insertFrame(S.f + 1, true); ui(); render(); };
$('#fdel').onclick = () => { deleteFrame(S.f); ui(); render(); };
$('#onion').onchange = e => { S.onion = e.target.checked; render(); }; $('#fps').onchange = e => S.fps = clamp(+e.target.value || 12, 1, 60);
$('#play').onclick = () => play(!S.playing);
function play(on) {
  S.playing = on; ui(); if (!on) return render();
  (function step() { if (!S.playing) return; S.f = (S.f + 1) % S.nf; ui(); render(); setTimeout(step, 1000 / S.fps); })();
}
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
$('#png').onclick = () => flatSnapshot(S.f).toBlob(b => download(b, `frame-${S.f + 1}.png`));
$('#webm').onclick = async () => {
  const c = mk(), x = c.getContext('2d'), rec = new MediaRecorder(c.captureStream(S.fps), { mimeType: 'video/webm' }), chunks = [];
  rec.ondataavailable = e => chunks.push(e.data); rec.onstop = () => download(new Blob(chunks, { type: 'video/webm' }), 'animation.webm');
  rec.start(); for (let f = 0; f < S.nf; f++) { x.clearRect(0, 0, S.w, S.h); flatten(x, f, true); await new Promise(r => setTimeout(r, 1000 / S.fps)); } rec.stop();
};
function project() { const o = {}; cels.forEach((c, k) => o[k] = c.toDataURL()); return JSON.stringify({ v: 1, w: S.w, h: S.h, fps: S.fps, nf: S.nf, nid: S.nid, layers: S.layers, cels: o }); }
async function openProject(txt) {
  const p = JSON.parse(txt); newDoc(p.w, p.h, p.fps, p.nf); S.layers = p.layers; S.nid = p.nid; S.li = 0; cels.clear();
  await Promise.all(Object.entries(p.cels).map(([k, u]) => new Promise(r => { const i = new Image(); i.onload = () => { const c = mk(); c.getContext('2d').drawImage(i, 0, 0); cels.set(k, c); r(); }; i.src = u; })));
  ui(); render();
}
$('#save').onclick = () => download(new Blob([project()], { type: 'application/json' }), 'drawing.inkflow');
$('#load').onclick = () => $('#file').click(); $('#file').onchange = async e => { const f = e.target.files[0]; if (f) openProject(await f.text()); };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase(), m = e.ctrlKey || e.metaKey;
  if (k === ' ') { space = true; e.preventDefault(); }
  else if (m && k === 'z') swapHist(e.shiftKey ? redoS : undoS, e.shiftKey ? undoS : redoS);
  else if (m && k === 'y') swapHist(redoS, undoS);
  else if (k === 'enter') play(!S.playing);
  else if (k === ',' || k === 'arrowleft') { S.f = clamp(S.f - 1, 0, S.nf - 1); ui(); render(); }
  else if (k === '.' || k === 'arrowright') { S.f = clamp(S.f + 1, 0, S.nf - 1); ui(); render(); }
  else if (k === '[') { $('#size').value = S.size = Math.max(1, S.size - 2); $('#sizeV').textContent = S.size; }
  else if (k === ']') { $('#size').value = S.size = Math.min(120, S.size + 2); $('#sizeV').textContent = S.size; }
  else { const t = TOOLS.find(t => t[2].toLowerCase() === k); if (t && !m) setTool(t[0]); }
});
addEventListener('keyup', e => { if (e.key === ' ') space = false; });
addEventListener('resize', fit);

/* ---------- API: shared by the MCP bridge ---------- */
const lyr = i => S.layers[i ?? S.li] || (() => { throw new Error(`No layer ${i}. Layers: 0..${S.layers.length - 1}`); })();
const ensureFrame = f => { while (f >= S.nf) insertFrame(S.nf, false); };
const ease = t => t < .5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2;
const API = {
  info: () => ({ width: S.w, height: S.h, fps: S.fps, frames: S.nf, currentFrame: S.f, activeLayer: S.li, layers: S.layers.map((l, i) => ({ index: i, name: l.name, visible: l.vis, opacity: l.op, blend: l.blend })) }),
  new_document: ({ width = 1280, height = 720, fps = 12, frames = 1 } = {}) => { newDoc(clamp(width, 16, 4096), clamp(height, 16, 4096), clamp(fps, 1, 60), clamp(frames, 1, 500)); return API.info(); },
  add_layer: ({ name } = {}) => { const l = addLayer(name); ui(); render(); return { index: S.layers.indexOf(l), name: l.name }; },
  set_layer: ({ index, name, visible, opacity, blend, active }) => { const l = lyr(index); if (name != null) l.name = name; if (visible != null) l.vis = visible; if (opacity != null) l.op = clamp(opacity, 0, 1); if (blend) l.blend = blend; if (active) S.li = S.layers.indexOf(l); ui(); render(); return API.info(); },
  clear_layer: ({ layer, frame } = {}) => { const c = cel(lyr(layer), frame ?? S.f); c.getContext('2d').clearRect(0, 0, S.w, S.h); render(); return 'cleared'; },
  stroke: ({ points, color = '#000000', size = 6, opacity = 1, layer, frame, erase = false, mirror = false }) => {
    if (!points || points.length < 1) throw new Error('points required: [[x,y],...]');
    const f = frame ?? S.f; ensureFrame(f); const c = cel(lyr(layer), f), stk = mk(), sx = stk.getContext('2d');
    const P = points.map(q => ({ x: q[0], y: q[1], p: q[2] ?? 1 })); if (P.length === 1) P.push({ ...P[0] });
    for (let i = 1; i < P.length; i++) seg(sx, P[i - 1], P[i], size, erase ? '#000' : color, mirror);
    composite(c, null, stk, opacity, erase); ui(); render(); return `stroke of ${P.length} points`;
  },
  shape: ({ type, x, y, w, h, x2, y2, color = '#000000', size = 4, fill = false, opacity = 1, layer, frame, mirror = false }) => {
    const f = frame ?? S.f; ensureFrame(f); const c = cel(lyr(layer), f), stk = mk();
    const a = { x, y }, b = type === 'line' ? { x: x2, y: y2 } : { x: x + w, y: y + h };
    shape(stk.getContext('2d'), type, a, b, size, color, fill, mirror); composite(c, null, stk, opacity, false); ui(); render(); return type;
  },
  fill: ({ x, y, color = '#000000', tolerance = 32, layer, frame }) => {
    const f = frame ?? S.f; ensureFrame(f); flood(flatSnapshot(f), cel(lyr(layer), f), x, y, color, tolerance); render(); return 'filled';
  },
  text: ({ text, x, y, size = 32, color = '#000000', font = 'sans-serif', layer, frame }) => {
    const f = frame ?? S.f; ensureFrame(f); const t = cel(lyr(layer), f).getContext('2d');
    t.fillStyle = color; t.font = `${size}px ${font}`; t.textBaseline = 'top'; t.fillText(text, x, y); ui(); render(); return 'text drawn';
  },
  add_frame: ({ duplicate = false, after } = {}) => { insertFrame((after ?? S.f) + 1, duplicate); ui(); render(); return { frames: S.nf, currentFrame: S.f }; },
  goto_frame: ({ index }) => { S.f = clamp(index, 0, S.nf - 1); ui(); render(); return S.f; },
  set_fps: ({ fps }) => { S.fps = clamp(fps, 1, 60); ui(); return S.fps; },
  set_onion: ({ on }) => { S.onion = on; $('#onion').checked = on; render(); return on; },
  tween: ({ layer, from, to, dx = 0, dy = 0, scale = 1, rotate = 0, easing = true }) => {
    if (to <= from) throw new Error('to must be > from'); ensureFrame(to);
    const l = lyr(layer), src = copy(cel(l, from)), cx = S.w / 2, cy = S.h / 2;
    for (let f = from + 1; f <= to; f++) {
      const t0 = (f - from) / (to - from), t = easing ? ease(t0) : t0, c = cel(l, f).getContext('2d');
      c.clearRect(0, 0, S.w, S.h); c.save(); c.translate(cx + dx * t, cy + dy * t); c.rotate(rotate * t * Math.PI / 180);
      const s = 1 + (scale - 1) * t; c.scale(s, s); c.drawImage(src, -cx, -cy); c.restore();
    }
    ui(); render(); return `tweened frames ${from + 1}-${to + 1} (1-based)`;
  },
  play: ({ on = true } = {}) => { play(on); return on; },
  snapshot: ({ frame, max = 768 } = {}) => {
    const f = clamp(frame ?? S.f, 0, S.nf - 1), c = flatSnapshot(f), k = Math.min(1, max / Math.max(S.w, S.h)), o = mk(Math.round(S.w * k), Math.round(S.h * k));
    o.getContext('2d').drawImage(c, 0, 0, o.width, o.height); return { __image: o.toDataURL('image/png').split(',')[1] };
  },
  export_video: () => { $('#webm').click(); return 'video export started (downloads when finished)'; },
  save_project: () => { $('#save').click(); return 'project download started'; },
  batch: async ({ commands }) => { const out = []; for (const c of commands) { if (c.method === 'batch' || !API[c.method]) throw new Error('bad command ' + c.method); out.push(await API[c.method](c.params || {})); } return out.length + ' commands done'; }
};

/* ---------- MCP bridge (WebSocket client; the MCP server hosts it) ---------- */
let ws, bridgeOk = false;
const host = () => localStorage.getItem('inkflow-host') || '127.0.0.1:7077';
function connect() {
  try { ws = new WebSocket('ws://' + host()); } catch { return setTimeout(connect, 3000); }
  ws.onopen = () => { bridgeOk = true; $('#link').classList.add('up'); $('#link span').textContent = 'AI connected'; };
  ws.onclose = () => { bridgeOk = false; $('#link').classList.remove('up'); $('#link span').textContent = 'AI link'; setTimeout(connect, 2500); };
  ws.onmessage = async ev => {
    const { id, method, params } = JSON.parse(ev.data);
    try { if (!API[method]) throw new Error('unknown method ' + method); ws.send(JSON.stringify({ id, result: await API[method](params || {}) })); }
    catch (err) { ws.send(JSON.stringify({ id, error: String(err.message || err) })); }
  };
}
$('#link').onclick = () => { const h = prompt('MCP server address (host:port). Use your computer\'s LAN IP on a phone.', host()); if (h) { localStorage.setItem('inkflow-host', h); ws && ws.close(); } };

newDoc(); setTool('brush'); connect();
