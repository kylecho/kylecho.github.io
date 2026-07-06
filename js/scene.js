import * as THREE from "./vendor/three.module.min.js";

(() => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    return;
  }

  const container = document.querySelector(".hero-scene");
  const hero = container ? container.closest(".hero") : null;
  if (!container || !hero) {
    return;
  }

  function supportsWebGL() {
    try {
      const testCanvas = document.createElement("canvas");
      return !!(
        window.WebGLRenderingContext &&
        (testCanvas.getContext("webgl2") || testCanvas.getContext("webgl"))
      );
    } catch (e) {
      return false;
    }
  }

  if (!supportsWebGL()) {
    return;
  }

  const canvas = document.createElement("canvas");
  container.appendChild(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    container.removeChild(canvas);
    return;
  }

  document.documentElement.classList.add("has-3d-scene");

  const BG = 0x061225;
  renderer.setClearColor(BG, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 4.5, 11.5);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 40);
  const CAM_BASE = { x: 0, y: 1.6, z: 4.9 };
  const LOOK_AT = new THREE.Vector3(0, 0.2, -1.6);
  camera.position.set(CAM_BASE.x, CAM_BASE.y, CAM_BASE.z);
  camera.lookAt(LOOK_AT);

  // Terrain: a wide grid on the XZ plane, displaced on Y every frame.
  const WIDTH = 16;
  const DEPTH = 11;
  const SEG_X = 100;
  const SEG_Z = 64;
  const COLS = SEG_X + 1;
  const ROWS = SEG_Z + 1;
  const vertexCount = COLS * ROWS;

  const gridPositions = new Float32Array(vertexCount * 3);
  const gridColors = new Float32Array(vertexCount * 3);
  const baseX = new Float32Array(vertexCount);
  const baseZ = new Float32Array(vertexCount);

  let vi = 0;
  for (let iz = 0; iz < ROWS; iz++) {
    for (let ix = 0; ix < COLS; ix++) {
      const x = (ix / SEG_X) * WIDTH - WIDTH / 2;
      const z = (iz / SEG_Z) * DEPTH - DEPTH / 2;
      baseX[vi] = x;
      baseZ[vi] = z;
      gridPositions[vi * 3] = x;
      gridPositions[vi * 3 + 1] = 0;
      gridPositions[vi * 3 + 2] = z;
      vi++;
    }
  }

  const edgeIndices = [];
  for (let iz = 0; iz < ROWS; iz++) {
    for (let ix = 0; ix < COLS; ix++) {
      const i = iz * COLS + ix;
      if (ix < SEG_X) {
        edgeIndices.push(i, i + 1);
      }
      if (iz < SEG_Z) {
        edgeIndices.push(i, i + COLS);
      }
    }
  }

  const gridGeometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(gridPositions, 3);
  const colorAttr = new THREE.BufferAttribute(gridColors, 3);
  gridGeometry.setAttribute("position", positionAttr);
  gridGeometry.setAttribute("color", colorAttr);
  gridGeometry.setIndex(edgeIndices);

  const gridMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
  });

  scene.add(new THREE.LineSegments(gridGeometry, gridMaterial));

  // Glow points at every 4th grid intersection.
  const pointVertexIndices = [];
  for (let iz = 0; iz < ROWS; iz += 4) {
    for (let ix = 0; ix < COLS; ix += 4) {
      pointVertexIndices.push(iz * COLS + ix);
    }
  }

  const pointPositions = new Float32Array(pointVertexIndices.length * 3);
  pointVertexIndices.forEach((idx, k) => {
    pointPositions[k * 3] = gridPositions[idx * 3];
    pointPositions[k * 3 + 1] = 0;
    pointPositions[k * 3 + 2] = gridPositions[idx * 3 + 2];
  });

  const pointGeometry = new THREE.BufferGeometry();
  const pointPositionAttr = new THREE.BufferAttribute(pointPositions, 3);
  pointGeometry.setAttribute("position", pointPositionAttr);

  const dotTexture = (() => {
    const size = 64;
    const dotCanvas = document.createElement("canvas");
    dotCanvas.width = size;
    dotCanvas.height = size;
    const ctx = dotCanvas.getContext("2d");
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.4)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(dotCanvas);
  })();

  const pointMaterial = new THREE.PointsMaterial({
    size: 0.09,
    map: dotTexture,
    color: 0x7c9bff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  scene.add(new THREE.Points(pointGeometry, pointMaterial));

  // Invisible plane used to map the pointer into terrain coordinates.
  const hitPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, DEPTH).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  scene.add(hitPlane);

  const colorLow = new THREE.Color(0x16336e);
  const colorHigh = new THREE.Color(0x5c86ff);
  const tmpColor = new THREE.Color();

  function waveHeight(x, z, t) {
    return (
      Math.sin(x * 0.7 + t * 0.55) * 0.18 +
      Math.sin(z * 0.9 - t * 0.4) * 0.14 +
      Math.sin((x + z) * 0.45 + t * 0.28) * 0.12 +
      Math.cos(x * 0.3 - z * 0.55 + t * 0.18) * 0.08
    );
  }

  function hoverBump(x, z, px, pz) {
    const dx = x - px;
    const dz = z - pz;
    const distSq = dx * dx + dz * dz;
    return 0.45 * Math.exp(-distSq / (2 * 0.85 * 0.85));
  }

  function ripplePulse(x, z, pulse, now) {
    const t = (now - pulse.start) / 1000;
    if (t > 1.8) {
      return 0;
    }
    const dx = x - pulse.x;
    const dz = z - pulse.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const waveRadius = t * 2.4;
    const ring = Math.exp(-((dist - waveRadius) ** 2) / (2 * 0.3 * 0.3));
    const decay = Math.max(0, 1 - t / 1.8);
    return ring * decay * 0.55;
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  // Interaction: pointer parallax + hover swell + click ripple, all listened
  // on the hero section so text and links above the canvas keep working.
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  const pointer = { x: 0, z: 0, active: false, strength: 0 };
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  const pulses = [];

  function mapPointer(event) {
    const rect = hero.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    parallax.tx = nx;
    parallax.ty = ny;
    pointerNDC.set(nx, ny);
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObject(hitPlane);
    if (hits.length) {
      pointer.x = hits[0].point.x;
      pointer.z = hits[0].point.z;
      pointer.active = true;
    } else {
      pointer.active = false;
    }
  }

  hero.addEventListener("pointermove", mapPointer, { passive: true });

  hero.addEventListener("pointerleave", () => {
    pointer.active = false;
    parallax.tx = 0;
    parallax.ty = 0;
  });

  hero.addEventListener("click", (event) => {
    mapPointer(event);
    if (pointer.active) {
      pulses.push({ x: pointer.x, z: pointer.z, start: performance.now() });
    }
  });

  let isIntersecting = true;
  const io = new IntersectionObserver(
    (entries) => {
      isIntersecting = entries[0].isIntersecting;
    },
    { threshold: 0 }
  );
  io.observe(container);

  let lastTime = performance.now();
  let elapsed = 0;

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (!isIntersecting || document.hidden) {
      return;
    }

    elapsed += dt;

    parallax.x += (parallax.tx - parallax.x) * 0.04;
    parallax.y += (parallax.ty - parallax.y) * 0.04;
    camera.position.x = CAM_BASE.x + Math.sin(elapsed * 0.1) * 0.3 + parallax.x * 0.5;
    camera.position.y = CAM_BASE.y + parallax.y * 0.25;
    camera.lookAt(LOOK_AT);

    pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * 0.07;

    for (let i = 0; i < pulses.length; i++) {
      if (now - pulses[i].start > 1800) {
        pulses.splice(i, 1);
        i--;
      }
    }

    for (let i = 0; i < vertexCount; i++) {
      const x = baseX[i];
      const z = baseZ[i];
      let h = waveHeight(x, z, elapsed);

      if (pointer.strength > 0.01) {
        h += hoverBump(x, z, pointer.x, pointer.z) * pointer.strength;
      }

      for (let p = 0; p < pulses.length; p++) {
        h += ripplePulse(x, z, pulses[p], now);
      }

      gridPositions[i * 3 + 1] = h;

      const t = Math.max(0, Math.min(1, (h + 0.55) / 1.2));
      tmpColor.copy(colorLow).lerp(colorHigh, t);
      gridColors[i * 3] = tmpColor.r;
      gridColors[i * 3 + 1] = tmpColor.g;
      gridColors[i * 3 + 2] = tmpColor.b;
    }

    for (let k = 0; k < pointVertexIndices.length; k++) {
      pointPositions[k * 3 + 1] = gridPositions[pointVertexIndices[k] * 3 + 1] + 0.02;
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    pointPositionAttr.needsUpdate = true;

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
})();
