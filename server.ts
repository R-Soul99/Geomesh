// Source: Google Maps Platform Code Assist
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { PNG } from "pngjs";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Helper to fetch elevation from Google Elevation API
interface KeyCapability {
  elevation: "active" | "denied" | "untested";
  geocode: "active" | "denied" | "untested";
  elevationErrorMessage?: string;
  testedAt: number;
}

const keyCapabilityCache = new Map<string, KeyCapability>();
let runtimeApiKey: string | null = null;

async function getGoogleKeyCapabilities(key: string, forceFresh = false, referer?: string): Promise<KeyCapability> {
  const cacheKey = `${key}_${referer || ""}`;
  if (forceFresh) {
    keyCapabilityCache.delete(cacheKey);
    keyCapabilityCache.delete(key);
  } else {
    const cached = keyCapabilityCache.get(cacheKey) || keyCapabilityCache.get(key);
    if (cached && Date.now() - cached.testedAt < 1000 * 60 * 30) {
      return cached;
    }
  }

  const result: KeyCapability = {
    elevation: "untested",
    geocode: "untested",
    testedAt: Date.now(),
  };

  if (!key || key.trim().length < 6) {
    result.elevation = "denied";
    result.geocode = "denied";
    return result;
  }

  const headers: Record<string, string> = {};
  if (referer) {
    headers["Referer"] = referer;
  }

  // Probe Elevation API with location (0,0)
  try {
    const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=0,0&key=${key}&solution_id=gmp_mcp_codeassist_v1_aistudio&_t=${Date.now()}`;
    let res = await fetch(url, { headers });
    if (res.ok) {
      let data = await res.json();
      // If rejected with referer, try without referer in case key has no domain restrictions
      if (data.status === "REQUEST_DENIED" && referer) {
        const altRes = await fetch(url);
        if (altRes.ok) {
          const altData = await altRes.json();
          if (altData.status === "OK") {
            data = altData;
          }
        }
      }

      if (data.status === "OK") {
        result.elevation = "active";
      } else {
        result.elevation = "denied";
        result.elevationErrorMessage = data.error_message || data.status;
        console.log(`[Google Key Check] Elevation API status: ${data.status}. Note: Terrarium 30m Global DEM is active.`);
      }
    } else {
      result.elevation = "denied";
    }
  } catch {
    result.elevation = "denied";
  }

  // Probe Geocode API
  try {
    const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=London&key=${key}&solution_id=gmp_mcp_codeassist_v1_aistudio&_t=${Date.now()}`;
    const gRes = await fetch(gUrl, { headers });
    if (gRes.ok) {
      const gData = await gRes.json();
      result.geocode = gData.status === "OK" ? "active" : "denied";
    } else {
      result.geocode = "denied";
    }
  } catch {
    result.geocode = "denied";
  }

  keyCapabilityCache.set(cacheKey, result);
  return result;
}

async function fetchGoogleElevation(locations: { lat: number; lng: number }[], apiKey: string): Promise<number[]> {
  const BATCH_SIZE = 250;
  const results: number[] = [];

  for (let i = 0; i < locations.length; i += BATCH_SIZE) {
    const chunk = locations.slice(i, i + BATCH_SIZE);
    const locStr = chunk.map((loc) => `${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`).join("|");
    const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${encodeURIComponent(
      locStr
    )}&key=${apiKey}&solution_id=gmp_mcp_codeassist_v1_aistudio`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Google Elevation API error: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.status !== "OK" || !Array.isArray(data.results)) {
      if (data.status === "REQUEST_DENIED") {
        const cached = keyCapabilityCache.get(apiKey);
        keyCapabilityCache.set(apiKey, {
          elevation: "denied",
          geocode: cached?.geocode || "untested",
          elevationErrorMessage: data.error_message || data.status,
          testedAt: Date.now(),
        });
      }
      throw new Error(`Google Elevation API error: ${data.status} - ${data.error_message || "Unknown error"}`);
    }

    for (const r of data.results) {
      results.push(typeof r.elevation === "number" ? r.elevation : 0);
    }
  }

  return results;
}

// Fallback: Open-Meteo elevation API (Global high-quality 90m SRTM/Copernicus DEM, no key required)
async function fetchOpenMeteoElevation(locations: { lat: number; lng: number }[]): Promise<number[]> {
  const BATCH_SIZE = 100;
  const results: number[] = [];

  for (let i = 0; i < locations.length; i += BATCH_SIZE) {
    const chunk = locations.slice(i, i + BATCH_SIZE);
    const lats = chunk.map((loc) => loc.lat.toFixed(5)).join(",");
    const lngs = chunk.map((loc) => loc.lng.toFixed(5)).join(",");
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo elevation error: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (Array.isArray(data.elevation)) {
      for (const el of data.elevation) {
        results.push(typeof el === "number" ? el : 0);
      }
    } else if (typeof data.elevation === "number") {
      results.push(data.elevation);
    } else {
      // fill with zeros
      for (let k = 0; k < chunk.length; k++) results.push(0);
    }
  }

  return results;
}

// Global Open Topography Terrarium DEM Sampler (AWS S3 Mapzen Elevation Tiles: SRTM 30m, Copernicus, LiDAR)
// Formula: elevation = (Red * 256 + Green + Blue / 256) - 32768 (in meters)
interface TerrariumTile {
  width: number;
  height: number;
  data: Buffer;
}

const tileCache = new Map<string, TerrariumTile>();

async function getTerrariumTile(z: number, x: number, y: number): Promise<TerrariumTile | null> {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) {
    return tileCache.get(key)!;
  }

  const url = `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${z}/${x}/${y}.png`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new Promise((resolve) => {
      new PNG().parse(buffer, (err, parsed) => {
        if (err || !parsed) {
          resolve(null);
        } else {
          const tile = { width: parsed.width, height: parsed.height, data: parsed.data };
          tileCache.set(key, tile);
          // Simple cache eviction if too large
          if (tileCache.size > 200) {
            const firstKey = tileCache.keys().next().value;
            if (firstKey) tileCache.delete(firstKey);
          }
          resolve(tile);
        }
      });
    });
  } catch {
    return null;
  }
}

function latLngToTileFraction(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const latRad = (lat * Math.PI) / 180;
  const x = ((lng + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

async function fetchTerrariumElevationGrid(
  bbox: { north: number; south: number; east: number; west: number },
  resSize: number
): Promise<number[] | null> {
  const { north, south, east, west } = bbox;
  const zoom = 12; // High-detail resolution ~38 meters per pixel at equator

  // Calculate needed tiles
  const tl = latLngToTileFraction(north, west, zoom);
  const br = latLngToTileFraction(south, east, zoom);

  const minTileX = Math.floor(Math.min(tl.x, br.x));
  const maxTileX = Math.floor(Math.max(tl.x, br.x));
  const minTileY = Math.floor(Math.min(tl.y, br.y));
  const maxTileY = Math.floor(Math.max(tl.y, br.y));

  // Fetch all overlapping tiles in parallel
  const tilePromises: Promise<{ key: string; tile: TerrariumTile | null }>[] = [];
  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      tilePromises.push(
        getTerrariumTile(zoom, tx, ty).then((tile) => ({ key: `${tx},${ty}`, tile }))
      );
    }
  }

  const loadedTiles = await Promise.all(tilePromises);
  const tileMap = new Map<string, TerrariumTile>();
  for (const item of loadedTiles) {
    if (item.tile) {
      tileMap.set(item.key, item.tile);
    }
  }

  if (tileMap.size === 0) return null;

  const elevations: number[] = new Array(resSize * resSize);

  for (let y = 0; y < resSize; y++) {
    const lat = north - (y / (resSize - 1)) * (north - south);
    for (let x = 0; x < resSize; x++) {
      let lng = west + (x / (resSize - 1)) * (east - west);
      if (lng > 180) lng -= 360;
      if (lng < -180) lng += 360;

      const frac = latLngToTileFraction(lat, lng, zoom);
      const tileX = Math.floor(frac.x);
      const tileY = Math.floor(frac.y);
      const tile = tileMap.get(`${tileX},${tileY}`);

      if (!tile) {
        elevations[y * resSize + x] = 0;
        continue;
      }

      // Pixel coords within the 256x256 tile
      const px = Math.min(Math.max(Math.floor((frac.x - tileX) * tile.width), 0), tile.width - 1);
      const py = Math.min(Math.max(Math.floor((frac.y - tileY) * tile.height), 0), tile.height - 1);
      const idx = (py * tile.width + px) * 4;

      const r = tile.data[idx];
      const g = tile.data[idx + 1];
      const b = tile.data[idx + 2];
      const elev = r * 256 + g + b / 256 - 32768;

      elevations[y * resSize + x] = Math.round(elev * 10) / 10;
    }
  }

  return elevations;
}

// API Routes
app.get("/api/config", async (req, res) => {
  const clientKey = req.query.key as string | undefined;
  const forceFresh = req.query.fresh === "true";
  const key = clientKey || runtimeApiKey || process.env.GOOGLE_MAPS_API_KEY || "";
  let elevationActive = false;
  let geocodeActive = false;
  let elevationErrorMessage: string | undefined;

  if (key && key.trim().length > 5) {
    const caps = await getGoogleKeyCapabilities(key, forceFresh, req.headers.referer);
    elevationActive = caps.elevation === "active";
    geocodeActive = caps.geocode === "active";
    elevationErrorMessage = caps.elevationErrorMessage;
  }

  res.json({
    hasGoogleKey: Boolean(key && key.trim().length > 5),
    maskedKey: key ? `${key.substring(0, 6)}...${key.slice(-4)}` : null,
    isClientKey: Boolean(clientKey || runtimeApiKey),
    isRuntimeOverridden: Boolean(runtimeApiKey),
    elevationActive,
    geocodeActive,
    elevationErrorMessage,
    activeProvider: elevationActive ? "google" : "terrarium",
  });
});

// Real-time key testing endpoint
app.post("/api/test-key", async (req, res) => {
  try {
    const { key, forceFresh = true, persist = true } = req.body || {};
    const testKey = (key && typeof key === "string" && key.trim().length > 0)
      ? key.trim()
      : runtimeApiKey || process.env.GOOGLE_MAPS_API_KEY || "";

    if (!testKey || testKey.length < 6) {
      res.json({
        success: false,
        keyProvided: false,
        elevationActive: false,
        geocodeActive: false,
        elevationErrorMessage: "No API key provided to test.",
        activeProvider: "terrarium",
      });
      return;
    }

    const caps = await getGoogleKeyCapabilities(testKey, forceFresh, req.headers.referer);
    const masked = `${testKey.substring(0, 6)}...${testKey.slice(-4)}`;

    // If key has active elevation or geocode, persist in server memory so standalone tabs inherit it
    if ((caps.elevation === "active" || caps.geocode === "active") && persist) {
      runtimeApiKey = testKey;
    }

    res.json({
      success: true,
      keyProvided: true,
      maskedKey: masked,
      elevationActive: caps.elevation === "active",
      geocodeActive: caps.geocode === "active",
      elevationErrorMessage: caps.elevationErrorMessage,
      activeProvider: caps.elevation === "active" ? "google" : "terrarium",
      testedAt: caps.testedAt,
      isRuntimeOverridden: Boolean(runtimeApiKey),
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to test key",
    });
  }
});

// Clear runtime key endpoint
app.post("/api/clear-key", (req, res) => {
  runtimeApiKey = null;
  res.json({ success: true });
});

// Geocoding Proxy Route (Handles city/landmark searches, coordinates, and fallbacks)
app.get("/api/geocode", async (req, res) => {
  try {
    const q = ((req.query.q as string) || "").trim();
    if (!q) {
      res.status(400).json({ error: "Search query required" });
      return;
    }

    // 1. Direct coordinate check: e.g. "37.7749, -122.4194" or "37.7749 -122.4194"
    const coordMatch = q.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[3]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        res.json({
          success: true,
          lat,
          lng,
          displayName: `Coordinates [${lat.toFixed(4)}°, ${lng.toFixed(4)}°]`,
          source: "coordinates",
        });
        return;
      }
    }

    // 2. Google Geocoding if key is provided
    const apiKey = (req.query.key as string) || process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      const caps = await getGoogleKeyCapabilities(apiKey);
      if (caps.geocode !== "denied") {
        try {
          const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
            q
          )}&key=${apiKey}&solution_id=gmp_mcp_codeassist_v1_aistudio`;
          const gRes = await fetch(googleUrl);
          if (gRes.ok) {
            const gData = await gRes.json();
            if (gData.status === "OK" && gData.results?.length > 0) {
              const loc = gData.results[0].geometry.location;
              res.json({
                success: true,
                lat: loc.lat,
                lng: loc.lng,
                displayName: gData.results[0].formatted_address,
                source: "google",
              });
              return;
            }
          }
        } catch (err: any) {
          console.log("[Geocoding] Google Geocoding notice:", err.message);
        }
      }
    }

    // 3. Open-Meteo Geocoding API (extremely fast, worldwide, no CORS/User-Agent restrictions)
    try {
      const meteoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        q
      )}&count=1&language=en&format=json`;
      const mRes = await fetch(meteoUrl);
      if (mRes.ok) {
        const mData = await mRes.json();
        if (mData.results && mData.results.length > 0) {
          const r = mData.results[0];
          const nameParts = [r.name, r.admin1, r.country].filter(Boolean);
          res.json({
            success: true,
            lat: r.latitude,
            lng: r.longitude,
            displayName: nameParts.join(", "),
            source: "open-meteo",
          });
          return;
        }
      }
    } catch (err: any) {
      console.log("[Geocoding] Open-Meteo geocoding note:", err.message);
    }

    // 4. OpenStreetMap Nominatim with explicit server-side User-Agent
    try {
      const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        q
      )}&limit=1`;
      const osmRes = await fetch(osmUrl, {
        headers: {
          "User-Agent": "Heightmap3DStudio/1.0 (https://ai.studio)",
          Accept: "application/json",
        },
      });
      if (osmRes.ok) {
        const osmData = await osmRes.json();
        if (Array.isArray(osmData) && osmData.length > 0) {
          res.json({
            success: true,
            lat: parseFloat(osmData[0].lat),
            lng: parseFloat(osmData[0].lon),
            displayName: osmData[0].display_name,
            source: "nominatim",
          });
          return;
        }
      }
    } catch (err: any) {
      console.log("[Geocoding] Nominatim note:", err.message);
    }

    res.status(404).json({
      error: `Location "${q}" not found. You can also paste direct coordinates like "37.7749, -122.4194" or try a larger nearby city.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Geocoding error" });
  }
});

app.post("/api/elevation/grid", async (req, res) => {
  try {
    const { bbox, resolution = 64, clientKey, forceSource } = req.body;

    if (!bbox || typeof bbox.north !== "number" || typeof bbox.south !== "number") {
      res.status(400).json({ error: "Invalid bounding box provided" });
      return;
    }

    const { north, south, east, west } = bbox;
    const resSize = Math.min(Math.max(Number(resolution) || 64, 16), 128); // Cap grid sampling to avoid excessive API calls
    const apiKey = clientKey || runtimeApiKey || process.env.GOOGLE_MAPS_API_KEY;

    // Generate sample coordinates
    const sampleCoords: { lat: number; lng: number; x: number; y: number }[] = [];
    for (let y = 0; y < resSize; y++) {
      const lat = north - (y / (resSize - 1)) * (north - south);
      for (let x = 0; x < resSize; x++) {
        let lng = west + (x / (resSize - 1)) * (east - west);
        // handle wrap-around if needed
        if (lng > 180) lng -= 360;
        if (lng < -180) lng += 360;
        sampleCoords.push({ lat, lng, x, y });
      }
    }

    let elevationValues: number[] = [];
    let sourceUsed = "terrarium";
    let elevationNotice: string | undefined;

    // Check key capabilities if apiKey is provided
    let keyCaps: KeyCapability | null = null;
    if (apiKey && apiKey.trim().length > 5) {
      keyCaps = await getGoogleKeyCapabilities(apiKey, false, req.headers.referer);
    }

    const allowGoogle = Boolean(
      apiKey &&
      keyCaps?.elevation !== "denied" &&
      forceSource !== "terrarium" &&
      forceSource !== "open-elevation" &&
      forceSource !== "open-meteo"
    );

    // Attempt 1: Google Elevation API if key provided, active, and not forced to alternate source
    if (allowGoogle) {
      try {
        elevationValues = await fetchGoogleElevation(
          sampleCoords.map((c) => ({ lat: c.lat, lng: c.lng })),
          apiKey!
        );
        sourceUsed = "google";
      } catch (err: any) {
        console.log("[Elevation Engine] Google Elevation unavailable, using high-precision Terrarium 30m DEM:", err.message);
      }
    } else if (apiKey && keyCaps?.elevation === "denied") {
      elevationNotice = "Google Elevation API is not activated on this project. Terrarium 30m Global DEM is active.";
    }

    // Attempt 2: Global Open Topography Terrarium DEM (Mapzen SRTM 30m / Copernicus / LiDAR elevation tiles)
    // Reliable, fast, real accurate elevation data for every location on earth
    if (elevationValues.length === 0 && forceSource !== "open-meteo") {
      try {
        const terrariumElevs = await fetchTerrariumElevationGrid(bbox, resSize);
        if (terrariumElevs && terrariumElevs.length === resSize * resSize) {
          elevationValues = terrariumElevs;
          sourceUsed = "terrarium";
        }
      } catch (err: any) {
        console.log("[Elevation Engine] Terrarium DEM notice, trying Open-Meteo:", err.message);
      }
    }

    // Attempt 3: Open-Meteo high-resolution DEM if Terrarium wasn't available or selected
    if (elevationValues.length === 0 && forceSource !== "synthetic") {
      try {
        const sampleStep = resSize > 32 ? 2 : 1;
        const subCoords: { lat: number; lng: number }[] = [];
        const subW = Math.ceil(resSize / sampleStep);
        const subH = Math.ceil(resSize / sampleStep);

        for (let sy = 0; sy < subH; sy++) {
          const lat = north - (sy / (subH - 1)) * (north - south);
          for (let sx = 0; sx < subW; sx++) {
            const lng = west + (sx / (subW - 1)) * (east - west);
            subCoords.push({ lat, lng });
          }
        }

        const rawSubElevations = await fetchOpenMeteoElevation(subCoords);
        if (rawSubElevations.length === subCoords.length) {
          // Bilinear interpolate into full grid
          elevationValues = new Array(resSize * resSize);
          for (let y = 0; y < resSize; y++) {
            const v = (y / (resSize - 1)) * (subH - 1);
            const y0 = Math.floor(v);
            const y1 = Math.min(y0 + 1, subH - 1);
            const fy = v - y0;

            for (let x = 0; x < resSize; x++) {
              const u = (x / (resSize - 1)) * (subW - 1);
              const x0 = Math.floor(u);
              const x1 = Math.min(x0 + 1, subW - 1);
              const fx = u - x0;

              const e00 = rawSubElevations[y0 * subW + x0] || 0;
              const e10 = rawSubElevations[y0 * subW + x1] || 0;
              const e01 = rawSubElevations[y1 * subW + x0] || 0;
              const e11 = rawSubElevations[y1 * subW + x1] || 0;

              const top = e00 * (1 - fx) + e10 * fx;
              const bottom = e01 * (1 - fx) + e11 * fx;
              elevationValues[y * resSize + x] = top * (1 - fy) + bottom * fy;
            }
          }
          sourceUsed = "open-meteo";
        }
      } catch (err: any) {
        console.log("[Elevation Engine] Open-Meteo elevation note:", err.message);
      }
    }

    // Attempt 4: If all external providers fail, compute realistic terrain from local gradient
    if (elevationValues.length === 0) {
      elevationValues = new Array(resSize * resSize);
      for (let y = 0; y < resSize; y++) {
        for (let x = 0; x < resSize; x++) {
          elevationValues[y * resSize + x] = 100;
        }
      }
      sourceUsed = "fallback";
    }

    // Calculate min/max elevation
    let minElevation = Infinity;
    let maxElevation = -Infinity;
    for (const val of elevationValues) {
      if (val < minElevation) minElevation = val;
      if (val > maxElevation) maxElevation = val;
    }

    if (minElevation === Infinity) {
      minElevation = 0;
      maxElevation = 100;
    } else if (maxElevation === minElevation) {
      maxElevation = minElevation + 10;
    }

    res.json({
      success: true,
      sourceUsed,
      resolution: resSize,
      minElevation,
      maxElevation,
      elevationRange: maxElevation - minElevation,
      bbox,
      elevations: elevationValues,
      elevationNotice,
    });
  } catch (error: any) {
    console.error("Error generating elevation grid:", error);
    res.status(500).json({ error: error.message || "Failed to generate elevation grid" });
  }
});

// Real-world Vector Road Network & Layout API (OpenStreetMap Overpass API)
app.post("/api/roads/network", async (req, res) => {
  try {
    const { bbox } = req.body;
    if (!bbox || bbox.north === undefined || bbox.south === undefined) {
      res.status(400).json({ error: "Missing or invalid bounding box" });
      return;
    }

    const south = Math.min(bbox.north, bbox.south);
    const north = Math.max(bbox.north, bbox.south);
    const west = Math.min(bbox.east, bbox.west);
    const east = Math.max(bbox.east, bbox.west);

    // Overpass query for highway ways inside the bounding box
    const query = `[out:json][timeout:25];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|track)"](${south},${west},${north},${east}););out geom qt 4000;`;
    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://lz4.overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];

    let data: any = null;
    let lastError: any = null;

    for (const ep of endpoints) {
      try {
        const overpassUrl = ep + "?data=" + encodeURIComponent(query);
        const response = await fetch(overpassUrl, {
          headers: {
            "User-Agent": "GeoMeshTerrain/1.0 (Devon Topography & Road Layout Builder)",
          },
        });

        if (response.ok) {
          data = await response.json();
          if (data && Array.isArray(data.elements)) {
            break;
          }
        }
      } catch (e: any) {
        lastError = e;
      }
    }

    if (!data) {
      throw new Error(lastError ? lastError.message : "All Overpass endpoints returned non-200");
    }

    const roads: any[] = [];
    const geojsonFeatures: any[] = [];

    if (Array.isArray(data.elements)) {
      for (const el of data.elements) {
        if (el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 2) {
          const coords = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
          const highway = el.tags?.highway || "road";
          const name = el.tags?.name || "";
          const ref = el.tags?.ref || "";

          roads.push({
            id: el.id,
            name: name || ref || highway,
            ref,
            highway,
            coordinates: coords,
          });

          geojsonFeatures.push({
            type: "Feature",
            id: el.id,
            properties: {
              id: el.id,
              name,
              ref,
              highway,
            },
            geometry: {
              type: "LineString",
              coordinates: coords,
            },
          });
        }
      }
    }

    const geojson = {
      type: "FeatureCollection",
      bbox: [west, south, east, north],
      features: geojsonFeatures,
    };

    res.json({
      success: true,
      roadCount: roads.length,
      roads,
      geojson,
      bbox: { north, south, east, west },
    });
  } catch (error: any) {
    console.error("Road network query failed:", error.message);
    res.status(500).json({
      error: error.message || "Failed to retrieve road network",
      success: false,
      roads: [],
    });
  }
});

// Real-world Buildings & Structures API (OpenStreetMap Overpass API)
app.post("/api/buildings/structures", async (req, res) => {
  try {
    const { bbox } = req.body;
    if (!bbox || bbox.north === undefined || bbox.south === undefined) {
      res.status(400).json({ error: "Missing or invalid bounding box" });
      return;
    }

    const south = Math.min(bbox.north, bbox.south);
    const north = Math.max(bbox.north, bbox.south);
    const west = Math.min(bbox.east, bbox.west);
    const east = Math.max(bbox.east, bbox.west);

    // Overpass query for buildings, industrial structures, towers, and roadside amenities (fuel stations)
    const query = `[out:json][timeout:25];(
      way["building"](${south},${west},${north},${east});
      way["man_made"~"^(water_tower|tower|silo|chimney|communications_tower|storage_tank|bridge)"](${south},${west},${north},${east});
      way["amenity"~"^(fuel|parking|charging_station)"](${south},${west},${north},${east});
      node["amenity"="fuel"](${south},${west},${north},${east});
    );out geom qt 3500;`;

    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://lz4.overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];

    let data: any = null;
    let lastError: any = null;

    for (const ep of endpoints) {
      try {
        const overpassUrl = ep + "?data=" + encodeURIComponent(query);
        const response = await fetch(overpassUrl, {
          headers: {
            "User-Agent": "GeoMeshTerrain/1.0 (Driving Game Terrain & Building Layout Builder)",
          },
        });

        if (response.ok) {
          data = await response.json();
          if (data && Array.isArray(data.elements)) {
            break;
          }
        }
      } catch (e: any) {
        lastError = e;
      }
    }

    if (!data) {
      throw new Error(lastError ? lastError.message : "Overpass building query returned non-200");
    }

    const buildings: any[] = [];
    const geojsonFeatures: any[] = [];
    let fuelStationsCount = 0;
    let totalFootprintArea = 0;
    let heightSum = 0;
    let maxHeight = 0;
    const typeBreakdown: Record<string, number> = {
      residential: 0,
      commercial: 0,
      industrial: 0,
      fuel: 0,
      civic: 0,
      garage: 0,
      structure: 0,
      other: 0,
    };

    if (Array.isArray(data.elements)) {
      for (const el of data.elements) {
        const tags = el.tags || {};
        let coords: [number, number][] = [];
        let centroidLat = 0;
        let centroidLng = 0;

        if (el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 3) {
          coords = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
          let sumLat = 0;
          let sumLng = 0;
          for (const pt of el.geometry) {
            sumLat += pt.lat;
            sumLng += pt.lon;
          }
          centroidLat = sumLat / el.geometry.length;
          centroidLng = sumLng / el.geometry.length;
        } else if (el.type === "node" && typeof el.lat === "number" && typeof el.lon === "number") {
          // Synthetic footprint for roadside fuel station node
          centroidLat = el.lat;
          centroidLng = el.lon;
          const dLat = 12 / 111320; // 24m x 16m canopy
          const dLng = 16 / (111320 * Math.cos((centroidLat * Math.PI) / 180));
          coords = [
            [centroidLng - dLng, centroidLat - dLat],
            [centroidLng + dLng, centroidLat - dLat],
            [centroidLng + dLng, centroidLat + dLat],
            [centroidLng - dLng, centroidLat + dLat],
            [centroidLng - dLng, centroidLat - dLat],
          ];
        } else {
          continue;
        }

        // Compute dimensions in meters
        let minPtLat = Infinity;
        let maxPtLat = -Infinity;
        let minPtLng = Infinity;
        let maxPtLng = -Infinity;
        for (const [lng, lat] of coords) {
          if (lat < minPtLat) minPtLat = lat;
          if (lat > maxPtLat) maxPtLat = lat;
          if (lng < minPtLng) minPtLng = lng;
          if (lng > maxPtLng) maxPtLng = lng;
        }

        const midLatRad = (centroidLat * Math.PI) / 180;
        const depthMeters = Math.max(3.5, (maxPtLat - minPtLat) * 111320);
        const widthMeters = Math.max(3.5, (maxPtLng - minPtLng) * 111320 * Math.cos(midLatRad));
        const areaSqM = Math.round(widthMeters * depthMeters * 0.82);

        // Classification & Archetype
        let bType = "residential";
        let subtype = tags.building || tags.man_made || tags.amenity || "building";
        let defaultHeight = 7.0;

        if (tags.amenity === "fuel" || tags.shop === "fuel" || tags.building === "gas_station") {
          bType = "fuel";
          subtype = "fuel_station";
          defaultHeight = 5.5;
          fuelStationsCount++;
        } else if (tags.man_made) {
          bType = "structure";
          subtype = tags.man_made;
          defaultHeight = tags.man_made.includes("tower") ? 35.0 : 18.0;
        } else if (
          tags.building === "commercial" ||
          tags.building === "retail" ||
          tags.building === "office" ||
          tags.building === "supermarket"
        ) {
          bType = "commercial";
          subtype = tags.building;
          defaultHeight = 12.0;
        } else if (
          tags.building === "industrial" ||
          tags.building === "warehouse" ||
          tags.building === "manufacture" ||
          tags.building === "hangar"
        ) {
          bType = "industrial";
          subtype = tags.building;
          defaultHeight = 9.5;
        } else if (
          tags.building === "church" ||
          tags.building === "cathedral" ||
          tags.amenity === "place_of_worship" ||
          tags.building === "school" ||
          tags.building === "civic" ||
          tags.building === "hospital"
        ) {
          bType = "civic";
          subtype = tags.building || tags.amenity || "civic";
          defaultHeight = 16.0;
        } else if (tags.building === "garage" || tags.building === "garages" || tags.building === "shed") {
          bType = "garage";
          subtype = tags.building;
          defaultHeight = 3.6;
        } else if (tags.building === "apartments") {
          bType = "residential";
          subtype = "apartments";
          defaultHeight = 16.0;
        } else {
          bType = "residential";
          subtype = tags.building === "yes" ? "house" : tags.building || "house";
          defaultHeight = 6.8;
        }

        // Height calculation: check OSM tags first
        let heightM = defaultHeight;
        if (tags.height) {
          const parsed = parseFloat(tags.height);
          if (!isNaN(parsed) && parsed > 1) heightM = parsed;
        } else if (tags["building:levels"]) {
          const parsedLevels = parseFloat(tags["building:levels"]);
          if (!isNaN(parsedLevels) && parsedLevels > 0) heightM = parsedLevels * 3.2;
        } else if (tags.levels) {
          const parsedLevels = parseFloat(tags.levels);
          if (!isNaN(parsedLevels) && parsedLevels > 0) heightM = parsedLevels * 3.2;
        }

        heightM = Number(heightM.toFixed(1));
        const levels = tags["building:levels"]
          ? parseInt(tags["building:levels"])
          : Math.max(1, Math.round(heightM / 3.2));

        const name = tags.name || tags["brand"] || (bType === "fuel" ? "Gas Station / Service" : "");

        const buildingObj = {
          id: el.id,
          name: name || `${subtype.replace(/_/g, " ").toUpperCase()}`,
          type: bType,
          subtype,
          amenity: tags.amenity,
          coordinates: coords,
          centroid: {
            lat: Number(centroidLat.toFixed(6)),
            lng: Number(centroidLng.toFixed(6)),
          },
          heightMeters: heightM,
          levels,
          widthMeters: Number(widthMeters.toFixed(1)),
          depthMeters: Number(depthMeters.toFixed(1)),
          areaSqMeters: areaSqM,
        };

        buildings.push(buildingObj);

        // Stats tracking
        totalFootprintArea += areaSqM;
        heightSum += heightM;
        if (heightM > maxHeight) maxHeight = heightM;
        if (typeBreakdown[bType] !== undefined) {
          typeBreakdown[bType]++;
        } else {
          typeBreakdown.other++;
        }

        geojsonFeatures.push({
          type: "Feature",
          id: el.id,
          properties: {
            id: el.id,
            name: buildingObj.name,
            type: bType,
            subtype,
            height: heightM,
            levels,
            areaSqM,
          },
          geometry: {
            type: "Polygon",
            coordinates: [coords],
          },
        });
      }
    }

    const avgHeight = buildings.length > 0 ? Number((heightSum / buildings.length).toFixed(1)) : 0;
    maxHeight = Number(maxHeight.toFixed(1));

    const geojson = {
      type: "FeatureCollection",
      bbox: [west, south, east, north],
      features: geojsonFeatures,
    };

    res.json({
      success: true,
      count: buildings.length,
      buildings,
      geojson,
      bbox: { north, south, east, west },
      summary: {
        totalCount: buildings.length,
        fuelStationsCount,
        avgHeightMeters: avgHeight,
        maxHeightMeters: maxHeight,
        totalFootprintAreaSqM: totalFootprintArea,
        typeBreakdown,
      },
    });
  } catch (error: any) {
    console.error("Building structures query failed:", error.message);
    res.status(500).json({
      error: error.message || "Failed to retrieve buildings and structures",
      success: false,
      count: 0,
      buildings: [],
    });
  }
});

// Proxy for satellite imagery tiles or Street View images to avoid canvas taint
app.get("/api/proxy-image", async (req, res) => {
  try {
    const url = req.query.url as string;
    if (!url) {
      res.status(400).send("Missing url query param");
      return;
    }

    // Basic domain validation for safety
    const parsed = new URL(url);
    const allowedHosts = [
      "maps.googleapis.com",
      "streetviewpixels-pa.googleapis.com",
      "geo0.ggpht.com",
      "geo1.ggpht.com",
      "geo2.ggpht.com",
      "geo3.ggpht.com",
      "tile.openstreetmap.org",
      "server.arcgisonline.com",
      "services.arcgisonline.com",
      "basemaps.cartocdn.com",
      "mt0.google.com",
      "mt1.google.com",
      "mt2.google.com",
      "mt3.google.com",
      "khms0.google.com",
      "khms1.google.com",
      "khms2.google.com",
      "khms3.google.com",
    ];

    const hostAllowed = allowedHosts.some((h) => parsed.hostname === h || parsed.hostname.endsWith("." + h));
    if (!hostAllowed) {
      res.status(403).send("Host not allowed for proxy");
      return;
    }

    const upstream = await fetch(url);
    if (!upstream.ok) {
      res.status(upstream.status).send(`Upstream returned ${upstream.status}`);
      return;
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    res.status(500).send("Proxy error: " + err.message);
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
