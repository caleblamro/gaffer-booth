// Shared synthetic frame for all v2 mockups: 66:18, Harbour City (home, attacking right) v Westbridge Rovers.
window.GB = {
  home: [[6,50],[22,20],[20,42],[21,60],[23,80],[40,30],[44,52],[41,72],[60,22],[63,48],[66,74]],
  away: [[94,50],[80,24],[78,42],[79,58],[81,77],[66,34],[64,56],[68,68],[52,30],[50,50],[54,70]],
  ball: [63,47],
  momentum: [-2,-3,-1,0,1,2,1,-1,-3,-4,-2,0,1,3,2,0,-1,-2,-1,0,2,4,5,3,1,-1,-2,-3,-1,1,2,1,0,-2,-1,1,3,4,6,5,3,2,4,5,3],
};
// Draw a top-down pitch into an <svg> with the given colours.
window.drawPitch = function (svg, c) {
  const W = 105, H = 68, NS = "http://www.w3.org/2000/svg";
  svg.setAttribute("viewBox", `-2 -2 ${W + 4} ${H + 4}`);
  const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
  if (c.stripes) for (let i = 0; i < 10; i++) el("rect", { x: i * 10.5, y: 0, width: 10.5, height: H, fill: i % 2 ? c.grassA : c.grassB });
  else el("rect", { x: 0, y: 0, width: W, height: H, fill: c.grassA });
  const L = { fill: "none", stroke: c.line, "stroke-width": c.lw || 0.35 };
  el("rect", { x: 0, y: 0, width: W, height: H, ...L });
  el("line", { x1: W / 2, y1: 0, x2: W / 2, y2: H, ...L });
  el("circle", { cx: W / 2, cy: H / 2, r: 9.15, ...L });
  for (const x of [0, W - 16.5]) el("rect", { x, y: 13.85, width: 16.5, height: 40.3, ...L });
  for (const x of [0, W - 5.5]) el("rect", { x, y: 24.85, width: 5.5, height: 18.3, ...L });
  const P = (p) => [p[0] / 100 * W, p[1] / 100 * H];
  const r = c.r || 1.3;
  GB.home.forEach((p) => { const [x, y] = P(p); el("circle", { cx: x, cy: y, r, fill: c.home, stroke: c.ring || "none", "stroke-width": 0.3 }); });
  GB.away.forEach((p) => { const [x, y] = P(p); el(c.awayShape === "square" ? "rect" : "circle", c.awayShape === "square" ? { x: x - r, y: y - r, width: r * 2, height: r * 2, fill: c.away } : { cx: x, cy: y, r, fill: c.away, stroke: c.ring || "none", "stroke-width": 0.3 }); });
  const [bx, by] = P(GB.ball); el("circle", { cx: bx, cy: by, r: r * 0.55, fill: c.ball });
};
