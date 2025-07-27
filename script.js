const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const group = new THREE.Group();

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function generateWireframeFromSeed(seedData) {
  const vertices = seedData.vertices.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const geometry = new THREE.BufferGeometry();
  const positions = [];

  for (const [i, j] of seedData.edges) {
    const a = vertices[i];
    const b = vertices[j];
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: seedData.color });
  const wireframe = new THREE.LineSegments(geometry, material);
  group.add(wireframe);
  scene.add(group);
  camera.position.z = 15;

  return { spinX: seedData.spinX, spinY: seedData.spinY };
}

function generateRandomWireframe() {
  const seedData = {
    vertices: [],
    edges: [],
    color: null,
    spinX: null,
    spinY: null
  };

  const numPoints = Math.floor(rand(10, 50));
  const vertices = [];

  for (let i = 0; i < numPoints; i++) {
    const x = rand(-5, 5), y = rand(-5, 5), z = rand(-5, 5);
    const v = new THREE.Vector3(x, y, z);
    vertices.push(v);
    seedData.vertices.push([x, y, z]);
  }

  const geometry = new THREE.BufferGeometry();
  const positions = [];

  for (let i = 0; i < numPoints; i++) {
    const conns = Math.floor(rand(1, 4));
    for (let j = 0; j < conns; j++) {
      const target = Math.floor(Math.random() * numPoints);
      if (target !== i) {
        const a = vertices[i], b = vertices[target];
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        seedData.edges.push([i, target]);
      }
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const color = Math.floor(Math.random() * 0xffffff);
  seedData.color = color;
  const material = new THREE.LineBasicMaterial({ color });
  const wireframe = new THREE.LineSegments(geometry, material);

  group.add(wireframe);
  scene.add(group);
  camera.position.z = 15;

  const spinX = rand(-0.02, 0.02);
  const spinY = rand(-0.02, 0.02);
  seedData.spinX = spinX;
  seedData.spinY = spinY;

  const encoded = btoa(JSON.stringify(seedData));
  document.getElementById("seedDisplay").textContent = "Seed: " + encoded;
  history.replaceState(null, "", `?seed=${encoded}`);

  return { spinX, spinY };
}

let spinX = 0;
let spinY = 0;

const urlParams = new URLSearchParams(window.location.search);
const seedParam = urlParams.get("seed");

if (seedParam) {
  try {
    const seedData = JSON.parse(atob(seedParam));
    ({ spinX, spinY } = generateWireframeFromSeed(seedData));
    document.getElementById("seedDisplay").textContent = "Seed: " + seedParam;
  } catch (err) {
    console.error("Invalid seed");
    ({ spinX, spinY } = generateRandomWireframe());
  }
} else {
  ({ spinX, spinY } = generateRandomWireframe());
}

function animate() {
  requestAnimationFrame(animate);
  group.rotation.x += spinX;
  group.rotation.y += spinY;
  renderer.render(scene, camera);
}

animate();
