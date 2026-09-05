// Source: Google Maps Platform Code Assist
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Helper to fetch elevation from Google Elevation API
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

// Procedural fractal enhancement / elevation fallback
function generateSyntheticElevationGrid(
  width: number,
  height: number,
  baseElevation: number = 500,
  peakElevation: number = 3776
): number[][] {
  const grid: number[][] = [];
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(cx, cy);

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // cone with ridges
      const baseCone = Math.max(0, 1 - Math.pow(dist, 1.2));
      const angle = Math.atan2(dy, dx);
      const ridge = 0.15 * Math.sin(angle * 7 + dist * 5) * Math.cos(dist * 8);
      const noise =
        0.05 * Math.sin(x * 0.2 + y * 0.15) +
        0.025 * Math.sin(x * 0.45 - y * 0.3) +
        0.01 * Math.sin(x * 0.9 + y * 0.85);

      const normalizedH = Math.max(0, Math.min(1, baseCone + ridge + noise));
      const elevation = baseElevation + normalizedH * (peakElevation - baseElevation);
      row.push(elevation);
    }
    grid.push(row);
  }
  return grid;
}

// API Routes
app.get("/api/config", (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || "";
  res.json({
    hasGoogleKey: Boolean(key && key.trim().length > 5),
    maskedKey: key ? `${key.substring(0, 6)}...${key.slice(-4)}` : null,
  });
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
    const apiKey = clientKey || process.env.GOOGLE_MAPS_API_KEY;

    // Generate sample sample coordinates
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
    let sourceUsed = "synthetic";

    // Attempt 1: Google Elevation API if key provided and not forced to open
    if (apiKey && forceSource !== "open-elevation") {
      try {
        elevationValues = await fetchGoogleElevation(
          sampleCoords.map((c) => ({ lat: c.lat, lng: c.lng })),
          apiKey
        );
        sourceUsed = "google";
      } catch (err: any) {
        console.warn("Google Elevation API failed, falling back to Open-Meteo:", err.message);
      }
    }

    // Attempt 2: Open-Meteo high-resolution DEM if Google wasn't used or failed
    if (elevationValues.length === 0 && forceSource !== "synthetic") {
      try {
        // To keep speed fast, if resolution is 64x64 (4096 points), batch sample
        // For fast response, sample at up to 32x32 from Open-Meteo and bicubic interpolate to resSize
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
        console.warn("Open-Meteo elevation failed, falling back to synthetic DEM:", err.message);
      }
    }

    // Attempt 3: Synthetic DEM fallback if offline or network error
    if (elevationValues.length === 0) {
      const synGrid = generateSyntheticElevationGrid(resSize, resSize, 300, 2800);
      elevationValues = synGrid.flat();
      sourceUsed = "synthetic";
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
    });
  } catch (error: any) {
    console.error("Error generating elevation grid:", error);
    res.status(500).json({ error: error.message || "Failed to generate elevation grid" });
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
