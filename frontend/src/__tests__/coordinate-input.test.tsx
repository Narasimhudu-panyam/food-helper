import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CoordinateInput } from "@/components/maps/coordinate-input";

// Mock LocationMap child component to prevent Leaflet DOM issues in jsdom
vi.mock("@/components/maps/location-map", () => ({
  LocationMap: () => <div data-testid="mock-location-map">Location Map Mock</div>,
}));

describe("CoordinateInput Component", () => {
  it("renders latitude and longitude inputs with initial values", () => {
    const handleChange = vi.fn();
    render(
      <CoordinateInput
        latitude={12.9716}
        longitude={77.5946}
        onChange={handleChange}
      />
    );

    const latInput = screen.getByLabelText(/latitude/i) as HTMLInputElement;
    const lngInput = screen.getByLabelText(/longitude/i) as HTMLInputElement;

    expect(latInput.value).toBe("12.9716");
    expect(lngInput.value).toBe("77.5946");
  });

  it("calls onChange when latitude value changes", () => {
    const handleChange = vi.fn();
    render(
      <CoordinateInput
        latitude={12.9716}
        longitude={77.5946}
        onChange={handleChange}
      />
    );

    const latInput = screen.getByLabelText(/latitude/i);
    fireEvent.change(latInput, { target: { value: "13.0827" } });

    expect(handleChange).toHaveBeenCalledWith({
      latitude: 13.0827,
      longitude: 77.5946,
    });
  });

  it("calls onChange when longitude value changes", () => {
    const handleChange = vi.fn();
    render(
      <CoordinateInput
        latitude={12.9716}
        longitude={77.5946}
        onChange={handleChange}
      />
    );

    const lngInput = screen.getByLabelText(/longitude/i);
    fireEvent.change(lngInput, { target: { value: "80.2707" } });

    expect(handleChange).toHaveBeenCalledWith({
      latitude: 12.9716,
      longitude: 80.2707,
    });
  });

  it("displays validation error messages when provided", () => {
    render(
      <CoordinateInput
        latitude={95}
        longitude={200}
        onChange={vi.fn()}
        latError="Latitude must be between -90 and 90"
        lngError="Longitude must be between -180 and 180"
      />
    );

    expect(screen.getByText("Latitude must be between -90 and 90")).toBeInTheDocument();
    expect(screen.getByText("Longitude must be between -180 and 180")).toBeInTheDocument();
  });
});
