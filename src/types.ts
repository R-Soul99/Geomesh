export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface TerrainPreset {
  id: string;
  name: string;
  region: string;
  description: string;
  center: Coordinates;
  bbox: BoundingBox;
  defaultHeightScale: number;
  previewUrl?: string;
  streetView?: {
    lat: number;
    lng: number;
    heading: number;
    pitch: number;
  };
}

export interface ElevationGridData {
  resolution: number;
  minElevation: number;
  maxElevation: number;
  elevationRange: number;
  bbox: BoundingBox;
  sourceUsed: "google" | "open-meteo" | "synthetic";
  elevations: number[]; // 1D array of length resolution * resolution
}

export interface SplatSettings {
  cliffAngleThreshold: number; // degrees, e.g. 35
  cliffSmoothing: number; // falloff range in degrees, e.g. 10
  snowLineElevationPct: number; // percentage 0-1, e.g. 0.75
  snowFalloffPct: number; // e.g. 0.1
  beachElevationPct: number; // e.g. 0.08
  beachFalloffPct: number; // e.g. 0.05
  noiseFrequency: number; // 0 to 1
  noiseIntensity: number; // 0 to 0.5
}

export interface HeightmapSettings {
  smoothingRadius: number; // 0 to 5
  gamma: number; // 0.5 to 2.0
  invert: boolean;
  normalize: boolean;
  exportBitDepth: 16 | 8;
}

export interface ModelExportSettings {
  verticalExaggeration: number; // 0.5 to 5.0
  includeSkirt: boolean; // add base walls/solid base
  skirtDepth: number; // meters below min elevation
  materialMode: "satellite" | "splat" | "topographic" | "clay";
  meshDensity: number; // 32, 64, 128, 256
}
