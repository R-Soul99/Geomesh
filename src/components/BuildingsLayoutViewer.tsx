import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  Building2,
  Fuel,
  Sliders,
  Sparkles,
  Layers,
  FileCode,
  FileSpreadsheet,
  RotateCcw,
  RefreshCw,
  Box,
  Check,
  Eye,
  Info,
} from "lucide-react";
import { ElevationGridData, BuildingNetworkData, BuildingSettings, BuildingStructure } from "../types";
import {
  renderBuildingsToCanvas,
  canvasToPngBlob,
  exportBuildingsGeoJson,
  exportBuildingsCsv,
} from "../utils/buildingRenderer";

interface BuildingsLayoutViewerProps {
  data: ElevationGridData;
  areaKilometers: number;
  buildingData: BuildingNetworkData | null;
  isLoadingBuildings: boolean;
  onRefreshBuildings: () => void;
  onProceedTo3D: () => void;
  buildingCanvasRefOut?: React.MutableRefObject<HTMLCanvasElement | null>;
}

export const BuildingsLayoutViewer: React.FC<BuildingsLayoutViewerProps> = ({
  data,
  areaKilometers,
  buildingData,
  isLoadingBuildings,
  onRefreshBuildings,
  onProceedTo3D,
  buildingCanvasRefOut,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Settings
  const [settings, setSettings] = useState<BuildingSettings>({
    showResidential: true,
    showCommercial: true,
    showIndustrial: true,
    showFuelStations: true,
    showCivicAndTowers: true,
    showGarages: true,
    minHeightMeters: 0,
    heightMultiplier: 1.0,
    renderMode: "category", // "category" | "styled" | "mask"
    invertMask: false,
  });

  const [exportRes, setExportRes] = useState<number>(1024);
  const [isExporting, setIsExporting] = useState(false);
  const [hoveredBuilding, setHoveredBuilding] = useState<BuildingStructure | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Render footprints onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = exportRes;
    canvas.height = exportRes;

    if (buildingData && buildingData.buildings.length > 0) {
      renderBuildingsToCanvas(
        canvas,
        buildingData.buildings,
        data.bbox,
        settings,
        settings.renderMode === "mask"
          ? settings.invertMask
            ? "white"
            : "solid_black"
          : "dark_studio"
      );
    } else {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#0B0C10";
        ctx.fillRect(0, 0, exportRes, exportRes);
      }
    }

    if (buildingCanvasRefOut) {
      buildingCanvasRefOut.current = canvas;
    }
  }, [buildingData, settings, exportRes, data.bbox, buildingCanvasRefOut]);

  // Handle canvas mouse move for building inspection
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !buildingData || buildingData.buildings.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const normX = clientX / rect.width;
    const normY = clientY / rect.height;

    setMousePos({ x: clientX, y: clientY });

    // Find closest building centroid
    const spanLng = data.bbox.east - data.bbox.west;
    const spanLat = data.bbox.north - data.bbox.south;
    if (spanLng <= 0 || spanLat <= 0) return;

    let closest: BuildingStructure | null = null;
    let minDist = 0.035; // Normalized screen distance threshold

    for (const b of buildingData.buildings) {
      const bNormX = (b.centroid.lng - data.bbox.west) / spanLng;
      const bNormY = (data.bbox.north - b.centroid.lat) / spanLat;
      const dist = Math.hypot(normX - bNormX, normY - bNormY);
      if (dist < minDist) {
        minDist = dist;
        closest = b;
      }
    }

    setHoveredBuilding(closest);
  };

  const handleMouseLeave = () => {
    setHoveredBuilding(null);
    setMousePos(null);
  };

  // Download Mask PNG
  const handleDownloadPng = async (isStyled: boolean = false) => {
    try {
      setIsExporting(true);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const blob = await canvasToPngBlob(canvas);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const typeStr = isStyled ? "styled_buildings" : settings.invertMask ? "building_mask_inverted" : "building_mask";
      a.download = `${typeStr}_${exportRes}x${exportRes}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export building PNG:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Download GeoJSON
  const handleDownloadGeoJson = () => {
    if (!buildingData || !buildingData.geojson) return;
    exportBuildingsGeoJson(
      buildingData.geojson,
      `real_buildings_structures_${areaKilometers}km.geojson`
    );
  };

  // Download CSV Table
  const handleDownloadCsv = () => {
    if (!buildingData || buildingData.buildings.length === 0) return;
    exportBuildingsCsv(
      buildingData.buildings,
      data.bbox,
      `building_structures_table_${areaKilometers}km.csv`
    );
  };

  const summary = buildingData?.summary;
  const count = buildingData?.count || 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0B0C10] text-[#C5C6C7]">
      {/* Subheader & Stats Bar */}
      <div className="bg-[#111418] border-b border-[#1F2833] px-4 py-3 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#1F2833] border border-[#45A29E]/40 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-[#66FCF1]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide uppercase">
                Real-World Buildings &amp; Structures Engine
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[#1F2833] text-[#66FCF1] border border-[#45A29E]/30">
                DRIVING GAME SCENERY
              </span>
            </div>
            <p className="text-xs text-[#C5C6C7]/60 font-mono">
              OpenStreetMap Vector Footprints &bull; Height Profiling &bull; Gas Stations &bull; UE5/Unity Mask
            </p>
          </div>
        </div>

        {/* Telemetry counters */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="bg-[#1F2833]/80 px-3 py-1.5 rounded border border-[#1F2833]">
            <span className="text-[#C5C6C7]/60 mr-1.5">STRUCTURES:</span>
            <span className="text-[#66FCF1] font-bold">
              {isLoadingBuildings ? "FETCHING..." : count.toLocaleString()}
            </span>
          </div>

          <div className="bg-[#1F2833]/80 px-3 py-1.5 rounded border border-[#1F2833] flex items-center gap-1.5">
            <Fuel className="w-3.5 h-3.5 text-[#10B981]" />
            <span className="text-[#C5C6C7]/60">GAS STATIONS:</span>
            <span className="text-[#10B981] font-bold">
              {summary?.fuelStationsCount || 0}
            </span>
          </div>

          <div className="hidden sm:block bg-[#1F2833]/80 px-3 py-1.5 rounded border border-[#1F2833]">
            <span className="text-[#C5C6C7]/60 mr-1.5">AVG HEIGHT:</span>
            <span className="text-white font-bold">
              {summary?.avgHeightMeters || 0}m
            </span>
          </div>

          <button
            id="btn-refresh-buildings"
            onClick={onRefreshBuildings}
            disabled={isLoadingBuildings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1F2833] hover:bg-[#1F2833]/80 text-[#C5C6C7] hover:text-[#66FCF1] border border-[#45A29E]/30 text-xs transition"
            title="Re-query vector buildings from OpenStreetMap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBuildings ? "animate-spin text-[#66FCF1]" : ""}`} />
            <span className="hidden md:inline">REFETCH</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left/Main Canvas Viewer */}
        <div className="flex-1 flex flex-col min-h-0 p-4 relative overflow-hidden bg-[#07080a] items-center justify-center">
          <div className="relative border border-[#1F2833] rounded-lg shadow-2xl overflow-hidden max-w-full max-h-full flex items-center justify-center bg-[#0B0C10]">
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              className="max-w-full max-h-[calc(100vh-250px)] object-contain cursor-crosshair"
              style={{ imageRendering: "auto" }}
            />

            {/* Hover Tooltip Overlay */}
            {hoveredBuilding && mousePos && (
              <div
                className="absolute z-30 pointer-events-none bg-[#0B0C10]/95 border border-[#66FCF1]/60 rounded-md p-2.5 shadow-2xl backdrop-blur text-xs font-mono max-w-xs transition-transform"
                style={{
                  left: Math.min(mousePos.x + 15, 450),
                  top: Math.max(mousePos.y - 80, 10),
                }}
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#1F2833] pb-1.5 mb-1.5">
                  <span className="font-bold text-white uppercase truncate">
                    {hoveredBuilding.name || hoveredBuilding.subtype}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                      hoveredBuilding.type === "fuel"
                        ? "bg-[#10B981]/20 text-[#34D399] border border-[#10B981]/40"
                        : hoveredBuilding.type === "commercial"
                        ? "bg-[#06B6D4]/20 text-[#66FCF1] border border-[#06B6D4]/40"
                        : "bg-[#1F2833] text-[#C5C6C7]"
                    }`}
                  >
                    {hoveredBuilding.type}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-[#C5C6C7]/60">Height:</span>
                  <span className="text-[#66FCF1] font-semibold">{hoveredBuilding.heightMeters} m ({hoveredBuilding.levels} fl)</span>
                  <span className="text-[#C5C6C7]/60">Footprint:</span>
                  <span className="text-white">{hoveredBuilding.widthMeters}m &times; {hoveredBuilding.depthMeters}m</span>
                  <span className="text-[#C5C6C7]/60">Area:</span>
                  <span className="text-white">{hoveredBuilding.areaSqMeters.toLocaleString()} m&sup2;</span>
                  <span className="text-[#C5C6C7]/60">Coordinates:</span>
                  <span className="text-[#C5C6C7]/80 truncate">
                    {hoveredBuilding.centroid.lat.toFixed(4)}, {hoveredBuilding.centroid.lng.toFixed(4)}
                  </span>
                </div>
              </div>
            )}

            {/* Empty or loading states */}
            {isLoadingBuildings && (
              <div className="absolute inset-0 bg-[#0B0C10]/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20">
                <div className="w-10 h-10 border-2 border-[#45A29E] border-t-[#66FCF1] rounded-full animate-spin" />
                <p className="text-sm font-mono text-[#66FCF1]">Querying OpenStreetMap Buildings &amp; Structures...</p>
                <p className="text-xs text-[#C5C6C7]/60 font-mono">Parsing polygons, elevations, and service landmarks</p>
              </div>
            )}

            {!isLoadingBuildings && count === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center z-10">
                <Building2 className="w-12 h-12 text-[#45A29E]/40" />
                <h3 className="text-sm font-mono text-white">NO RECORDED BUILDINGS IN THIS AOI</h3>
                <p className="text-xs text-[#C5C6C7]/60 max-w-sm">
                  This bounding box appears to be open wilderness, water, or unmapped rural terrain. You can still view roads, splatmaps, and 3D terrain elevation!
                </p>
              </div>
            )}
          </div>

          {/* Quick Legend at bottom of canvas */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[10px] font-mono text-[#C5C6C7]/70">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981]" /> FUEL &amp; SERVICE
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#06B6D4]" /> COMMERCIAL / RETAIL
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#F59E0B]" /> RESIDENTIAL
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#6366F1]" /> INDUSTRIAL / LOGISTICS
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#A855F7]" /> TOWERS &amp; CIVIC
            </span>
          </div>
        </div>

        {/* Right Sidebar: Controls & Export Suite */}
        <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-[#1F2833] bg-[#0E1116] p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
          {/* Mode Selector */}
          <div className="bg-[#111418] p-3 rounded-lg border border-[#1F2833]">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2.5 flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#45A29E]" />
              Display &amp; Export Mode
            </h3>

            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#0B0C10] rounded border border-[#1F2833] text-xs font-mono mb-3">
              <button
                id="btn-mode-category"
                onClick={() => setSettings((s) => ({ ...s, renderMode: "category" }))}
                className={`py-1.5 rounded transition ${
                  settings.renderMode === "category"
                    ? "bg-[#45A29E] text-[#0B0C10] font-bold"
                    : "text-[#C5C6C7]/70 hover:text-white"
                }`}
              >
                CATEGORIES
              </button>
              <button
                id="btn-mode-styled"
                onClick={() => setSettings((s) => ({ ...s, renderMode: "styled" }))}
                className={`py-1.5 rounded transition ${
                  settings.renderMode === "styled"
                    ? "bg-[#45A29E] text-[#0B0C10] font-bold"
                    : "text-[#C5C6C7]/70 hover:text-white"
                }`}
              >
                BLUEPRINT
              </button>
              <button
                id="btn-mode-mask"
                onClick={() => setSettings((s) => ({ ...s, renderMode: "mask" }))}
                className={`py-1.5 rounded transition ${
                  settings.renderMode === "mask"
                    ? "bg-[#45A29E] text-[#0B0C10] font-bold"
                    : "text-[#C5C6C7]/70 hover:text-white"
                }`}
              >
                UE5/UNITY MASK
              </button>
            </div>

            {settings.renderMode === "mask" && (
              <label className="flex items-center gap-2 text-xs font-mono text-[#C5C6C7] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={settings.invertMask}
                  onChange={(e) => setSettings((s) => ({ ...s, invertMask: e.target.checked }))}
                  className="rounded border-[#1F2833] text-[#45A29E] focus:ring-0"
                />
                Invert Mask (Black footprints on White)
              </label>
            )}
          </div>

          {/* Archetype Filters */}
          <div className="bg-[#111418] p-3 rounded-lg border border-[#1F2833]">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2.5 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-[#45A29E]" />
              Structure Categories
            </h3>

            <div className="space-y-2 text-xs font-mono">
              <label className="flex items-center justify-between cursor-pointer hover:text-white">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.showFuelStations}
                    onChange={(e) => setSettings((s) => ({ ...s, showFuelStations: e.target.checked }))}
                    className="rounded border-[#1F2833] text-[#10B981] focus:ring-0"
                  />
                  <span className="flex items-center gap-1.5">
                    <Fuel className="w-3.5 h-3.5 text-[#10B981]" />
                    Gas / Fuel Stations
                  </span>
                </div>
                <span className="text-[#10B981] font-bold">{summary?.fuelStationsCount || 0}</span>
              </label>

              <label className="flex items-center justify-between cursor-pointer hover:text-white">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.showCommercial}
                    onChange={(e) => setSettings((s) => ({ ...s, showCommercial: e.target.checked }))}
                    className="rounded border-[#1F2833] text-[#06B6D4] focus:ring-0"
                  />
                  <span>Commercial &amp; Retail</span>
                </div>
                <span className="text-[#06B6D4]">{summary?.typeBreakdown?.commercial || 0}</span>
              </label>

              <label className="flex items-center justify-between cursor-pointer hover:text-white">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.showResidential}
                    onChange={(e) => setSettings((s) => ({ ...s, showResidential: e.target.checked }))}
                    className="rounded border-[#1F2833] text-[#F59E0B] focus:ring-0"
                  />
                  <span>Residential Houses &amp; Flats</span>
                </div>
                <span className="text-[#F59E0B]">{summary?.typeBreakdown?.residential || 0}</span>
              </label>

              <label className="flex items-center justify-between cursor-pointer hover:text-white">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.showIndustrial}
                    onChange={(e) => setSettings((s) => ({ ...s, showIndustrial: e.target.checked }))}
                    className="rounded border-[#1F2833] text-[#6366F1] focus:ring-0"
                  />
                  <span>Industrial &amp; Logistics</span>
                </div>
                <span className="text-[#6366F1]">{summary?.typeBreakdown?.industrial || 0}</span>
              </label>

              <label className="flex items-center justify-between cursor-pointer hover:text-white">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.showCivicAndTowers}
                    onChange={(e) => setSettings((s) => ({ ...s, showCivicAndTowers: e.target.checked }))}
                    className="rounded border-[#1F2833] text-[#A855F7] focus:ring-0"
                  />
                  <span>Civic &amp; Towers</span>
                </div>
                <span className="text-[#A855F7]">
                  {(summary?.typeBreakdown?.civic || 0) + (summary?.typeBreakdown?.structure || 0)}
                </span>
              </label>

              <label className="flex items-center justify-between cursor-pointer hover:text-white">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.showGarages}
                    onChange={(e) => setSettings((s) => ({ ...s, showGarages: e.target.checked }))}
                    className="rounded border-[#1F2833] text-[#64748B] focus:ring-0"
                  />
                  <span>Garages &amp; Outbuildings</span>
                </div>
                <span className="text-[#64748B]">{summary?.typeBreakdown?.garage || 0}</span>
              </label>
            </div>
          </div>

          {/* Export Resolution */}
          <div className="bg-[#111418] p-3 rounded-lg border border-[#1F2833]">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Mask Resolution</span>
              <span className="text-[11px] font-mono text-[#66FCF1]">{exportRes}&times;{exportRes}</span>
            </h3>
            <div className="grid grid-cols-3 gap-1.5 text-xs font-mono">
              {[1024, 2048, 4096].map((res) => (
                <button
                  key={res}
                  onClick={() => setExportRes(res)}
                  className={`py-1 rounded border transition ${
                    exportRes === res
                      ? "border-[#66FCF1] text-[#66FCF1] bg-[#1F2833]"
                      : "border-[#1F2833] text-[#C5C6C7]/60 hover:text-white"
                  }`}
                >
                  {res >= 2048 ? `${res / 1024}K` : `${res}`}
                </button>
              ))}
            </div>
          </div>

          {/* Export Actions Suite */}
          <div className="bg-[#111418] p-3 rounded-lg border border-[#1F2833] flex flex-col gap-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1 flex items-center gap-2">
              <Download className="w-3.5 h-3.5 text-[#66FCF1]" />
              Export Assets
            </h3>

            {/* Download Mask PNG */}
            <button
              id="btn-download-building-mask"
              onClick={() => handleDownloadPng(settings.renderMode !== "mask")}
              disabled={isExporting || count === 0}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-mono font-bold rounded bg-[#1F2833] hover:bg-[#1F2833]/80 text-[#66FCF1] border border-[#45A29E]/40 transition disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              DOWNLOAD FOOTPRINT MASK (.PNG)
            </button>

            {/* Download GeoJSON */}
            <button
              id="btn-download-building-geojson"
              onClick={handleDownloadGeoJson}
              disabled={count === 0}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-mono rounded bg-[#111418] hover:bg-[#1F2833] text-[#C5C6C7] hover:text-white border border-[#1F2833] transition disabled:opacity-40"
            >
              <FileCode className="w-3.5 h-3.5 text-[#45A29E]" />
              DOWNLOAD GEOJSON (.GEOJSON)
            </button>

            {/* Download CSV */}
            <button
              id="btn-download-building-csv"
              onClick={handleDownloadCsv}
              disabled={count === 0}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-mono rounded bg-[#111418] hover:bg-[#1F2833] text-[#C5C6C7] hover:text-white border border-[#1F2833] transition disabled:opacity-40"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#45A29E]" />
              DOWNLOAD SPAWNER TABLE (.CSV)
            </button>

            {/* Proceed to 3D Mesh with Buildings */}
            <button
              id="btn-proceed-to-3d-buildings"
              onClick={onProceedTo3D}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold rounded bg-gradient-to-r from-[#45A29E] to-[#66FCF1] text-[#0B0C10] uppercase tracking-wider hover:opacity-95 transition shadow-[0_0_12px_rgba(102,252,241,0.25)]"
            >
              <Box className="w-4 h-4 stroke-[2.5]" />
              PROCEED TO 3D MESH &amp; VIEWPORT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
