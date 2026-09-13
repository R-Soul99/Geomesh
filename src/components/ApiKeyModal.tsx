import React, { useState, useEffect } from "react";
import {
  X,
  Key,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Check,
  HelpCircle,
  Sparkles,
  AlertTriangle,
} from "lucide-react";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasGoogleKey: boolean;
  clientKey: string;
  setClientKey: (key: string) => void;
  elevationActive: boolean;
  setElevationActive: (active: boolean) => void;
  elevationErrorMessage?: string;
  setElevationErrorMessage: (msg: string | null) => void;
  onKeyVerified?: (key: string, isElevationActive: boolean) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  hasGoogleKey,
  clientKey,
  setClientKey,
  elevationActive,
  setElevationActive,
  elevationErrorMessage,
  setElevationErrorMessage,
  onKeyVerified,
}) => {
  const [tempKey, setTempKey] = useState(clientKey);
  const [showKeyText, setShowKeyText] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: "idle" | "success" | "error";
    message: string;
    details?: string;
  }>({ status: "idle", message: "" });

  useEffect(() => {
    setTempKey(clientKey);
    setTestResult({ status: "idle", message: "" });
  }, [clientKey, isOpen]);

  if (!isOpen) return null;

  // Test the key live with backend proxy
  const handleTestAndApply = async (keyToTest: string) => {
    const trimmed = keyToTest.trim();
    setIsTesting(true);
    setTestResult({ status: "idle", message: "Connecting to Google Maps Elevation API..." });

    try {
      const res = await fetch("/api/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: trimmed, forceFresh: true }),
      });

      const data = await res.json();

      if (data.elevationActive) {
        setElevationActive(true);
        setElevationErrorMessage(null);
        setClientKey(trimmed);
        if (onKeyVerified) onKeyVerified(trimmed, true);

        setTestResult({
          status: "success",
          message: "Elevation API verified active! Google Elevation is now applied.",
        });
      } else {
        setElevationActive(false);
        const errMsg = data.elevationErrorMessage || "Elevation API returned REQUEST_DENIED.";
        setElevationErrorMessage(errMsg);

        setTestResult({
          status: "error",
          message: "API Key responded, but Elevation API is not active on its project.",
          details: errMsg,
        });
      }
    } catch (err: any) {
      setTestResult({
        status: "error",
        message: "Network test failed: " + (err.message || "Unknown error"),
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Quick re-test of current key
  const handleRecheckCurrent = () => {
    handleTestAndApply(tempKey || clientKey);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in font-mono">
      <div className="bg-[#111418] border border-[#1F2833] rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1F2833] bg-[#0B0C10] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-[#1F2833] text-[#66FCF1]">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm tracking-wide">
                APPLY GOOGLE ELEVATION API
              </h3>
              <p className="text-[10px] text-[#C5C6C7]/60">
                Google Cloud Platform Credentials &amp; Elevation Engine Link
              </p>
            </div>
          </div>
          <button
            id="btn-close-key-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#C5C6C7]/60 hover:text-white hover:bg-[#1F2833] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto text-xs text-[#C5C6C7] flex-1">
          {/* Status Indicator Card */}
          {elevationActive ? (
            <div className="p-4 rounded-xl border flex items-start gap-3.5 bg-emerald-950/40 border-emerald-700/80 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
              <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-sm text-white flex items-center gap-2">
                  <span>Google Elevation API Active &amp; Applied</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                    ONLINE
                  </span>
                </p>
                <p className="text-emerald-300/80 text-[11px] leading-relaxed">
                  Your Google Maps Platform key is active and authorized for the Elevation API. Heightmap calculations are querying high-precision Google topographical survey points.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border flex items-start gap-3.5 bg-[#1F2833]/70 border-[#45A29E]/50 text-[#C5C6C7]">
              <AlertCircle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sm text-white">
                    Elevation API Enabled in Cloud Console? Here is how to apply it:
                  </p>
                </div>
                <p className="text-[#C5C6C7]/90 text-[11px] leading-relaxed">
                  Enabling the API in Google Cloud Console activates it for your Google Cloud project. To link it to this web app, you must apply the <strong className="text-white">API Key</strong> from that same project below.
                </p>
                <div className="p-2.5 rounded bg-[#0B0C10] border border-[#1F2833] text-[10px] space-y-1">
                  <p className="text-[#66FCF1] font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#66FCF1] animate-pulse" />
                    Currently Running: Terrarium 30m Global DEM (NASA SRTM &amp; Copernicus)
                  </p>
                  <p className="text-[#C5C6C7]/60">
                    Your 3D viewer is 100% operational right now using global satellite LiDAR elevation data.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 3-Step Guide: How to Apply your Key */}
          <div className="bg-[#0B0C10] border border-[#1F2833] rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-[#66FCF1] text-[11px] uppercase tracking-wider flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#66FCF1]" />
              How to Connect Your Enabled Elevation API in 3 Steps:
            </h4>
            <div className="space-y-2.5 text-[11px] text-[#C5C6C7]/80">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#1F2833] text-[#66FCF1] font-bold flex items-center justify-center shrink-0 text-[10px]">
                  1
                </span>
                <p>
                  <strong className="text-white">Check Project Alignment:</strong> In{" "}
                  <a
                    href="https://console.cloud.google.com/apis/library/elevation-backend.googleapis.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#66FCF1] underline hover:text-white inline-flex items-center gap-0.5 font-bold"
                  >
                    Google Cloud Console <ExternalLink className="w-3 h-3" />
                  </a>
                  , ensure the project selected in the top navigation bar is the one where you enabled the Elevation API.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#1F2833] text-[#66FCF1] font-bold flex items-center justify-center shrink-0 text-[10px]">
                  2
                </span>
                <p>
                  <strong className="text-white">Copy Your API Key:</strong> Navigate to{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#66FCF1] underline hover:text-white inline-flex items-center gap-0.5 font-bold"
                  >
                    APIs &amp; Services &gt; Credentials <ExternalLink className="w-3 h-3" />
                  </a>{" "}
                  and copy your API key (starts with <code className="text-white bg-[#1F2833] px-1 py-0.5 rounded">AIzaSy...</code>).
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#1F2833] text-[#66FCF1] font-bold flex items-center justify-center shrink-0 text-[10px]">
                  3
                </span>
                <p>
                  <strong className="text-white">Paste &amp; Click Test:</strong> Paste your API Key into the field below and click <strong className="text-[#66FCF1]">Test &amp; Apply Key</strong>. The app will immediately verify the connection and activate Google Elevation.
                </p>
              </div>
            </div>
          </div>

          {/* Key Input Field & Live Verification */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-white block text-[11px] uppercase tracking-wider">
                Custom Google Maps API Key:
              </label>
              {tempKey && (
                <button
                  type="button"
                  onClick={async () => {
                    setTempKey("");
                    setClientKey("");
                    setTestResult({ status: "idle", message: "" });
                    try {
                      await fetch("/api/clear-key", { method: "POST" });
                    } catch {}
                  }}
                  className="text-[10px] text-[#C5C6C7]/50 hover:text-rose-400 transition"
                >
                  Clear Custom Key
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="input-api-key"
                  type={showKeyText ? "text" : "password"}
                  autoComplete="new-password"
                  autoCorrect="off"
                  spellCheck={false}
                  value={tempKey}
                  onChange={(e) => {
                    setTempKey(e.target.value);
                    if (testResult.status !== "idle") {
                      setTestResult({ status: "idle", message: "" });
                    }
                  }}
                  placeholder="AIzaSy..."
                  className="w-full bg-[#0B0C10] border border-[#1F2833] rounded-lg px-3 py-2 pr-9 text-white font-mono text-xs focus:outline-none focus:border-[#66FCF1]"
                />
                <button
                  type="button"
                  onClick={() => setShowKeyText(!showKeyText)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#C5C6C7]/50 hover:text-white"
                  title={showKeyText ? "Mask API key" : "Show API key"}
                >
                  {showKeyText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                id="btn-save-key"
                type="button"
                disabled={isTesting || !tempKey || tempKey.trim().length < 8}
                onClick={() => handleTestAndApply(tempKey)}
                className={`px-4 py-2 font-bold rounded-lg transition text-xs flex items-center gap-1.5 shrink-0 ${
                  isTesting
                    ? "bg-[#1F2833] text-[#C5C6C7] cursor-wait"
                    : tempKey && tempKey.trim().length >= 8
                    ? "bg-[#45A29E] hover:bg-[#66FCF1] text-[#0B0C10] shadow-[0_0_10px_rgba(102,252,241,0.25)]"
                    : "bg-[#1F2833]/50 text-[#C5C6C7]/40 cursor-not-allowed"
                }`}
              >
                {isTesting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Test &amp; Apply Key
                  </>
                )}
              </button>
            </div>

            {/* Recheck existing button if user has a server key or already enabled it on the existing project */}
            <div className="flex items-center justify-between text-[11px] pt-1">
              <button
                type="button"
                disabled={isTesting}
                onClick={handleRecheckCurrent}
                className="inline-flex items-center gap-1.5 text-[#66FCF1] hover:underline hover:text-white"
              >
                <RefreshCw className={`w-3 h-3 ${isTesting ? "animate-spin" : ""}`} />
                Re-test Current Key Status (Check if Propagation Complete)
              </button>

              <span className="text-[10px] text-[#C5C6C7]/50">
                Key saved securely in browser session
              </span>
            </div>

            {/* Test Result Feedback Box */}
            {testResult.status === "success" && (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-700/80 text-emerald-300 text-[11px] flex items-start gap-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-white">{testResult.message}</p>
                  <p className="text-[10px] text-emerald-300/80 mt-0.5">
                    Your elevation generator will now pull directly from Google Maps Platform Elevation API.
                  </p>
                </div>
              </div>
            )}

            {testResult.status === "error" && (
              <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/80 text-rose-200 text-[11px] space-y-2 animate-fade-in">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-white">{testResult.message}</p>
                    {testResult.details && (
                      <p className="text-[10px] text-rose-300/80 font-mono bg-black/40 p-1.5 rounded border border-rose-900/50">
                        {testResult.details}
                      </p>
                    )}
                  </div>
                </div>

                {/* Specific Actionable Troubleshooting for "This API is not activated on your API project" */}
                {testResult.details?.includes("This API is not activated") && (
                  <div className="mt-2.5 p-3 rounded bg-black/50 border border-amber-500/40 text-amber-200 text-[11px] space-y-2">
                    <p className="font-bold text-amber-300 flex items-center gap-1.5 text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      Why it works in preview vs standalone:
                    </p>
                    <p className="text-[10px] text-[#C5C6C7]/90 leading-relaxed">
                      Maps display &amp; geocoding search are active, but the <strong>Elevation API</strong> is an independent service that must be enabled on the <em>exact same Google Cloud project</em> that owns your API key:
                    </p>
                    <ol className="list-decimal pl-4 space-y-1 text-[10px] text-amber-100/90 leading-relaxed">
                      <li>
                        <strong>Project Dropdown Mismatch:</strong> In Google Cloud Console, verify the <strong>project name in the top bar</strong>. If you have multiple projects (e.g. personal vs sandbox), ensure you enabled Elevation on the project that generated this key.
                      </li>
                      <li>
                        <strong>API Restrictions:</strong> In <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-[#66FCF1] underline font-bold">Credentials</a>, click your API key. If &quot;Restrict key&quot; is checked, ensure <strong>Elevation API</strong> is checked.
                      </li>
                      <li>
                        <strong>Application Restrictions:</strong> If set to &quot;Websites (HTTP referrers)&quot;, Google rejects server-side web service requests. Set to <strong>None</strong> (or restrict by IP).
                      </li>
                    </ol>
                    <div className="pt-1.5 flex flex-wrap gap-2">
                      <a
                        href="https://console.cloud.google.com/apis/library/elevation-backend.googleapis.com"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 text-white rounded text-[10px] font-bold transition"
                      >
                        <ExternalLink className="w-3 h-3 text-amber-300" />
                        Enable Elevation API on Current Project
                      </a>
                      <a
                        href="https://console.cloud.google.com/apis/credentials"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1F2833] hover:bg-[#45A29E]/30 text-[#66FCF1] rounded text-[10px] font-bold transition"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Manage API Keys &amp; Restrictions
                      </a>
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-[#C5C6C7]/70 pt-0.5">
                  Tip: If you just clicked &quot;Enable&quot; in Google Cloud Console, Google occasionally takes 1–2 minutes to propagate across all edge servers.
                </p>
              </div>
            )}
          </div>

          {/* Alternative: Maps Demo Key for Free Prototyping */}
          <div className="bg-[#0B0C10] border border-[#1F2833] rounded-xl p-3.5 space-y-1.5">
            <p className="font-semibold text-[#66FCF1] text-[11px] uppercase tracking-wider">
              Need a 1-Click Free Prototyping Key? (No Cloud Billing Project)
            </p>
            <p className="text-[#C5C6C7]/70 text-[11px] leading-relaxed">
              Google provides instant, free prototyping keys with zero billing setup for AI Studio apps via the{" "}
              <a
                href="https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                target="_blank"
                rel="noreferrer"
                className="text-[#66FCF1] underline hover:text-white inline-flex items-center gap-0.5 font-semibold"
              >
                Maps Demo Key Portal <ExternalLink className="w-3 h-3" />
              </a>
              . Generate one with your Google account and paste it above!
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#0B0C10] border-t border-[#1F2833] flex items-center justify-between shrink-0">
          <span className="text-[10px] text-[#C5C6C7]/50">
            Current Engine: {elevationActive ? "Google Maps Elevation" : "Terrarium 30M Global DEM"}
          </span>
          <button
            id="btn-footer-close"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-[#1F2833] hover:bg-[#45A29E]/20 text-white text-xs font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
