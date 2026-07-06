import * as THREE from "./vendor/three.module.min.js";

(() => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    return;
  }

  const container = document.querySelector(".hero-scene");
  if (!container) {
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
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (e) {
    container.removeChild(canvas);
    return;
  }

  document.documentElement.classList.add("has-3d-scene");

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 5.4);

  const field = new THREE.Group();
  const BASE_TILT_X = -0.55;
  field.rotation.x = BASE_TILT_X;
  scene.add(field);

  // A grid of vertices, deformed each frame into a flowing wireframe surface.
  const SEGMENTS = 34;
  const PLANE_SIZE = 3.6;
  const VERTS_PER_SIDE = SEGMENTS + 1;
  const step = PLANE_SIZE / SEGMENTS;
  const half = PLANE_SIZE / 2;

  const vertexCount = VERTS_PER_SIDE * VERTS_PER_SIDE;
  const gridPositions = new Float32Array(vertexCount * 3);
  const gridColors = new Float32Array(vertexCount * 3);
  const baseX = new Float32Array(vertexCount);
  const baseY = new Float32Array(vertexCount);

  let vi = 0;
  for (let iy = 0; iy < VERTS_PER_SIDE; iy++) {
    for (let ix = 0; ix < VERTS_PER_SIDE; ix++) {
      const x = ix * step - half;
      const y = iy * step - half;
      baseX[vi] = x;
      baseY[vi] = y;
      gridPositions[vi * 3] = x;
      gridPositions[vi * 3 + 1] = y;
      gridPositions[vi * 3 + 2] = 0;
      vi++;
    }
  }

  const edgeIndices = [];
  for (let iy = 0; iy < VERTS_PER_SIDE; iy++) {
    for (let ix = 0; ix < VERTS_PER_SIDE; ix++) {
      const i = iy * VERTS_PER_SIDE + ix;
      if (ix < SEGMENTS) {
        edgeIndices.push(i, i + 1);
      }
      if (iy < SEGMENTS) {
        edgeIndices.push(i, i + VERTS_PER_SIDE);
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
    opacity: 0.6,
  });

  field.add(new THREE.LineSegments(gridGeometry, gridMaterial));

  // Invisible proxy plane, used only to translate pointer position into the
  // field's local (x, y) space for the hover/click ripples.
  const hitPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  field.add(hitPlane);

  const colorLow = new THREE.Color(0x042a77);
  const colorHigh = new THREE.Color(0x2251ff);
  const tmpColor = new THREE.Color();

  function waveHeight(x, y, t) {
    return (
      Math.sin(x * 0.9 + t * 0.5) * 0.1 +
      Math.sin(y * 0.75 - t * 0.35) * 0.09 +
      Math.sin((x + y) * 0.55 + t * 0.22) * 0.07 +
      Math.sin((x - y) * 0.65 + t * 0.4) * 0.05
    );
  }

  function hoverBump(x, y, px, py) {
    const dx = x - px;
    const dy = y - py;
    const distSq = dx * dx + dy * dy;
    return 0.35 * Math.exp(-distSq / (2 * 0.6 * 0.6));
  }

  function ripplePulse(x, y, pulse, now) {
    const t = (now - pulse.start) / 1000;
    if (t > 1.6) {
      return 0;
    }
    const dx = x - pulse.x;
    const dy = y - pulse.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const waveRadius = t * 2.2;
    const ring = Math.exp(-((dist - waveRadius) ** 2) / (2 * 0.18 * 0.18));
    const decay = Math.max(0, 1 - t / 1.6);
    return ring * decay * 0.5;
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

  // Interaction: hover ripple, drag-to-tilt, click-to-ripple.
  let isDragging = false;
  let pointerInside = false;
  const previousPointer = { x: 0, y: 0 };
  let manualRotationY = 0;
  let pointerLocal = null;

  const raycaster = new THREE.Raycaster();

  function updatePointerLocal(event) {
    const rect = container.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hits = raycaster.intersectObject(hitPlane);
    pointerLocal = hits.length ? hitPlane.worldToLocal(hits[0].point.clone()) : null;
  }

  container.addEventListener("pointerenter", () => {
    pointerInside = true;
  });

  container.addEventListener("pointerleave", () => {
    pointerInside = false;
    pointerLocal = null;
  });

  container.addEventListener("pointermove", (event) => {
    updatePointerLocal(event);

    if (isDragging) {
      const dx = event.clientX - previousPointer.x;
      const dy = event.clientY - previousPointer.y;
      manualRotationY = Math.max(-0.6, Math.min(0.6, manualRotationY + dx * 0.005));
      field.rotation.x = Math.max(-0.9, Math.min(-0.3, field.rotation.x + dy * 0.005));
      previousPointer.x = event.clientX;
      previousPointer.y = event.clientY;
    }
  });

  container.addEventListener("pointerdown", (event) => {
    isDragging = true;
    previousPointer.x = event.clientX;
    previousPointer.y = event.clientY;
    container.classList.add("is-dragging");
    if (container.setPointerCapture) {
      container.setPointerCapture(event.pointerId);
    }
  });

  function endDrag(event) {
    isDragging = false;
    container.classList.remove("is-dragging");
    if (event && container.hasPointerCapture && container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
  }
  container.addEventListener("pointerup", endDrag);
  container.addEventListener("pointercancel", endDrag);

  const pulses = [];

  container.addEventListener("click", (event) => {
    updatePointerLocal(event);
    if (pointerLocal) {
      pulses.push({ x: pointerLocal.x, y: pointerLocal.y, start: performance.now() });
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

    const sway = isDragging ? 0 : Math.sin(elapsed * 0.15) * 0.12;
    field.rotation.y = manualRotationY + sway;

    for (let i = 0; i < pulses.length; i++) {
      if (now - pulses[i].start > 1600) {
        pulses.splice(i, 1);
        i--;
      }
    }

    for (let i = 0; i < vertexCount; i++) {
      const x = baseX[i];
      const y = baseY[i];
      let h = waveHeight(x, y, elapsed);

      if (pointerInside && !isDragging && pointerLocal) {
        h += hoverBump(x, y, pointerLocal.x, pointerLocal.y);
      }

      for (let p = 0; p < pulses.length; p++) {
        h += ripplePulse(x, y, pulses[p], now);
      }

      gridPositions[i * 3 + 2] = h;

      const t = Math.max(0, Math.min(1, (h + 0.15) / 0.65));
      tmpColor.copy(colorLow).lerp(colorHigh, t);
      gridColors[i * 3] = tmpColor.r;
      gridColors[i * 3 + 1] = tmpColor.g;
      gridColors[i * 3 + 2] = tmpColor.b;
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
})();
