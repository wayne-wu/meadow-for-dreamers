# Studio Meadow Interactive Meadow — Project Build Spec

## 0. Core Concept

**Studio Meadow** is an interactive opening-night installation for a floral shop/gallery. Attendees scan a QR code, draw a flower on their phone, and submit it. Their flower is sent to the main TouchDesigner scene, where it grows into a projected meadow and gently moves with wind. Over the evening, the field becomes denser with flowers contributed by guests.

The piece should feel **poetic, intimate, botanical, and alive**, not like a game or a flashy tech demo.

---

## 1. Experience Design

### User Flow

```text
Guest scans QR code
→ mobile drawing page opens
→ guest draws a flower freehand
→ optional stem guide is visible
→ guest submits
→ phone shows text confirmation
→ after ~5 seconds, flower appears in projection
→ flower slowly grows into meadow
→ flower gently sways with wind
```

### Requirements

- No app install.
- QR code should work over regular cellular/internet.
- No need for guests to join local Wi-Fi.
- Drawing should feel like **freehand sketching**.
- Multiple submissions are allowed.
- No preview needed after submit.
- Phone confirmation text is enough.
- No manual approval required.
- Empty or too-small drawings should be rejected silently or minimally.

### Suggested Phone Confirmation Copy

```text
Your flower is joining the meadow 🌱
```

or

```text
Thank you — your flower will bloom in the meadow shortly.
```

---

## 2. Mobile Drawing App

### Purpose

A lightweight mobile web page where attendees draw a flower and submit it as a transparent PNG.

### Recommended Stack

```text
Frontend: React / Next.js
Canvas: HTML Canvas or Fabric.js
Hosting: Vercel
```

A plain HTML Canvas implementation is enough, but Fabric.js may make undo/brush handling easier.

### Drawing UI

Must include:

```text
Canvas area
Brush tool
Limited color palette
Undo
Clear
Submit
Optional name field
```

### Drawing Behavior

The drawing should be from scratch, but the app can show a subtle **stem guide** so users understand the flower’s scale and placement.

Important: the stem guide should not be baked into the submitted PNG unless desired. It can be a faint UI layer.

### Color Palette

Use a controlled Studio Meadow palette. Avoid arbitrary RGB picking.

Recommended colors:

```text
Cream Ivory       #F1E2C8
Blush Pink        #E8B7B6
Dusty Rose        #C9888B
Soft Peach        #E7B38E
Pale Lavender     #B9A8D8
Powder Blue       #9FB9D7
Muted Coral       #B4635A
Dried Sage        #7F9471
Eucalyptus Green  #A1B392
Olive Straw       #B5A76E
Warm Pollen Gold  #E8C46B
Soft Amber Glow   #F0B66A
```

### Export Format

Submit **PNG only**.

Recommended normalized output:

```text
512 × 1024 transparent PNG
```

or, if quality allows:

```text
1024 × 2048 transparent PNG
```

For 300+ submissions, 512×1024 is safer.

### Frontend Preprocessing

Before upload:

- Reject blank drawings.
- Reject drawings below minimum visible pixel count.
- Crop or normalize while preserving relative placement to stem guide.
- Keep transparent background.
- Optional: if no visible stem is detected, allow backend or TouchDesigner to add/generated stem later.

### Name Field

For now, the experience appears anonymous publicly, but backend should support storing an optional name.

Phone form:

```text
Name optional
Draw your flower
Submit
```

No name should appear on the projection unless enabled later.

---

## 3. Backend / API

### Purpose

Receive flower PNG submissions, store latest flower per user/session, expose recent/active flowers to TouchDesigner, and broadcast new submissions in real time.

### Recommended Stack

```text
Backend: Node.js + Express
Realtime: Socket.IO or native WebSocket
Storage: Cloudflare R2 / Supabase Storage / S3-compatible storage
Database: Supabase Postgres / SQLite if local / Vercel KV
Hosting: Render / Railway / Fly.io / Supabase Edge / Vercel serverless
```

For mostly-free deployment, recommended:

```text
Frontend: Vercel
Database: Supabase free tier
Storage: Supabase Storage or Cloudflare R2
Realtime: Supabase Realtime or Socket.IO server on Render/Railway
```

Simplest agent-buildable version:

```text
Next.js app with API routes
Supabase for database + storage
TouchDesigner polls /api/flowers/recent
```

The most robust realtime version:

```text
Express + Socket.IO backend
Supabase storage/database
TouchDesigner connects to WebSocket
```

### Backend Behavior

On flower submit:

1. Receive PNG + optional name + session ID.
2. Validate file size and image dimensions.
3. Reject blank/too-small drawings.
4. Store PNG in cloud storage.
5. Create database record.
6. Mark as active.
7. If same session submits again, keep old records if desired, but mark only most recent as latest for that session.
8. Broadcast `new_flower` event to TouchDesigner.

### “Multiple Allowed, But Only Most Recent Stored”

Interpretation:

- User can submit multiple times.
- Backend should update `latest_flower_id` per session/user.
- For the meadow, you can decide whether all submitted flowers appear or only the latest from each user.
- Since the field should fill over time, displaying **all accepted submissions** is recommended, while still tracking the latest per user.

Better compromise:

```text
Store all approved flowers for the installation.
Also store latest flower per anonymous session.
```

### Database Schema

#### `flowers`

```sql
id uuid primary key
session_id text
name text nullable
image_url text
thumb_url text nullable
created_at timestamp
status text -- accepted / rejected
width int
height int
visible_pixel_count int
palette_version text
metadata jsonb
```

#### Suggested `metadata`

```json
{
  "placement": null,
  "source": "mobile_canvas",
  "has_generated_stem": false,
  "dominant_color": "#E8B7B6"
}
```

### API Endpoints

#### `POST /api/flowers`

Receives a flower submission.

Request:

```json
{
  "session_id": "abc123",
  "name": "optional",
  "image_base64": "data:image/png;base64,..."
}
```

Response:

```json
{
  "ok": true,
  "flower_id": "uuid",
  "message": "Your flower is joining the meadow."
}
```

#### `GET /api/flowers/recent?since=timestamp`

Returns recent accepted flowers.

#### `GET /api/flowers/active`

Returns active flowers for initial TouchDesigner scene hydration.

#### WebSocket Event: `new_flower`

```json
{
  "type": "new_flower",
  "flower": {
    "id": "uuid",
    "image_url": "https://...",
    "created_at": "2026-08-29T20:14:22Z",
    "name": null,
    "metadata": {}
  }
}
```

---

## 4. TouchDesigner Receiver

### Purpose

TouchDesigner receives new flower submissions and adds them into the 3D meadow scene.

### Input Methods

Preferred:

```text
WebSocket DAT
```

Fallback:

```text
Periodic HTTP polling every 2–5 seconds
```

Because the installation can tolerate a ~5 second delay and reliability matters, polling is acceptable. WebSocket feels better but is more fragile.

### TouchDesigner Ingestion Flow

```text
On startup:
  GET /api/flowers/active
  load existing flowers

During event:
  listen for WebSocket new_flower
  or poll /api/flowers/recent

For each flower:
  download PNG to local cache folder
  add row to flowers DAT
  assign placement + animation metadata
  create/activate flower card
```

### Local Cache Folder

```text
/StudioMeadow/cache/flowers/
```

File naming:

```text
flower_<uuid>.png
```

### Flowers DAT

TouchDesigner should maintain a table like:

```text
id
image_path
birth_time
x
y
z
scale
layer
rotation
wind_phase
wind_strength
lifespan
alpha
status
```

Example:

```text
flower_001 | cache/flower_001.png | 123.4 | -1.2 | 0.0 | -4.5 | 0.8 | mid | 12.0 | 3.14 | 0.2 | 3600 | 1 | alive
```

---

## 5. Flower Rendering System

### Visual Representation

Each submitted flower is a **transparent PNG texture on a 2D card in 3D space**.

```text
PNG flower drawing
→ vertical plane/card
→ placed in meadow
→ grows in
→ sways with wind
```

### Geometry

Use a subdivided vertical plane so it can bend.

Recommended card:

```text
Width: variable
Height: variable
Subdivisions vertical: 8–16
Subdivisions horizontal: 1–2
Pivot: bottom center
```

### Animation

Whole-card animation is enough.

Behavior:

```text
birth:
  scale grows from 0 to target scale over 3–6 sec
  alpha fades in
  optional soft glow / pollen particles

idle:
  gentle wind sway
  subtle rotational oscillation
  vertical card deformation based on UV.y

lifetime:
  configurable lifespan, default 1 hour or full night
  optional fade out near end
```

### Wind Deformation

Bend more at top than bottom:

```text
bendAmount = sin(time * speed + wind_phase) * wind_strength * pow(uv.y, 1.5)
```

Optional noise:

```text
bend += noise(worldPos.xz * frequency + time) * small_amount
```

### Generated Stem

If user draws only a blossom, add a generated stem behind/under the PNG.

Simplest approach:

- Always include a subtle procedural stem card/curve for every submission.
- User drawing appears as flower head/card above the stem.
- Or provide stem guide and assume users draw around it.

For MVP:

```text
subtle generated stem in TouchDesigner
+ user flower PNG card attached above
```

This gives consistent planted behavior.

---

## 6. Meadow Scene System

### Scene Style

Not hyper-realistic. Use the earlier Studio Meadow references:

- dark, rear-projection-friendly background
- botanical, soft, dusk/nocturnal atmosphere
- gentle meadow field
- preserved-flower palette
- soft haze
- living but calm motion

### Overall Composition

Projection size is roughly:

```text
4–5 ft wide
6–7 ft tall
```

Use portrait aspect ratio.

Recommended output:

```text
1440 × 1920
```

or:

```text
1080 × 1920
```

If projector is WUXGA 1920×1200, use a portrait active region inside the output or rotate the projector/content if practical.

### Visual Layers

```text
Background:
  deep olive/charcoal gradient
  subtle atmospheric haze
  distant meadow silhouettes

Midground:
  procedural grass
  user-submitted flower cards
  small wildflower accents

Foreground:
  larger grass blades
  occasional dried-stem silhouettes
  drifting pollen particles

Post:
  bloom
  slight blur/softness
  projection compensation LUT
```

### Background Should Remain Alive

Even when no one submits flowers:

- grass gently moves
- haze drifts slowly
- pollen particles float
- occasional ambient shimmer
- subtle wind changes

### Color Theme

Main palette:

```text
60% deep shadow
25% sage / grass
10% florals
5% warm glow
```

Use dark background for rear projection:

```text
Deep Olive Black   #10140D
Moss Charcoal      #182016
Muted Sage Shadow  #263224
```

Avoid bright full-screen backgrounds because they make the curtain look like a glowing rectangle.

---

## 7. Placement / Density System

### Target Count

System should handle at least:

```text
300 flowers
```

### Placement Strategy

Flowers should fill the meadow over time.

Use layered placement:

```text
foreground: larger flowers, lower part of scene
midground: medium flowers, middle depth
background: smaller flowers, dimmer, farther back
```

Submission count drives placement distribution:

```text
0–50 submissions:
  mostly foreground/midground

50–150:
  spread into midground

150–300:
  include background/distant flowers
```

### Avoid Visual Clutter

Even if all 300 persist, manage visibility by:

- scaling distant flowers smaller
- lowering alpha for background flowers
- grouping flowers into depth bands
- allowing overlap but not total chaos
- optional lifespan setting

### Lifespan Setting

Add a global setting:

```text
flower_lifespan_seconds = 3600
```

But also allow:

```text
flower_lifespan_seconds = -1
```

for “persist all night.”

For opening night, start with full-night persistence, then add fade controls if density gets too high.

---

## 8. Projection / Installation Setup

### Display Surface

Current curtain size:

```text
Width: ~4–5 ft
Height: ~6–7 ft
```

Portrait projection is best.

### Curtain vs Rear-Projection Screen

A dedicated rear-projection screen will look noticeably better if:

- it can be tensioned
- it has better contrast than sheer curtain
- it reduces wrinkles/folds
- it preserves brightness

Recommended:

```text
Use a tensioned rear-projection screen/material if possible.
```

If using curtain:

- tension it as much as possible
- reduce folds
- keep background dark
- use strong contrast
- avoid tiny detail

### Lighting

Room lighting will mostly remain as-is, maybe slightly dimmer. Therefore:

- use dark background
- make user flowers brighter than expected
- use bloom carefully
- avoid low-contrast details
- do not rely on small text or fine linework

### Viewing Distance

People view from across the room, so:

- large forms matter more than fine detail
- individual drawings should be readable as silhouettes/color shapes
- movement should be broad and gentle
- no tiny UI/text on projection

---

## 9. Reliability Strategy

Because this is a one-night event but ambitious, use a resilient design.

### Core Reliability Requirements

- Projection keeps running even if backend fails.
- TouchDesigner scene has ambient meadow loop with or without submissions.
- TouchDesigner can recover from WebSocket disconnect.
- TouchDesigner can poll backend as fallback.
- Submitted flower files are cached locally once loaded.
- If a PNG fails to load, skip it gracefully.
- Limit upload size.
- Limit max active flowers.
- Do not depend on manual moderation.

### Recommended Fallback Modes

#### Backend Unavailable

TouchDesigner continues with existing flowers and ambient meadow.

#### Internet Slow

Phone submissions may delay, but scene keeps running.

#### Too Many Flowers

TouchDesigner can reduce active visible flowers or fade older ones.

#### Bad Image

Backend rejects or TouchDesigner skips.

---

## 10. Build Phases

### Phase 1 — TouchDesigner Local Prototype

Goal: prove flower rendering.

Tasks:

```text
Create dark meadow scene
Load local PNG flowers from folder
Place 2D cards in 3D
Animate wind sway
Add grow-in animation
Test 300 flower cards
Export final image/video
```

### Phase 2 — Mobile Drawing App

Goal: guests can draw and submit PNGs.

Tasks:

```text
Create mobile canvas page
Implement brush/colors/undo/clear/submit
Use Studio Meadow palette
Show stem guide
Export transparent PNG
Reject empty drawings
Show confirmation text
```

### Phase 3 — Backend

Goal: store and serve submissions.

Tasks:

```text
Create POST /api/flowers
Store PNG in cloud storage
Create flower database record
Return flower ID
Create GET /api/flowers/active
Create GET /api/flowers/recent
Optional WebSocket broadcast
```

### Phase 4 — TouchDesigner / Backend Integration

Goal: live submissions enter TouchDesigner.

Tasks:

```text
TouchDesigner polls or receives WebSocket event
Downloads PNG
Caches locally
Adds row to flowers DAT
Creates flower instance/card
Triggers grow-in animation
```

### Phase 5 — Polish

Goal: make it feel magical.

Tasks:

```text
Add seed/grow entrance
Add pollen particles
Add ambient meadow movement
Add color correction for projection
Add density management
Add final export button
```

### Phase 6 — Event Rehearsal

Goal: reliability.

Tasks:

```text
Test with phones on cellular
Submit 100+ test flowers
Stress test 300 cards
Test projector brightness
Test curtain/screen
Run for 2+ hours continuously
Verify final image/video capture
```

---

## 11. AI-Agent-Ready Task Breakdown

### Agent A — Mobile Drawing App

**Goal:** Build the phone-based drawing page.

#### Deliverables

```text
Responsive mobile web drawing UI
HTML canvas drawing
Preset color palette
Brush size controls
Undo
Clear
Submit button
Optional name input
Transparent PNG export
Stem guide overlay
Blank drawing rejection
Confirmation message
```

#### Constraints

- Must work on iOS Safari and Android Chrome.
- Must be fast and simple.
- No full RGB color picker.
- Export PNG with transparent background.
- Stem guide should not necessarily be baked into output.

#### Suggested Tech

```text
React / Next.js
HTML Canvas or Fabric.js
```

---

### Agent B — Backend/API

**Goal:** Build low-cost cloud backend for submissions.

#### Deliverables

```text
POST /api/flowers
GET /api/flowers/active
GET /api/flowers/recent
Cloud image storage
Database records
Session ID tracking
Optional name storage
Validation for empty/small images
Optional WebSocket new_flower event
```

#### Constraints

- Mostly free hosting.
- Works over public internet/cellular.
- No auth required for guests.
- Rate limit basic abuse.
- Store PNG only.
- Store latest flower per session, but do not prevent multiple submissions.

#### Suggested Tech

```text
Next.js API routes + Supabase
or
Node.js Express + Socket.IO + Supabase
```

---

### Agent C — TouchDesigner Integration Helper

**Goal:** Provide Python snippets/patterns for TouchDesigner ingestion.

#### Deliverables

```text
Python script for polling /api/flowers/recent
Python script for downloading PNGs to local cache
DAT table update logic
Duplicate flower ID prevention
WebSocket DAT callback example if using WebSocket
Error handling and reconnect logic
```

#### Constraints

- TouchDesigner should not freeze on failed network request.
- Downloads should be cached.
- Flower records should be append-only unless lifespan removes them.
- Must support at least 300 submissions.

---

### Agent D — TouchDesigner Scene System

You will do TouchDesigner yourself, but an agent can still provide specs.

#### Deliverables

```text
Meadow scene component design
Flower card component design
Wind animation shader/logic
Placement algorithm
Density/lifespan system
Post-processing recommendations
Projection calibration checklist
```

#### Constraints

- 3D scene.
- User flowers are 2D texture cards.
- Whole-card wind deformation is sufficient.
- Must never look static.
- Must handle 300 cards.
- Portrait projection.

---

## 12. Recommended MVP Definition

The MVP that is worth shipping:

```text
Guests draw a flower on phone.
Flower submits as transparent PNG.
Backend stores it.
TouchDesigner receives it within ~5 seconds.
Flower grows into a dark meadow.
Flower sways gently in wind.
The field accumulates over the night.
Final meadow can be saved as image/video.
```

Do **not** make these MVP requirements:

```text
Per-petal animation
AI style transfer
Advanced moderation
Complex user accounts
Photorealistic meadow
Perfect realtime synchronization
```

Those are stretch goals.

---

## 13. Stretch Goals

Good stretch goals if time allows:

```text
AI/stylized color harmonization pass
Generated stem if missing
Seed flies into scene before bloom
Pollen burst when new flower appears
Background particles react to new submissions
Admin control panel for lifespan/density/reset
Final “opening night meadow” export button
QR code overlay for idle moments
Floating flowers after meadow fills up
```

Style transfer should be deprioritized unless the app palette alone is not enough. Palette control plus simple alpha/contrast normalization should already keep the look cohesive.

---

## 14. Key Technical Decisions

Recommended decisions:

```text
Public web app over cellular
Cloud backend
No approval queue
PNG-only submissions
2D texture cards in 3D TouchDesigner scene
Whole-card wind sway
Portrait projection
Dark meadow aesthetic
300 flower target
Persistent all-night meadow with optional lifespan control
```

This gives a strong balance between ambition and buildability within five weeks.
