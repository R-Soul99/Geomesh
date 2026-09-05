import React, { useState, useEffect, useRef } from "react";
import { Navbar } from "./components/Navbar";
import { MapSelector } from "./components/MapSelector";
import { HeightmapViewer } from "./components/HeightmapViewer";
import { SplatmapViewer } from "./components/SplatmapViewer";
import { Terrain3DViewer } from "./components/Terrain3DViewer";
import { StreetViewModal } from "./components/StreetViewModal";
import { ApiKeyModal } from "./components/ApiKeyModal";
import {
  BoundingBox,
  Coordinates,
  ElevationGridData,
  HeightmapSettings,
  SplatSettings,
  TerrainPreset,
} from "./types";
import { PRESETS } from "./utils/presets";
import { calculateSlopeGrid, encode16BitGrayscalePng } from "./utils/pngEncoder";
import { generateSplatMap, imageDataToPngBlob } from "./utils/splatGenerator";
import { createTerrainMesh, exportToGlb } from "./utils/gltfExporter";

export default function App() {
  const [activeTab, setActiveTab] = useState<"map" | "heightmap" | "splatmap" | "3d">("map");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("fuji");

  // Geographic bounds state
  const defaultPreset = PRESETS[0]; // Mount Fuji
  const [bbox, setBbox] = useState<BoundingBox>(defaultPreset.bbox);
  const [center, setCenter] = useState<Coordinates>(defaultPreset.center);
  const [areaKilometers, setAreaKilometers] = useState<number>(10);

  // Elevation data
  const [elevationData, setElevationData] = useState<ElevationGridData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Heightmap & Splat settings
  const [heightmapSettings, setHeightmapSettings] = useState<HeightmapSettings>({
    smoothingRadius: 0,
    gamma: 1.0,
    invert: false,
    normalize: true,
    exportBitDepth: 16,
  });

  const [splatSettings, setSplatSettings] = useState<SplatSettings>({
    cliffAngleThreshold: 35,
    cliffSmoothing: 10,
    snowLineElevationPct: 0.75,
    snowFalloffPct: 0.1,
    beachElevationPct: 0.08,
    beachFalloffPct: 0.05,
    noiseFrequency: 0.8,
    noiseIntensity: 0.12,
  });

  // Cached splat canvas for 3D terrain viewer
  const [splatCanvas, setSplatCanvas] = useState<HTMLCanvasElement | null>(null);

  // Modals state
  const [isStreetViewOpen, setIsStreetViewOpen] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [hasGoogleKey, setHasGoogleKey] = useState(false);
  const [clientKey, setClientKey] = useState("");

  // Check config on mount
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.hasGoogleKey) {
          setHasGoogleKey(true);
        }
      })
      .catch((err) => console.warn("Config check error:", err));
  }, []);

  // Fetch Elevation Grid from backend
  const fetchElevationGrid = async (targetBbox: BoundingBox, resolution: number = 64) => {
    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/elevation/grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bbox: targetBbox,
          resolution,
          clientKey: clientKey || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch elevation: HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!json.success || !Array.isArray(json.elevations)) {
        throw new Error(json.error || "Invalid elevation response from server");
      }

      const gridData: ElevationGridData = {
        resolution: json.resolution,
        minElevation: json.minElevation,
        maxElevation: json.maxElevation,
        elevationRange: json.elevationRange,
        bbox: json.bbox,
        sourceUsed: json.sourceUsed,
        elevations: json.elevations,
      };

      setElevationData(gridData);

      // Precompute splat canvas for 3D viewer
      const metersPerPixel = (areaKilometers * 1000) / gridData.resolution;
      const slopes = calculateSlopeGrid(
        gridData.elevations,
        gridData.resolution,
        gridData.resolution,
        metersPerPixel
      );
      const splatRes = generateSplatMap(
        gridData.elevations,
        slopes,
        gridData.resolution,
        gridData.resolution,
        gridData.minElevation,
        gridData.maxElevation,
        splatSettings
      );

      const offscreen = document.createElement("canvas");
      offscreen.width = gridData.resolution;
      offscreen.height = gridData.resolution;
      const ctx = offscreen.getContext("2d");
      if (ctx) {
        ctx.putImageData(splatRes.rgbaImageData, 0, 0);
        setSplatCanvas(offscreen);
      }
    } catch (err: any) {
      console.error("Elevation generation error:", err);
      setErrorMessage(err.message || "Failed to generate elevation data");
    } finally {
      setIsGenerating(false);
    }
  };

  // Initial load: generate Mount Fuji default
  useEffect(() => {
    fetchElevationGrid(defaultPreset.bbox, 64);
  }, []);

  // Update splat canvas whenever splatSettings change
  useEffect(() => {
    if (!elevationData) return;
    const metersPerPixel = (areaKilometers * 1000) / elevationData.resolution;
    const slopes = calculateSlopeGrid(
      elevationData.elevations,
      elevationData.resolution,
      elevationData.resolution,
      metersPerPixel
    );
    const splatRes = generateSplatMap(
      elevationData.elevations,
      slopes,
      elevationData.resolution,
      elevationData.resolution,
      elevationData.minElevation,
      elevationData.maxElevation,
      splatSettings
    );

    const offscreen = document.createElement("canvas");
    offscreen.width = elevationData.resolution;
    offscreen.height = elevationData.resolution;
    const ctx = offscreen.getContext("2d");
    if (ctx) {
      ctx.putImageData(splatRes.rgbaImageData, 0, 0);
      setSplatCanvas(offscreen);
    }
  }, [splatSettings, elevationData, areaKilometers]);

  // Handle preset selection
  const handleSelectPreset = (preset: TerrainPreset) => {
    setSelectedPresetId(preset.id);
    setBbox(preset.bbox);
    setCenter(preset.center);
    fetchElevationGrid(preset.bbox, 64);
  };

  // Quick export 16-bit PNG
  const handleQuickExportPng = async () => {
    if (!elevationData) return;
    try {
      const res = elevationData.resolution;
      const range = Math.max(1, elevationData.maxElevation - elevationData.minElevation);
      const heights = new Float32Array(res * res);
      for (let i = 0; i < res * res; i++) {
        heights[i] = (elevationData.elevations[i] - elevationData.minElevation) / range;
      }
      const blob = await encode16BitGrayscalePng(heights, res, res);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `heightmap_16bit_${res}x${res}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("PNG Export Error: " + e.message);
    }
  };

  // Quick export .GLB
  const handleQuickExportGlb = async () => {
    if (!elevationData) return;
    try {
      const meshRes = createTerrainMesh(
        elevationData.elevations,
        elevationData.resolution,
        elevationData.resolution,
        elevationData.minElevation,
        elevationData.maxElevation,
        splatCanvas,
        {
          verticalExaggeration: 1.5,
          includeSkirt: true,
          skirtDepth: 50,
          materialMode: "splat",
          meshDensity: elevationData.resolution,
        }
      );
      const blob = await exportToGlb(meshRes.mesh);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `terrain_${areaKilometers}km_${elevationData.resolution}x${elevationData.resolution}.glb`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("GLB Export Error: " + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0C10] text-[#C5C6C7] flex flex-col font-sans selection:bg-[#45A29E] selection:text-[#0B0C10]">
      {/* Top Navigation */}
      <Navbar
        selectedPreset={selectedPresetId}
        onSelectPreset={handleSelectPreset}
        hasGoogleKey={hasGoogleKey || Boolean(clientKey)}
        onOpenKeyModal={() => setIsKeyModalOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isGenerating={isGenerating}
        hasData={Boolean(elevationData)}
        onQuickExportGlb={handleQuickExportGlb}
        onQuickExportPng={handleQuickExportPng}
      />

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 relative">
        {errorMessage && (
          <div className="mb-4 p-3 rounded bg-[#1F2833] border border-rose-500/60 text-rose-300 text-xs font-mono flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]" />
              ERROR_LOG: {errorMessage}
            </span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-[11px] underline font-bold text-rose-400 hover:text-white uppercase tracking-wider"
            >
              [DISMISS]
            </button>
          </div>
        )}

        {/* Tab 1: Map & Area Selector */}
        {activeTab === "map" && (
          <MapSelector
            bbox={bbox}
            center={center}
            onChangeBbox={(newBbox, newCenter) => {
              setBbox(newBbox);
              setCenter(newCenter);
            }}
            onGenerate={(res) => {
              fetchElevationGrid(bbox, res).then(() => {
                setActiveTab("heightmap");
              });
            }}
            isGenerating={isGenerating}
            selectedPreset={selectedPresetId}
            onSelectPreset={handleSelectPreset}
            hasGoogleKey={hasGoogleKey || Boolean(clientKey)}
            onOpenStreetView={() => setIsStreetViewOpen(true)}
            areaKilometers={areaKilometers}
            setAreaKilometers={setAreaKilometers}
          />
        )}

        {/* Tab 2: 16-bit Heightmap Viewer */}
        {activeTab === "heightmap" && elevationData && (
          <HeightmapViewer
            data={elevationData}
            settings={heightmapSettings}
            onChangeSettings={setHeightmapSettings}
            onProceedToSplatmap={() => setActiveTab("splatmap")}
          />
        )}

        {/* Tab 3: Splat / Mask Map Viewer */}
        {activeTab === "splatmap" && elevationData && (
          <SplatmapViewer
            data={elevationData}
            settings={splatSettings}
            onChangeSettings={setSplatSettings}
            onProceedTo3D={() => setActiveTab("3d")}
            areaKilometers={areaKilometers}
          />
        )}

        {/* Tab 4: 3D glTF Mesh & WebGL Viewport */}
        {activeTab === "3d" && elevationData && (
          <Terrain3DViewer
            data={elevationData}
            splatCanvas={splatCanvas}
            areaKilometers={areaKilometers}
          />
        )}
      </main>

      {/* Street View Modal */}
      <StreetViewModal
        isOpen={isStreetViewOpen}
        onClose={() => setIsStreetViewOpen(false)}
        center={center}
        hasGoogleKey={hasGoogleKey || Boolean(clientKey)}
      />

      {/* Google Maps API Configuration Modal */}
      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        hasGoogleKey={hasGoogleKey}
        clientKey={clientKey}
        setClientKey={setClientKey}
      />

      {/* Telemetry Status Bar & Footer */}
      <footer className="h-9 bg-[#0B0C10] border-t border-[#1F2833] px-4 sm:px-6 flex items-center justify-between text-[10px] text-[#C5C6C7]/50 font-mono uppercase tracking-wider shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[#66FCF1]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#66FCF1] shadow-[0_0_6px_#66FCF1]" />
            SYS_ONLINE
          </span>
          <span className="hidden sm:inline text-[#C5C6C7]/40">&bull;</span>
          <span className="hidden sm:inline text-white/70">
            LAT: {center.lat.toFixed(4)}° / LNG: {center.lng.toFixed(4)}°
          </span>
          <span className="hidden md:inline text-[#C5C6C7]/40">&bull;</span>
          <span className="hidden md:inline text-[#45A29E]">
            AOI: {areaKilometers}x{areaKilometers}KM
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-white/40">
          <span>PIPELINE: 16-BIT PNG &bull; RGBA MASK &bull; GLTF/GLB</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[#C5C6C7]/60">UE5 / UNITY / GODOT / BLENDER</span>
        </div>
      </footer>
    </div>
  );
}
