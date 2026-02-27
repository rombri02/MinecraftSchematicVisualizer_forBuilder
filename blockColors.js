/**
 * blockColors.js — Auto-discovery texture system
 * For each block, tries to find matching textures in block/ folder.
 * Priority: _top.png → .png → fallback color
 */

const TEXTURE_BASE = 'block/';

// ─── Special name overrides ───
// block ID (without minecraft:) → actual texture filename
// Only needed when the texture filename doesn't match the block ID
const NAME_OVERRIDES = {
    'magma_block': 'magma',
    'snow_block': 'snow',
    'water': 'water_still',
    'lava': 'lava_still',
    'bookshelf': 'oak_planks',
    'chest': 'oak_planks',
    'ender_chest': 'obsidian',
    'trapped_chest': 'oak_planks',
    'redstone_wall_torch': 'redstone_torch',
    'wall_torch': 'torch',
    'jack_o_lantern': 'pumpkin_top',
    'melon_stem': 'melon_side',
    'pumpkin_stem': 'pumpkin_side',
    'tall_grass': 'tall_grass_top',
    'large_fern': 'large_fern_top',
    'sunflower': 'sunflower_front',
    'rose_bush': 'rose_bush_top',
    'lilac': 'lilac_top',
    'peony': 'peony_top',
    'infested_stone': 'stone',
    'infested_cobblestone': 'cobblestone',
    'infested_stone_bricks': 'stone_bricks',
    'infested_mossy_stone_bricks': 'mossy_stone_bricks',
    'infested_cracked_stone_bricks': 'cracked_stone_bricks',
    'infested_chiseled_stone_bricks': 'chiseled_stone_bricks',
    'infested_deepslate': 'deepslate',
    'moving_piston': 'piston_top',
    'piston_head': 'piston_top',
    'spawner': 'spawner',
    'farmland': 'farmland',
    'reinforced_deepslate': 'reinforced_deepslate_top',
};

// Stairs/slabs/walls/fences → parent block texture
const DERIVED_BLOCK_PATTERNS = [
    // Remove suffix to find parent block
    [/_stairs$/, ''],
    [/_slab$/, ''],
    [/_wall$/, ''],
    [/_fence$/, ''],
    [/_fence_gate$/, ''],
    [/_pressure_plate$/, ''],
    [/_button$/, ''],
    [/_door$/, ''],
    [/_trapdoor$/, ''],
    [/_sign$/, ''],
    [/_wall_sign$/, ''],
    [/_hanging_sign$/, ''],
    [/_wall_hanging_sign$/, ''],
    [/_carpet$/, '_wool'],
    [/_bed$/, '_wool'],
    [/_banner$/, '_wool'],
    [/_wall_banner$/, '_wool'],
    [/_candle_cake$/, '_candle'],
];

// Special parent mappings for derived blocks
const DERIVED_OVERRIDES = {
    'brick_stairs': 'bricks',
    'brick_slab': 'bricks',
    'brick_wall': 'bricks',
    'stone_brick_stairs': 'stone_bricks',
    'stone_brick_slab': 'stone_bricks',
    'stone_brick_wall': 'stone_bricks',
    'mossy_stone_brick_stairs': 'mossy_stone_bricks',
    'mossy_stone_brick_slab': 'mossy_stone_bricks',
    'mossy_stone_brick_wall': 'mossy_stone_bricks',
    'nether_brick_stairs': 'nether_bricks',
    'nether_brick_slab': 'nether_bricks',
    'nether_brick_wall': 'nether_bricks',
    'nether_brick_fence': 'nether_bricks',
    'red_nether_brick_stairs': 'red_nether_bricks',
    'red_nether_brick_slab': 'red_nether_bricks',
    'red_nether_brick_wall': 'red_nether_bricks',
    'end_stone_brick_stairs': 'end_stone_bricks',
    'end_stone_brick_slab': 'end_stone_bricks',
    'end_stone_brick_wall': 'end_stone_bricks',
    'prismarine_brick_stairs': 'prismarine_bricks',
    'prismarine_brick_slab': 'prismarine_bricks',
    'mud_brick_stairs': 'mud_bricks',
    'mud_brick_slab': 'mud_bricks',
    'mud_brick_wall': 'mud_bricks',
    'smooth_stone_slab': 'smooth_stone',
    'quartz_stairs': 'quartz_block',
    'quartz_slab': 'quartz_block',
    'purpur_stairs': 'purpur_block',
    'purpur_slab': 'purpur_block',
    'cut_copper_stairs': 'cut_copper',
    'cut_copper_slab': 'cut_copper',
    'waxed_cut_copper_stairs': 'cut_copper',
    'waxed_cut_copper_slab': 'cut_copper',
    'exposed_cut_copper_stairs': 'exposed_cut_copper',
    'exposed_cut_copper_slab': 'exposed_cut_copper',
    'weathered_cut_copper_stairs': 'weathered_cut_copper',
    'weathered_cut_copper_slab': 'weathered_cut_copper',
    'oxidized_cut_copper_stairs': 'oxidized_cut_copper',
    'oxidized_cut_copper_slab': 'oxidized_cut_copper',
    'tuff_brick_stairs': 'tuff_bricks',
    'tuff_brick_slab': 'tuff_bricks',
    'tuff_brick_wall': 'tuff_bricks',
    'polished_tuff_stairs': 'polished_tuff',
    'polished_tuff_slab': 'polished_tuff',
    'polished_tuff_wall': 'polished_tuff',
    'deepslate_brick_stairs': 'deepslate_bricks',
    'deepslate_brick_slab': 'deepslate_bricks',
    'deepslate_brick_wall': 'deepslate_bricks',
    'deepslate_tile_stairs': 'deepslate_tiles',
    'deepslate_tile_slab': 'deepslate_tiles',
    'deepslate_tile_wall': 'deepslate_tiles',
    'polished_blackstone_brick_stairs': 'polished_blackstone_bricks',
    'polished_blackstone_brick_slab': 'polished_blackstone_bricks',
    'polished_blackstone_brick_wall': 'polished_blackstone_bricks',
};

// Waxed copper → unwaxed equivalent
const WAXED_MAP = {
    'waxed_copper_block': 'copper_block',
    'waxed_exposed_copper': 'exposed_copper',
    'waxed_weathered_copper': 'weathered_copper',
    'waxed_oxidized_copper': 'oxidized_copper',
    'waxed_cut_copper': 'cut_copper',
    'waxed_exposed_cut_copper': 'exposed_cut_copper',
    'waxed_weathered_cut_copper': 'weathered_cut_copper',
    'waxed_oxidized_cut_copper': 'oxidized_cut_copper',
    'waxed_chiseled_copper': 'chiseled_copper',
    'waxed_exposed_chiseled_copper': 'exposed_chiseled_copper',
    'waxed_weathered_chiseled_copper': 'weathered_chiseled_copper',
    'waxed_oxidized_chiseled_copper': 'oxidized_chiseled_copper',
    'waxed_copper_grate': 'copper_grate',
    'waxed_exposed_copper_grate': 'exposed_copper_grate',
    'waxed_weathered_copper_grate': 'weathered_copper_grate',
    'waxed_oxidized_copper_grate': 'oxidized_copper_grate',
    'waxed_copper_bulb': 'copper_bulb',
    'waxed_exposed_copper_bulb': 'exposed_copper_bulb',
    'waxed_weathered_copper_bulb': 'weathered_copper_bulb',
    'waxed_oxidized_copper_bulb': 'oxidized_copper_bulb',
};

// ─── Texture cache ───
const textureCache = new Map();   // blockId → Image|'none'
const imageCache = new Map();     // filename → Image
const pendingLoads = new Map();   // filename → Promise<Image|null>

/**
 * Try to load an image from the block/ folder. Returns a Promise.
 * Resolves to Image on success, null on 404/error.
 */
function tryLoadImage(filename) {
    if (imageCache.has(filename)) return Promise.resolve(imageCache.get(filename));
    if (pendingLoads.has(filename)) return pendingLoads.get(filename);

    const promise = new Promise(resolve => {
        const img = new Image();
        img.onload = () => { imageCache.set(filename, img); resolve(img); };
        img.onerror = () => { imageCache.set(filename, null); resolve(null); };
        img.src = TEXTURE_BASE + filename;
    });
    pendingLoads.set(filename, promise);
    return promise;
}

/**
 * Resolve the base texture name for a block ID (without minecraft: prefix).
 * Returns an array of candidate filenames to try, in priority order.
 */
function getCandidates(blockId) {
    // Check direct override
    if (NAME_OVERRIDES[blockId]) {
        const ov = NAME_OVERRIDES[blockId];
        // If override already has extension info, just use it
        if (ov.endsWith('.png')) return [ov];
        return [ov + '_top.png', ov + '.png'];
    }

    // Waxed copper
    if (WAXED_MAP[blockId]) {
        const base = WAXED_MAP[blockId];
        return [base + '_top.png', base + '.png'];
    }

    // Derived blocks (stairs, slabs, walls, etc.)
    if (DERIVED_OVERRIDES[blockId]) {
        const base = DERIVED_OVERRIDES[blockId];
        return [base + '_top.png', base + '.png'];
    }
    for (const [pattern, replacement] of DERIVED_BLOCK_PATTERNS) {
        if (pattern.test(blockId)) {
            const base = blockId.replace(pattern, replacement);
            if (base) return [base + '_top.png', base + '.png'];
        }
    }

    // Default: try _top first (top-down view), then plain
    return [blockId + '_top.png', blockId + '.png'];
}

/**
 * Preload all textures for the blocks in a schematic's palette.
 * Call this once after parsing a schematic, before rendering.
 */
export async function preloadTextures(paletteList) {
    const promises = [];

    for (const blockState of paletteList) {
        if (isAir(blockState)) continue;
        const blockId = blockState.split('[')[0].toLowerCase().replace('minecraft:', '');
        if (textureCache.has(blockId)) continue;

        const candidates = getCandidates(blockId);

        const p = (async () => {
            for (const filename of candidates) {
                const img = await tryLoadImage(filename);
                if (img) {
                    textureCache.set(blockId, img);
                    return;
                }
            }
            textureCache.set(blockId, 'none');
        })();

        promises.push(p);
    }

    await Promise.all(promises);
}

/**
 * Get a loaded texture Image for a block state. Returns null if not available.
 * Must call preloadTextures first.
 */
export function getTexture(blockState) {
    if (!blockState) return null;
    const blockId = blockState.split('[')[0].toLowerCase().replace('minecraft:', '');
    const cached = textureCache.get(blockId);
    if (!cached || cached === 'none') return null;
    return cached;
}

/**
 * Get the texture filename for tooltip display.
 */
export function getTextureFile(blockState) {
    if (!blockState) return null;
    const blockId = blockState.split('[')[0].toLowerCase().replace('minecraft:', '');
    const cached = textureCache.get(blockId);
    if (!cached || cached === 'none') return null;
    // Extract filename from img.src
    const src = cached.src;
    const idx = src.lastIndexOf('/');
    return idx >= 0 ? src.substring(idx + 1) : src;
}

// ─── Fallback colors (used when no texture is available) ───
const BLOCK_COLORS = {
    'minecraft:stone': '#7F7F7F',
    'minecraft:granite': '#9A6C50',
    'minecraft:diorite': '#BFBFBF',
    'minecraft:andesite': '#888888',
    'minecraft:deepslate': '#505050',
    'minecraft:cobblestone': '#7A7A7A',
    'minecraft:dirt': '#865F3A',
    'minecraft:grass_block': '#5D9B3A',
    'minecraft:sand': '#DBD3A0',
    'minecraft:gravel': '#857F7E',
    'minecraft:clay': '#9FA4B1',
    'minecraft:oak_planks': '#B08B56',
    'minecraft:spruce_planks': '#735531',
    'minecraft:birch_planks': '#C3B37E',
    'minecraft:iron_block': '#D8D8D8',
    'minecraft:gold_block': '#F5DA2A',
    'minecraft:diamond_block': '#62ECE5',
    'minecraft:netherrack': '#6B2B20',
    'minecraft:obsidian': '#0D0018',
    'minecraft:glowstone': '#EAC664',
    'minecraft:bedrock': '#555555',
    'minecraft:water': '#3F76E4',
    'minecraft:lava': '#CF5B10',
    'minecraft:ice': '#91B7FD',
    'minecraft:snow': '#F0FAFA',
    'minecraft:snow_block': '#F0FAFA',
    'minecraft:white_wool': '#E9ECEC',
    'minecraft:white_concrete': '#CFD5D6',
    'minecraft:bricks': '#96614B',
    'minecraft:stone_bricks': '#7A7A7A',
    'minecraft:terracotta': '#985E43',
    'minecraft:quartz_block': '#E8E4DA',
};

export function getBlockColor(blockState) {
    if (!blockState) return null;
    const baseId = blockState.split('[')[0].toLowerCase();
    if (baseId in BLOCK_COLORS) return BLOCK_COLORS[baseId];
    const withNs = baseId.startsWith('minecraft:') ? baseId : 'minecraft:' + baseId;
    if (withNs in BLOCK_COLORS) return BLOCK_COLORS[withNs];
    return '#FF00FF';
}

export function getBlockDisplayName(blockState) {
    if (!blockState) return 'Air';
    const baseId = blockState.split('[')[0].replace('minecraft:', '').replace(/_/g, ' ');
    return baseId.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Get the base block name (without properties and namespace).
 * e.g. "minecraft:stone_bricks[variant=mossy]" → "stone_bricks"
 */
export function getBaseBlockId(blockState) {
    if (!blockState) return null;
    return blockState.split('[')[0].toLowerCase().replace('minecraft:', '');
}

export function isAir(blockState) {
    if (!blockState) return true;
    const b = blockState.split('[')[0].toLowerCase();
    return b === 'minecraft:air' || b === 'minecraft:cave_air' || b === 'minecraft:void_air' || b === 'air';
}
