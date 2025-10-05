// 3D Wireframe Generator with WebGL
class Wireframe3DGenerator {
    constructor() {
        this.canvas = document.getElementById('wireframeCanvas');
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        
        if (!this.gl) {
            alert('WebGL not supported! Please use a modern browser.');
            return;
        }
        
        this.points = [];
        this.connections = [];
        this.faces = [];
        this.selectedPointIndex = -1;
        this.selectedFaceIndex = -1;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0, z: 0 };
        this.animationId = null;
        
        // 3D specific properties
        this.camera = {
            position: { x: 0, y: 0, z: 20 },
            rotation: { x: 0, y: 0, z: 0 },
            fov: 75,
            near: 0.1,
            far: 100
        };
        
        this.rotation = { x: 0, y: 0, z: 0 };
        this.rotationSpeed = { x: 0.01, y: 0.007, z: 0.013 };
        
        this.settings = {
            pointCount: 8,
            connectionDensity: 0.3,
            pointSize: 6,
            lineWidth: 2,
            backgroundColor: '#1a1a2e',
            randomColors: false,
            animateWireframe: false,
            randomRotation: true,
            rotationSpeed: 0.01,
            editMode: false,
            showFaces: true,
            faceOpacity: 0.3,
            cameraDistance: 20,
            fieldOfView: 75,
            autoRotate: true
        };
        
        this.mousePos = { x: 0, y: 0 };
        this.mouseDown = false;
        this.lastMousePos = { x: 0, y: 0 };
        
        // WebGL shaders and programs
        this.shaderProgram = null;
        this.pointProgram = null;
        this.faceProgram = null;
        
        // Matrix utilities
        this.mat4 = this.createMat4Utils();
        this.vec3 = this.createVec3Utils();
        
        this.init();
    }

    init() {
        this.setupCanvas();
        this.initWebGL();
        this.setupEventListeners();
        this.generateRandomWireframe();
        this.updateDisplay();
        this.startRenderLoop();
    }

    setupCanvas() {
        const canvasContainer = document.querySelector('.canvas-container');
        const resizeCanvas = () => {
            const rect = canvasContainer.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            if (this.gl) {
                this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            }
        };
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }

    initWebGL() {
        const gl = this.gl;
        
        // Vertex shader source
        const vertexShaderSource = `
            attribute vec3 a_position;
            attribute vec3 a_color;
            uniform mat4 u_modelViewMatrix;
            uniform mat4 u_projectionMatrix;
            uniform float u_pointSize;
            varying vec3 v_color;
            
            void main() {
                gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(a_position, 1.0);
                gl_PointSize = u_pointSize;
                v_color = a_color;
            }
        `;
        
        // Fragment shader source
        const fragmentShaderSource = `
            precision mediump float;
            varying vec3 v_color;
            uniform float u_opacity;
            
            void main() {
                gl_FragColor = vec4(v_color, u_opacity);
            }
        `;
        
        // Face fragment shader
        const faceFragmentShaderSource = `
            precision mediump float;
            varying vec3 v_color;
            uniform float u_opacity;
            
            void main() {
                gl_FragColor = vec4(v_color, u_opacity);
            }
        `;
        
        // Compile shaders
        const vertexShader = this.compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
        const fragmentShader = this.compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
        const faceFragmentShader = this.compileShader(gl, faceFragmentShaderSource, gl.FRAGMENT_SHADER);
        
        // Create shader programs
        this.shaderProgram = this.createShaderProgram(gl, vertexShader, fragmentShader);
        this.pointProgram = this.createShaderProgram(gl, vertexShader, fragmentShader);
        this.faceProgram = this.createShaderProgram(gl, vertexShader, faceFragmentShader);
        
        // Get attribute and uniform locations
        this.programInfo = {
            attribLocations: {
                position: gl.getAttribLocation(this.shaderProgram, 'a_position'),
                color: gl.getAttribLocation(this.shaderProgram, 'a_color'),
            },
            uniformLocations: {
                projectionMatrix: gl.getUniformLocation(this.shaderProgram, 'u_projectionMatrix'),
                modelViewMatrix: gl.getUniformLocation(this.shaderProgram, 'u_modelViewMatrix'),
                pointSize: gl.getUniformLocation(this.shaderProgram, 'u_pointSize'),
                opacity: gl.getUniformLocation(this.shaderProgram, 'u_opacity'),
            },
        };
        
        // Enable depth testing and blending
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // Set clear color
        this.updateBackgroundColor();
    }

    compileShader(gl, source, type) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Error compiling shader:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }

    createShaderProgram(gl, vertexShader, fragmentShader) {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Error linking shader program:', gl.getProgramInfoLog(program));
            return null;
        }
        
        return program;
    }

    setupEventListeners() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                this.toggleSidepanel();
            }
            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                this.generateRandomWireframe();
            }
            if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                this.clearCanvas();
            }
            if (e.key === 'Escape') {
                this.selectedPointIndex = -1;
                this.selectedFaceIndex = -1;
                this.updatePointSelector();
                this.updateFaceSelector();
            }
        });

        // Sidepanel controls
        document.getElementById('toggleSidepanel').addEventListener('click', () => this.toggleSidepanel());
        document.getElementById('closeSidepanel').addEventListener('click', () => this.hideSidepanel());
        document.getElementById('generateRandom').addEventListener('click', () => this.generateRandomWireframe());
        document.getElementById('clearCanvas').addEventListener('click', () => this.clearCanvas());
        document.getElementById('fullscreen').addEventListener('click', () => this.toggleFullscreen());

        // Settings controls
        this.setupSliderControl('pointCount', (value) => {
            this.settings.pointCount = parseInt(value);
            this.generateRandomWireframe();
        });

        this.setupSliderControl('connectionDensity', (value) => {
            this.settings.connectionDensity = parseFloat(value);
            this.generateConnections();
        });

        this.setupSliderControl('pointSize', (value) => {
            this.settings.pointSize = parseInt(value);
        });

        this.setupSliderControl('lineWidth', (value) => {
            this.settings.lineWidth = parseInt(value);
        });

        this.setupSliderControl('rotationSpeed', (value) => {
            this.settings.rotationSpeed = parseFloat(value);
            this.rotationSpeed.x = parseFloat(value);
            this.rotationSpeed.y = parseFloat(value) * 0.7;
            this.rotationSpeed.z = parseFloat(value) * 1.3;
        });

        // 3D Camera controls
        this.setupSliderControl('cameraDistance', (value) => {
            this.settings.cameraDistance = parseFloat(value);
            this.camera.position.z = parseFloat(value);
        });

        this.setupSliderControl('fieldOfView', (value) => {
            this.settings.fieldOfView = parseFloat(value);
            this.camera.fov = parseFloat(value);
        });

        // Face controls
        this.setupSliderControl('faceOpacity', (value) => {
            this.settings.faceOpacity = parseFloat(value);
        });

        document.getElementById('showFaces').addEventListener('change', (e) => {
            this.settings.showFaces = e.target.checked;
        });

        // Color controls
        document.getElementById('backgroundColor').addEventListener('change', (e) => {
            this.settings.backgroundColor = e.target.value;
            this.updateBackgroundColor();
        });

        document.getElementById('randomColors').addEventListener('change', (e) => {
            this.settings.randomColors = e.target.checked;
            if (e.target.checked) {
                this.randomizeColors();
            }
        });

        document.getElementById('animateWireframe').addEventListener('change', (e) => {
            this.settings.animateWireframe = e.target.checked;
        });

        document.getElementById('randomRotation').addEventListener('change', (e) => {
            this.settings.randomRotation = e.target.checked;
        });

        document.getElementById('autoRotate').addEventListener('change', (e) => {
            this.settings.autoRotate = e.target.checked;
        });

        // Canvas size controls
        document.getElementById('canvasSize').addEventListener('change', (e) => {
            const customInputs = document.getElementById('customSizeInputs');
            if (e.target.value === 'custom') {
                customInputs.style.display = 'flex';
            } else {
                customInputs.style.display = 'none';
                const [width, height] = e.target.value.split('x').map(Number);
                this.resizeCanvas(width, height);
            }
        });

        // Preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.loadPreset(btn.dataset.preset);
            });
        });

        // Edit mode controls
        document.getElementById('editMode').addEventListener('change', (e) => {
            this.settings.editMode = e.target.checked;
        });

        document.getElementById('addPoint').addEventListener('click', () => this.addPoint());
        document.getElementById('removePoint').addEventListener('click', () => this.removeSelectedPoint());
        document.getElementById('addFace').addEventListener('click', () => this.addFace());
        document.getElementById('removeFace').addEventListener('click', () => this.removeSelectedFace());

        document.getElementById('selectedPoint').addEventListener('change', (e) => {
            this.selectedPointIndex = e.target.value ? parseInt(e.target.value) : -1;
            this.updatePointEditor();
        });

        document.getElementById('selectedFace').addEventListener('change', (e) => {
            this.selectedFaceIndex = e.target.value ? parseInt(e.target.value) : -1;
            this.updateFaceEditor();
        });

        // Point editor controls
        ['pointX', 'pointY', 'pointZ'].forEach(id => {
            document.getElementById(id).addEventListener('change', (e) => {
                if (this.selectedPointIndex >= 0) {
                    const axis = id.charAt(id.length - 1).toLowerCase();
                    this.points[this.selectedPointIndex][axis] = parseFloat(e.target.value);
                }
            });
        });

        document.getElementById('pointColor').addEventListener('change', (e) => {
            if (this.selectedPointIndex >= 0) {
                this.points[this.selectedPointIndex].color = e.target.value;
            }
        });

        // Face editor controls
        document.getElementById('faceColor').addEventListener('change', (e) => {
            if (this.selectedFaceIndex >= 0) {
                this.faces[this.selectedFaceIndex].color = e.target.value;
            }
        });

        // Reset camera
        document.getElementById('resetCamera').addEventListener('click', () => this.resetCamera());

        // Export/Import controls
        document.getElementById('exportConfig').addEventListener('click', () => this.exportConfig());
        document.getElementById('importConfig').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });
        document.getElementById('importFile').addEventListener('change', (e) => this.importConfig(e));
        document.getElementById('exportImage').addEventListener('click', () => this.exportImage());
        document.getElementById('exportSVG').addEventListener('click', () => this.exportSVG());

        // Canvas mouse events
        this.setupCanvasEvents();
    }

    setupSliderControl(id, callback) {
        const slider = document.getElementById(id);
        const valueDisplay = document.getElementById(id + 'Value');
        
        slider.addEventListener('input', (e) => {
            const value = e.target.value;
            valueDisplay.textContent = value;
            callback(value);
        });
    }

    setupCanvasEvents() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    }

    generateRandomWireframe() {
        this.points = [];
        this.connections = [];
        this.faces = [];
        this.selectedPointIndex = -1;
        this.selectedFaceIndex = -1;
        
        // Generate random 3D points
        for (let i = 0; i < this.settings.pointCount; i++) {
            this.points.push({
                x: (Math.random() - 0.5) * 10,
                y: (Math.random() - 0.5) * 10,
                z: (Math.random() - 0.5) * 10,
                color: this.getRandomColor(),
                size: this.settings.pointSize + Math.random() * 5
            });
        }
        
        this.generateConnections();
        this.generateRandomFaces();
        this.updatePointSelector();
        this.updateFaceSelector();
        this.showNotification('Random 3D wireframe generated!', 'success');
    }

    generateConnections() {
        this.connections = [];
        
        for (let i = 0; i < this.points.length; i++) {
            for (let j = i + 1; j < this.points.length; j++) {
                if (Math.random() < this.settings.connectionDensity) {
                    this.connections.push({
                        from: i,
                        to: j,
                        color: this.settings.randomColors ? this.getRandomColor() : '#4f46e5'
                    });
                }
            }
        }
    }

    generateRandomFaces() {
        if (this.points.length < 3) return;
        
        const faceCount = Math.max(1, Math.floor(this.points.length / 3));
        
        for (let i = 0; i < faceCount; i++) {
            const indices = [];
            const usedIndices = new Set();
            
            // Generate triangle faces
            for (let j = 0; j < 3; j++) {
                let index;
                do {
                    index = Math.floor(Math.random() * this.points.length);
                } while (usedIndices.has(index));
                
                indices.push(index);
                usedIndices.add(index);
            }
            
            this.faces.push({
                indices: indices,
                color: this.getRandomColor(),
                opacity: this.settings.faceOpacity
            });
        }
    }

    loadPreset(presetName) {
        this.points = [];
        this.connections = [];
        this.faces = [];
        this.selectedPointIndex = -1;
        this.selectedFaceIndex = -1;
        
        switch (presetName) {
            case 'cube':
                this.createCube();
                break;
            case 'tetrahedron':
                this.createTetrahedron();
                break;
            case 'octahedron':
                this.createOctahedron();
                break;
            case 'dodecahedron':
                this.createDodecahedron();
                break;
            case 'icosahedron':
                this.createIcosahedron();
                break;
            case 'pyramid':
                this.createPyramid();
                break;
            case 'sphere':
                this.createSphere();
                break;
            case 'torus':
                this.createTorus();
                break;
            case 'helix':
                this.createHelix();
                break;
            case 'double-helix':
                this.createDoubleHelix();
                break;
            case 'grid3d':
                this.create3DGrid();
                break;
            case 'knot':
                this.createTrefoilKnot();
                break;
        }
        
        this.updatePointSelector();
        this.updateFaceSelector();
        this.showNotification(`${presetName.charAt(0).toUpperCase() + presetName.slice(1)} preset loaded!`, 'success');
    }

    createCube() {
        const size = 3;
        const vertices = [
            [-size, -size, -size], [size, -size, -size], [size, size, -size], [-size, size, -size],
            [-size, -size, size], [size, -size, size], [size, size, size], [-size, size, size]
        ];
        
        vertices.forEach(([x, y, z]) => {
            this.points.push({ x, y, z, color: this.getRandomColor(), size: this.settings.pointSize });
        });
        
        // Cube edges
        const edges = [
            [0, 1], [1, 2], [2, 3], [3, 0], // Bottom face
            [4, 5], [5, 6], [6, 7], [7, 4], // Top face
            [0, 4], [1, 5], [2, 6], [3, 7]  // Vertical edges
        ];
        
        edges.forEach(([from, to]) => {
            this.connections.push({ from, to, color: '#4f46e5' });
        });
        
        // Cube faces
        const faceIndices = [
            [0, 1, 2], [0, 2, 3], // Bottom
            [4, 6, 5], [4, 7, 6], // Top
            [0, 4, 7], [0, 7, 3], // Left
            [1, 5, 6], [1, 6, 2], // Right
            [3, 7, 6], [3, 6, 2], // Front
            [0, 1, 5], [0, 5, 4]  // Back
        ];
        
        faceIndices.forEach(indices => {
            this.faces.push({
                indices,
                color: this.getRandomColor(),
                opacity: this.settings.faceOpacity
            });
        });
    }

    createTetrahedron() {
        const size = 3;
        const vertices = [
            [0, size, 0],
            [-size, -size, size],
            [size, -size, size],
            [0, -size, -size]
        ];
        
        vertices.forEach(([x, y, z]) => {
            this.points.push({ x, y, z, color: this.getRandomColor(), size: this.settings.pointSize });
        });
        
        // All edges of tetrahedron
        for (let i = 0; i < 4; i++) {
            for (let j = i + 1; j < 4; j++) {
                this.connections.push({ from: i, to: j, color: '#4f46e5' });
            }
        }
        
        // Tetrahedron faces
        const faceIndices = [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]];
        faceIndices.forEach(indices => {
            this.faces.push({
                indices,
                color: this.getRandomColor(),
                opacity: this.settings.faceOpacity
            });
        });
    }

    createSphere() {
        const radius = 4;
        const segments = 12;
        const rings = 8;
        
        // Generate sphere vertices
        for (let i = 0; i <= rings; i++) {
            const theta = (i / rings) * Math.PI;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);
            
            for (let j = 0; j <= segments; j++) {
                const phi = (j / segments) * 2 * Math.PI;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);
                
                const x = radius * sinTheta * cosPhi;
                const y = radius * cosTheta;
                const z = radius * sinTheta * sinPhi;
                
                this.points.push({ x, y, z, color: this.getRandomColor(), size: this.settings.pointSize });
            }
        }
        
        // Generate connections for wireframe sphere
        for (let i = 0; i < rings; i++) {
            for (let j = 0; j < segments; j++) {
                const current = i * (segments + 1) + j;
                const next = current + segments + 1;
                
                if (i < rings) {
                    this.connections.push({ from: current, to: next, color: '#4f46e5' });
                    this.connections.push({ from: current, to: next + 1, color: '#4f46e5' });
                }
                if (j < segments) {
                    this.connections.push({ from: current, to: current + 1, color: '#4f46e5' });
                }
            }
        }
    }

    createTorus() {
        const majorRadius = 4;
        const minorRadius = 1.5;
        const majorSegments = 16;
        const minorSegments = 8;
        
        for (let i = 0; i < majorSegments; i++) {
            const u = (i / majorSegments) * 2 * Math.PI;
            
            for (let j = 0; j < minorSegments; j++) {
                const v = (j / minorSegments) * 2 * Math.PI;
                
                const x = (majorRadius + minorRadius * Math.cos(v)) * Math.cos(u);
                const y = minorRadius * Math.sin(v);
                const z = (majorRadius + minorRadius * Math.cos(v)) * Math.sin(u);
                
                this.points.push({ x, y, z, color: this.getRandomColor(), size: this.settings.pointSize });
            }
        }
        
        // Generate torus connections
        for (let i = 0; i < majorSegments; i++) {
            for (let j = 0; j < minorSegments; j++) {
                const current = i * minorSegments + j;
                const nextMajor = ((i + 1) % majorSegments) * minorSegments + j;
                const nextMinor = i * minorSegments + ((j + 1) % minorSegments);
                
                this.connections.push({ from: current, to: nextMajor, color: '#4f46e5' });
                this.connections.push({ from: current, to: nextMinor, color: '#4f46e5' });
            }
        }
    }

    createHelix() {
        const radius = 3;
        const height = 8;
        const turns = 3;
        const points = 50;
        
        for (let i = 0; i < points; i++) {
            const t = i / (points - 1);
            const angle = t * turns * 2 * Math.PI;
            
            const x = radius * Math.cos(angle);
            const y = height * (t - 0.5);
            const z = radius * Math.sin(angle);
            
            this.points.push({ x, y, z, color: this.getRandomColor(), size: this.settings.pointSize });
            
            if (i > 0) {
                this.connections.push({ from: i - 1, to: i, color: '#4f46e5' });
            }
        }
    }

    createDoubleHelix() {
        const radius = 2;
        const height = 8;
        const turns = 2;
        const points = 30;
        
        // First helix
        for (let i = 0; i < points; i++) {
            const t = i / (points - 1);
            const angle = t * turns * 2 * Math.PI;
            
            const x = radius * Math.cos(angle);
            const y = height * (t - 0.5);
            const z = radius * Math.sin(angle);
            
            this.points.push({ x, y, z, color: this.getRandomColor(), size: this.settings.pointSize });
        }
        
        // Second helix (offset by 180 degrees)
        for (let i = 0; i < points; i++) {
            const t = i / (points - 1);
            const angle = t * turns * 2 * Math.PI + Math.PI;
            
            const x = radius * Math.cos(angle);
            const y = height * (t - 0.5);
            const z = radius * Math.sin(angle);
            
            this.points.push({ x, y, z, color: this.getRandomColor(), size: this.settings.pointSize });
        }
        
        // Connect first helix
        for (let i = 0; i < points - 1; i++) {
            this.connections.push({ from: i, to: i + 1, color: '#4f46e5' });
        }
        
        // Connect second helix
        for (let i = 0; i < points - 1; i++) {
            this.connections.push({ from: i + points, to: i + points + 1, color: '#e74c3c' });
        }
        
        // Cross connections between helices
        for (let i = 0; i < points; i += 3) {
            this.connections.push({ from: i, to: i + points, color: '#f39c12' });
        }
    }

    create3DGrid() {
        const size = 2;
        const divisions = 4;
        const step = (size * 2) / divisions;
        
        for (let x = 0; x <= divisions; x++) {
            for (let y = 0; y <= divisions; y++) {
                for (let z = 0; z <= divisions; z++) {
                    this.points.push({
                        x: -size + x * step,
                        y: -size + y * step,
                        z: -size + z * step,
                        color: this.getRandomColor(),
                        size: this.settings.pointSize
                    });
                }
            }
        }
        
        // Generate grid connections
        const getIndex = (x, y, z) => x * (divisions + 1) * (divisions + 1) + y * (divisions + 1) + z;
        
        for (let x = 0; x <= divisions; x++) {
            for (let y = 0; y <= divisions; y++) {
                for (let z = 0; z <= divisions; z++) {
                    const current = getIndex(x, y, z);
                    
                    if (x < divisions) {
                        this.connections.push({ from: current, to: getIndex(x + 1, y, z), color: '#4f46e5' });
                    }
                    if (y < divisions) {
                        this.connections.push({ from: current, to: getIndex(x, y + 1, z), color: '#4f46e5' });
                    }
                    if (z < divisions) {
                        this.connections.push({ from: current, to: getIndex(x, y, z + 1), color: '#4f46e5' });
                    }
                }
            }
        }
    }

    createTrefoilKnot() {
        const points = 100;
        const scale = 2;
        
        for (let i = 0; i < points; i++) {
            const t = (i / points) * 2 * Math.PI;
            
            const x = scale * (Math.sin(t) + 2 * Math.sin(2 * t));
            const y = scale * (Math.cos(t) - 2 * Math.cos(2 * t));
            const z = scale * (-Math.sin(3 * t));
            
            this.points.push({ x, y, z, color: this.getRandomColor(), size: this.settings.pointSize });
            
            if (i > 0) {
                this.connections.push({ from: i - 1, to: i, color: '#4f46e5' });
            }
        }
        
        // Close the knot
        this.connections.push({ from: points - 1, to: 0, color: '#4f46e5' });
    }

    // Additional preset methods would continue here (octahedron, dodecahedron, icosahedron, pyramid)
    createOctahedron() {
        const size = 3;
        const vertices = [
            [0, size, 0], [0, -size, 0],
            [size, 0, 0], [-size, 0, 0],
            [0, 0, size], [0, 0, -size]
        ];
        
        vertices.forEach(([x, y, z]) => {
            this.points.push({ x, y, z, color: this.getRandomColor(), size: this.settings.pointSize });
        });
        
        // Octahedron edges
        const edges = [
            [0, 2], [0, 3], [0, 4], [0, 5],
            [1, 2], [1, 3], [1, 4], [1, 5],
            [2, 4], [2, 5], [3, 4], [3, 5]
        ];
        
        edges.forEach(([from, to]) => {
            this.connections.push({ from, to, color: '#4f46e5' });
        });
    }

    createPyramid() {
        const size = 3;
        const vertices = [
            [0, size, 0],        // Apex
            [-size, -size, size], // Base corners
            [size, -size, size],
            [size, -size, -size],
            [-size, -size, -size]
        ];
        
        vertices.forEach(([x, y, z]) => {
            this.points.push({ x, y, z, color: this.getRandomColor(), size: this.settings.pointSize });
        });
        
        // Pyramid edges
        const edges = [
            [0, 1], [0, 2], [0, 3], [0, 4], // From apex to base
            [1, 2], [2, 3], [3, 4], [4, 1]  // Base edges
        ];
        
        edges.forEach(([from, to]) => {
            this.connections.push({ from, to, color: '#4f46e5' });
        });
        
        // Pyramid faces
        const faceIndices = [
            [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], // Side faces
            [1, 4, 3], [1, 3, 2] // Base faces
        ];
        
        faceIndices.forEach(indices => {
            this.faces.push({
                indices,
                color: this.getRandomColor(),
                opacity: this.settings.faceOpacity
            });
        });
    }

    createDodecahedron() {
        // Simplified dodecahedron - would need more complex vertex calculations for full implementation
        const phi = (1 + Math.sqrt(5)) / 2;
        const size = 2;
        
        // Basic dodecahedron vertices (simplified)
        const vertices = [
            [size, size, size], [-size, size, size], [size, -size, size], [-size, -size, size],
            [size, size, -size], [-size, size, -size], [size, -size, -size], [-size, -size, -size],
            [0, size * phi, size / phi], [0, -size * phi, size / phi],
            [0, size * phi, -size / phi], [0, -size * phi, -size / phi],
            [size * phi, size / phi, 0], [-size * phi, size / phi, 0],
            [size * phi, -size / phi, 0], [-size * phi, -size / phi, 0],
            [size / phi, 0, size * phi], [-size / phi, 0, size * phi],
            [size / phi, 0, -size * phi], [-size / phi, 0, -size * phi]
        ];
        
        vertices.forEach(([x, y, z]) => {
            this.points.push({ x, y, z, color: this.getRandomColor(), size: this.settings.pointSize });
        });
        
        // Basic edge connections (simplified for demonstration)
        for (let i = 0; i < vertices.length; i++) {
            for (let j = i + 1; j < vertices.length; j++) {
                const dist = this.vec3.distance(vertices[i], vertices[j]);
                if (dist < size * 2.2) { // Connect nearby vertices
                    this.connections.push({ from: i, to: j, color: '#4f46e5' });
                }
            }
        }
    }

    createIcosahedron() {
        const phi = (1 + Math.sqrt(5)) / 2;
        const size = 2;
        
        const vertices = [
            [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
            [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
            [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
        ];
        
        vertices.forEach(([x, y, z]) => {
            this.points.push({
                x: x * size,
                y: y * size,
                z: z * size,
                color: this.getRandomColor(),
                size: this.settings.pointSize
            });
        });
        
        // Icosahedron edges (simplified)
        for (let i = 0; i < vertices.length; i++) {
            for (let j = i + 1; j < vertices.length; j++) {
                const dist = this.vec3.distance(
                    [vertices[i][0] * size, vertices[i][1] * size, vertices[i][2] * size],
                    [vertices[j][0] * size, vertices[j][1] * size, vertices[j][2] * size]
                );
                if (dist < size * 2.1) {
                    this.connections.push({ from: i, to: j, color: '#4f46e5' });
                }
            }
        }
    }

    startRenderLoop() {
        const render = () => {
            this.update();
            this.render();
            this.animationId = requestAnimationFrame(render);
        };
        render();
    }

    update() {
        if (this.settings.randomRotation && this.settings.autoRotate) {
            this.rotation.x += this.rotationSpeed.x;
            this.rotation.y += this.rotationSpeed.y;
            this.rotation.z += this.rotationSpeed.z;
        }
        
        if (this.settings.animateWireframe) {
            // Additional wireframe-specific animations could go here
            this.points.forEach(point => {
                point.size = this.settings.pointSize + Math.sin(Date.now() * 0.005 + point.x) * 2;
            });
        }
        
        this.updateStats();
    }

    render() {
        const gl = this.gl;
        
        // Clear the canvas
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        if (this.points.length === 0) return;
        
        // Create matrices
        const projectionMatrix = this.mat4.perspective(
            this.mat4.create(),
            this.camera.fov * Math.PI / 180,
            this.canvas.width / this.canvas.height,
            this.camera.near,
            this.camera.far
        );
        
        const modelViewMatrix = this.mat4.create();
        this.mat4.translate(modelViewMatrix, modelViewMatrix, [0, 0, -this.camera.position.z]);
        this.mat4.rotate(modelViewMatrix, modelViewMatrix, this.rotation.x, [1, 0, 0]);
        this.mat4.rotate(modelViewMatrix, modelViewMatrix, this.rotation.y, [0, 1, 0]);
        this.mat4.rotate(modelViewMatrix, modelViewMatrix, this.rotation.z, [0, 0, 1]);
        
        // Use shader program
        gl.useProgram(this.shaderProgram);
        
        // Set matrices
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
        
        // Render faces first (if enabled)
        if (this.settings.showFaces && this.faces.length > 0) {
            this.renderFaces(gl);
        }
        
        // Render connections
        if (this.connections.length > 0) {
            this.renderConnections(gl);
        }
        
        // Render points
        if (this.points.length > 0) {
            this.renderPoints(gl);
        }
    }

    renderPoints(gl) {
        // Create vertex buffer for points
        const positions = [];
        const colors = [];
        
        this.points.forEach(point => {
            positions.push(point.x, point.y, point.z);
            const color = this.hexToRgb(point.color);
            colors.push(color.r / 255, color.g / 255, color.b / 255);
        });
        
        // Create and bind buffers
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        
        const colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
        
        // Set up position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(this.programInfo.attribLocations.position, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.programInfo.attribLocations.position);
        
        // Set up color attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.vertexAttribPointer(this.programInfo.attribLocations.color, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.programInfo.attribLocations.color);
        
        // Set uniforms
        gl.uniform1f(this.programInfo.uniformLocations.pointSize, this.settings.pointSize);
        gl.uniform1f(this.programInfo.uniformLocations.opacity, 1.0);
        
        // Draw points
        gl.drawArrays(gl.POINTS, 0, this.points.length);
        
        // Clean up
        gl.deleteBuffer(positionBuffer);
        gl.deleteBuffer(colorBuffer);
    }

    renderConnections(gl) {
        const positions = [];
        const colors = [];
        
        this.connections.forEach(connection => {
            const fromPoint = this.points[connection.from];
            const toPoint = this.points[connection.to];
            
            if (fromPoint && toPoint) {
                positions.push(fromPoint.x, fromPoint.y, fromPoint.z);
                positions.push(toPoint.x, toPoint.y, toPoint.z);
                
                const color = this.hexToRgb(connection.color);
                const colorArray = [color.r / 255, color.g / 255, color.b / 255];
                colors.push(...colorArray, ...colorArray);
            }
        });
        
        if (positions.length === 0) return;
        
        // Create and bind buffers
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        
        const colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
        
        // Set up position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(this.programInfo.attribLocations.position, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.programInfo.attribLocations.position);
        
        // Set up color attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.vertexAttribPointer(this.programInfo.attribLocations.color, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.programInfo.attribLocations.color);
        
        // Set uniforms
        gl.uniform1f(this.programInfo.uniformLocations.opacity, 1.0);
        
        // Set line width (note: may not work in all WebGL implementations)
        gl.lineWidth(this.settings.lineWidth);
        
        // Draw lines
        gl.drawArrays(gl.LINES, 0, positions.length / 3);
        
        // Clean up
        gl.deleteBuffer(positionBuffer);
        gl.deleteBuffer(colorBuffer);
    }

    renderFaces(gl) {
        const positions = [];
        const colors = [];
        
        this.faces.forEach(face => {
            if (face.indices.length >= 3) {
                // Render as triangles
                for (let i = 1; i < face.indices.length - 1; i++) {
                    const p1 = this.points[face.indices[0]];
                    const p2 = this.points[face.indices[i]];
                    const p3 = this.points[face.indices[i + 1]];
                    
                    if (p1 && p2 && p3) {
                        positions.push(p1.x, p1.y, p1.z);
                        positions.push(p2.x, p2.y, p2.z);
                        positions.push(p3.x, p3.y, p3.z);
                        
                        const color = this.hexToRgb(face.color);
                        const colorArray = [color.r / 255, color.g / 255, color.b / 255];
                        colors.push(...colorArray, ...colorArray, ...colorArray);
                    }
                }
            }
        });
        
        if (positions.length === 0) return;
        
        // Enable blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // Create and bind buffers
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        
        const colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
        
        // Set up position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(this.programInfo.attribLocations.position, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.programInfo.attribLocations.position);
        
        // Set up color attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.vertexAttribPointer(this.programInfo.attribLocations.color, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.programInfo.attribLocations.color);
        
        // Set uniforms
        gl.uniform1f(this.programInfo.uniformLocations.opacity, this.settings.faceOpacity);
        
        // Draw triangles
        gl.drawArrays(gl.TRIANGLES, 0, positions.length / 3);
        
        // Clean up
        gl.deleteBuffer(positionBuffer);
        gl.deleteBuffer(colorBuffer);
    }

    // Math utilities
    createMat4Utils() {
        return {
            create() {
                return new Float32Array([
                    1, 0, 0, 0,
                    0, 1, 0, 0,
                    0, 0, 1, 0,
                    0, 0, 0, 1
                ]);
            },
            
            perspective(out, fovy, aspect, near, far) {
                const f = 1.0 / Math.tan(fovy / 2);
                const rangeInv = 1 / (near - far);
                
                out[0] = f / aspect;
                out[1] = 0;
                out[2] = 0;
                out[3] = 0;
                out[4] = 0;
                out[5] = f;
                out[6] = 0;
                out[7] = 0;
                out[8] = 0;
                out[9] = 0;
                out[10] = (far + near) * rangeInv;
                out[11] = -1;
                out[12] = 0;
                out[13] = 0;
                out[14] = (2 * far * near) * rangeInv;
                out[15] = 0;
                
                return out;
            },
            
            translate(out, a, v) {
                const x = v[0], y = v[1], z = v[2];
                
                out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
                out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
                out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
                out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
                
                return out;
            },
            
            rotate(out, a, rad, axis) {
                const x = axis[0], y = axis[1], z = axis[2];
                const len = Math.sqrt(x * x + y * y + z * z);
                
                if (len < 0.000001) return out;
                
                const s = Math.sin(rad);
                const c = Math.cos(rad);
                const t = 1 - c;
                const ax = x / len;
                const ay = y / len;
                const az = z / len;
                
                // Construct rotation matrix
                const b00 = ax * ax * t + c;
                const b01 = ay * ax * t + az * s;
                const b02 = az * ax * t - ay * s;
                const b10 = ax * ay * t - az * s;
                const b11 = ay * ay * t + c;
                const b12 = az * ay * t + ax * s;
                const b20 = ax * az * t + ay * s;
                const b21 = ay * az * t - ax * s;
                const b22 = az * az * t + c;
                
                // Apply rotation
                const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
                const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
                const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
                
                out[0] = a00 * b00 + a10 * b01 + a20 * b02;
                out[1] = a01 * b00 + a11 * b01 + a21 * b02;
                out[2] = a02 * b00 + a12 * b01 + a22 * b02;
                out[3] = a03 * b00 + a13 * b01 + a23 * b02;
                out[4] = a00 * b10 + a10 * b11 + a20 * b12;
                out[5] = a01 * b10 + a11 * b11 + a21 * b12;
                out[6] = a02 * b10 + a12 * b11 + a22 * b12;
                out[7] = a03 * b10 + a13 * b11 + a23 * b12;
                out[8] = a00 * b20 + a10 * b21 + a20 * b22;
                out[9] = a01 * b20 + a11 * b21 + a21 * b22;
                out[10] = a02 * b20 + a12 * b21 + a22 * b22;
                out[11] = a03 * b20 + a13 * b21 + a23 * b22;
                
                return out;
            }
        };
    }

    createVec3Utils() {
        return {
            distance(a, b) {
                const dx = b[0] - a[0];
                const dy = b[1] - a[1];
                const dz = b[2] - a[2];
                return Math.sqrt(dx * dx + dy * dy + dz * dz);
            }
        };
    }

    // Mouse and touch handlers
    handleMouseDown(e) {
        this.mouseDown = true;
        this.lastMousePos = this.getMousePos(e);
        
        if (this.settings.editMode) {
            // Handle point selection and dragging in 3D
            this.selectPointAt3D(this.lastMousePos);
        }
    }

    handleMouseMove(e) {
        const currentPos = this.getMousePos(e);
        
        if (this.mouseDown && !this.settings.editMode) {
            // Camera rotation
            const deltaX = currentPos.x - this.lastMousePos.x;
            const deltaY = currentPos.y - this.lastMousePos.y;
            
            this.rotation.y += deltaX * 0.01;
            this.rotation.x += deltaY * 0.01;
            
            this.lastMousePos = currentPos;
        } else if (this.mouseDown && this.settings.editMode && this.selectedPointIndex >= 0) {
            // Point dragging in 3D space
            this.dragPointIn3D(currentPos);
        }
    }

    handleMouseUp(e) {
        this.mouseDown = false;
        this.isDragging = false;
    }

    handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 1 : -1;
        this.camera.position.z = Math.max(5, Math.min(50, this.camera.position.z + delta));
        this.settings.cameraDistance = this.camera.position.z;
        document.getElementById('cameraDistance').value = this.settings.cameraDistance;
        document.getElementById('cameraDistanceValue').textContent = this.settings.cameraDistance.toFixed(1);
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    selectPointAt3D(mousePos) {
        // This is a simplified 3D point selection
        // In a full implementation, you'd use ray casting
        let closestDistance = Infinity;
        let closestIndex = -1;
        
        const threshold = 20; // pixels
        
        this.points.forEach((point, index) => {
            // Project 3D point to screen coordinates (simplified)
            const screenX = this.canvas.width / 2 + point.x * 50;
            const screenY = this.canvas.height / 2 - point.y * 50;
            
            const distance = Math.sqrt(
                Math.pow(mousePos.x - screenX, 2) + Math.pow(mousePos.y - screenY, 2)
            );
            
            if (distance < threshold && distance < closestDistance) {
                closestDistance = distance;
                closestIndex = index;
            }
        });
        
        this.selectedPointIndex = closestIndex;
        this.updatePointSelector();
        this.updatePointEditor();
    }

    dragPointIn3D(mousePos) {
        if (this.selectedPointIndex < 0) return;
        
        // Simplified 3D dragging - in reality you'd use proper 3D math
        const deltaX = mousePos.x - this.lastMousePos.x;
        const deltaY = mousePos.y - this.lastMousePos.y;
        
        this.points[this.selectedPointIndex].x += deltaX * 0.02;
        this.points[this.selectedPointIndex].y -= deltaY * 0.02;
        
        this.updatePointEditor();
        this.lastMousePos = mousePos;
    }

    // Touch event handlers
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
    }

    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }

    handleTouchEnd(e) {
        e.preventDefault();
        this.handleMouseUp(e);
    }

    // UI update methods
    updatePointSelector() {
        const selector = document.getElementById('selectedPoint');
        selector.innerHTML = '<option value="">None</option>';
        
        this.points.forEach((point, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Point ${index + 1}`;
            if (index === this.selectedPointIndex) {
                option.selected = true;
            }
            selector.appendChild(option);
        });
    }

    updateFaceSelector() {
        const selector = document.getElementById('selectedFace');
        selector.innerHTML = '<option value="">None</option>';
        
        this.faces.forEach((face, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Face ${index + 1}`;
            if (index === this.selectedFaceIndex) {
                option.selected = true;
            }
            selector.appendChild(option);
        });
    }

    updatePointEditor() {
        const editor = document.getElementById('pointEditor');
        const pointX = document.getElementById('pointX');
        const pointY = document.getElementById('pointY');
        const pointZ = document.getElementById('pointZ');
        const pointColor = document.getElementById('pointColor');
        
        if (this.selectedPointIndex >= 0 && this.selectedPointIndex < this.points.length) {
            const point = this.points[this.selectedPointIndex];
            editor.style.display = 'block';
            pointX.value = point.x.toFixed(2);
            pointY.value = point.y.toFixed(2);
            pointZ.value = point.z.toFixed(2);
            pointColor.value = point.color;
        } else {
            editor.style.display = 'none';
        }
    }

    updateFaceEditor() {
        const editor = document.getElementById('faceEditor');
        const faceColor = document.getElementById('faceColor');
        
        if (this.selectedFaceIndex >= 0 && this.selectedFaceIndex < this.faces.length) {
            const face = this.faces[this.selectedFaceIndex];
            editor.style.display = 'block';
            faceColor.value = face.color;
        } else {
            editor.style.display = 'none';
        }
    }

    updateStats() {
        document.getElementById('statPoints').textContent = this.points.length;
        document.getElementById('statConnections').textContent = this.connections.length;
        document.getElementById('statFaces').textContent = this.faces.length;
        
        // Calculate total length
        let totalLength = 0;
        this.connections.forEach(connection => {
            const fromPoint = this.points[connection.from];
            const toPoint = this.points[connection.to];
            if (fromPoint && toPoint) {
                const length = Math.sqrt(
                    Math.pow(toPoint.x - fromPoint.x, 2) +
                    Math.pow(toPoint.y - fromPoint.y, 2) +
                    Math.pow(toPoint.z - fromPoint.z, 2)
                );
                totalLength += length;
            }
        });
        
        document.getElementById('statLength').textContent = totalLength.toFixed(1);
        
        // Calculate approximate volume (simplified)
        let volume = 0;
        if (this.points.length >= 4) {
            const bounds = this.getBoundingBox();
            volume = (bounds.max.x - bounds.min.x) * 
                     (bounds.max.y - bounds.min.y) * 
                     (bounds.max.z - bounds.min.z);
        }
        document.getElementById('statVolume').textContent = volume.toFixed(1);
    }

    getBoundingBox() {
        if (this.points.length === 0) {
            return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
        }
        
        let minX = this.points[0].x, maxX = this.points[0].x;
        let minY = this.points[0].y, maxY = this.points[0].y;
        let minZ = this.points[0].z, maxZ = this.points[0].z;
        
        this.points.forEach(point => {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
            minZ = Math.min(minZ, point.z);
            maxZ = Math.max(maxZ, point.z);
        });
        
        return {
            min: { x: minX, y: minY, z: minZ },
            max: { x: maxX, y: maxY, z: maxZ }
        };
    }

    // Additional utility methods
    getRandomColor() {
        const colors = [
            '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b',
            '#eb4d4b', '#6c5ce7', '#a29bfe', '#fd79a8', '#fdcb6e',
            '#e17055', '#81ecec', '#74b9ff', '#55a3ff', '#00b894',
            '#e84393', '#00cec9', '#6c5ce7', '#a29bfe', '#fd79a8'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    randomizeColors() {
        this.points.forEach(point => {
            point.color = this.getRandomColor();
        });
        this.connections.forEach(connection => {
            connection.color = this.getRandomColor();
        });
        this.faces.forEach(face => {
            face.color = this.getRandomColor();
        });
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 255, b: 255 };
    }

    updateBackgroundColor() {
        const color = this.hexToRgb(this.settings.backgroundColor);
        this.gl.clearColor(color.r / 255, color.g / 255, color.b / 255, 1.0);
        this.canvas.style.backgroundColor = this.settings.backgroundColor;
    }

    addPoint() {
        const newPoint = {
            x: (Math.random() - 0.5) * 8,
            y: (Math.random() - 0.5) * 8,
            z: (Math.random() - 0.5) * 8,
            color: this.getRandomColor(),
            size: this.settings.pointSize
        };
        
        this.points.push(newPoint);
        this.selectedPointIndex = this.points.length - 1;
        this.updatePointSelector();
        this.updatePointEditor();
        this.showNotification('3D Point added!', 'success');
    }

    removeSelectedPoint() {
        if (this.selectedPointIndex < 0 || this.selectedPointIndex >= this.points.length) return;
        
        // Remove connections involving this point
        this.connections = this.connections.filter(conn => 
            conn.from !== this.selectedPointIndex && conn.to !== this.selectedPointIndex
        );
        
        // Remove faces involving this point
        this.faces = this.faces.filter(face => 
            !face.indices.includes(this.selectedPointIndex)
        );
        
        // Update connection and face indices
        this.connections.forEach(conn => {
            if (conn.from > this.selectedPointIndex) conn.from--;
            if (conn.to > this.selectedPointIndex) conn.to--;
        });
        
        this.faces.forEach(face => {
            face.indices = face.indices.map(index => 
                index > this.selectedPointIndex ? index - 1 : index
            );
        });
        
        // Remove the point
        this.points.splice(this.selectedPointIndex, 1);
        this.selectedPointIndex = -1;
        
        this.updatePointSelector();
        this.updateFaceSelector();
        this.updatePointEditor();
        this.showNotification('3D Point removed!', 'success');
    }

    addFace() {
        if (this.points.length < 3) {
            this.showNotification('Need at least 3 points to create a face!', 'error');
            return;
        }
        
        // Create a random triangle face
        const indices = [];
        const usedIndices = new Set();
        
        for (let i = 0; i < 3; i++) {
            let index;
            do {
                index = Math.floor(Math.random() * this.points.length);
            } while (usedIndices.has(index));
            
            indices.push(index);
            usedIndices.add(index);
        }
        
        const newFace = {
            indices: indices,
            color: this.getRandomColor(),
            opacity: this.settings.faceOpacity
        };
        
        this.faces.push(newFace);
        this.selectedFaceIndex = this.faces.length - 1;
        this.updateFaceSelector();
        this.updateFaceEditor();
        this.showNotification('3D Face added!', 'success');
    }

    removeSelectedFace() {
        if (this.selectedFaceIndex < 0 || this.selectedFaceIndex >= this.faces.length) return;
        
        this.faces.splice(this.selectedFaceIndex, 1);
        this.selectedFaceIndex = -1;
        
        this.updateFaceSelector();
        this.updateFaceEditor();
        this.showNotification('3D Face removed!', 'success');
    }

    resetCamera() {
        this.camera.position = { x: 0, y: 0, z: 20 };
        this.rotation = { x: 0, y: 0, z: 0 };
        this.settings.cameraDistance = 20;
        this.settings.fieldOfView = 75;
        
        document.getElementById('cameraDistance').value = 20;
        document.getElementById('cameraDistanceValue').textContent = '20';
        document.getElementById('fieldOfView').value = 75;
        document.getElementById('fieldOfViewValue').textContent = '75';
        
        this.showNotification('Camera reset!', 'success');
    }

    clearCanvas() {
        this.points = [];
        this.connections = [];
        this.faces = [];
        this.selectedPointIndex = -1;
        this.selectedFaceIndex = -1;
        this.updatePointSelector();
        this.updateFaceSelector();
        this.updatePointEditor();
        this.updateFaceEditor();
        this.showNotification('3D Canvas cleared!', 'success');
    }

    toggleSidepanel() {
        const sidepanel = document.getElementById('sidepanel');
        sidepanel.classList.toggle('hidden');
    }

    hideSidepanel() {
        document.getElementById('sidepanel').classList.add('hidden');
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    resizeCanvas(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        this.gl.viewport(0, 0, width, height);
    }

    updateDisplay() {
        // Update all control values to match current settings
        document.getElementById('pointCount').value = this.settings.pointCount;
        document.getElementById('pointCountValue').textContent = this.settings.pointCount;
        
        document.getElementById('connectionDensity').value = this.settings.connectionDensity;
        document.getElementById('connectionDensityValue').textContent = this.settings.connectionDensity;
        
        document.getElementById('pointSize').value = this.settings.pointSize;
        document.getElementById('pointSizeValue').textContent = this.settings.pointSize;
        
        document.getElementById('lineWidth').value = this.settings.lineWidth;
        document.getElementById('lineWidthValue').textContent = this.settings.lineWidth;
        
        document.getElementById('rotationSpeed').value = this.settings.rotationSpeed;
        document.getElementById('rotationSpeedValue').textContent = this.settings.rotationSpeed;
        
        document.getElementById('backgroundColor').value = this.settings.backgroundColor;
        document.getElementById('randomColors').checked = this.settings.randomColors;
        document.getElementById('animateWireframe').checked = this.settings.animateWireframe;
        document.getElementById('randomRotation').checked = this.settings.randomRotation;
        document.getElementById('editMode').checked = this.settings.editMode;
        document.getElementById('showFaces').checked = this.settings.showFaces;
        document.getElementById('autoRotate').checked = this.settings.autoRotate;
        
        document.getElementById('faceOpacity').value = this.settings.faceOpacity;
        document.getElementById('faceOpacityValue').textContent = this.settings.faceOpacity;
        
        this.updateBackgroundColor();
        this.updatePointSelector();
        this.updateFaceSelector();
        this.updatePointEditor();
        this.updateFaceEditor();
    }

    exportConfig() {
        const config = {
            points: this.points,
            connections: this.connections,
            faces: this.faces,
            settings: this.settings,
            camera: this.camera,
            rotation: this.rotation,
            canvasSize: {
                width: this.canvas.width,
                height: this.canvas.height
            }
        };
        
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '3d-wireframe-config.json';
        a.click();
        URL.revokeObjectURL(url);
        
        this.showNotification('3D Configuration exported!', 'success');
    }

    importConfig(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);
                
                this.points = config.points || [];
                this.connections = config.connections || [];
                this.faces = config.faces || [];
                this.settings = { ...this.settings, ...config.settings };
                
                if (config.camera) {
                    this.camera = { ...this.camera, ...config.camera };
                }
                
                if (config.rotation) {
                    this.rotation = { ...this.rotation, ...config.rotation };
                }
                
                if (config.canvasSize) {
                    this.resizeCanvas(config.canvasSize.width, config.canvasSize.height);
                }
                
                this.updateDisplay();
                this.showNotification('3D Configuration imported!', 'success');
            } catch (error) {
                this.showNotification('Error importing configuration!', 'error');
            }
        };
        reader.readAsText(file);
    }

    exportImage() {
        // Render current frame to get the image
        this.render();
        
        const link = document.createElement('a');
        link.download = '3d-wireframe.png';
        link.href = this.canvas.toDataURL();
        link.click();
        this.showNotification('3D Image exported!', 'success');
    }

    exportSVG() {
        // For 3D SVG export, we'd need to project the 3D coordinates to 2D
        // This is a simplified version
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', this.canvas.width);
        svg.setAttribute('height', this.canvas.height);
        svg.setAttribute('viewBox', `0 0 ${this.canvas.width} ${this.canvas.height}`);
        
        // Add background
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('width', '100%');
        bg.setAttribute('height', '100%');
        bg.setAttribute('fill', this.settings.backgroundColor);
        svg.appendChild(bg);
        
        // Project 3D points to 2D for SVG export (simplified projection)
        const project3DTo2D = (point) => {
            const scale = 300 / (point.z + 20);
            return {
                x: this.canvas.width / 2 + point.x * scale,
                y: this.canvas.height / 2 - point.y * scale
            };
        };
        
        // Add connections
        this.connections.forEach(connection => {
            const fromPoint = this.points[connection.from];
            const toPoint = this.points[connection.to];
            
            if (fromPoint && toPoint) {
                const from2D = project3DTo2D(fromPoint);
                const to2D = project3DTo2D(toPoint);
                
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', from2D.x);
                line.setAttribute('y1', from2D.y);
                line.setAttribute('x2', to2D.x);
                line.setAttribute('y2', to2D.y);
                line.setAttribute('stroke', connection.color);
                line.setAttribute('stroke-width', this.settings.lineWidth);
                svg.appendChild(line);
            }
        });
        
        // Add points
        this.points.forEach(point => {
            const projected = project3DTo2D(point);
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', projected.x);
            circle.setAttribute('cy', projected.y);
            circle.setAttribute('r', this.settings.pointSize);
            circle.setAttribute('fill', point.color);
            svg.appendChild(circle);
        });
        
        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '3d-wireframe.svg';
        a.click();
        URL.revokeObjectURL(url);
        
        this.showNotification('3D SVG exported!', 'success');
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize the 3D wireframe generator when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new Wireframe3DGenerator();
});