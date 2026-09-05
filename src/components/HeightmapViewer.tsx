import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  Sliders,
  Maximize,
  Info,
  Eye,
  RefreshCw,
  Layers,
  Sparkles,
  Palette,
} from "lucide-react";
import { ElevationGridData, HeightmapSettings } from "../types";
import {
  encode16BitGrayscalePng,
  generateNormalMapImageData,
  getHypsometricColor,
  applySmoothing,
} from "../utils/pngEncoder";

interface HeightmapViewerProps {
  data: ElevationGridData;
  settings: HeightmapSettings;
  onChangeSettings: (settings: HeightmapSettings) => void;
  onProceedToSplatmap: () => void;
}

export const HeightmapViewer: React.FC<HeightmapViewerProps> = ({
  data,
  settings,
  onChangeSettings,
  onProceedToSplatmap,
}) => {
  const [viewMode, setViewMode] = useState<"grayscale" | "hypsometric" | "normal">("grayscale");
  const [hoverElevation, setHoverElevation] = useState<{ x: number; y: number; elevation: number } | null>(null);
  const [isExporting16, setIsExporting16] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Apply smoothing and normalization based on settings
  const processedElevations = React.useMemo(() => {
    return applySmoothing(
      data.elevations,
      data.resolution,
      data.resolution,
      settings.smoothingRadius
    );
  }, [data.elevations, data.resolution, settings.smoothingRadius]);

  // Compute min/max from processed elevations
  const stats = React.useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const val of processedElevations) {
      if (val < min) min = val;
      if (val > max) max = val;
    }
    return {
      min: min === Infinity ? 0 : Math.round(min),
      max: max === -Infinity ? 100 : Math.round(max),
      range: Math.round(max - min),
    };
  }, [processedElevations]);

  // Draw 2D Heightmap Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const res = data.resolution;
    canvas.width = res;
    canvas.height = res;

    const imgData = ctx.createImageData(res, res);
    const range = Math.max(1, stats.max - stats.min);

    if (viewMode === "normal") {
      const normalData = generateNormalMapImageData(processedElevations, res, res, 2.5);
      ctx.putImageData(normalData, 0, 0);
      return;
    }

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = y * res + x;
        const elev = processedElevations[idx];

        // Normalize 0..1
        let norm = (elev - stats.min) / range;
        if (settings.invert) norm = 1 - norm;

        // Apply gamma
        norm = Math.pow(Math.max(0, Math.min(1, norm)), settings.gamma);

        const pixelIdx = idx * 4;

        if (viewMode === "grayscale") {
          const val = Math.round(norm * 255);
          imgData.data[pixelIdx] = val;
          imgData.data[pixelIdx + 1] = val;
          imgData.data[pixelIdx + 2] = val;
          imgData.data[pixelIdx + 3] = 255;
        } else if (viewMode === "hypsometric") {
          const [r, g, b] = getHypsometricColor(norm);
          imgData.data[pixelIdx] = r;
          imgData.data[pixelIdx + 1] = g;
          imgData.data[pixelIdx + 2] = b;
          imgData.data[pixelIdx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [processedElevations, data.resolution, stats, settings, viewMode]);

  // Handle canvas mouse move for interactive pixel altitude tooltip
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const px = Math.floor((e.clientX - rect.left) * scaleX);
    const py = Math.floor((e.clientY - rect.top) * scaleY);

    if (px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
      const idx = py * canvas.width + px;
      const elev = processedElevations[idx];
      setHoverElevation({ x: px, y: py, elevation: Math.round(elev) });
    }
  };

  // Export 16-bit PNG
  const handleDownload16BitPng = async () => {
    try {
      setIsExporting16(true);
      const res = data.resolution;
      const range = Math.max(1, stats.max - stats.min);

      // Array of normalized floats
      const normalizedHeights = new Float32Array(res * res);
      for (let i = 0; i < res * res; i++) {
        let n = (processedElevations[i] - stats.min) / range;
        if (settings.invert) n = 1 - n;
        n = Math.pow(Math.max(0, Math.min(1, n)), settings.gamma);
        normalizedHeights[i] = n;
      }

      const blob = await encode16BitGrayscalePng(normalizedHeights, res, res);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `heightmap_16bit_${res}x${res}_elevation.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Failed to export 16-bit PNG: " + err.message);
    } finally {
      setIsExporting16(false);
    }
  };

  // Export standard 8-bit Canvas PNG
  const handleDownload8BitPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `heightmap_${viewMode}_${data.resolution}x${data.resolution}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Left 2 Cols: Heightmap Canvas Viewport */}
      <div className="lg:col-span-2 space-y-3">
        {/* Mode Switcher Buttons */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center rounded bg-[#111418] border border-[#1F2833] p-1 font-mono text-[11px]">
            <button
              id="btn-mode-grayscale"
              onClick={() => setViewMode("grayscale")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider flex items-center gap-1.5 ${
                viewMode === "grayscale"
                  ? "bg-[#45A29E] text-[#0B0C10] font-bold"
                  : "text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              <Maximize className="w-3 h-3" />
              GRAYSCALE [RAW]
            </button>
            <button
              id="btn-mode-hypsometric"
              onClick={() => setViewMode("hypsometric")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider flex items-center gap-1.5 ${
                viewMode === "hypsometric"
                  ? "bg-[#45A29E] text-[#0B0C10] font-bold"
                  : "text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              <Palette className="w-3 h-3" />
              HYPSOMETRIC [COLOR]
            </button>
            <button
              id="btn-mode-normal"
              onClick={() => setViewMode("normal")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider flex items-center gap-1.5 ${
                viewMode === "normal"
                  ? "bg-[#45A29E] text-[#0B0C10] font-bold"
                  : "text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              <Sparkles className="w-3 h-3" />
              NORMAL MAP [TS]
            </button>
          </div>

          <div className="text-[11px] text-[#45A29E] font-mono">
            GRID: {data.resolution} &times; {data.resolution} PX
          </div>
        </div>

        {/* Viewport Canvas Frame */}
        <div className="relative rounded-lg border border-[#1F2833] bg-[#0B0C10] overflow-hidden shadow-2xl flex items-center justify-center p-4">
          <canvas
            ref={canvasRef}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={() => setHoverElevation(null)}
            className="w-full max-w-lg aspect-square object-contain rounded border border-[#1F2833] shadow-inner cursor-crosshair [image-rendering:pixelated]"
            title="Heightmap Preview (Hover to read elevation)"
          />

          {/* Interactive altitude readout HUD on hover */}
          {hoverElevation && (
            <div className="absolute top-4 left-4 px-2.5 py-1 bg-[#0B0C10]/90 border border-[#45A29E]/50 rounded text-xs font-mono text-[#66FCF1] shadow-lg backdrop-blur-sm pointer-events-none">
              <span>PIXEL [{hoverElevation.x}, {hoverElevation.y}]: </span>
              <strong className="text-white font-bold">{hoverElevation.elevation} M</strong>
            </div>
          )}

          {/* Data source attribution badge */}
          <div className="absolute bottom-4 left-4 px-2.5 py-1 bg-[#0B0C10]/85 border border-[#1F2833] rounded text-[10px] font-mono text-[#C5C6C7]/60">
            SRC: {data.sourceUsed === "google" ? "GOOGLE_MAPS_ELEVATION_API" : "OPEN_DEM_TOPOGRAPHY"}
          </div>
        </div>

        {/* Topographic Statistics Cards */}
        <div className="grid grid-cols-3 gap-2.5 font-mono">
          <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-[#C5C6C7]/60 block uppercase">MIN ALTITUDE</span>
            <span className="text-sm sm:text-base font-bold text-[#66FCF1]">{stats.min} M</span>
          </div>
          <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-[#C5C6C7]/60 block uppercase">MAX ALTITUDE</span>
            <span className="text-sm sm:text-base font-bold text-[#45A29E]">{stats.max} M</span>
          </div>
          <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-[#C5C6C7]/60 block uppercase">VERTICAL RELIEF</span>
            <span className="text-sm sm:text-base font-bold text-amber-400">{stats.range} M</span>
          </div>
        </div>
      </div>

      {/* Right Col: Parameters & Export Buttons */}
      <div className="space-y-4">
        <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#1F2833] pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#45A29E]" />
              HEIGHTMAP ADJUSTMENTS
            </h3>
            <span className="text-[10px] font-mono text-[#45A29E]">CH_02</span>
          </div>

          {/* Gamma / Contrast curve */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#C5C6C7]">CONTRAST GAMMA</span>
              <span className="text-[#66FCF1] font-bold">
                {settings.gamma.toFixed(2)}x
              </span>
            </div>
            <input
              id="slider-gamma"
              type="range"
              min={0.5}
              max={2.5}
              step={0.05}
              value={settings.gamma}
              onChange={(e) =>
                onChangeSettings({ ...settings, gamma: Number(e.target.value) })
              }
              className="w-full accent-[#45A29E] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#C5C6C7]/50">
              <span>0.5 [SHADOW]</span>
              <span>1.0 [LINEAR]</span>
              <span>2.5 [PEAK]</span>
            </div>
          </div>

          {/* Gaussian smoothing filter */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#C5C6C7]">SMOOTHING FILTER</span>
              <span className="text-[#66FCF1] font-bold">
                {settings.smoothingRadius === 0 ? "RAW [0 PX]" : `${settings.smoothingRadius} PX BLUR`}
              </span>
            </div>
            <input
              id="slider-smoothing"
              type="range"
              min={0}
              max={4}
              step={1}
              value={settings.smoothingRadius}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  smoothingRadius: Number(e.target.value),
                })
              }
              className="w-full accent-[#45A29E] cursor-pointer"
            />
            <p className="text-[10px] font-mono text-[#C5C6C7]/60">
              Eliminates terracing artifacts for ultra-smooth landscape vertex displacement.
            </p>
          </div>

          {/* Invert Elevation Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-[#1F2833] font-mono">
            <span className="text-xs text-[#C5C6C7]">INVERT ELEVATION</span>
            <button
              id="toggle-invert-elevation"
              type="button"
              onClick={() =>
                onChangeSettings({ ...settings, invert: !settings.invert })
              }
              className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                settings.invert ? "bg-[#45A29E]" : "bg-[#1F2833]"
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  settings.invert ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Export Actions Box */}
          <div className="space-y-2 pt-3 border-t border-[#1F2833]">
            <label className="text-[10px] font-bold text-[#45A29E] uppercase tracking-wider block">
              DIRECT RASTER EXPORT:
            </label>

            {/* 16-Bit PNG Export Button */}
            <button
              id="btn-download-16bit-png"
              onClick={handleDownload16BitPng}
              disabled={isExporting16}
              className="w-full py-2.5 px-3 bg-[#45A29E] hover:bg-[#66FCF1] text-[#0B0C10] rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(69,162,158,0.3)] transition"
            >
              <Download className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>DOWNLOAD 16-BIT GRAYSCALE PNG</span>
            </button>
            <p className="text-[9px] font-mono text-[#C5C6C7]/50 text-center uppercase">
              UE5 Landscape &bull; Unity Terrain &bull; Blender (65,536 Depth Levels)
            </p>

            {/* 8-Bit PNG Export Button */}
            <button
              id="btn-download-8bit-png"
              onClick={handleDownload8BitPng}
              className="w-full py-2 px-3 bg-[#1F2833] hover:bg-[#1F2833]/80 border border-[#45A29E]/30 text-white rounded text-xs font-mono flex items-center justify-center gap-2 transition"
            >
              <Download className="w-3.5 h-3.5 text-[#66FCF1]" />
              <span>DOWNLOAD {viewMode === "normal" ? "NORMAL MAP" : "8-BIT"} PNG</span>
            </button>
          </div>

          {/* Proceed to Step 3 */}
          <button
            id="btn-next-splatmap"
            onClick={onProceedToSplatmap}
            className="w-full py-2 px-4 bg-[#111418] hover:bg-[#1F2833] border border-[#45A29E]/40 text-[#66FCF1] text-xs font-mono rounded flex items-center justify-center gap-2 transition"
          >
            <span>NEXT: CONFIGURE SPLAT / MASK MAP</span>
            <Layers className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
