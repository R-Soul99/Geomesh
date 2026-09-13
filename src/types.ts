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
  sourceUsed: "google" | "open-meteo" | "terrarium" | "synthetic" | "fallback" | string;
  elevations: number[]; // 1D array of length resolution * resolution
  elevationNotice?: string;
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

export interface RoadSegment {
  id: number | string;
  name: string;
  ref?: string;
  highway: string;
  coordinates: [number, number][]; // [lng, lat]
}

export interface RoadNetworkData {
  success: boolean;
  bbox: BoundingBox;
  roadCount: number;
  roads: RoadSegment[];
  geojson: any;
}

export interface RoadSettings {
  showMotorways: boolean;
  showPrimary: boolean;
  showSecondary: boolean;
  showResidential: boolean;
  showTracks: boolean;
  roadWidthMultiplier: number;
  renderMode: "mask" | "styled" | "hybrid";
  invertMask: boolean;
}

export interface ModelExportSettings {
  verticalExaggeration: number; // 0.2 to 5.0
  includeSkirt: boolean; // add base walls/solid base
  skirtDepth: number; // meters below min elevation
  materialMode: "splat" | "topographic" | "roads" | "clay";
  meshDensity: number; // 32, 64, 128, 256
  showBuildings?: boolean;
  buildingHeightScale?: number;
  buildingStyle?: "realistic" | "greybox" | "category" | "blueprint";
}

export interface BuildingStructure {
  id: number | string;
  name: string;
  type: "residential" | "commercial" | "industrial" | "fuel" | "civic" | "garage" | "structure" | "agricultural" | string;
  subtype: string;
  amenity?: string;
  coordinates: [number, number][]; // [lng, lat] polygon
  centroid: Coordinates;
  heightMeters: number;
  levels: number;
  widthMeters: number;
  depthMeters: number;
  areaSqMeters: number;
}

export interface BuildingNetworkSummary {
  totalCount: number;
  fuelStationsCount: number;
  avgHeightMeters: number;
  maxHeightMeters: number;
  totalFootprintAreaSqM: number;
  typeBreakdown: Record<string, number>;
}

export interface BuildingNetworkData {
  success: boolean;
  bbox: BoundingBox;
  count: number;
  buildings: BuildingStructure[];
  geojson: any;
  summary: BuildingNetworkSummary;
}

export interface BuildingSettings {
  showResidential: boolean;
  showCommercial: boolean;
  showIndustrial: boolean;
  showFuelStations: boolean;
  showCivicAndTowers: boolean;
  showGarages: boolean;
  minHeightMeters: number;
  heightMultiplier: number;
  renderMode: "mask" | "styled" | "category";
  invertMask: boolean;
}

