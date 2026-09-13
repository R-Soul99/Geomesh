import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { ModelExportSettings, BuildingStructure, BoundingBox } from "../types";

export interface TerrainMeshResult {
  mesh: THREE.Mesh;
  vertexCount: number;
  triangleCount: number;
  minElevation: number;
  maxElevation: number;
  relief: number;
}

/**
 * Builds a Three.js 3D Terrain Mesh from elevation grid
 */
export function createTerrainMesh(
  elevations: number[],
  gridWidth: number,
  gridHeight: number,
  minElev: number,
  maxElev: number,
  textureCanvas: HTMLCanvasElement | null,
  settings: ModelExportSettings,
  realWidthMeters: number = 10000,
  realHeightMeters?: number
): TerrainMeshResult {
  const elevRange = Math.max(1, maxElev - minElev);
  const targetScale = 100; // 100 units wide in 3D viewport
  const actualHeightM = realHeightMeters && realHeightMeters > 10 ? realHeightMeters : realWidthMeters;
  const aspect = actualHeightM / Math.max(10, realWidthMeters);

  // Proportionally scale 3D plane dimensions
  let planeWidth = targetScale;
  let planeHeight = targetScale * aspect;
  if (aspect > 1) {
    planeHeight = targetScale;
    planeWidth = targetScale / aspect;
  }

  const spanMeters = aspect > 1 ? actualHeightM : realWidthMeters;
  const trueScaleUnitPerMeter = targetScale / (spanMeters > 50 ? spanMeters : 10000);
  const heightScale = trueScaleUnitPerMeter * settings.verticalExaggeration;

  const widthSegments = gridWidth - 1;
  const heightSegments = gridHeight - 1;

  // Plane geometry with true aspect ratio
  const planeGeo = new THREE.PlaneGeometry(
    planeWidth,
    planeHeight,
    widthSegments,
    heightSegments
  );
  planeGeo.rotateX(-Math.PI / 2); // Rotate so Y is UP

  const posAttr = planeGeo.attributes.position;
  const vertexCount = posAttr.count;

  // Apply heights to vertices
  for (let i = 0; i < vertexCount; i++) {
    const rawElev = elevations[i] !== undefined ? elevations[i] : minElev;
    const normalizedY = (rawElev - minElev) * heightScale;
    posAttr.setY(i, normalizedY);
  }

  posAttr.needsUpdate = true;
  planeGeo.computeVertexNormals();

  let finalGeometry: THREE.BufferGeometry = planeGeo;

  // Add terrain skirt (solid base block) if requested
  if (settings.includeSkirt) {
    const skirtDepthMeters = Math.max(15, elevRange * 0.15);
    const skirtBaseY = -skirtDepthMeters * heightScale;
    finalGeometry = addTerrainSkirt(planeGeo, gridWidth, gridHeight, skirtBaseY);
  }

  // Material setup
  let material: THREE.Material;
  if (textureCanvas && settings.materialMode !== "clay") {
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;

    material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: false,
    });
  } else {
    // Clean matte clay studio material
    material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xdde3ea),
      roughness: 0.65,
      metalness: 0.1,
      flatShading: false,
    });
  }

  const terrainMesh = new THREE.Mesh(finalGeometry, material);
  terrainMesh.name = "Terrain_3D_Model";

  const triangleCount = finalGeometry.index
    ? finalGeometry.index.count / 3
    : finalGeometry.attributes.position.count / 3;

  return {
    mesh: terrainMesh,
    vertexCount: finalGeometry.attributes.position.count,
    triangleCount,
    minElevation: minElev,
    maxElevation: maxElev,
    relief: elevRange,
  };
}

/**
 * Creates 4 solid vertical boundary walls around the edge of the heightmap
 */
function addTerrainSkirt(
  topGeo: THREE.PlaneGeometry,
  gridWidth: number,
  gridHeight: number,
  baseY: number
): THREE.BufferGeometry {
  const topPos = topGeo.attributes.position;
  const topUV = topGeo.attributes.uv;
  const topNorm = topGeo.attributes.normal;
  const topIndex = topGeo.index!;

  const vertices: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  // Copy top surface
  for (let i = 0; i < topPos.count; i++) {
    vertices.push(topPos.getX(i), topPos.getY(i), topPos.getZ(i));
    uvs.push(topUV.getX(i), topUV.getY(i));
    normals.push(topNorm.getX(i), topNorm.getY(i), topNorm.getZ(i));
  }
  for (let i = 0; i < topIndex.count; i++) {
    indices.push(topIndex.getX(i));
  }

  // Edge indices around the grid
  const edges = {
    north: [] as number[], // Top row (y = 0)
    south: [] as number[], // Bottom row (y = gridHeight - 1)
    west: [] as number[],  // Left column (x = 0)
    east: [] as number[],  // Right column (x = gridWidth - 1)
  };

  for (let x = 0; x < gridWidth; x++) {
    edges.north.push(x);
    edges.south.push((gridHeight - 1) * gridWidth + x);
  }
  for (let y = 0; y < gridHeight; y++) {
    edges.west.push(y * gridWidth);
    edges.east.push(y * gridWidth + (gridWidth - 1));
  }

  function addWall(edgeIndices: number[], reverse: boolean) {
    for (let i = 0; i < edgeIndices.length - 1; i++) {
      const idxA = edgeIndices[i];
      const idxB = edgeIndices[i + 1];

      const ax = topPos.getX(idxA);
      const ay = topPos.getY(idxA);
      const az = topPos.getZ(idxA);

      const bx = topPos.getX(idxB);
      const by = topPos.getY(idxB);
      const bz = topPos.getZ(idxB);

      const startIndex = vertices.length / 3;

      // 4 vertices for this wall quad
      vertices.push(ax, ay, az);     // 0: top A
      vertices.push(bx, by, bz);     // 1: top B
      vertices.push(ax, baseY, az);  // 2: bottom A
      vertices.push(bx, baseY, bz);  // 3: bottom B

      uvs.push(0, 1, 1, 1, 0, 0, 1, 0);
      normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);

      if (!reverse) {
        indices.push(startIndex, startIndex + 2, startIndex + 1);
        indices.push(startIndex + 1, startIndex + 2, startIndex + 3);
      } else {
        indices.push(startIndex, startIndex + 1, startIndex + 2);
        indices.push(startIndex + 1, startIndex + 3, startIndex + 2);
      }
    }
  }

  addWall(edges.north, true);
  addWall(edges.south, false);
  addWall(edges.west, false);
  addWall(edges.east, true);

  const mergedGeo = new THREE.BufferGeometry();
  mergedGeo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  mergedGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  mergedGeo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  mergedGeo.setIndex(indices);
  mergedGeo.computeVertexNormals();

  return mergedGeo;
}

/**
 * Creates 3D Building Meshes placed directly on top of the terrain surface
 */
export function createBuildingMeshesGroup(
  buildings: BuildingStructure[],
  bbox: BoundingBox,
  elevations: number[],
  gridWidth: number,
  gridHeight: number,
  minElev: number,
  maxElev: number,
  settings: ModelExportSettings,
  realWidthMeters: number = 10000,
  realHeightMeters?: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = "Buildings_And_Structures";

  if (!buildings || buildings.length === 0) return group;

  const targetScale = 100;
  const actualHeightM = realHeightMeters && realHeightMeters > 10 ? realHeightMeters : realWidthMeters;
  const aspect = actualHeightM / Math.max(10, realWidthMeters);

  let planeWidth = targetScale;
  let planeHeight = targetScale * aspect;
  if (aspect > 1) {
    planeHeight = targetScale;
    planeWidth = targetScale / aspect;
  }

  const spanMeters = aspect > 1 ? actualHeightM : realWidthMeters;
  const trueScaleUnitPerMeter = targetScale / (spanMeters > 50 ? spanMeters : 10000);
  const heightScale = trueScaleUnitPerMeter * settings.verticalExaggeration;

  const bHeightMult = settings.buildingHeightScale || 1.0;
  const bStyle = settings.buildingStyle || "realistic";

  const spanLng = bbox.east - bbox.west;
  const spanLat = bbox.north - bbox.south;
  if (spanLng <= 0 || spanLat <= 0) return group;

  // Materials for different archetypes
  const matRealisticWall = new THREE.MeshStandardMaterial({
    color: 0xdedede,
    roughness: 0.8,
    metalness: 0.1,
  });
  const matFuel = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    roughness: 0.4,
    metalness: 0.2,
    emissive: 0x054d32,
    emissiveIntensity: 0.25,
  });
  const matCommercial = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    roughness: 0.5,
    metalness: 0.2,
  });
  const matIndustrial = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.7,
    metalness: 0.3,
  });
  const matCivic = new THREE.MeshStandardMaterial({
    color: 0xa855f7,
    roughness: 0.6,
    metalness: 0.2,
  });
  const matGreybox = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.5,
    metalness: 0.1,
  });
  const matBlueprint = new THREE.MeshStandardMaterial({
    color: 0x66fcf1,
    roughness: 0.3,
    metalness: 0.3,
    emissive: 0x1f4e4b,
    emissiveIntensity: 0.4,
  });

  // Limit rendering to first 1200 buildings if scene is dense
  const buildingsToRender = buildings.slice(0, 1500);

  for (const b of buildingsToRender) {
    const u = (b.centroid.lng - bbox.west) / spanLng;
    const v = (bbox.north - b.centroid.lat) / spanLat;

    // Skip if out of bounds
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;

    // Convert to local 3D X/Z
    const localX = (u - 0.5) * planeWidth;
    const localZ = (v - 0.5) * planeHeight;

    // Bilinear ground elevation
    const xGrid = u * (gridWidth - 1);
    const yGrid = v * (gridHeight - 1);
    const x0 = Math.floor(xGrid);
    const x1 = Math.min(gridWidth - 1, x0 + 1);
    const y0 = Math.floor(yGrid);
    const y1 = Math.min(gridHeight - 1, y0 + 1);
    const tx = xGrid - x0;
    const ty = yGrid - y0;

    const e00 = elevations[y0 * gridWidth + x0] !== undefined ? elevations[y0 * gridWidth + x0] : minElev;
    const e10 = elevations[y0 * gridWidth + x1] !== undefined ? elevations[y0 * gridWidth + x1] : minElev;
    const e01 = elevations[y1 * gridWidth + x0] !== undefined ? elevations[y1 * gridWidth + x0] : minElev;
    const e11 = elevations[y1 * gridWidth + x1] !== undefined ? elevations[y1 * gridWidth + x1] : minElev;

    const groundElev = (1 - tx) * (1 - ty) * e00 + tx * (1 - ty) * e10 + (1 - tx) * ty * e01 + tx * ty * e11;
    const groundY = (groundElev - minElev) * heightScale;

    // 3D Dimensions
    const bHeight3D = Math.max(0.15, b.heightMeters * heightScale * bHeightMult);
    const bWidth3D = Math.max(0.25, (b.widthMeters / realWidthMeters) * planeWidth);
    const bDepth3D = Math.max(0.25, (b.depthMeters / actualHeightM) * planeHeight);

    const geo = new THREE.BoxGeometry(bWidth3D, bHeight3D, bDepth3D);

    // Material selection
    let mat = matRealisticWall;
    if (bStyle === "greybox") {
      mat = matGreybox;
    } else if (bStyle === "blueprint") {
      mat = matBlueprint;
    } else if (bStyle === "category") {
      if (b.type === "fuel") mat = matFuel;
      else if (b.type === "commercial") mat = matCommercial;
      else if (b.type === "industrial") mat = matIndustrial;
      else if (b.type === "civic" || b.type === "structure") mat = matCivic;
      else mat = matRealisticWall;
    } else {
      // Realistic
      if (b.type === "fuel") mat = matFuel;
      else if (b.type === "commercial") mat = matCommercial;
      else if (b.type === "industrial") mat = matIndustrial;
      else if (b.type === "civic") mat = matCivic;
      else mat = matRealisticWall;
    }

    const bMesh = new THREE.Mesh(geo, mat);
    bMesh.name = `Building_${b.type}_${b.id}`;
    bMesh.position.set(localX, groundY + bHeight3D / 2, localZ);
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;

    // Highlight Fuel Stations with distinct canopy structure
    if (b.type === "fuel") {
      const canopyGeo = new THREE.BoxGeometry(bWidth3D * 1.25, 0.08 * heightScale * bHeightMult, bDepth3D * 1.25);
      const canopyMesh = new THREE.Mesh(canopyGeo, matFuel);
      canopyMesh.position.set(localX, groundY + bHeight3D + 0.04, localZ);
      group.add(canopyMesh);
    }

    group.add(bMesh);
  }

  return group;
}

/**
 * Exports Three.js mesh/scene/group as binary glTF (.glb)
 */
export function exportToGlb(objectOrMesh: THREE.Object3D): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    const scene = new THREE.Scene();
    scene.add(objectOrMesh.clone());

    exporter.parse(
      scene,
      (gltf) => {
        if (gltf instanceof ArrayBuffer) {
          const blob = new Blob([gltf], { type: "model/gltf-binary" });
          resolve(blob);
        } else {
          // JSON fallback
          const jsonStr = JSON.stringify(gltf);
          const blob = new Blob([jsonStr], { type: "model/gltf+json" });
          resolve(blob);
        }
      },
      (error) => {
        console.error("GLTF export error:", error);
        reject(error);
      },
      {
        binary: true,
        embedImages: true,
        includeCustomExtensions: true,
      }
    );
  });
}
