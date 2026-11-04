// Renders the banner: frames for the GIF, plus static and preview PNGs.
// Usage: node scripts/banner/render.mjs [fps] [outdir]
//   then: bash scripts/banner/make-gif.sh   (encodes assets/banner/shipping-harbor.gif)
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { scene, W, H, LOOP } from "./scene.mjs";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright")); }

const fps = +(process.argv[2] || 10);
const dir = process.argv[3] || "build/banner-frames";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
mkdirSync("assets/banner/source", { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
const shot = async (t, path, scale = 1) => {
  await page.setContent(`<html><body style="margin:0;background:#000">${scene(t)}</body></html>`);
  return page.screenshot({ path, clip: { x: 0, y: 0, width: W, height: H } });
};
const N = Math.round(LOOP * fps);
for (let i = 0; i < N; i++) await shot((i / N) * LOOP, `${dir}/${String(i).padStart(4, "0")}.png`);
// static fallback: container suspended above the ship
await shot(6.2, "assets/banner/shipping-harbor-static.png");
writeFileSync("assets/banner/source/harbor-scene.svg", scene(6.2));
await browser.close();
console.log(`Rendered ${N} frames to ${dir}`);
