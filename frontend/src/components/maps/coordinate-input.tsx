"use client";

import React, { useState } from "react";
import { Compass, Locate, MapPin, Sparkles } from "lucide-react";
import { LocationCoordinates } from "@/types";
import {
  getCurrentBrowserLocation,
  isValidCoordinates,
} from "@/lib/maps/location-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { LocationMap } from "./location-map";

export interface CoordinateInputProps {
  latitude: number | undefined;
  longitude: number | undefined;
  onChange: (coords: LocationCoordinates) => void;
  latError?: string;
  lngError?: string;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  allowMapPick?: boolean;
  defaultZoom?: number;
}

export function CoordinateInput({
  latitude,
  longitude,
  onChange,
  latError,
  lngError,
  disabled = false,
  label = "Geographic Coordinates",
  helperText = "Latitude (-90 to 90) and Longitude (-180 to 180)",
  allowMapPick = true,
  defaultZoom = 13,
}: CoordinateInputProps) {
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [showMapPicker, setShowMapPicker] = useState<boolean>(false);

  const hasValidCoords = isValidCoordinates(latitude, longitude);

  const handleUseCurrentLocation = async () => {
    setGeoError(null);
    setIsLocating(true);
    try {
      const coords = await getCurrentBrowserLocation();
      onChange(coords);
    } catch (err: any) {
      setGeoError(err.message || "Could not retrieve your current location.");
    } finally {
      setIsLocating(false);
    }
  };

  const handleLatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onChange({
      latitude: isNaN(val) ? 0 : val,
      longitude: longitude ?? 0,
    });
  };

  const handleLngChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onChange({
      latitude: latitude ?? 0,
      longitude: isNaN(val) ? 0 : val,
    });
  };

  const handleMapLocationSelect = (coords: LocationCoordinates) => {
    onChange(coords);
  };

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label className="text-xs font-bold text-zinc-900 block">{label}</label>
          <p className="text-[11px] text-zinc-500">{helperText}</p>
        </div>

        <div className="flex items-center space-x-2">
          {allowMapPick && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowMapPicker(!showMapPicker)}
              disabled={disabled}
              className="text-xs h-7.5 px-2.5"
              leftIcon={<MapPin className="h-3 w-3 mr-1 text-zinc-500" />}
            >
              {showMapPicker ? "Hide Map Picker" : "Pick on Map"}
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUseCurrentLocation}
            isLoading={isLocating}
            disabled={disabled || isLocating}
            className="text-xs h-7.5 px-2.5"
            title="Fetches coordinates using your browser GPS upon explicit click"
            leftIcon={<Locate className="h-3 w-3 mr-1 text-emerald-600" />}
          >
            Use My Location
          </Button>
        </div>
      </div>

      {geoError && (
        <Alert
          variant="warning"
          title="Location Notice"
          onDismiss={() => setGeoError(null)}
        >
          {geoError}
        </Alert>
      )}

      {/* Lat / Lng inputs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Latitude"
          type="number"
          step="any"
          placeholder="e.g. 37.7749"
          value={latitude !== undefined && !isNaN(latitude) ? latitude : ""}
          onChange={handleLatChange}
          error={latError}
          disabled={disabled}
          helperText="Geographic north/south offset"
        />

        <Input
          label="Longitude"
          type="number"
          step="any"
          placeholder="e.g. -122.4194"
          value={longitude !== undefined && !isNaN(longitude) ? longitude : ""}
          onChange={handleLngChange}
          error={lngError}
          disabled={disabled}
          helperText="Geographic east/west offset"
        />
      </div>

      {/* Collapsible Interactive Map Picker */}
      {showMapPicker && (
        <div className="pt-2 border-t border-zinc-200">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
            <span>Click on the map to place the coordinate pin</span>
            {hasValidCoords && (
              <span className="font-mono text-zinc-700">
                Selected: {latitude?.toFixed(4)}, {longitude?.toFixed(4)}
              </span>
            )}
          </div>
          <LocationMap
            center={
              hasValidCoords
                ? { latitude: latitude!, longitude: longitude! }
                : { latitude: 37.7749, longitude: -122.4194 }
            }
            zoom={defaultZoom}
            height="220px"
            selectionMode={true}
            selectedLocation={
              hasValidCoords
                ? { latitude: latitude!, longitude: longitude! }
                : null
            }
            onLocationSelect={handleMapLocationSelect}
            showExternalLinks={false}
          />
        </div>
      )}
    </div>
  );
}
