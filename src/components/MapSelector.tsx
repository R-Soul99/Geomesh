import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import L from "leaflet";
import {
  MapPin,
  Search,
  Maximize2,
  Eye,
  Play,
  Layers,
  Info,
  ArrowRight,
  LocateFixed,
  Move,
  Lock,
  Unlock,
  Crosshair,
  RectangleHorizontal,
  Square,
  Sliders,
  RotateCcw,
} from "lucide-react";
import { BoundingBox, Coordinates } from "../types";

interface MapSelectorProps {
  bbox: BoundingBox;
  center: Coordinates;
  onChangeBbox: (bbox: BoundingBox, center: Coordinates) => void;
  onGenerate: (resolution: number) => void;
  isGenerating: boolean;
  hasGoogleKey: boolean;
  clientKey?: string;
  onOpenStreetView: () => void;
  areaKilometers: number;
  setAreaKilometers: (km: number) => void;
  elevationSource?: "auto" | "terrarium" | "google" | "open-meteo";
  setElevationSource?: (source: "auto" | "terrarium" | "google" | "open-meteo") => void;
  elevationActive?: boolean;
  elevationNotice?: string;
  sourceUsed?: string;
  onOpenKeyModal?: () => void;
}

export const MapSelector: React.FC<MapSelectorProps> = ({
  bbox,
  center,
  onChangeBbox,
  onGenerate,
  isGenerating,
  hasGoogleKey,
  clientKey,
  onOpenStreetView,
  areaKilometers,
  setAreaKilometers,
  elevationSource = "auto",
  setElevationSource,
  elevationActive = false,
  elevationNotice,
  sourceUsed,
  onOpenKeyModal,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [mapType, setMapType] = useState<"satellite" | "terrain" | "topo">("satellite");
  const [resolution, setResolution] = useState(64);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Custom aspect ratio & square lock state
  const [lockSquare, setLockSquare] = useState<boolean>(false);
  const [aspectPreset, setAspectPreset] = useState<"free" | "1:1" | "4:3" | "16:9" | "2:1">("free");

  // Geodesic physical dimensions in km
  const { widthKm, heightKm, aspectRatio, surfaceAreaKm2 } = useMemo(() => {
    const midLatRad = ((bbox.north + bbox.south) / 2) * (Math.PI / 180);
    const wKm = Number((Math.max(0.1, Math.abs(bbox.east - bbox.west) * 111.32 * Math.cos(midLatRad))).toFixed(2));
    const hKm = Number((Math.max(0.1, Math.abs(bbox.north - bbox.south) * 111.32)).toFixed(2));
    const ratio = Number((wKm / Math.max(0.01, hKm)).toFixed(2));
    const area = Number((wKm * hKm).toFixed(2));
    return {
      widthKm: wKm,
      heightKm: hKm,
      aspectRatio: ratio,
      surfaceAreaKm2: area,
    };
  }, [bbox]);

  // Interactive Map DOM container ref and Leaflet instances
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const rectLayerRef = useRef<L.Rectangle | null>(null);

  // Drag handles
  const nwMarkerRef = useRef<L.Marker | null>(null);
  const neMarkerRef = useRef<L.Marker | null>(null);
  const seMarkerRef = useRef<L.Marker | null>(null);
  const swMarkerRef = useRef<L.Marker | null>(null);
  const nMarkerRef = useRef<L.Marker | null>(null);
  const sMarkerRef = useRef<L.Marker | null>(null);
  const eMarkerRef = useRef<L.Marker | null>(null);
  const wMarkerRef = useRef<L.Marker | null>(null);
  const centerMarkerRef = useRef<L.Marker | null>(null);

  // Sync refs so callbacks have live data without recreation
  const bboxRef = useRef<BoundingBox>(bbox);
  useEffect(() => {
    bboxRef.current = bbox;
  }, [bbox]);

  const lockSquareRef = useRef<boolean>(lockSquare);
  useEffect(() => {
    lockSquareRef.current = lockSquare;
  }, [lockSquare]);

  const isDraggingRef = useRef<boolean>(false);

  // Helper to visually reposition all Leaflet layers to match a candidate bounding box
  const syncLayersToBbox = useCallback((b: BoundingBox) => {
    const midLat = (b.north + b.south) / 2;
    const midLng = (b.east + b.west) / 2;

    rectLayerRef.current?.setBounds([
      [b.south, b.west],
      [b.north, b.east],
    ]);

    nwMarkerRef.current?.setLatLng([b.north, b.west]);
    neMarkerRef.current?.setLatLng([b.north, b.east]);
    seMarkerRef.current?.setLatLng([b.south, b.east]);
    swMarkerRef.current?.setLatLng([b.south, b.west]);

    nMarkerRef.current?.setLatLng([b.north, midLng]);
    sMarkerRef.current?.setLatLng([b.south, midLng]);
    eMarkerRef.current?.setLatLng([midLat, b.east]);
    wMarkerRef.current?.setLatLng([midLat, b.west]);

    centerMarkerRef.current?.setLatLng([midLat, midLng]);
  }, []);

  // Update bounding box with explicit width and height in km
  const setDimensionsKm = useCallback(
    (newWidthKm: number, newHeightKm: number, targetCenter = center) => {
      const midLat = targetCenter.lat;
      const cosLat = Math.cos((midLat * Math.PI) / 180) || 1;

      const latDelta = newHeightKm / 111.32 / 2;
      const lngDelta = newWidthKm / (111.32 * Math.abs(cosLat)) / 2;

      const newBbox: BoundingBox = {
        north: Number((targetCenter.lat + latDelta).toFixed(5)),
        south: Number((targetCenter.lat - latDelta).toFixed(5)),
        east: Number((targetCenter.lng + lngDelta).toFixed(5)),
        west: Number((targetCenter.lng - lngDelta).toFixed(5)),
      };

      setAreaKilometers(Math.round(Math.max(newWidthKm, newHeightKm)));
      onChangeBbox(newBbox, targetCenter);
    },
    [center, onChangeBbox, setAreaKilometers]
  );

  // Handle aspect preset selection
  const handleAspectPreset = (preset: "free" | "1:1" | "4:3" | "16:9" | "2:1") => {
    setAspectPreset(preset);
    if (preset === "free") {
      setLockSquare(false);
      return;
    }

    if (preset === "1:1") {
      setLockSquare(true);
      const size = Math.round(widthKm);
      setDimensionsKm(size, size);
      return;
    }

    setLockSquare(false);
    let targetRatio = 1.0;
    if (preset === "4:3") targetRatio = 4 / 3;
    if (preset === "16:9") targetRatio = 16 / 9;
    if (preset === "2:1") targetRatio = 2.0;

    const newH = Number((widthKm / targetRatio).toFixed(1));
    setDimensionsKm(widthKm, newH);
  };

  // Re-center map view over the current selection box
  const handleRecenterMapOnAoi = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setView([center.lat, center.lng], mapInstanceRef.current.getZoom(), {
      animate: true,
    });
  };

  // Move the selection box to the current center of the map view
  const handleMoveAoiToViewCenter = () => {
    if (!mapInstanceRef.current) return;
    const c = mapInstanceRef.current.getCenter();
    const newCenter: Coordinates = {
      lat: Number(c.lat.toFixed(5)),
      lng: Number(c.lng.toFixed(5)),
    };
    setDimensionsKm(widthKm, heightKm, newCenter);
  };

  // Initialize Leaflet Map and Drag Handles once
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Create map centered on initial coordinates
    const map = L.map(mapContainerRef.current, {
      center: [center.lat, center.lng],
      zoom: 12,
      zoomControl: false,
      attributionControl: true,
    });

    // Zoom control in top-right
    L.control.zoom({ position: "topright" }).addTo(map);

    // Initial tile layer
    const tileLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 18,
        attribution:
          "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
      }
    ).addTo(map);
    tileLayerRef.current = tileLayer;

    // Initial bounds
    const bounds = L.latLngBounds([bbox.south, bbox.west], [bbox.north, bbox.east]);

    // Selection Area Rectangle
    const rect = L.rectangle(bounds, {
      color: "#66FCF1",
      weight: 2,
      dashArray: "5, 5",
      fillColor: "#10B981",
      fillOpacity: 0.16,
      interactive: false,
    }).addTo(map);
    rectLayerRef.current = rect;

    // Handle Icon Factories
    const createCornerIcon = (cursorClass: string) =>
      L.divIcon({
        className: "aoi-corner-handle",
        html: `<div style="cursor:${cursorClass};" class="w-3.5 h-3.5 bg-[#66FCF1] border-2 border-[#0B0C10] shadow-[0_0_8px_rgba(102,252,241,0.9)] rounded-sm hover:scale-125 transition-transform" />`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

    const createEdgeIcon = (cursorClass: string, isNS: boolean) =>
      L.divIcon({
        className: "aoi-edge-handle",
        html: `<div style="cursor:${cursorClass};" class="${
          isNS ? "w-5 h-2" : "w-2 h-5"
        } bg-[#45A29E] border border-[#0B0C10] shadow-md rounded hover:bg-[#66FCF1] hover:scale-110 transition-all" />`,
        iconSize: isNS ? [20, 8] : [8, 20],
        iconAnchor: isNS ? [10, 4] : [4, 10],
      });

    const createCenterIcon = () =>
      L.divIcon({
        className: "aoi-center-handle",
        html: `
          <div style="cursor:move;" class="relative -top-3.5 -left-3.5 flex items-center justify-center w-7 h-7 rounded-full bg-[#0B0C10]/90 border-2 border-[#66FCF1] shadow-[0_0_12px_rgba(102,252,241,0.9)] hover:scale-110 transition-transform">
            <div class="w-1.5 h-1.5 rounded-full bg-[#66FCF1]" />
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

    const midLat = (bbox.north + bbox.south) / 2;
    const midLng = (bbox.east + bbox.west) / 2;

    // 1. Center Draggable Marker
    const centerMarker = L.marker([midLat, midLng], {
      draggable: true,
      icon: createCenterIcon(),
      zIndexOffset: 1000,
    }).addTo(map);
    centerMarkerRef.current = centerMarker;

    let dragStartCenter: L.LatLng | null = null;
    let dragStartBbox: BoundingBox | null = null;

    centerMarker.on("dragstart", () => {
      isDraggingRef.current = true;
      dragStartCenter = centerMarker.getLatLng();
      dragStartBbox = { ...bboxRef.current };
    });

    centerMarker.on("drag", () => {
      if (!dragStartCenter || !dragStartBbox) return;
      const curr = centerMarker.getLatLng();
      const dLat = curr.lat - dragStartCenter.lat;
      const dLng = curr.lng - dragStartCenter.lng;

      const tempBbox: BoundingBox = {
        north: Number((dragStartBbox.north + dLat).toFixed(5)),
        south: Number((dragStartBbox.south + dLat).toFixed(5)),
        east: Number((dragStartBbox.east + dLng).toFixed(5)),
        west: Number((dragStartBbox.west + dLng).toFixed(5)),
      };
      syncLayersToBbox(tempBbox);
    });

    centerMarker.on("dragend", () => {
      if (!dragStartCenter || !dragStartBbox) return;
      const curr = centerMarker.getLatLng();
      const dLat = curr.lat - dragStartCenter.lat;
      const dLng = curr.lng - dragStartCenter.lng;

      const newBbox: BoundingBox = {
        north: Number((dragStartBbox.north + dLat).toFixed(5)),
        south: Number((dragStartBbox.south + dLat).toFixed(5)),
        east: Number((dragStartBbox.east + dLng).toFixed(5)),
        west: Number((dragStartBbox.west + dLng).toFixed(5)),
      };
      const newCenter: Coordinates = {
        lat: Number(((newBbox.north + newBbox.south) / 2).toFixed(5)),
        lng: Number(((newBbox.east + newBbox.west) / 2).toFixed(5)),
      };

      dragStartCenter = null;
      dragStartBbox = null;
      isDraggingRef.current = false;
      onChangeBbox(newBbox, newCenter);
    });

    // 2. Corner Handles Setup (NW, NE, SE, SW)
    const nwMarker = L.marker([bbox.north, bbox.west], {
      draggable: true,
      icon: createCornerIcon("nwse-resize"),
      zIndexOffset: 900,
    }).addTo(map);
    nwMarkerRef.current = nwMarker;

    const neMarker = L.marker([bbox.north, bbox.east], {
      draggable: true,
      icon: createCornerIcon("nesw-resize"),
      zIndexOffset: 900,
    }).addTo(map);
    neMarkerRef.current = neMarker;

    const seMarker = L.marker([bbox.south, bbox.east], {
      draggable: true,
      icon: createCornerIcon("nwse-resize"),
      zIndexOffset: 900,
    }).addTo(map);
    seMarkerRef.current = seMarker;

    const swMarker = L.marker([bbox.south, bbox.west], {
      draggable: true,
      icon: createCornerIcon("nesw-resize"),
      zIndexOffset: 900,
    }).addTo(map);
    swMarkerRef.current = swMarker;

    const setupCornerDrag = (marker: L.Marker, corner: "nw" | "ne" | "se" | "sw") => {
      let initBbox: BoundingBox | null = null;

      marker.on("dragstart", () => {
        isDraggingRef.current = true;
        initBbox = { ...bboxRef.current };
      });

      marker.on("drag", () => {
        if (!initBbox) return;
        const pos = marker.getLatLng();
        let { north, south, east, west } = initBbox;
        const minSpan = 0.005; // ~500m min dimension

        if (corner === "ne") {
          north = Math.max(pos.lat, south + minSpan);
          east = Math.max(pos.lng, west + minSpan);
          if (lockSquareRef.current) {
            const midL = (north + south) / 2;
            const cosL = Math.cos((midL * Math.PI) / 180) || 1;
            const latDelta = north - south;
            east = west + latDelta / Math.abs(cosL);
          }
        } else if (corner === "nw") {
          north = Math.max(pos.lat, south + minSpan);
          west = Math.min(pos.lng, east - minSpan);
          if (lockSquareRef.current) {
            const midL = (north + south) / 2;
            const cosL = Math.cos((midL * Math.PI) / 180) || 1;
            const latDelta = north - south;
            west = east - latDelta / Math.abs(cosL);
          }
        } else if (corner === "se") {
          south = Math.min(pos.lat, north - minSpan);
          east = Math.max(pos.lng, west + minSpan);
          if (lockSquareRef.current) {
            const midL = (north + south) / 2;
            const cosL = Math.cos((midL * Math.PI) / 180) || 1;
            const latDelta = north - south;
            east = west + latDelta / Math.abs(cosL);
          }
        } else if (corner === "sw") {
          south = Math.min(pos.lat, north - minSpan);
          west = Math.min(pos.lng, east - minSpan);
          if (lockSquareRef.current) {
            const midL = (north + south) / 2;
            const cosL = Math.cos((midL * Math.PI) / 180) || 1;
            const latDelta = north - south;
            west = east - latDelta / Math.abs(cosL);
          }
        }

        syncLayersToBbox({ north, south, east, west });
      });

      marker.on("dragend", () => {
        if (!initBbox) return;
        const pos = marker.getLatLng();
        let { north, south, east, west } = initBbox;
        const minSpan = 0.005;

        if (corner === "ne") {
          north = Math.max(pos.lat, south + minSpan);
          east = Math.max(pos.lng, west + minSpan);
          if (lockSquareRef.current) {
            const midL = (north + south) / 2;
            const cosL = Math.cos((midL * Math.PI) / 180) || 1;
            const latDelta = north - south;
            east = west + latDelta / Math.abs(cosL);
          }
        } else if (corner === "nw") {
          north = Math.max(pos.lat, south + minSpan);
          west = Math.min(pos.lng, east - minSpan);
          if (lockSquareRef.current) {
            const midL = (north + south) / 2;
            const cosL = Math.cos((midL * Math.PI) / 180) || 1;
            const latDelta = north - south;
            west = east - latDelta / Math.abs(cosL);
          }
        } else if (corner === "se") {
          south = Math.min(pos.lat, north - minSpan);
          east = Math.max(pos.lng, west + minSpan);
          if (lockSquareRef.current) {
            const midL = (north + south) / 2;
            const cosL = Math.cos((midL * Math.PI) / 180) || 1;
            const latDelta = north - south;
            east = west + latDelta / Math.abs(cosL);
          }
        } else if (corner === "sw") {
          south = Math.min(pos.lat, north - minSpan);
          west = Math.min(pos.lng, east - minSpan);
          if (lockSquareRef.current) {
            const midL = (north + south) / 2;
            const cosL = Math.cos((midL * Math.PI) / 180) || 1;
            const latDelta = north - south;
            west = east - latDelta / Math.abs(cosL);
          }
        }

        const newBbox: BoundingBox = {
          north: Number(north.toFixed(5)),
          south: Number(south.toFixed(5)),
          east: Number(east.toFixed(5)),
          west: Number(west.toFixed(5)),
        };
        const newCenter: Coordinates = {
          lat: Number(((newBbox.north + newBbox.south) / 2).toFixed(5)),
          lng: Number(((newBbox.east + newBbox.west) / 2).toFixed(5)),
        };

        initBbox = null;
        isDraggingRef.current = false;
        onChangeBbox(newBbox, newCenter);
      });
    };

    setupCornerDrag(nwMarker, "nw");
    setupCornerDrag(neMarker, "ne");
    setupCornerDrag(seMarker, "se");
    setupCornerDrag(swMarker, "sw");

    // 3. Edge Midpoint Handles (N, S, E, W)
    const nMarker = L.marker([bbox.north, midLng], {
      draggable: true,
      icon: createEdgeIcon("ns-resize", true),
      zIndexOffset: 850,
    }).addTo(map);
    nMarkerRef.current = nMarker;

    const sMarker = L.marker([bbox.south, midLng], {
      draggable: true,
      icon: createEdgeIcon("ns-resize", true),
      zIndexOffset: 850,
    }).addTo(map);
    sMarkerRef.current = sMarker;

    const eMarker = L.marker([midLat, bbox.east], {
      draggable: true,
      icon: createEdgeIcon("ew-resize", false),
      zIndexOffset: 850,
    }).addTo(map);
    eMarkerRef.current = eMarker;

    const wMarker = L.marker([midLat, bbox.west], {
      draggable: true,
      icon: createEdgeIcon("ew-resize", false),
      zIndexOffset: 850,
    }).addTo(map);
    wMarkerRef.current = wMarker;

    const setupEdgeDrag = (marker: L.Marker, edge: "n" | "s" | "e" | "w") => {
      let initBbox: BoundingBox | null = null;

      marker.on("dragstart", () => {
        isDraggingRef.current = true;
        initBbox = { ...bboxRef.current };
      });

      marker.on("drag", () => {
        if (!initBbox) return;
        const pos = marker.getLatLng();
        let { north, south, east, west } = initBbox;
        const minSpan = 0.005;

        if (edge === "n") {
          north = Math.max(pos.lat, south + minSpan);
          if (lockSquareRef.current) {
            const centerLng = (east + west) / 2;
            const midL = (north + south) / 2;
            const cosL = Math.cos((midL * Math.PI) / 180) || 1;
            const latSpan = north - south;
            const halfLng = latSpan / Math.abs(cosL) / 2;
            east = centerLng + halfLng;
            west = centerLng - halfLng;
          }
        } else if (edge === "s") {
          south = Math.min(pos.lat, north - minSpan);
          if (lockSquareRef.current) {
            const centerLng = (east + west) / 2;
            const midL = (north + south) / 2;
            const cosL = Math.cos((midL * Math.PI) / 180) || 1;
            const latSpan = north - south;
            const halfLng = latSpan / Math.abs(cosL) / 2;
            east = centerLng + halfLng;
            west = centerLng - halfLng;
          }
        } else if (edge === "e") {
          east = Math.max(pos.lng, west + minSpan);
          if (lockSquareRef.current) {
            const centerLat = (north + south) / 2;
            const cosL = Math.cos((centerLat * Math.PI) / 180) || 1;
            const lngSpanKm = Math.abs(east - west) * 111.32 * Math.abs(cosL);
            const halfLat = lngSpanKm / 111.32 / 2;
            north = centerLat + halfLat;
            south = centerLat - halfLat;
          }
        } else if (edge === "w") {
          west = Math.min(pos.lng, east - minSpan);
          if (lockSquareRef.current) {
            const centerLat = (north + south) / 2;
            const cosL = Math.cos((centerLat * Math.PI) / 180) || 1;
            const lngSpanKm = Math.abs(east - west) * 111.32 * Math.abs(cosL);
            const halfLat = lngSpanKm / 111.32 / 2;
            north = centerLat + halfLat;
            south = centerLat - halfLat;
          }
        }

        syncLayersToBbox({ north, south, east, west });
      });

      marker.on("dragend", () => {
        if (!initBbox) return;
        const pos = marker.getLatLng();
        let { north, south, east, west } = initBbox;
        const minSpan = 0.005;

        if (edge === "n") {
          north = Math.max(pos.lat, south + minSpan);
          if (lockSquareRef.current) {
            const centerLng = (east + west) / 2;
            const midL = (north + south) / 2;
            const cosL = Math.cos((midL * Math.PI) / 180) || 1;
            const latSpan = north - south;
            const halfLng = latSpan / Math.abs(cosL) / 2;
            east = centerLng + halfLng;
            west = centerLng - halfLng;
          }
        } else if (edge === "s") {
          south = Math.min(pos.lat, north - minSpan);
          if (lockSquareRef.current) {
            const centerLng = (east + west) / 2;
            const midL = (north + south) / 2;
            const cosL = Math.cos((midL * Math.PI) / 180) || 1;
            const latSpan = north - south;
            const halfLng = latSpan / Math.abs(cosL) / 2;
            east = centerLng + halfLng;
            west = centerLng - halfLng;
          }
        } else if (edge === "e") {
          east = Math.max(pos.lng, west + minSpan);
          if (lockSquareRef.current) {
            const centerLat = (north + south) / 2;
            const cosL = Math.cos((centerLat * Math.PI) / 180) || 1;
            const lngSpanKm = Math.abs(east - west) * 111.32 * Math.abs(cosL);
            const halfLat = lngSpanKm / 111.32 / 2;
            north = centerLat + halfLat;
            south = centerLat - halfLat;
          }
        } else if (edge === "w") {
          west = Math.min(pos.lng, east - minSpan);
          if (lockSquareRef.current) {
            const centerLat = (north + south) / 2;
            const cosL = Math.cos((centerLat * Math.PI) / 180) || 1;
            const lngSpanKm = Math.abs(east - west) * 111.32 * Math.abs(cosL);
            const halfLat = lngSpanKm / 111.32 / 2;
            north = centerLat + halfLat;
            south = centerLat - halfLat;
          }
        }

        const newBbox: BoundingBox = {
          north: Number(north.toFixed(5)),
          south: Number(south.toFixed(5)),
          east: Number(east.toFixed(5)),
          west: Number(west.toFixed(5)),
        };
        const newCenter: Coordinates = {
          lat: Number(((newBbox.north + newBbox.south) / 2).toFixed(5)),
          lng: Number(((newBbox.east + newBbox.west) / 2).toFixed(5)),
        };

        initBbox = null;
        isDraggingRef.current = false;
        onChangeBbox(newBbox, newCenter);
      });
    };

    setupEdgeDrag(nMarker, "n");
    setupEdgeDrag(sMarker, "s");
    setupEdgeDrag(eMarker, "e");
    setupEdgeDrag(wMarker, "w");

    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update map tiles when mapType changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let url = "";
    let attr = "";
    let maxZoom = 18;

    if (mapType === "satellite") {
      url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      attr =
        "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community";
      maxZoom = 18;
    } else if (mapType === "terrain") {
      url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
      attr =
        "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community";
      maxZoom = 18;
    } else {
      url = "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
      attr =
        'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)';
      maxZoom = 17;
    }

    const newLayer = L.tileLayer(url, { maxZoom, attribution: attr }).addTo(map);
    tileLayerRef.current = newLayer;
  }, [mapType]);

  // Synchronize layers with bbox & center changes without hijacking map viewport
  useEffect(() => {
    if (isDraggingRef.current) return;
    const map = mapInstanceRef.current;
    if (!map) return;

    syncLayersToBbox(bbox);

    // Only pan map viewport if the location moved substantially from an external action (preset selection, search)
    const currentCenter = map.getCenter();
    const dist = Math.hypot(currentCenter.lat - center.lat, currentCenter.lng - center.lng);
    if (dist > 0.05) {
      map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
    }
  }, [bbox, center, syncLayersToBbox]);

  // HTML5 Browser Geolocation
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setSearchError("Geolocation is not supported by your browser. Please search by name or coordinates.");
      return;
    }

    setIsLocatingGps(true);
    setSearchError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGps(false);
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        setDimensionsKm(widthKm, heightKm, { lat, lng });
        setSearchQuery(`My Location [${lat.toFixed(4)}°, ${lng.toFixed(4)}°]`);
        mapInstanceRef.current?.setView([lat, lng], 13, { animate: true });
      },
      (err) => {
        setIsLocatingGps(false);
        console.warn("Geolocation failed:", err);
        if (err.code === 1) {
          setSearchError(
            "Location access denied. Type your city, landmark, or coordinates in the search box."
          );
        } else if (err.code === 2) {
          setSearchError("GPS position unavailable. Please search by name or enter coordinates.");
        } else {
          setSearchError("Could not retrieve GPS location. Try typing coordinates like '37.77, -122.41'.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Place Geocoding search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const url = `/api/geocode?q=${encodeURIComponent(searchQuery.trim())}${
        clientKey ? `&key=${encodeURIComponent(clientKey)}` : ""
      }`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success && typeof data.lat === "number" && typeof data.lng === "number") {
        setDimensionsKm(widthKm, heightKm, { lat: data.lat, lng: data.lng });
        setSearchQuery(data.displayName || searchQuery);
        mapInstanceRef.current?.setView([data.lat, data.lng], 13, { animate: true });
      } else {
        setSearchError(
          data.error || "Location not found. Try typing coordinates like '37.77, -122.41' or a known landmark."
        );
      }
    } catch (err: any) {
      setSearchError("Location search failed. Check your connection or enter coordinates directly.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Left 2 Cols: Interactive Map Viewport with Draggable Handles */}
      <div className="lg:col-span-2 space-y-3">
        {/* Search Bar & Layer Switcher */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#45A29E] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="input-location-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search mountain, valley, landmark or coordinates..."
                className="w-full bg-[#1F2833] border border-[#45A29E]/30 text-xs font-mono text-white pl-8 pr-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-[#66FCF1] placeholder-[#C5C6C7]/40"
              />
            </div>
            <button
              id="btn-search-location"
              type="submit"
              disabled={isSearching}
              className="px-3.5 py-2 bg-[#45A29E] hover:bg-[#66FCF1] text-[#0B0C10] font-bold text-xs uppercase tracking-wider rounded transition shrink-0"
            >
              {isSearching ? "LOCATING..." : "LOCATE"}
            </button>
            <button
              id="btn-use-my-location"
              type="button"
              onClick={handleUseMyLocation}
              disabled={isLocatingGps}
              className="px-2.5 py-2 bg-[#1F2833] hover:bg-[#111418] border border-[#45A29E]/40 text-[#66FCF1] font-mono text-xs uppercase tracking-wider rounded transition shrink-0 flex items-center gap-1.5"
              title="Use current device GPS coordinates"
            >
              <LocateFixed className={`w-3.5 h-3.5 text-[#45A29E] ${isLocatingGps ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{isLocatingGps ? "DETECTING..." : "MY GPS"}</span>
            </button>
          </form>

          {/* Map Layer Switcher */}
          <div className="flex items-center rounded bg-[#111418] border border-[#1F2833] p-1 self-start sm:self-auto shrink-0 font-mono text-[11px]">
            <button
              id="btn-layer-satellite"
              onClick={() => setMapType("satellite")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider ${
                mapType === "satellite"
                  ? "bg-[#45A29E] text-[#0B0C10] font-bold shadow-[0_0_8px_rgba(69,162,158,0.4)]"
                  : "text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              SATELLITE
            </button>
            <button
              id="btn-layer-terrain"
              onClick={() => setMapType("terrain")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider ${
                mapType === "terrain"
                  ? "bg-[#45A29E] text-[#0B0C10] font-bold shadow-[0_0_8px_rgba(69,162,158,0.4)]"
                  : "text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              TERRAIN
            </button>
            <button
              id="btn-layer-topo"
              onClick={() => setMapType("topo")}
              className={`px-2.5 py-1 rounded transition uppercase tracking-wider ${
                mapType === "topo"
                  ? "bg-[#45A29E] text-[#0B0C10] font-bold shadow-[0_0_8px_rgba(69,162,158,0.4)]"
                  : "text-[#C5C6C7]/70 hover:text-white"
              }`}
            >
              TOPO
            </button>
          </div>
        </div>

        {searchError && (
          <p className="text-xs font-mono text-rose-300 bg-[#1F2833] border border-rose-500/50 px-3 py-1.5 rounded">
            {searchError}
          </p>
        )}

        {/* Real Interactive Map Viewport with Draggable Crop Box */}
        <div className="relative rounded-lg border border-[#1F2833] bg-[#0B0C10] overflow-hidden shadow-2xl group">
          <div
            ref={mapContainerRef}
            id="map-viewport"
            className="w-full h-80 sm:h-[440px] z-0"
            title="Pan map freely • Drag handles to resize • Drag center ✛ to move crop box"
          />

          {/* Floating Top HUD over viewport */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-[400]">
            <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={handleRecenterMapOnAoi}
                className="px-2.5 py-1 text-[11px] font-mono font-semibold rounded bg-[#0B0C10]/90 hover:bg-[#1F2833] text-[#66FCF1] border border-[#45A29E]/50 backdrop-blur-sm flex items-center gap-1.5 shadow-md transition"
                title="Click to center map camera on this selection"
              >
                <Crosshair className="w-3.5 h-3.5 text-[#66FCF1]" />
                {center.lat.toFixed(4)}°, {center.lng.toFixed(4)}°
              </button>
              <span className="px-2.5 py-1 text-[11px] font-mono font-bold rounded bg-[#0B0C10]/90 text-white border border-[#1F2833] backdrop-blur-sm shadow-md">
                {widthKm} &times; {heightKm} KM
              </span>
              <span className="px-2 py-1 text-[10px] font-mono rounded bg-[#0B0C10]/90 text-[#45A29E] border border-[#1F2833] backdrop-blur-sm">
                {aspectRatio}:1 ({lockSquare ? "SQUARE 1:1" : "CUSTOM RECT"})
              </span>
            </div>

            {/* Quick Map Alignment Actions */}
            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={handleRecenterMapOnAoi}
                className="px-2.5 py-1 text-[11px] font-mono rounded bg-[#0B0C10]/90 hover:bg-[#1F2833] border border-[#45A29E]/40 text-[#66FCF1] backdrop-blur-sm shadow-md transition flex items-center gap-1"
                title="Focus map viewport on current selection"
              >
                <Crosshair className="w-3 h-3 text-[#45A29E]" />
                <span className="hidden sm:inline">FOCUS ON AOI</span>
              </button>
              <button
                type="button"
                onClick={handleMoveAoiToViewCenter}
                className="px-2.5 py-1 text-[11px] font-mono rounded bg-[#0B0C10]/90 hover:bg-[#1F2833] border border-[#45A29E]/40 text-[#C5C6C7] hover:text-white backdrop-blur-sm shadow-md transition flex items-center gap-1"
                title="Move selection box to the center of your current screen"
              >
                <MapPin className="w-3 h-3 text-[#45A29E]" />
                <span className="hidden sm:inline">SNAP AOI HERE</span>
              </button>
            </div>
          </div>

          {/* Floating Bottom HUD */}
          <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none z-[400]">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-[#0B0C10]/90 text-[10px] font-mono text-[#C5C6C7] border border-[#1F2833] backdrop-blur-sm shadow-md">
              <Move className="w-3 h-3 text-[#66FCF1]" />
              <span>Drag corners/edges to resize &bull; Drag center ✛ to translate</span>
            </div>

            <div className="ml-auto pointer-events-auto">
              <button
                id="btn-open-streetview"
                onClick={onOpenStreetView}
                className="px-3 py-1.5 bg-[#0B0C10]/95 hover:bg-[#1F2833] border border-[#45A29E]/50 text-xs font-mono text-[#66FCF1] rounded backdrop-blur-sm flex items-center gap-1.5 shadow-md transition"
                title="Inspect real 360° Google Street View vantage point"
              >
                <Eye className="w-3.5 h-3.5 text-[#45A29E]" />
                STREET VIEW VANTAGE
              </button>
            </div>
          </div>
        </div>

        {/* Viewport Hint */}
        <div className="flex items-center justify-between gap-2 px-1 text-[11px] font-mono text-[#C5C6C7]/60">
          <span className="flex items-center gap-1.5">
            <Move className="w-3.5 h-3.5 text-[#45A29E]" />
            <span>Pan map independently &bull; Selection remains locked to geographic ground</span>
          </span>
          <span className="text-[#45A29E] font-semibold hidden sm:inline">
            CUSTOM RECTANGLES &amp; SQUARES SUPPORTED
          </span>
        </div>
      </div>

      {/* Right Col: Capture Parameters, Aspect Ratios & Dimension Sliders */}
      <div className="space-y-4">
        <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#1F2833] pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#45A29E]" />
              AOI DIMENSIONS &amp; RATIO
            </h3>
            <span className="text-[10px] font-mono text-[#45A29E]">CH_01</span>
          </div>

          {/* Aspect Ratio Preset Selector */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#C5C6C7]">SELECTION SHAPE</span>
              <button
                type="button"
                onClick={() => setLockSquare(!lockSquare)}
                className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded transition ${
                  lockSquare
                    ? "bg-[#1F2833] border border-[#66FCF1] text-[#66FCF1]"
                    : "text-[#C5C6C7]/60 hover:text-white"
                }`}
                title="Toggle 1:1 square aspect ratio lock"
              >
                {lockSquare ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                <span>{lockSquare ? "1:1 LOCKED" : "FREEFORM"}</span>
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1 font-mono text-[10px]">
              <button
                type="button"
                onClick={() => handleAspectPreset("free")}
                className={`py-1.5 px-1 rounded border transition text-center ${
                  !lockSquare && aspectPreset === "free"
                    ? "bg-[#1F2833] border-[#66FCF1] text-[#66FCF1] font-bold shadow-[0_0_8px_rgba(102,252,241,0.2)]"
                    : "bg-[#111418] border-[#1F2833] text-[#C5C6C7]/70 hover:text-white"
                }`}
                title="Freeform rectangular selection of any arbitrary proportions"
              >
                FREE
              </button>
              <button
                type="button"
                onClick={() => handleAspectPreset("1:1")}
                className={`py-1.5 px-1 rounded border transition text-center ${
                  lockSquare || aspectPreset === "1:1"
                    ? "bg-[#1F2833] border-[#66FCF1] text-[#66FCF1] font-bold shadow-[0_0_8px_rgba(102,252,241,0.2)]"
                    : "bg-[#111418] border-[#1F2833] text-[#C5C6C7]/70 hover:text-white"
                }`}
                title="Strict 1:1 square ratio (Unreal Engine / Unity standard heightmaps)"
              >
                1:1 SQ
              </button>
              <button
                type="button"
                onClick={() => handleAspectPreset("4:3")}
                className={`py-1.5 px-1 rounded border transition text-center ${
                  aspectPreset === "4:3"
                    ? "bg-[#1F2833] border-[#66FCF1] text-[#66FCF1] font-bold shadow-[0_0_8px_rgba(102,252,241,0.2)]"
                    : "bg-[#111418] border-[#1F2833] text-[#C5C6C7]/70 hover:text-white"
                }`}
                title="4:3 landscape ratio"
              >
                4:3
              </button>
              <button
                type="button"
                onClick={() => handleAspectPreset("16:9")}
                className={`py-1.5 px-1 rounded border transition text-center ${
                  aspectPreset === "16:9"
                    ? "bg-[#1F2833] border-[#66FCF1] text-[#66FCF1] font-bold shadow-[0_0_8px_rgba(102,252,241,0.2)]"
                    : "bg-[#111418] border-[#1F2833] text-[#C5C6C7]/70 hover:text-white"
                }`}
                title="16:9 cinematic widescreen ratio"
              >
                16:9
              </button>
              <button
                type="button"
                onClick={() => handleAspectPreset("2:1")}
                className={`py-1.5 px-1 rounded border transition text-center ${
                  aspectPreset === "2:1"
                    ? "bg-[#1F2833] border-[#66FCF1] text-[#66FCF1] font-bold shadow-[0_0_8px_rgba(102,252,241,0.2)]"
                    : "bg-[#111418] border-[#1F2833] text-[#C5C6C7]/70 hover:text-white"
                }`}
                title="2:1 panoramic ridge or valley ratio"
              >
                2:1
              </button>
            </div>
          </div>

          {/* Width (East-West) Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#C5C6C7]">WIDTH (EAST - WEST)</span>
              <span className="text-[#66FCF1] font-bold">{widthKm} KM</span>
            </div>
            <input
              id="slider-width-km"
              type="range"
              min={1}
              max={30}
              step={0.5}
              value={Math.min(30, Math.max(1, widthKm))}
              onChange={(e) => {
                const newW = Number(e.target.value);
                const newH = lockSquare ? newW : heightKm;
                setDimensionsKm(newW, newH);
              }}
              className="w-full accent-[#45A29E] cursor-pointer"
            />
          </div>

          {/* Height (North-South) Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#C5C6C7]">HEIGHT (NORTH - SOUTH)</span>
              <span className="text-[#66FCF1] font-bold">{heightKm} KM</span>
            </div>
            <input
              id="slider-height-km"
              type="range"
              min={1}
              max={30}
              step={0.5}
              value={Math.min(30, Math.max(1, heightKm))}
              onChange={(e) => {
                const newH = Number(e.target.value);
                const newW = lockSquare ? newH : widthKm;
                setDimensionsKm(newW, newH);
              }}
              className="w-full accent-[#45A29E] cursor-pointer"
            />
          </div>

          {/* Elevation Data Source Selector */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#C5C6C7]">ELEVATION SOURCE</span>
              <span className="text-[#66FCF1] font-bold text-[11px]">
                {elevationSource === "auto"
                  ? elevationActive
                    ? "AUTO (GOOGLE)"
                    : "AUTO (TERRARIUM 30M)"
                  : elevationSource === "terrarium"
                  ? "TERRARIUM 30M"
                  : elevationSource === "google"
                  ? "GOOGLE MAPS"
                  : "OPEN-METEO"}
              </span>
            </div>
            {setElevationSource && (
              <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() => setElevationSource("auto")}
                  className={`py-1.5 px-2 rounded border transition text-center ${
                    elevationSource === "auto"
                      ? "bg-[#1F2833] border-[#66FCF1] text-[#66FCF1] font-bold shadow-[0_0_8px_rgba(102,252,241,0.15)]"
                      : "bg-[#111418] border-[#1F2833] text-[#C5C6C7]/70 hover:text-white"
                  }`}
                  title="Automatically selects best available active provider"
                >
                  AUTO
                  <span className="block text-[8px] text-[#45A29E]">OPTIMAL</span>
                </button>
                <button
                  type="button"
                  onClick={() => setElevationSource("terrarium")}
                  className={`py-1.5 px-2 rounded border transition text-center ${
                    elevationSource === "terrarium"
                      ? "bg-[#1F2833] border-[#66FCF1] text-[#66FCF1] font-bold shadow-[0_0_8px_rgba(102,252,241,0.15)]"
                      : "bg-[#111418] border-[#1F2833] text-[#C5C6C7]/70 hover:text-white"
                  }`}
                  title="High-precision global 30m DEM tiles (NASA SRTM, USGS 3DEP &amp; Copernicus LiDAR)"
                >
                  TERRARIUM
                  <span className="block text-[8px] text-[#45A29E]">30M GLOBAL</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!elevationActive && onOpenKeyModal) {
                      onOpenKeyModal();
                    } else {
                      setElevationSource("google");
                    }
                  }}
                  className={`py-1.5 px-2 rounded border transition text-center ${
                    elevationSource === "google"
                      ? "bg-[#1F2833] border-[#66FCF1] text-[#66FCF1] font-bold shadow-[0_0_8px_rgba(102,252,241,0.15)]"
                      : "bg-[#111418] border-[#1F2833] text-[#C5C6C7]/70 hover:text-white"
                  }`}
                  title={
                    elevationActive
                      ? "Google Maps Elevation API (Active)"
                      : "Google Elevation API (Click to configure or enable)"
                  }
                >
                  GOOGLE
                  <span
                    className={`block text-[8px] ${
                      elevationActive ? "text-emerald-400 font-bold" : "text-amber-400/80"
                    }`}
                  >
                    {elevationActive ? "ACTIVE" : "KEY / SETUP"}
                  </span>
                </button>
              </div>
            )}

            {elevationNotice && (
              <div className="p-2 rounded bg-[#1F2833]/60 border border-[#45A29E]/30 text-[10px] font-mono text-[#C5C6C7] flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-[#66FCF1] shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-[#66FCF1] font-semibold">Active: Terrarium 30m Global DEM</p>
                  <p className="text-[#C5C6C7]/70 leading-tight">
                    Utilizing high-precision NASA SRTM &amp; Copernicus 30m DEM tiles for elevation grid sampling.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Grid Sampling Resolution */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#C5C6C7]">SAMPLING RESOLUTION</span>
              <span className="text-[#66FCF1] font-bold">
                {resolution} &times; {resolution} ({resolution * resolution} PTS)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[32, 64, 128].map((resVal) => (
                <button
                  key={resVal}
                  type="button"
                  onClick={() => setResolution(resVal)}
                  className={`py-2 px-2 text-xs font-mono rounded border transition text-center ${
                    resolution === resVal
                      ? "bg-[#1F2833] border-[#66FCF1] text-[#66FCF1] font-bold shadow-[0_0_8px_rgba(102,252,241,0.2)]"
                      : "bg-[#111418] border-[#1F2833] text-[#C5C6C7]/70 hover:text-white hover:border-[#45A29E]/30"
                  }`}
                >
                  {resVal}&times;{resVal}
                  <span className="block text-[9px] font-normal text-[#45A29E] uppercase tracking-tighter mt-0.5">
                    {resVal === 32 ? "FAST" : resVal === 64 ? "BALANCED" : "HIGH-RES"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Geographic Extents & Footprint Stats */}
          <div className="bg-[#0B0C10] border border-[#1F2833] rounded p-3 space-y-1.5 font-mono text-[11px] text-[#C5C6C7]">
            <div className="text-[#45A29E] text-[10px] font-bold uppercase tracking-wider flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5">
                <Info className="w-3 h-3 text-[#66FCF1]" />
                SELECTION FOOTPRINT
              </span>
              <span className="text-[#66FCF1] font-normal">{surfaceAreaKm2} KM² AREA</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] border-b border-[#1F2833] pb-1.5 mb-1.5">
              <div className="flex justify-between">
                <span className="text-[#C5C6C7]/60">WIDTH:</span>
                <span className="text-white">{widthKm} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#C5C6C7]/60">HEIGHT:</span>
                <span className="text-white">{heightKm} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#C5C6C7]/60">ASPECT:</span>
                <span className="text-[#66FCF1]">{aspectRatio}:1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#C5C6C7]/60">SHAPE:</span>
                <span className="text-[#C5C6C7]">{lockSquare ? "Square" : "Rectangle"}</span>
              </div>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-[#C5C6C7]/60">NORTH:</span>
              <span className="text-white">{bbox.north.toFixed(5)}°</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-[#C5C6C7]/60">SOUTH:</span>
              <span className="text-white">{bbox.south.toFixed(5)}°</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-[#C5C6C7]/60">EAST:</span>
              <span className="text-white">{bbox.east.toFixed(5)}°</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-[#C5C6C7]/60">WEST:</span>
              <span className="text-white">{bbox.west.toFixed(5)}°</span>
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            id="btn-generate-terrain"
            onClick={() => onGenerate(resolution)}
            disabled={isGenerating}
            className={`w-full py-2.5 px-4 rounded font-bold text-xs uppercase tracking-wider text-[#0B0C10] flex items-center justify-center gap-2 shadow-lg transition duration-200 ${
              isGenerating
                ? "bg-[#45A29E]/50 cursor-wait text-white/50"
                : "bg-[#45A29E] hover:bg-[#66FCF1] active:scale-[0.99] shadow-[0_0_12px_rgba(69,162,158,0.3)]"
            }`}
          >
            {isGenerating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-[#0B0C10] border-t-transparent rounded-full animate-spin" />
                <span>SAMPLING TOPOGRAPHY &bull; MESHING...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>GENERATE HEIGHTMAP &bull; 3D GLTF</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </>
            )}
          </button>
        </div>

        {/* Interactive Tips */}
        <div className="bg-[#111418] border border-[#1F2833] rounded-lg p-3.5 text-xs font-mono space-y-2">
          <p className="font-bold text-[10px] text-[#45A29E] uppercase tracking-wider">
            DRAGGABLE SELECTOR TIPS:
          </p>
          <ul className="space-y-1.5 text-[11px] text-[#C5C6C7]/70">
            <li className="flex items-start gap-1.5">
              <span className="text-[#66FCF1] font-bold">&bull;</span>
              <span>
                <strong className="text-white">Custom Rectangles:</strong> Selections do not need to be square! Drag edge or corner handles to shape any valley, ridge, or coastal layout.
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-[#66FCF1] font-bold">&bull;</span>
              <span>
                <strong className="text-white">Center Stability:</strong> Panning the map will no longer lose your target point. The crop box stays anchored until you drag it.
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-[#66FCF1] font-bold">&bull;</span>
              <span>
                <strong className="text-white">Translate AOI:</strong> Click and drag the glowing center reticle (<span className="text-[#66FCF1]">✛</span>) to move the entire box anywhere on Earth.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
