import { BoundingBox, BuildingStructure, BuildingSettings } from "../types";

/**
 * Renders building footprints to an HTML Canvas element
 */
export function renderBuildingsToCanvas(
  canvas: HTMLCanvasElement,
  buildings: BuildingStructure[],
  bbox: BoundingBox,
  settings: BuildingSettings,
  background: "transparent" | "solid_black" | "white" | "dark_studio" = "solid_black"
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // Clear or fill background
  if (background === "transparent") {
    ctx.clearRect(0, 0, width, height);
  } else if (background === "white") {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
  } else if (background === "solid_black") {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
  } else if (background === "dark_studio") {
    ctx.fillStyle = "#0B0C10";
    ctx.fillRect(0, 0, width, height);

    // Subtle technical grid pattern
    ctx.strokeStyle = "rgba(31, 40, 51, 0.4)";
    ctx.lineWidth = 1;
    const step = width / 16;
    ctx.beginPath();
    for (let x = 0; x <= width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  const spanLng = bbox.east - bbox.west;
  const spanLat = bbox.north - bbox.south;
  if (spanLng <= 0 || spanLat <= 0) return;

  // Filter buildings
  const filtered = buildings.filter((b) => {
    if (b.heightMeters < settings.minHeightMeters) return false;
    if (b.type === "residential" && !settings.showResidential) return false;
    if (b.type === "commercial" && !settings.showCommercial) return false;
    if (b.type === "industrial" && !settings.showIndustrial) return false;
    if (b.type === "fuel" && !settings.showFuelStations) return false;
    if ((b.type === "civic" || b.type === "structure") && !settings.showCivicAndTowers) return false;
    if (b.type === "garage" && !settings.showGarages) return false;
    return true;
  });

  // Convert GPS point to Canvas pixel coordinates
  const toPixel = (lng: number, lat: number): [number, number] => {
    const x = ((lng - bbox.west) / spanLng) * width;
    const y = ((bbox.north - lat) / spanLat) * height;
    return [x, y];
  };

  // Color mappings
  const getCategoryFill = (type: string, isStroke: boolean = false): string => {
    switch (type) {
      case "fuel":
        return isStroke ? "#34D399" : "rgba(16, 185, 129, 0.85)"; // Emerald
      case "commercial":
        return isStroke ? "#66FCF1" : "rgba(6, 182, 212, 0.8)"; // Cyan
      case "industrial":
        return isStroke ? "#818CF8" : "rgba(99, 102, 241, 0.75)"; // Indigo
      case "civic":
      case "structure":
        return isStroke ? "#C084FC" : "rgba(168, 85, 247, 0.8)"; // Purple
      case "garage":
        return isStroke ? "#94A3B8" : "rgba(100, 116, 139, 0.7)"; // Slate
      case "residential":
      default:
        return isStroke ? "#FBBF24" : "rgba(245, 158, 11, 0.75)"; // Amber
    }
  };

  // Render polygons
  for (const b of filtered) {
    if (!b.coordinates || b.coordinates.length < 3) continue;

    ctx.beginPath();
    const [startLng, startLat] = b.coordinates[0];
    const [startX, startY] = toPixel(startLng, startLat);
    ctx.moveTo(startX, startY);

    for (let i = 1; i < b.coordinates.length; i++) {
      const [lng, lat] = b.coordinates[i];
      const [px, py] = toPixel(lng, lat);
      ctx.lineTo(px, py);
    }
    ctx.closePath();

    if (settings.renderMode === "mask") {
      const fillColor = settings.invertMask ? "#000000" : "#FFFFFF";
      ctx.fillStyle = fillColor;
      ctx.fill();
    } else if (settings.renderMode === "category") {
      ctx.fillStyle = getCategoryFill(b.type, false);
      ctx.fill();
      ctx.strokeStyle = getCategoryFill(b.type, true);
      ctx.lineWidth = Math.max(1, width / 1024);
      ctx.stroke();
    } else {
      // Styled dark architectural mode
      const isSpecial = b.type === "fuel" || b.heightMeters > 15;
      ctx.fillStyle = isSpecial ? "rgba(102, 252, 241, 0.45)" : "rgba(69, 162, 158, 0.35)";
      ctx.fill();
      ctx.strokeStyle = isSpecial ? "#66FCF1" : "rgba(102, 252, 241, 0.75)";
      ctx.lineWidth = isSpecial ? 2 : 1;
      ctx.stroke();
    }

    // Special icon/marker for Fuel Stations (Gas stations are essential for driving games!)
    if (b.type === "fuel" && settings.renderMode !== "mask") {
      const [cx, cy] = toPixel(b.centroid.lng, b.centroid.lat);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(3, width / 250), 0, Math.PI * 2);
      ctx.fillStyle = "#10B981";
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

/**
 * Exports canvas to high quality PNG Blob
 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create blob from canvas"));
        }
      },
      "image/png"
    );
  });
}

/**
 * Exports GeoJSON to file download
 */
export function exportBuildingsGeoJson(geojson: any, filename: string): void {
  const jsonStr = JSON.stringify(geojson, null, 2);
  const blob = new Blob([jsonStr], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports building placement table as CSV for Unreal PCG, Houdini, or Unity
 */
export function exportBuildingsCsv(
  buildings: BuildingStructure[],
  bbox: BoundingBox,
  filename: string
): void {
  const spanLng = bbox.east - bbox.west;
  const spanLat = bbox.north - bbox.south;

  const headers = [
    "id",
    "name",
    "type",
    "subtype",
    "amenity",
    "latitude",
    "longitude",
    "rel_x_norm",
    "rel_y_norm",
    "width_meters",
    "depth_meters",
    "height_meters",
    "levels",
    "footprint_area_sqm",
  ];

  const rows = buildings.map((b) => {
    const relX = spanLng > 0 ? (b.centroid.lng - bbox.west) / spanLng : 0.5;
    const relY = spanLat > 0 ? (bbox.north - b.centroid.lat) / spanLat : 0.5;
    return [
      b.id,
      `"${(b.name || "").replace(/"/g, '""')}"`,
      b.type,
      b.subtype,
      b.amenity || "",
      b.centroid.lat,
      b.centroid.lng,
      relX.toFixed(5),
      relY.toFixed(5),
      b.widthMeters,
      b.depthMeters,
      b.heightMeters,
      b.levels,
      b.areaSqMeters,
    ].join(",");
  });

  const csvContent = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
