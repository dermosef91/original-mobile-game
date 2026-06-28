/* ============================================================
   RADIAN — a one-thumb polar-cursor ROGUELITE.

   Core: a beam sweeps around the pulsar on its own (your ANGLE).
   Hold to push the glowing tip outward, release to retract (your
   RADIUS). Thread the tip through light orbs, avoid the red ones.

   Roguelite layer: each run is a series of escalating SECTORS. Fill a
   sector's light quota, then DRAFT one of three relics. Relics stack
   and combine — extra beams, arc-chains, shockwaves, echo tips,
   time-dilation, gravity wells — into emergent build engines. Lose all
   your Integrity and the run ends.
   ============================================================ */
(() => {
  "use strict";

  // ---- Canvas / sizing -------------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  let cx = 0, cy = 0, maxR = 120, minR = 34;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx = W / 2;
    cy = H / 2;
    maxR = Math.min(W, H) * 0.42;
    minR = Math.max(28, maxR * 0.16);
    buildStars();
    buildNebula();
  }
  window.addEventListener("resize", resize);

  // ---- Persistence -----------------------------------------------------
  const BEST_KEY = "radian.best";
  const SECT_KEY = "radian.sector";
  const SND_KEY = "radian.sound";
  let best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0;
  let bestSector = parseInt(localStorage.getItem(SECT_KEY) || "0", 10) || 0;
  let soundOn = localStorage.getItem(SND_KEY) !== "off";

  // ---- Sound (WebAudio, synthesized) -----------------------------------
  let actx = null, master = null;
  function initAudio() {
    if (actx) return;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain();
      master.gain.value = 0.3;
      master.connect(actx.destination);
    } catch (e) { actx = null; }
  }
  function blip(freq, dur, type, vol, glideTo) {
    if (!soundOn || !actx) return;
    const t = actx.currentTime;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function sndCollect(combo) { const b = 520 + Math.min(combo, 28) * 24; blip(b, 0.14, "triangle", 0.26, b * 1.5); }
  function sndGold() { [660, 880, 1320].forEach((f, i) => setTimeout(() => blip(f, 0.16, "square", 0.16), i * 50)); }
  function sndPrism() { [520, 740, 990, 1240].forEach((f, i) => setTimeout(() => blip(f, 0.14, "sine", 0.16), i * 45)); }
  function sndHazard() { blip(150, 0.3, "sawtooth", 0.32, 60); }
  function sndExpire() { blip(240, 0.12, "sine", 0.12, 170); }
  function sndShock() { blip(320, 0.3, "sine", 0.2, 90); }
  function sndSector() { [440, 587, 740, 880].forEach((f, i) => setTimeout(() => blip(f, 0.2, "triangle", 0.2), i * 70)); }
  function sndDraft() { blip(700, 0.16, "square", 0.18, 1100); }
  function sndOver() { [440, 330, 220, 150].forEach((f, i) => setTimeout(() => blip(f, 0.3, "triangle", 0.24), i * 120)); }
  function vibrate(p) { if (navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } }

  // ---- Background: nebula + parallax starfield --------------------------
  let stars = [], nebula = [], shootTimer = 4, shootStars = [];
  function buildStars() {
    stars = [];
    const n = Math.round((W * H) / 7000);
    for (let i = 0; i < n; i++) {
      const far = Math.random() < 0.6;
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: far ? Math.random() * 0.9 + 0.2 : Math.random() * 1.6 + 0.6,
        a: far ? Math.random() * 0.4 + 0.1 : Math.random() * 0.6 + 0.25,
        tw: Math.random() * Math.PI * 2, ts: Math.random() * 1.6 + 0.4,
        vy: far ? 1.5 : 4, // parallax drift speed (px/s)
      });
    }
  }
  function buildNebula() {
    nebula = [
      { x: W * 0.25, y: H * 0.3, r: Math.max(W, H) * 0.5, hue: 195, drift: 0.5, t: 0 },
      { x: W * 0.75, y: H * 0.7, r: Math.max(W, H) * 0.55, hue: 305, drift: 0.4, t: 2 },
    ];
  }

  // ---- Relics ----------------------------------------------------------
  // Each relic mutates the `mods` object. Calling apply() N times = N stacks.
  const RAR = { common: "common", uncommon: "uncommon", rare: "rare" };
  const RELICS = {
    twinBeam:    { name: "Twin Beam",   icon: "🌗", rar: RAR.common,   max: 4, desc: "Add an extra beam, evenly spaced.", apply: m => m.beams += 1 },
    longReach:   { name: "Long Reach",  icon: "📡", rar: RAR.common,   max: 3, desc: "Extend faster and reach farther.", apply: m => { m.reachMul *= 1.3; } },
    magnet:      { name: "Magnet Tip",  icon: "🧲", rar: RAR.common,   max: 3, desc: "Larger collection radius.", apply: m => m.tipMul *= 1.45 },
    comboEngine: { name: "Combo Engine",icon: "⚡", rar: RAR.common,   max: 3, desc: "Multiplier climbs faster.", apply: m => m.comboDiv = Math.max(2, m.comboDiv - 1) },
    starForge:   { name: "Star Forge",  icon: "✨", rar: RAR.common,   max: 4, desc: "+25% score from everything.", apply: m => m.scoreMul *= 1.25 },
    aegis:       { name: "Aegis",       icon: "🛡️", rar: RAR.common,   max: 3, desc: "+1 max Integrity, and restore one.", apply: m => m.maxLives += 1 },
    arcChain:    { name: "Arc Chain",   icon: "🔗", rar: RAR.uncommon, max: 3, desc: "Collecting arcs to a nearby light.", apply: m => m.chain += 1 },
    overcharge:  { name: "Overcharge",  icon: "💥", rar: RAR.uncommon, max: 2, desc: "Every few collects, a shockwave sweeps the field.", apply: m => m.shockEvery = m.shockEvery ? Math.max(4, m.shockEvery - 3) : 9 },
    timeDilation:{ name: "Time Dilation",icon: "🕳️", rar: RAR.uncommon, max: 2, desc: "Slow the sweep, +30% score.", apply: m => { m.speedMul *= 0.82; m.scoreMul *= 1.3; } },
    goldRush:    { name: "Gold Rush",   icon: "🪙", rar: RAR.uncommon, max: 2, desc: "More gold, worth far more.", apply: m => { m.goldChance += 0.06; m.goldMul *= 1.6; } },
    prismLens:   { name: "Prism Lens",  icon: "🔺", rar: RAR.uncommon, max: 2, desc: "Prisms appear more; they shatter into lights.", apply: m => m.prismChance += 0.07 },
    novaCore:    { name: "Nova Core",   icon: "🌟", rar: RAR.uncommon, max: 2, desc: "The core pulses a clearing nova on a timer.", apply: m => m.novaEvery = m.novaEvery ? Math.max(3, m.novaEvery - 1.5) : 7 },
    phaseWard:   { name: "Phase Ward",  icon: "👻", rar: RAR.uncommon, max: 3, desc: "+25% chance to phase through a hazard.", apply: m => m.ward = Math.min(0.85, m.ward + 0.25) },
    recoil:      { name: "Recoil Pulse",icon: "🌀", rar: RAR.uncommon, max: 1, desc: "Snap-retracting from far out emits a clearing pulse.", apply: m => m.recoil = true },
    splitter:    { name: "Splitter",    icon: "🔱", rar: RAR.rare,     max: 2, desc: "Each tip splits into more collection points.", apply: m => m.split += 2 },
    echoTip:     { name: "Echo Tip",    icon: "👁️", rar: RAR.rare,     max: 2, desc: "A trailing phantom tip also collects.", apply: m => m.echo += 1 },
    trident:     { name: "Trident",     icon: "🔱", rar: RAR.rare,     max: 1, desc: "Add two extra beams at once.", apply: m => m.beams += 2 },
    gravity:     { name: "Gravity Well",icon: "🌌", rar: RAR.rare,     max: 1, desc: "Lights drift toward your tip's radius.", apply: m => m.gravity = 1 },
  };
  const RAR_COLOR = { common: "#8fb6c9", uncommon: "#58e0a0", rare: "#b98bff" };
  const RAR_WEIGHT = { common: 60, uncommon: 30, rare: 10 };

  function defaultMods() {
    return {
      beams: 1, reachMul: 1, tipMul: 1, comboDiv: 5, scoreMul: 1,
      chain: 0, shockEvery: 0, echo: 0, speedMul: 1,
      goldChance: 0.05, goldMul: 1, prismChance: 0, novaEvery: 0,
      ward: 0, gravity: 0, split: 1, recoil: false, maxLives: 3,
    };
  }
  let mods = defaultMods();
  let owned = {};      // id -> count
  let ownedOrder = []; // ids in draft order

  function recomputeMods() {
    mods = defaultMods();
    for (const id of ownedOrder) {
      const c = owned[id];
      for (let i = 0; i < c; i++) RELICS[id].apply(mods);
    }
    if (mods.beams > 6) mods.beams = 6;
    if (mods.split > 5) mods.split = 5;
  }

  // ---- Game state ------------------------------------------------------
  const STATE = { TITLE: 0, PLAY: 1, DRAFT: 2, OVER: 3 };
  let state = STATE.TITLE;
  const ORB = { LIGHT: 0, HAZARD: 1, GOLD: 2, PRISM: 3 };

  let beamAngle = 0, beamSpeed = 1.05, tipR = 0, holding = false;
  let prevTipR = 0, releasedFast = false;
  let tips = [];          // current collector points (for collision + render)
  let beamLines = [];     // base tip per beam (for drawing the beam line)

  let orbs = [], particles = [], popups = [], bolts = [], rings = [];

  let score = 0, displayScore = 0, lives = 3, combo = 0, bestCombo = 0;
  let collected = 0, totalCollected = 0, sector = 1;
  let sectorProgress = 0, sectorQuota = 8;
  let spawnTimer = 0, shake = 0, flash = 0, healFlash = 0;
  let timeAlive = 0, pulse = 0, shockCount = 0, novaTimer = 0;

  // Tuning
  const ORB_R = 13, COLLECT_DIST = 25, ECHO_LAG = 0.42, SPLIT_ARC = 0.17;
  const MAX_PARTICLES = 280;

  function startRun() {
    initAudio();
    if (actx && actx.state === "suspended") actx.resume();
    owned = {}; ownedOrder = []; recomputeMods();
    beamAngle = -Math.PI / 2;
    tipR = minR; prevTipR = minR;
    holding = false;
    orbs = []; particles = []; popups = []; bolts = []; rings = [];
    score = 0; displayScore = 0; combo = 0; bestCombo = 0;
    collected = 0; totalCollected = 0;
    sector = 1; lives = mods.maxLives;
    timeAlive = 0; shake = 0; flash = 0; healFlash = 0;
    shockCount = 0; novaTimer = 0;
    beginSector();
    state = STATE.PLAY;
    titleScreen.classList.add("hidden");
    overScreen.classList.add("hidden");
    draftScreen.classList.add("hidden");
    hud.classList.remove("hidden");
    syncHUD();
  }

  function beginSector() {
    sectorQuota = 7 + sector * 2 + Math.floor(sector / 5) * 3;
    sectorProgress = 0;
    spawnTimer = 0.5;
    orbs = orbs.filter(o => false); // clear leftovers
    const surge = sector % 5 === 0;
    showBanner((surge ? "SURGE " : "SECTOR ") + sector, surge ? "denser · faster · richer" : "collect " + sectorQuota + " light");
    sndSector();
  }

  function clearSector() {
    sndSector();
    // partial heal as a reward, capped
    if (lives < mods.maxLives) { lives = Math.min(mods.maxLives, lives + 1); healFlash = 1; }
    state = STATE.DRAFT;
    holding = false;
    openDraft();
  }

  // ---- Spawning --------------------------------------------------------
  function curHazardChance() { return Math.min(0.4, 0.05 + sector * 0.026) * (sector % 5 === 0 ? 1.25 : 1); }
  function maxOrbs() { return Math.min(12, 6 + Math.floor(sector / 2)); }
  function spawnInterval() { return Math.max(0.42, 1.25 - sector * 0.05) * (sector % 5 === 0 ? 0.8 : 1); }

  function spawnOrb() {
    if (orbs.length >= maxOrbs()) return;
    let ang, tries = 0;
    do { ang = Math.random() * Math.PI * 2; tries++; }
    while (tries < 6 && angDist(ang, beamAngle) < 0.7);
    const r = minR + Math.random() * (maxR - minR);

    let type = ORB.LIGHT;
    const roll = Math.random();
    const pPrism = mods.prismChance + (sector >= 4 ? 0.02 : 0);
    const pHaz = curHazardChance();
    const pGold = mods.goldChance;
    if (roll < pPrism) type = ORB.PRISM;
    else if (roll < pPrism + pHaz) type = ORB.HAZARD;
    else if (roll < pPrism + pHaz + pGold) type = ORB.GOLD;

    const ttl = type === ORB.HAZARD ? 5 : Math.max(2.4, 4 - sector * 0.1);
    const drift = (sector >= 3 && Math.random() < 0.28)
      ? (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35) : 0;
    orbs.push({ type, r, ang, drift, ttl, maxTtl: ttl, pop: 0, pulse: Math.random() * 6.28, spin: Math.random() * 6.28 });
  }

  function spawnMini(r, ang, count) {
    for (let i = 0; i < count; i++) {
      const a = ang + (Math.random() - 0.5) * 0.8;
      const rr = Math.max(minR, Math.min(maxR, r + (Math.random() - 0.5) * 60));
      orbs.push({ type: ORB.LIGHT, r: rr, ang: a, drift: 0, ttl: 3, maxTtl: 3, pop: 0, pulse: Math.random() * 6.28, spin: 0, mini: true });
    }
  }

  // ---- Helpers ---------------------------------------------------------
  function angDist(a, b) { let d = Math.abs(a - b) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d; return d; }
  function orbXY(o) { return [cx + Math.cos(o.ang) * o.r, cy + Math.sin(o.ang) * o.r]; }
  function orbColor(t) { return t === ORB.HAZARD ? "#ff4d5e" : t === ORB.GOLD ? "#ffd24a" : t === ORB.PRISM ? "#ff4ddb" : "#46e8ff"; }
  function multiplier() { return 1 + Math.floor(combo / mods.comboDiv); }

  function burst(x, y, color, n, power) {
    for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2, sp = Math.random() * power + power * 0.3;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: Math.random() * 1.4 + 0.9, r: Math.random() * 2.4 + 1.2, color });
    }
  }
  function addPopup(x, y, text, color) { popups.push({ x, y, text, color, life: 1 }); }
  function spawnRing(rx, ry, maxRad, color) { rings.push({ x: rx, y: ry, r: 6, maxR: maxRad, life: 1, color }); sndShock(); }

  // ---- Collector geometry ----------------------------------------------
  function computeTips() {
    tips = []; beamLines = [];
    const beams = mods.beams;
    const cr = COLLECT_DIST * mods.tipMul;
    for (let b = 0; b < beams; b++) {
      const base = beamAngle + b * (Math.PI * 2 / beams);
      beamLines.push([cx + Math.cos(base) * tipR, cy + Math.sin(base) * tipR, base]);
      for (let e = 0; e <= mods.echo; e++) {
        const ang = base - e * ECHO_LAG;
        const dim = e > 0;
        if (mods.split > 1) {
          for (let s = 0; s < mods.split; s++) {
            const off = (s - (mods.split - 1) / 2) * SPLIT_ARC;
            pushTip(ang + off, dim ? cr * 0.8 : cr, dim);
          }
        } else pushTip(ang, dim ? cr * 0.8 : cr, dim);
      }
    }
  }
  function pushTip(ang, cr, dim) { tips.push({ x: cx + Math.cos(ang) * tipR, y: cy + Math.sin(ang) * tipR, cr, dim }); }

  // ---- Collection ------------------------------------------------------
  function checkCollisions() {
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      if (o.pop < 0.35) continue;
      const [ox, oy] = orbXY(o);
      let hit = false;
      for (const t of tips) { if (Math.hypot(t.x - ox, t.y - oy) < t.cr) { hit = true; break; } }
      if (!hit) continue;
      if (o.type === ORB.HAZARD) hitHazard(o, ox, oy);
      else { orbs.splice(i, 1); collect(o, ox, oy); }
    }
  }

  function collect(o, x, y, fromChain) {
    combo++; if (combo > bestCombo) bestCombo = combo;
    collected++; totalCollected++;
    const mult = multiplier();
    let base = 10;
    if (o.type === ORB.GOLD) base = 75 * mods.goldMul;
    else if (o.type === ORB.PRISM) base = 50;
    const gained = Math.round(base * mult * mods.scoreMul);
    score += gained;
    sectorProgress++;

    if (o.type === ORB.GOLD) { burst(x, y, "#ffd24a", 22, 230); addPopup(x, y, "+" + gained, "#ffd24a"); sndGold(); vibrate([10, 24, 10]); }
    else if (o.type === ORB.PRISM) { burst(x, y, "#ff4ddb", 26, 240); addPopup(x, y, "+" + gained, "#ff4ddb"); spawnMini(o.r, o.ang, 3); sndPrism(); vibrate([8, 18, 8]); }
    else { burst(x, y, "#46e8ff", 12, 160); if (!fromChain) sndCollect(combo); vibrate(6); }

    // Overcharge shockwaves
    if (mods.shockEvery && o.type !== ORB.PRISM) { shockCount++; if (shockCount >= mods.shockEvery) { shockCount = 0; spawnRing(cx, cy, maxR + 30, "#46e8ff"); } }

    // Arc-chain to nearby lights
    if (mods.chain && o.type !== ORB.HAZARD && !fromChain) chainFrom(x, y, mods.chain);

    showCombo();
    syncHUD();
    if (state === STATE.PLAY && sectorProgress >= sectorQuota) clearSector();
  }

  function chainFrom(x, y, jumps) {
    let sx = x, sy = y, left = jumps;
    while (left > 0) {
      let bestI = -1, bestD = 170;
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i];
        if (o.type === ORB.HAZARD || o.pop < 0.35) continue;
        const [ox, oy] = orbXY(o);
        const d = Math.hypot(sx - ox, sy - oy);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      if (bestI < 0) break;
      const o = orbs[bestI];
      const [ox, oy] = orbXY(o);
      bolts.push({ x1: sx, y1: sy, x2: ox, y2: oy, life: 1 });
      orbs.splice(bestI, 1);
      collect(o, ox, oy, true);
      sx = ox; sy = oy; left--;
    }
  }

  function hitHazard(o, x, y) {
    if (mods.ward && Math.random() < mods.ward) {
      // phased through
      const idx = orbs.indexOf(o); if (idx >= 0) orbs.splice(idx, 1);
      burst(x, y, "#b98bff", 16, 180); addPopup(x, y, "PHASE", "#b98bff"); blip(900, 0.12, "sine", 0.16, 1400);
      return;
    }
    const idx = orbs.indexOf(o); if (idx >= 0) orbs.splice(idx, 1);
    lives--; combo = 0; shake = 16; flash = 1;
    burst(x, y, "#ff4d5e", 28, 250); sndHazard(); vibrate(60);
    hideCombo(); syncHUD();
    if (lives <= 0) gameOver();
  }

  // ---- Update ----------------------------------------------------------
  function update(dt) {
    timeAlive += dt; pulse += dt * 3;
    novaTimer += dt;

    // shooting stars (all states)
    shootTimer -= dt;
    if (shootTimer <= 0) { shootTimer = 4 + Math.random() * 6; spawnShootingStar(); }
    for (let i = shootStars.length - 1; i >= 0; i--) { const s = shootStars[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 0.6; if (s.life <= 0) shootStars.splice(i, 1); }

    if (state !== STATE.PLAY) { beamAngle += 0.35 * dt; updateParticles(dt); updateRings(dt); return; }

    beamSpeed = (1.0 + sector * 0.055) * mods.speedMul;
    if (beamSpeed > 2.6) beamSpeed = 2.6;
    beamAngle += beamSpeed * dt;
    if (beamAngle > Math.PI * 2) beamAngle -= Math.PI * 2;

    // Tip radius
    const span = maxR - minR;
    prevTipR = tipR;
    if (holding) tipR += 2.6 * mods.reachMul * span * dt;
    else tipR -= 3.0 * span * dt;
    if (tipR > maxR) tipR = maxR;
    if (tipR < minR) tipR = minR;

    computeTips();

    // Nova core
    if (mods.novaEvery && novaTimer >= mods.novaEvery) { novaTimer = 0; spawnRing(cx, cy, maxR + 30, "#9af0ff"); }

    // Spawning
    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawnOrb(); spawnTimer = spawnInterval(); }

    // Orb lifecycle
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      o.ttl -= dt; o.pop = Math.min(1, o.pop + dt * 5); o.pulse += dt * 4; o.spin += dt * 1.5;
      if (o.drift) o.ang += o.drift * dt;
      if (mods.gravity && o.type !== ORB.HAZARD) {
        const target = tipR, d = target - o.r, step = 26 * dt;
        o.r += Math.abs(d) < step ? d : Math.sign(d) * step;
      }
      if (o.ttl <= 0) {
        if (o.type === ORB.LIGHT && combo > 0 && !o.mini) { combo = 0; hideCombo(); sndExpire(); syncHUD(); }
        orbs.splice(i, 1);
      }
    }

    checkCollisions();
    updateParticles(dt);
    updateRings(dt);
    for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].life -= dt * 3; if (bolts[i].life <= 0) bolts.splice(i, 1); }

    // Recoil pulse on fast retract from far out
    if (mods.recoil && !holding && prevTipR > maxR * 0.6 && (prevTipR - tipR) > span * 0.04) {
      if (!releasedFast) { releasedFast = true; const a = beamAngle; spawnRing(cx + Math.cos(a) * tipR, cy + Math.sin(a) * tipR, 160, "#46e8ff"); }
    }
    if (holding) releasedFast = false;

    displayScore += (score - displayScore) * Math.min(1, dt * 12);
    scoreEl.textContent = Math.round(displayScore);
    if (shake > 0) shake = Math.max(0, shake - dt * 60);
    if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
    if (healFlash > 0) healFlash = Math.max(0, healFlash - dt * 1.5);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.y -= 40 * dt; p.life -= dt * 1.3; if (p.life <= 0) popups.splice(i, 1); }
  }
  function updateRings(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      const prev = r.r;
      r.r += (r.maxR) * dt * 1.6;
      r.life -= dt * 1.1;
      // collect lights the expanding ring passes (PLAY only)
      if (state === STATE.PLAY) {
        for (let j = orbs.length - 1; j >= 0; j--) {
          const o = orbs[j];
          if (o.type === ORB.HAZARD || o.pop < 0.35) continue;
          const [ox, oy] = orbXY(o); const d = Math.hypot(r.x - ox, r.y - oy);
          if (d >= prev - 18 && d <= r.r + 18) { orbs.splice(j, 1); collect(o, ox, oy, true); }
        }
      }
      if (r.life <= 0 || r.r > r.maxR) rings.splice(i, 1);
    }
  }
  function spawnShootingStar() {
    const edge = Math.random();
    const x = Math.random() * W, y = -20;
    const ang = Math.PI * (0.35 + Math.random() * 0.3);
    shootStars.push({ x, y, vx: Math.cos(ang) * 380, vy: Math.sin(ang) * 380, life: 1 });
  }

  // ---- Render ----------------------------------------------------------
  function render() {
    ctx.clearRect(0, 0, W, H);
    // base gradient
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.72);
    bg.addColorStop(0, "#0a1020"); bg.addColorStop(1, "#05060d");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // nebula
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const nb of nebula) {
      nb.t += 0.0016;
      const nx = nb.x + Math.cos(nb.t * nb.drift) * 40;
      const ny = nb.y + Math.sin(nb.t * nb.drift * 1.3) * 40;
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nb.r);
      g.addColorStop(0, `hsla(${nb.hue},80%,55%,0.10)`);
      g.addColorStop(0.5, `hsla(${nb.hue},80%,50%,0.04)`);
      g.addColorStop(1, "hsla(0,0%,0%,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(nx, ny, nb.r, 0, 6.2832); ctx.fill();
    }
    ctx.restore();

    // stars (parallax drift + twinkle)
    for (const s of stars) {
      s.tw += 0.016 * s.ts; s.y += s.vy * 0.016; if (s.y > H + 2) { s.y = -2; s.x = Math.random() * W; }
      ctx.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(s.tw));
      ctx.fillStyle = "#bfe9ff"; ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // shooting stars
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const s of shootStars) {
      ctx.globalAlpha = Math.max(0, s.life);
      const tx = s.x - s.vx * 0.06, ty = s.y - s.vy * 0.06;
      const g = ctx.createLinearGradient(s.x, s.y, tx, ty);
      g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;

    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    drawArena();
    drawRings();
    drawOrbs();
    drawBeam();
    drawBolts();
    drawParticles();
    drawPopups();

    ctx.restore();

    if (flash > 0) vignette("255,77,94", flash * 0.5);
    if (healFlash > 0) vignette("88,224,160", healFlash * 0.35);
  }

  function vignette(rgb, a) {
    const v = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.2, cx, cy, Math.max(W, H) * 0.72);
    v.addColorStop(0, `rgba(${rgb},0)`); v.addColorStop(1, `rgba(${rgb},${a})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  function drawArena() {
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.arc(cx, cy, minR + (maxR - minR) * (i / 3), 0, 6.2832);
      ctx.strokeStyle = "rgba(70,232,255,0.06)"; ctx.stroke();
    }
    // boundary ring
    ctx.beginPath(); ctx.arc(cx, cy, maxR, 0, 6.2832);
    ctx.strokeStyle = "rgba(70,232,255,0.16)"; ctx.lineWidth = 1.5; ctx.stroke();

    // sector progress arc on the boundary
    if (state === STATE.PLAY || state === STATE.DRAFT) {
      const frac = Math.min(1, sectorProgress / sectorQuota);
      if (frac > 0) {
        const start = -Math.PI / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR, start, start + frac * 6.2832);
        ctx.strokeStyle = sector % 5 === 0 ? "#ffd24a" : "#46e8ff";
        ctx.lineWidth = 4; ctx.lineCap = "round";
        ctx.shadowBlur = 12; ctx.shadowColor = ctx.strokeStyle;
        ctx.stroke(); ctx.shadowBlur = 0; ctx.lineCap = "butt";
      }
    }

    // ticks
    ctx.strokeStyle = "rgba(111,129,152,0.22)"; ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 6.2832, inner = maxR - (i % 6 === 0 ? 12 : 6);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR); ctx.stroke();
    }

    // pulsar core — hue shifts toward gold with multiplier
    const m = multiplier();
    const t = Math.min(1, (m - 1) / 6);
    const coreCol = state === STATE.PLAY ? lerpColor([70, 232, 255], [255, 210, 74], t) : [70, 232, 255];
    const throb = 1 + Math.sin(pulse) * 0.12;
    const coreR = minR * 0.5 * throb;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.6);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.4, `rgba(${coreCol[0]},${coreCol[1]},${coreCol[2]},0.55)`);
    grad.addColorStop(1, `rgba(${coreCol[0]},${coreCol[1]},${coreCol[2]},0)`);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, coreR * 2.6, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "#eafcff"; ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, 6.2832); ctx.fill();
  }

  function drawRings() {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const r of rings) {
      ctx.globalAlpha = Math.max(0, r.life) * 0.7;
      ctx.strokeStyle = r.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.2832); ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawOrbs() {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const o of orbs) {
      const [x, y] = orbXY(o);
      const col = orbColor(o.type);
      const fade = o.ttl < 0.9 ? Math.max(0.2, o.ttl / 0.9) : 1;
      const grow = o.pop * (1 + Math.sin(o.pulse) * 0.08);
      const rr = ORB_R * grow * (o.mini ? 0.7 : 1);

      const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 2.6);
      g.addColorStop(0, hexA(col, 0.9 * fade)); g.addColorStop(0.5, hexA(col, 0.34 * fade)); g.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr * 2.6, 0, 6.2832); ctx.fill();

      if (o.type === ORB.GOLD) { drawStar(x, y, rr * 1.1, rr * 0.5, 5, o.spin, "#fff", fade); }
      else if (o.type === ORB.PRISM) { drawPoly(x, y, rr * 1.15, 3, o.spin, fade, col); }
      else {
        ctx.globalAlpha = fade; ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(x, y, rr * 0.5, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
      }
      if (o.type === ORB.HAZARD) {
        ctx.strokeStyle = hexA(col, fade); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, rr * (1.3 + Math.sin(o.pulse) * 0.12), 0, 6.2832); ctx.stroke();
      }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawStar(x, y, R, r, pts, rot, fill, alpha) {
    ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) { const rad = i % 2 ? r : R; const a = rot + i * Math.PI / pts; ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  }
  function drawPoly(x, y, R, sides, rot, alpha, col) {
    ctx.globalAlpha = alpha; ctx.strokeStyle = "#fff"; ctx.fillStyle = hexA(col, 0.5); ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) { const a = rot + i * (6.2832 / sides) - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
  }

  function drawBeam() {
    const m = multiplier(), t = Math.min(1, (m - 1) / 6);
    const tipCol = lerpColor([154, 240, 255], [255, 220, 120], t);
    const tipStr = `rgb(${tipCol[0]},${tipCol[1]},${tipCol[2]})`;
    ctx.save(); ctx.globalCompositeOperation = "lighter";

    // beam lines + full-length faint guides
    for (const bl of beamLines) {
      const [tx, ty, ang] = bl;
      ctx.strokeStyle = "rgba(70,232,255,0.05)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * maxR, cy + Math.sin(ang) * maxR); ctx.stroke();
      const grad = ctx.createLinearGradient(cx, cy, tx, ty);
      grad.addColorStop(0, "rgba(70,232,255,0.12)"); grad.addColorStop(1, hexA(tipStr, 0.95));
      ctx.strokeStyle = grad; ctx.lineWidth = 3.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
    }

    // collector tips
    for (const tp of tips) {
      const R = 9 * (tp.dim ? 0.7 : 1);
      const a = tp.dim ? 0.55 : 1;
      const tg = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, R * 3);
      tg.addColorStop(0, `rgba(255,255,255,${a})`); tg.addColorStop(0.4, hexA(tipStr, 0.8 * a)); tg.addColorStop(1, hexA(tipStr, 0));
      ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(tp.x, tp.y, R * 3, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = a; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(tp.x, tp.y, R * 0.7, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawBolts() {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const b of bolts) {
      ctx.globalAlpha = Math.max(0, b.life); ctx.strokeStyle = "#9af0ff"; ctx.lineWidth = 2; ctx.shadowBlur = 8; ctx.shadowColor = "#46e8ff";
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1);
      const mx = (b.x1 + b.x2) / 2 + (Math.random() - 0.5) * 16, my = (b.y1 + b.y2) / 2 + (Math.random() - 0.5) * 16;
      ctx.quadraticCurveTo(mx, my, b.x2, b.y2); ctx.stroke(); ctx.shadowBlur = 0;
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawParticles() {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, 6.2832); ctx.fill(); }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function drawPopups() {
    ctx.save(); ctx.textAlign = "center"; ctx.font = "700 20px Segoe UI, system-ui, sans-serif";
    for (const p of popups) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y); }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function hexA(c, a) {
    if (c[0] === "#") { const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})`; }
    return c.replace("rgb(", "rgba(").replace(")", `,${a})`);
  }
  function lerpColor(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }

  // ---- DOM / UI --------------------------------------------------------
  const hud = document.getElementById("hud");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const multEl = document.getElementById("mult");
  const sectorEl = document.getElementById("sector");
  const livesEl = document.getElementById("lives");
  const comboEl = document.getElementById("combo");
  const bannerEl = document.getElementById("banner");
  const relicsEl = document.getElementById("relics");
  const quotaText = document.getElementById("quotaText");
  const titleScreen = document.getElementById("title");
  const draftScreen = document.getElementById("draft");
  const overScreen = document.getElementById("over");
  const cardsEl = document.getElementById("cards");
  const draftRelicsEl = document.getElementById("draftRelics");
  const draftSectorEl = document.getElementById("draftSector");

  function syncHUD() {
    bestEl.textContent = best;
    sectorEl.textContent = sector;
    multEl.textContent = "×" + multiplier();
    quotaText.textContent = sectorProgress + " / " + sectorQuota;
    // lives
    livesEl.innerHTML = "";
    for (let i = 0; i < mods.maxLives; i++) { const d = document.createElement("div"); d.className = "life" + (i >= lives ? " lost" : ""); livesEl.appendChild(d); }
    // relic chips
    relicsEl.innerHTML = "";
    for (const id of ownedOrder) {
      const c = owned[id]; const r = RELICS[id];
      const chip = document.createElement("div"); chip.className = "relic-chip";
      chip.style.borderColor = hexA(RAR_COLOR[r.rar], 0.5);
      chip.innerHTML = `<span>${r.icon}</span>` + (c > 1 ? `<span class="rx">×${c}</span>` : "");
      relicsEl.appendChild(chip);
    }
  }

  let comboHideT = null;
  function showCombo() {
    if (combo >= 2) {
      comboEl.textContent = "×" + multiplier() + "  ·  " + combo + " COMBO";
      comboEl.classList.remove("hidden"); comboEl.style.opacity = "1";
      clearTimeout(comboHideT); comboHideT = setTimeout(hideCombo, 1400);
    }
  }
  function hideCombo() { comboEl.style.opacity = "0"; clearTimeout(comboHideT); comboHideT = setTimeout(() => comboEl.classList.add("hidden"), 200); }

  function showBanner(main, sub) {
    bannerEl.innerHTML = main + (sub ? `<span class="banner-sub">${sub}</span>` : "");
    bannerEl.classList.remove("hidden");
    bannerEl.style.animation = "none"; void bannerEl.offsetWidth; bannerEl.style.animation = "";
    clearTimeout(showBanner._t); showBanner._t = setTimeout(() => bannerEl.classList.add("hidden"), 2100);
  }

  // ---- Draft -----------------------------------------------------------
  function rollDraft() {
    const pool = Object.keys(RELICS).filter(id => (owned[id] || 0) < RELICS[id].max);
    const picks = [];
    const tmp = pool.slice();
    for (let n = 0; n < 3 && tmp.length; n++) {
      // weighted by rarity
      let total = 0; for (const id of tmp) total += RAR_WEIGHT[RELICS[id].rar];
      let roll = Math.random() * total, chosen = tmp[0];
      for (const id of tmp) { roll -= RAR_WEIGHT[RELICS[id].rar]; if (roll <= 0) { chosen = id; break; } }
      picks.push(chosen); tmp.splice(tmp.indexOf(chosen), 1);
    }
    return picks;
  }

  function openDraft() {
    sndDraft();
    draftSectorEl.textContent = sector;
    const picks = rollDraft();
    cardsEl.innerHTML = "";
    for (const id of picks) {
      const r = RELICS[id]; const col = RAR_COLOR[r.rar]; const have = owned[id] || 0;
      const card = document.createElement("div");
      card.className = "card"; card.style.setProperty("--cardcol", col);
      card.innerHTML =
        `<div class="rarity">${r.rar}</div>` +
        `<div class="icon">${r.icon}</div>` +
        `<div class="name">${r.name}</div>` +
        `<div class="desc">${r.desc}</div>` +
        (have ? `<div class="owned">OWNED ×${have}</div>` : "");
      card.addEventListener("click", () => pickRelic(id));
      cardsEl.appendChild(card);
    }
    // current relics summary
    draftRelicsEl.innerHTML = "";
    for (const id of ownedOrder) {
      const c = owned[id]; const r = RELICS[id];
      const chip = document.createElement("div"); chip.className = "relic-chip"; chip.style.borderColor = hexA(RAR_COLOR[r.rar], 0.5);
      chip.innerHTML = `<span>${r.icon}</span><span style="font-size:11px">${r.name}</span>` + (c > 1 ? `<span class="rx">×${c}</span>` : "");
      draftRelicsEl.appendChild(chip);
    }
    hud.classList.add("hidden");
    draftScreen.classList.remove("hidden");
  }

  function pickRelic(id) {
    owned[id] = (owned[id] || 0) + 1;
    if (ownedOrder.indexOf(id) < 0) ownedOrder.push(id);
    const wasAegis = id === "aegis";
    recomputeMods();
    if (wasAegis) lives = Math.min(mods.maxLives, lives + 1);
    sndDraft();
    draftScreen.classList.add("hidden");
    hud.classList.remove("hidden");
    sector++;
    state = STATE.PLAY;
    beginSector();
    syncHUD();
  }

  // ---- Game over -------------------------------------------------------
  function gameOver() {
    state = STATE.OVER; holding = false; sndOver(); vibrate([40, 60, 40]);
    const isNew = score > best;
    if (isNew) { best = score; localStorage.setItem(BEST_KEY, String(best)); }
    if (sector > bestSector) { bestSector = sector; localStorage.setItem(SECT_KEY, String(bestSector)); }
    document.getElementById("finalScore").textContent = score;
    document.getElementById("finalSector").textContent = sector;
    document.getElementById("newBest").classList.toggle("hidden", !isNew);
    document.getElementById("finalStats").innerHTML =
      "LIGHTS COLLECTED &nbsp;<b style='color:var(--cyan)'>" + totalCollected + "</b><br>" +
      "BEST COMBO &nbsp;<b style='color:var(--gold)'>" + bestCombo + "</b><br>" +
      "TIME &nbsp;<b>" + timeAlive.toFixed(1) + "s</b>";
    const fr = document.getElementById("finalRelics"); fr.innerHTML = "";
    for (const id of ownedOrder) { const c = owned[id]; const r = RELICS[id]; const chip = document.createElement("div"); chip.className = "relic-chip"; chip.style.borderColor = hexA(RAR_COLOR[r.rar], 0.5); chip.innerHTML = `<span>${r.icon}</span><span style="font-size:11px">${r.name}</span>` + (c > 1 ? `<span class="rx">×${c}</span>` : ""); fr.appendChild(chip); }
    hud.classList.add("hidden");
    setTimeout(() => overScreen.classList.remove("hidden"), 480);
    refreshTitle();
  }

  function refreshTitle() {
    document.getElementById("titleBest").textContent = best;
    document.getElementById("titleSector").textContent = bestSector;
  }

  // ---- Input -----------------------------------------------------------
  function press(e) { if (state === STATE.PLAY) { holding = true; if (e.cancelable) e.preventDefault(); } }
  function release(e) { if (state === STATE.PLAY) { holding = false; if (e && e.cancelable) e.preventDefault(); } }
  canvas.addEventListener("pointerdown", press);
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      if (state === STATE.PLAY) { holding = true; e.preventDefault(); }
      else if (state === STATE.TITLE || state === STATE.OVER) startRun();
    }
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space" || e.code === "ArrowUp") holding = false; });
  document.getElementById("playBtn").addEventListener("click", startRun);
  document.getElementById("againBtn").addEventListener("click", startRun);

  const soundBtn = document.getElementById("soundBtn");
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn; localStorage.setItem(SND_KEY, soundOn ? "on" : "off");
    soundBtn.classList.toggle("off", !soundOn);
    if (soundOn) { initAudio(); if (actx && actx.state === "suspended") actx.resume(); }
  });
  soundBtn.classList.toggle("off", !soundOn);

  // ---- Main loop -------------------------------------------------------
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05;
    update(dt); render(); requestAnimationFrame(loop);
  }

  // ---- Boot ------------------------------------------------------------
  resize(); refreshTitle(); beamAngle = -Math.PI / 2; tipR = minR;
  requestAnimationFrame(loop);
})();
