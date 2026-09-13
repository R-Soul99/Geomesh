import React from "react";
import { Mountain, Layers, Box, Key, Compass, Download, ExternalLink, Navigation, Building2 } from "lucide-react";

interface NavbarProps {
  hasGoogleKey: boolean;
  onOpenKeyModal: () => void;
  activeTab: "map" | "heightmap" | "splatmap" | "roads" | "buildings" | "3d";
  setActiveTab: (tab: "map" | "heightmap" | "splatmap" | "roads" | "buildings" | "3d") => void;
  isGenerating: boolean;
  hasData: boolean;
  onQuickExportGlb: () => void;
  onQuickExportPng: () => void;
  elevationActive?: boolean;
  sourceUsed?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  hasGoogleKey,
  onOpenKeyModal,
  activeTab,
  setActiveTab,
  isGenerating,
  hasData,
  onQuickExportGlb,
  onQuickExportPng,
  elevationActive = false,
  sourceUsed,
}) => {
  return (
    <header className="bg-[#0B0C10] border-b border-[#1F2833] text-[#C5C6C7] sticky top-0 z-40 shrink-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 gap-4">
          {/* Logo and title */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-[#66FCF1] to-[#45A29E] flex items-center justify-center shadow-[0_0_12px_rgba(102,252,241,0.25)] shrink-0">
              <Mountain className="w-4 h-4 text-[#0B0C10] stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-white uppercase italic">
                  GeoMesh <span className="text-[#45A29E] not-italic font-mono text-[11px] ml-1">v2.8.4-PRO</span>
                </h1>
                <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono rounded bg-[#1F2833] text-[#66FCF1] border border-[#45A29E]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#66FCF1] shadow-[0_0_6px_#66FCF1]" />
                  16-BIT PNG + GLB
                </span>
              </div>
              <p className="text-[11px] text-[#C5C6C7]/60 hidden sm:block font-mono leading-none mt-0.5">
                TOPOGRAPHIC ELEVATION &bull; RGBA SPLAT MASK &bull; 3D glTF MESH ENGINE
              </p>
            </div>
          </div>

          {/* API status & Standalone */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Google Maps API Status */}
            <button
              id="btn-api-key-modal"
              onClick={onOpenKeyModal}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border font-mono transition-colors ${
                elevationActive
                  ? "bg-[#1F2833] border-[#45A29E]/60 text-[#66FCF1] hover:border-[#66FCF1]"
                  : hasGoogleKey
                  ? "bg-[#1F2833]/80 border-[#45A29E]/40 text-[#66FCF1] hover:border-[#66FCF1]"
                  : "bg-[#111418] border-[#1F2833] text-[#C5C6C7] hover:border-[#45A29E]/40"
              }`}
              title="Elevation Engine &amp; API Configuration"
            >
              <Key className="w-3.5 h-3.5 text-[#45A29E]" />
              <span className="hidden md:inline text-[11px]">
                {elevationActive
                  ? "DEM: GOOGLE_ELEVATION"
                  : sourceUsed === "terrarium" || !sourceUsed
                  ? "DEM: TERRARIUM_30M"
                  : `DEM: ${sourceUsed.toUpperCase()}`}
              </span>
            </button>

            {/* Open in Standalone Tab button */}
            <a
              id="btn-open-standalone"
              href={typeof window !== "undefined" ? window.location.href : "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-[#1F2833] bg-[#111418] hover:border-[#45A29E]/50 text-[#C5C6C7] hover:text-[#66FCF1] font-mono transition"
              title="Open app in a full browser window (unlocks GPS access &amp; full WebGL canvas)"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#45A29E]" />
              <span className="text-[11px]">STANDALONE</span>
            </a>
          </div>

          {/* Quick Export actions */}
          {hasData && (
            <div className="hidden lg:flex items-center gap-2">
              <button
                id="btn-quick-png"
                onClick={onQuickExportPng}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded bg-[#1F2833] hover:bg-[#1F2833]/80 text-[#66FCF1] border border-[#45A29E]/40 transition"
              >
                <Download className="w-3.5 h-3.5 text-[#66FCF1]" />
                16-BIT PNG
              </button>
              <button
                id="btn-quick-glb"
                onClick={onQuickExportGlb}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded bg-[#45A29E] hover:bg-[#66FCF1] text-[#0B0C10] uppercase tracking-wider transition-colors shadow-[0_0_10px_rgba(69,162,158,0.3)]"
              >
                <Box className="w-3.5 h-3.5 stroke-[2.5]" />
                EXPORT .GLB
              </button>
            </div>
          )}
        </div>

        {/* High Density View Mode Navigation Tabs */}
        <div className="flex border-t border-[#1F2833] -mb-px overflow-x-auto text-[11px] font-mono uppercase tracking-wider">
          <button
            id="tab-map"
            onClick={() => setActiveTab("map")}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors shrink-0 ${
              activeTab === "map"
                ? "border-[#66FCF1] text-[#66FCF1] bg-[#1F2833]/60 font-semibold"
                : "border-transparent text-[#C5C6C7]/60 hover:text-white hover:border-[#1F2833]"
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-[#45A29E]" />
            01_BOUNDING_BOX &bull; REGION
          </button>
          <button
            id="tab-heightmap"
            onClick={() => setActiveTab("heightmap")}
            disabled={!hasData && !isGenerating}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors shrink-0 ${
              activeTab === "heightmap"
                ? "border-[#66FCF1] text-[#66FCF1] bg-[#1F2833]/60 font-semibold"
                : "border-transparent text-[#C5C6C7]/60 hover:text-white hover:border-[#1F2833]"
            } ${!hasData && !isGenerating ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <Mountain className="w-3.5 h-3.5 text-[#45A29E]" />
            02_HEIGHTMAP &bull; 16-BIT
          </button>
          <button
            id="tab-splatmap"
            onClick={() => setActiveTab("splatmap")}
            disabled={!hasData && !isGenerating}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors shrink-0 ${
              activeTab === "splatmap"
                ? "border-[#66FCF1] text-[#66FCF1] bg-[#1F2833]/60 font-semibold"
                : "border-transparent text-[#C5C6C7]/60 hover:text-white hover:border-[#1F2833]"
            } ${!hasData && !isGenerating ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <Layers className="w-3.5 h-3.5 text-[#45A29E]" />
            03_SPLAT_MASK &bull; RGBA
          </button>
          <button
            id="tab-roads"
            onClick={() => setActiveTab("roads")}
            disabled={!hasData && !isGenerating}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors shrink-0 ${
              activeTab === "roads"
                ? "border-[#66FCF1] text-[#66FCF1] bg-[#1F2833]/60 font-semibold"
                : "border-transparent text-[#C5C6C7]/60 hover:text-white hover:border-[#1F2833]"
            } ${!hasData && !isGenerating ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <Navigation className="w-3.5 h-3.5 text-[#45A29E]" />
            04_ROAD_NETWORK &bull; MASK
          </button>
          <button
            id="tab-buildings"
            onClick={() => setActiveTab("buildings")}
            disabled={!hasData && !isGenerating}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors shrink-0 ${
              activeTab === "buildings"
                ? "border-[#66FCF1] text-[#66FCF1] bg-[#1F2833]/60 font-semibold"
                : "border-transparent text-[#C5C6C7]/60 hover:text-white hover:border-[#1F2833]"
            } ${!hasData && !isGenerating ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <Building2 className="w-3.5 h-3.5 text-[#45A29E]" />
            05_STRUCTURES &bull; BUILDINGS
          </button>
          <button
            id="tab-3d"
            onClick={() => setActiveTab("3d")}
            disabled={!hasData && !isGenerating}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors shrink-0 ${
              activeTab === "3d"
                ? "border-[#66FCF1] text-[#66FCF1] bg-[#1F2833]/60 font-semibold"
                : "border-transparent text-[#C5C6C7]/60 hover:text-white hover:border-[#1F2833]"
            } ${!hasData && !isGenerating ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <Box className="w-3.5 h-3.5 text-[#45A29E]" />
            06_3D_MESH &bull; GLTF (.GLB)
          </button>
        </div>
      </div>
    </header>
  );
};
