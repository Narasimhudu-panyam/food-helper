import { LocationCoordinates } from "@/types";

export interface MapMarker {
  id?: string;
  position: LocationCoordinates;
  title?: string;
  description?: string;
  variant?: "business" | "organization" | "volunteer" | "donation" | "default";
  radiusKm?: number;
}

/**
 * Validates whether latitude and longitude are within standard geographic bounds.
 */
export function isValidCoordinates(
  lat?: number | null,
  lng?: number | null
): boolean {
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    return false;
  }
  if (typeof lat !== "number" || typeof lng !== "number") {
    return false;
  }
  if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
    return false;
  }
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Format coordinates for clean, uniform display.
 */
export function formatCoordinates(
  lat?: number | null,
  lng?: number | null,
  precision: number = 4
): string {
  if (!isValidCoordinates(lat, lng)) {
    return "Coordinates not set";
  }
  return `${lat!.toFixed(precision)}, ${lng!.toFixed(precision)}`;
}

/**
 * Generates an external OpenStreetMap link for a location.
 */
export function getOpenStreetMapUrl(coords: LocationCoordinates, zoom: number = 16): string {
  return `https://www.openstreetmap.org/?mlat=${coords.latitude}&mlon=${coords.longitude}#map=${zoom}/${coords.latitude}/${coords.longitude}`;
}

/**
 * Generates an external Google Maps directions or search link.
 */
export function getExternalDirectionsUrl(
  destination: LocationCoordinates,
  origin?: LocationCoordinates
): string {
  if (origin && isValidCoordinates(origin.latitude, origin.longitude)) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&travelmode=driving`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${destination.latitude},${destination.longitude}`;
}

/**
 * Safe single-shot browser geolocation helper.
 * Only runs on explicit user click, never polls continuously.
 */
export function getCurrentBrowserLocation(): Promise<LocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: parseFloat(position.coords.latitude.toFixed(6)),
          longitude: parseFloat(position.coords.longitude.toFixed(6)),
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error("Location permission was denied. You can still enter coordinates manually."));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error("Location information is currently unavailable."));
            break;
          case error.TIMEOUT:
            reject(new Error("The request to get your location timed out."));
            break;
          default:
            reject(new Error("An error occurred while fetching current location."));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  });
}
