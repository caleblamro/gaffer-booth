// Builds a live screen from window.LIVE = { overlay, caption, paused, crew, rundown, tab, extra, label }.
(() => {
  const L = window.LIVE;
  const P = (t) => `<span class="tag pass">${CHECK}${t}</span>`;
  const T = (cls, t) => `<span class="tag ${cls}">${t}</span>`;
  const crewStates = L.crew || [
    [T("fail", "On air"), "GOAL to full screen", true],
    [P("Done"), "Draft in 1.1 s, 2 tools"],
    [P("5 / 5"), "All claims match evidence"],
    [P("Done"), "4 fact keys"],
    [P("EN · ES"), "Both lines verified"],
  ];
  const tabs = L.tab || "Rundown";
  const cam = L.cam || "main";
  const program = cam === "radar" ? pitch({ dim: L.paused }) : camView(cam) + bugHtml() + `<span class="wm">${L.replay ? "" : "SYNTHETIC DATA · RENDERED"}</span>` + (L.paused ? `<div class="dimmer"></div>` : "");
  const order = [["main", "Main"], ["tactical", "Tactical"], ["goal", "Behind goal"], ["iso", "Isolation"], ["reverse", "Reverse"], ["radar", "Radar"]];
  const pvw = L.pvw || "goal";
  const cams = `<div class="panel cams"><div class="cams-h"><span class="eyebrow">Cameras</span><span class="auto">Cuts <b>${L.manual ? "Manual" : "Director · auto"}</b></span></div>
    <div class="thumbs">${order.map(([k, n], i) => `<div class="th${k === cam ? " pgm" : ""}${k === pvw && k !== cam ? " pvw" : ""}"><div class="img">${k === "radar" ? pitch({ bug: false }) : camView(k)}</div><div class="lb"><span class="mono">${i + 1}</span>${n}${k === cam ? `<em class="pg">PGM</em>` : k === pvw ? `<em class="pv">PVW</em>` : ""}</div></div>`).join("")}</div></div>`;
  document.body.innerHTML = `
  <header class="top">${wordmark()}<span class="sep"></span><span class="fixture">Harbour City v Westbridge Rovers</span>
    ${L.paused ? `<span class="tally off">Paused</span>` : `<span class="tally">On air</span>`}
    <div class="right">
      <button class="btn">${L.paused ? "Resume" : "Pause"} <span class="kbd">Space</span></button>
      <div class="seg"><button>20×</button><button class="on">40×</button><button>80×</button></div>
      <div class="seg"><button class="on">EN</button><button>ES</button></div>
      <button class="btn">Voice off</button>
      <button class="btn ghost">End match</button>
    </div></header>
  <main class="stage">
    <section class="prog">
      <div class="monitor">${program}${L.overlay ? GFX[L.overlay]() : ""}${L.caption ? caption(L.caption === true ? undefined : L.caption) : ""}
        ${L.paused ? `<div class="slate"><div><span class="eyebrow">Broadcast paused at 55:43</span><span class="d">Hold</span><span class="dim">The match clock and the crew are frozen. Nothing airs until you resume.</span><button class="btn primary">Resume <span class="kbd" style="color:#fff;border-color:rgba(255,255,255,.4)">Space</span></button></div></div>` : ""}
      </div>
      ${L.noCams ? "" : cams}
      <div class="panel strip">
        <section><div class="hd"><span class="eyebrow">Momentum</span><span class="key"><span><i style="background:${S.home.color}"></i>Harbour City</span><span><i style="background:${S.away.color}"></i>Westbridge</span></span></div>${momentum(58)}</section>
        <section><div class="hd"><span class="eyebrow">Match stats</span><span class="mono faint" style="font-size:11px">HBC · WBR</span></div><div class="stats">${statsTable()}</div></section>
      </div>
    </section>
    <aside class="rail">
      <div class="rail-h"><h3>Crew</h3><span class="tag idle">Foundry</span></div>
      <div class="crewlist">${crew(crewStates)}</div>
      <div class="tabs"><span class="${tabs === "Rundown" ? "on" : ""}">Rundown<em>4</em></span><span class="${tabs === "Feed" ? "on" : ""}">Match feed</span><span>Detected<em>1</em></span></div>
      <div class="log">${L.rundown}</div>
      <div class="next"><span class="eyebrow">Up next</span><span class="q"><i style="background:${S.home.color}"></i><span class="mono faint">${(L.next || ["55:50"])[0]}</span>${(L.next || [, "Pressing drop, HBC"])[1]}</span></div>
    </aside>
  </main>${L.extra || ""}`;
  nb(L.label);
})();
