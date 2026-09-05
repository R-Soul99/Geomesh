import { SplatSettings } from "../types";

export interface SplatChannels {
  rgbaImageData: ImageData;
  rockChannelData: ImageData; // Red
  grassChannelData: ImageData; // Green
  dirtChannelData: ImageData; // Blue
  snowChannelData: ImageData; // Alpha
}

/**
 * Procedural pseudo-noise generator for natural organic blending
 */
function pseudoNoise(x: number, y: number, freq: number): number {
  const nx = x * freq;
  const ny = y * freq;
  return (
    Math.sin(nx * 12.9898 + ny * 78.233) * 43758.5453 -
    Math.floor(Math.sin(nx * 12.9898 + ny * 78.233) * 43758.5453)
  );
}

/**
 * Generates an RGBA Splat Map from elevation and slope data
 */
export function generateSplatMap(
  elevations: number[],
  slopes: Float32Array,
  width: number,
  height: number,
  minElevation: number,
  maxElevation: number,
  settings: SplatSettings
): SplatChannels {
  const totalPixels = width * height;
  const rgba = new ImageData(width, height);
  const rock = new ImageData(width, height);
  const grass = new ImageData(width, height);
  const dirt = new ImageData(width, height);
  const snow = new ImageData(width, height);

  const elevRange = Math.max(1, maxElevation - minElevation);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const pixelOffset = idx * 4;

      const elevation = elevations[idx];
      const slope = slopes[idx]; // in degrees 0-90

      // Normalized elevation [0..1]
      let normElev = (elevation - minElevation) / elevRange;

      // Add slight organic noise variation
      if (settings.noiseIntensity > 0) {
        const noise = (pseudoNoise(x, y, settings.noiseFrequency * 0.1) - 0.5) * settings.noiseIntensity;
        normElev = Math.max(0, Math.min(1, normElev + noise));
      }

      // 1. Rock Channel (Red): High slopes
      // Smoothstep around cliffAngleThreshold
      const cliffMin = Math.max(0, settings.cliffAngleThreshold - settings.cliffSmoothing / 2);
      const cliffMax = Math.min(90, settings.cliffAngleThreshold + settings.cliffSmoothing / 2);
      let rockWeight = 0;
      if (slope >= cliffMax) {
        rockWeight = 1.0;
      } else if (slope > cliffMin) {
        const t = (slope - cliffMin) / (cliffMax - cliffMin);
        rockWeight = t * t * (3 - 2 * t); // smoothstep
      }

      // 2. Snow Channel (Alpha): High elevations
      const snowMin = Math.max(0, settings.snowLineElevationPct - settings.snowFalloffPct / 2);
      const snowMax = Math.min(1, settings.snowLineElevationPct + settings.snowFalloffPct / 2);
      let snowWeight = 0;
      if (normElev >= snowMax) {
        snowWeight = 1.0;
      } else if (normElev > snowMin) {
        const t = (normElev - snowMin) / (snowMax - snowMin);
        snowWeight = t * t * (3 - 2 * t);
      }
      // Snow clings less to ultra-sheer vertical cliffs (>60 deg)
      if (slope > 60) {
        snowWeight *= Math.max(0, 1 - (slope - 60) / 25);
      }

      // 3. Dirt / Beach Channel (Blue): Low elevations or talus slopes below cliffs
      const beachMax = settings.beachElevationPct + settings.beachFalloffPct;
      let dirtWeight = 0;
      if (normElev <= settings.beachElevationPct) {
        dirtWeight = 1.0;
      } else if (normElev < beachMax) {
        dirtWeight = 1.0 - (normElev - settings.beachElevationPct) / settings.beachFalloffPct;
      }
      // Scree / dirt also accumulates at moderate slope transitions
      if (slope > 20 && slope < 35 && normElev < settings.snowLineElevationPct) {
        dirtWeight = Math.max(dirtWeight, 0.45);
      }

      // 4. Grass Channel (Green): Fill remaining low/mid elevation gentle terrain
      let grassWeight = Math.max(0, 1.0 - rockWeight - snowWeight - dirtWeight);
      if (normElev > settings.snowLineElevationPct) {
        grassWeight = 0;
      }

      // Normalize weights so R + G + B + A = 1 (or representative distribution)
      const sum = rockWeight + grassWeight + dirtWeight + snowWeight || 1;
      const r = Math.round((rockWeight / sum) * 255);
      const g = Math.round((grassWeight / sum) * 255);
      const b = Math.round((dirtWeight / sum) * 255);
      const a = Math.round((snowWeight / sum) * 255);

      // Composite RGBA Splat Map
      rgba.data[pixelOffset] = r;
      rgba.data[pixelOffset + 1] = g;
      rgba.data[pixelOffset + 2] = b;
      rgba.data[pixelOffset + 3] = a; // Alpha channel encodes snow / 4th layer

      // Individual Rock channel mask (Red)
      rock.data[pixelOffset] = r;
      rock.data[pixelOffset + 1] = r;
      rock.data[pixelOffset + 2] = r;
      rock.data[pixelOffset + 3] = 255;

      // Individual Grass channel mask (Green)
      grass.data[pixelOffset] = g;
      grass.data[pixelOffset + 1] = g;
      grass.data[pixelOffset + 2] = g;
      grass.data[pixelOffset + 3] = 255;

      // Individual Dirt channel mask (Blue)
      dirt.data[pixelOffset] = b;
      dirt.data[pixelOffset + 1] = b;
      dirt.data[pixelOffset + 2] = b;
      dirt.data[pixelOffset + 3] = 255;

      // Individual Snow channel mask (Alpha)
      snow.data[pixelOffset] = a;
      snow.data[pixelOffset + 1] = a;
      snow.data[pixelOffset + 2] = a;
      snow.data[pixelOffset + 3] = 255;
    }
  }

  return {
    rgbaImageData: rgba,
    rockChannelData: rock,
    grassChannelData: grass,
    dirtChannelData: dirt,
    snowChannelData: snow,
  };
}

/**
 * Converts ImageData to PNG Blob using an offscreen canvas
 */
export function imageDataToPngBlob(imgData: ImageData): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = imgData.width;
    canvas.height = imgData.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Failed to get 2d context"));
      return;
    }
    ctx.putImageData(imgData, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}
