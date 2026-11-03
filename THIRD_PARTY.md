# Third-party notices / 第三方说明

## 1. Anatomical mesh — Z-Anatomy / hpfrei

- Source dataset: **Z-Anatomy** — https://www.z-anatomy.com/
- Browser derivative: **hpfrei/body-anatomy-3d-viewer**
  — https://github.com/hpfrei/body-anatomy-3d-viewer
- File used: `assets/body.glb`
- License: **Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0)**
- Changes in this project: the model is presented inside a new interactive
  viewer; per-mesh materials were replaced with custom PBR/procedural
  materials; vertex colours and fibre shading were added; bursae, tendon
  sheaths and other untagged auxiliary meshes are hidden at runtime; 80 model
  groups are mapped to 45 curated pain self-check profiles. The mesh geometry
  itself is the derivative supplied by hpfrei.
- Copyright of the derivative: Copyright (c) 2026, hpfrei, licensed under
  CC BY-SA 4.0.

Because the model is CC BY-SA 4.0, this project is distributed under the same
license. See `LICENSE`.

## 2. three.js

- Version: r160 (`libs/three.module.js`, plus GLTFLoader, OrbitControls,
  DRACOLoader and BufferGeometryUtils).
- License: **MIT License**
- Copyright © 2010–2026 three.js authors.
- Full text: `libs/THREE-LICENSE.txt`
- Source: https://github.com/mrdoob/three.js

## 3. Draco 3D compression

- Files under `libs/draco/` (decoder/wasm/wrapper).
- License: **Apache License 2.0**
- Copyright Google LLC.
- Full text: `libs/DRACO-LICENSE.txt`
- Source: https://github.com/google/draco

## 4. Health/self-check content

The Chinese muscle profiles in `js/data.js` were written for this project as a
simplified educational synthesis informed by common musculoskeletal and
myofascial pain education concepts. They are not copied from a proprietary
clinical database and are not a substitute for examination by a qualified
clinician. Referral patterns vary between individuals.
