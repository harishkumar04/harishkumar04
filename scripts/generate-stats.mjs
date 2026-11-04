#!/usr/bin/env node
// Generates an animated stats card (numbers + top languages) from the GitHub GraphQL API.
// Usage: GH_TOKEN=... GH_LOGIN=user node scripts/generate-stats.mjs   (or --demo)
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const login = process.env.GH_LOGIN || "harishkumar04";
const out = process.env.OUT || "dist/stats.svg";
const demo = process.argv.includes("--demo");

const QUERY = `query($login:String!){
  user(login:$login){
    followers{totalCount}
    contributionsCollection{
      totalCommitContributions totalPullRequestContributions
      contributionCalendar{totalContributions}
    }
    repositories(ownerAffiliations:[OWNER],isFork:false,privacy:PUBLIC,first:100){
      totalCount
      nodes{stargazerCount languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}}
    }
  }
}`;

async function fetchStats() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GH_TOKEN}`, "Content-Type": "application/json", "User-Agent": "stats-generator" },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error("GitHub API error: " + JSON.stringify(json.errors || res.status));
  const u = json.data.user, cc = u.contributionsCollection, repos = u.repositories;
  const langs = {};
  let stars = 0;
  for (const r of repos.nodes) {
    stars += r.stargazerCount;
    for (const e of r.languages.edges) {
      langs[e.node.name] ??= { size: 0, color: e.node.color || "#8a96bd" };
      langs[e.node.name].size += e.size;
    }
  }
  return {
    contributions: cc.contributionCalendar.totalContributions,
    commits: cc.totalCommitContributions,
    prs: cc.totalPullRequestContributions,
    repos: repos.totalCount,
    stars,
    langs,
  };
}

const demoStats = () => ({
  contributions: 412, commits: 356, prs: 18, repos: 14, stars: 9,
  langs: { Python: { size: 52e4, color: "#3572A5" }, HCL: { size: 21e4, color: "#844FBA" }, Shell: { size: 9e4, color: "#89e051" }, Java: { size: 8e4, color: "#b07219" }, Dockerfile: { size: 3e4, color: "#384d54" }, HTML: { size: 2e4, color: "#e34c26" } },
});

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function render(s) {
  const W = 1000, H = 230;
  const metrics = [
    ["CONTRIBUTIONS", s.contributions, "past year"],
    ["COMMITS", s.commits, "past year"],
    ["PULL REQUESTS", s.prs, "past year"],
    ["REPOS", s.repos, `${s.stars} ★`],
  ];
  let left = "";
  metrics.forEach(([label, val, sub], i) => {
    const x = 40 + (i % 2) * 230, y = 70 + Math.floor(i / 2) * 84;
    left += `<g class="in" style="animation-delay:${(0.15 * i).toFixed(2)}s">
<text x="${x}" y="${y}" font-size="11" letter-spacing="2" fill="#7f8fb8">${label}</text>
<text x="${x}" y="${y + 38}" font-size="34" font-weight="700" fill="#ffd479">${val}</text>
<text x="${x + String(val).length * 21 + 10}" y="${y + 37}" font-size="12" fill="#56648f">${esc(sub)}</text></g>`;
  });

  const total = Object.values(s.langs).reduce((a, l) => a + l.size, 0) || 1;
  const top = Object.entries(s.langs).sort((a, b) => b[1].size - a[1].size).slice(0, 5);
  let right = `<text x="540" y="48" font-size="11" letter-spacing="2" fill="#7f8fb8">TOP LANGUAGES</text>`;
  top.forEach(([name, l], i) => {
    const y = 70 + i * 32, pct = (l.size / total) * 100, bw = Math.max(4, (pct / 100) * 300);
    right += `<g class="in" style="animation-delay:${(0.4 + 0.12 * i).toFixed(2)}s">
<text x="540" y="${y + 12}" font-size="13" fill="#cfe0ff">${esc(name)}</text>
<rect x="650" y="${y + 2}" width="300" height="12" rx="6" fill="#ffffff" fill-opacity=".05"/>
<rect class="bar" style="animation-delay:${(0.5 + 0.12 * i).toFixed(2)}s" x="650" y="${y + 2}" width="${bw.toFixed(1)}" height="12" rx="6" fill="${l.color}"/>
<text x="${(656 + bw).toFixed(1)}" y="${y + 12}" font-size="11" fill="#8a96bd">${pct.toFixed(1)}%</text></g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="GitHub stats for ${esc(login)}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070b18"/><stop offset="1" stop-color="#121838"/></linearGradient>
<style>
text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.in{animation:in .9s ease-out both}@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.bar{transform-box:fill-box;transform-origin:left center;animation:grow 1.4s cubic-bezier(.2,.8,.2,1) both}@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.scan{animation:scan 6s linear infinite}@keyframes scan{from{transform:translateY(-10px)}to{transform:translateY(${H + 10}px)}}
</style>
</defs>
<rect width="${W}" height="${H}" rx="14" fill="url(#bg)" stroke="#232b52"/>
<rect class="scan" x="1" y="0" width="${W - 2}" height="1" fill="#5ccfff" opacity=".18"/>
<line x1="500" y1="36" x2="500" y2="${H - 30}" stroke="#232b52"/>
${left}
${right}
</svg>
`;
}

const stats = demo ? demoStats() : await fetchStats();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, render(stats));
console.log(`Wrote ${out}`);
