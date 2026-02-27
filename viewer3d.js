import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getBlockColor, getBaseBlockId, isAir, getTexture } from './blockColors.js';

let scene, camera, renderer, controls;
let container, canvas;
let isInitialized = false;

// Grouping structure for InstancedMeshes
let blockGroups = new Map(); // hex color string -> array of {x, y, z}
let instancedMeshes = [];

export function init3DViewer() {
    if (isInitialized) return;

    container = document.getElementById('canvas-3d-container');
    canvas = document.getElementById('schematic-canvas-3d');

    // Scene setup
    scene = new THREE.Scene();

    // Set initial background based on current body class
    const isLight = document.body.classList.contains('light-theme');
    scene.background = new THREE.Color(isLight ? '#f0f2f5' : '#0A0A0F');

    // Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 10000);
    camera.position.set(50, 50, 50);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Controls setup
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 200, 50);
    scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0xaaccff, 0.3); // soft blue fill light
    dirLight2.position.set(-100, -50, -50);
    scene.add(dirLight2);

    // Resize handler
    window.addEventListener('resize', onWindowResize);

    isInitialized = true;

    // Start render loop
    requestAnimationFrame(animate);
}

function onWindowResize() {
    if (!isInitialized || !container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    if (!isInitialized) return;

    // Only render if container is visible
    if (container.style.display !== 'none') {
        controls.update();
        renderer.render(scene, camera);
    }
}

export function clear3DModel() {
    if (!isInitialized) return;

    // Remove old meshes
    for (const mesh of instancedMeshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    }
    instancedMeshes = [];
    blockGroups.clear();
}

/**
 * Builds the 3D model using InstancedMesh for performance.
 * Groups identical colored blocks together to minimize draw calls.
 */
export async function build3DModelAsync(schematic) {
    if (!isInitialized) init3DViewer();
    clear3DModel();

    document.getElementById('loading-3d').style.display = 'flex';

    // We yield execution to allow the UI to show the loading spinner
    await new Promise(resolve => setTimeout(resolve, 50));

    const { width, height, length, getBlock } = schematic;

    // 1. First Pass: Group blocks by material (texture or color)
    let count = 0;
    const chunkSize = 500000;

    // We group by a unique key: "textureFile:colorHex"
    const groups = new Map(); // key -> { textureFile, colorHex, positions: [] }
    const blockStateToKey = new Map(); // Cache map

    for (let y = 0; y < height; y++) {
        for (let z = 0; z < length; z++) {
            for (let x = 0; x < width; x++) {
                const blockState = getBlock(x, y, z);

                let groupKey = blockStateToKey.get(blockState);
                if (groupKey === undefined) {
                    if (isAir(blockState)) {
                        groupKey = null;
                    } else {
                        const baseId = getBaseBlockId(blockState);

                        // Get fallbacks
                        let colorHex = getBlockColor(blockState);
                        if (baseId && (baseId.includes('leaves') || baseId === 'grass_block' || baseId.includes('grass') || baseId.includes('fern'))) {
                            colorHex = baseId.includes('leaves') ? '#3C701B' : '#5D9B3A';
                        }
                        if (!colorHex) colorHex = '#FF00FF';

                        // Use texture ONLY if it was successfully preloaded by the 2D logic
                        const texImg = getTexture(blockState);
                        let textureSrc = null;
                        let validImg = null;
                        if (texImg && texImg.complete && texImg.naturalWidth > 0 && texImg.src) {
                            textureSrc = texImg.src;
                            validImg = texImg;
                        }

                        // Create a unique key for grouping
                        groupKey = textureSrc ? `tex:${textureSrc}:tint:${colorHex}` : `color:${colorHex}`;

                        if (!groups.has(groupKey)) {
                            groups.set(groupKey, { textureSrc, validImg, colorHex, positions: [] });
                        }
                    }
                    blockStateToKey.set(blockState, groupKey);
                }

                if (groupKey !== null) {
                    groups.get(groupKey).positions.push({ x, y, z });
                    count++;
                    if (count % chunkSize === 0) {
                        await new Promise(resolve => setTimeout(resolve, 0)); // Yield to main thread
                    }
                }
            }
        }
    }

    // 2. Second Pass: Build InstancedMeshes
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const dummy = new THREE.Object3D();
    for (const [key, groupData] of groups.entries()) {
        const { textureSrc, validImg, colorHex, positions } = groupData;

        // Base material setup
        const materialOpts = { transparent: false };

        if (validImg) {
            // Create texture instantly from preloaded HTMLImageElement 
            const tex = new THREE.Texture(validImg);
            tex.minFilter = THREE.NearestFilter;
            tex.magFilter = THREE.NearestFilter;
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.needsUpdate = true; // Crucial when passing Image directly
            materialOpts.map = tex;

            // Apply biome tint if it has one
            if (colorHex && colorHex !== '#FF00FF') {
                // Only tint grass/leaves specifically when they have textures
                if (textureSrc.includes('leaves') || textureSrc.includes('grass') || textureSrc.includes('fern') || textureSrc.includes('vine')) {
                    materialOpts.color = new THREE.Color(colorHex);
                } else {
                    materialOpts.color = new THREE.Color(0xffffff); // Ensure base white
                }
            } else {
                materialOpts.color = new THREE.Color(0xffffff);
            }

            // Basic transparency support for glass, ice, leaves
            if (textureSrc.includes('glass') || textureSrc.includes('ice') || textureSrc.includes('leaves')) {
                materialOpts.transparent = true;
                if (!textureSrc.includes('leaves') && !textureSrc.includes('glass')) {
                    materialOpts.opacity = 0.5;
                }
                materialOpts.alphaTest = 0.1; // Fix sorting issues mostly
            }
        } else {
            // Fallback to solid color instantly
            materialOpts.color = new THREE.Color(colorHex);
        }

        const material = new THREE.MeshLambertMaterial(materialOpts);
        const mesh = new THREE.InstancedMesh(geometry, material, positions.length);

        // Pre-allocate instance colors for fast highlighting updates
        const colorArray = new Float32Array(positions.length * 3);
        colorArray.fill(1.0);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

        // Store group keys so we can manage cleanup natively
        blockGroups.set(key, positions);

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            // Center the entire structure around 0,0,0
            dummy.position.set(
                pos.x - width / 2 + 0.5,
                pos.y,
                pos.z - length / 2 + 0.5
            );
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }

        // Performance optimization
        mesh.instanceMatrix.needsUpdate = true;

        scene.add(mesh);
        instancedMeshes.push(mesh);

        await new Promise(resolve => setTimeout(resolve, 0)); // Yield
    }

    // 3. Reset Camera to fit bounding box
    const maxDim = Math.max(width, height, length);
    camera.position.set(maxDim * 0.8, maxDim * 0.8, maxDim * 0.8);
    controls.target.set(0, height / 2, 0); // Look at center
    controls.update();

    document.getElementById('loading-3d').style.display = 'none';
}

export function resetCamera3D(schematic) {
    if (!isInitialized || !schematic) return;
    const { width, height, length } = schematic;
    const maxDim = Math.max(width, height, length);
    camera.position.set(maxDim * 0.8, maxDim * 0.8, maxDim * 0.8);
    controls.target.set(0, height / 2, 0);
    controls.update();
}

/**
 * Highlights a specific layer in 3D by dimming all other blocks.
 * Uses direct Float32Array manipulation for extreme performance (millisecond execution).
 */
export function setHighlightLayer3D(layerIndex, isEnabled) {
    if (!isInitialized || instancedMeshes.length === 0) return;

    for (const [key, positions] of blockGroups.entries()) {
        const meshIndex = Array.from(blockGroups.keys()).indexOf(key);
        const mesh = instancedMeshes[meshIndex];
        if (!mesh || !mesh.instanceColor) continue;

        const colors = mesh.instanceColor.array;

        // Use a simple flat array for extreme CPU speed
        for (let i = 0; i < positions.length; i++) {
            const y = positions[i].y;
            const idx = i * 3;

            let intensity = 1.0;
            if (isEnabled) {
                // Dim blocks not on the current layer
                intensity = (y === layerIndex) ? 1.0 : 0.08;
            }

            colors[idx] = intensity;     // R
            colors[idx + 1] = intensity; // G
            colors[idx + 2] = intensity; // B
        }

        mesh.instanceColor.needsUpdate = true;
    }
}

/**
 * Updates the 3D scene background color based on the selected theme.
 * @param {string} theme 'light' or 'dark'
 */
export function set3DTheme(theme) {
    if (!scene) return;
    if (theme === 'light') {
        scene.background = new THREE.Color('#f0f2f5'); // var(--bg-primary) in light mode
    } else {
        scene.background = new THREE.Color('#0A0A0F'); // var(--bg-primary) in dark mode
    }
}
