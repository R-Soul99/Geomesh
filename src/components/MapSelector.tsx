import React, { useState, useEffect, useRef } from "react";
import {
  MapPin,
  Search,
  Maximize2,
  Eye,
  Play,
  RotateCcw,
  Layers,
  Info,
  Compass,
  ArrowRight,
} from "lucide-react";
import { BoundingBox, Coordinates, TerrainPreset } from "../types";
import { PRESETS } from "../utils/presets";

interface MapSelectorProps {
  bbox: BoundingBox;
  center: Coordinates;
  onChangeBbox: (bbox: BoundingBox, center: Coordinates) => void;
  onGenerate: (resolution: number) => void;
  isGenerating: boolean;
  selectedPreset: string;
  onSelectPreset: (preset: TerrainPreset) => void;
  hasGoogleKey: boolean;
  onOpenStreetView: () => void;
  areaKilometers: number;
  setAreaKilometers: (km: number) => void;
}

export const MapSelector: React.FC<MapSelectorProps> = ({
  bbox,
  center,
  onChangeBbox,
  onGenerate,
  isGenerating,
  selectedPreset,
  onSelectPreset,
  hasGoogleKey,
  onOpenStreetView,
  areaKilometers,
  setAreaKilometers,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [mapType, setMapType] = useState<"satellite" | "terrain" | "topo">("satellite");
  const [resolution, setResolution] = useState(64);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Map canvas references
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Helper to recompute bounding box from center and area size in km
  const updateBboxFromCenter = (newCenter: Coordinates, sizeKm: number) => {
    // 1 deg lat ~ 111 km
    const latDelta = (sizeKm / 111) / 2;
    // 1 deg lng ~ 111 * cos(lat)
    const cosLat = Math.cos((newCenter.lat * Math.PI) / 180) || 1;
    const lngDelta = (sizeKm / (111 * Math.abs(cosLat))) / 2;

    onChangeBbox(
      {
        north: Number((newCenter.lat + latDelta).toFixed(5)),
        south: Number((newCenter.lat - latDelta).toFixed(5)),
        east: Number((newCenter.lng + lngDelta).toFixed(5)),
        west: Number((newCenter.lng - lngDelta).toFixed(5)),
      },
      newCenter
    );
  };

  const handleSizeChange = (sizeKm: number) => {
    setAreaKilometers(sizeKm);
    updateBboxFromCenter(center, sizeKm);
  };

  // Place Geocoding search via OpenStreetMap Nominatim or Google Geocoding
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&limit=1`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        updateBboxFromCenter({ lat, lng }, areaKilometers);
      } else {
        setSearchError("Location not found. Try entering a city or landmark.");
      }
    } catch (err: any) {
      setSearchError("Geocoding lookup failed. Check your connection.");
    } finally {
      setIsSearching(false);
    }
  };

  // Render an interactive canvas representation of the chosen terrain tile & bounding box
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background map tile simulation / satellite aesthetic
    const grad = ctx.createLinearGradient(0, 0, width, height);
    if (mapType === "satellite") {
      grad.addColorStop(0, "#192823");
      grad.addColorStop(0.5, "#253b2f");
      grad.addColorStop(1, "#12201b");
    } else if (mapType === "terrain") {
      grad.addColorStop(0, "#839c7b");
      grad.addColorStop(0.5, "#a8b598");
      grad.addColorStop(1, "#667858");
    } else {
      grad.addColorStop(0, "#2c3e50");
      grad.addColorStop(0.5, "#34495e");
      grad.addColorStop(1, "#1a252f");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Draw latitude / longitude grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw terrain topography contour simulation rings
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1.5;
    const cx = width / 2;
    const cy = height / 2;
    for (let r = 25; r <= 180; r += 30) {
      ctx.beginPath();
      for (let theta = 0; theta <= Math.PI * 2; theta += 0.1) {
        const wobble =
          Math.sin(theta * 4 + r * 0.05) * 8 +
          Math.cos(theta * 2) * 5;
        const px = cx + (r + wobble) * Math.cos(theta);
        const py = cy + (r + wobble) * Math.sin(theta);
        if (theta === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Draw Capture Box in center
    const boxSize = Math.min(width, height) * 0.65;
    const bx = (width - boxSize) / 2;
    const by = (height - boxSize) / 2;

    // Fill semi-transparent highlight
    ctx.fillStyle = "rgba(16, 185, 129, 0.12)";
    ctx.fillRect(bx, by, boxSize, boxSize);

    // Box border with animated dashed style
    ctx.strokeStyle = "#45A29E";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(bx, by, boxSize, boxSize);
    ctx.setLineDash([]);

    // Corner crosshairs
    const armLen = 14;
    ctx.strokeStyle = "#66FCF1";
    ctx.lineWidth = 2.5;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(bx - 2, by + armLen);
    ctx.lineTo(bx - 2, by - 2);
    ctx.lineTo(bx + armLen, by - 2);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(bx + boxSize + 2 - armLen, by - 2);
    ctx.lineTo(bx + boxSize + 2, by - 2);
    ctx.lineTo(bx + boxSize + 2, by + armLen);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(bx - 2, by + boxSize + 2 - armLen);
    ctx.lineTo(bx - 2, by + boxSize + 2);
    ctx.lineTo(bx + armLen, by + boxSize + 2);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(bx + boxSize + 2 - armLen, by + boxSize + 2);
    ctx.lineTo(bx + boxSize + 2, by + boxSize + 2);
    ctx.lineTo(bx + boxSize + 2, by + boxSize + 2 - armLen);
    ctx.stroke();

    // Center targeting reticle
    ctx.strokeStyle = "#66FCF1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy);
    ctx.lineTo(cx + 12, cy);
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();

    // Text tags on box edges
    ctx.fillStyle = "#66FCF1";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`${areaKilometers} KM AOI`, bx + 10, by + 20);
    ctx.fillStyle = "rgba(197, 198, 199, 0.85)";
    ctx.fillText(`N ${bbox.north.toFixed(4)}°`, cx - 35, by - 8);
    ctx.fillText(`S ${bbox.south.toFixed(4)}°`, cx - 35, by + boxSize + 18);
  }, [bbox, center, areaKilometers, mapType]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Left 2 Cols: Interactive Map & Target Canvas */}
      <div className="lg:col-span-2 space-y-3">
        {/* Search Bar & Layer Switcher */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#45A29E] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="input-location-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search mountain, canyon, landmark or coordinates..."
                className="w-full bg-[#1F2833] border border-[#45A29E]/30 text-xs font-mono text-white pl-8 pr-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-[#66FCF1] placeholder-[#C5C6C7]/40"
              />
            </div>
            <button
              id="btn-search-location"
              type="submit"
              disabled={isSearching}
              className="px-3.5 py-2 bg-[#45A29E] hover:bg-[#66FCF1] text-[#0B0C10] font-bold text-xs uppercase tracking-wider rounded transition shrink-0"
            >
              {isSearching ? "LOCATING..." : "LOCATE"}
            </button>
          </form>

          {/* Map Layer Switcher */}
          <div className="flex items-center rounded bg-[#111418] border border-[#1F2833] p-1 self-start sm:self-auto shrink-0 font-mono text-[11px]">
            <button
              id="btn-layer-satellite"
              onClick={() => setMapType("satellite")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider ${
                mapType === "satellite"
                  ? "bg-[#45A29E] text-[#0B0C10] font-bold"
                  : "text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              SATELLITE
            </button>
            <button
              id="btn-layer-terrain"
              onClick={() => setMapType("terrain")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider ${
                mapType === "terrain"
                  ? "bg-[#45A29E] text-[#0B0C10] font-bold"
                  : "text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              TERRAIN
            </button>
            <button
              id="btn-layer-topo"
              onClick={() => setMapType("topo")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider ${
                mapType === "topo"
                  ? "bg-[#45A29E] text-[#0B0C10] font-bold"
                  : "text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              TOPO
            </button>
          </div>
        </div>

        {searchError && (
          <p className="text-xs font-mono text-rose-300 bg-[#1F2833] border border-rose-500/50 px-3 py-1.5 rounded">
            {searchError}
          </p>
        )}

        {/* Target Bounding Box Viewport */}
        <div className="relative rounded-lg border border-[#1F2833] bg-[#0B0C10] overflow-hidden shadow-2xl">
          <canvas
            ref={canvasRef}
            width={640}
            height={440}
            className="w-full h-80 sm:h-96 object-cover cursor-crosshair block"
            title="Area of Interest (AOI) capture frame"
          />

          {/* Floating HUD over viewport */}
          <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-2 pointer-events-auto">
            <span className="px-2.5 py-1 text-[11px] font-mono font-semibold rounded bg-[#0B0C10]/90 text-[#66FCF1] border border-[#45A29E]/40 backdrop-blur-sm flex items-center gap-1.5 shadow-md">
              <span className="w-1.5 h-1.5 rounded-full bg-[#66FCF1] shadow-[0_0_6px_#66FCF1]" />
              <MapPin className="w-3 h-3 text-[#45A29E]" />
              {center.lat.toFixed(4)}°, {center.lng.toFixed(4)}°
            </span>
            <span className="px-2.5 py-1 text-[11px] font-mono rounded bg-[#0B0C10]/90 text-[#C5C6C7] border border-[#1F2833] backdrop-blur-sm">
              AOI: {areaKilometers} &times; {areaKilometers} KM
            </span>
          </div>

          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2 pointer-events-auto">
            <button
              id="btn-open-streetview"
              onClick={onOpenStreetView}
              className="px-3 py-1.5 bg-[#0B0C10]/90 hover:bg-[#1F2833] border border-[#45A29E]/40 text-xs font-mono text-[#66FCF1] rounded backdrop-blur-sm flex items-center gap-1.5 shadow-md transition"
              title="Inspect Street View vantage point"
            >
              <Eye className="w-3.5 h-3.5 text-[#45A29E]" />
              STREET VIEW VANTAGE
            </button>
          </div>
        </div>

        {/* Quick presets pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
          <span className="text-[#45A29E] font-bold text-[10px] uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
            <Compass className="w-3.5 h-3.5" /> PRESETS:
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectPreset(p)}
              className={`px-2.5 py-1 rounded text-[11px] border shrink-0 transition ${
                selectedPreset === p.id
                  ? "bg-[#45A29E] border-[#45A29E] text-[#0B0C10] font-bold shadow-[0_0_8px_rgba(69,162,158,0.3)]"
                  : "bg-[#111418] border-[#1F2833] text-[#C5C6C7]/70 hover:text-white hover:border-[#45A29E]/40"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Right Col: Capture Parameters & Action Panel */}
      <div className="space-y-4">
        <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#1F2833] pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Maximize2 className="w-3.5 h-3.5 text-[#45A29E]" />
              AOI CAPTURE PARAMETERS
            </h3>
            <span className="text-[10px] font-mono text-[#45A29E]">CH_01</span>
          </div>

          {/* AOI Size Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#C5C6C7]">AOI DIMENSION</span>
              <span className="text-[#66FCF1] font-bold">
                {areaKilometers} KM ({Math.round(areaKilometers * 1000)} M)
              </span>
            </div>
            <input
              id="slider-aoi-size"
              type="range"
              min={1}
              max={25}
              step={1}
              value={areaKilometers}
              onChange={(e) => handleSizeChange(Number(e.target.value))}
              className="w-full accent-[#45A29E] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#C5C6C7]/50">
              <span>1 KM [LOCAL]</span>
              <span>10 KM</span>
              <span>25 KM [REGIONAL]</span>
            </div>
          </div>

          {/* Grid Sampling Resolution */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#C5C6C7]">SAMPLING RESOLUTION</span>
              <span className="text-[#66FCF1] font-bold">
                {resolution} &times; {resolution} ({resolution * resolution} PTS)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[32, 64, 128].map((resVal) => (
                <button
                  key={resVal}
                  type="button"
                  onClick={() => setResolution(resVal)}
                  className={`py-2 px-2 text-xs font-mono rounded border transition text-center ${
                    resolution === resVal
                      ? "bg-[#1F2833] border-[#66FCF1] text-[#66FCF1] font-bold shadow-[0_0_8px_rgba(102,252,241,0.2)]"
                      : "bg-[#111418] border-[#1F2833] text-[#C5C6C7]/70 hover:text-white hover:border-[#45A29E]/30"
                  }`}
                >
                  {resVal}&times;{resVal}
                  <span className="block text-[9px] font-normal text-[#45A29E] uppercase tracking-tighter mt-0.5">
                    {resVal === 32 ? "FAST" : resVal === 64 ? "BALANCED" : "HIGH-RES"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Geographic Extents Table */}
          <div className="bg-[#0B0C10] border border-[#1F2833] rounded p-3 space-y-1.5 font-mono text-[11px] text-[#C5C6C7]">
            <div className="text-[#45A29E] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1">
              <Info className="w-3 h-3 text-[#66FCF1]" />
              GEOGRAPHIC EXTENTS
            </div>
            <div className="flex justify-between">
              <span className="text-[#C5C6C7]/60">NORTH:</span>
              <span className="text-white font-mono">{bbox.north.toFixed(5)}°</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#C5C6C7]/60">SOUTH:</span>
              <span className="text-white font-mono">{bbox.south.toFixed(5)}°</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#C5C6C7]/60">EAST:</span>
              <span className="text-white font-mono">{bbox.east.toFixed(5)}°</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#C5C6C7]/60">WEST:</span>
              <span className="text-white font-mono">{bbox.west.toFixed(5)}°</span>
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            id="btn-generate-terrain"
            onClick={() => onGenerate(resolution)}
            disabled={isGenerating}
            className={`w-full py-2.5 px-4 rounded font-bold text-xs uppercase tracking-wider text-[#0B0C10] flex items-center justify-center gap-2 shadow-lg transition duration-200 ${
              isGenerating
                ? "bg-[#45A29E]/50 cursor-wait text-white/50"
                : "bg-[#45A29E] hover:bg-[#66FCF1] active:scale-[0.99] shadow-[0_0_12px_rgba(69,162,158,0.3)]"
            }`}
          >
            {isGenerating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-[#0B0C10] border-t-transparent rounded-full animate-spin" />
                <span>SAMPLING TOPOGRAPHY &bull; MESHING...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>GENERATE HEIGHTMAP &bull; 3D GLTF</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </>
            )}
          </button>
        </div>

        {/* Help Tip Card */}
        <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-3.5 text-xs font-mono space-y-2">
          <p className="font-bold text-[10px] text-[#45A29E] uppercase tracking-wider">PIPELINE ARTIFACTS:</p>
          <ul className="space-y-1.5 text-[11px] text-[#C5C6C7]/70">
            <li className="flex items-start gap-1.5">
              <span className="text-[#66FCF1] font-bold">&bull;</span>
              <span>
                <strong className="text-white">16-BIT GRAYSCALE PNG:</strong> True 65,536-level elevation raster.
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-[#66FCF1] font-bold">&bull;</span>
              <span>
                <strong className="text-white">RGBA SPLAT MASK:</strong> Multi-layer terrain shader mask.
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-[#66FCF1] font-bold">&bull;</span>
              <span>
                <strong className="text-white">3D GLTF (.GLB):</strong> Textured mesh with watertight skirt.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
