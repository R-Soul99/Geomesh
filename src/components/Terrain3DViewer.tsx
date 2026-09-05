import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  Box,
  Download,
  RotateCcw,
  Sliders,
  Sparkles,
  Info,
  Layers,
  Palette,
  Maximize2,
  Check,
} from "lucide-react";
import { ElevationGridData, ModelExportSettings } from "../types";
import { createTerrainMesh, exportToGlb, TerrainMeshResult } from "../utils/gltfExporter";
import { getHypsometricColor } from "../utils/pngEncoder";

interface Terrain3DViewerProps {
  data: ElevationGridData;
  splatCanvas: HTMLCanvasElement | null;
  areaKilometers: number;
}

export const Terrain3DViewer: React.FC<Terrain3DViewerProps> = ({
  data,
  splatCanvas,
  areaKilometers,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Settings
  const [settings, setSettings] = useState<ModelExportSettings>({
    verticalExaggeration: 1.5,
    includeSkirt: true,
    skirtDepth: 50,
    materialMode: "splat",
    meshDensity: data.resolution,
  });

  const [isWireframe, setIsWireframe] = useState(false);
  const [isExportingGlb, setIsExportingGlb] = useState(false);
  const [meshStats, setMeshStats] = useState<{
    vertices: number;
    triangles: number;
    relief: number;
  } | null>(null);

  // Three.js internal instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const currentMeshRef = useRef<THREE.Mesh | null>(null);
  const textureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Generate an offscreen texture canvas for Topographic or Splat or Satellite mode
  const getTextureCanvas = (): HTMLCanvasElement | null => {
    if (settings.materialMode === "clay") return null;

    if (settings.materialMode === "splat" && splatCanvas) {
      return splatCanvas;
    }

    // Generate Topographic Hypsometric canvas
    const canvas = document.createElement("canvas");
    const res = data.resolution;
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const img = ctx.createImageData(res, res);
    const range = Math.max(1, data.maxElevation - data.minElevation);

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = y * res + x;
        const elev = data.elevations[idx];
        const norm = Math.max(0, Math.min(1, (elev - data.minElevation) / range));
        const [r, g, b] = getHypsometricColor(norm);
        const pIdx = idx * 4;
        img.data[pIdx] = r;
        img.data[pIdx + 1] = g;
        img.data[pIdx + 2] = b;
        img.data[pIdx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  };

  // Setup Three.js scene and viewport
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0c10);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    camera.position.set(0, 80, 110);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xfff8ee, 1.2);
    dirLight1.position.set(80, 120, 60);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x45a29e, 0.4);
    dirLight2.position.set(-60, 40, -60);
    scene.add(dirLight2);

    // Grid Floor Helper
    const gridHelper = new THREE.GridHelper(140, 14, 0x1f2833, 0x111418);
    gridHelper.position.y = -10;
    scene.add(gridHelper);

    // Simple Orbit Controls using native mouse events
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let rotX = 0.55;
    let rotY = -0.7;
    let distance = 130;

    const updateCamera = () => {
      const cy = Math.sin(rotX) * distance;
      const hDist = Math.cos(rotX) * distance;
      const cx = Math.sin(rotY) * hDist;
      const cz = Math.cos(rotY) * hDist;
      camera.position.set(cx, Math.max(10, cy), cz);
      camera.lookAt(0, 5, 0);
    };
    updateCamera();

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;

      rotY -= dx * 0.008;
      rotX = Math.max(0.1, Math.min(Math.PI / 2.1, rotX + dy * 0.008));
      updateCamera();
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      distance = Math.max(30, Math.min(300, distance + e.deltaY * 0.15));
      updateCamera();
    };

    const dom = renderer.domElement;
    dom.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    // Render loop
    let reqId = 0;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      dom.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      dom.removeEventListener("wheel", onWheel);
      renderer.dispose();
    };
  }, []);

  // Update Terrain Mesh when settings or data change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old mesh
    if (currentMeshRef.current) {
      scene.remove(currentMeshRef.current);
      if (currentMeshRef.current.geometry) currentMeshRef.current.geometry.dispose();
      currentMeshRef.current = null;
    }

    const textureCanvas = getTextureCanvas();
    textureCanvasRef.current = textureCanvas;

    const result = createTerrainMesh(
      data.elevations,
      data.resolution,
      data.resolution,
      data.minElevation,
      data.maxElevation,
      textureCanvas,
      settings
    );

    if (isWireframe && result.mesh.material instanceof THREE.MeshStandardMaterial) {
      result.mesh.material.wireframe = true;
    }

    scene.add(result.mesh);
    currentMeshRef.current = result.mesh;

    setMeshStats({
      vertices: result.vertexCount,
      triangles: Math.round(result.triangleCount),
      relief: Math.round(result.relief),
    });
  }, [data, settings, isWireframe, splatCanvas]);

  // Export binary glTF (.glb)
  const handleExportGlb = async () => {
    if (!currentMeshRef.current) return;
    try {
      setIsExportingGlb(true);
      const blob = await exportToGlb(currentMeshRef.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `terrain_3d_mesh_${areaKilometers}km_${data.resolution}x${data.resolution}.glb`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Failed to export glTF: " + err.message);
    } finally {
      setIsExportingGlb(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Left 2 Cols: 3D WebGL Viewport */}
      <div className="lg:col-span-2 space-y-3">
        {/* Shading & Display Mode Bar */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center rounded bg-[#111418] border border-[#1F2833] p-1 font-mono text-[11px]">
            <button
              id="btn-material-splat"
              onClick={() => setSettings({ ...settings, materialMode: "splat" })}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider flex items-center gap-1.5 ${
                settings.materialMode === "splat"
                  ? "bg-[#45A29E] text-[#0B0C10] font-bold"
                  : "text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              <Layers className="w-3 h-3" />
              RGBA SPLAT PBR
            </button>
            <button
              id="btn-material-topo"
              onClick={() => setSettings({ ...settings, materialMode: "topographic" })}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider flex items-center gap-1.5 ${
                settings.materialMode === "topographic"
                  ? "bg-[#45A29E] text-[#0B0C10] font-bold"
                  : "text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              <Palette className="w-3 h-3" />
              HYPSOMETRIC
            </button>
            <button
              id="btn-material-clay"
              onClick={() => setSettings({ ...settings, materialMode: "clay" })}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider flex items-center gap-1.5 ${
                settings.materialMode === "clay"
                  ? "bg-[#45A29E] text-[#0B0C10] font-bold"
                  : "text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              <Box className="w-3 h-3" />
              CLAY STUDIO
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-toggle-wireframe"
              onClick={() => setIsWireframe(!isWireframe)}
              className={`px-2.5 py-1 text-xs font-mono rounded border transition uppercase tracking-wider ${
                isWireframe
                  ? "bg-[#45A29E] border-[#45A29E] text-[#0B0C10] font-bold"
                  : "bg-[#111418] border-[#1F2833] text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              WIREFRAME [{isWireframe ? "ON" : "OFF"}]
            </button>
          </div>
        </div>

        {/* 3D WebGL Canvas Container */}
        <div className="relative rounded-lg border border-[#1F2833] bg-[#0B0C10] overflow-hidden shadow-2xl h-96 sm:h-[480px]">
          <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

          {/* Navigation Overlay Hint */}
          <div className="absolute top-4 left-4 px-2.5 py-1 bg-[#0B0C10]/90 border border-[#1F2833] rounded text-[10px] font-mono text-[#66FCF1] backdrop-blur-sm pointer-events-none uppercase">
            ORBIT: DRAG &bull; ZOOM: SCROLL &bull; DIRECTIONAL PBR SUNLIGHT
          </div>

          {/* Quick GlTF Export Button in viewport */}
          <div className="absolute bottom-4 right-4">
            <button
              id="btn-viewport-export-glb"
              onClick={handleExportGlb}
              disabled={isExportingGlb}
              className="px-3.5 py-2 bg-[#45A29E] hover:bg-[#66FCF1] text-[#0B0C10] rounded text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-[0_0_12px_rgba(69,162,158,0.3)] transition"
            >
              <Download className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{isExportingGlb ? "EXPORTING..." : "EXPORT .GLB"}</span>
            </button>
          </div>
        </div>

        {/* 3D Mesh Geometry Diagnostics */}
        {meshStats && (
          <div className="grid grid-cols-4 gap-2.5 font-mono">
            <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-2.5 text-center">
              <span className="text-[10px] text-[#C5C6C7]/60 block uppercase">POLYGONS</span>
              <span className="text-sm sm:text-base font-bold text-[#66FCF1]">
                {meshStats.triangles.toLocaleString()}
              </span>
            </div>
            <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-2.5 text-center">
              <span className="text-[10px] text-[#C5C6C7]/60 block uppercase">VERTICES</span>
              <span className="text-sm sm:text-base font-bold text-[#45A29E]">
                {meshStats.vertices.toLocaleString()}
              </span>
            </div>
            <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-2.5 text-center">
              <span className="text-[10px] text-[#C5C6C7]/60 block uppercase">RELIEF</span>
              <span className="text-sm sm:text-base font-bold text-amber-400">
                {meshStats.relief} M
              </span>
            </div>
            <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-2.5 text-center">
              <span className="text-[10px] text-[#C5C6C7]/60 block uppercase">FOOTPRINT</span>
              <span className="text-sm sm:text-base font-bold text-[#C5C6C7]">
                {areaKilometers}&times;{areaKilometers} KM
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Right Col: Mesh & Export Controls */}
      <div className="space-y-4">
        <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#1F2833] pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#45A29E]" />
              3D MESH PARAMETERS
            </h3>
            <span className="text-[10px] font-mono text-[#45A29E]">CH_04</span>
          </div>

          {/* Vertical Exaggeration Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#C5C6C7]">VERTICAL RELIEF SCALE</span>
              <span className="text-[#66FCF1] font-bold">
                {settings.verticalExaggeration.toFixed(1)}x
              </span>
            </div>
            <input
              id="slider-vertical-exaggeration"
              type="range"
              min={0.5}
              max={4.0}
              step={0.1}
              value={settings.verticalExaggeration}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  verticalExaggeration: Number(e.target.value),
                })
              }
              className="w-full accent-[#45A29E] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#C5C6C7]/50">
              <span>0.5x [SUBTLE]</span>
              <span>1.0x [1:1 TRUE SCALE]</span>
              <span>4.0x [DRAMATIC]</span>
            </div>
          </div>

          {/* Include Solid Skirt Base Walls */}
          <div className="flex items-center justify-between pt-2 border-t border-[#1F2833] font-mono">
            <div>
              <span className="text-xs text-[#C5C6C7] block font-bold uppercase">SOLID BASE SKIRT</span>
              <span className="text-[10px] text-[#C5C6C7]/50">
                Watertight base pedestal for 3D printing &amp; level collision
              </span>
            </div>
            <button
              id="toggle-skirt"
              type="button"
              onClick={() =>
                setSettings({ ...settings, includeSkirt: !settings.includeSkirt })
              }
              className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                settings.includeSkirt ? "bg-[#45A29E]" : "bg-[#1F2833]"
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  settings.includeSkirt ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* glTF File Spec Card */}
          <div className="bg-[#0B0C10] border border-[#1F2833] rounded p-3 space-y-1.5 text-xs font-mono text-[#C5C6C7]/70">
            <p className="font-bold text-[10px] text-[#66FCF1] flex items-center gap-1.5 uppercase tracking-wider">
              <Box className="w-3.5 h-3.5 text-[#45A29E]" />
              GLTF 2.0 BINARY (.GLB) PAYLOAD:
            </p>
            <ul className="space-y-0.5 text-[10px] list-disc list-inside text-[#C5C6C7]/60 leading-relaxed">
              <li>Indexed triangle array with 3D [X, Y, Z] spatial coords</li>
              <li>Smooth normal vectors computed for dynamic PBR lighting</li>
              <li>Normalized UV mapping for texture coordinates [0..1]</li>
              <li>Standard glTF PBR material with embedded high-res texture</li>
              <li>Ready for Unreal Engine 5, Blender, Unity, Godot &amp; Three.js</li>
            </ul>
          </div>

          {/* Primary Export Button */}
          <div className="pt-2 border-t border-[#1F2833]">
            <button
              id="btn-download-glb-full"
              onClick={handleExportGlb}
              disabled={isExportingGlb}
              className="w-full py-2.5 px-4 bg-[#45A29E] hover:bg-[#66FCF1] text-[#0B0C10] rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(69,162,158,0.3)] transition"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>{isExportingGlb ? "SERIALIZING GLTF BINARY..." : "DOWNLOAD GLTF (.GLB) 3D MODEL"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
