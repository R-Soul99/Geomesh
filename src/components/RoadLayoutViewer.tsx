import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  Sliders,
  Sparkles,
  Layers,
  Eye,
  Check,
  RotateCcw,
  Navigation,
  FileCode,
  MapPin,
  RefreshCw,
  Box,
} from "lucide-react";
import { ElevationGridData, RoadNetworkData, RoadSettings } from "../types";
import { renderRoadsToCanvas, canvasToPngBlob } from "../utils/roadRenderer";

interface RoadLayoutViewerProps {
  data: ElevationGridData;
  areaKilometers: number;
  roadData: RoadNetworkData | null;
  isLoadingRoads: boolean;
  onRefreshRoads: () => void;
  onProceedTo3D: () => void;
  roadCanvasRefOut?: React.MutableRefObject<HTMLCanvasElement | null>;
}

export const RoadLayoutViewer: React.FC<RoadLayoutViewerProps> = ({
  data,
  areaKilometers,
  roadData,
  isLoadingRoads,
  onRefreshRoads,
  onProceedTo3D,
  roadCanvasRefOut,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Road filter & styling settings
  const [settings, setSettings] = useState<RoadSettings>({
    showMotorways: true,
    showPrimary: true,
    showSecondary: true,
    showResidential: true,
    showTracks: true,
    roadWidthMultiplier: 1.2,
    renderMode: "mask", // "mask" (B&W) or "styled" (colored) or "hybrid"
    invertMask: false,
  });

  const [exportRes, setExportRes] = useState<number>(1024);
  const [isExporting, setIsExporting] = useState(false);

  // Render roads onto canvas whenever settings or roadData change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = exportRes;
    canvas.height = exportRes;

    if (roadData && roadData.roads.length > 0) {
      renderRoadsToCanvas(
        canvas,
        roadData.roads,
        data.bbox,
        settings,
        settings.renderMode === "mask"
          ? settings.invertMask
            ? "white"
            : "solid_black"
          : "dark_studio"
      );
    } else {
      // Empty state canvas
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#0B0C10";
        ctx.fillRect(0, 0, exportRes, exportRes);
      }
    }

    if (roadCanvasRefOut) {
      roadCanvasRefOut.current = canvas;
    }
  }, [roadData, settings, exportRes, data.bbox, roadCanvasRefOut]);

  // Download Road Mask PNG
  const handleDownloadPng = async (isStyled: boolean = false) => {
    try {
      setIsExporting(true);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const blob = await canvasToPngBlob(canvas);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const typeStr = isStyled ? "styled_roads" : settings.invertMask ? "road_mask_inverted" : "road_mask";
      a.download = `${typeStr}_${exportRes}x${exportRes}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export road PNG:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Download Vector GeoJSON
  const handleDownloadGeoJson = () => {
    if (!roadData || !roadData.geojson) return;
    try {
      const jsonStr = JSON.stringify(roadData.geojson, null, 2);
      const blob = new Blob([jsonStr], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roads_vector_${areaKilometers}km.geojson`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export GeoJSON:", err);
    }
  };

  // Road counts by category
  const stats = React.useMemo(() => {
    if (!roadData || !roadData.roads) return { total: 0, motorways: 0, primary: 0, secondary: 0, residential: 0, tracks: 0 };
    let motorways = 0;
    let primary = 0;
    let secondary = 0;
    let residential = 0;
    let tracks = 0;

    for (const r of roadData.roads) {
      const hw = r.highway.toLowerCase();
      if (hw.includes("motorway") || hw.includes("trunk")) motorways++;
      else if (hw.includes("primary")) primary++;
      else if (hw.includes("secondary") || hw.includes("tertiary")) secondary++;
      else if (hw.includes("residential") || hw.includes("unclassified") || hw.includes("service")) residential++;
      else tracks++;
    }

    return {
      total: roadData.roads.length,
      motorways,
      primary,
      secondary,
      residential,
      tracks,
    };
  }, [roadData]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left 2 Cols: Interactive Road Layout Canvas */}
      <div className="lg:col-span-2 space-y-4">
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111418] border border-[#1F2833] rounded-lg p-3">
          <div className="flex items-center gap-2">
            <button
              id="tab-mode-mask"
              onClick={() => setSettings({ ...settings, renderMode: "mask" })}
              className={`px-3 py-1.5 text-xs font-mono rounded border transition flex items-center gap-1.5 ${
                settings.renderMode === "mask"
                  ? "bg-[#45A29E] border-[#45A29E] text-[#0B0C10] font-bold"
                  : "bg-[#0B0C10] border-[#1F2833] text-[#C5C6C7] hover:border-[#45A29E]/50"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>B&amp;W ROAD MASK</span>
            </button>

            <button
              id="tab-mode-styled"
              onClick={() => setSettings({ ...settings, renderMode: "styled" })}
              className={`px-3 py-1.5 text-xs font-mono rounded border transition flex items-center gap-1.5 ${
                settings.renderMode === "styled"
                  ? "bg-[#45A29E] border-[#45A29E] text-[#0B0C10] font-bold"
                  : "bg-[#0B0C10] border-[#1F2833] text-[#C5C6C7] hover:border-[#45A29E]/50"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>STYLED ROAD NETWORK</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-refresh-roads"
              onClick={onRefreshRoads}
              disabled={isLoadingRoads}
              className="px-2.5 py-1.5 text-xs font-mono rounded border border-[#1F2833] bg-[#0B0C10] text-[#C5C6C7] hover:text-white flex items-center gap-1.5 transition"
              title="Re-query OpenStreetMap for this bounding box"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRoads ? "animate-spin text-[#45A29E]" : ""}`} />
              <span className="hidden sm:inline">REFETCH OSM</span>
            </button>
          </div>
        </div>

        {/* Canvas Display Viewport */}
        <div className="relative rounded-lg border border-[#1F2833] bg-[#0B0C10] overflow-hidden shadow-2xl flex items-center justify-center min-h-[380px] sm:min-h-[480px]">
          <canvas
            ref={canvasRef}
            className="w-full max-h-[560px] object-contain block mx-auto transition-transform"
          />

          {/* Loading Overlay */}
          {isLoadingRoads && (
            <div className="absolute inset-0 bg-[#0B0C10]/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10 font-mono">
              <RefreshCw className="w-8 h-8 text-[#45A29E] animate-spin" />
              <span className="text-xs text-[#66FCF1] tracking-wider">
                EXTRACTING ROAD VECTORS (OPENSTREETMAP)...
              </span>
            </div>
          )}

          {/* Empty State */}
          {!isLoadingRoads && roadData && roadData.roads.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center font-mono space-y-2">
              <Navigation className="w-10 h-10 text-[#C5C6C7]/30 mx-auto" />
              <p className="text-xs text-[#C5C6C7]/70">No mapped roads found in this remote bounding box.</p>
              <button
                onClick={onRefreshRoads}
                className="px-3 py-1 bg-[#1F2833] hover:bg-[#45A29E] hover:text-[#0B0C10] text-xs rounded transition"
              >
                Retry Query
              </button>
            </div>
          )}

          {/* Attribution Badge */}
          <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-[#0B0C10]/85 border border-[#1F2833] rounded text-[10px] font-mono text-[#C5C6C7]/60">
            DATA: &copy; OPENSTREETMAP CONTRIBUTORS (ODbL)
          </div>

          {/* Mode Indicator Badge */}
          <div className="absolute top-3 right-3 px-2.5 py-1 bg-[#0B0C10]/85 border border-[#1F2833] rounded text-[10px] font-mono text-[#66FCF1]">
            {settings.renderMode === "mask"
              ? settings.invertMask
                ? "ALPHA MASK [INVERTED]"
                : "ALPHA MASK [8-BIT B&W]"
              : "RGB CARTOGRAPHIC VECTOR"}
          </div>
        </div>

        {/* Road Classification Diagnostics */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 font-mono text-center">
          <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-2.5">
            <span className="text-[10px] text-[#C5C6C7]/60 block uppercase">TOTAL ROADS</span>
            <span className="text-sm font-bold text-[#66FCF1]">{stats.total.toLocaleString()}</span>
          </div>
          <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-2.5">
            <span className="text-[10px] text-[#FF6347] block uppercase">MOTORWAYS</span>
            <span className="text-sm font-bold text-white">{stats.motorways}</span>
          </div>
          <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-2.5">
            <span className="text-[10px] text-[#F59E0B] block uppercase">PRIMARY / A-RDS</span>
            <span className="text-sm font-bold text-white">{stats.primary}</span>
          </div>
          <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-2.5">
            <span className="text-[10px] text-[#45A29E] block uppercase">SECONDARY</span>
            <span className="text-sm font-bold text-white">{stats.secondary}</span>
          </div>
          <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-2.5 col-span-2 sm:col-span-1">
            <span className="text-[10px] text-[#C5C6C7]/60 block uppercase">LANES &amp; TRACKS</span>
            <span className="text-sm font-bold text-[#C5C6C7]">{(stats.residential + stats.tracks).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Right Col: Filters, Controls & Multi-Format Exports */}
      <div className="space-y-4 font-sans">
        {/* Road Hierarchy Filter Card */}
        <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#1F2833] pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#45A29E]" />
              ROAD FILTER &amp; LAYOUT CONTROLS
            </h3>
            <span className="text-[10px] font-mono text-[#45A29E]">CH_04</span>
          </div>

          {/* Road Width Multiplier Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#C5C6C7]">ROAD WIDTH SCALE</span>
              <span className="text-[#66FCF1] font-bold">{settings.roadWidthMultiplier.toFixed(1)}x</span>
            </div>
            <input
              id="slider-road-width"
              type="range"
              min={0.5}
              max={3.0}
              step={0.1}
              value={settings.roadWidthMultiplier}
              onChange={(e) =>
                setSettings({ ...settings, roadWidthMultiplier: Number(e.target.value) })
              }
              className="w-full accent-[#45A29E] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#C5C6C7]/50">
              <span>0.5x [HAIRLINE]</span>
              <span>1.0x [STANDARD]</span>
              <span>3.0x [EMPHASIZED]</span>
            </div>
          </div>

          {/* Resolution Selector */}
          <div className="space-y-1.5 font-mono pt-1 border-t border-[#1F2833]">
            <span className="text-xs text-[#C5C6C7] block uppercase">EXPORT RASTER RESOLUTION</span>
            <div className="grid grid-cols-3 gap-2">
              {[512, 1024, 2048].map((res) => (
                <button
                  key={res}
                  onClick={() => setExportRes(res)}
                  className={`py-1.5 text-xs rounded border transition ${
                    exportRes === res
                      ? "bg-[#45A29E] border-[#45A29E] text-[#0B0C10] font-bold"
                      : "bg-[#0B0C10] border-[#1F2833] text-[#C5C6C7] hover:border-[#45A29E]/50"
                  }`}
                >
                  {res}&times;{res}
                </button>
              ))}
            </div>
          </div>

          {/* Category Checkboxes */}
          <div className="space-y-2 pt-2 border-t border-[#1F2833] font-mono text-xs">
            <span className="text-[11px] text-[#C5C6C7]/60 block uppercase">ACTIVE ROAD LAYERS</span>

            <label className="flex items-center justify-between cursor-pointer hover:text-white">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF6347]" />
                <span>Motorways &amp; Dual Carriageways</span>
              </span>
              <input
                type="checkbox"
                checked={settings.showMotorways}
                onChange={(e) => setSettings({ ...settings, showMotorways: e.target.checked })}
                className="accent-[#45A29E] cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer hover:text-white">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                <span>Primary Highways &amp; A-Roads</span>
              </span>
              <input
                type="checkbox"
                checked={settings.showPrimary}
                onChange={(e) => setSettings({ ...settings, showPrimary: e.target.checked })}
                className="accent-[#45A29E] cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer hover:text-white">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#45A29E]" />
                <span>Secondary &amp; Tertiary Roads</span>
              </span>
              <input
                type="checkbox"
                checked={settings.showSecondary}
                onChange={(e) => setSettings({ ...settings, showSecondary: e.target.checked })}
                className="accent-[#45A29E] cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer hover:text-white">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E2E8F0]" />
                <span>Residential &amp; Rural Lanes</span>
              </span>
              <input
                type="checkbox"
                checked={settings.showResidential}
                onChange={(e) => setSettings({ ...settings, showResidential: e.target.checked })}
                className="accent-[#45A29E] cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer hover:text-white">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#718096]" />
                <span>Tracks, Paths &amp; Bridleways</span>
              </span>
              <input
                type="checkbox"
                checked={settings.showTracks}
                onChange={(e) => setSettings({ ...settings, showTracks: e.target.checked })}
                className="accent-[#45A29E] cursor-pointer"
              />
            </label>
          </div>

          {/* Invert Mask Checkbox (only in mask mode) */}
          {settings.renderMode === "mask" && (
            <div className="pt-2 border-t border-[#1F2833] font-mono">
              <label className="flex items-center justify-between cursor-pointer text-xs hover:text-white">
                <span className="text-[#C5C6C7]">INVERT MASK (BLACK ON WHITE)</span>
                <input
                  type="checkbox"
                  checked={settings.invertMask}
                  onChange={(e) => setSettings({ ...settings, invertMask: e.target.checked })}
                  className="accent-[#45A29E] cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>

        {/* Download Actions Card */}
        <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-4 shadow-xl space-y-3 font-mono">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Download className="w-3.5 h-3.5 text-[#45A29E]" />
            EXPORT ROAD ASSETS
          </h4>

          {/* Download Mask Button */}
          <button
            id="btn-download-road-mask"
            onClick={() => handleDownloadPng(false)}
            disabled={isExporting || !roadData || roadData.roads.length === 0}
            className="w-full py-2.5 bg-[#45A29E] hover:bg-[#66FCF1] disabled:opacity-50 text-[#0B0C10] rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(69,162,158,0.25)] transition"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            <span>DOWNLOAD ROAD MASK (.PNG)</span>
          </button>

          {/* Download GeoJSON Button */}
          <button
            id="btn-download-geojson"
            onClick={handleDownloadGeoJson}
            disabled={!roadData || roadData.roads.length === 0}
            className="w-full py-2 bg-[#0B0C10] hover:bg-[#1F2833] border border-[#1F2833] hover:border-[#45A29E]/50 text-[#C5C6C7] hover:text-white rounded text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition"
          >
            <FileCode className="w-3.5 h-3.5 text-[#66FCF1]" />
            <span>EXPORT VECTOR GEOJSON (.GEOJSON)</span>
          </button>

          <p className="text-[11px] text-[#C5C6C7]/50 leading-relaxed">
            &bull; <strong>Road Mask PNG:</strong> Use in Unreal Engine landscape materials or Unity terrain splat layers to carve roads.<br />
            &bull; <strong>GeoJSON:</strong> Import real road splines into Blender (Blender-GIS) or QGIS.
          </p>

          {/* Proceed to 3D */}
          <button
            id="btn-proceed-3d-roads"
            onClick={onProceedTo3D}
            className="w-full mt-2 py-2.5 bg-gradient-to-r from-[#1F2833] to-[#111418] hover:border-[#45A29E] border border-[#1F2833] text-white rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition"
          >
            <Box className="w-4 h-4 text-[#45A29E]" />
            <span>VIEW ROADS DRAPED ON 3D MESH &rarr;</span>
          </button>
        </div>
      </div>
    </div>
  );
};
