/**
 * PNG Encoder and Terrain Analysis Utility
 * Supports authentic 16-bit Grayscale PNG export for Unreal Engine, Unity, Blender, etc.
 */

// Precompute CRC32 table for PNG chunk checksums
const crcTable: Uint32Array = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crcTable[n] = c;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const chunk = new Uint8Array(4 + 4 + len + 4);
  const view = new DataView(chunk.buffer);

  // Length (4 bytes)
  view.setUint32(0, len, false);

  // Type (4 bytes)
  const typeBytes = new TextEncoder().encode(type);
  chunk.set(typeBytes, 4);

  // Data (len bytes)
  chunk.set(data, 8);

  // CRC calculated on type + data
  const crcTarget = new Uint8Array(4 + len);
  crcTarget.set(typeBytes, 0);
  crcTarget.set(data, 4);
  const crcVal = crc32(crcTarget);
  view.setUint32(8 + len, crcVal, false);

  return chunk;
}

/**
 * Creates a raw 16-bit Grayscale PNG Blob from an array of normalized float heights [0..1]
 */
export async function encode16BitGrayscalePng(
  heights: number[] | Float32Array,
  width: number,
  height: number
): Promise<Blob> {
  // Raw scanlines: each line starts with 1 filter byte (0 = None) followed by width * 2 bytes
  const bytesPerPixel = 2;
  const rowStride = 1 + width * bytesPerPixel;
  const rawScanlines = new Uint8Array(height * rowStride);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    rawScanlines[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const hNorm = Math.max(0, Math.min(1, heights[y * width + x]));
      const val16 = Math.round(hNorm * 65535);
      const pixelOffset = rowOffset + 1 + x * 2;
      rawScanlines[pixelOffset] = (val16 >> 8) & 0xff; // High byte
      rawScanlines[pixelOffset + 1] = val16 & 0xff; // Low byte
    }
  }

  // Compress using CompressionStream('deflate')
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(rawScanlines);
  writer.close();

  const response = new Response(cs.readable);
  const compressedBuffer = await response.arrayBuffer();
  const compressedData = new Uint8Array(compressedBuffer);

  // PNG Signature: 89 50 4E 47 0D 0A 1A 0A
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk: width(4), height(4), bitDepth(1)=16, colorType(1)=0 (grayscale), comp(1)=0, filter(1)=0, interlace(1)=0
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdrData[8] = 16; // 16-bit depth
  ihdrData[9] = 0; // Grayscale
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Standard filter
  ihdrData[12] = 0; // No interlace

  const ihdrChunk = createChunk("IHDR", ihdrData);
  const idatChunk = createChunk("IDAT", compressedData);
  const iendChunk = createChunk("IEND", new Uint8Array(0));

  return new Blob([signature, ihdrChunk, idatChunk, iendChunk], {
    type: "image/png",
  });
}

/**
 * Calculates surface slope angles in degrees (0 to 90) across the elevation grid
 */
export function calculateSlopeGrid(
  elevations: number[],
  width: number,
  height: number,
  metersPerPixel: number
): Float32Array {
  const slopes = new Float32Array(width * height);
  const cellMeters = Math.max(metersPerPixel, 1);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      const xLeft = x > 0 ? x - 1 : x;
      const xRight = x < width - 1 ? x + 1 : x;
      const yTop = y > 0 ? y - 1 : y;
      const yBottom = y < height - 1 ? y + 1 : y;

      const dx = (xRight - xLeft) * cellMeters;
      const dy = (yBottom - yTop) * cellMeters;

      const dz_dx = (elevations[y * width + xRight] - elevations[y * width + xLeft]) / (dx || 1);
      const dz_dy = (elevations[yBottom * width + x] - elevations[yTop * width + x]) / (dy || 1);

      const gradientMagnitude = Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy);
      // Slope angle in degrees
      const angleDeg = (Math.atan(gradientMagnitude) * 180) / Math.PI;
      slopes[idx] = Math.min(90, Math.max(0, angleDeg));
    }
  }

  return slopes;
}

/**
 * Generates tangent-space normal map from elevation grid
 */
export function generateNormalMapImageData(
  elevations: number[],
  width: number,
  height: number,
  strength: number = 2.0
): ImageData {
  const imgData = new ImageData(width, height);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      const xLeft = x > 0 ? x - 1 : x;
      const xRight = x < width - 1 ? x + 1 : x;
      const yTop = y > 0 ? y - 1 : y;
      const yBottom = y < height - 1 ? y + 1 : y;

      const dz_dx = (elevations[y * width + xRight] - elevations[y * width + xLeft]) * strength;
      const dz_dy = (elevations[yBottom * width + x] - elevations[yTop * width + x]) * strength;

      // Vector [-dz/dx, -dz/dy, 1] normalized
      let nx = -dz_dx;
      let ny = -dz_dy;
      let nz = 1.0;

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      // Map [-1, 1] to [0, 255]
      data[idx] = Math.round(((nx + 1) / 2) * 255);
      data[idx + 1] = Math.round(((ny + 1) / 2) * 255);
      data[idx + 2] = Math.round(((nz + 1) / 2) * 255);
      data[idx + 3] = 255;
    }
  }

  return imgData;
}

/**
 * Topographic Hypsometric Color Palette mapping
 */
export function getHypsometricColor(t: number): [number, number, number] {
  // t in 0..1
  if (t < 0.15) {
    // Deep green / valley floor
    const f = t / 0.15;
    return [Math.round(40 + f * 40), Math.round(110 + f * 50), Math.round(50 + f * 20)];
  } else if (t < 0.45) {
    // Lowland to mid hills (green-olive to yellow-ochre)
    const f = (t - 0.15) / 0.3;
    return [Math.round(80 + f * 100), Math.round(160 + f * 20), Math.round(70 - f * 20)];
  } else if (t < 0.75) {
    // Mountain rock (ochre to reddish brown to grey)
    const f = (t - 0.45) / 0.3;
    return [Math.round(180 - f * 40), Math.round(140 - f * 40), Math.round(70 + f * 30)];
  } else {
    // Alpine peaks to snow (grey to brilliant white)
    const f = (t - 0.75) / 0.25;
    return [Math.round(140 + f * 115), Math.round(140 + f * 115), Math.round(150 + f * 105)];
  }
}

/**
 * Applies optional Gaussian smoothing to elevation values
 */
export function applySmoothing(
  elevations: number[],
  width: number,
  height: number,
  radius: number
): number[] {
  if (radius <= 0) return [...elevations];

  const result = new Array(width * height);
  const r = Math.min(Math.round(radius), 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;

        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;

          const weight = 1 / (1 + (dx * dx + dy * dy));
          sum += elevations[ny * width + nx] * weight;
          count += weight;
        }
      }

      result[y * width + x] = count > 0 ? sum / count : elevations[y * width + x];
    }
  }

  return result;
}
