"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocationCoordinates } from "@/types";
import { isValidCoordinates, MapMarker } from "@/lib/maps/location-utils";

export interface LeafletMapProps {
  center?: LocationCoordinates;
  zoom?: number;
  markers?: MapMarker[];
  height?: string;
  className?: string;
  interactive?: boolean;
  onLocationSelect?: (coords: LocationCoordinates) => void;
  selectionMode?: boolean;
  selectedLocation?: LocationCoordinates | null;
  showServiceRadius?: boolean;
  serviceRadiusKm?: number;
}

function getMarkerIcon(variant?: MapMarker["variant"]) {
  let bgColor = "bg-emerald-600";
  let borderColor = "border-white";
  let ringColor = "ring-emerald-400/40";
  let iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;

  if (variant === "organization") {
    bgColor = "bg-blue-600";
    ringColor = "ring-blue-400/40";
  } else if (variant === "volunteer") {
    bgColor = "bg-purple-600";
    ringColor = "ring-purple-400/40";
  } else if (variant === "donation") {
    bgColor = "bg-amber-600";
    ringColor = "ring-amber-400/40";
  }

  return L.divIcon({
    className: "custom-leaflet-marker",
    html: `
      <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-full">
        <div class="flex h-8 w-8 items-center justify-center rounded-full ${bgColor} shadow-lg ring-4 ${ringColor} ${borderColor} border-2 transition-transform hover:scale-110">
          ${iconHtml}
        </div>
        <div class="absolute -bottom-1.5 h-2 w-2 rotate-45 ${bgColor}"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

function getSelectionIcon() {
  return L.divIcon({
    className: "custom-selection-marker",
    html: `
      <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-full animate-bounce">
        <div class="flex h-9 w-9 items-center justify-center rounded-full bg-rose-600 text-white shadow-xl ring-4 ring-rose-400/40 border-2 border-white">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <div class="absolute -bottom-1.5 h-2 w-2 rotate-45 bg-rose-600"></div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
}

export function LeafletMapInner({
  center,
  zoom = 14,
  markers = [],
  height = "280px",
  className = "",
  interactive = true,
  onLocationSelect,
  selectionMode = false,
  selectedLocation,
  showServiceRadius = false,
  serviceRadiusKm,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current) return;

    // Determine initial center
    const initialLat = center?.latitude ?? (markers[0]?.position.latitude ?? 37.7749);
    const initialLng = center?.longitude ?? (markers[0]?.position.longitude ?? -122.4194);

    const map = L.map(containerRef.current, {
      center: [initialLat, initialLng],
      zoom: zoom,
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive ? "center" : false,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      attributionControl: true,
    });

    // Add OpenStreetMap Standard Tile Layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);

    mapRef.current = map;
    layerGroupRef.current = layerGroup;

    // Fix possible Leaflet container sizing bug when mounted in flex/grid
    const timeout = setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      clearTimeout(timeout);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Update Markers, Selection, Circles, and Bounds
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const boundsPoints: [number, number][] = [];

    // Render regular markers
    markers.forEach((marker) => {
      if (isValidCoordinates(marker.position.latitude, marker.position.longitude)) {
        const latLng: [number, number] = [marker.position.latitude, marker.position.longitude];
        boundsPoints.push(latLng);

        const leafMarker = L.marker(latLng, {
          icon: getMarkerIcon(marker.variant),
          title: marker.title,
        });

        if (marker.title || marker.description) {
          leafMarker.bindPopup(`
            <div class="p-1 font-sans text-xs">
              ${marker.title ? `<div class="font-bold text-zinc-900">${marker.title}</div>` : ""}
              ${marker.description ? `<div class="text-zinc-600 mt-0.5">${marker.description}</div>` : ""}
              <div class="text-[10px] text-zinc-400 font-mono mt-1">${latLng[0].toFixed(4)}, ${latLng[1].toFixed(4)}</div>
            </div>
          `);
        }

        leafMarker.addTo(layerGroup);

        // If this marker has radius specified
        if (marker.radiusKm && marker.radiusKm > 0) {
          L.circle(latLng, {
            radius: marker.radiusKm * 1000,
            color: "#8b5cf6",
            weight: 1.5,
            fillColor: "#8b5cf6",
            fillOpacity: 0.12,
            dashArray: "4, 6",
          }).addTo(layerGroup);
        }
      }
    });

    // Render selected location pin if in selection mode or explicitly provided
    if (selectedLocation && isValidCoordinates(selectedLocation.latitude, selectedLocation.longitude)) {
      const selectLatLng: [number, number] = [
        selectedLocation.latitude,
        selectedLocation.longitude,
      ];
      boundsPoints.push(selectLatLng);

      const selMarker = L.marker(selectLatLng, {
        icon: getSelectionIcon(),
        title: "Selected Location",
      });
      selMarker.bindPopup(`
        <div class="p-1 font-sans text-xs">
          <div class="font-bold text-rose-700">Selected Location</div>
          <div class="text-[10px] text-zinc-500 font-mono mt-0.5">${selectLatLng[0].toFixed(6)}, ${selectLatLng[1].toFixed(6)}</div>
        </div>
      `);
      selMarker.addTo(layerGroup);
    }

    // Render service radius circle around center if requested
    if (
      showServiceRadius &&
      serviceRadiusKm &&
      serviceRadiusKm > 0 &&
      center &&
      isValidCoordinates(center.latitude, center.longitude)
    ) {
      L.circle([center.latitude, center.longitude], {
        radius: serviceRadiusKm * 1000,
        color: "#9333ea",
        weight: 1.5,
        fillColor: "#9333ea",
        fillOpacity: 0.1,
        dashArray: "5, 5",
      }).addTo(layerGroup);
    }

    // Adjust view/bounds
    if (boundsPoints.length > 1) {
      const latLngBounds = L.latLngBounds(boundsPoints);
      map.fitBounds(latLngBounds, { padding: [40, 40], maxZoom: 15 });
    } else if (center && isValidCoordinates(center.latitude, center.longitude)) {
      map.setView([center.latitude, center.longitude], zoom);
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], zoom);
    }
  }, [center, zoom, markers, selectedLocation, showServiceRadius, serviceRadiusKm]);

  // Click-to-select location event listener
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (selectionMode || onLocationSelect) {
        const coords: LocationCoordinates = {
          latitude: parseFloat(e.latlng.lat.toFixed(6)),
          longitude: parseFloat(e.latlng.lng.toFixed(6)),
        };
        onLocationSelect?.(coords);
      }
    };

    if (selectionMode || onLocationSelect) {
      map.on("click", handleClick);
    }

    return () => {
      map.off("click", handleClick);
    };
  }, [selectionMode, onLocationSelect]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%" }}
      className={`relative z-10 overflow-hidden rounded-xl border border-zinc-200 shadow-inner ${className}`}
      tabIndex={0}
      aria-label="Map location preview"
    />
  );
}
