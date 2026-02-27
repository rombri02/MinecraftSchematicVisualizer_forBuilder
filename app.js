/**
 * app.js — Main application: file handling, texture rendering, layer navigation, zoom/pan
 *          + flood-fill connected block highlighting & dimension tooltip
 */
import { read } from 'https://cdn.jsdelivr.net/npm/nbtify@2/+esm';
import { parseSchem, parseLitematic } from './parser.js';
import { getBlockColor, getBlockDisplayName, isAir, getTexture, preloadTextures, getTextureFile, getBaseBlockId } from './blockColors.js';
import { init3DViewer, build3DModelAsync, clear3DModel, resetCamera3D, setHighlightLayer3D, set3DTheme } from './viewer3d.js';

// ─── DOM Elements ───

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileBadgeContainer = document.getElementById('file-badge-container');
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const infoPanel = document.getElementById('info-panel');
const layerPanel = document.getElementById('layer-panel');
const tooltipPanel = document.getElementById('tooltip-panel');
const viewPanel = document.getElementById('view-panel');
const materialsPanel = document.getElementById('materials-panel');
const matList = document.getElementById('mat-list');
const matSearch = document.getElementById('mat-search');
const matTotalBadge = document.getElementById('mat-total-badge');
const layerSlider = document.getElementById('layer-slider');
const layerDisplay = document.getElementById('layer-display');
const btnLayerUp = document.getElementById('btn-layer-up');
const btnLayerDown = document.getElementById('btn-layer-down');
const btnResetView = document.getElementById('btn-reset-view');
const btnToggleGrid = document.getElementById('btn-toggle-grid');
const tooltipInfo = document.getElementById('tooltip-info');
const emptyState = document.getElementById('empty-state');
const loadingOverlay = document.getElementById('loading-overlay');
const canvas = document.getElementById('schematic-canvas');
const ctx = canvas.getContext('2d');
const canvasArea = document.getElementById('canvas-area');

// 3D View Elements
const btnView2d = document.getElementById('btn-view-2d');
const btnView3d = document.getElementById('btn-view-3d');
const viewActions2d = document.getElementById('view-actions-2d');
const viewActions3d = document.getElementById('view-actions-3d');
const canvas3dContainer = document.getElementById('canvas-3d-container');
const btnResetCamera3d = document.getElementById('btn-reset-camera-3d');
const chkHighlight3d = document.getElementById('chk-highlight-3d');

// ─── State ───

/** @type {import('./parser.js').Schematic|null} */
let schematic = null;
let currentLayer = 0;
let cellSize = 16;
let showGrid = true;

// View transform
let offsetX = 0;
let offsetY = 0;
let scale = 1;

// Pan state
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

// 3D state
let is3DMode = false;
let is3DModelBuilt = false;

// Hover highlight state
/** @type {Set<string>|null} Set of "x,z" keys for the highlighted group */
let highlightedGroup = null;
/** Bounding box of highlighted group: {minX, minZ, maxX, maxZ, w, h, count} */
let highlightBounds = null;

// Placed blocks state — Map<layerY, Set<"x,z">>
const placedBlocks = new Map();

// Click detection (distinguish from drag)
let mouseDownX = 0;
let mouseDownY = 0;
const CLICK_THRESHOLD = 5; // pixels

// ─── Flood Fill ───



/**
 * BFS flood-fill: find all connected blocks of the same type on the current layer.
 * Returns { cells: Set<"x,z">, minX, minZ, maxX, maxZ, w, h, count }
 */
function floodFill(startX, startZ) {
    const baseId = getBaseBlockId(schematic.getBlock(startX, currentLayer, startZ));
    if (!baseId || isAir('minecraft:' + baseId)) return null;

    const cells = new Set();
    const queue = [[startX, startZ]];
    cells.add(`${startX},${startZ}`);

    let minX = startX, maxX = startX, minZ = startZ, maxZ = startZ;

    while (queue.length > 0) {
        const [cx, cz] = queue.shift();
        // 4-directional neighbors
        const neighbors = [[cx - 1, cz], [cx + 1, cz], [cx, cz - 1], [cx, cz + 1]];
        for (const [nx, nz] of neighbors) {
            const key = `${nx},${nz}`;
            if (cells.has(key)) continue;
            if (nx < 0 || nx >= schematic.width || nz < 0 || nz >= schematic.length) continue;

            const neighborId = getBaseBlockId(schematic.getBlock(nx, currentLayer, nz));
            if (neighborId === baseId) {
                cells.add(key);
                queue.push([nx, nz]);
                if (nx < minX) minX = nx;
                if (nx > maxX) maxX = nx;
                if (nz < minZ) minZ = nz;
                if (nz > maxZ) maxZ = nz;
            }
        }
    }

    const w = maxX - minX + 1;
    const h = maxZ - minZ + 1;
    return { cells, minX, minZ, maxX, maxZ, w, h, count: cells.size };
}

// ─── Resize Canvas ───

function resizeCanvas() {
    const rect = canvasArea.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ─── Initialization ───

initTheme();
preloadTextures().then(() => {
    // We don't strictly need to do anything here, but we wait for it
    console.log("Textures preloaded");
});

// ─── Theme Management ───

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

    if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
        setTheme('light');
    } else {
        setTheme('dark');
    }

    btnThemeToggle.addEventListener('click', () => {
        const current = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        setTheme(current === 'light' ? 'dark' : 'light');
    });
}

function setTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
        btnThemeToggle.textContent = '🌙';
        localStorage.setItem('theme', 'light');
        set3DTheme('light');
    } else {
        document.body.classList.remove('light-theme');
        btnThemeToggle.textContent = '☀️';
        localStorage.setItem('theme', 'dark');
        set3DTheme('dark');
    }
}

// ─── File Handling ───

dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
});

canvasArea.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

canvasArea.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

canvasArea.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
});

fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadFile(file);
});

async function loadFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'schem' && ext !== 'litematic') {
        alert('Unsupported format. Please use .schem or .litematic files.');
        return;
    }

    showLoading(true);

    try {
        const buffer = await file.arrayBuffer();
        const nbtData = await read(buffer);
        const root = nbtData.data ?? nbtData;

        if (ext === 'schem') {
            schematic = parseSchem(root);
        } else {
            schematic = parseLitematic(root);
        }

        if (schematic.name === 'Unnamed') {
            schematic.name = file.name.replace(/\.[^.]+$/, '');
        }

        // Preload all textures for blocks in the schematic's palette
        await preloadTextures(schematic.paletteList);

        onSchematicLoaded(file.name);
    } catch (err) {
        console.error('Failed to parse schematic:', err);
        alert(`Error parsing file: ${err.message}`);
    } finally {
        showLoading(false);
    }
}

function showLoading(active) {
    loadingOverlay.classList.toggle('active', active);
}

function onSchematicLoaded(fileName) {
    fileBadgeContainer.innerHTML = `
    <div class="file-badge">
      📄 ${fileName}
      <button class="close-btn" id="btn-close-file" title="Close">✕</button>
    </div>
  `;
    document.getElementById('btn-close-file').addEventListener('click', closeSchematic);

    infoPanel.style.display = '';
    layerPanel.style.display = '';
    tooltipPanel.style.display = '';
    viewPanel.style.display = '';
    materialsPanel.style.display = '';

    computeMaterials();
    emptyState.classList.add('hidden');

    document.getElementById('info-name').textContent = schematic.name;
    document.getElementById('info-width').textContent = schematic.width;
    document.getElementById('info-length').textContent = schematic.length;
    document.getElementById('info-height').textContent = schematic.height;
    document.getElementById('info-blocks').textContent = schematic.totalNonAir.toLocaleString();

    currentLayer = 0;
    layerSlider.min = 0;
    layerSlider.max = schematic.height - 1;
    layerSlider.value = 0;
    updateLayerDisplay();

    resetView();
}

function closeSchematic() {
    schematic = null;
    highlightedGroup = null;
    highlightBounds = null;
    fileBadgeContainer.innerHTML = '';
    infoPanel.style.display = 'none';
    layerPanel.style.display = 'none';
    tooltipPanel.style.display = 'none';
    viewPanel.style.display = 'none';
    materialsPanel.style.display = 'none';
    matList.innerHTML = '';
    matSearch.value = '';
    emptyState.classList.remove('hidden');
    tooltipInfo.innerHTML = '<span class="tooltip-placeholder">Hover over a block to inspect</span>';
    fileInput.value = '';

    // Reset 3D
    clear3DModel();
    is3DModelBuilt = false;
    switchTo2D();

    render();
}

// ─── Materials List ───

/** Cached materials data: [{baseId, name, count, texFile}] sorted by count desc */
let materialsData = [];

function computeMaterials() {
    const counts = new Map(); // baseId → count

    for (let y = 0; y < schematic.height; y++) {
        for (let z = 0; z < schematic.length; z++) {
            for (let x = 0; x < schematic.width; x++) {
                const bs = schematic.getBlock(x, y, z);
                if (isAir(bs)) continue;
                const baseId = getBaseBlockId(bs);
                if (!baseId) continue;
                counts.set(baseId, (counts.get(baseId) || 0) + 1);
            }
        }
    }

    materialsData = [];
    for (const [baseId, count] of counts) {
        const name = getBlockDisplayName('minecraft:' + baseId);
        const texFile = getTextureFile('minecraft:' + baseId);
        materialsData.push({ baseId, name, count, texFile });
    }
    materialsData.sort((a, b) => b.count - a.count);

    const totalTypes = materialsData.length;
    matTotalBadge.textContent = `${totalTypes} types`;

    renderMaterials('');
}

function formatStacks(count) {
    const stackSize = 64;
    const stacks = Math.floor(count / stackSize);
    const remainder = count % stackSize;
    if (stacks === 0) return `${count}`;
    if (remainder === 0) return `${stacks}×64`;
    return `${stacks}×64 + ${remainder}`;
}

function renderMaterials(filter) {
    const lowerFilter = filter.toLowerCase();
    const filtered = lowerFilter
        ? materialsData.filter(m => m.name.toLowerCase().includes(lowerFilter) || m.baseId.includes(lowerFilter))
        : materialsData;

    matList.innerHTML = filtered.map(m => {
        const texSrc = m.texFile ? `block/${m.texFile}` : null;
        const color = getBlockColor('minecraft:' + m.baseId);
        const bgStyle = texSrc
            ? `background: url('${texSrc}') center/cover; image-rendering: pixelated;`
            : `background: ${color || '#333'};`;

        return `
        <div class="mat-row">
          <div class="mat-swatch" style="${bgStyle}"></div>
          <div class="mat-info">
            <span class="mat-name">${m.name}</span>
            <span class="mat-stacks">${formatStacks(m.count)}</span>
          </div>
          <span class="mat-count">${m.count.toLocaleString()}</span>
        </div>`;
    }).join('');
}

matSearch.addEventListener('input', () => {
    renderMaterials(matSearch.value);
});

// ─── Layer Navigation ───

layerSlider.addEventListener('input', () => {
    currentLayer = parseInt(layerSlider.value);
    highlightedGroup = null;
    highlightBounds = null;
    updateLayerDisplay();

    if (is3DMode) {
        setHighlightLayer3D(currentLayer, chkHighlight3d.checked);
    } else {
        render();
    }
});

btnLayerUp.addEventListener('click', () => changeLayer(1));
btnLayerDown.addEventListener('click', () => changeLayer(-1));

function changeLayer(delta) {
    if (!schematic) return;
    const newLayer = Math.max(0, Math.min(schematic.height - 1, currentLayer + delta));
    if (newLayer !== currentLayer) {
        currentLayer = newLayer;
        highlightedGroup = null;
        highlightBounds = null;
        layerSlider.value = currentLayer;
        updateLayerDisplay();

        if (is3DMode) {
            setHighlightLayer3D(currentLayer, chkHighlight3d.checked);
        } else {
            render();
        }
    }
}

function updateLayerDisplay() {
    if (!schematic) return;
    layerDisplay.textContent = `${currentLayer} / ${schematic.height - 1}`;
}

document.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        changeLayer(1);
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        changeLayer(-1);
    }
});

// ─── View Controls ───

btnResetView.addEventListener('click', resetView);
btnToggleGrid.addEventListener('click', () => {
    showGrid = !showGrid;
    render();
});

btnResetCamera3d.addEventListener('click', () => {
    resetCamera3D(schematic);
});

chkHighlight3d.addEventListener('change', () => {
    if (is3DMode) {
        setHighlightLayer3D(currentLayer, chkHighlight3d.checked);
    }
});

btnView2d.addEventListener('click', switchTo2D);
btnView3d.addEventListener('click', async () => {
    if (is3DMode) return;
    switchTo3D();
    if (!is3DModelBuilt && schematic) {
        is3DModelBuilt = true;
        await build3DModelAsync(schematic);
    }
});

function switchTo2D() {
    is3DMode = false;
    btnView2d.classList.add('active');
    btnView3d.classList.remove('active');
    viewActions2d.style.display = 'flex';
    viewActions3d.style.display = 'none';
    canvas.style.display = 'block';
    canvas3dContainer.style.display = 'none';
    layerPanel.style.display = '';
    tooltipPanel.style.display = '';
    if (schematic) render();
}

function switchTo3D() {
    is3DMode = true;
    btnView3d.classList.add('active');
    btnView2d.classList.remove('active');
    viewActions3d.style.display = 'flex';
    viewActions2d.style.display = 'none';
    canvas.style.display = 'none';
    canvas3dContainer.style.display = 'block';

    // Mostriamo il layerPanel anche nel 3D per poter usare lo slider
    layerPanel.style.display = '';
    tooltipPanel.style.display = 'none';
    init3DViewer();

    // Applica subito l'eventuale highlight
    setTimeout(() => {
        setHighlightLayer3D(currentLayer, chkHighlight3d.checked);
    }, 100);
}

function resetView() {
    if (!schematic) return;

    const rect = canvasArea.getBoundingClientRect();
    const padding = 40;
    const availW = rect.width - padding * 2;
    const availH = rect.height - padding * 2;

    const scaleX = availW / (schematic.width * cellSize);
    const scaleY = availH / (schematic.length * cellSize);
    scale = Math.min(scaleX, scaleY, 3);
    scale = Math.max(scale, 0.1);

    const renderedW = schematic.width * cellSize * scale;
    const renderedH = schematic.length * cellSize * scale;
    offsetX = (rect.width - renderedW) / 2;
    offsetY = (rect.height - renderedH) / 2;

    render();
}

// ─── Zoom (mouse wheel) ───

canvasArea.addEventListener('wheel', e => {
    if (!schematic || is3DMode) return;
    e.preventDefault();

    const rect = canvasArea.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newScale = Math.max(0.05, Math.min(20, scale * zoomFactor));

    offsetX = mouseX - (mouseX - offsetX) * (newScale / scale);
    offsetY = mouseY - (mouseY - offsetY) * (newScale / scale);

    scale = newScale;
    render();
}, { passive: false });

// ─── Pan (click-drag) ───

canvasArea.addEventListener('mousedown', e => {
    if (is3DMode) return;
    if (e.button === 0) {
        isPanning = true;
        panStartX = e.clientX - offsetX;
        panStartY = e.clientY - offsetY;
        mouseDownX = e.clientX;
        mouseDownY = e.clientY;
        canvas.style.cursor = 'grabbing';
    }
});

window.addEventListener('mousemove', e => {
    if (is3DMode) return;
    if (isPanning) {
        offsetX = e.clientX - panStartX;
        offsetY = e.clientY - panStartY;
        render();
    }
    updateTooltip(e);
});

window.addEventListener('mouseup', e => {
    const wasDrag = Math.abs(e.clientX - mouseDownX) > CLICK_THRESHOLD ||
        Math.abs(e.clientY - mouseDownY) > CLICK_THRESHOLD;
    isPanning = false;
    canvas.style.cursor = schematic ? 'grab' : 'default';

    // If it was a click (not a drag), toggle placed state for the group
    if (!wasDrag && schematic) {
        const rect = canvasArea.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const bx = Math.floor((mx - offsetX) / (cellSize * scale));
        const bz = Math.floor((my - offsetY) / (cellSize * scale));

        if (bx >= 0 && bx < schematic.width && bz >= 0 && bz < schematic.length) {
            const blockState = schematic.getBlock(bx, currentLayer, bz);
            if (!isAir(blockState)) {
                const group = floodFill(bx, bz);
                if (group) {
                    togglePlaced(currentLayer, group.cells);
                    render();
                }
            }
        }
    }
});

/**
 * Toggle placed state for a set of block cells on a given layer.
 * If any cell in the group is NOT placed, mark all as placed.
 * If ALL cells are already placed, unmark all.
 */
function togglePlaced(layer, cells) {
    if (!placedBlocks.has(layer)) {
        placedBlocks.set(layer, new Set());
    }
    const layerSet = placedBlocks.get(layer);

    // Check if all cells are already placed
    let allPlaced = true;
    for (const key of cells) {
        if (!layerSet.has(key)) {
            allPlaced = false;
            break;
        }
    }

    if (allPlaced) {
        // Un-place all
        for (const key of cells) layerSet.delete(key);
    } else {
        // Place all
        for (const key of cells) layerSet.add(key);
    }
}

// ─── Hover Tooltip with Flood Fill ───

/** Track which block coords are currently hovered to avoid redundant flood fills */
let lastHoverX = -1;
let lastHoverZ = -1;

function updateTooltip(e) {
    if (!schematic) return;

    const rect = canvasArea.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - offsetX) / (cellSize * scale);
    const worldZ = (mouseY - offsetY) / (cellSize * scale);

    const bx = Math.floor(worldX);
    const bz = Math.floor(worldZ);

    if (bx < 0 || bx >= schematic.width || bz < 0 || bz >= schematic.length) {
        if (highlightedGroup) {
            highlightedGroup = null;
            highlightBounds = null;
            lastHoverX = -1;
            lastHoverZ = -1;
            render();
        }
        tooltipInfo.innerHTML = '<span class="tooltip-placeholder">Hover over a block to inspect</span>';
        return;
    }

    // Only recompute flood fill if hovered block changed
    if (bx !== lastHoverX || bz !== lastHoverZ) {
        lastHoverX = bx;
        lastHoverZ = bz;

        const blockState = schematic.getBlock(bx, currentLayer, bz);

        if (isAir(blockState)) {
            highlightedGroup = null;
            highlightBounds = null;
        } else {
            const result = floodFill(bx, bz);
            if (result) {
                highlightedGroup = result.cells;
                highlightBounds = result;
            } else {
                highlightedGroup = null;
                highlightBounds = null;
            }
        }
        render();
    }

    const blockState = schematic.getBlock(bx, currentLayer, bz);
    const name = getBlockDisplayName(blockState);
    const isAirBlock = isAir(blockState);

    // Texture preview
    const texFile = getTextureFile(blockState);
    const texSrc = texFile ? `block/${texFile}` : null;
    const color = getBlockColor(blockState);
    const bgStyle = isAirBlock
        ? 'repeating-conic-gradient(rgba(255,255,255,0.06) 0% 25%, transparent 0% 50%) 0 0 / 10px 10px'
        : texSrc
            ? `url('${texSrc}') center/cover`
            : color;

    // Build dimension info
    let dimHtml = '';
    if (highlightBounds && !isAirBlock) {
        const b = highlightBounds;
        dimHtml = `
        <div class="block-dims">
          <span class="dim-size">${b.w} × ${b.h}</span>
          <span class="dim-count">${b.count} block${b.count > 1 ? 's' : ''}</span>
        </div>`;
    }

    tooltipInfo.innerHTML = `
    <div class="block-preview">
      <div class="color-swatch" style="background: ${bgStyle}; image-rendering: pixelated;"></div>
      <div>
        <div class="block-name">${name}</div>
        <div class="block-coords">X: ${bx}  Y: ${currentLayer}  Z: ${bz}</div>
        ${dimHtml}
      </div>
    </div>
  `;
}

// ─── Canvas Rendering ───

function render() {
    const rect = canvasArea.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    if (!schematic) return;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Disable image smoothing so pixel art textures stay sharp
    ctx.imageSmoothingEnabled = false;

    const sW = schematic.width;
    const sL = schematic.length;

    // Draw checkerboard background for the schematic area
    const checkerSize = cellSize / 2;
    for (let z = 0; z < sL; z++) {
        for (let x = 0; x < sW; x++) {
            const px = x * cellSize;
            const py = z * cellSize;
            for (let cz = 0; cz < 2; cz++) {
                for (let cx = 0; cx < 2; cx++) {
                    const isDark = (cx + cz) % 2 === 0;
                    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
                    ctx.fillRect(px + cx * checkerSize, py + cz * checkerSize, checkerSize, checkerSize);
                }
            }
        }
    }

    // Helper to draw a single block (handles both texture, color, and tinting)
    function drawCell(x, z, blockState, alpha) {
        if (isAir(blockState)) return;
        const px = x * cellSize;
        const py = z * cellSize;
        const baseId = getBaseBlockId(blockState);

        ctx.globalAlpha = alpha;

        // Try texture first
        const texImg = getTexture(blockState);
        if (texImg) {
            ctx.drawImage(texImg, px, py, cellSize, cellSize);
        } else {
            // Fallback to flat color
            const color = getBlockColor(blockState);
            if (color) {
                ctx.fillStyle = color;
                ctx.fillRect(px, py, cellSize, cellSize);
            }
        }

        // ─── Biome tint for foliage/grass (grayscale → green) ───
        if (baseId && (baseId.includes('leaves') || baseId === 'grass_block'
            || baseId === 'short_grass' || baseId === 'tall_grass'
            || baseId === 'fern' || baseId === 'large_fern'
            || baseId === 'vine' || baseId === 'sugar_cane')) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = baseId.includes('leaves') ? '#6aaf3a' : '#79c05a';
            ctx.fillRect(px, py, cellSize, cellSize);
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = 1.0;
    }

    // ─── Draw the layer below (faintly) ───
    if (currentLayer > 0) {
        for (let z = 0; z < sL; z++) {
            for (let x = 0; x < sW; x++) {
                const belowState = schematic.getBlock(x, currentLayer - 1, z);
                if (!isAir(belowState)) {
                    const isHovered = (x === lastHoverX && z === lastHoverZ);
                    const alpha = isHovered ? 0.40 : 0.15;
                    drawCell(x, z, belowState, alpha);
                }
            }
        }
    }

    // ─── Draw the current layer blocks ───
    const layerPlaced = placedBlocks.get(currentLayer);

    for (let z = 0; z < sL; z++) {
        for (let x = 0; x < sW; x++) {
            const blockState = schematic.getBlock(x, currentLayer, z);
            if (isAir(blockState)) continue;

            // Draw the main block
            drawCell(x, z, blockState, 1.0);

            const px = x * cellSize;
            const py = z * cellSize;
            const baseId = getBaseBlockId(blockState);

            // ─── Placed overlay ───
            const key = `${x},${z}`;
            if (layerPlaced && layerPlaced.has(key)) {
                // Green tint overlay
                ctx.fillStyle = 'rgba(0, 206, 201, 0.35)';
                ctx.fillRect(px, py, cellSize, cellSize);
                // Diagonal strikethrough line
                ctx.strokeStyle = 'rgba(0, 206, 201, 0.7)';
                ctx.lineWidth = 1.5 / scale;
                ctx.beginPath();
                ctx.moveTo(px + 1, py + 1);
                ctx.lineTo(px + cellSize - 1, py + cellSize - 1);
                ctx.stroke();
            }

            // ─── Vertical Stack Indicator ───
            let stackCount = 0;
            // Scan upwards to count identical blocks
            for (let y = currentLayer + 1; y < schematic.height; y++) {
                const aboveState = schematic.getBlock(x, y, z);
                if (isAir(aboveState)) break;
                if (getBaseBlockId(aboveState) === baseId) {
                    stackCount++;
                } else {
                    break;
                }
            }

            if (stackCount > 0) {
                // Determine opacity based on stack height (max out at 10 blocks)
                const maxStack = 10;
                // Base intensity 0.15 up to 0.7 depending on height
                const intensity = 0.15 + 0.55 * Math.min(stackCount / maxStack, 1.0);

                // Overlay a warm amber/orange tint
                ctx.fillStyle = `rgba(255, 140, 0, ${intensity})`;

                // Blend it smoothly over the block texture
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillRect(px, py, cellSize, cellSize);
                ctx.globalCompositeOperation = 'source-over'; // restore
            }
        }
    }

    // Draw grid
    if (showGrid) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 0.5 / scale;

        ctx.beginPath();
        for (let x = 0; x <= sW; x++) {
            ctx.moveTo(x * cellSize, 0);
            ctx.lineTo(x * cellSize, sL * cellSize);
        }
        for (let z = 0; z <= sL; z++) {
            ctx.moveTo(0, z * cellSize);
            ctx.lineTo(sW * cellSize, z * cellSize);
        }
        ctx.stroke();
    }

    // ─── Draw highlight outline for connected group ───
    if (highlightedGroup && highlightedGroup.size > 0) {
        // Semi-transparent overlay on highlighted cells
        ctx.fillStyle = 'rgba(108, 92, 231, 0.15)';
        for (const key of highlightedGroup) {
            const [gx, gz] = key.split(',').map(Number);
            ctx.fillRect(gx * cellSize, gz * cellSize, cellSize, cellSize);
        }

        // Draw outline: for each cell in the group, draw edges where neighbors are NOT in the group
        ctx.strokeStyle = 'rgba(108, 92, 231, 0.9)';
        ctx.lineWidth = 2 / scale;
        ctx.beginPath();

        for (const key of highlightedGroup) {
            const [gx, gz] = key.split(',').map(Number);
            const px = gx * cellSize;
            const pz = gz * cellSize;

            if (!highlightedGroup.has(`${gx},${gz - 1}`)) {
                ctx.moveTo(px, pz);
                ctx.lineTo(px + cellSize, pz);
            }
            if (!highlightedGroup.has(`${gx},${gz + 1}`)) {
                ctx.moveTo(px, pz + cellSize);
                ctx.lineTo(px + cellSize, pz + cellSize);
            }
            if (!highlightedGroup.has(`${gx - 1},${gz}`)) {
                ctx.moveTo(px, pz);
                ctx.lineTo(px, pz + cellSize);
            }
            if (!highlightedGroup.has(`${gx + 1},${gz}`)) {
                ctx.moveTo(px + cellSize, pz);
                ctx.lineTo(px + cellSize, pz + cellSize);
            }
        }

        ctx.stroke();

        // ─── Per-segment dimension lines & labels ───
        if (highlightBounds) {
            const b = highlightBounds;
            const dimColor = '#FF6B4A';
            const gap = 4 / scale;
            const tickLen = 4 / scale;
            const fontSize = Math.max(10, 13 / scale);

            ctx.strokeStyle = dimColor;
            ctx.fillStyle = dimColor;
            ctx.lineWidth = 2 / scale;
            ctx.font = `bold ${fontSize}px Inter, sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';

            // Helper: draw a horizontal dimension line with label
            // labelSide: 'above' or 'below'
            function drawHDim(x1, x2, y, label, labelSide = 'above') {
                const left = x1 * cellSize;
                const right = (x2 + 1) * cellSize;
                const lineY = y;
                ctx.beginPath(); ctx.moveTo(left, lineY); ctx.lineTo(right, lineY); ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(left, lineY - tickLen); ctx.lineTo(left, lineY + tickLen);
                ctx.moveTo(right, lineY - tickLen); ctx.lineTo(right, lineY + tickLen);
                ctx.stroke();
                const lx = (left + right) / 2;
                const ly = labelSide === 'above'
                    ? lineY - gap - fontSize * 0.5
                    : lineY + gap + fontSize * 0.5;
                const tw = ctx.measureText(label).width;
                const pp = 3 / scale;
                ctx.fillStyle = 'rgba(10, 10, 15, 0.75)';
                ctx.beginPath();
                ctx.roundRect(lx - tw / 2 - pp, ly - fontSize * 0.55, tw + pp * 2, fontSize * 1.1, 3 / scale);
                ctx.fill();
                ctx.fillStyle = dimColor;
                ctx.fillText(label, lx, ly);
            }

            // Helper: draw a vertical dimension line with label
            // labelSide: 'left' or 'right'
            function drawVDim(z1, z2, x, label, labelSide = 'left') {
                const top = z1 * cellSize;
                const bottom = (z2 + 1) * cellSize;
                const lineX = x;
                ctx.beginPath(); ctx.moveTo(lineX, top); ctx.lineTo(lineX, bottom); ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(lineX - tickLen, top); ctx.lineTo(lineX + tickLen, top);
                ctx.moveTo(lineX - tickLen, bottom); ctx.lineTo(lineX + tickLen, bottom);
                ctx.stroke();
                const lx = labelSide === 'left'
                    ? lineX - gap - fontSize * 0.5
                    : lineX + gap + fontSize * 0.5;
                const ly = (top + bottom) / 2;
                const tw = ctx.measureText(label).width;
                const pp = 3 / scale;
                ctx.fillStyle = 'rgba(10, 10, 15, 0.75)';
                ctx.beginPath();
                ctx.roundRect(lx - tw / 2 - pp, ly - fontSize * 0.55, tw + pp * 2, fontSize * 1.1, 3 / scale);
                ctx.fill();
                ctx.fillStyle = dimColor;
                ctx.fillText(label, lx, ly);
            }

            // Build per-column top/bottom and per-row left/right
            const colTop = new Map();  // x → minZ
            const colBot = new Map();  // x → maxZ
            const rowLeft = new Map(); // z → minX
            const rowRight = new Map(); // z → maxX
            for (const key of highlightedGroup) {
                const [gx, gz] = key.split(',').map(Number);
                if (!colTop.has(gx) || gz < colTop.get(gx)) colTop.set(gx, gz);
                if (!colBot.has(gx) || gz > colBot.get(gx)) colBot.set(gx, gz);
                if (!rowLeft.has(gz) || gx < rowLeft.get(gz)) rowLeft.set(gz, gx);
                if (!rowRight.has(gz) || gx > rowRight.get(gz)) rowRight.set(gz, gx);
            }

            // 1) Top-perimeter width dimensions
            const sortedXs = [...colTop.keys()].sort((a, b) => a - b);
            const topSegs = [];
            for (const x of sortedXs) {
                const z = colTop.get(x);
                const last = topSegs.length > 0 ? topSegs[topSegs.length - 1] : null;
                if (last && last.z === z && x === last.endX + 1) last.endX = x;
                else topSegs.push({ startX: x, endX: x, z });
            }
            for (const seg of topSegs) {
                const w = seg.endX - seg.startX + 1;
                if (w >= 2) drawHDim(seg.startX, seg.endX, seg.z * cellSize - gap, w.toString(), 'above');
            }

            // 2) Bottom-perimeter width dimensions
            const botSegs = [];
            for (const x of sortedXs) {
                const z = colBot.get(x);
                const last = botSegs.length > 0 ? botSegs[botSegs.length - 1] : null;
                if (last && last.z === z && x === last.endX + 1) last.endX = x;
                else botSegs.push({ startX: x, endX: x, z });
            }
            for (const seg of botSegs) {
                const w = seg.endX - seg.startX + 1;
                if (w >= 2) drawHDim(seg.startX, seg.endX, (seg.z + 1) * cellSize + gap, w.toString(), 'below');
            }

            // 3) Left-perimeter height dimensions
            const sortedZs = [...rowLeft.keys()].sort((a, b) => a - b);
            const leftSegs = [];
            for (const z of sortedZs) {
                const x = rowLeft.get(z);
                const last = leftSegs.length > 0 ? leftSegs[leftSegs.length - 1] : null;
                if (last && last.x === x && z === last.endZ + 1) last.endZ = z;
                else leftSegs.push({ startZ: z, endZ: z, x });
            }
            for (const seg of leftSegs) {
                const h = seg.endZ - seg.startZ + 1;
                if (h >= 2) drawVDim(seg.startZ, seg.endZ, seg.x * cellSize - gap, h.toString(), 'left');
            }

            // 4) Right-perimeter height dimensions
            const rightSegs = [];
            for (const z of sortedZs) {
                const x = rowRight.get(z);
                const last = rightSegs.length > 0 ? rightSegs[rightSegs.length - 1] : null;
                if (last && last.x === x && z === last.endZ + 1) last.endZ = z;
                else rightSegs.push({ startZ: z, endZ: z, x });
            }
            for (const seg of rightSegs) {
                const h = seg.endZ - seg.startZ + 1;
                if (h >= 2) drawVDim(seg.startZ, seg.endZ, (seg.x + 1) * cellSize + gap, h.toString(), 'right');
            }
        }
    }

    // Draw border
    ctx.strokeStyle = 'rgba(108, 92, 231, 0.3)';
    ctx.lineWidth = 2 / scale;
    ctx.strokeRect(0, 0, sW * cellSize, sL * cellSize);

    ctx.restore();
}

// Initial render
render();
