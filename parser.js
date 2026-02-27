/**
 * parser.js — Parse Sponge Schematic v2 (.schem) and Litematic (.litematic) NBT data
 * Returns a unified Schematic object.
 */

/**
 * @typedef {Object} Schematic
 * @property {number} width   - X dimension
 * @property {number} height  - Y dimension
 * @property {number} length  - Z dimension
 * @property {string} name    - Schematic name
 * @property {string[]} paletteList - Array index → block state string
 * @property {function(number,number,number):string|null} getBlock - Get block at (x,y,z)
 * @property {number} totalNonAir - Count of non-air blocks
 */

// ─── Varint Decoder (for .schem BlockData) ───

function decodeVarintArray(bytes, expectedCount) {
    const result = new Int32Array(expectedCount);
    let cursor = 0;
    for (let i = 0; i < expectedCount; i++) {
        let value = 0;
        let shift = 0;
        let b;
        do {
            if (cursor >= bytes.length) {
                throw new Error(`Unexpected end of varint data at index ${i}`);
            }
            b = bytes[cursor++];
            value |= (b & 0x7F) << shift;
            shift += 7;
        } while ((b & 0x80) !== 0);
        result[i] = value;
    }
    return result;
}

// ─── Sponge Schematic v2 (.schem) parser ───

export function parseSchem(nbtData) {
    // The root tag may be wrapped in a "Schematic" compound or be the root itself
    const root = nbtData.Schematic || nbtData;

    const width = root.Width;
    const height = root.Height;
    const length = root.Length;
    const name = root.Metadata?.Name || root.Metadata?.name || 'Unnamed';

    // Build palette: the Palette tag maps block state strings → integer indices
    const paletteTag = root.Palette;
    if (!paletteTag) throw new Error('No Palette found in .schem file');

    const maxIndex = Object.values(paletteTag).reduce((a, b) => Math.max(a, b), 0);
    const paletteList = new Array(maxIndex + 1).fill(null);
    for (const [blockState, index] of Object.entries(paletteTag)) {
        paletteList[Number(index)] = blockState;
    }

    // Decode BlockData (varint encoded byte array)
    const blockDataRaw = root.BlockData;
    if (!blockDataRaw) throw new Error('No BlockData found in .schem file');

    // blockDataRaw could be Int8Array or Uint8Array depending on NBTify
    const bytes = new Uint8Array(blockDataRaw.buffer || blockDataRaw);
    const totalBlocks = width * height * length;
    const blockIndices = decodeVarintArray(bytes, totalBlocks);

    // Count non-air blocks
    let totalNonAir = 0;
    const airIndices = new Set();
    paletteList.forEach((state, idx) => {
        if (!state || state === 'minecraft:air' || state === 'minecraft:cave_air' || state === 'minecraft:void_air') {
            airIndices.add(idx);
        }
    });
    for (let i = 0; i < blockIndices.length; i++) {
        if (!airIndices.has(blockIndices[i])) totalNonAir++;
    }

    // .schem indexing: x + z * Width + y * Width * Length
    function getBlock(x, y, z) {
        if (x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= length) return null;
        const index = x + z * width + y * width * length;
        const paletteIdx = blockIndices[index];
        return paletteList[paletteIdx] || null;
    }

    return { width, height, length, name, paletteList, getBlock, totalNonAir };
}

// ─── Litematic parser ───

export function parseLitematic(nbtData) {
    const regions = nbtData.Regions;
    if (!regions) throw new Error('No Regions found in .litematic file');

    // Use the first region
    const regionName = Object.keys(regions)[0];
    const region = regions[regionName];
    if (!region) throw new Error('Empty Regions in .litematic file');

    const size = region.Size;
    // Sizes can be negative; use absolute values
    const width = Math.abs(size.x ?? size.X);
    const height = Math.abs(size.y ?? size.Y);
    const length = Math.abs(size.z ?? size.Z);

    const palette = region.BlockStatePalette;
    if (!palette || palette.length === 0) throw new Error('No BlockStatePalette found');

    // Build palette list: each entry is { Name: "minecraft:stone", Properties: {...} }
    const paletteList = palette.map(entry => {
        let name = entry.Name;
        if (entry.Properties && Object.keys(entry.Properties).length > 0) {
            const props = Object.entries(entry.Properties)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => `${k}=${v}`)
                .join(',');
            name += `[${props}]`;
        }
        return name;
    });

    // Decode block states from packed long array
    const blockStatesLong = region.BlockStates;
    if (!blockStatesLong) throw new Error('No BlockStates found');

    const totalBlocks = width * height * length;
    const bitsPerEntry = Math.max(2, Math.ceil(Math.log2(palette.length)));
    const entriesPerLong = Math.floor(64 / bitsPerEntry);
    const mask = (1n << BigInt(bitsPerEntry)) - 1n;

    const blockIndices = new Int32Array(totalBlocks);

    const expectedSpanning = Math.ceil((totalBlocks * bitsPerEntry) / 64);
    const expectedNonSpanning = Math.ceil(totalBlocks / Math.floor(64 / bitsPerEntry));
    const isSpanning = blockStatesLong.length === expectedSpanning && expectedSpanning !== expectedNonSpanning;

    if (isSpanning) {
        for (let i = 0; i < totalBlocks; i++) {
            const startBit = i * bitsPerEntry;
            const startIndex = Math.floor(startBit / 64);
            const endBit = startBit + bitsPerEntry - 1;
            const endIndex = Math.floor(endBit / 64);
            const startBitOffset = startBit % 64;

            let val1 = BigInt.asUintN(64, BigInt(blockStatesLong[startIndex]));
            let paletteIdx;

            if (startIndex === endIndex) {
                // Value is fully contained in this long
                paletteIdx = Number((val1 >> BigInt(startBitOffset)) & mask);
            } else {
                // Value spans across this long and the next long
                const endBitOffset = 64 - startBitOffset;
                // Safely handle the edge case where endIndex might be out of bounds, though it shouldn't be
                const nextLong = blockStatesLong[endIndex] !== undefined ? BigInt(blockStatesLong[endIndex]) : 0n;
                let val2 = BigInt.asUintN(64, nextLong);

                const part1 = (val1 >> BigInt(startBitOffset)) & mask;
                const part2 = (val2 << BigInt(endBitOffset)) & mask;
                paletteIdx = Number(part1 | part2);
            }
            blockIndices[i] = paletteIdx;
        }
    } else {
        // Modern 1.16+ non-spanning logic
        for (let i = 0; i < totalBlocks; i++) {
            const longIndex = Math.floor(i / entriesPerLong);
            const bitOffset = (i % entriesPerLong) * bitsPerEntry;
            let longVal = blockStatesLong[longIndex];

            if (longVal === undefined) {
                // Should not happen if size is correct, but avoids crashes
                longVal = 0n;
            }

            const unsignedLong = BigInt.asUintN(64, BigInt(longVal));
            const paletteIdx = Number((unsignedLong >> BigInt(bitOffset)) & mask);
            blockIndices[i] = paletteIdx;
        }
    }

    // Count non-air
    let totalNonAir = 0;
    const airIndices = new Set();
    paletteList.forEach((state, idx) => {
        const base = state.split('[')[0].toLowerCase();
        if (base === 'minecraft:air' || base === 'minecraft:cave_air' || base === 'minecraft:void_air') {
            airIndices.add(idx);
        }
    });
    for (let i = 0; i < blockIndices.length; i++) {
        if (!airIndices.has(blockIndices[i])) totalNonAir++;
    }

    // Litematic indexing: YZX order (Y varies slowest, X varies fastest)
    // index = y * length * width + z * width + x
    function getBlock(x, y, z) {
        if (x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= length) return null;
        const index = y * length * width + z * width + x;
        const paletteIdx = blockIndices[index];
        return paletteList[paletteIdx] || null;
    }

    const name = nbtData.Metadata?.Name || regionName || 'Unnamed';

    return { width, height, length, name, paletteList, getBlock, totalNonAir };
}
