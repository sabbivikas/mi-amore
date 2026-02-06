# MN SKY DEFENSE

Browser-based 3D flight + arcade combat game built with Three.js + Vite.

## Controls
- Arrow Up: pitch down (nose down)
- Arrow Down: pitch up (nose up)
- Arrow Left: roll left
- Arrow Right: roll right
- Space: fire dual hand energy bolts
- Shift: toggle player mode (ground run <-> sky float)
- Ctrl: air brake
- P: pause
- R: reset position (debug)
- M: toggle minimap
- H: toggle HUD
- `: toggle debug/settings overlay

## Hero Flight Update
- Player jet is replaced with an original flying hero silhouette.
- Hero pose is forward-leaning with procedural body sway while turning.
- Flight model is tuned for body feel:
  - slower roll than jet
  - faster yaw response
  - mild spring camera smoothing
  - boost FOV expansion and firing/near-miss shake

## Cape System (Approach A)
File: `src/flight/CapeRig.ts`

- Cape uses a lightweight chain of plane segments (no cloth solver).
- Each segment receives sinusoidal offsets driven by:
  - current speed
  - turn rate
  - time-based turbulence
- Speed-based stretch trick:
  - segment spacing increases at high speed to make cape look longer
- Basic anti-clipping constraints:
  - segment Z is clamped to stay behind torso
  - fast damping on cape root rotation prevents unstable flips

Why this approach:
- Much lower CPU cost than verlet cloth.
- Stable at variable frame rates.
- Easy to tune for arcade responsiveness.

## Combat + VFX
- Weapons fire from hero hand anchors (`src/combat/Weapons.ts`).
- Projectiles have emissive cores and impact spark bursts (`src/combat/Projectiles.ts`).
- Boost trail particles emit from hands and feet (`src/flight/BoostTrail.ts`).

## Alien Roles
- Interceptor: sharp triangle-like profile, fast strafe behavior, low durability.
- Tank Drone: disc silhouette, heavy shields, slow plasma fire.
- Mothership: asymmetrical body, rotating ring segments, glowing vent cluster.

Files:
- `src/ai/AlienShips.ts`
- `src/ai/AlienAI.ts`

## Minnesota World Rendering
- 10km chunk tiles with 3x3 streaming around player.
- Downtown skyline clustering plus lower-density outskirts.
- Height-based building tint and roof markers for high-altitude readability.
- Water planes added per tile for lake feel.
- Exponential fog + horizon haze animation.
- Terrain vertex colors include height shift and noise variation.

Files:
- `src/world/WorldManager.ts`
- `src/world/BuildingTile.ts`
- `src/world/TerrainTile.ts`
- `src/world/WaterTile.ts`

## Renderer + Quality Settings
- `physicallyCorrectLights` enabled.
- ACES filmic tone mapping enabled.
- sRGB output color space enabled.
- Optional postprocessing chain:
  - FXAA
  - Bloom
  - Subtle vignette
- Debug/settings overlay includes:
  - tone-mapping exposure slider
  - postprocessing toggle
  - shadow toggle

Main integration: `src/main.ts`

## Minnesota Building Data Pipeline
Dataset file:
- `src/data/buildings_sample.json`

Schema:
```json
[
  {
    "id": "b_001",
    "footprint": [[lng, lat], [lng, lat], [lng, lat]],
    "height_m": 42,
    "roof": "flat"
  }
]
```

Replace with real data:
1. Replace `src/data/buildings_sample.json`.
2. Keep footprint order as `[lng, lat]` and height in meters.
3. Adjust origin in `src/utils/CoordinateUtils.ts` for a different Minnesota anchor.
4. Pipeline remains unchanged: lat/lng -> local meters -> LOD meshes.

## Performance Notes
- Cape and boost trails use pooled/simple meshes to avoid per-frame allocations.
- Buildings keep a 3-tier LOD split with instancing in far range.
- Shadow casting is intentionally constrained.
- PostFX can be disabled at runtime from debug overlay for higher FPS.

## Dev
```bash
npm install
npm run dev
```

Open `http://localhost:5173`.
