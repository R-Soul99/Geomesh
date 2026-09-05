import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  Layers,
  Sliders,
  Sparkles,
  Mountain,
  Eye,
  Box,
  Check,
} from "lucide-react";
import { ElevationGridData, SplatSettings } from "../types";
import { calculateSlopeGrid } from "../utils/pngEncoder";
import { generateSplatMap, SplatChannels, imageDataToPngBlob } from "../utils/splatGenerator";

interface SplatmapViewerProps {
  data: ElevationGridData;
  settings: SplatSettings;
  onChangeSettings: (settings: SplatSettings) => void;
  onProceedTo3D: () => void;
  areaKilometers: number;
}

export const SplatmapViewer: React.FC<SplatmapViewerProps> = ({
  data,
  settings,
  onChangeSettings,
  onProceedTo3D,
  areaKilometers,
}) => {
  const [activeChannel, setActiveChannel] = useState<"rgba" | "rock" | "grass" | "dirt" | "snow">("rgba");
  const [isExporting, setIsExporting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const splatChannelsRef = useRef<SplatChannels | null>(null);

  // Compute slopes across grid in degrees
  const slopeGrid = React.useMemo(() => {
    const metersPerPixel = (areaKilometers * 1000) / data.resolution;
    return calculateSlopeGrid(data.elevations, data.resolution, data.resolution, metersPerPixel);
  }, [data.elevations, data.resolution, areaKilometers]);

  // Compute splat channels
  const channels = React.useMemo(() => {
    return generateSplatMap(
      data.elevations,
      slopeGrid,
      data.resolution,
      data.resolution,
      data.minElevation,
      data.maxElevation,
      settings
    );
  }, [data, slopeGrid, settings]);

  useEffect(() => {
    splatChannelsRef.current = channels;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = data.resolution;
    canvas.height = data.resolution;

    let targetImgData = channels.rgbaImageData;
    if (activeChannel === "rock") targetImgData = channels.rockChannelData;
    else if (activeChannel === "grass") targetImgData = channels.grassChannelData;
    else if (activeChannel === "dirt") targetImgData = channels.dirtChannelData;
    else if (activeChannel === "snow") targetImgData = channels.snowChannelData;

    ctx.putImageData(targetImgData, 0, 0);
  }, [channels, activeChannel, data.resolution]);

  // Download Splat Map PNG
  const handleDownloadSplatMap = async (mode: "composite" | "channel") => {
    try {
      setIsExporting(true);
      if (!splatChannelsRef.current) return;

      let targetImg = splatChannelsRef.current.rgbaImageData;
      let filename = `splatmap_RGBA_${data.resolution}x${data.resolution}.png`;

      if (mode === "channel") {
        if (activeChannel === "rock") {
          targetImg = splatChannelsRef.current.rockChannelData;
          filename = `mask_rock_R_${data.resolution}x${data.resolution}.png`;
        } else if (activeChannel === "grass") {
          targetImg = splatChannelsRef.current.grassChannelData;
          filename = `mask_grass_G_${data.resolution}x${data.resolution}.png`;
        } else if (activeChannel === "dirt") {
          targetImg = splatChannelsRef.current.dirtChannelData;
          filename = `mask_dirt_B_${data.resolution}x${data.resolution}.png`;
        } else if (activeChannel === "snow") {
          targetImg = splatChannelsRef.current.snowChannelData;
          filename = `mask_snow_A_${data.resolution}x${data.resolution}.png`;
        }
      }

      const blob = await imageDataToPngBlob(targetImg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Failed to export Splat Map: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Left 2 Cols: Splat Map Canvas */}
      <div className="lg:col-span-2 space-y-3">
        {/* Channel Selector Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center rounded bg-[#111418] border border-[#1F2833] p-1 flex-wrap font-mono text-[11px]">
            <button
              id="btn-chan-rgba"
              onClick={() => setActiveChannel("rgba")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider flex items-center gap-1.5 ${
                activeChannel === "rgba"
                  ? "bg-[#45A29E] text-[#0B0C10] font-bold"
                  : "text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              <Layers className="w-3 h-3" />
              COMPOSITE [RGBA]
            </button>
            <button
              id="btn-chan-rock"
              onClick={() => setActiveChannel("rock")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider flex items-center gap-1.5 ${
                activeChannel === "rock"
                  ? "bg-rose-950 border border-rose-500 text-rose-300 font-bold"
                  : "text-rose-400/80 hover:text-rose-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              R: CLIFFS
            </button>
            <button
              id="btn-chan-grass"
              onClick={() => setActiveChannel("grass")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider flex items-center gap-1.5 ${
                activeChannel === "grass"
                  ? "bg-emerald-950 border border-emerald-500 text-emerald-300 font-bold"
                  : "text-emerald-400/80 hover:text-emerald-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              G: GRASS
            </button>
            <button
              id="btn-chan-dirt"
              onClick={() => setActiveChannel("dirt")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider flex items-center gap-1.5 ${
                activeChannel === "dirt"
                  ? "bg-amber-950 border border-amber-500 text-amber-300 font-bold"
                  : "text-amber-400/80 hover:text-amber-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              B: DIRT
            </button>
            <button
              id="btn-chan-snow"
              onClick={() => setActiveChannel("snow")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider flex items-center gap-1.5 ${
                activeChannel === "snow"
                  ? "bg-cyan-950 border border-cyan-400 text-cyan-200 font-bold"
                  : "text-cyan-400/80 hover:text-cyan-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-white" />
              A: SNOW
            </button>
          </div>

          <span className="text-[11px] text-[#45A29E] font-mono uppercase">
            {activeChannel === "rgba" ? "4-LAYER RGBA MASK" : `CH: ${activeChannel.toUpperCase()}`}
          </span>
        </div>

        {/* Viewport Canvas Frame */}
        <div className="relative rounded-lg border border-[#1F2833] bg-[#0B0C10] overflow-hidden shadow-2xl flex items-center justify-center p-4">
          <canvas
            ref={canvasRef}
            className="w-full max-w-lg aspect-square object-contain rounded border border-[#1F2833] shadow-inner [image-rendering:pixelated]"
            title="Splat / Mask Map Canvas"
          />

          {/* Splat Channel Color Legend Pill */}
          <div className="absolute bottom-4 left-4 px-2.5 py-1 bg-[#0B0C10]/90 border border-[#1F2833] rounded text-[10px] font-mono backdrop-blur-sm flex items-center gap-2.5">
            <span className="flex items-center gap-1 text-rose-300 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> R: CLIFF
            </span>
            <span className="flex items-center gap-1 text-emerald-300 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> G: GRASS
            </span>
            <span className="flex items-center gap-1 text-amber-300 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> B: DIRT
            </span>
            <span className="flex items-center gap-1 text-slate-100 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-white" /> A: SNOW
            </span>
          </div>
        </div>

        {/* Informational Explanation Note */}
        <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-3 text-xs font-mono text-[#C5C6C7]/70 space-y-1">
          <p className="font-bold text-[10px] text-[#45A29E] uppercase tracking-wider">
            GAME ENGINE PBR WEIGHT BLENDING:
          </p>
          <p className="text-[11px] leading-relaxed">
            In Unreal Engine (Landscape Material), Unity (Terrain Layer), and Blender (Mix Shader), this 4-channel RGBA mask drives physical texture weights: Red applies rock to steep slopes, Green covers valleys with grass, Blue maps scree/dirt in transitions, and Alpha paints glacial snow peaks.
          </p>
        </div>
      </div>

      {/* Right Col: Layer Threshold Controls */}
      <div className="space-y-4">
        <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#1F2833] pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#45A29E]" />
              LAYER BLEND THRESHOLDS
            </h3>
            <span className="text-[10px] font-mono text-[#45A29E]">CH_03</span>
          </div>

          {/* Cliff Angle Threshold (Slope) */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="flex items-center gap-1.5 text-rose-300">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                CLIFF ROCK SLOPE
              </span>
              <span className="text-rose-400 font-bold">
                &gt; {settings.cliffAngleThreshold}°
              </span>
            </div>
            <input
              id="slider-cliff-angle"
              type="range"
              min={15}
              max={65}
              step={1}
              value={settings.cliffAngleThreshold}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  cliffAngleThreshold: Number(e.target.value),
                })
              }
              className="w-full accent-rose-500 cursor-pointer"
            />
            <p className="text-[10px] font-mono text-[#C5C6C7]/50">
              Slopes steeper than this angle receive rock and cliff texturing.
            </p>
          </div>

          {/* Snowline Elevation Threshold */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="flex items-center gap-1.5 text-cyan-300">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                ALPINE SNOWLINE ALTITUDE
              </span>
              <span className="text-cyan-400 font-bold">
                {Math.round(settings.snowLineElevationPct * 100)}% (
                {Math.round(
                  data.minElevation +
                    settings.snowLineElevationPct * (data.maxElevation - data.minElevation)
                )}{" "}
                M)
              </span>
            </div>
            <input
              id="slider-snowline"
              type="range"
              min={0.4}
              max={0.95}
              step={0.02}
              value={settings.snowLineElevationPct}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  snowLineElevationPct: Number(e.target.value),
                })
              }
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-[10px] font-mono text-[#C5C6C7]/50">
              Elevations above this altitude accumulate alpine snow and glacial ice.
            </p>
          </div>

          {/* Beach / Dirt Level */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                BASE DIRT / BEACH
              </span>
              <span className="text-amber-400 font-bold">
                {Math.round(settings.beachElevationPct * 100)}%
              </span>
            </div>
            <input
              id="slider-beach"
              type="range"
              min={0.02}
              max={0.3}
              step={0.01}
              value={settings.beachElevationPct}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  beachElevationPct: Number(e.target.value),
                })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Organic Noise Perturbation */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#C5C6C7]">ORGANIC BLEND NOISE</span>
              <span className="text-[#66FCF1] font-bold">
                {Math.round(settings.noiseIntensity * 100)}%
              </span>
            </div>
            <input
              id="slider-noise"
              type="range"
              min={0}
              max={0.4}
              step={0.02}
              value={settings.noiseIntensity}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  noiseIntensity: Number(e.target.value),
                })
              }
              className="w-full accent-[#45A29E] cursor-pointer"
            />
            <p className="text-[10px] font-mono text-[#C5C6C7]/50">
              Disrupts linear transitions with natural procedural noise variations.
            </p>
          </div>

          {/* Download Buttons */}
          <div className="space-y-2 pt-3 border-t border-[#1F2833]">
            <button
              id="btn-download-splat-rgba"
              onClick={() => handleDownloadSplatMap("composite")}
              disabled={isExporting}
              className="w-full py-2.5 px-3 bg-[#45A29E] hover:bg-[#66FCF1] text-[#0B0C10] rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(69,162,158,0.3)] transition"
            >
              <Download className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>DOWNLOAD SPLAT MAP PNG (RGBA)</span>
            </button>

            {activeChannel !== "rgba" && (
              <button
                id="btn-download-single-channel"
                onClick={() => handleDownloadSplatMap("channel")}
                className="w-full py-2 px-3 bg-[#1F2833] hover:bg-[#1F2833]/80 border border-[#45A29E]/30 text-white rounded text-xs font-mono flex items-center justify-center gap-2 transition"
              >
                <Download className="w-3.5 h-3.5 text-[#66FCF1]" />
                <span>DOWNLOAD {activeChannel.toUpperCase()} MASK (PNG)</span>
              </button>
            )}
          </div>

          {/* Proceed to 3D Viewer */}
          <button
            id="btn-next-3d"
            onClick={onProceedTo3D}
            className="w-full py-2 px-4 bg-[#111418] hover:bg-[#1F2833] border border-[#45A29E]/40 text-[#66FCF1] text-xs font-mono rounded flex items-center justify-center gap-2 transition"
          >
            <span>NEXT: VIEW 3D MESH &amp; EXPORT GLTF (.GLB)</span>
            <Box className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
