# immaterial-art

Render pipeline + Claude Code skill for [Immaterial Fornebu](https://github.com/bgstaal/immaterial-fornebu)-style hash-seeded generative art. Batches of clips and stills, rendered headless on the real GPU, with **full seed provenance on every file** — so any render can be traced back to the exact seed that made it and regenerated with variations.

## What it does

- **`batch`** — N random generations → numbered clips/stills. Parametric count, duration (uniform or per-clip list), aspect ratio, resolution, zoom. `--open-as-ready` pops each file open the moment it finishes.
- **`generate`** — one render from a chosen or random seed.
- **`similar`** — coherent alternate shots: same seed with different zoom/aspect (default), or `--style` mines brand-new seeds (~240/sec, pure CPU) whose derived features match a reference's color scheme / fluidity / fidelity.
- **`identify`** — any rendered file → the seed that made it (sidecar JSON → embedded mp4 metadata → manifest fallback).
- **`features`** — seed → derived features instantly, no browser.

Every render writes `NNN_<seed8>.mp4/.png` + `NNN_<seed8>.json` (seed, features, params) + a `manifest.jsonl` line, and embeds the seed in the mp4 `comment` tag.

## Install

```bash
git clone https://github.com/fire17/immaterial-art && cd immaterial-art
./install.sh          # links the skill into ~/.claude/skills (+ /iart alias) and runs npm i
```

Requirements: node ≥ 18, `ffmpeg`/`ffprobe` on PATH, macOS with a real GPU (uses `--use-angle=metal`), and a local checkout of the immaterial-fornebu engine (`--repo` points at it).

## Usage

```bash
IM="node ~/.claude/skills/immaterial-art/scripts/immaterial.mjs"

# 10 two-minute b-roll clips, opening as they finish
$IM batch --count 10 --duration 120 --out ./renders --open-as-ready

# mixed-duration ranking batch with stills
$IM batch --count 10 --durations 10,30,60,120 --stills --out ./ranking

# alternate takes of a favorite: same generation, new framing
$IM similar --from renders/007_ab12cd34.mp4 --count 5 --duration 60 --out ./takes

# sibling generations with the same palette
$IM similar --from renders/007_ab12cd34.mp4 --style --count 5 --out ./style-takes

# which seed made this file?
$IM identify renders/007_ab12cd34.mp4
```

Key options: `--ratio` height/width (0.5625 = 16:9, 0.1875 = ultra-wide) · `--scale` zoom (engine default 2) · `--width/--height` · `--images-only` · `--prefix` · `--seq-start` · `--repo PATH`.

## Hard-won gotchas (why this exists)

1. Headless Chromium defaults to SwiftShader: first WebGL paint takes ~47s and screencast videos stay **black**. `--use-angle=metal` uses the real GPU → ~5s.
2. WebGL canvas element-screenshots come back black; the pipeline polls full-page screenshots (>100KB = painted) and ffmpeg-trims the pre-paint lead-in.
3. The engine's `?hash=` param dies silently if its `goerli-hashes.js` module import 404s.

## License note

This repo contains **only the render tooling and skill** (MIT). The Immaterial Fornebu engine is Bjørn Staal's artwork — obtain it separately and respect its terms.
