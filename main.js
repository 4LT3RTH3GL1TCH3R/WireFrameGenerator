import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js";

let scene, camera, renderer, wireframe, points;
let controls = {};
let currentGeometry;
let sidebarOpen = false;

init();

function init() {
  // Scene
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.z = 5;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // UI
  createSidebar();
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "m") toggleSidebar();
  });

  loadGeometry();
  animate();
}

function loadGeometry() {
  currentGeometry = new THREE.BoxGeometry(1, 1, 1); // Replace with your model if needed
  setupWireframe();
}

function setupWireframe() {
  if (wireframe) {
    scene.remove(wireframe);
    wireframe.geometry.dispose();
    wireframe.material.dispose();
    wireframe = null;
  }

  if (points) {
    scene.remove(points);
    points.geometry.dispose();
    points.material.dispose();
    points = null;
  }

  const size = parseFloat(controls.modelSize.value);
  const ugliness = parseFloat(controls.ugliness.value);
  const pointSize = parseFloat(controls.pointsSize.value);
  const color = new THREE.Color(controls.wfColor.value);
  const lineWidth = parseFloat(controls.lineWidth.value);

  const geom = currentGeometry.clone();
  geom.scale(size, size, size);

  const posAttr = geom.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    posAttr.setX(i, posAttr.getX(i) + (Math.random() * 2 - 1) * ugliness);
    posAttr.setY(i, posAttr.getY(i) + (Math.random() * 2 - 1) * ugliness);
    posAttr.setZ(i, posAttr.getZ(i) + (Math.random() * 2 - 1) * ugliness);
  }
  posAttr.needsUpdate = true;

  if (controls.pointsOnly.checked) {
    const material = new THREE.PointsMaterial({ color, size: pointSize });
    points = new THREE.Points(geom, material);
    scene.add(points);
  } else {
    const edges = new THREE.EdgesGeometry(geom);
    const material = new THREE.LineBasicMaterial({ color, linewidth: lineWidth });
    wireframe = new THREE.LineSegments(edges, material);
    scene.add(wireframe);
  }
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById("sidebar").style.transform = sidebarOpen ? "translateX(0)" : "translateX(-100%)";
}

function createSidebar() {
  const html = `
    <div id="sidebar" style="
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: 260px;
      background: #111;
      padding: 20px;
      overflow-y: auto;
      transform: translateX(-100%);
      transition: transform 0.3s ease;
      z-index: 1000;
    ">
      <h2 style="color: white;">Wireframe Settings</h2>
      <label>Color: <input type="color" id="wfColor" value="#00ffff" /></label><br><br>
      <label>Line Width: <input type="number" id="lineWidth" min="1" max="10" value="1" /></label><br><br>
      <label>Model Size: <input type="number" id="modelSize" min="0.1" max="10" step="0.1" value="1" /></label><br><br>
      <label>Ugliness: <input type="range" id="ugliness" min="0" max="1" step="0.01" value="0" /></label><br><br>
      <label>Points Only: <input type="checkbox" id="pointsOnly" /></label><br><br>
      <label>Point Size: <input type="number" id="pointsSize" min="0.1" max="10" step="0.1" value="0.1" /></label><br><br>
      <button id="applyBtn">Apply</button>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);

  controls = {
    wfColor: document.getElementById("wfColor"),
    lineWidth: document.getElementById("lineWidth"),
    modelSize: document.getElementById("modelSize"),
    ugliness: document.getElementById("ugliness"),
    pointsOnly: document.getElementById("pointsOnly"),
    pointsSize: document.getElementById("pointsSize")
  };

  document.getElementById("applyBtn").addEventListener("click", () => {
    setupWireframe();
  });
}
