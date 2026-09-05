import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { ModelExportSettings } from "../types";

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
  settings: ModelExportSettings
): TerrainMeshResult {
  const elevRange = Math.max(1, maxElev - minElev);
  const targetScale = 100; // 100 units wide in 3D viewport
  const heightScale = (targetScale / 1000) * settings.verticalExaggeration;

  const widthSegments = gridWidth - 1;
  const heightSegments = gridHeight - 1;

  // Plane geometry
  const planeGeo = new THREE.PlaneGeometry(
    targetScale,
    targetScale,
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
    const skirtBaseY = -10 * (targetScale / 1000) * settings.verticalExaggeration;
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
 * Exports Three.js mesh/scene as binary glTF (.glb)
 */
export function exportToGlb(mesh: THREE.Mesh): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    const scene = new THREE.Scene();
    scene.add(mesh.clone());

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
