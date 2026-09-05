import React, { useState } from "react";
import { X, Key, ExternalLink, ShieldCheck, CheckCircle2 } from "lucide-react";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasGoogleKey: boolean;
  clientKey: string;
  setClientKey: (key: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  hasGoogleKey,
  clientKey,
  setClientKey,
}) => {
  const [tempKey, setTempKey] = useState(clientKey);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    setClientKey(tempKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-slate-100 text-base">
              Google Maps Platform Configuration
            </h3>
          </div>
          <button
            id="btn-close-key-modal"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs text-slate-300">
          {/* Status Indicator */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-3 ${
              hasGoogleKey || clientKey
                ? "bg-emerald-950/40 border-emerald-800/80 text-emerald-200"
                : "bg-slate-950 border-slate-800 text-slate-300"
            }`}
          >
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-slate-100">
                {hasGoogleKey || clientKey
                  ? "Google Maps Platform Key Active"
                  : "Using High-Precision Global DEM (Open Topography Fallback)"}
              </p>
              <p className="text-slate-400 mt-0.5 text-[11px]">
                {hasGoogleKey || clientKey
                  ? "Requests to Google Maps Elevation API are enabled and proxied securely through the backend."
                  : "The application is fully functional right now using global high-resolution digital elevation models. You can also connect a Google Maps API Key or free Demo Key below."}
              </p>
            </div>
          </div>

          {/* Key Input Field */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-200 block">
              Google Maps Platform API Key (Optional):
            </label>
            <div className="flex gap-2">
              <input
                id="input-api-key"
                type="password"
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                id="btn-save-key"
                onClick={handleSave}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition"
              >
                Apply
              </button>
            </div>
            {saved && (
              <p className="text-emerald-400 flex items-center gap-1 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Key saved for this session!
              </p>
            )}
          </div>

          {/* Quickstart info for Maps Demo Key */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-slate-200">
              Need a free prototyping key? (No billing required)
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px]">
              <li>
                Visit the{" "}
                <a
                  href="https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 underline hover:text-cyan-300 inline-flex items-center gap-0.5"
                >
                  Maps Demo Key Portal <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>Sign in with your Google Account (no credit card or billing project needed)</li>
              <li>Accept terms and click to generate your demo key</li>
              <li>Paste the generated key above or configure GOOGLE_MAPS_API_KEY in your environment</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950/60 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
