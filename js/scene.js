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

  const graph = new THREE.Group();
  scene.add(graph);

  // Fibonacci sphere distribution — an even, organic node layout.
  const NODE_COUNT = 30;
  const RADIUS = 1.7;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const jitter = () => (Math.random() - 0.5) * 0.12;

  const positions = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const y = 1 - (i / (NODE_COUNT - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * radiusAtY + jitter();
    const z = Math.sin(theta) * radiusAtY + jitter();
    positions.push(new THREE.Vector3(x, y + jitter(), z).multiplyScalar(RADIUS));
  }

  // Connect each node to its nearest neighbors to read as a system graph.
  const NEIGHBORS = 2;
  const edgeSet = new Set();
  const edges = [];

  positions.forEach((p, i) => {
    const nearest = positions
      .map((q, j) => ({ j, d: i === j ? Infinity : p.distanceTo(q) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, NEIGHBORS);

    nearest.forEach(({ j }) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push(i, j);
      }
    });
  });

  const linePositions = new Float32Array(edges.length * 3);
  edges.forEach((idx, k) => {
    const p = positions[idx];
    linePositions[k * 3] = p.x;
    linePositions[k * 3 + 1] = p.y;
    linePositions[k * 3 + 2] = p.z;
  });

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x0a1f33,
    transparent: true,
    opacity: 0.18,
  });
  graph.add(new THREE.LineSegments(lineGeometry, lineMaterial));

  // Node points, colored between the site's two blues.
  const nodePositions = new Float32Array(NODE_COUNT * 3);
  const nodeColors = new Float32Array(NODE_COUNT * 3);
  const baseColorA = new THREE.Color(0x2251ff);
  const baseColorB = new THREE.Color(0x042a77);

  positions.forEach((p, i) => {
    nodePositions[i * 3] = p.x;
    nodePositions[i * 3 + 1] = p.y;
    nodePositions[i * 3 + 2] = p.z;
    const mix = baseColorA.clone().lerp(baseColorB, Math.random());
    nodeColors[i * 3] = mix.r;
    nodeColors[i * 3 + 1] = mix.g;
    nodeColors[i * 3 + 2] = mix.b;
  });
  const baseColors = nodeColors.slice();

  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute("position", new THREE.BufferAttribute(nodePositions, 3));
  const colorAttr = new THREE.BufferAttribute(nodeColors, 3);
  nodeGeometry.setAttribute("color", colorAttr);

  const dotTexture = (() => {
    const size = 64;
    const dotCanvas = document.createElement("canvas");
    dotCanvas.width = size;
    dotCanvas.height = size;
    const ctx = dotCanvas.getContext("2d");
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.6, "rgba(255,255,255,0.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(dotCanvas);
  })();

  const nodeMaterial = new THREE.PointsMaterial({
    size: 0.14,
    map: dotTexture,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(nodeGeometry, nodeMaterial);
  graph.add(points);

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

  // Interaction: hover parallax, drag-to-spin, tap-to-pulse a node.
  let isDragging = false;
  let pointerInside = false;
  const previousPointer = { x: 0, y: 0 };
  let pointerTargetY = 0;
  let pointerCurrentY = 0;

  container.addEventListener("pointerenter", () => {
    pointerInside = true;
  });

  container.addEventListener("pointerleave", () => {
    pointerInside = false;
    pointerTargetY = 0;
  });

  container.addEventListener("pointermove", (event) => {
    const rect = container.getBoundingClientRect();
    pointerTargetY = ((event.clientY - rect.top) / rect.height) * 2 - 1;

    if (isDragging) {
      const dx = event.clientX - previousPointer.x;
      const dy = event.clientY - previousPointer.y;
      graph.rotation.y += dx * 0.005;
      graph.rotation.x = Math.max(-1, Math.min(1, graph.rotation.x + dy * 0.005));
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

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.12;
  const pulses = new Map();

  container.addEventListener("click", (event) => {
    const rect = container.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hits = raycaster.intersectObject(points);
    if (hits.length) {
      pulses.set(hits[0].index, performance.now());
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

  const highlight = new THREE.Color(0xffffff);
  const tmpColor = new THREE.Color();
  let lastTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (!isIntersecting || document.hidden) {
      return;
    }

    if (!isDragging) {
      graph.rotation.y += dt * 0.08;
    }

    pointerCurrentY += (pointerTargetY - pointerCurrentY) * 0.04;

    if (!isDragging && pointerInside) {
      graph.rotation.x += (-pointerCurrentY * 0.35 - graph.rotation.x) * 0.04;
    }

    if (pulses.size) {
      pulses.forEach((start, index) => {
        const t = (now - start) / 900;
        if (t >= 1) {
          pulses.delete(index);
          colorAttr.setXYZ(index, baseColors[index * 3], baseColors[index * 3 + 1], baseColors[index * 3 + 2]);
        } else {
          tmpColor.copy(highlight).lerp(baseColorA, t);
          colorAttr.setXYZ(index, tmpColor.r, tmpColor.g, tmpColor.b);
        }
      });
      colorAttr.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
})();
