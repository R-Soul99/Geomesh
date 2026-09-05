import React, { useState, useEffect } from "react";
import { X, Eye, Compass, MapPin, ExternalLink } from "lucide-react";
import { Coordinates } from "../types";

interface StreetViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  center: Coordinates;
  hasGoogleKey: boolean;
}

export const StreetViewModal: React.FC<StreetViewModalProps> = ({
  isOpen,
  onClose,
  center,
  hasGoogleKey,
}) => {
  const [heading, setHeading] = useState(0);
  const [pitch, setPitch] = useState(10);
  const [fov, setFov] = useState(90);

  if (!isOpen) return null;

  // Static Street View preview URL if key is present or fallback
  const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=640x360&location=${center.lat},${center.lng}&heading=${heading}&pitch=${pitch}&fov=${fov}&key=${
    // will use proxy or direct if key provided
    "DEMO_KEY"
  }&solution_id=gmp_mcp_codeassist_v1_aistudio`;

  const googleMapsUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${center.lat},${center.lng}&heading=${heading}&pitch=${pitch}&fov=${fov}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-slate-100 text-base">
              Street View Panorama Vantage Point
            </h3>
          </div>
          <button
            id="btn-close-streetview"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-mono text-emerald-400">
              <MapPin className="w-3.5 h-3.5" />
              Target Location: {center.lat.toFixed(5)}°, {center.lng.toFixed(5)}°
            </span>
            <span>Ground-level 360° Perspective</span>
          </div>

          {/* Panorama View Frame */}
          <div className="relative rounded-xl border border-slate-800 bg-slate-950 overflow-hidden aspect-video flex items-center justify-center">
            {/* Simulating or embedding Street View */}
            <div className="text-center p-6 space-y-3">
              <Compass className="w-10 h-10 text-cyan-400 mx-auto animate-pulse" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-200">
                  Street View Inspection at {center.lat.toFixed(4)}°, {center.lng.toFixed(4)}°
                </p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Examine ground level, canyon rims, mountain trails, and surrounding skyline before capturing the topographic elevation bounding box.
                </p>
              </div>

              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition"
              >
                <span>Launch Interactive 360° Street View</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Heading and Pitch Slider */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Camera Heading</span>
                <span className="font-mono text-emerald-400">{heading}°</span>
              </div>
              <input
                type="range"
                min={0}
                max={360}
                value={heading}
                onChange={(e) => setHeading(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Camera Pitch</span>
                <span className="font-mono text-emerald-400">{pitch}°</span>
              </div>
              <input
                type="range"
                min={-30}
                max={60}
                value={pitch}
                onChange={(e) => setPitch(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950/60 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
