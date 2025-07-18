(() => {
  // Grab DOM elements
  const sidebar = document.getElementById('sidebar');
  const info = document.getElementById('info');
  const canvasContainer = document.getElementById('canvas-container');

  const inputs = {
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

    pointsOnly: document.getElementById('pointsOnly'),

    bgColor: document.getElementById('bgColor'),
    wfColor: document.getElementById('wfColor'),

    refreshBtn: document.getElementById('refreshBtn'),
    resetBtn: document.getElementById('resetBtn'),
    randomizeBtn: document.getElementById('randomizeBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
  };

  const shapesList = document.getElementById('shapes-list');

  // Shapes from UI script (must match)
  const shapes = ['Box', 'Sphere', 'Tetrahedron', 'Octahedron', 'Dodecahedron', 'Icosahedron'];

  let selectedShapeIndex = -1; // default random

  // Sync slider and number inputs
  function syncSliderNumber(slider, number) {
    slider.addEventListener('input', () => {
      number.value = slider.value;
    });
    number.addEventListener('change', () => {
      let val = parseFloat(number.value);
      if (isNaN(val)) val = slider.min;
      val = Math.min(slider.max, Math.max(slider.min, val));
      number.value = val;
      slider.value = val;
      slider.dispatchEvent(new Event('input'));
    });
  }

  syncSliderNumber(inputs.pointsSize, inputs.pointsSizeNum);
  syncSliderNumber(inputs.lineWidth, inputs.lineWidthNum);
  syncSliderNumber(inputs.ugliness, inputs.uglinessNum);
  syncSliderNumber(inputs.modelSize, inputs.modelSizeNum);
  syncSliderNumber(inputs.vertexCount, inputs.vertexCountNum);
  syncSliderNumber(inputs.rotationSpeed, inputs.rotationSpeedNum);

  // Build shapes buttons with selection
  function buildShapesList() {
    shapesList.innerHTML = '';

    // Random shape button
    const randomBtn = document.createElement('button');
    randomBtn.textContent = 'Random Shape';
    randomBtn.classList.toggle('selected', selectedShapeIndex === -1);
    randomBtn.addEventListener('click', () => {
      selectedShapeIndex = -1;
      buildShapesList();
      generateWireframe();
    });
    shapesList.appendChild(randomBtn);

    shapes.forEach((shape, i) => {
      const btn = document.createElement('button');
      btn.textContent = shape;
      btn.classList.toggle('selected', selectedShapeIndex === i);
      btn.addEventListener('click', () => {
        selectedShapeIndex = i;
        buildShapesList();
        generateWireframe();
      });
      shapesList.appendChild(btn);
    });
  }

  buildShapesList();

  // Sidebar toggle on 'M'
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'm') {
      sidebar.classList.toggle('hidden');
    }
  });


  // THREE.js setup
  let scene, camera, renderer;
  let wireframeGroup;
  let rotationAxis;
  let rotationSpeed = 0.02;

  function initThree() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth - 340, window.innerHeight);
    renderer.setClearColor(inputs.bgColor.value);
    canvasContainer.innerHTML = '';
    canvasContainer.appendChild(renderer.domElement);

    wireframeGroup = new THREE.Group();
    scene.add(wireframeGroup);

    rotationAxis = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();

    window.addEventListener('resize', onWindowResize);
  }

  function onWindowResize() {
    camera.aspect = (window.innerWidth - 340) / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth - 340, window.innerHeight);
  }

  // Create geometry based on shape name and vertex count detail
  function createGeometry(shapeName, detailPercent) {
    const detail = Math.floor((detailPercent / 100) * 5); // detail 0-5 for sphere, etc.

    switch(shapeName) {
      case 'Box':
        return new THREE.BoxGeometry(1,1,1, detail+1, detail+1, detail+1);
      case 'Sphere':
        return new THREE.IcosahedronGeometry(1, detail);
      case 'Tetrahedron':
        return new THREE.TetrahedronGeometry(1, detail);
      case 'Octahedron':
        return new THREE.OctahedronGeometry(1, detail);
      case 'Dodecahedron':
        return new THREE.DodecahedronGeometry(1, detail);
      case 'Icosahedron':
        return new THREE.IcosahedronGeometry(1, detail);
      default:
        // fallback box
        return new THREE.BoxGeometry(1,1,1, 1,1,1);
    }
  }

  // Apply ugliness: randomly displace vertices by up to ugliness amount
  function applyUgliness(geometry, ugliness) {
    const pos = geometry.attributes.position;
    for (let i=0; i<pos.count; i++) {
      const offsetX = (Math.random() - 0.5) * ugliness * 2;
      const offsetY = (Math.random() - 0.5) * ugliness * 2;
      const offsetZ = (Math.random() - 0.5) * ugliness * 2;
      pos.setXYZ(
        i,
        pos.getX(i) + offsetX,
        pos.getY(i) + offsetY,
        pos.getZ(i) + offsetZ
      );
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  // Create wireframe or points mesh from geometry
  function createWireframeMesh(geometry, color, pointsSize, lineWidth, pointsOnly) {
    if (pointsOnly) {
      const material = new THREE.PointsMaterial({
        color,
        size: pointsSize,
        sizeAttenuation: true,
      });
      return new THREE.Points(geometry, material);
    } else {
      const edges = new THREE.EdgesGeometry(geometry);
      const material = new THREE.LineBasicMaterial({
        color,
        linewidth: lineWidth, // note: linewidth often ignored in most browsers
      });
      return new THREE.LineSegments(edges, material);
    }
  }

  // Generate and display wireframe based on current settings
  function generateWireframe() {
    if (wireframeGroup) {
      // Clean old
      wireframeGroup.clear();
      wireframeGroup.rotation.set(0,0,0);
    }

    // Determine shape
    let shapeName;
    if (selectedShapeIndex === -1) {
      shapeName = shapes[Math.floor(Math.random() * shapes.length)];
    } else {
      shapeName = shapes[selectedShapeIndex];
    }

    // Create geometry
    let geom = createGeometry(shapeName, parseFloat(inputs.vertexCount.value));

    // Apply ugliness noise
    applyUgliness(geom, parseFloat(inputs.ugliness.value));

    // Scale geometry (model size)
    geom.scale(parseFloat(inputs.modelSize.value), parseFloat(inputs.modelSize.value), parseFloat(inputs.modelSize.value));

    // Create mesh
    const mesh = createWireframeMesh(
      geom,
      inputs.wfColor.value,
      parseFloat(inputs.pointsSize.value),
      parseFloat(inputs.lineWidth.value),
      inputs.pointsOnly.checked
    );

    wireframeGroup.add(mesh);

    // Randomize rotation axis
    rotationAxis = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();

    // Update rotation speed
    rotationSpeed = parseFloat(inputs.rotationSpeed.value);
  }

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);

    if (wireframeGroup) {
      wireframeGroup.rotateOnAxis(rotationAxis, rotationSpeed);
    }

    renderer.render(scene, camera);
  }

  // Reset all inputs to default values
  function resetSettings() {
    inputs.pointsSize.value = 3;
    inputs.pointsSizeNum.value = 3;

    inputs.lineWidth.value = 1;
    inputs.lineWidthNum.value = 1;

    inputs.ugliness.value = 0;
    inputs.uglinessNum.value = 0;

    inputs.modelSize.value = 1;
    inputs.modelSizeNum.value = 1;

    inputs.vertexCount.value = 100;
    inputs.vertexCountNum.value = 100;

    inputs.rotationSpeed.value = 0.02;
    inputs.rotationSpeedNum.value = 0.02;

    inputs.pointsOnly.checked = false;

    inputs.bgColor.value = '#121212';
    inputs.wfColor.value = '#1de9b6';

    applyColors();
    generateWireframe();
  }

  // Randomize all settings in range
  function randomizeSettings() {
    function randRange(min, max, step = 0.01) {
      const r = Math.random() * (max - min) + min;
      return Math.round(r / step) * step;
    }
    inputs.pointsSize.value = randRange(0, 10, 1);
    inputs.pointsSizeNum.value = inputs.pointsSize.value;

    inputs.lineWidth.value = randRange(1, 10, 1);
    inputs.lineWidthNum.value = inputs.lineWidth.value;

    inputs.ugliness.value = randRange(0, 0.5, 0.01);
    inputs.uglinessNum.value = inputs.ugliness.value;

    inputs.modelSize.value = randRange(0.5, 3, 0.1);
    inputs.modelSizeNum.value = inputs.modelSize.value;

    inputs.vertexCount.value = randRange(10, 100, 5);
    inputs.vertexCountNum.value = inputs.vertexCount.value;

    inputs.rotationSpeed.value = randRange(0, 0.1, 0.001);
    inputs.rotationSpeedNum.value = inputs.rotationSpeed.value;

    inputs.pointsOnly.checked = Math.random() > 0.5;

    inputs.bgColor.value = `#${Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0')}`;
    inputs.wfColor.value = `#${Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0')}`;

    applyColors();
    generateWireframe();
  }

  // Apply bg and wireframe colors dynamically
  function applyColors() {
    renderer.setClearColor(inputs.bgColor.value);
  }

  // Button event listeners
  inputs.refreshBtn.addEventListener('click', () => {
    applyColors();
    generateWireframe();
  });

  inputs.resetBtn.addEventListener('click', () => {
    resetSettings();
  });

  inputs.randomizeBtn.addEventListener('click', () => {
    randomizeSettings();
  });

  // Download button is placeholder for now
  inputs.downloadBtn.addEventListener('click', () => {
    alert('Video generation not implemented yet.');
  });

  // Listen to color changes live
  inputs.bgColor.addEventListener('input', () => {
    applyColors();
  });

  inputs.wfColor.addEventListener('input', () => {
    generateWireframe();
  });

  // Initialize everything
  function init() {
    sidebar.style.display = 'flex';
    info.style.display = 'none';

    initThree();
    resetSettings();
    animate();
  }

  init();
})();
