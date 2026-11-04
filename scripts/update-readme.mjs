#!/usr/bin/env node
// Rewrites the skyline block of README.md: one linked slice per week, with a hover tooltip
// (dates, contribution count, top repos). Clicking a building opens the profile's
// contribution activity for that week.
// Usage: node scripts/update-readme.mjs dist/skyline/weeks.json
import { readFileSync, writeFileSync } from "node:fs";

const login = process.env.GH_LOGIN || "harishkumar04";
const RAW = `https://raw.githubusercontent.com/${login}/${login}/output/skyline`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weeks = JSON.parse(readFileSync(process.argv[2] || "dist/skyline/weeks.json", "utf8"));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const day = (iso) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;

const cells = weeks.map((w) => {
  const width = (w.width * 99.8).toFixed(2);
  const img = (title) => `<img src="${RAW}/${w.file}" alt="${esc(title)}" title="${esc(title)}" width="${width}%" />`;
  if (!w.start) return img("Night skyline");
  const n = w.count === 0 ? "no contributions" : `${w.count} contribution${w.count === 1 ? "" : "s"}`;
  const repos = (w.repos || []).filter(([, c]) => c > 0);
  const top = repos.length ? " · " + repos.map(([r, c]) => `${r} (${c})`).join(", ") : "";
  const title = `${day(w.start)} – ${day(w.end)} · ${n}${top}`;
  const href = `https://github.com/${login}?tab=overview&from=${w.start}&to=${w.end}`;
  return `<a href="${esc(href)}" title="${esc(title)}">${img(title)}</a>`;
});

const block = `<!-- skyline:start -->\n<p align="center">${cells.join("")}</p>\n<!-- skyline:end -->`;
const readme = readFileSync("README.md", "utf8");
const next = readme.replace(/<!-- skyline:start -->[\s\S]*?<!-- skyline:end -->/, block);
if (next === readme) { console.log("README skyline block unchanged"); process.exit(0); }
writeFileSync("README.md", next);
console.log("README skyline block updated");
