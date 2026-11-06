# Image prompts for the front end

Paste the **STYLE BLOCK** at the start of every prompt so the whole product shares one visual identity. Save each result with the file name shown, inside `web/public/img/`.

## STYLE BLOCK

```
Dark cyber-terminal aesthetic, near-black background (#0A0C10), electric lime green (#B6FF3B) as primary accent, secondary cyan (#35E0FF), small magenta (#FF3D8B) highlights, fine scanlines, soft phosphor glow, crisp vector-like shapes, minimal, professional, no text unless specified, no real brand logos, no people.
```

## Negative / safety line (append when a result shows junk)

```
no letters, no numbers, no watermark, no signature, no real logos, no people, no hands, no faces
```

## What is NOT generated with AI

Text, wordmark and UI chrome are done in code (CSS fonts and SVG), because image generators misspell text. These are built directly in the front end: product wordmark, play / stop / download / share / master buttons, effect icons (lowpass, highpass, delay, reverb, distort, bitcrush, chorus, phaser, pan, volume, sidechain), wave icons (sine, saw, square, tri, noise).

---

## P1: needed for the first version of the front

### 01. `logo-mark.png` (1024x1024, solid background)
```
[STYLE BLOCK] Logo mark for a live-coding music studio: a stylized sound wave and a curly code bracket "{ }" merged into one single symbol, centered, flat vector, thick rounded strokes, lime green glow, solid #0A0C10 background, large empty margin around the symbol.
```

### 02. `app-icon.png` (512x512)
```
[STYLE BLOCK] App icon, rounded square, one bold lime waveform line shaped like a terminal prompt ">_", centered, very high contrast, simple enough to stay readable at 32px, solid dark background.
```

### 03. `hero-landing.jpg` (1920x1080)
```
[STYLE BLOCK] Wide hero background: a dark control-room scene made of floating terminal windows with blurred lines of code, glowing equalizer bars and a faint audio waveform running across the center, depth of field, lime and cyan light, large empty area on the left for a headline, no readable text.
```

### 04. `login-bg.jpg` (1920x1080)
```
[STYLE BLOCK] Calm login background: a single large dark terminal window slightly out of focus on the right half, a thin glowing waveform crossing the scene, very low contrast, plenty of empty dark space on the left for a form, no readable text.
```

### 05. `studio-bg.jpg` (2560x1440)
```
[STYLE BLOCK] Extremely subtle studio workspace background: near-black with faint dark-green gradients, barely visible grid lines and a very soft glow in the top-right corner, designed to sit behind a code editor without distracting, no objects, no text.
```

### 06. `scanlines.png` (1024x1024, seamless tile)
```
Seamless tileable texture, very subtle CRT scanlines and fine film grain, near-black with faint dark-green noise, low contrast, no objects, no glow, designed to be used as a 6% opacity overlay.
```

### 07. `ai-panel.png` (1200x800)
```
[STYLE BLOCK] Illustration for an "AI song generator" panel: a glowing prompt cursor on the left turning into streams of code that flow into a sound wave on the right, small sparkles of lime and cyan, centered composition, empty dark margins, no text.
```

### 08. `empty-projects.png` (800x600)
```
[STYLE BLOCK] Empty state illustration: an unplugged retro synthesizer next to an empty terminal window with a blinking cursor, calm and minimal, a single lime accent light, lots of negative space, no text.
```

### 09. `master-before-after.png` (1200x600)
```
[STYLE BLOCK] Before and after concept: on the left a rough, uneven magenta-tinted waveform, on the right a smooth, loud, polished lime waveform, connected by a glowing gradient arrow passing through a minimal mixing-console shape, symmetrical composition, no text.
```

### 10. `master-processing.png` (800x800)
```
[STYLE BLOCK] Mastering in progress: a circular ring of thin waveform bars forming a glowing vinyl-like disc, lime on the outer edge fading to cyan inside, dark empty center, perfectly centered and symmetrical, designed to be rotated with CSS, no text.
```

### 11. `master-result.png` (800x600)
```
[STYLE BLOCK] Delivery package concept: a minimal open folder icon emitting floating audio file shapes (a waveform disc, stacked stem layers, a code page), lime glow, centered, dark empty margins, no text.
```

### 12. `og-share.jpg` (1200x630)
```
[STYLE BLOCK] Social share card background: a terminal window in the center-left with softly blurred code lines, a large glowing waveform behind it, a blank area on the right reserved for a song title, wide cinematic framing, no text.
```

### 13. `instruments-sprite.png` (2048x1536, one grid; or generate one icon at a time)
```
[STYLE BLOCK] Icon set, 4 columns by 3 rows, each icon centered in its own square cell with equal spacing, line icons with 3px strokes, identical weight, lime outline with a small cyan accent dot, solid #0A0C10 background. Icons in order: kick drum, snare drum, hand clap, closed hi-hat, open hi-hat, percussion shaker, bass guitar neck, subwoofer speaker, synth pad (soft stack of waves), lead synth (sharp lightning waveform), pluck (a string being plucked), arpeggiator (ascending steps).
```
Single-icon variant (change only the name): 
```
[STYLE BLOCK] Single line icon of a <INSTRUMENT>, 3px strokes, lime outline with one cyan accent dot, centered, solid #0A0C10 background, large margin, 512x512.
```

---

## P2: landing page and secondary screens

### 14. `feature-live-code.png` (800x600)
```
[STYLE BLOCK] Feature illustration "write code, hear music": a terminal window whose lines of code are turning into glowing equalizer bars, left to right flow, centered, dark margins, no text.
```

### 15. `feature-ai.png` (800x600)
```
[STYLE BLOCK] Feature illustration "describe a song and get editable code": a small chat bubble shape emitting a ribbon of code that unrolls into a sound wave, centered, dark margins, no text.
```

### 16. `feature-master.png` (800x600)
```
[STYLE BLOCK] Feature illustration "master and export": a waveform passing through a minimal limiter gate and coming out as a polished glowing disc, centered, dark margins, no text.
```

### 17. `step-1-type.png`, `step-2-edit.png`, `step-3-export.png` (600x400 each)
```
[STYLE BLOCK] Minimal step illustration (1 of 3): a terminal window with a blinking cursor typing a few lines of code, small and clean, centered, lots of negative space, no text.
```
```
[STYLE BLOCK] Minimal step illustration (2 of 3): a code line connected to a sliding knob and a bass waveform that changes shape, small and clean, centered, lots of negative space, no text.
```
```
[STYLE BLOCK] Minimal step illustration (3 of 3): a waveform disc with a download arrow and a link chain beside it, small and clean, centered, lots of negative space, no text.
```

### 18. `demo-poster.jpg` (1600x900)
```
[STYLE BLOCK] Poster frame for a demo video: a dark terminal window filling most of the frame with a few lines of half-typed code, a glowing cursor, a faint waveform line along the bottom, cinematic framing, no readable text.
```

### 19. `share-page-bg.jpg` (1920x1080)
```
[STYLE BLOCK] Background for a public song page: centered soft lime glow behind an empty area where a player will sit, faint waveform ripples spreading outward like sound waves, very dark edges, no text.
```

### 20. `admin-header.jpg` (1600x400)
```
[STYLE BLOCK] Wide banner for an admin panel: an abstract row of dark control panels with tiny glowing indicator lights and thin data lines, strict and technical mood, subtle, no text.
```

### 21. `trial-ribbon.png` (1200x300)
```
[STYLE BLOCK] Slim announcement banner background: a dark band with a diagonal lime light streak and a faint waveform, left side empty for text, professional, no text.
```

### 22. `not-found.png` (800x600)
```
[STYLE BLOCK] Error page illustration: a broken sound wave with a missing section, a lone blinking cursor, calm and minimal, a single magenta accent glitch line, centered, no text.
```

---

## P3: later (subscription and extras)

### 23. `plan-trial.png`, `plan-pro.png`, `plan-studio.png` (600x800 each)
```
[STYLE BLOCK] Pricing card background (tier 1 of 3, the simplest): dark card with a single thin lime waveform line near the bottom, minimal, empty center for text, no text.
```
```
[STYLE BLOCK] Pricing card background (tier 2 of 3): dark card with layered lime and cyan waveforms rising from the bottom, empty center for text, no text.
```
```
[STYLE BLOCK] Pricing card background (tier 3 of 3, the premium one): dark card with rich layered lime, cyan and magenta waveforms and a subtle glow halo, empty center for text, no text.
```

### 24. `avatar-01.png` to `avatar-06.png` (256x256)
```
[STYLE BLOCK] Abstract avatar, a circular generative pattern made of concentric waveform rings, unique color balance of lime, cyan and magenta on dark, centered, no face, no text.
```
Change only the dominant color for each of the six variants.

### 25. `email-header.png` (1200x400)
```
[STYLE BLOCK] Email header banner: a thin glowing waveform across a dark background, left area empty for a title, minimal, no text.
```

---

## Tips

- If the generator does not support a solid background, ask for `solid #0A0C10 background` and keep the result as is: it matches the app background.
- If text appears inside an image, repeat the prompt adding the negative line above.
- Generate at the listed size or at the same aspect ratio and scale down; do not upscale small images.
- Keep file names exactly as written so the front end can reference them without changes.

---

## Status (files in `web/public/img/`)

Generated, with the final file names (the generator produced JPG, so the extension differs from the plan):

| Plan item | File | Notes |
|---|---|---|
| 03 hero | `hero-landing.jpg` | Empty area on the left for the headline |
| 02 app icon | `app-icon.jpg` | Also exported as `icon-512.png`, `icon-192.png`, `apple-touch-icon.png`, `favicon-32.png`, `favicon.ico` |
| 05 studio background | `studio-bg.jpg` | Very dark with faint scanlines, use behind the editor |
| 07 AI panel | `ai-panel.jpg` | |
| 08 empty state | `empty-projects.jpg` | |
| 09 master before/after | `master-before-after.jpg` | |
| 12 share card | `og-share.jpg` | 1200x630, cropped from `banner-wide.jpg` |
| 18 demo poster | `demo-poster.jpg` | CRT monitor with keyboard |
| 01 logo mark | `logo-mark.jpg` | Square crop (672x672) of the symbol; the original wide image is `logo-wide.jpg` |
| 04 login background | `login-bg.jpg` | 1584x672, dark empty area on the left for the form |
| 13 instrument icons | `instruments/<name>.png` (256x256) | One per instrument: kick, snare, clap, hat, openhat, perc, bass, sub, pad, lead, pluck, arp. Extras kept as `alt-round`, `alt-sub`, `alt-arp`. Full sheet: `instruments-sheet.jpg` |
| 10 master processing | `master-processing.jpg` | Square 672x672 crop, centered ring, rotate it with CSS. Originals: `master-processing-wide.jpg`; HUD variant with baked-in text: `master-processing-hud.jpg` |
| 11 master result | `master-result.jpg` | Square 672x672 crop of the folder with stems, disc and code. Original: `master-result-wide.jpg`; HUD variant: `master-result-hud.jpg` |
| 14 admin header | `admin-header.jpg` | Used as the banner of the admin page |
| 15 feature live code | `feature-live-code.jpg` | Landing feature card |
| 16 feature AI | `feature-ai.jpg` | Landing feature card |
| 17 steps | `step-1-type.jpg`, `step-2-edit.jpg`, `step-3-export.jpg` | Landing "how it works" cards |
| extra | `banner-wide.jpg` | Wide terminal + waveform, usable as admin or landing banner |

Every image the front end uses exists. Optional: a scanlines tile (not needed, the CSS does without it). The synth pictures in the instrument set can resemble a real brand; if you regenerate them, add "generic unbranded synthesizer, no logos" to the prompt.
