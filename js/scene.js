import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/DRACOLoader.js';
import { MODEL_TO_MUSCLE, MUSCLE_BY_ID } from './data.js';

const VIEW_DIRECTIONS = {
  front: new THREE.Vector3(0, 0.035, 1),
  back: new THREE.Vector3(0, 0.035, -1),
  left: new THREE.Vector3(1, 0.035, 0),
  right: new THREE.Vector3(-1, 0.035, 0),
};

const INITIAL_DIRECTION = new THREE.Vector3(0.22, 0.04, 1).normalize();

const HOTSPOT_DEFS = [
  { id: 'pec-major', raw: 'Pectoralis Major', label: '胸前', offset: [0.16, 0.02, 0.08], normal: [0.5, 0.05, 1] },
  { id: 'wrist-extensors', raw: 'Extensor Carpi Radialis Brevis', label: '前臂', offset: [0.17, -0.015, 0.01], normal: [1, 0.1, 0.2] },
  { id: 'quadriceps', raw: 'Quadriceps Femoris', label: '膝前', offset: [0.065, -0.19, 0.055], normal: [0.2, 0.05, 1] },
  { id: 'trapezius', raw: 'Trapezius', label: '颈肩', offset: [0.15, 0.14, -0.025], normal: [0.25, 0.1, -1] },
  { id: 'infraspinatus', raw: 'Infraspinatus', label: '肩胛', offset: [0.145, 0.015, -0.025], normal: [0.2, 0.05, -1] },
  { id: 'ql', raw: 'Quadratus Lumborum', label: '下背', offset: [0.1, 0.055, -0.02], normal: [0.2, 0.05, -1] },
  { id: 'glute-med', raw: 'Gluteus Medius', label: '髋外侧', offset: [0.13, 0.015, -0.02], normal: [0.9, 0.05, -0.35] },
  { id: 'gastrocnemius', raw: 'Gastrocnemius', label: '小腿', offset: [0.065, 0.055, -0.03], normal: [0.25, 0.05, -1] },
];

const ORIENTATION_LABELS = {
  front: ['正视位', 'ANTERIOR'],
  back: ['背视位', 'POSTERIOR'],
  left: ['左侧位', 'LEFT LATERAL'],
  right: ['右侧位', 'RIGHT LATERAL'],
  anterolateral: ['前外侧位', 'ANTEROLATERAL'],
  posterolateral: ['后外侧位', 'POSTEROLATERAL'],
};

let colorSeed = 0;
function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= colorSeed++;
  return h >>> 0;
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function addFiberShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aMyoFiber;\nvarying float vMyoFiber;\nvarying vec3 vMyoLocal;'
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvMyoFiber = aMyoFiber;\nvMyoLocal = position;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vMyoFiber;\nvarying vec3 vMyoLocal;'
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float myoFiberA = sin(vMyoFiber * 2.7);
        float myoFiberB = sin(vMyoFiber * 6.9 + 1.7);
        float myoFiberMask = myoFiberA * 0.55 + myoFiberB * 0.24;
        float myoGrain = sin(vMyoLocal.x * 367.0 + sin(vMyoLocal.y * 193.0) * 2.1)
          * sin(vMyoLocal.z * 271.0 + sin(vMyoLocal.y * 141.0) * 1.4);
        float myoMottle = sin(vMyoLocal.x * 37.0 + vMyoLocal.y * 54.0)
          * sin(vMyoLocal.z * 43.0 + vMyoLocal.y * 29.0);
        diffuseColor.rgb *= 1.0 + myoFiberMask * 0.095 + myoGrain * 0.035 + myoMottle * 0.045;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + myoFiberMask * 0.026 + myoGrain * 0.018, 0.0, 1.0);`
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        float myoFacing = abs(dot(normalize(normal), normalize(vViewPosition)));
        float myoEdge = pow(1.0 - clamp(myoFacing, 0.0, 1.0), 2.1);
        gl_FragColor.rgb *= 1.0 - myoEdge * 0.34;`
      );
  };
  material.customProgramCacheKey = () => 'myo-muscle-fiber-v1';
}

export class AnatomyViewer {
  constructor(options) {
    this.canvas = options.canvas;
    this.viewport = options.viewport;
    this.hotspotsEl = options.hotspotsEl;
    this.onProgress = options.onProgress || (() => {});
    this.onReady = options.onReady || (() => {});
    this.onError = options.onError || (() => {});
    this.onHover = options.onHover || (() => {});
    this.onSelect = options.onSelect || (() => {});
    this.onUnmapped = options.onUnmapped || (() => {});
    this.onOrientation = options.onOrientation || (() => {});

    this.state = {
      muscle: true,
      bone: true,
      hotspot: true,
    };
    this.ready = false;
    this.selectedId = null;
    this.hoveredId = null;
    this.side = 'both';
    this.muscleMeshes = [];
    this.boneMeshes = [];
    this.meshesById = new Map();
    this.rawBounds = new Map();
    this.rawToId = new Map();
    this.groupBounds = new Map();
    this.hotspots = [];
    this.fullDistance = 3.8;
    this.currentView = 'front';
    this.cameraTween = null;
    this.pointerDown = null;
    this.dragged = false;
    this.lastHoverPayload = null;
    this.hoverFrame = 0;
    this.lastOrientation = '';
    this.orientationFrame = 0;
    this.hotspotFrame = 0;
    this.lastTime = performance.now();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.init();
  }

  /* ---------------------------------------------------------
     Setup
     --------------------------------------------------------- */
  init() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(29, 1, 0.04, 60);
    this.camera.position.copy(INITIAL_DIRECTION).multiplyScalar(4.2);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.064;
    this.controls.rotateSpeed = 0.58;
    this.controls.zoomSpeed = 0.7;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.52;
    this.controls.maxDistance = 6.2;
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.88;
    this.controls.autoRotateSpeed = 0.65;
    this.controls.update();

    this.createEnvironment();
    this.createLights();
    this.createMaterials();
    this.bindEvents();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.viewport);
    this.loadModel();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  createEnvironment() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#211a15');
    gradient.addColorStop(0.38, '#171310');
    gradient.addColorStop(0.72, '#0b0908');
    gradient.addColorStop(1, '#060505');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.filter = 'blur(60px)';
    const warm = ctx.createRadialGradient(280, 150, 4, 280, 150, 210);
    warm.addColorStop(0, 'rgba(255, 204, 157, 0.9)');
    warm.addColorStop(0.35, 'rgba(211, 135, 90, 0.35)');
    warm.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, 620, 420);

    const cool = ctx.createRadialGradient(785, 245, 3, 785, 245, 185);
    cool.addColorStop(0, 'rgba(148, 172, 209, 0.58)');
    cool.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = cool;
    ctx.fillRect(500, 40, 520, 430);

    ctx.filter = 'blur(25px)';
    ctx.fillStyle = 'rgba(255, 225, 193, 0.24)';
    ctx.fillRect(640, 60, 95, 380);
    ctx.filter = 'none';

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = pmrem.fromEquirectangular(tex);
    this.scene.environment = rt.texture;
    this.envRT = rt;
    tex.dispose();
    pmrem.dispose();
  }

  createLights() {
    const hemi = new THREE.HemisphereLight(0xffddc0, 0x1a0906, 0.72);
    this.scene.add(hemi);

    // A soft headlight keeps the currently viewed anatomy readable from every side.
    const key = new THREE.DirectionalLight(0xffe3ca, 2.1);
    key.position.set(1.8, 2.7, 4.2);
    key.target.position.set(0, 0.05, 0);
    this.scene.add(key, key.target);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0xa9bdd8, 1.25);
    fill.position.set(-3.2, 1.2, 2.5);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xff7446, 1.75);
    rim.position.set(0.4, 2.6, -3.8);
    this.scene.add(rim);

    const lower = new THREE.PointLight(0xff5e35, 0.95, 4.2, 2);
    lower.position.set(-0.2, -1.1, 1.4);
    this.scene.add(lower);

    const top = new THREE.PointLight(0xffb27d, 0.6, 3.4, 2);
    top.position.set(0, 2.3, 0.6);
    this.scene.add(top);
  }

  createMaterials() {
    this.materials = {
      base: new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        color: 0xffffff,
        roughness: 0.55,
        metalness: 0.012,
        clearcoat: 0.17,
        clearcoatRoughness: 0.64,
        sheen: 0.34,
        sheenColor: new THREE.Color(0xe98c72),
        sheenRoughness: 0.82,
        envMapIntensity: 0.48,
        side: THREE.DoubleSide,
      }),
      muted: new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        color: 0xc8bab0,
        roughness: 0.59,
        metalness: 0.01,
        clearcoat: 0.18,
        clearcoatRoughness: 0.62,
        sheen: 0.2,
        sheenColor: new THREE.Color(0xc98670),
        envMapIntensity: 0.38,
        side: THREE.DoubleSide,
      }),
      selected: new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        color: 0xffd0bc,
        emissive: 0x60200f,
        emissiveIntensity: 0.38,
        roughness: 0.44,
        metalness: 0.012,
        clearcoat: 0.22,
        clearcoatRoughness: 0.55,
        sheen: 0.28,
        sheenColor: new THREE.Color(0xffb08f),
        sheenRoughness: 0.78,
        envMapIntensity: 0.78,
        side: THREE.DoubleSide,
      }),
      related: new THREE.MeshPhysicalMaterial({
        color: 0xc4995c,
        emissive: 0x5f3511,
        emissiveIntensity: 0.18,
        roughness: 0.46,
        metalness: 0.01,
        clearcoat: 0.32,
        clearcoatRoughness: 0.5,
        sheen: 0.26,
        sheenColor: new THREE.Color(0xffcc91),
        envMapIntensity: 0.75,
        side: THREE.DoubleSide,
      }),
      hover: new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        color: 0xffc2a6,
        emissive: 0x501407,
        emissiveIntensity: 0.16,
        roughness: 0.43,
        clearcoat: 0.4,
        clearcoatRoughness: 0.52,
        sheen: 0.28,
        sheenColor: new THREE.Color(0xffac86),
        envMapIntensity: 0.75,
        side: THREE.DoubleSide,
      }),
      ghost: new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        color: 0x8e7b70,
        roughness: 0.78,
        metalness: 0,
        clearcoat: 0.05,
        clearcoatRoughness: 0.8,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        envMapIntensity: 0.2,
        side: THREE.DoubleSide,
      }),
      bone: new THREE.MeshPhysicalMaterial({
        color: 0xb49f7a,
        roughness: 0.64,
        metalness: 0,
        clearcoat: 0.1,
        clearcoatRoughness: 0.7,
        envMapIntensity: 0.42,
        side: THREE.DoubleSide,
      }),
    };

    for (const key of ['base', 'muted', 'hover', 'selected', 'related', 'ghost']) {
      addFiberShader(this.materials[key]);
    }
  }

  bindEvents() {
    this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    this.canvas.addEventListener('pointercancel', () => this.clearPointerState());
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.dragged) this.clearHover();
    });
    this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
    this.canvas.addEventListener('wheel', () => {
      this.cameraTween = null;
      this.hideHover();
    }, { passive: true });
    this.controls.addEventListener('start', () => {
      this.cameraTween = null;
      this.canvas.classList.add('is-dragging');
      this.hideHover();
    });
    this.controls.addEventListener('end', () => {
      this.canvas.classList.remove('is-dragging');
    });
  }

  resize() {
    const rect = this.viewport.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ---------------------------------------------------------
     Model
     --------------------------------------------------------- */
  loadModel() {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('./libs/draco/');
    loader.setDRACOLoader(draco);

    loader.load(
      './assets/body.glb',
      (gltf) => {
        try {
          this.buildModel(gltf);
        } catch (error) {
          console.error(error);
          this.onError(error);
        }
      },
      (progress) => {
        const total = progress.total || 8249484;
        this.onProgress(clamp(progress.loaded / total, 0, 1));
      },
      (error) => {
        console.error('Model loading error', error);
        this.onError(error);
      }
    );
  }

  buildModel(gltf) {
    const wrapper = new THREE.Group();
    wrapper.add(gltf.scene);
    wrapper.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(wrapper);
    const center = box.getCenter(new THREE.Vector3());
    wrapper.position.sub(center);
    wrapper.updateMatrixWorld(true);
    this.modelRoot = wrapper;
    this.scene.add(wrapper);

    const size = box.getSize(new THREE.Vector3());
    this.modelSize = size;

    const rawTemp = new Map();
    let untagged = 0;

    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      const data = object.userData || {};
      const type = data.type;
      if (type !== 'muscle' && type !== 'bone') {
        object.visible = false;
        untagged++;
        return;
      }

      if (type === 'bone') {
        object.material = this.materials.bone;
        object.castShadow = true;
        object.receiveShadow = true;
        object.userData.myomap = {
          type: 'bone',
          raw: data.name || object.name,
          label: data.nameDetail || data.name || object.name,
        };
        this.boneMeshes.push(object);
        object.visible = this.state.bone;
        return;
      }

      const raw = data.name || object.name || '';
      if (!raw) {
        object.visible = false;
        return;
      }
      const id = MODEL_TO_MUSCLE[raw] || null;
      object.userData.myomap = {
        type: 'muscle',
        id,
        raw,
        label: data.nameDetail || raw,
        side: 'both',
      };
      this.muscleMeshes.push(object);
      if (id) {
        if (!this.meshesById.has(id)) this.meshesById.set(id, []);
        this.meshesById.get(id).push(object);
        object.userData.myomap.side = 'both';
      }

      this.bakeMuscleColors(object, raw);
      object.material = this.materials.base;
      object.castShadow = true;
      object.receiveShadow = true;
      object.visible = this.state.muscle;

      const meshBox = new THREE.Box3().setFromObject(object);
      if (!rawTemp.has(raw)) rawTemp.set(raw, new THREE.Box3());
      rawTemp.get(raw).union(meshBox);

      const meshCenter = meshBox.getCenter(new THREE.Vector3());
      if (meshCenter.x > 0.022) object.userData.myomap.side = 'left';
      else if (meshCenter.x < -0.022) object.userData.myomap.side = 'right';
    });

    for (const [raw, bbox] of rawTemp.entries()) {
      this.rawBounds.set(raw, bbox);
      const id = MODEL_TO_MUSCLE[raw];
      if (id) {
        this.rawToId.set(raw, id);
        if (!this.groupBounds.has(id)) this.groupBounds.set(id, new THREE.Box3());
        this.groupBounds.get(id).union(bbox);
      }
    }

    this.dracoFiles = untagged;
    this.addGround(size);
    this.fitFullView(false);
    this.buildHotspots();
    this.ready = true;
    this.canvas.classList.remove('is-loading');

    this.onProgress(1);
    this.onReady({
      muscleParts: this.muscleMeshes.length,
      boneParts: this.boneMeshes.length,
      models: this.meshesById.size,
      size,
    });
  }

  bakeMuscleColors(mesh, raw) {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    if (!position) return;

    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    const size = bbox.getSize(new THREE.Vector3());
    const mins = bbox.min;

    const axes = [0, 1, 2];
    let longAxis = 1;
    if (size.x >= size.y && size.x >= size.z) longAxis = 0;
    else if (size.z >= size.y && size.z >= size.x) longAxis = 2;
    const minor = axes.filter((axis) => axis !== longAxis);

    const hash = hashString(`${raw}-${mesh.name}-${mesh.geometry.uuid}`);
    const palette = ['#6f2a22', '#63231c', '#7b3026', '#591f19', '#803529', '#6c271f', '#60221b'];
    const base = new THREE.Color(palette[hash % palette.length]);
    base.offsetHSL(
      (((hash >>> 5) % 100) / 100 - 0.5) * 0.015,
      (((hash >>> 11) % 100) / 100 - 0.5) * 0.08,
      (((hash >>> 19) % 100) / 100 - 0.5) * 0.055
    );

    const phase = ((hash % 628) / 100) * Math.PI;
    const freqA = 118 + ((hash >>> 3) % 118);
    const freqB = 74 + ((hash >>> 13) % 96);
    const colors = new Float32Array(position.count * 3);
    const fiberPhase = new Float32Array(position.count);

    for (let i = 0; i < position.count; i++) {
      const a = position.getComponent(i, minor[0]) - mins.getComponent(minor[0]);
      const b = position.getComponent(i, minor[1]) - mins.getComponent(minor[1]);
      const narrow = Math.sin(a * freqA + b * freqB * 0.82 + phase) * 0.5
        + Math.sin(a * freqA * 0.47 + b * freqB * 1.37 + phase * 1.61) * 0.5;
      const broad = Math.sin(a * 31 + b * 22 + phase * 0.7);
      const mottle = Math.sin(a * 76 + b * 51 + phase * 1.31) * Math.sin(b * 39 - phase * 0.74);
      const lightness = 1 + narrow * 0.1 + broad * 0.045 + mottle * 0.03;
      const tint = Math.sin(b * 43 + phase) * 0.019;

      colors[i * 3] = clamp(base.r * lightness + tint, 0, 1);
      colors[i * 3 + 1] = clamp(base.g * (lightness - tint * 0.5), 0, 1);
      colors[i * 3 + 2] = clamp(base.b * (lightness - tint * 0.35), 0, 1);
      fiberPhase[i] = a * freqA + b * freqB * 0.82 + phase;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aMyoFiber', new THREE.BufferAttribute(fiberPhase, 1));
  }

  addGround(size) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);
    ctx.save();
    ctx.translate(256, 256);
    ctx.scale(1, 0.46);
    const g = ctx.createRadialGradient(0, 0, 8, 0, 0, 238);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
    g.addColorStop(0.38, 'rgba(0, 0, 0, 0.36)');
    g.addColorStop(0.75, 'rgba(0, 0, 0, 0.09)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 238, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 0.9,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -size.y / 2 - 0.006;
    plane.renderOrder = -1;
    this.scene.add(plane);
    this.ground = plane;
  }

  buildHotspots() {
    this.hotspotsEl.replaceChildren();
    this.hotspots = [];

    for (const def of HOTSPOT_DEFS) {
      const rawBBox = this.rawBounds.get(def.raw);
      if (!rawBBox) continue;
      const center = rawBBox.getCenter(new THREE.Vector3());
      const anchor = center.clone().add(new THREE.Vector3(...def.offset));
      const normal = new THREE.Vector3(...def.normal).normalize();

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'hotspot';
      el.dataset.muscle = def.id;
      el.dataset.raw = def.raw;
      el.setAttribute('aria-label', `查看${def.label}常见痛点`);
      el.innerHTML = `<span class="hotspot-dot"></span><span class="hotspot-label">${def.label}</span>`;
      el.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.onSelect({
          id: def.id,
          side: 'both',
          raw: def.raw,
          source: 'hotspot',
        });
      });
      this.hotspotsEl.appendChild(el);
      this.hotspots.push({ def, anchor, normal, el, visible: false });
    }
    this.hotspotsEl.classList.toggle('is-hidden', !this.state.hotspot);
  }

  /* ---------------------------------------------------------
     Interaction
     --------------------------------------------------------- */
  handlePointerMove(event) {
    if (event.pointerType === 'touch') return;
    if (this.pointerDown && this.pointerDown.buttons) {
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      if (Math.hypot(dx, dy) > 3) this.dragged = true;
    }
    if (!this.ready) return;
    this.latestPointer = { clientX: event.clientX, clientY: event.clientY };
    if (!this.hoverFrame) {
      this.hoverFrame = requestAnimationFrame(() => {
        this.hoverFrame = 0;
        if (this.latestPointer) this.updateHover(this.latestPointer);
      });
    }
  }

  handlePointerDown(event) {
    this.pointerDown = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      buttons: event.buttons,
    };
    this.dragged = false;
    this.canvas.classList.add('is-dragging');
    this.hideHover();
  }

  handlePointerUp(event) {
    const down = this.pointerDown;
    this.pointerDown = null;
    this.canvas.classList.remove('is-dragging');
    if (!down || !this.ready) return;
    const dx = Math.abs(event.clientX - down.x);
    const dy = Math.abs(event.clientY - down.y);
    if (dx > 5 || dy > 5 || performance.now() - down.time > 700) {
      this.dragged = false;
      return;
    }
    this.dragged = false;
    this.selectAt(event.clientX, event.clientY, { source: 'model' });
  }

  handleDoubleClick(event) {
    if (!this.ready) return;
    const hit = this.pickAt(event.clientX, event.clientY);
    if (!hit) {
      this.resetView(true);
      return;
    }
    const info = hit.object.userData.myomap;
    if (!info) return;
    if (!info.id) {
      this.onUnmapped({ raw: info.raw });
      return;
    }
    const side = Math.abs(hit.point.x) <= 0.028 ? 'both' : (hit.point.x > 0 ? 'left' : 'right');
    this.onSelect({ id: info.id, side, raw: info.raw, source: 'model', point: hit.point.clone() });
    this.focusMuscle(info.id);
  }

  clearPointerState() {
    this.pointerDown = null;
    this.dragged = false;
    this.canvas.classList.remove('is-dragging');
    this.clearHover();
  }

  pickAt(clientX, clientY) {
    if (!this.ready || !this.state.muscle) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objects = this.muscleMeshes.filter((mesh) => mesh.visible);
    const hits = this.raycaster.intersectObjects(objects, false);
    return hits.length ? hits[0] : null;
  }

  selectAt(clientX, clientY, { source = 'model', noSelectUpdate = false } = {}) {
    const hit = this.pickAt(clientX, clientY);
    if (!hit) {
      if (source === 'model') this.hideHover();
      return;
    }
    const info = hit.object.userData.myomap;
    if (!info) return;
    const side = Math.abs(hit.point.x) <= 0.028 ? 'both' : (hit.point.x > 0 ? 'left' : 'right');
    if (!info.id) {
      this.onUnmapped({ raw: info.raw });
      return;
    }
    if (noSelectUpdate) return;
    this.onSelect({ id: info.id, side, raw: info.raw, source, point: hit.point.clone() });
  }

  findNearestId(raw) {
    const target = this.rawBounds.get(raw)?.getCenter(new THREE.Vector3());
    if (!target) return null;
    let best = null;
    let bestDistance = Infinity;
    for (const [mappedRaw, bbox] of this.rawBounds.entries()) {
      const id = this.rawToId.get(mappedRaw);
      if (!id) continue;
      const center = bbox.getCenter(new THREE.Vector3());
      const distance = Math.hypot((center.x - target.x) * 0.35, center.y - target.y, (center.z - target.z) * 0.8);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = id;
      }
    }
    return best;
  }

  updateHover({ clientX, clientY }) {
    if (!this.ready || !this.state.muscle) {
      this.clearHover();
      return;
    }
    const hit = this.pickAt(clientX, clientY);
    if (!hit) {
      this.clearHover();
      return;
    }
    const info = hit.object.userData.myomap;
    if (!info) return;
    const id = info.id || null;
    if (id !== this.hoveredId) {
      this.hoveredId = id;
      this.applyMaterials();
    }
    this.canvas.classList.add('is-hovering');

    const rect = this.canvas.getBoundingClientRect();
    const x = clamp(clientX - rect.left + 12, 8, Math.max(8, rect.width - 230));
    const y = clamp(clientY - rect.top, 30, rect.height - 25);
    const payload = {
      id,
      muscle: id ? MUSCLE_BY_ID[id] : null,
      raw: info.raw,
      unmapped: !info.id,
      x,
      y,
    };
    this.lastHoverPayload = payload;
    this.onHover(payload);
  }

  clearHover() {
    if (this.hoveredId) {
      this.hoveredId = null;
      this.applyMaterials();
    }
    this.lastHoverPayload = null;
    this.canvas.classList.remove('is-hovering');
    this.onHover(null);
  }

  hideHover() {
    this.lastHoverPayload = null;
    this.onHover(null);
  }

  /* ---------------------------------------------------------
     Selection & layers
     --------------------------------------------------------- */
  setSelection(id, relatedIds = []) {
    this.selectedId = id;
    this.relatedIds = new Set(relatedIds);
    this.applyMaterials();
    for (const hotspot of this.hotspots) {
      hotspot.el.classList.toggle('is-current', hotspot.def.id === id);
    }
    if (this.lastHoverPayload) {
      const still = this.lastHoverPayload;
      this.onHover({ ...still, selected: still.id === id });
    }
  }

  clearSelection() {
    this.selectedId = null;
    this.relatedIds = new Set();
    this.applyMaterials();
    for (const hotspot of this.hotspots) hotspot.el.classList.remove('is-current');
  }

  applyMaterials() {
    for (const mesh of this.muscleMeshes) {
      const id = mesh.userData.myomap?.id;
      let material = this.selectedId ? this.materials.muted : this.materials.base;
      if (this.selectedId && id === this.selectedId) {
        material = this.materials.selected;
      } else if (this.selectedId && this.relatedIds?.has(id)) {
        material = this.materials.related;
      } else if (id && id === this.hoveredId) {
        material = this.materials.hover;
      } else if (this.selectedId && this.xray) {
        material = this.materials.ghost;
      }
      mesh.material = material;
    }
  }

  setLayers(layers) {
    Object.assign(this.state, layers);
    for (const mesh of this.muscleMeshes) mesh.visible = this.state.muscle;
    for (const mesh of this.boneMeshes) mesh.visible = this.state.bone;
    this.hotspotsEl.classList.toggle('is-hidden', !this.state.hotspot || !this.state.muscle);
    if (!this.state.muscle) this.clearHover();
  }

  /* ---------------------------------------------------------
     Camera
     --------------------------------------------------------- */
  fitFullView(animate = true) {
    const aspect = Math.max(0.35, this.camera.aspect || 1);
    const vFov = (this.camera.fov * Math.PI) / 180;
    const vertical = (this.modelSize.y / 2) / Math.tan(vFov / 2);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const horizontal = (Math.max(this.modelSize.x, this.modelSize.z) / 2) / Math.tan(hFov / 2);
    this.fullDistance = clamp(Math.max(vertical, horizontal) * 1.18, 2.15, 5.2);
    const pos = INITIAL_DIRECTION.clone().multiplyScalar(this.fullDistance);
    if (animate) this.flyCamera(pos, new THREE.Vector3(0, 0, 0), 900);
    else {
      this.camera.position.copy(pos);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  setView(view, animate = true) {
    const direction = VIEW_DIRECTIONS[view];
    if (!direction) return;
    this.currentView = view;
    const target = new THREE.Vector3(0, 0, 0);
    const pos = direction.clone().normalize().multiplyScalar(this.fullDistance);
    if (animate) this.flyCamera(pos, target, 850);
    else {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
    }
  }

  resetView(animate = true) {
    const pos = INITIAL_DIRECTION.clone().multiplyScalar(this.fullDistance);
    if (animate) this.flyCamera(pos, new THREE.Vector3(0, 0, 0), 800);
    else {
      this.camera.position.copy(pos);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  focusMuscle(id, preferredView = null) {
    const bounds = this.groupBounds.get(id);
    if (!bounds) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const largest = Math.max(size.x, size.y, size.z);
    const distance = clamp(largest * 3.15, 0.92, 2.8);
    let direction;
    if (preferredView && VIEW_DIRECTIONS[preferredView]) {
      direction = VIEW_DIRECTIONS[preferredView].clone().normalize();
    } else {
      direction = this.camera.position.clone().sub(this.controls.target);
      if (direction.lengthSq() < 0.01) direction.copy(INITIAL_DIRECTION);
      direction.normalize();
    }
    const position = center.clone().add(direction.multiplyScalar(distance));
    this.flyCamera(position, center, 900);
  }

  highlightExternal(id) {
    this.hoveredId = id || null;
    this.applyMaterials();
  }

  flyCamera(position, target, duration = 800) {
    this.cameraTween = {
      fromPos: this.camera.position.clone(),
      toPos: position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      start: performance.now(),
      duration,
    };
  }

  setAutoRotate(enabled) {
    this.controls.autoRotate = Boolean(enabled);
  }

  setXray(enabled) {
    this.xray = Boolean(enabled);
    this.materials.bone.transparent = this.xray;
    this.materials.bone.opacity = this.xray ? 0.3 : 1;
    this.materials.bone.depthWrite = !this.xray;
    this.materials.bone.needsUpdate = true;
    this.applyMaterials();
  }

  /* ---------------------------------------------------------
     Render loop & overlays
     --------------------------------------------------------- */
  animate(now) {
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0.016);
    this.lastTime = now;

    if (this.cameraTween) {
      const t = clamp((now - this.cameraTween.start) / this.cameraTween.duration, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(this.cameraTween.fromPos, this.cameraTween.toPos, ease);
      this.controls.target.lerpVectors(this.cameraTween.fromTarget, this.cameraTween.toTarget, ease);
      if (t >= 1) this.cameraTween = null;
    }

    this.controls.update();
    if (this.keyLight) {
      const cameraOffset = new THREE.Vector3(1.65, 2.8, 2.2).applyQuaternion(this.camera.quaternion);
      this.keyLight.position.copy(this.camera.position).add(cameraOffset);
      this.keyLight.target.position.copy(this.controls.target);
    }
    if (this.materials) {
      const pulse = 0.38 + Math.sin(now * 0.0021) * 0.06;
      this.materials.selected.emissiveIntensity = pulse;
    }

    if (this.ready) {
      this.updateHotspots(now);
      this.updateOrientation(now);
    }
    this.renderer.render(this.scene, this.camera);
  }

  updateHotspots(now) {
    if (!this.hotspots.length) return;
    if (!this.state.hotspot || !this.state.muscle) {
      this.hotspotsEl.classList.add('is-hidden');
      return;
    }
    this.hotspotsEl.classList.remove('is-hidden');
    const rect = this.viewport.getBoundingClientRect();
    const cameraPosition = this.camera.position;
    for (const hotspot of this.hotspots) {
      const projected = hotspot.anchor.clone().project(this.camera);
      const anchorToCamera = cameraPosition.clone().sub(hotspot.anchor).normalize();
      const facing = anchorToCamera.dot(hotspot.normal) > 0.08;
      const inFrame = projected.z < 1
        && projected.x > -1.1 && projected.x < 1.1
        && projected.y > -1.1 && projected.y < 1.1;
      const current = this.selectedId === hotspot.def.id;
      if (!facing || !inFrame || current) {
        hotspot.el.classList.add('is-behind');
        hotspot.el.classList.remove('is-ready');
        hotspot.el.tabIndex = -1;
        continue;
      }
      const x = (projected.x * 0.5 + 0.5) * rect.width;
      const y = (-projected.y * 0.5 + 0.5) * rect.height;
      hotspot.el.style.left = `${x.toFixed(1)}px`;
      hotspot.el.style.top = `${y.toFixed(1)}px`;
      hotspot.el.classList.remove('is-behind');
      hotspot.el.classList.add('is-ready');
      hotspot.el.tabIndex = 0;
    }
  }

  updateOrientation(now) {
    if (now - this.orientationFrame < 150) return;
    this.orientationFrame = now;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const ax = Math.abs(dir.x);
    const az = Math.abs(dir.z);
    let key;
    if (ax > 0.6 && az > 0.6) key = dir.z > 0 ? 'anterolateral' : 'posterolateral';
    else if (ax > az) key = dir.x > 0 ? 'left' : 'right';
    else key = dir.z > 0 ? 'front' : 'back';

    if (key !== this.lastOrientation) {
      this.lastOrientation = key;
      const labels = ORIENTATION_LABELS[key];
      this.onOrientation({ key, zh: labels[0], en: labels[1] });
    }
  }
}
