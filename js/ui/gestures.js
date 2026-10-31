// @ts-check
// Gestos sobre el mapa: arrastrar para moverse, pellizcar para hacer zoom, doble toque para acercar y toque
// para elegir provincia. Mueve la cámara de MapView sin animación y la mantiene dentro de límites.

/**
 * @param {import('../map/render.js').MapView} view @param {HTMLElement} el
 * @param {{onTap:(x:number, y:number) => void, enabled?:() => boolean}} o
 * @returns {() => void} quita los gestos
 */
export function enableGestures(view, el, o) {
  /** @type {Map<number, {x:number, y:number}>} */
  const pts = new Map();
  /** @type {{x:number, y:number, cam:{x:number, y:number, s:number}, dist?:number, mx?:number, my?:number}|null} */
  let start = null;
  let moved = false, lastTap = 0, lastTapX = 0, lastTapY = 0;
  const minS = () => view.fitScale() * .85, maxS = () => view.fitScale() * 6;
  const clampCam = (/** @type {{x:number, y:number, s:number}} */ c) => {
    const [x0, y0, x1, y1] = view.bounds, m = 80;
    c.s = Math.max(minS(), Math.min(maxS(), c.s));
    c.x = Math.max(x0 - m, Math.min(x1 + m, c.x)); c.y = Math.max(y0 - m, Math.min(y1 + m, c.y));
    return c;
  };
  const set = (/** @type {{x:number, y:number, s:number}} */ c) => { view.tween = null; view.cam = clampCam(c); view.invalidate(); };
  /** Zoom manteniendo fijo el punto de la pantalla (sx, sy). @param {number} s @param {number} sx @param {number} sy @param {{x:number, y:number, s:number}} base */
  const zoomAt = (s, sx, sy, base) => {
    const f = view.free(), cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    const mx = (sx - cx) / base.s + base.x, my = (sy - cy) / base.s + base.y;
    const ns = Math.max(minS(), Math.min(maxS(), s));
    return {x:mx - (sx - cx) / ns, y:my - (sy - cy) / ns, s:ns};
  };
  const down = (/** @type {PointerEvent} */ e) => {
    if (o.enabled && !o.enabled()) return;
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (pts.size === 1) { start = {x:e.clientX, y:e.clientY, cam:{...view.cam}}; moved = false; }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      start = {x:(a.x + b.x) / 2, y:(a.y + b.y) / 2, cam:{...view.cam}, dist:Math.hypot(a.x - b.x, a.y - b.y)};
      moved = true;
    }
  };
  const move = (/** @type {PointerEvent} */ e) => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (pts.size === 1) {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 7) return;
      moved = true;
      set({x:start.cam.x - dx / start.cam.s, y:start.cam.y - dy / start.cam.s, s:start.cam.s});
    } else if (pts.size === 2 && start.dist) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const z = zoomAt(start.cam.s * d / start.dist, start.x, start.y, start.cam);
      set({x:z.x - (mx - start.x) / z.s, y:z.y - (my - start.y) / z.s, s:z.s});
    }
  };
  const up = (/** @type {PointerEvent} */ e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 1 && start) { const [a] = [...pts.values()]; start = {x:a.x, y:a.y, cam:{...view.cam}}; return; }
    if (pts.size) return;
    if (!moved && start) {
      const now = performance.now();
      if (now - lastTap < 280 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 30) {
        view.moveTo(zoomAt(view.cam.s * 1.8, e.clientX, e.clientY, view.cam), 260); lastTap = 0;
      } else { lastTap = now; lastTapX = e.clientX; lastTapY = e.clientY; o.onTap(e.clientX, e.clientY); }
    }
    start = null;
  };
  const wheel = (/** @type {WheelEvent} */ e) => { e.preventDefault(); set(zoomAt(view.cam.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY, view.cam)); };
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, {passive:false});
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('wheel', wheel);
  };
}
