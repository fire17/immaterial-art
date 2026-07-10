---
name: immaterial-art
description: Generate Immaterial Fornebu generative-art clips and images on demand — single renders, numbered batches of random generations (parametric count/duration/aspect-ratio/scale), same-seed framing variations (zoom/aspect) for coherent multi-shot sequences, and style-mined new seeds that match a reference's color scheme/fidelity/fluidity. Every render saves its exact seed (hash) in a sidecar JSON, a manifest, AND embedded mp4 metadata, so any clip/image can be traced back to its seed and re-rendered with variations. Use when the user types /immaterial-art or /iart, asks for "immaterial clips/images", "generative art b-roll", "another batch of generations", "which seed made this clip", "variations of this generation", or "similar-looking generations for the same video".
argument-hint: "batch --count 10 --duration 120 | generate [--hash 0x..] | similar --from <file|hash> [--style] | identify <file>"
---

# Immaterial Art — generative-art render pipeline

Renders the **Immaterial Fornebu** engine (`/Users/magic/Creations/entangled-grail/immaterial-fornebu`, Three.js, hash-seeded deterministic art) headless on the real Metal GPU and captures clips/stills with full seed provenance.

## The one tool

```bash
node ~/.claude/skills/immaterial-art/scripts/immaterial.mjs <command> [options]
```

Commands: `batch` · `generate` · `similar` · `identify` · `features`

**Every render produces:** `NNN_<seed8>.mp4` (and/or `.png`) + `NNN_<seed8>.json` sidecar (full hash, derived features, render params) + a `manifest.jsonl` line. The hash is ALSO embedded in the mp4 `comment` metadata tag — `identify` works from the file alone even if sidecars are lost.

## Commands

### batch — N random generations, numbered in sequence
```bash
node .../immaterial.mjs batch --count 10 --duration 120 --out ~/Creations/entangled-grail/immaterial-renders/batch-002
```
Options: `--count N` · `--duration SECS` (uniform) or `--durations 10,60,120` (cycles per clip) · `--ratio 0.5625` (height/width; 0.5625 = 16:9) · `--width 1280` (`--height` optional override) · `--scale S` (render zoom; engine default 2 — higher = closer/denser detail) · `--stills` (also save PNG per clip) · `--images-only` (no video) · `--open-as-ready` (macOS `open` each file the moment it finishes — queue renders, watch them arrive) · `--prefix P` · `--seq-start N` · `--out DIR` · `--repo PATH`

### generate — one render, chosen or random seed
```bash
node .../immaterial.mjs generate --hash 0x266b2c... --duration 30 --stills --out ./renders
```

### similar — coherent shots for the same video
Two modes:

**Same seed, new framing** (default) — same generation, different zoom (`scale`) + aspect. For alternate takes/shots of the artwork the user picked:
```bash
node .../immaterial.mjs similar --from ranking-batch-001/007_ab12cd34.mp4 --count 5 --duration 60 --out ./takes
# custom framing sweeps:  --ratios 0.5625,1,0.42 --scales 2,3,4
```

**Style-matched new seeds** (`--style`) — mines random seeds (~240/sec, pure CPU) until derived features match the reference, then renders them. Different generations, same look:
```bash
node .../immaterial.mjs similar --from 007_ab12cd34.mp4 --style --count 5 --duration 120 --out ./style-takes
# stricter match: --match "color scheme+fluidity+fidelity"   (default: color scheme)
```

### identify — file → seed
```bash
node .../immaterial.mjs identify some-clip.mp4     # -> {hash, features}
```
Resolution order: sidecar `.json` → embedded mp4 metadata → `manifest.jsonl`. Accepts a raw hash too.

### features — seed → features, instant, no browser
```bash
node .../immaterial.mjs features 0xccc478...
# -> fidelity, fluidity, color scheme, angle, direction, frame, double-sided
```

## Workflow: ranked b-roll for a video (the standing use-case)

1. `batch --count 10 --durations 10,10,10,30,60,60,120,120,120,120 --stills --open-as-ready` → user watches clips pop open, ranks them.
2. User picks favorite (e.g. `007_...`) → `similar --from 007_....mp4 --count 5 --duration 120` for same-generation alternate framings, and/or `similar --style` for sibling generations with the same palette.
3. `identify` any old render to recover its seed and regenerate at any duration/aspect/zoom.

## Gotchas (learned live)

- **MUST run on Metal GPU**: playwright chromium launches with `--use-angle=metal`. Default headless SwiftShader takes ~47s to paint the first frame (vs ~5s) and screencasts stay black.
- WebGL canvas element-screenshots come back black — the script polls full-page screenshots (>100KB = painted) before recording, then trims the pre-paint lead-in with ffmpeg.
- `scale` engine default is 2. `aspectRatio` is height/width (0.5625 = 16:9, 0.1875 = ultra-wide 16:3 gallery banner).
- Recording is realtime (a 120s clip takes ~120s + ~12s overhead). Batches run sequentially on purpose — parallel contexts contend for the GPU and stutter the screencast.
- The repo needs `goerli-hashes.js` present (module import) or the `?hash=` param is silently ignored — repo carries a stub since 2026-07-10.
- Deps: `playwright` npm package lives in `scripts/node_modules` (chromium browser cached globally); `ffmpeg` + `ffprobe` from PATH (brew).

## Renders home

Standing output root: `~/Creations/entangled-grail/immaterial-renders/` (outside the git repo — renders are heavy). `ranking-batch-001` = the first 10-clip ranked batch (2026-07-10).
