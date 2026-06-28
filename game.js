/* ============================================================
   RADIAN — a one-thumb polar-cursor arcade game.

   The beam sweeps around the pulsar on its own (that's your ANGLE).
   Hold to push the glowing tip outward, release to pull it back in
   (that's your RADIUS). Thread the tip through cyan light orbs as the
   sweep crosses them; keep it clear of the red ones. One finger,
   two axes of timing — easy to start, hard to master.
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
  }
  window.addEventListener("resize", resize);

  // ---- Persistent best -------------------------------------------------
  const BEST_KEY = "radian.best";
  let best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0;

  // ---- Sound (WebAudio, all synthesized) -------------------------------
  const SND_KEY = "radian.sound";
  let soundOn = localStorage.getItem(SND_KEY) !== "off";
  let actx = null;
  let master = null;

  function initAudio() {
    if (actx) return;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain();
      master.gain.value = 0.32;
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
  function sndCollect(combo) {
    const base = 520 + Math.min(combo, 24) * 26;
    blip(base, 0.16, "triangle", 0.28, base * 1.5);
  }
  function sndGold() {
    [660, 880, 1320].forEach((f, i) =>
      setTimeout(() => blip(f, 0.18, "square", 0.18), i * 55));
  }
  function sndHazard() { blip(150, 0.32, "sawtooth", 0.32, 60); }
  function sndExpire() { blip(240, 0.12, "sine", 0.12, 170); }
  function sndOver() {
    [440, 330, 220, 150].forEach((f, i) =>
      setTimeout(() => blip(f, 0.3, "triangle", 0.26), i * 120));
  }

  function vibrate(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
  }

  // ---- Starfield (background) ------------------------------------------
  let stars = [];
  function buildStars() {
    stars = [];
    const n = Math.round((W * H) / 9000);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.3 + 0.2,
        a: Math.random() * 0.5 + 0.1,
        tw: Math.random() * Math.PI * 2,
        ts: Math.random() * 1.5 + 0.4,
      });
    }
  }

  // ---- Game state ------------------------------------------------------
  const STATE = { TITLE: 0, PLAY: 1, OVER: 2 };
  let state = STATE.TITLE;

  const ORB = { GOOD: 0, HAZARD: 1, GOLD: 2 };

  let beamAngle = 0;     // current sweep angle (radians)
  let beamSpeed = 1.05;  // rad/s, grows with level
  let tipR = minR;       // current beam tip radius (player controlled)
  let holding = false;   // is finger/pointer down
  let trail = [];        // tip trail points {x,y,a}

  let orbs = [];
  let particles = [];
  let popups = [];       // floating combo/score text

  let score = 0;
  let displayScore = 0;
  let lives = 3;
  let combo = 0;
  let bestCombo = 0;
  let collected = 0;
  let spawnTimer = 0;
  let shake = 0;
  let flash = 0;         // red damage vignette
  let timeAlive = 0;
  let pulse = 0;         // pulsar throb

  // Tuning
  const EXTEND_SPEED = 2.6;   // fraction of (maxR-minR) per second when held
  const RETRACT_SPEED = 3.0;  // when released
  const ORB_R = 13;           // orb visual radius
  const TIP_R = 9;            // beam tip visual radius
  const COLLECT_DIST = 26;    // hit threshold (px)
  const MAX_ORBS = 7;

  function reset() {
    beamAngle = -Math.PI / 2;
    beamSpeed = 1.05;
    tipR = minR;
    holding = false;
    trail = [];
    orbs = [];
    particles = [];
    popups = [];
    score = 0;
    displayScore = 0;
    lives = 3;
    combo = 0;
    bestCombo = 0;
    collected = 0;
    spawnTimer = 0.6;
    shake = 0;
    flash = 0;
    timeAlive = 0;
  }

  function level() { return Math.floor(score / 320); }

  // ---- Spawning --------------------------------------------------------
  function spawnOrb() {
    if (orbs.length >= MAX_ORBS) return;
    const lv = level();

    // Place at a fresh angle, biased away from the beam's current spot so
    // orbs don't appear right under the tip.
    let ang;
    let tries = 0;
    do {
      ang = Math.random() * Math.PI * 2;
      tries++;
    } while (tries < 6 && angDist(ang, beamAngle) < 0.8);

    const r = minR + Math.random() * (maxR - minR);

    // Type weighting ramps with level.
    let type = ORB.GOOD;
    const roll = Math.random();
    const hazardChance = score < 160 ? 0 : Math.min(0.34, 0.1 + lv * 0.03);
    const goldChance = score < 240 ? 0 : 0.05;
    if (roll < goldChance) type = ORB.GOLD;
    else if (roll < goldChance + hazardChance) type = ORB.HAZARD;

    const ttl = type === ORB.HAZARD ? 4.5 : Math.max(2.6, 4.2 - lv * 0.12);

    // A few orbs slowly drift for extra challenge at higher levels.
    const drift = (lv >= 3 && Math.random() < 0.3)
      ? (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.3)
      : 0;

    orbs.push({
      type, r, ang, drift,
      ttl, maxTtl: ttl,
      born: 0,
      pop: 0,        // spawn-in animation
      pulse: Math.random() * Math.PI * 2,
    });
  }

  function nextSpawnInterval() {
    const lv = level();
    return Math.max(0.55, 1.35 - lv * 0.07);
  }

  // ---- Helpers ---------------------------------------------------------
  function angDist(a, b) {
    let d = Math.abs(a - b) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    return d;
  }
  function orbColor(type) {
    return type === ORB.HAZARD ? "#ff4d5e"
         : type === ORB.GOLD ? "#ffd24a"
         : "#46e8ff";
  }

  function burst(x, y, color, n, power) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (Math.random() * power + power * 0.3);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1, decay: Math.random() * 1.4 + 0.9,
        r: Math.random() * 2.4 + 1.2,
        color,
      });
    }
  }
  function addPopup(x, y, text, color) {
    popups.push({ x, y, text, color, life: 1 });
  }

  // ---- Collisions ------------------------------------------------------
  function checkCollisions(tipX, tipY) {
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      if (o.pop < 0.35) continue; // not fully materialised yet
      const ox = cx + Math.cos(o.ang) * o.r;
      const oy = cy + Math.sin(o.ang) * o.r;
      const d = Math.hypot(tipX - ox, tipY - oy);
      if (d < COLLECT_DIST) {
        if (o.type === ORB.HAZARD) hitHazard(o, ox, oy);
        else collect(o, ox, oy);
        orbs.splice(i, 1);
      }
    }
  }

  function collect(o, x, y) {
    combo++;
    if (combo > bestCombo) bestCombo = combo;
    collected++;
    const mult = 1 + Math.floor(combo / 5);
    const gained = (o.type === ORB.GOLD ? 75 : 10) * mult;
    score += gained;

    if (o.type === ORB.GOLD) {
      burst(x, y, "#ffd24a", 26, 240);
      addPopup(x, y, "+" + gained, "#ffd24a");
      sndGold();
      vibrate([12, 30, 12]);
    } else {
      burst(x, y, "#46e8ff", 14, 170);
      sndCollect(combo);
      vibrate(8);
    }
    showCombo();
  }

  function hitHazard(o, x, y) {
    lives--;
    combo = 0;
    shake = 16;
    flash = 1;
    burst(x, y, "#ff4d5e", 30, 260);
    sndHazard();
    vibrate(60);
    renderLives();
    hideCombo();
    if (lives <= 0) gameOver();
  }

  // ---- Update ----------------------------------------------------------
  function update(dt) {
    timeAlive += dt;
    pulse += dt * 3;

    // background twinkle handled in render

    if (state !== STATE.PLAY) {
      // idle beam rotation for the menu backdrop
      beamAngle += 0.4 * dt;
      updateParticles(dt);
      return;
    }

    // Difficulty curve
    beamSpeed = 1.05 + level() * 0.07;
    if (beamSpeed > 2.4) beamSpeed = 2.4;

    beamAngle += beamSpeed * dt;
    if (beamAngle > Math.PI * 2) beamAngle -= Math.PI * 2;

    // Tip radius eased by hold / release
    const span = maxR - minR;
    if (holding) tipR += EXTEND_SPEED * span * dt;
    else tipR -= RETRACT_SPEED * span * dt;
    if (tipR > maxR) tipR = maxR;
    if (tipR < minR) tipR = minR;

    const tipX = cx + Math.cos(beamAngle) * tipR;
    const tipY = cy + Math.sin(beamAngle) * tipR;

    // Trail
    trail.push({ x: tipX, y: tipY, a: 1 });
    if (trail.length > 18) trail.shift();
    for (const p of trail) p.a -= dt * 2.2;

    // Orbs lifecycle
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnOrb();
      spawnTimer = nextSpawnInterval();
    }
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      o.born += dt;
      o.ttl -= dt;
      o.pop = Math.min(1, o.pop + dt * 5);
      o.pulse += dt * 4;
      if (o.drift) o.ang += o.drift * dt;
      if (o.ttl <= 0) {
        // Good orb timing out breaks the combo (prioritisation pressure);
        // hazards & gold simply leave.
        if (o.type === ORB.GOOD && combo > 0) {
          combo = 0;
          hideCombo();
          sndExpire();
        }
        orbs.splice(i, 1);
      }
    }

    checkCollisions(tipX, tipY);

    updateParticles(dt);

    // Smooth HUD score
    displayScore += (score - displayScore) * Math.min(1, dt * 12);
    scoreEl.textContent = Math.round(displayScore);

    if (shake > 0) shake = Math.max(0, shake - dt * 60);
    if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.y -= 40 * dt;
      p.life -= dt * 1.3;
      if (p.life <= 0) popups.splice(i, 1);
    }
  }

  // ---- Render ----------------------------------------------------------
  function render() {
    ctx.clearRect(0, 0, W, H);

    // background gradient
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
    bg.addColorStop(0, "#0a1020");
    bg.addColorStop(1, "#05060d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // stars
    for (const s of stars) {
      s.tw += 0.016 * s.ts;
      const a = s.a * (0.6 + 0.4 * Math.sin(s.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = "#bfe9ff";
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // shake offset
    ctx.save();
    if (shake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake
      );
    }

    drawArena();
    drawOrbs();
    drawBeam();
    drawParticles();
    drawPopups();

    ctx.restore();

    // damage flash vignette
    if (flash > 0) {
      const v = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.2, cx, cy, Math.max(W, H) * 0.7);
      v.addColorStop(0, "rgba(255,77,94,0)");
      v.addColorStop(1, "rgba(255,77,94," + (flash * 0.5) + ")");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawArena() {
    // concentric guide rings
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const r = minR + (maxR - minR) * (i / 3);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(70,232,255,0.07)";
      ctx.stroke();
    }
    // outer boundary ring
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(70,232,255,0.18)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // tick marks
    ctx.strokeStyle = "rgba(111,129,152,0.25)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const inner = maxR - (i % 6 === 0 ? 12 : 6);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
      ctx.stroke();
    }

    // pulsar core
    const throb = 1 + Math.sin(pulse) * 0.12;
    const coreR = minR * 0.5 * throb;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.4);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.4, "rgba(70,232,255,0.55)");
    grad.addColorStop(1, "rgba(70,232,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#eafcff";
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawOrbs() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const o of orbs) {
      const x = cx + Math.cos(o.ang) * o.r;
      const y = cy + Math.sin(o.ang) * o.r;
      const col = orbColor(o.type);
      const fade = o.ttl < 0.9 ? Math.max(0.2, o.ttl / 0.9) : 1;
      const grow = o.pop * (1 + Math.sin(o.pulse) * 0.08);
      const rr = ORB_R * grow;

      // glow halo
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 2.6);
      g.addColorStop(0, hexA(col, 0.9 * fade));
      g.addColorStop(0.5, hexA(col, 0.35 * fade));
      g.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rr * 2.6, 0, Math.PI * 2);
      ctx.fill();

      // core
      ctx.globalAlpha = fade;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, rr * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // hazard ring marker
      if (o.type === ORB.HAZARD) {
        ctx.strokeStyle = hexA(col, fade);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, rr * 1.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawBeam() {
    const tipX = cx + Math.cos(beamAngle) * tipR;
    const tipY = cy + Math.sin(beamAngle) * tipR;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // faint full-length sweep guide to the boundary
    ctx.strokeStyle = "rgba(70,232,255,0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(beamAngle) * maxR, cy + Math.sin(beamAngle) * maxR);
    ctx.stroke();

    // tip trail
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      if (p.a <= 0) continue;
      ctx.globalAlpha = p.a * 0.5;
      ctx.fillStyle = "#46e8ff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, TIP_R * 0.6 * p.a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // the active beam (core -> tip)
    const grad = ctx.createLinearGradient(cx, cy, tipX, tipY);
    grad.addColorStop(0, "rgba(70,232,255,0.15)");
    grad.addColorStop(1, "rgba(154,240,255,0.95)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // glowing tip
    const tg = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, TIP_R * 3);
    tg.addColorStop(0, "rgba(255,255,255,1)");
    tg.addColorStop(0.4, "rgba(70,232,255,0.8)");
    tg.addColorStop(1, "rgba(70,232,255,0)");
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.arc(tipX, tipY, TIP_R * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(tipX, tipY, TIP_R * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawPopups() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "700 20px Segoe UI, system-ui, sans-serif";
    for (const p of popups) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // hex + alpha helper (col is #rrggbb)
  function hexA(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ---- DOM / UI --------------------------------------------------------
  const hud = document.getElementById("hud");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const livesEl = document.getElementById("lives");
  const comboEl = document.getElementById("combo");
  const titleScreen = document.getElementById("title");
  const overScreen = document.getElementById("over");
  const titleBest = document.getElementById("titleBest");
  const finalScore = document.getElementById("finalScore");
  const finalBest = document.getElementById("finalBest");
  const newBest = document.getElementById("newBest");
  const finalStats = document.getElementById("finalStats");
  const soundBtn = document.getElementById("soundBtn");

  function renderLives() {
    livesEl.innerHTML = "";
    const total = 3;
    for (let i = 0; i < total; i++) {
      const d = document.createElement("div");
      d.className = "life" + (i >= lives ? " lost" : "");
      livesEl.appendChild(d);
    }
  }

  let comboHideT = null;
  function showCombo() {
    const mult = 1 + Math.floor(combo / 5);
    if (combo >= 2) {
      comboEl.textContent = "×" + mult + "  ·  " + combo + " COMBO";
      comboEl.classList.remove("hidden");
      comboEl.style.opacity = "1";
      clearTimeout(comboHideT);
      comboHideT = setTimeout(hideCombo, 1400);
    }
  }
  function hideCombo() {
    comboEl.style.opacity = "0";
    clearTimeout(comboHideT);
    comboHideT = setTimeout(() => comboEl.classList.add("hidden"), 200);
  }

  function refreshBest() {
    bestEl.textContent = best;
    titleBest.textContent = best;
  }

  function startGame() {
    initAudio();
    if (actx && actx.state === "suspended") actx.resume();
    reset();
    state = STATE.PLAY;
    titleScreen.classList.add("hidden");
    overScreen.classList.add("hidden");
    hud.classList.remove("hidden");
    renderLives();
    refreshBest();
    hideCombo();
  }

  function gameOver() {
    state = STATE.OVER;
    holding = false;
    sndOver();
    vibrate([40, 60, 40]);
    const isNew = score > best;
    if (isNew) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
    }
    finalScore.textContent = score;
    finalBest.textContent = best;
    newBest.classList.toggle("hidden", !isNew);
    finalStats.innerHTML =
      "ORBS COLLECTED &nbsp;<b style='color:var(--cyan)'>" + collected + "</b><br>" +
      "BEST COMBO &nbsp;<b style='color:var(--gold)'>" + bestCombo + "</b><br>" +
      "TIME &nbsp;<b style='color:var(--ink)'>" + timeAlive.toFixed(1) + "s</b>";
    hud.classList.add("hidden");
    setTimeout(() => overScreen.classList.remove("hidden"), 480);
    refreshBest();
  }

  // ---- Input -----------------------------------------------------------
  function press(e) {
    if (state === STATE.PLAY) {
      holding = true;
      if (e.cancelable) e.preventDefault();
    }
  }
  function release(e) {
    if (state === STATE.PLAY) {
      holding = false;
      if (e && e.cancelable) e.preventDefault();
    }
  }

  // Pointer events cover touch + mouse + pen.
  canvas.addEventListener("pointerdown", press);
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  // Keyboard for desktop play / accessibility.
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      if (state === STATE.PLAY) { holding = true; e.preventDefault(); }
      else if (state === STATE.TITLE) startGame();
      else if (state === STATE.OVER) startGame();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") holding = false;
  });

  document.getElementById("playBtn").addEventListener("click", startGame);
  document.getElementById("againBtn").addEventListener("click", startGame);

  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    localStorage.setItem(SND_KEY, soundOn ? "on" : "off");
    soundBtn.classList.toggle("off", !soundOn);
    soundBtn.textContent = soundOn ? "♪" : "♪";
    if (soundOn) { initAudio(); if (actx && actx.state === "suspended") actx.resume(); }
  });
  soundBtn.classList.toggle("off", !soundOn);

  // ---- Main loop -------------------------------------------------------
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // clamp after tab switch
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---- Boot ------------------------------------------------------------
  resize();
  refreshBest();
  beamAngle = -Math.PI / 2;
  requestAnimationFrame(loop);
})();
