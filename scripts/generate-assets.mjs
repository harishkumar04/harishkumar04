#!/usr/bin/env node
// Generates the static, animated README assets: neon project billboards and the
// subway-map toolbox and the header. Run once after editing the data below:
//   node scripts/generate-assets.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONT = "text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}";

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- projects
const PROJECTS = [
  {
    slug: "devops-pipeline",
    title: "End-to-End-Devops-Pipeline",
    accent: "#ffb347",
    lines: [
      "Jenkins → Docker → Helm → AWS EKS, behind NGINX Ingress and Cloudflare DNS,",
      "with PostgreSQL StatefulSets and Prometheus · Grafana · Loki watching it all.",
    ],
    tags: ["Jenkins", "Kubernetes", "Helm", "AWS EKS"],
  },
  {
    slug: "jenkins-rca-agent",
    title: "Jenkins-RCA-Agent",
    accent: "#5ff3ff",
    lines: [
      "AI agent that reads failed Jenkins builds, fingerprints recurring incidents,",
      "routes them to the right team and emails an RCA report with a fix playbook.",
    ],
    tags: ["Python", "FastAPI", "GPT-4o-mini", "Docker"],
  },
  {
    slug: "rag-chatbot-bedrock",
    title: "RAG-Chatbot-using-AWS-Bedrock",
    accent: "#ff6ad5",
    lines: [
      "Ask questions of your own documents: S3 for storage, Amazon Bedrock for the",
      "LLM and OpenSearch Serverless for vector search and retrieval.",
    ],
    tags: ["AWS Bedrock", "S3", "OpenSearch"],
  },
];

function projectCard(p, i) {
  const W = 1000, H = 150, r = rng(77 + i * 31);
  const num = String(i + 1).padStart(2, "0");

  let tags = "", tx = 120;
  for (const t of p.tags) {
    const w = t.length * 7.2 + 18;
    tags += `<rect x="${tx}" y="114" width="${w}" height="20" rx="10" fill="${p.accent}" fill-opacity=".1" stroke="${p.accent}" stroke-opacity=".45"/>`;
    tags += `<text x="${tx + w / 2}" y="128" text-anchor="middle" font-size="12" fill="${p.accent}">${esc(t)}</text>`;
    tx += w + 8;
  }

  // a small lit building on the right
  const bx = 900, bw = 64, by = 34;
  let lit = "", flick = "", dark = "";
  for (let y = by + 10; y < H - 12; y += 11)
    for (let x = bx + 8; x < bx + bw - 8; x += 10) {
      const d = `M${x} ${y}h5v6h-5z`, v = r();
      if (v < 0.12) flick += d; else if (v < 0.62) lit += d; else dark += d;
    }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(p.title)}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1022"/><stop offset="1" stop-color="#141a38"/></linearGradient>
<linearGradient id="bld" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2347"/><stop offset="1" stop-color="#0b1022"/></linearGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<clipPath id="card"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14"/></clipPath>
<style>${FONT}
.run{stroke-dasharray:14 86;animation:run 7s linear infinite}@keyframes run{to{stroke-dashoffset:-100}}
.neon{animation:neon 6s steps(1) infinite}@keyframes neon{0%,100%{opacity:1}62%{opacity:.35}64%{opacity:1}66%{opacity:.5}68%{opacity:1}}
.fl{animation:fl 5s steps(1) infinite}@keyframes fl{0%,100%{opacity:1}45%{opacity:.08}70%{opacity:1}}
.in{animation:in 1.2s ease-out both}@keyframes in{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
.sweep{animation:sweep 9s ease-in-out infinite}@keyframes sweep{0%,70%{transform:translateX(-300px)}100%{transform:translateX(1300px)}}
</style>
</defs>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="url(#bg)" stroke="#232b52"/>
<g clip-path="url(#card)"><rect class="sweep" x="0" y="-20" width="120" height="${H + 40}" fill="#ffffff" opacity=".035" transform="skewX(-20)"/></g>
<rect class="run" x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="none" stroke="${p.accent}" stroke-width="2" pathLength="100" filter="url(#glow)"/>
<text class="neon" x="62" y="92" text-anchor="middle" font-size="46" font-weight="700" fill="${p.accent}" filter="url(#glow)">${num}</text>
<g class="in">
<text x="120" y="48" font-size="22" font-weight="700" fill="#eaf1ff">${esc(p.title)}</text>
${p.lines.map((l, k) => `<text x="120" y="${76 + k * 20}" font-size="14" fill="#9fb2e0">${esc(l)}</text>`).join("\n")}
${tags}
</g>
<text x="872" y="30" text-anchor="end" font-size="11" letter-spacing="2" fill="#56648f">OPEN REPO ↗</text>
<g clip-path="url(#card)">
<rect x="${bx}" y="${by}" width="${bw}" height="${H - by}" fill="url(#bld)"/>
<rect x="${bx + bw / 2 - 0.5}" y="${by - 14}" width="1" height="14" fill="#2a3360"/>
<circle class="neon" cx="${bx + bw / 2}" cy="${by - 14}" r="2" fill="#ff4d5e"/>
<path d="${dark}" fill="#fff" opacity=".05"/>
<path d="${lit}" fill="#ffd479" opacity=".85"/>
<path class="fl" d="${flick}" fill="${p.accent}"/>
</g>
</svg>
`;
}

// ---------------------------------------------------------------- subway toolbox
const LINES = [
  { bullet: "I", name: "INFRA", color: "#ff6319", stops: ["AWS", "Terraform", "CloudFormation", "Docker", "Kubernetes", "Helm"] },
  { bullet: "D", name: "DELIVERY", color: "#2f6fe4", stops: ["Git", "GitHub Actions", "Jenkins", "CodeBuild", "CodeDeploy", "CodePipeline"] },
  { bullet: "O", name: "OBSERVE", color: "#00b35a", stops: ["Prometheus", "Grafana", "Loki", "ELK Stack", "Zabbix"] },
  { bullet: "A", name: "AI & DATA", color: "#fccc0a", stops: ["Bedrock", "OpenSearch", "Python", "Java", "MySQL", "PostgreSQL"] },
];

function subway() {
  const W = 1000, ROW = 74, TOP = 34, H = TOP + LINES.length * ROW + 6;
  const X0 = 190, X1 = 935;
  let body = "";
  LINES.forEach((ln, i) => {
    const y = TOP + i * ROW + 34;
    const dark = ln.color === "#fccc0a" ? "#0b1022" : "#fff";
    body += `<circle cx="40" cy="${y}" r="17" fill="${ln.color}"/><text x="40" y="${y + 6}" text-anchor="middle" font-size="18" font-weight="700" fill="${dark}">${ln.bullet}</text>`;
    body += `<text x="68" y="${y + 5}" font-size="12" letter-spacing="2" fill="#7f8fb8">${esc(ln.name)}</text>`;
    body += `<line x1="${X0}" y1="${y}" x2="${X1}" y2="${y}" stroke="${ln.color}" stroke-width="6" stroke-linecap="round" opacity=".9"/>`;
    const step = (X1 - X0 - 40) / (ln.stops.length - 1);
    ln.stops.forEach((s, k) => {
      const x = X0 + 20 + k * step;
      body += `<circle cx="${x}" cy="${y}" r="7" fill="#eaf1ff" stroke="#0b1022" stroke-width="2.5"/>`;
      body += `<text x="${x}" y="${y - 15}" text-anchor="middle" font-size="12" fill="#cfe0ff">${esc(s)}</text>`;
    });
    // train
    const dur = 9 + i * 2.3;
    body += `<g class="train" style="--d:${dur}s;animation-delay:-${(i * 2.7).toFixed(1)}s"><g transform="translate(${X0} ${y})">
<rect x="-2" y="-7" width="40" height="14" rx="7" fill="#eaf1ff"/><rect x="3" y="-4" width="6" height="5" rx="1" fill="${ln.color}"/><rect x="12" y="-4" width="6" height="5" rx="1" fill="${ln.color}"/><rect x="21" y="-4" width="6" height="5" rx="1" fill="${ln.color}"/>
<circle cx="35" cy="0" r="2" fill="#fff6c9" class="hl"/></g></g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Toolbox drawn as a subway map">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b18"/><stop offset="1" stop-color="#0e1430"/></linearGradient>
<pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#ffffff" stroke-opacity=".03"/></pattern>
<style>${FONT}
.train{animation:ride var(--d) ease-in-out infinite alternate}@keyframes ride{from{transform:translateX(0)}to{transform:translateX(${X1 - X0 - 38}px)}}
.hl{animation:hl 1.2s ease-in-out infinite}@keyframes hl{50%{opacity:.3}}
</style>
</defs>
<rect width="${W}" height="${H}" rx="14" fill="url(#bg)"/>
<rect width="${W}" height="${H}" rx="14" fill="url(#grid)"/>
${body}
</svg>
`;
}


// ---------------------------------------------------------------- header
function header() {
  const W = 1000, H = 190, r = rng(5);
  let rain = "";
  for (let i = 0; i < 26; i++) {
    const x = Math.round(380 + r() * 600), len = 10 + Math.round(r() * 14);
    rain += `<rect class="rain" style="animation-delay:-${(r() * 4).toFixed(2)}s;animation-duration:${(2.6 + r() * 2.4).toFixed(2)}s" x="${x}" y="-30" width="2" height="${len}" fill="#3a4a85"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="About me: R Harish Kumar, Cloud and DevOps Engineer">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070f"/><stop offset="1" stop-color="#0b1022"/></linearGradient>
<clipPath id="c"><rect width="${W}" height="${H}" rx="14"/></clipPath>
<style>${FONT}
.rain{animation:rain 4s linear infinite}@keyframes rain{to{transform:translateY(${H + 40}px)}}
.cur{animation:cur 1.1s steps(1) infinite}@keyframes cur{50%{opacity:0}}
</style>
</defs>
<rect width="${W}" height="${H}" rx="14" fill="url(#bg)"/>
<g clip-path="url(#c)">${rain}</g>
<rect x="40" y="34" width="250" height="52" fill="#0b1022" stroke="#5ccfff" stroke-width="2.5"/>
<text x="64" y="68" font-size="22" font-weight="700" letter-spacing="3" fill="#5ccfff">ABOUT ME</text>
<text x="40" y="130" font-size="20" font-weight="600" fill="#e6ebf5">R Harish Kumar · Cloud &amp; DevOps Engineer</text>
<text x="40" y="160" font-size="16" fill="#8a96bd">automating cloud infrastructure, pipelines and observability</text>
<rect class="cur" x="${40 + 61 * 9.65}" y="146" width="9" height="18" fill="#5ccfff"/>
</svg>
`;
}

mkdirSync("assets/projects", { recursive: true });
PROJECTS.forEach((p, i) => writeFileSync(`assets/projects/${p.slug}.svg`, projectCard(p, i)));
writeFileSync("assets/toolbox.svg", subway());
writeFileSync("assets/header.svg", header());
console.log("Wrote assets/projects/*.svg and assets/toolbox.svg");
