// Sunset shipping harbor banner. scene(t) returns the SVG for time t (seconds) in a
// seamless loop of LOOP seconds. Rendered to GIF/PNG by scripts/banner/render.mjs.
export const W = 1200, H = 360, LOOP = 12;

const HZ = 222;                       // horizon
const SUN = { x: 1122, y: 214, r: 34 };
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const seg = (t, a, b) => ease(clamp((t - a) / (b - a)));
const f1 = (v) => (Math.round(v * 10) / 10).toString();

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// muted industrial container colours
const CC = ["#8e4436", "#2c3f66", "#b8663a", "#5d7a66", "#6f7686", "#6a2f38", "#3e5a7a", "#9a7a4a"];

// ------------------------------------------------------------------ sky
function sky(t) {
  const r = rng(11);
  const drift = (k) => f1(Math.sin(TAU * (t / LOOP) + k) * 5);
  const cloud = (x, y, w, h, k, lit) => {
    let g = `<g transform="translate(${drift(k)} 0)" filter="url(#soft)">`;
    const n = 5 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const cx = x + (i / (n - 1) - 0.5) * w, ry = h * (0.55 + r() * 0.5), rx = w / n * (0.9 + r() * 0.8);
      g += `<ellipse cx="${f1(cx)}" cy="${f1(y - ry * 0.3)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${lit[0]}"/>`;
    }
    g += `<ellipse cx="${x}" cy="${f1(y + h * 0.15)}" rx="${f1(w * 0.55)}" ry="${f1(h * 0.35)}" fill="${lit[1]}" opacity=".85"/>`;
    return g + "</g>";
  };
  const glow = 0.9 + 0.1 * Math.sin(TAU * t / 6);
  return `
<rect width="${W}" height="${HZ + 2}" fill="url(#sky)"/>
<rect width="${W}" height="${HZ + 2}" fill="url(#sunwash)" opacity="${f1(glow)}"/>
${cloud(250, 60, 260, 16, 0.3, ["#4a3a6e", "#c27a86"])}
${cloud(560, 40, 220, 12, 1.4, ["#43386a", "#b06e86"])}
${cloud(820, 92, 300, 18, 2.2, ["#5b4174", "#e39a7f"])}
${cloud(1040, 150, 240, 10, 3.1, ["#7a4e78", "#f3b07f"])}
${cloud(420, 132, 200, 9, 4.2, ["#5e4476", "#d9907e"])}
${cloud(120, 172, 180, 8, 5.0, ["#6a4876", "#e09a80"])}
<circle cx="${SUN.x}" cy="${SUN.y}" r="${f1(110 * glow)}" fill="url(#sunglow)"/>
<circle cx="${SUN.x}" cy="${SUN.y}" r="${SUN.r}" fill="url(#sun)"/>
<path d="M300 ${HZ} q60 -14 120 -6 t130 -4 t120 4 t110 6 V${HZ} Z" fill="#8a5a7e" opacity=".45"/>`;
}

// ------------------------------------------------------------------ sea
function sea(t) {
  const r = rng(5);
  let g = `<rect y="${HZ}" width="${W}" height="${H - HZ}" fill="url(#sea)"/>
<path d="M${SUN.x - 30} ${HZ} L${SUN.x + 30} ${HZ} L${SUN.x + 240} ${H} L${SUN.x - 260} ${H} Z" fill="url(#column)"/>`;
  // wave strokes, drifting with a wrap so the loop is seamless
  for (let row = 0; row < 26; row++) {
    const k = row / 25, y = HZ + 3 + Math.pow(k, 1.6) * (H - HZ - 6);
    const period = 60 + k * 140, len = 6 + k * 34, shift = ((t / LOOP) * period) % period;
    const op = 0.08 + 0.18 * k;
    let d = "";
    for (let x = -period + ((row * 37) % period) + shift; x < W; x += period) d += `M${f1(x)} ${f1(y)}h${f1(len)}`;
    g += `<path d="${d}" stroke="#c9b4d8" stroke-opacity="${f1(op * 10) / 10}" stroke-width="${f1(0.6 + k * 1.2)}"/>`;
  }
  // sun glints in the reflection column
  for (let i = 0; i < 70; i++) {
    const k = r(), y = HZ + 2 + Math.pow(k, 1.4) * (H - HZ - 4);
    const half = 26 + (y - HZ) * 1.6;
    const x = SUN.x + (r() - 0.5) * 2 * half;
    const ph = r() * TAU, per = [2, 3, 4, 6][Math.floor(r() * 4)];
    const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(TAU * t / per + ph));
    g += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(4 + k * 16)}" height="${f1(0.8 + k * 1.4)}" fill="#ffe2a8" opacity="${f1(a * (1 - k * 0.5) * 10) / 10}"/>`;
  }
  return g;
}

// ------------------------------------------------------------------ ships
// one container ship, bow to the right, waterline at (x,y), length 500*s
function ship(x, y, s, opts = {}) {
  const L = 500 * s, h = 50 * s, x0 = x - L / 2, deck = y - h;
  const r = rng(opts.seed || 3);
  let g = "";
  // containers
  const cw = 26 * s, ch = 13 * s, start = x0 + 92 * s, end = x0 + L - 34 * s;
  if (s > 0.12) {
    for (let cx = start, i = 0; cx + cw <= end; cx += cw + 1.2 * s, i++) {
      if (opts.hatch && Math.abs(cx + cw / 2 - opts.hatch) < cw * 0.6) continue;
      const rows = (opts.full ? 3 : 2) + Math.floor(r() * 3);
      for (let k = 0; k < rows; k++) {
        const col = CC[Math.floor(r() * CC.length)];
        g += `<rect x="${f1(cx)}" y="${f1(deck - (k + 1) * ch)}" width="${f1(cw)}" height="${f1(ch - 0.6 * s)}" fill="${col}"/>`;
        if (s > 0.3) g += `<rect x="${f1(cx)}" y="${f1(deck - (k + 1) * ch)}" width="${f1(cw)}" height="${f1(1.4 * s)}" fill="#ffd9a6" opacity=".35"/>`;
      }
    }
  } else {
    g += `<rect x="${f1(start)}" y="${f1(deck - 3 * ch)}" width="${f1(end - start)}" height="${f1(3 * ch)}" fill="#5a4a63"/>`;
  }
  // bridge, funnel, mast
  const bx = x0 + 22 * s;
  g += `<rect x="${f1(x0 + 6 * s)}" y="${f1(deck - 62 * s)}" width="${f1(12 * s)}" height="${f1(62 * s)}" fill="#3a3550"/>`;
  g += `<rect x="${f1(x0 + 6 * s)}" y="${f1(deck - 56 * s)}" width="${f1(12 * s)}" height="${f1(4 * s)}" fill="#b8663a"/>`;
  g += `<rect x="${f1(bx)}" y="${f1(deck - 72 * s)}" width="${f1(50 * s)}" height="${f1(72 * s)}" fill="#cbbcc8"/><rect x="${f1(bx)}" y="${f1(deck - 72 * s)}" width="${f1(18 * s)}" height="${f1(72 * s)}" fill="#a998ad"/>`;
  g += `<rect x="${f1(bx - 8 * s)}" y="${f1(deck - 74 * s)}" width="${f1(66 * s)}" height="${f1(7 * s)}" fill="#b9aabb"/>`;
  g += `<rect x="${f1(bx + 49 * s)}" y="${f1(deck - 72 * s)}" width="${f1(1.5 * s)}" height="${f1(72 * s)}" fill="#ffcf96" opacity=".6"/>`;
  if (s > 0.3) {
    let win = "";
    for (let wy = deck - 66 * s; wy < deck - 6 * s; wy += 9 * s)
      for (let wx = bx + 5 * s; wx < bx + 46 * s; wx += 8 * s)
        if (r() < 0.55) win += `M${f1(wx)} ${f1(wy)}h${f1(4 * s)}v${f1(4 * s)}h${f1(-4 * s)}z`;
    g += `<path d="${win}" fill="#ffc777"/>`;
    g += `<path d="M${f1(bx + 4 * s)} ${f1(deck - 71 * s)}h${f1(42 * s)}v${f1(3 * s)}h${f1(-42 * s)}z" fill="#3b4b6e"/>`;
  }
  g += `<rect x="${f1(bx + 24 * s)}" y="${f1(deck - 92 * s)}" width="${f1(1.6 * s)}" height="${f1(20 * s)}" fill="#3a3550"/>`;
  // hull
  g += `<path d="M${f1(x0)} ${f1(deck)} H${f1(x0 + L - 22 * s)} L${f1(x0 + L)} ${f1(deck + 4 * s)} Q${f1(x0 + L + 6 * s)} ${f1(deck + 22 * s)} ${f1(x0 + L - 12 * s)} ${f1(y)} H${f1(x0 + 14 * s)} L${f1(x0)} ${f1(deck + 30 * s)} Z" fill="#26304f"/>`;
  g += `<path d="M${f1(x0 + 6 * s)} ${f1(y - 11 * s)} H${f1(x0 + L - 4 * s)} L${f1(x0 + L - 12 * s)} ${f1(y)} H${f1(x0 + 14 * s)} Z" fill="#7a2f33"/>`;
  g += `<path d="M${f1(x0)} ${f1(deck)} H${f1(x0 + L - 22 * s)}" stroke="#ffcf96" stroke-opacity=".45" stroke-width="${f1(Math.max(0.6, 1.4 * s))}"/>`;
  if (opts.name && s > 0.5) g += `<text x="${f1(x0 + L - 70 * s)}" y="${f1(deck + 16 * s)}" font-size="${f1(8 * s)}" letter-spacing="1" fill="#e8dfe8" opacity=".7" text-anchor="end">${opts.name}</text>`;
  return { g, deck, bridgeTop: deck - 92 * s, x0, L };
}

function navLights(x, y, s, t, ph = 0) {
  const L = 500 * s, x0 = x - L / 2, deck = y - 50 * s;
  const b = 0.35 + 0.65 * Math.max(0, Math.sin(TAU * t / 2 + ph));
  const rr = Math.max(0.8, 2.2 * s);
  return `<circle cx="${f1(x0 + 47 * s)}" cy="${f1(deck - 93 * s)}" r="${f1(rr)}" fill="#ffffff" opacity="${f1(b)}"/>
<circle cx="${f1(x0 + L - 8 * s)}" cy="${f1(deck - 4 * s)}" r="${f1(rr)}" fill="#7dffa8" opacity="${f1(0.4 + 0.6 * b)}"/>
<circle cx="${f1(x0 + 4 * s)}" cy="${f1(deck - 4 * s)}" r="${f1(rr)}" fill="#ff5a5a" opacity="${f1(0.4 + 0.6 * (1 - b))}"/>`;
}

function wake(x, y, s, t) {
  const L = 500 * s, x0 = x - L / 2;
  let g = "";
  for (let i = 0; i < 3; i++) {
    const a = 0.45 - i * 0.12 + 0.08 * Math.sin(TAU * t / 3 + i);
    const len = (160 + i * 60) * s;
    g += `<path d="M${f1(x0 + 10 * s)} ${f1(y - 1)} q${f1(-len / 2)} ${f1((2 + i * 3) * s)} ${f1(-len)} ${f1((4 + i * 6) * s)}" stroke="#ffe7c2" stroke-opacity="${f1(a * 10) / 10}" stroke-width="${f1(Math.max(0.6, (2.2 - i * 0.5) * s))}" fill="none"/>`;
  }
  g += `<path d="M${f1(x0 + L - 4 * s)} ${f1(y - 1)} l${f1(-30 * s)} ${f1(4 * s)}" stroke="#ffe7c2" stroke-opacity=".5" stroke-width="${f1(Math.max(0.6, 1.6 * s))}"/>`;
  return g;
}

// ships sailing to the sun: ship i sits at path position u = i + t/LOOP, and every loop
// each ship moves exactly to the next ship's position, so the loop has no visible reset.
const PATH = [
  { x: 560, y: 306, s: 0.6 },    // u=-1 hidden behind the docked ship
  { x: 770, y: 302, s: 0.5 },    // u=0  slipping out from behind it
  { x: 1000, y: 281, s: 0.3 },   // u=1  sailing
  { x: 1092, y: 253, s: 0.17 },  // u=2  far
  { x: 1136, y: 237, s: 0.1 },   // u=3  near the horizon
  { x: 1158, y: 229, s: 0.05 },  // u=4  gone into the glare
  { x: 1168, y: 225, s: 0.02 },
];
function cr(p0, p1, p2, p3, k) {
  const k2 = k * k, k3 = k2 * k;
  return 0.5 * (2 * p1 + (-p0 + p2) * k + (2 * p0 - 5 * p1 + 4 * p2 - p3) * k2 + (-p0 + 3 * p1 - 3 * p2 + p3) * k3);
}
function along(u) {
  const i = Math.floor(u) + 1, k = u - Math.floor(u);
  const P = (j) => PATH[clamp(j, 0, PATH.length - 1)];
  const v = {};
  for (const key of ["x", "y", "s"]) v[key] = cr(P(i - 1)[key], P(i)[key], P(i + 1)[key], P(i + 2)[key], k);
  return v;
}
function convoy(t) {
  let g = "", defs = "";
  for (let i = 3; i >= -1; i--) {
    const u = i + t / LOOP;
    if (u < -0.6 || u > 4.2) continue;
    const { x, y, s } = along(u);
    const haze = 0.1 + clamp((0.4 - s) / 0.45, 0, 0.42);
    const fade = clamp((4.2 - u) / 0.8) * clamp((u + 0.6) / 0.5);
    const id = `hz${i + 1}`;
    defs += `<filter id="${id}" x="-5%" y="-30%" width="110%" height="160%"><feFlood flood-color="#f4b48a" flood-opacity="${f1(haze * 10) / 10}"/><feComposite in2="SourceAlpha" operator="in"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode/></feMerge></filter>`;
    const sh = ship(x, y, s, { seed: 40 + ((i % 4) + 4) % 4 });
    g += `<g opacity="${f1(fade * 100) / 100}">${wake(x, y, s, t)}<g filter="url(#${id})">${sh.g}</g>${navLights(x, y, s, t, i)}</g>`;
  }
  return { g, defs };
}

// ------------------------------------------------------------------ harbor
const QUAY = 292;
function yard(t) {
  const r = rng(21);
  let g = "";
  // back row (hazier, smaller)
  for (let x = 6; x < 300; x += 25) {
    const rows = 2 + Math.floor(r() * 4);
    for (let k = 0; k < rows; k++) g += `<rect x="${x}" y="${QUAY - 12 - (k + 1) * 11}" width="23" height="10.4" fill="${CC[Math.floor(r() * CC.length)]}"/>`;
  }
  g += `<rect x="0" y="${QUAY - 90}" width="300" height="80" fill="#c98a8a" opacity=".22"/>`;
  // front row
  for (let x = 0, c = 0; x < 300; x += 31, c++) {
    if (c === 4) continue; // the RTG lifts from this column
    const rows = 2 + Math.floor(r() * 3);
    for (let k = 0; k < rows; k++) {
      const y = QUAY - (k + 1) * 14;
      g += `<rect x="${x}" y="${y}" width="29.5" height="13.4" fill="${CC[Math.floor(r() * CC.length)]}"/><rect x="${x + 28}" y="${y}" width="1.5" height="13.4" fill="#ffc98a" opacity=".45"/><rect x="${x}" y="${y}" width="29.5" height="1.2" fill="#ffd9a6" opacity=".3"/>`;
    }
  }
  // RTG crane lifting a container from column 4 (slow, smooth)
  const lift = 0.5 - 0.5 * Math.cos(TAU * t / LOOP);
  const cx = 124, cy = QUAY - 3 * 14 - lift * 34;
  g += `<rect x="${cx}" y="${QUAY - 14}" width="29.5" height="13.4" fill="#6f7686"/><rect x="${cx}" y="${QUAY - 28}" width="29.5" height="13.4" fill="#2c3f66"/>`;
  g += `<path d="M100 ${QUAY} V150 M178 ${QUAY} V150 M96 150 H182" stroke="#3a3f5e" stroke-width="4" fill="none"/><rect x="96" y="146" width="86" height="8" fill="#c2a24a"/>`;
  g += `<rect x="${cx + 4}" y="154" width="1" height="${f1(cy - 154)}" fill="#2a2f45"/><rect x="${cx + 25}" y="154" width="1" height="${f1(cy - 154)}" fill="#2a2f45"/>`;
  g += `<rect x="${cx - 1}" y="${f1(cy - 3)}" width="31.5" height="3" fill="#c2a24a"/><rect x="${cx}" y="${f1(cy)}" width="29.5" height="13.4" fill="#b8663a"/><rect x="${cx + 28}" y="${f1(cy)}" width="1.5" height="13.4" fill="#ffc98a" opacity=".5"/>`;
  return g;
}

// idle ship-to-shore crane with raised boom (silhouette, behind)
function idleCrane() {
  return `<g opacity=".85">
<path d="M228 ${QUAY} L236 110 M268 ${QUAY} L262 110 M232 200 H266 M230 150 H264" stroke="#2f3150" stroke-width="5" fill="none"/>
<rect x="222" y="98" width="52" height="14" fill="#34365a"/>
<path d="M262 104 L298 18 M256 104 L290 16" stroke="#34365a" stroke-width="4"/>
<path d="M236 98 L248 58 L262 98" stroke="#2f3150" stroke-width="3" fill="none"/>
<circle cx="296" cy="16" r="1.8" fill="#ff6a5a"/></g>`;
}

// main ship-to-shore crane: trolley, cables, spreader and the moving container
const STS = { left: 312, right: 372, boomY: 74, back: 250, reach: 720, pickX: 300, dropX: 640 };
function crane(t) {
  // trolley travel
  let tx;
  if (t < 3.2) tx = STS.pickX;
  else if (t < 7) tx = lerp(STS.pickX, STS.dropX, seg(t, 3.2, 7));
  else if (t < 10.4) tx = STS.dropX;
  else tx = lerp(STS.dropX, STS.pickX, seg(t, 10.4, 12));
  // spreader height
  const HIGH = 118, PICK = 270, DROP = 276;
  let sy;
  if (t < 1.2) sy = lerp(HIGH, PICK, seg(t, 0, 1.2));
  else if (t < 1.6) sy = PICK;
  else if (t < 3.2) sy = lerp(PICK, HIGH, seg(t, 1.6, 3.2));
  else if (t < 7) sy = HIGH + 3 * Math.sin(TAU * (t - 3.2) / 3.8) * seg(t, 3.2, 4);   // gentle sway
  else if (t < 8.6) sy = lerp(HIGH, DROP, seg(t, 7, 8.6));
  else if (t < 9) sy = DROP;
  else if (t < 10.4) sy = lerp(DROP, HIGH, seg(t, 9, 10.4));
  else sy = HIGH;
  const carrying = t >= 1.4 && t < 8.8;
  const sway = t >= 3.2 && t < 7.4 ? 1.6 * Math.sin(TAU * (t - 3.2) / 2.6) * Math.sin(Math.PI * clamp((t - 3.2) / 4.2)) : 0;
  const cx = tx + sway;

  let back = `
<path d="M${STS.left} ${QUAY + 6} L${STS.left + 6} ${STS.boomY + 8} M${STS.right} ${QUAY + 6} L${STS.right - 6} ${STS.boomY + 8}" stroke="#3c4266" stroke-width="6"/>
<path d="M${STS.left + 2} 230 H${STS.right - 2} M${STS.left + 4} 160 H${STS.right - 4} M${STS.left + 3} 230 L${STS.right - 4} 160 M${STS.right - 3} 230 L${STS.left + 4} 160" stroke="#353a5c" stroke-width="2.4"/>
<path d="M${STS.right - 6} ${STS.boomY + 8} L${STS.right - 2} ${QUAY}" stroke="#ffc98a" stroke-opacity=".35" stroke-width="1.2"/>`;
  let boom = `
<rect x="${STS.back}" y="${STS.boomY}" width="${STS.reach - STS.back}" height="9" fill="#454b72"/>
<rect x="${STS.back}" y="${STS.boomY}" width="${STS.reach - STS.back}" height="1.5" fill="#ffcf96" opacity=".45"/>
<path d="${Array.from({ length: Math.floor((STS.reach - STS.back) / 12) }, (_, i) => `M${STS.back + i * 12} ${STS.boomY + 9}l6 -9l6 9`).join("")}" stroke="#2e3354" stroke-width="1" fill="none"/>
<rect x="${STS.left + 2}" y="${STS.boomY - 22}" width="56" height="22" fill="#3c4266"/>
<rect x="${STS.left + 8}" y="${STS.boomY - 17}" width="10" height="6" fill="#ffc777"/>
<path d="M${STS.left + 30} ${STS.boomY - 22} L${STS.left + 34} 20 M${STS.left + 34} 20 L${STS.back + 4} ${STS.boomY} M${STS.left + 34} 20 L${STS.reach - 6} ${STS.boomY}" stroke="#3c4266" stroke-width="2"/>
<circle cx="${STS.left + 34}" cy="18" r="2" fill="#ff6a5a" opacity="${f1(0.35 + 0.65 * Math.max(0, Math.sin(TAU * t / 2)))}"/>
<rect x="${f1(cx - 12)}" y="${STS.boomY + 6}" width="24" height="8" fill="#5a6190"/>`;
  let hang = `<rect x="${f1(cx - 9)}" y="${STS.boomY + 14}" width="1" height="${f1(sy - STS.boomY - 14)}" fill="#2a2f45"/><rect x="${f1(cx + 8)}" y="${STS.boomY + 14}" width="1" height="${f1(sy - STS.boomY - 14)}" fill="#2a2f45"/>`;
  hang += `<rect x="${f1(cx - 16)}" y="${f1(sy - 3)}" width="32" height="3" fill="#c2a24a"/>`;
  if (carrying) hang += `<rect x="${f1(cx - 15)}" y="${f1(sy)}" width="30" height="14" fill="#b8663a"/><rect x="${f1(cx + 13.5)}" y="${f1(sy)}" width="1.5" height="14" fill="#ffd9a6" opacity=".55"/><rect x="${f1(cx - 15)}" y="${f1(sy)}" width="30" height="1.2" fill="#ffe2b8" opacity=".5"/>`;

  // yard truck: loaded one waits under the crane, leaves behind the ship, next one rolls in
  let truck = "";
  const tk = (x, loaded) => `<g transform="translate(${f1(x)} ${QUAY - 2})"><rect x="-18" y="-6" width="40" height="3" fill="#2a2f45"/><rect x="22" y="-14" width="12" height="11" fill="#c2a24a"/><rect x="25" y="-12" width="6" height="4" fill="#ffd9a6" opacity=".7"/><circle cx="-12" cy="-1" r="2.6" fill="#16192b"/><circle cx="14" cy="-1" r="2.6" fill="#16192b"/><circle cx="28" cy="-1" r="2.6" fill="#16192b"/>${loaded ? `<rect x="-15" y="-20" width="30" height="14" fill="#b8663a"/><rect x="13.5" y="-20" width="1.5" height="14" fill="#ffd9a6" opacity=".5"/>` : ""}</g>`;
  if (t < 2.2) truck += tk(STS.pickX, t < 1.4);
  else if (t < 5.4) truck += tk(lerp(STS.pickX, 560, seg(t, 2.2, 5.4)), false);
  if (t >= 7.6) truck += tk(lerp(-60, STS.pickX, 1 - Math.pow(1 - clamp((t - 7.6) / 4.4), 3)), true);
  return { back, boom, hang, truck };
}

function quay(t) {
  let lamps = "";
  for (const x of [40, 190]) {
    const a = 0.8 + 0.2 * Math.sin(TAU * t / 4 + x);
    lamps += `<rect x="${x}" y="${QUAY - 96}" width="2.5" height="96" fill="#2a2f45"/><rect x="${x - 5}" y="${QUAY - 99}" width="12" height="3" fill="#3a3f5e"/><circle cx="${x + 1}" cy="${QUAY - 95}" r="16" fill="url(#lamp)" opacity="${f1(a)}"/><circle cx="${x + 1}" cy="${QUAY - 95}" r="2" fill="#fff0c8"/>`;
  }
  return `<rect x="0" y="${QUAY}" width="560" height="${H - QUAY}" fill="#1c1f36"/>
<rect x="0" y="${QUAY}" width="560" height="2" fill="#e8a57a" opacity=".55"/>
<rect x="0" y="${QUAY + 18}" width="560" height="${H - QUAY - 18}" fill="#14162a"/>
<path d="M0 ${QUAY + 10}h560" stroke="#e8c27a" stroke-opacity=".22" stroke-width="2" stroke-dasharray="16 12"/>
${[70, 150, 230, 330].map((x) => `<rect x="${x}" y="${QUAY + 12}" width="6" height="5" rx="1.5" fill="#2a2f45"/>`).join("")}
${lamps}`;
}

// ------------------------------------------------------------------ status panel
function panel(t) {
  const base = 4 * 3600 + 32 * 60 + 18;           // looping display, not a live countdown
  const sec = Math.floor(t), frac = t - sec;
  const fmt = (v) => [Math.floor(v / 3600), Math.floor(v / 60) % 60, v % 60].map((n) => String(n).padStart(2, "0")).join(":");
  const cur = fmt(base - sec), nxt = fmt(base - sec - 1);
  const fadeK = clamp((frac - 0.78) / 0.22);
  const pulse = 0.55 + 0.45 * Math.sin(TAU * t / 2);
  return `<g>
<rect x="18" y="16" width="214" height="78" rx="8" fill="#141a38" fill-opacity=".42" stroke="#ffffff" stroke-opacity=".14"/>
<text x="32" y="36" font-size="9.5" letter-spacing="2" fill="#dfe4f5" opacity=".75">NEXT SHIPMENT IN</text>
<text x="32" y="62" font-size="22" font-weight="700" letter-spacing="1.5" fill="#f5f2ea" opacity="${f1((1 - fadeK) * 100) / 100}">${cur}</text>
<text x="32" y="62" font-size="22" font-weight="700" letter-spacing="1.5" fill="#f5f2ea" opacity="${f1(fadeK * 100) / 100}">${nxt}</text>
<circle cx="35" cy="80" r="${f1(5 * pulse)}" fill="#5fd38d" opacity="${f1(0.25 * pulse * 100) / 100}"/>
<circle cx="35" cy="80" r="2.6" fill="#5fd38d"/>
<text x="44" y="83" font-size="8.5" letter-spacing=".8" fill="#dfe4f5" opacity=".7">SYSTEM STATUS: OPERATIONAL</text>
</g>`;
}

// ------------------------------------------------------------------ compose
export function scene(t) {
  t = ((t % LOOP) + LOOP) % LOOP;
  const c = crane(t), v = convoy(t);
  // docked ship gently rocking
  const rock = 0.35 * Math.sin(TAU * t / 6), bob = 1.0 * Math.sin(TAU * t / 4);
  const main = ship(650, 318, 1, { seed: 7, hatch: STS.dropX, name: "HK-01 · CHENNAI", full: true });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1d48"/><stop offset=".35" stop-color="#47376e"/><stop offset=".62" stop-color="#a65a7a"/><stop offset=".84" stop-color="#ec9668"/><stop offset="1" stop-color="#ffcf8a"/></linearGradient>
<radialGradient id="sunwash" cx="${SUN.x / W}" cy="${SUN.y / (HZ + 2)}" r=".75" gradientTransform="translate(${SUN.x / W} ${SUN.y / (HZ + 2)}) scale(.55 1) translate(${-SUN.x / W} ${-SUN.y / (HZ + 2)})"><stop offset="0" stop-color="#ffe2a3" stop-opacity=".85"/><stop offset=".5" stop-color="#ffb070" stop-opacity=".25"/><stop offset="1" stop-color="#ff9a6a" stop-opacity="0"/></radialGradient>
<radialGradient id="sunglow"><stop offset="0" stop-color="#fff1c2" stop-opacity=".9"/><stop offset=".35" stop-color="#ffc97a" stop-opacity=".35"/><stop offset="1" stop-color="#ff9a5a" stop-opacity="0"/></radialGradient>
<radialGradient id="sun"><stop offset="0" stop-color="#fffbe6"/><stop offset=".7" stop-color="#ffe09a"/><stop offset="1" stop-color="#ffbf66"/></radialGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2967a"/><stop offset=".12" stop-color="#9a5f7e"/><stop offset=".45" stop-color="#3f3a68"/><stop offset="1" stop-color="#171b38"/></linearGradient>
<linearGradient id="column" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd690" stop-opacity=".75"/><stop offset=".5" stop-color="#ffb070" stop-opacity=".22"/><stop offset="1" stop-color="#ff9a6a" stop-opacity="0"/></linearGradient>
<radialGradient id="lamp"><stop offset="0" stop-color="#ffd98a" stop-opacity=".7"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
<linearGradient id="haze" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f0a080" stop-opacity="0"/><stop offset="1" stop-color="#ffc08a" stop-opacity=".18"/></linearGradient>
<filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
${v.defs}
<style>text{font-family:"DejaVu Sans Mono",ui-monospace,Menlo,Consolas,monospace}</style>
</defs>
${sky(t)}
${sea(t)}
${idleCrane()}
${yard(t)}
${c.back}
${quay(t)}
${c.truck}
${v.g}
${c.hang}
<g transform="translate(0 ${f1(bob)}) rotate(${(Math.round(rock * 1000) / 1000)} 650 318)">${main.g}${navLights(650, 318, 1, t, 0.7)}</g>
<path d="M398 320 q130 6 260 2 t250 -2" stroke="#ffe7c2" stroke-opacity=".25" stroke-width="1.4" fill="none"/>
${c.boom}
<rect width="${W}" height="${H}" fill="url(#haze)"/>
${panel(t)}
</svg>`;
}
