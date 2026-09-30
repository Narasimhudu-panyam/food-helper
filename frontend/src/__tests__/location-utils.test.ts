import { describe, it, expect } from "vitest";
import {
  isValidCoordinates,
  formatCoordinates,
  getOpenStreetMapUrl,
  getExternalDirectionsUrl,
} from "@/lib/maps/location-utils";

describe("location-utils", () => {
  describe("isValidCoordinates", () => {
    it("returns true for valid global coordinates", () => {
      expect(isValidCoordinates(12.9716, 77.5946)).toBe(true);
      expect(isValidCoordinates(0, 0)).toBe(true);
      expect(isValidCoordinates(90, 180)).toBe(true);
      expect(isValidCoordinates(-90, -180)).toBe(true);
    });

    it("returns false for out of bounds latitude", () => {
      expect(isValidCoordinates(90.1, 77.5946)).toBe(false);
      expect(isValidCoordinates(-90.1, 77.5946)).toBe(false);
    });

    it("returns false for out of bounds longitude", () => {
      expect(isValidCoordinates(12.9716, 180.1)).toBe(false);
      expect(isValidCoordinates(12.9716, -180.1)).toBe(false);
    });

    it("returns false for null, undefined, NaN, and non-numbers", () => {
      expect(isValidCoordinates(null, 77.5946)).toBe(false);
      expect(isValidCoordinates(12.9716, undefined)).toBe(false);
      expect(isValidCoordinates(NaN, 77.5946)).toBe(false);
      expect(isValidCoordinates(12.9716, Infinity)).toBe(false);
    });
  });

  describe("formatCoordinates", () => {
    it("formats coordinates to specified precision", () => {
      expect(formatCoordinates(12.971598, 77.594562, 4)).toBe("12.9716, 77.5946");
      expect(formatCoordinates(12.971598, 77.594562, 2)).toBe("12.97, 77.59");
    });

    it("returns fallback string when coordinates are invalid", () => {
      expect(formatCoordinates(null, null)).toBe("Coordinates not set");
      expect(formatCoordinates(120, 200)).toBe("Coordinates not set");
    });
  });

  describe("getOpenStreetMapUrl", () => {
    it("generates correct OpenStreetMap viewer URL", () => {
      const url = getOpenStreetMapUrl({ latitude: 12.9716, longitude: 77.5946 }, 15);
      expect(url).toBe(
        "https://www.openstreetmap.org/?mlat=12.9716&mlon=77.5946#map=15/12.9716/77.5946"
      );
    });
  });

  describe("getExternalDirectionsUrl", () => {
    it("generates directions URL when origin and destination are provided", () => {
      const origin = { latitude: 12.9716, longitude: 77.5946 };
      const destination = { latitude: 13.0827, longitude: 80.2707 };
      const url = getExternalDirectionsUrl(destination, origin);
      expect(url).toContain("origin=12.9716,77.5946");
      expect(url).toContain("destination=13.0827,80.2707");
    });

    it("generates search query URL when origin is omitted", () => {
      const destination = { latitude: 13.0827, longitude: 80.2707 };
      const url = getExternalDirectionsUrl(destination);
      expect(url).toBe("https://www.google.com/maps/search/?api=1&query=13.0827,80.2707");
    });
  });
});
