#!/usr/bin/env node
// Generates a night-time New York skyline SVG.
// One building = one week of GitHub contributions (last 20 weeks).
// Usage: GH_TOKEN=... GH_LOGIN=user node scripts/generate-skyline.mjs   (or --demo for sample data)
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const WEEKS = 20;
const login = process.env.GH_LOGIN || "harishkumar04";
const out = process.env.OUT || "dist/skyline.svg";
const demo = process.argv.includes("--demo");

const QUERY = `query($login:String!,$from:DateTime!,$to:DateTime!){
  user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{
    weeks{firstDay contributionDays{contributionCount}}}}}}`;

async function fetchWeeks() {
  const to = new Date();
  const from = new Date(to.getTime() - (WEEKS + 1) * 7 * 864e5);
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GH_TOKEN}`, "Content-Type": "application/json", "User-Agent": "skyline-generator" },
    body: JSON.stringify({ query: QUERY, variables: { login, from: from.toISOString(), to: to.toISOString() } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error("GitHub API error: " + JSON.stringify(json.errors || res.status));
  return json.data.user.contributionsCollection.contributionCalendar.weeks.map((w) => ({
    start: w.firstDay,
    count: w.contributionDays.reduce((a, d) => a + d.contributionCount, 0),
  }));
}

function demoWeeks() {
  const c = [3, 8, 0, 12, 25, 18, 6, 0, 14, 30, 22, 9, 17, 41, 28, 11, 5, 19, 33, 24];
  return c.map((count, i) => ({ start: new Date(Date.now() - (WEEKS - 1 - i) * 7 * 864e5).toISOString().slice(0, 10), count }));
}

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function render(weeksIn) {
  let weeks = weeksIn.slice(-WEEKS);
  while (weeks.length < WEEKS) weeks.unshift({ start: null, count: 0 });

  const W = 1000, H = 440, GROUND = 320, PAD = 40;
  const slot = (W - PAD * 2) / WEEKS;
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const total = weeks.reduce((a, w) => a + w.count, 0);
  const maxIdx = weeks.findIndex((w) => w.count === max && max > 0);
  const last = weeks.length - 1;

  let city = "", labels = "", lastMonthAt = -9;

  weeks.forEach((wk, i) => {
    const r = rng(1000 + i * 7919);
    const x = PAD + i * slot, w = slot - 1, cx = x + w / 2;
    const t = wk.count / max;
    const h = wk.count === 0 ? 22 : Math.round(34 + 150 * Math.pow(t, 0.75));
    const top = GROUND - h;
    const litP = wk.count === 0 ? 0.08 : 0.45 + 0.4 * t;
    const style = i === maxIdx ? "spire" : wk.count === 0 ? "flat" : (() => { const v = r(); return v < 0.3 ? "flat" : v < 0.62 ? "setback" : v < 0.82 && h < 130 ? "tank" : "antenna"; })();

    let g = `<rect x="${x.toFixed(1)}" y="${top}" width="${w.toFixed(1)}" height="${h}" fill="url(#b${i % 3})"/>`;
    g += `<rect x="${(x + w - 1).toFixed(1)}" y="${top}" width="1" height="${h}" fill="#9db4ff" opacity=".12"/>`;
    let roof = top;

    const parts = { s1: "", s2: "", s3: "", fa: "", fb: "", dk: "" };
    const windows = (bx, by, bw, bh, p) => {
      const cols = Math.floor((bw - 6) / 7), rows = Math.floor((bh - 8) / 9);
      const ox = bx + (bw - cols * 7 + 3) / 2;
      for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
        const wx = (ox + c * 7).toFixed(1), wy = by + 6 + rr * 9;
        const d = `M${wx} ${wy}h4v5h-4z`;
        if (r() < p) {
          const k = r();
          if (k < 0.07) parts.fa += d; else if (k < 0.14) parts.fb += d;
          else if (k < 0.62) parts.s1 += d; else if (k < 0.93) parts.s2 += d; else parts.s3 += d;
        } else parts.dk += d;
      }
    };
    windows(x, top, w, h, litP);

    const antenna = (ax, ay, len) => {
      g += `<rect x="${(ax - 0.5).toFixed(1)}" y="${ay - len}" width="1" height="${len}" fill="#222a45"/>`;
      g += `<circle class="bl" style="animation-delay:-${(r() * 2).toFixed(2)}s" cx="${ax.toFixed(1)}" cy="${ay - len}" r="1.6" fill="#ff4d5e"/>`;
    };

    if (style === "setback" || style === "spire") {
      const tiers = style === "spire" ? [[0.72, 16], [0.46, 14], [0.22, 12]] : [[0.62, Math.round(h * 0.16) + 6]];
      tiers.forEach(([f, th]) => {
        const tw = w * f, tx = x + (w - tw) / 2;
        g += `<rect x="${tx.toFixed(1)}" y="${roof - th}" width="${tw.toFixed(1)}" height="${th}" fill="url(#b${(i + 1) % 3})"/>`;
        if (tw > 14) windows(tx, roof - th, tw, th, litP);
        roof -= th;
      });
      if (style === "spire") antenna(cx, roof, 26);
    } else if (style === "tank") {
      const tx = x + w * 0.28;
      g += `<path d="M${tx.toFixed(1)} ${top} v-6 M${(tx + 9).toFixed(1)} ${top} v-6" stroke="#222a45" stroke-width="1"/>`;
      g += `<rect x="${tx.toFixed(1)}" y="${top - 16}" width="10" height="10" fill="#1a2140"/><path d="M${(tx - 1).toFixed(1)} ${top - 16} l6 -5 l6 5z" fill="#222a45"/>`;
      roof -= 21;
    } else if (style === "antenna") antenna(cx, top, 12 + Math.floor(r() * 12)), (roof -= 20);
    else if (style === "flat" && wk.count > 0) g += `<rect x="${(x + 3).toFixed(1)}" y="${top - 3}" width="${(w - 6).toFixed(1)}" height="3" fill="#171d38"/>`;

    const gr = (cls, d, fill, extra = "") => (d ? `<path ${cls ? `class="${cls}"` : ""} d="${d}" fill="${fill}" ${extra}/>` : "");
    g += gr("", parts.dk, "#ffffff", 'opacity=".045"');
    g += gr("", parts.s1, "#ffd479", 'opacity=".92"');
    g += gr("", parts.s2, "#ffb347", 'opacity=".85"');
    g += gr("", parts.s3, "#a8d8ff", 'opacity=".8"');
    g += gr("fa", parts.fa, "#ffe29a", `style="animation-delay:-${(r() * 7).toFixed(2)}s"`);
    g += gr("fb", parts.fb, "#ffd479", `style="animation-delay:-${(r() * 5).toFixed(2)}s"`);
    city += `<g>${g}</g>`;

    const isNow = i === last;
    labels += `<text x="${cx.toFixed(1)}" y="${roof - (style === "spire" ? 36 : 8)}" text-anchor="middle" font-size="${isNow ? 11 : 9}" fill="${isNow ? "#5ff3ff" : "#7f8fb8"}" ${isNow ? 'font-weight="700"' : ""}>${wk.count}</text>`;
    if (isNow) labels += `<path class="pulse" d="M${(cx - 4).toFixed(1)} ${roof - (style === "spire" ? 58 : 30)} h8 l-4 5z" fill="#5ff3ff"/><text x="${cx.toFixed(1)}" y="${roof - (style === "spire" ? 62 : 34)}" text-anchor="middle" font-size="8" letter-spacing="1.5" fill="#5ff3ff">THIS WEEK</text>`;

    if (wk.start) {
      const m = MONTHS[parseInt(wk.start.slice(5, 7), 10) - 1];
      const prev = weeks[i - 1]?.start ? MONTHS[parseInt(weeks[i - 1].start.slice(5, 7), 10) - 1] : null;
      if (m !== prev && i - lastMonthAt >= 3 && (lastMonthAt = i) >= 0) labels += `<text x="${x.toFixed(1)}" y="${GROUND + 18}" font-size="9" letter-spacing="1.5" fill="#56648f">${m}</text>`;
    }
  });

  const rs = rng(42);
  let stars = "";
  for (let i = 0; i < 80; i++) {
    const sx = (rs() * W).toFixed(0), sy = (rs() * 190).toFixed(0), sr = (0.4 + rs() * 0.9).toFixed(1);
    stars += `<circle class="tw" style="animation-delay:-${(rs() * 6).toFixed(1)}s;animation-duration:${(3 + rs() * 4).toFixed(1)}s" cx="${sx}" cy="${sy}" r="${sr}" fill="#dfe8ff"/>`;
  }
  let shimmer = "";
  for (let i = 0; i < 16; i++) {
    shimmer += `<rect class="sh" style="animation-delay:-${(rs() * 5).toFixed(1)}s" x="${(rs() * (W - 60)).toFixed(0)}" y="${(GROUND + 26 + rs() * 80).toFixed(0)}" width="${(14 + rs() * 40).toFixed(0)}" height="1" fill="#8fb4ff"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Night skyline of New York: one building per week of GitHub contributions for ${login}">
<title>${login} · last ${WEEKS} weeks · ${total} contributions</title>
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#04060e"/><stop offset=".55" stop-color="#0d1330"/><stop offset="1" stop-color="#2b2150"/></linearGradient>
<radialGradient id="moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#cfe0ff" stop-opacity=".35"/><stop offset="1" stop-color="#cfe0ff" stop-opacity="0"/></radialGradient>
<radialGradient id="glow" cx=".5" cy="1" r=".6"><stop offset="0" stop-color="#ff9a6b" stop-opacity=".28"/><stop offset="1" stop-color="#ff9a6b" stop-opacity="0"/></radialGradient>
<linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c1228"/><stop offset="1" stop-color="#04060e"/></linearGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b1a" stop-opacity=".25"/><stop offset=".9" stop-color="#04060e" stop-opacity="1"/></linearGradient>
<linearGradient id="b0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2142"/><stop offset="1" stop-color="#0b1022"/></linearGradient>
<linearGradient id="b1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151b38"/><stop offset="1" stop-color="#090d1d"/></linearGradient>
<linearGradient id="b2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d1f45"/><stop offset="1" stop-color="#0c1024"/></linearGradient>
<style>
text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.tw{animation:tw 4s ease-in-out infinite}@keyframes tw{0%,100%{opacity:.2}50%{opacity:1}}
.fa{animation:fa 9s steps(1) infinite}@keyframes fa{0%,100%{opacity:1}35%{opacity:.05}55%{opacity:1}}
.fb{animation:fb 6s steps(1) infinite}@keyframes fb{0%,100%{opacity:.9}50%{opacity:.05}70%{opacity:.9}}
.bl{animation:bl 2.4s ease-in-out infinite}@keyframes bl{0%,100%{opacity:.15}35%{opacity:1}}
.pulse{animation:pu 1.8s ease-in-out infinite}@keyframes pu{0%,100%{opacity:.4;transform:translateY(0)}50%{opacity:1;transform:translateY(3px)}}
.sh{animation:sh 5s ease-in-out infinite}@keyframes sh{0%,100%{opacity:0}50%{opacity:.22}}
.plane{animation:fly 50s linear infinite}@keyframes fly{from{transform:translateX(-80px)}to{transform:translateX(1080px)}}
.shoot{animation:shoot 14s linear infinite;opacity:0}@keyframes shoot{0%,90%{opacity:0;transform:translate(0,0)}92%{opacity:1}100%{opacity:0;transform:translate(-160px,70px)}}
</style>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${stars}
<circle cx="880" cy="78" r="70" fill="url(#moon)"/><circle cx="880" cy="78" r="22" fill="#eaf1ff"/><circle cx="872" cy="72" r="4" fill="#cdd9f5"/><circle cx="888" cy="86" r="5.5" fill="#d6e0f8"/><circle cx="884" cy="68" r="2.5" fill="#cdd9f5"/>
<g class="plane"><g transform="translate(0 52)"><circle r="1.4" fill="#fff"/><circle class="bl" cx="-3" r="1.3" fill="#ff4d5e"/></g></g>
<g class="shoot"><path d="M720 40 l-26 11" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></g>
<ellipse cx="${W / 2}" cy="${GROUND}" rx="560" ry="150" fill="url(#glow)"/>
<rect y="${GROUND}" width="${W}" height="${H - GROUND}" fill="url(#water)"/>
<use href="#city" transform="translate(0 ${2 * GROUND}) scale(1 -1)" opacity=".2"/>
<rect y="${GROUND}" width="${W}" height="${H - GROUND}" fill="url(#fade)"/>
${shimmer}
<g id="city">${city}</g>
<rect y="${GROUND}" width="${W}" height="2" fill="#0a0e1e"/><rect y="${GROUND}" width="${W}" height=".8" fill="#6f86d6" opacity=".35"/>
${labels}
<text x="30" y="36" font-size="13" font-weight="700" letter-spacing="2" fill="#cfe0ff">${login.toUpperCase()} · LAST ${WEEKS} WEEKS</text>
<text x="30" y="54" font-size="10" letter-spacing="1.5" fill="#7f8fb8">${total} CONTRIBUTIONS · ONE BUILDING = ONE WEEK · TALLEST = BEST WEEK</text>
</svg>
`;
}

const weeks = demo ? demoWeeks() : await fetchWeeks();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, render(weeks));
console.log(`Wrote ${out} (${weeks.length} weeks, ${weeks.reduce((a, w) => a + w.count, 0)} contributions)`);
