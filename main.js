// == Variables & DOM refs ==
const sidebar = document.getElementById('sidebar');
const info = document.getElementById('info');
const canvasContainer = document.getElementById('canvas-container');
const shapesList = document.getElementById('shapes-list');
<script src="https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.min.js"></script>


// Controls and synced inputs
const controls = {
  pointsSize: document.getElementById('pointsSize'),
  pointsSizeNum: document.getElementById('pointsSizeNum'),
  lineWidth: document.getElementById('lineWidth'),
  lineWidthNum: document.getElementById('lineWidthNum'),
  ugliness: document.getElementById('ugliness'),
  uglinessNum: document.getElementById('uglinessNum'),
  modelSize: document.getElementById('modelSize'),
  modelSizeNum: document.getElementById('modelSizeNum'),
  vertexCount: document.getElementById('vertexCount'),
  vertexCountNum: document.getElementById('vertexCountNum'),
  rotationSpeed: document.getElementById('rotationSpeed'),
  rotationSpeedNum: document.getElementById('rotationSpeedNum'),
  rotationAxisX: document.getElementById('rotationAxisX'),
  rotationAxisXNum: document.getElementById('rotationAxisXNum'),
  rotationAxisY: document.getElementById('rotationAxisY'),
  rotationAxisYNum: document.getElementById('rotationAxisYNum'),
  rotationAxisZ: document.getElementById('rotationAxisZ'),
  rotationAxisZNum: document.getElementById('rotationAxisZNum'),
  pointsOnly: document.getElementById('pointsOnly'),
  bgColor: document.getElementById('bgColor'),
  wfColor: document.getElementById('wfColor'),

  refreshBtn: document.getElementById('refreshBtn'),
  resetBtn: document.getElementById('resetBtn'),
  randomizeBtn: document.getElementById('randomizeBtn')
};

// === THREE.js Setup ===
let scene, camera, renderer, wireframe, points;
let rotationAxis = new THREE.Vector3(0.5, 0.5, 0.5);
let rotationSpeed = 0.025;

init();
animate();

// === Shape presets ===
const shapePresets = {
  Cube: new THREE.BoxGeometry(1, 1, 1),
  Tetrahedron: new THREE.TetrahedronGeometry(1),
  Octahedron: new THREE.OctahedronGeometry(1),
  Dodecahedron: new THREE.DodecahedronGeometry(1),
  Icosahedron: new THREE.IcosahedronGeometry(1),
  Sphere: new THREE.SphereGeometry(1, 32, 32),
  Torus: new THREE.TorusGeometry(0.6, 0.2, 16, 100),
  Cone: new THREE.ConeGeometry(0.8, 1.2, 16),
  Cylinder: new THREE.CylinderGeometry(0.7, 0.7, 1.5, 16),
  Plane: new THREE.PlaneGeometry(1, 1, 10, 10),
  Circle: new THREE.CircleGeometry(1, 32)
};

let currentGeometry = shapePresets.Cube;
let currentShapeName = 'Cube';

// === Init Three and UI ===
function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(75, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
  camera.position.z = 3;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  canvasContainer.appendChild(renderer.domElement);

  setupWireframe();

  // Populate shapes list UI
  for (const name in shapePresets) {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.onclick = () => {
      currentShapeName = name;
      currentGeometry = shapePresets[name];
      markSelectedShape(name);
      refreshWireframe();
    };
    shapesList.appendChild(btn);
  }
  markSelectedShape(currentShapeName);

  // Sync sliders and number inputs
  Object.keys(controls).forEach(key => {
    if (controls[key] && controls[key].tagName === 'INPUT' && (controls[key].type === 'range' || controls[key].type === 'number')) {
      const pairedKey = key.endsWith('Num') ? key.slice(0, -3) : key + 'Num';
      if (controls[pairedKey]) {
        controls[key].addEventListener('input', () => {
          controls[pairedKey].value = controls[key].value;
          if (key.startsWith('rotationAxis') || key === 'rotationSpeed') updateRotationAxisAndSpeed();
        });
      }
    }
  });

  // Checkbox listener
  controls.pointsOnly.addEventListener('change', refreshWireframe);

  // Color pickers listener
  controls.bgColor.addEventListener('input', () => {
    renderer.setClearColor(controls.bgColor.value);
  });
  controls.wfColor.addEventListener('input', refreshWireframe);

  // Buttons listeners
  controls.refreshBtn.addEventListener('click', refreshWireframe);
  controls.resetBtn.addEventListener('click', resetSettings);
  controls.randomizeBtn.addEventListener('click', randomizeSettings);

  // Keyboard toggle sidebar
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'm') {
      sidebar.classList.toggle('hidden');
    }
  });

  window.addEventListener('resize', onWindowResize);

  // Initialize colors
  renderer.setClearColor(controls.bgColor.value);
}

// === Wireframe setup ===
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

  let geom = currentGeometry.clone();

  // Scale geometry
  const size = parseFloat(controls.modelSize.value);
  geom.scale(size, size, size);

  // Ugliness (noise) - add to position attribute directly
  const ugliness = parseFloat(controls.ugliness.value);
  if (ugliness > 0 && geom.attributes.position) {
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, pos.getX(i) + (Math.random() * 2 - 1) * ugliness);
      pos.setY(i, pos.getY(i) + (Math.random() * 2 - 1) * ugliness);
      pos.setZ(i, pos.getZ(i) + (Math.random() * 2 - 1) * ugliness);
    }
    pos.needsUpdate = true;
  }

  // Points only or wireframe
  if (controls.pointsOnly.checked) {
    const pointsMaterial = new THREE.PointsMaterial({
      color: controls.wfColor.value,
      size: parseFloat(controls.pointsSize.value),
      sizeAttenuation: true
    });
    points = new THREE.Points(geom, pointsMaterial);
    scene.add(points);
  } else {
    const edges = new THREE.EdgesGeometry(geom);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: controls.wfColor.value,
      linewidth: parseFloat(controls.lineWidth.value)
    });
    wireframe = new THREE.LineSegments(edges, lineMaterial);
    scene.add(wireframe);
  }
}


// === Simplify geometry (reduce vertex count) ===
function simplifyGeometry(geometry, vertexPercent) {
  // This is a hack since THREE.Geometry is deprecated
  // Convert BufferGeometry to Geometry for easier manipulation
  // Use cloned BufferGeometry directly; skip vertex removal for now (fix later)
  let geom = geometry.clone();

  // Scale geometry
  const size = parseFloat(controls.modelSize.value);
  geom.scale(size, size, size);

  return geom;

}

// === Update rotation vector and speed from inputs ===
function updateRotationAxisAndSpeed() {
  rotationAxis.set(
    parseFloat(controls.rotationAxisX.value),
    parseFloat(controls.rotationAxisY.value),
    parseFloat(controls.rotationAxisZ.value)
  );
  rotationAxis.normalize();
  rotationSpeed = parseFloat(controls.rotationSpeed.value);
}

// === Mark selected shape button ===
function markSelectedShape(name) {
  [...shapesList.children].forEach(btn => {
    btn.classList.toggle('selected', btn.textContent === name);
  });
}

// === Refresh Wireframe ===
function refreshWireframe() {
  updateRotationAxisAndSpeed();
  setupWireframe();
}

// === Reset all settings to default ===
function resetSettings() {
  controls.pointsSize.value = 3;
  controls.pointsSizeNum.value = 3;
  controls.lineWidth.value = 1;
  controls.lineWidthNum.value = 1;
  controls.ugliness.value = 0;
  controls.uglinessNum.value = 0;
  controls.modelSize.value = 1;
  controls.modelSizeNum.value = 1;
  controls.vertexCount.value = 100;
  controls.vertexCountNum.value = 100;
  controls.rotationSpeed.value = 0.025;
  controls.rotationSpeedNum.value = 0.025;
  controls.rotationAxisX.value = 0.5;
  controls.rotationAxisXNum.value = 0.5;
  controls.rotationAxisY.value = 0.5;
  controls.rotationAxisYNum.value = 0.5;
  controls.rotationAxisZ.value = 0.5;
  controls.rotationAxisZNum.value = 0.5;
  controls.pointsOnly.checked = false;
  controls.bgColor.value = '#121212';
  controls.wfColor.value = '#1de9b6';

  renderer.setClearColor(controls.bgColor.value);
  markSelectedShape('Cube');
  currentShapeName = 'Cube';
  currentGeometry = shapePresets.Cube;

  refreshWireframe();
}

// === Randomize all settings ===
function randomizeSettings() {
  const randRange = (min, max, step=0.01) => {
    const range = max - min;
    const steps = Math.floor(range / step);
    const val = min + Math.floor(Math.random() * (steps + 1)) * step;
    return parseFloat(val.toFixed(3));
  };

  controls.pointsSize.value = randRange(0, 10, 0.5);
  controls.pointsSizeNum.value = controls.pointsSize.value;

  controls.lineWidth.value = randRange(1, 10, 0.5);
  controls.lineWidthNum.value = controls.lineWidth.value;

  controls.ugliness.value = randRange(0, 0.7, 0.01);
  controls.uglinessNum.value = controls.ugliness.value;

  controls.modelSize.value = randRange(0.3, 4, 0.1);
  controls.modelSizeNum.value = controls.modelSize.value;

  controls.vertexCount.value = Math.floor(randRange(10, 100, 5));
  controls.vertexCountNum.value = controls.vertexCount.value;

  controls.rotationSpeed.value = randRange(0, 0.12, 0.001);
  controls.rotationSpeedNum.value = controls.rotationSpeed.value;

  controls.rotationAxisX.value = randRange(-1, 1, 0.01);
  controls.rotationAxisXNum.value = controls.rotationAxisX.value;

  controls.rotationAxisY.value = randRange(-1, 1, 0.01);
  controls.rotationAxisYNum.value = controls.rotationAxisY.value;

  controls.rotationAxisZ.value = randRange(-1, 1, 0.01);
  controls.rotationAxisZNum.value = controls.rotationAxisZ.value;

  controls.pointsOnly.checked = Math.random() < 0.5;

  controls.bgColor.value = '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0');
  controls.wfColor.value = '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0');

  renderer.setClearColor(controls.bgColor.value);

  refreshWireframe();
}

// === Handle window resizing ===
function onWindowResize() {
  camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
}

// === Animation Loop ===
function animate() {
  requestAnimationFrame(animate);
  const rotSpeed = rotationSpeed;

  if (wireframe) wireframe.rotateOnAxis(rotationAxis, rotSpeed);
  if (points) points.rotateOnAxis(rotationAxis, rotSpeed);

  renderer.render(scene, camera);
}
