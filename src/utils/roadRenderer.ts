import { BoundingBox, RoadSegment, RoadSettings } from "../types";

/**
 * Maps geographic coordinates [lng, lat] to canvas pixel coordinates [x, y]
 */
export function projectLngLatToCanvas(
  lng: number,
  lat: number,
  bbox: BoundingBox,
  width: number,
  height: number
): [number, number] {
  const lngRange = bbox.east - bbox.west;
  const latRange = bbox.north - bbox.south;

  const x = ((lng - bbox.west) / (lngRange || 0.0001)) * width;
  const y = ((bbox.north - lat) / (latRange || 0.0001)) * height;

  return [x, y];
}

/**
 * Returns road category and base line thickness in pixels
 */
export function getRoadCategoryAndWidth(highway: string): {
  category: "motorway" | "primary" | "secondary" | "residential" | "track";
  baseWidth: number;
} {
  const hw = highway.toLowerCase();

  if (hw.includes("motorway") || hw.includes("trunk")) {
    return { category: "motorway", baseWidth: 5.5 };
  }
  if (hw.includes("primary")) {
    return { category: "primary", baseWidth: 4.0 };
  }
  if (hw.includes("secondary") || hw.includes("tertiary")) {
    return { category: "secondary", baseWidth: 2.8 };
  }
  if (
    hw.includes("residential") ||
    hw.includes("unclassified") ||
    hw.includes("service") ||
    hw.includes("living_street")
  ) {
    return { category: "residential", baseWidth: 1.8 };
  }
  // Tracks, paths, bridleways
  return { category: "track", baseWidth: 1.0 };
}

/**
 * Renders vector road segments onto an HTML canvas
 */
export function renderRoadsToCanvas(
  canvas: HTMLCanvasElement,
  roads: RoadSegment[],
  bbox: BoundingBox,
  settings: RoadSettings,
  backgroundOption: "solid_black" | "transparent" | "dark_studio" | "white" = "solid_black"
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // 1. Fill background
  if (backgroundOption === "transparent") {
    ctx.clearRect(0, 0, width, height);
  } else if (backgroundOption === "white" || (settings.renderMode === "mask" && settings.invertMask)) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
  } else if (backgroundOption === "dark_studio") {
    ctx.fillStyle = "#0B0C10";
    ctx.fillRect(0, 0, width, height);
  } else {
    // Default solid black (standard for displacement & landscape alpha masks)
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Sort roads so major highways render above minor tracks
  const roadPriority = (hw: string) => {
    if (hw.includes("motorway") || hw.includes("trunk")) return 5;
    if (hw.includes("primary")) return 4;
    if (hw.includes("secondary")) return 3;
    if (hw.includes("tertiary")) return 2;
    if (hw.includes("residential") || hw.includes("unclassified")) return 1;
    return 0;
  };

  const sortedRoads = [...roads].sort(
    (a, b) => roadPriority(a.highway) - roadPriority(b.highway)
  );

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 3. Draw each road segment
  for (const road of sortedRoads) {
    if (!road.coordinates || road.coordinates.length < 2) continue;

    const { category, baseWidth } = getRoadCategoryAndWidth(road.highway);

    // Filter check based on user settings
    if (category === "motorway" && !settings.showMotorways) continue;
    if (category === "primary" && !settings.showPrimary) continue;
    if (category === "secondary" && !settings.showSecondary) continue;
    if (category === "residential" && !settings.showResidential) continue;
    if (category === "track" && !settings.showTracks) continue;

    const lineWidth = Math.max(1, baseWidth * settings.roadWidthMultiplier * (width / 1024));

    // Choose stroke color
    if (settings.renderMode === "mask") {
      ctx.strokeStyle = settings.invertMask ? "#000000" : "#FFFFFF";
    } else {
      // Styled mode
      switch (category) {
        case "motorway":
          ctx.strokeStyle = "#FF6347"; // Vibrant red-orange
          break;
        case "primary":
          ctx.strokeStyle = "#F59E0B"; // Bright amber / yellow
          break;
        case "secondary":
          ctx.strokeStyle = "#45A29E"; // Cyan-teal
          break;
        case "residential":
          ctx.strokeStyle = "#E2E8F0"; // Clean silver-white
          break;
        case "track":
        default:
          ctx.strokeStyle = "#718096"; // Subtle slate gray
          break;
      }
    }

    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    const [startX, startY] = projectLngLatToCanvas(
      road.coordinates[0][0],
      road.coordinates[0][1],
      bbox,
      width,
      height
    );
    ctx.moveTo(startX, startY);

    for (let i = 1; i < road.coordinates.length; i++) {
      const [px, py] = projectLngLatToCanvas(
        road.coordinates[i][0],
        road.coordinates[i][1],
        bbox,
        width,
        height
      );
      ctx.lineTo(px, py);
    }

    ctx.stroke();
  }
}

/**
 * Exports canvas as PNG Blob
 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to convert canvas to PNG Blob"));
    }, "image/png");
  });
}
