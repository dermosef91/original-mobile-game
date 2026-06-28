# RADIAN

**Sweep the dark. Touch the light.**

A one-thumb arcade game built around an original *polar-cursor* mechanic. There are no assets to download, no frameworks, no build step — just open `index.html`. It runs full-screen on mobile browsers and desktop alike.

[Play: open `index.html`]

---

## The idea

Most one-touch games map your finger to a single axis — jump, flap, steer. RADIAN gives you **two axes of timing from one finger**:

- A **beam sweeps around the central pulsar on its own.** That continuous rotation *is* your angle — you don't control it, you read it.
- **Hold** the screen to push the beam's glowing **tip outward**; **release** to let it retract. That *is* your radius.

So your one finger steers a cursor through polar space. To collect a light orb you have to shape the tip's reach so that it arrives at the orb's radius exactly as the sweep crosses its angle. Trivial to understand in one sentence; genuinely hard to master once the orbs multiply, drift, and the sweep speeds up.

## How to play

- **Hold** to extend the beam, **release** to retract it.
- <span>🔵</span> **Cyan light** — touch it with the tip to collect. Builds your combo.
- <span>🔴</span> **Red** — a hazard. Touching it costs a life and resets your combo. Thread around it.
- <span>🟡</span> **Gold** — rare bonus, worth a big score burst.
- A cyan orb that **times out** uncollected breaks your combo, so you can't just farm the easy ones — you have to prioritise.
- **3 lives.** Lose them all and the signal is lost.

Desktop: **Space** / **↑** acts as hold, and starts / restarts the game.

## Mastery curve

| Easy to start | Hard to master |
|---|---|
| One finger, hold/release | Hitting a precise radius *and* angle at once |
| Collect glowing dots | Threading the tip between hazards onto light |
| | Chasing combo multipliers (×1 → ×N every 5 hits) |
| | Triaging which orbs to save before they expire |
| | A sweep that accelerates and orbs that drift as you climb |

## Scoring

- Cyan orb: **10 × multiplier**. Gold orb: **75 × multiplier**.
- Multiplier rises one step every 5 consecutive collects.
- Best score, best combo, orbs collected and survival time are tracked; your best is saved locally.

## Tech

- A single HTML file plus one CSS and one JS file. **Vanilla JS, Canvas 2D, Web Audio** (all sound is synthesized at runtime — no audio files).
- Responsive to any viewport, DPR-aware rendering, safe-area insets for notched phones.
- Input via Pointer Events (touch + mouse + pen) and keyboard. Haptic feedback via the Vibration API where supported.
- No dependencies, no build, no network. Just static files.

## Run it

```
# any static server works, or just open the file directly
python3 -m http.server 8000
# then visit http://localhost:8000 on your phone or browser
```

Tap **PLAY** and start sweeping.
