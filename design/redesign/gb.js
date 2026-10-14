// Shared renderers for the Gaffer Booth mockups. One seed: Harbour City 1-3 Westbridge Rovers, 55:43.
const S = {
  home: { name: "Harbour City", short: "HBC", color: "#1e6fd9" },
  away: { name: "Westbridge Rovers", short: "WBR", color: "#0f9d58" },
  clock: "55:43",
  score: [1, 3],
  stats: [
    ["Possession", "49%", "51%", 49, 51],
    ["xG", "1.57", "1.01", 1.57, 1.01],
    ["Shots", "11", "17", 11, 17],
    ["On target", "7", "8", 7, 8],
    ["Pass accuracy", "77%", "76%", 77, 76],
    ["Final-third entries", "34", "27", 34, 27],
    ["Corners", "1", "2", 1, 2],
  ],
};
window.S = S;

const MARK = `<svg class="mark" viewBox="0 0 22 22" aria-hidden="true"><rect x="1" y="1" width="20" height="20" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 1v20M1 11h4M17 11h4" stroke="currentColor" stroke-width="1.6"/><circle cx="11" cy="11" r="3.2" fill="var(--tally)"/></svg>`;
window.wordmark = () => `<span class="wordmark">${MARK}Gaffer<span>Booth</span></span>`;
window.CHECK = `<svg class="check" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const DOTS = [
  ["home", 1, 6, 34], ["home", 2, 22, 58], ["home", 4, 20, 40], ["home", 5, 21, 26], ["home", 3, 24, 10],
  ["home", 8, 38, 40], ["home", 6, 36, 24], ["home", 10, 52, 34], ["home", 7, 58, 56], ["home", 11, 58, 12], ["home", 9, 66, 34],
  ["away", 1, 99, 34], ["away", 2, 72, 60], ["away", 5, 84, 40], ["away", 4, 84, 26], ["away", 3, 76, 8],
  ["away", 8, 56, 44], ["away", 6, 62, 24], ["away", 21, 18, 30], ["away", 7, 40, 54], ["away", 11, 44, 14], ["away", 9, 14, 36],
];

window.bugHtml = () => `<div class="bug"><span class="t"><i style="--c:${S.home.color}"></i>${S.home.short}</span><span class="s">${S.score[0]}<b>-</b>${S.score[1]}</span><span class="t">${S.away.short}<i style="--c:${S.away.color}"></i></span><span class="c">${S.clock}</span></div>`;

window.pitch = ({ bug = true, dim = false } = {}) => {
  const stripes = Array.from({ length: 12 }, (_, i) =>
    `<rect x="${-4 + i * 9.42}" y="-4" width="9.42" height="76" fill="${i % 2 ? "#1a3126" : "#1c3529"}"/>`).join("");
  const dots = DOTS.map(([side, n, x, y]) => {
    const c = S[side].color;
    const hot = side === "away" && n === 9;
    return `<g transform="translate(${x} ${y})">${hot ? `<circle r="3.6" fill="none" stroke="#f3f5f4" stroke-width=".3" stroke-dasharray=".9 .6"/>` : ""}
      <circle r="1.85" fill="${c}" stroke="rgba(243,245,244,.9)" stroke-width=".28"/>
      <text y=".62" fill="#fff" style="font:800 1.75px Archivo;text-anchor:middle">${n}</text></g>`;
  }).join("");
  return `<svg class="pitch" viewBox="-4 -4 113 76" preserveAspectRatio="xMidYMid meet">${stripes}
    <g fill="none" stroke="var(--grass-line)" stroke-width=".24">
      <rect x="0" y="0" width="105" height="68"/><line x1="52.5" y1="0" x2="52.5" y2="68"/>
      <circle cx="52.5" cy="34" r="9.15"/><rect x="0" y="13.84" width="16.5" height="40.32"/>
      <rect x="88.5" y="13.84" width="16.5" height="40.32"/><rect x="0" y="24.84" width="5.5" height="18.32"/>
      <rect x="99.5" y="24.84" width="5.5" height="18.32"/><path d="M-1.2 30.34h1.2v7.32h-1.2zM105 30.34h1.2v7.32H105z"/></g>
    <path d="M44 44 Q30 44 14 36" fill="none" stroke="#f3f5f4" stroke-width=".3" stroke-dasharray="1 .7" opacity=".7"/>
    ${dots}<circle cx="13" cy="35.6" r=".85" fill="#fff" stroke="#0a0d0c" stroke-width=".22"/>
    ${dim ? `<rect x="-4" y="-4" width="113" height="76" fill="rgba(10,13,12,.55)"/>` : ""}</svg>
    ${bug ? window.bugHtml() : ""}
    <span class="wm">SYNTHETIC DATA</span>`;
};

// Momentum, positive = home pressure; minute axis drawn to scale.
const MOM = Array.from({ length: 57 }, (_, m) =>
  [m, Math.sin(m / 3.1) * 2.6 + Math.cos(m / 7) * 1.8 - (m > 47 && m < 55 ? 4.2 : 0) + (m > 39 && m < 45 ? 2.6 : 0)]);
window.momentum = (h = 64) => {
  const W = 600, mid = h / 2, max = 7;
  const x = (m) => (m / 90) * W, y = (v) => mid - (v / max) * (mid - 2);
  const pts = MOM.map(([m, v]) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(" L");
  const area = `M0,${mid} L${pts} L${x(56)},${mid} Z`;
  const ticks = [0, 15, 30, 45, 60, 75, 90].map((m) =>
    `<span style="left:${(m / 90) * 100}%">${m === 45 ? "HT" : m + "'"}</span>`).join("");
  return `<div class="mom"><svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block">
    <defs><clipPath id="mt"><rect width="${W}" height="${mid}"/></clipPath><clipPath id="mb"><rect y="${mid}" width="${W}" height="${mid}"/></clipPath></defs>
    ${[15, 30, 60, 75].map((m) => `<line x1="${x(m)}" x2="${x(m)}" y1="0" y2="${h}" stroke="var(--line)"/>`).join("")}
    <line x1="${x(45)}" x2="${x(45)}" y1="0" y2="${h}" stroke="var(--line-strong)" stroke-dasharray="2 3"/>
    <path d="${area}" fill="${S.home.color}" clip-path="url(#mt)" opacity=".9"/>
    <path d="${area}" fill="${S.away.color}" clip-path="url(#mb)" opacity=".9"/>
    <line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="var(--fg-3)" stroke-width=".6"/>
    <line x1="${x(55.7)}" x2="${x(55.7)}" y1="2" y2="${h - 2}" stroke="var(--fg)" stroke-width="1.2"/></svg>
    <div class="ticks">${ticks}</div></div>`;
};

window.statsTable = () => S.stats.map(([l, h, a, hv, av]) => {
  const t = hv + av || 1;
  return `<div class="st"><b>${h}</b><div><span>${l}</span><i><em style="width:${(hv / t) * 100}%;background:${S.home.color}"></em><em style="width:${(av / t) * 100}%;background:${S.away.color}"></em></i></div><b>${a}</b></div>`;
}).join("");

/* ---------- On-air graphics ---------- */
window.GFX = {
  goal: () => `<div class="gfx gfx-full"><div class="board" style="--c:${S.away.color}"><div class="stripe"></div>
    <div class="in"><div class="kick"><span class="teamchip" style="--c:${S.away.color};color:var(--chalk-ink)"><i></i>Westbridge Rovers</span><span class="mono">55:43</span></div>
    <div class="d gtitle">Goal</div><div class="d-semi gplayer">Femi Delacroix</div></div>
    <dl class="facts" style="grid-template-columns:repeat(4,1fr)"><div><dt>Assist</dt><dd>Moreau</dd></div><div><dt>Chance, xG</dt><dd>0.06</dd></div><div><dt>Build-up passes</dt><dd>1</dd></div><div><dt>WBR total xG</dt><dd>1.01</dd></div></dl>
    <div class="in foot"><p class="say">Delacroix finishes a chance worth 0.06 xG, set up by Cael Moreau. Westbridge have built 1.01 xG to Harbour City's 1.57, and lead by two.</p><span class="proof">${CHECK}5 facts verified</span></div></div></div>`,
  stat: () => `<div class="gfx gfx-side right"><div class="board" style="--c:${S.away.color}"><div class="stripe"></div>
    <div class="in"><div class="kick"><span>Momentum</span><span class="mono">last 5 min</span></div><div class="d-semi stitle">Westbridge take control</div></div>
    <dl class="facts" style="grid-template-columns:1fr 1fr"><div><dt>Final-third entries</dt><dd>6</dd></div><div><dt>Shots</dt><dd>3</dd></div><div><dt>xG</dt><dd>0.31</dd></div><div><dt>Possession</dt><dd>64%</dd></div></dl>
    <div class="in foot"><p class="say">Six final-third entries in five minutes. Harbour City have not had a touch in the Westbridge box since 50:12.</p><span class="proof">${CHECK}4 facts verified</span></div></div></div>`,
  player: () => `<div class="gfx gfx-side left"><div class="board" style="--c:${S.away.color}"><div class="stripe"></div>
    <div class="in prow"><span class="num d">9</span><div><div class="kick"><span>Player spotlight</span><span class="mono">55:43</span></div><div class="d-semi stitle">Femi Delacroix</div><span class="pos">Westbridge Rovers · striker</span></div></div>
    <dl class="facts" style="grid-template-columns:repeat(3,1fr)"><div><dt>Shots</dt><dd>4</dd></div><div><dt>Goals</dt><dd>1</dd></div><div><dt>xG</dt><dd>0.48</dd></div></dl>
    <div class="in foot"><p class="say">Delacroix has taken four shots, more than anyone on the pitch, and scored from the smallest chance of the four.</p><span class="proof">${CHECK}3 facts verified</span></div></div></div>`,
  lower: () => `<div class="gfx gfx-lower"><div class="board lt" style="--c:${S.away.color}"><span class="ltc"></span>
    <div class="ltk"><span class="eyebrow" style="color:var(--chalk-mute)">Yellow card · 48:02</span><b class="d-semi">Cael Moreau</b></div>
    <p class="say">Moreau's second foul in six minutes. Westbridge have now committed 9 fouls to Harbour City's 5.</p><span class="proof">${CHECK}3 facts verified</span></div></div>`,
};
window.caption = (text = "GOAL! Femi Delacroix scores for Westbridge Rovers. Harbour City 1, Westbridge Rovers 3.") =>
  `<div class="caption"><span class="lang">EN</span><span>${text}</span></div>`;

/* ---------- Crew + rundown ---------- */
const AGENTS = ["Director", "Analyst", "Verifier", "Graphics", "Commentator"];
window.crew = (states) => AGENTS.map((a, i) => {
  const [tag, note, live] = states[i];
  return `<div class="agent${live ? " live" : ""}"><span class="n">0${i + 1}</span><div><b>${a}</b><small>${note}</small></div>${tag}</div>`;
}).join("");

window.nb = (label) => {
  const el = document.createElement("span");
  el.className = "nb";
  el.textContent = label;
  document.body.appendChild(el);
};
