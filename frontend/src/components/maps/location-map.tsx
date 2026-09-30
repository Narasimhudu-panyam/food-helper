"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import {
  ExternalLink,
  Layers,
  MapPin,
  MapPinOff,
  Navigation,
} from "lucide-react";
import { LocationCoordinates } from "@/types";
import {
  getExternalDirectionsUrl,
  getOpenStreetMapUrl,
  isValidCoordinates,
  MapMarker,
} from "@/lib/maps/location-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { LeafletMapProps } from "./leaflet-map";

// Dynamically import Leaflet map with SSR disabled
const LeafletMap = dynamic(
  () => import("./leaflet-map").then((mod) => mod.LeafletMapInner),
  {
    ssr: false,
    loading: () => <MapLoadingSkeleton height="280px" />,
  }
);

function MapLoadingSkeleton({ height = "280px" }: { height?: string }) {
  return (
    <div
      style={{ height }}
      className="relative flex w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100/80 p-6"
    >
      <div className="flex flex-col items-center space-y-2.5 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-xs">
          <MapPin className="h-5 w-5 animate-pulse text-zinc-400" />
        </div>
        <p className="text-xs font-semibold text-zinc-600">Loading Map View...</p>
        <p className="text-[11px] text-zinc-400">Rendering spatial coordinates</p>
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
    </div>
  );
}

export interface LocationMapProps extends LeafletMapProps {
  showExternalLinks?: boolean;
  externalOrigin?: LocationCoordinates;
  emptyMessage?: string;
  emptyTitle?: string;
  title?: string;
}

export function LocationMap({
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
  showExternalLinks = true,
  externalOrigin,
  emptyMessage = "No geographic coordinates are configured for this record.",
  emptyTitle = "Location Not Configured",
  title,
}: LocationMapProps) {
  const [mapError, setMapError] = useState<boolean>(false);

  // Check if we have valid coordinates
  const hasValidCenter = center && isValidCoordinates(center.latitude, center.longitude);
  const hasValidMarkers = markers.some((m) =>
    isValidCoordinates(m.position.latitude, m.position.longitude)
  );
  const hasValidSelected =
    selectedLocation &&
    isValidCoordinates(selectedLocation.latitude, selectedLocation.longitude);

  const isConfigured = hasValidCenter || hasValidMarkers || hasValidSelected;

  if (!isConfigured && !selectionMode) {
    return (
      <div
        style={{ height }}
        className={`flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-6 text-center ${className}`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 mb-2">
          <MapPinOff className="h-5 w-5" />
        </div>
        <h4 className="text-xs font-bold text-zinc-800">{emptyTitle}</h4>
        <p className="mt-1 text-[11px] text-zinc-500 max-w-sm">{emptyMessage}</p>
      </div>
    );
  }

  const primaryTargetCoords: LocationCoordinates | null =
    center && isValidCoordinates(center.latitude, center.longitude)
      ? center
      : markers[0]?.position &&
        isValidCoordinates(markers[0].position.latitude, markers[0].position.longitude)
      ? markers[0].position
      : selectedLocation &&
        isValidCoordinates(selectedLocation.latitude, selectedLocation.longitude)
      ? selectedLocation
      : null;

  return (
    <div className={`space-y-2 ${className}`}>
      {title && (
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
            {title}
          </h4>
          {primaryTargetCoords && showExternalLinks && (
            <div className="flex items-center space-x-2">
              <a
                href={getOpenStreetMapUrl(primaryTargetCoords)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-[11px] font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
                title="Open location on OpenStreetMap"
              >
                OSM <ExternalLink className="h-3 w-3 ml-0.5" />
              </a>
              <span className="text-zinc-300">•</span>
              <a
                href={getExternalDirectionsUrl(primaryTargetCoords, externalOrigin)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                title="Open driving directions"
              >
                Directions <Navigation className="h-3 w-3 ml-0.5" />
              </a>
            </div>
          )}
        </div>
      )}

      {mapError ? (
        <div
          style={{ height }}
          className="flex w-full flex-col items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-2">
            <MapPin className="h-5 w-5" />
          </div>
          <h4 className="text-xs font-bold text-zinc-800">Map Preview Unavailable</h4>
          {primaryTargetCoords && (
            <p className="mt-1 text-xs font-mono text-zinc-600">
              Coordinates: {primaryTargetCoords.latitude.toFixed(4)},{" "}
              {primaryTargetCoords.longitude.toFixed(4)}
            </p>
          )}
          {primaryTargetCoords && (
            <div className="mt-3 flex items-center space-x-2">
              <a
                href={getExternalDirectionsUrl(primaryTargetCoords)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 border border-zinc-200 shadow-xs hover:bg-zinc-50"
              >
                Open External Maps <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="relative">
          <LeafletMap
            center={center}
            zoom={zoom}
            markers={markers}
            height={height}
            interactive={interactive}
            onLocationSelect={onLocationSelect}
            selectionMode={selectionMode}
            selectedLocation={selectedLocation}
            showServiceRadius={showServiceRadius}
            serviceRadiusKm={serviceRadiusKm}
          />

          {selectionMode && (
            <div className="absolute bottom-2 left-2 z-20 rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-md backdrop-blur-xs border border-zinc-200 pointer-events-none">
              Click anywhere on the map to place coordinates pin
            </div>
          )}
        </div>
      )}
    </div>
  );
}
