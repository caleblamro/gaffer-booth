// Broadcast cameras: a pinhole projection of the same player positions the radar uses.
// World: X along the pitch (0-105 m), Y across (0-68 m), Z up. Output is a 16:9 SVG.
(() => {
  const W = 1600, H = 900;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

  const CAMS = {
    main: { name: "Main", pos: [30, -16, 12], at: [19, 33, 0], fov: 2.2 },
    tactical: { name: "Tactical", pos: [52.5, -58, 74], at: [52.5, 36, 0], fov: 1.32 },
    goal: { name: "Behind goal", pos: [-16, 30, 7], at: [30, 36, 0], fov: 1.5 },
    iso: { name: "Isolation", pos: [4, 14, 6], at: [16, 36, 1], fov: 2.6 },
    reverse: { name: "Reverse", pos: [40, 106, 20], at: [26, 34, 0], fov: 1.6 },
  };

  function camera(c) {
    const f = norm(sub(c.at, c.pos));
    const r = norm(cross(f, [0, 0, 1]));
    const u = cross(r, f);
    const k = W * c.fov * 0.5;
    const P = (p) => {
      const d = sub(p, c.pos);
      const z = dot(d, f);
      if (z < 0.5) return null;
      return [W / 2 + (k * dot(d, r)) / z, H / 2 - (k * dot(d, u)) / z, z];
    };
    // Camera-space depth, used to clip polygons at the near plane.
    P.depth = (p) => dot(sub(p, c.pos), f);
    return P;
  }

  const poly = (P, pts, attrs) => {
    const near = 0.6, out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const da = P.depth(a) - near, db = P.depth(b) - near;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
    }
    if (out.length < 3) return "";
    const q = out.map(P);
    if (q.some((v) => !v)) return "";
    return `<polygon points="${q.map((v) => v[0].toFixed(1) + "," + v[1].toFixed(1)).join(" ")}" ${attrs}/>`;
  };
  const line = (P, pts, attrs) => {
    const q = pts.map(P).filter(Boolean);
    return q.length > 1 ? `<polyline points="${q.map((v) => v[0].toFixed(1) + "," + v[1].toFixed(1)).join(" ")}" fill="none" ${attrs}/>` : "";
  };
  const seg = (a, b, n = 24) => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, 0]);
  const arc = (cx, cy, rad, a0, a1, n = 48) => Array.from({ length: n + 1 }, (_, i) => {
    const t = a0 + ((a1 - a0) * i) / n;
    return [cx + rad * Math.cos(t), cy + rad * Math.sin(t), 0];
  });

  window.camView = (key, { players = window.DOTS3, ball = [13, 35.6] } = {}) => {
    const c = CAMS[key];
    const P = camera(c);
    let s = `<svg class="cam" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">`;
    // Stands: a dark bowl behind the pitch, then the floodlit grass.
    s += `<rect width="${W}" height="${H}" fill="#0c100f"/>`;
    s += poly(P, [[-30, -30, 0], [135, -30, 0], [135, 98, 0], [-30, 98, 0]], `fill="#16231c"`);
    for (const [y0, y1, z] of [[-30, -12, 9], [80, 98, 9]]) s += poly(P, [[-30, y0, 0], [135, y0, 0], [135, y0, z], [-30, y0, z]], `fill="#121815"`);
    s += poly(P, [[-30, 98, 0], [-30, 98, 14], [135, 98, 14], [135, 98, 0]], `fill="#141b18"`);
    for (let i = 0; i < 14; i++) {
      const x0 = -4 + i * 8.07, x1 = x0 + 8.07;
      s += poly(P, [[x0, -4, 0], [x1, -4, 0], [x1, 72, 0], [x0, 72, 0]], `fill="${i % 2 ? "#1c3a2b" : "#1f402f"}"`);
    }
    const L = `stroke="rgba(236,242,239,.78)" stroke-width="2.2" stroke-linejoin="round"`;
    s += line(P, [...seg([0, 0], [105, 0]), ...seg([105, 0], [105, 68]).slice(1), ...seg([105, 68], [0, 68]).slice(1), ...seg([0, 68], [0, 0]).slice(1)], L);
    s += line(P, seg([52.5, 0], [52.5, 68]), L) + line(P, arc(52.5, 34, 9.15, 0, Math.PI * 2), L);
    for (const [x0, dx] of [[0, 1], [105, -1]]) {
      s += line(P, [...seg([x0, 13.84], [x0 + 16.5 * dx, 13.84], 8), ...seg([x0 + 16.5 * dx, 13.84], [x0 + 16.5 * dx, 54.16], 16).slice(1), ...seg([x0 + 16.5 * dx, 54.16], [x0, 54.16], 8).slice(1)], L);
      s += line(P, [...seg([x0, 24.84], [x0 + 5.5 * dx, 24.84], 4), ...seg([x0 + 5.5 * dx, 24.84], [x0 + 5.5 * dx, 43.16], 8).slice(1), ...seg([x0 + 5.5 * dx, 43.16], [x0, 43.16], 4).slice(1)], L);
      s += line(P, arc(x0 + 11 * dx, 34, 9.15, dx > 0 ? -0.93 : Math.PI - 0.93, dx > 0 ? 0.93 : Math.PI + 0.93, 16), L);
      // Goal frame
      const g = [[x0, 30.34, 0], [x0, 30.34, 2.44], [x0, 37.66, 2.44], [x0, 37.66, 0]];
      s += line(P, g, `stroke="#f3f5f4" stroke-width="3.2"`);
      s += poly(P, [[x0, 30.34, 2.44], [x0, 37.66, 2.44], [x0 - 2 * dx, 37.66, 1.6], [x0 - 2 * dx, 30.34, 1.6]], `fill="rgba(243,245,244,.12)"`);
    }
    // Players far to near so nearer bodies overlap farther ones.
    const bodies = players.map(([side, n, x, y, hot]) => ({ side, n, x, y, hot, foot: P([x, y, 0]) })).filter((b) => b.foot).sort((a, b) => b.foot[2] - a.foot[2]);
    for (const b of bodies) {
      const head = P([b.x, b.y, 1.82]);
      const hip = P([b.x, b.y, 0.95]);
      if (!head || !hip) continue;
      const h = b.foot[1] - head[1];
      const w = Math.max(3, h * 0.3);
      const col = window.S[b.side].color;
      s += `<ellipse cx="${b.foot[0]}" cy="${b.foot[1]}" rx="${w * 0.8}" ry="${w * 0.22}" fill="rgba(0,0,0,.35)"/>`;
      if (b.hot) s += `<ellipse cx="${b.foot[0]}" cy="${b.foot[1]}" rx="${w * 1.5}" ry="${w * 0.42}" fill="none" stroke="#f3f5f4" stroke-width="${Math.max(1, w * 0.07)}" stroke-dasharray="${w * 0.25} ${w * 0.18}"/>`;
      s += `<rect x="${b.foot[0] - w * 0.36}" y="${hip[1]}" width="${w * 0.72}" height="${b.foot[1] - hip[1]}" rx="${w * 0.2}" fill="#101614"/>`;
      s += `<rect x="${b.foot[0] - w / 2}" y="${head[1] + h * 0.14}" width="${w}" height="${hip[1] - head[1] - h * 0.1}" rx="${w * 0.3}" fill="${col}"/>`;
      s += `<circle cx="${head[0]}" cy="${head[1] + h * 0.06}" r="${h * 0.075}" fill="#c9a98a"/>`;
      if (h > 46) s += `<text x="${b.foot[0]}" y="${head[1] + h * 0.42}" fill="#fff" text-anchor="middle" style="font:800 ${h * 0.2}px Archivo">${b.n}</text>`;
    }
    const bf = P([ball[0], ball[1], 0.11]);
    if (bf) { const br = Math.max(2.5, (W * c.fov * 0.5 * 0.11) / bf[2]); s += `<circle cx="${bf[0]}" cy="${bf[1]}" r="${br}" fill="#fff" stroke="#0a0d0c" stroke-width="1"/>`; }
    // Floodlight falloff
    s += `<defs><radialGradient id="v${key}" cx="50%" cy="60%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".45"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#v${key})"/>`;
    return s + `</svg>`;
  };
  window.CAMS = CAMS;
  window.DOTS3 = [
    ["home", 1, 6, 34], ["home", 2, 22, 58], ["home", 4, 20, 40], ["home", 5, 21, 26], ["home", 3, 24, 10],
    ["home", 8, 38, 40], ["home", 6, 36, 24], ["home", 10, 52, 34], ["home", 7, 58, 56], ["home", 11, 58, 12], ["home", 9, 66, 34],
    ["away", 1, 99, 34], ["away", 2, 72, 60], ["away", 5, 84, 40], ["away", 4, 84, 26], ["away", 3, 76, 8],
    ["away", 8, 56, 44], ["away", 6, 62, 24], ["away", 21, 18, 30], ["away", 7, 40, 54], ["away", 11, 44, 14], ["away", 9, 14, 36, true],
  ];
})();
