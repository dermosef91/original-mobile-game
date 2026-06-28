# RADIAN

**Sweep the dark · Draft relics · Build the engine**

A one-thumb arcade **roguelite** built around an original *polar-cursor* mechanic. No assets, no frameworks, no build step — just open `index.html`. Runs full-screen on mobile browsers and desktop alike.

▶ **Play:** https://dermosef91.github.io/original-mobile-game/

---

## The core mechanic

Most one-touch games map your finger to a single axis. RADIAN gives you **two axes of timing from one finger**:

- A **beam sweeps around the central pulsar on its own.** That continuous rotation *is* your angle — you read it, you don't control it.
- **Hold** the screen to push the beam's glowing **tip outward**; **release** to retract. That *is* your radius.

So your one finger steers a cursor through polar space. To collect a light orb you shape the tip's reach so it arrives at the orb's radius exactly as the sweep crosses its angle. One sentence to learn; a long way to master.

## The roguelite loop

A run is a series of escalating **Sectors**:

1. **Fill the quota** — collect the sector's required number of light orbs (the arc around the boundary ring fills as you go).
2. **Draft a relic** — choose 1 of 3, rolled by rarity (common / uncommon / rare).
3. **Next sector** is faster, denser, and more hazardous. Every 5th is a **Surge** sector — denser, faster, richer.

Hazards cost **Integrity**; clearing a sector restores one. Run out and the signal is lost. Score and furthest sector are saved locally.

## Orbs

- 🔵 **Light** — collect it; counts toward the quota and builds your combo.
- 🔴 **Hazard** — costs Integrity and breaks your combo. Thread around it.
- 🟡 **Gold** — rich bonus score.
- 🔺 **Prism** — shatters into a spray of mini-lights when collected.

A light orb that **times out** uncollected breaks your combo, so you can't just farm — you have to prioritise.

## Relics & combinations

Relics **stack and combine** into emergent build engines. A sample of the ~18:

| Relic | Effect |
|---|---|
| 🌗 Twin Beam / 🔱 Trident | Add beams, evenly spaced around the pulsar |
| 🧲 Magnet Tip | Larger collection radius |
| 🔗 Arc Chain | Collecting arcs to a nearby light |
| 💥 Overcharge | Every few collects, a shockwave sweeps the field |
| 👁️ Echo Tip | A trailing phantom tip also collects |
| 🔱 Splitter | Each tip splits into more collection points |
| 🕳️ Time Dilation | Slower sweep, +score |
| 🌌 Gravity Well | Lights drift toward your tip's radius |
| 🌟 Nova Core | The core periodically pulses a clearing nova |
| 🌀 Recoil Pulse | Snap-retracting from far out emits a clearing pulse |
| 🪙 Gold Rush · ✨ Star Forge · ⚡ Combo Engine | Scaling score & multiplier engines |
| 🛡️ Aegis · 👻 Phase Ward | Survivability — more Integrity, phase through hazards |

Builds emerge from the combinations:
- **Board-clear:** Twin Beam ×N + Arc Chain + Magnet Tip — every collect cascades across the field.
- **Burst scoring:** Overcharge + Nova Core + Star Forge — rings constantly sweep, each worth more.
- **Control / high-multiplier:** Time Dilation + Combo Engine + Gravity Well — a slow, dense, surgical run.
- **Coverage:** Echo Tip + Splitter + Trident — the screen fills with collection points.

## Visuals & feel

Drifting nebula clouds, a parallax starfield with shooting stars, a sector-progress arc on the boundary ring, a pulsar core whose hue warms toward gold as your multiplier climbs, multi-beam rendering, star/triangle orb shapes, arc-lightning, expanding shock rings, particle bursts, screen shake, damage/heal vignettes — and rarity-coloured draft cards.

## Tech

- A single `index.html` + `style.css` + `game.js`. **Vanilla JS, Canvas 2D, Web Audio** (all sound synthesized at runtime — no audio files).
- Responsive to any viewport, DPR-aware, safe-area insets for notched phones.
- Input via Pointer Events (touch + mouse + pen) and keyboard; haptics via the Vibration API where supported.
- No dependencies, no build, no network. Deployed to GitHub Pages via Actions.

## Run it locally

```
python3 -m http.server 8000
# then open http://localhost:8000 on your phone or browser
```

Tap **START RUN** and start building.
