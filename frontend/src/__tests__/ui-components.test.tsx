import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { AccessDenied } from "@/components/feedback/access-denied";

describe("UI Components Suite", () => {
  describe("Button", () => {
    it("renders children text", () => {
      render(<Button>Click Me</Button>);
      expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
    });

    it("handles click events", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Submit</Button>);
      fireEvent.click(screen.getByRole("button", { name: /submit/i }));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("disables button when disabled or isLoading is true", () => {
      const { rerender } = render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole("button", { name: /disabled/i })).toBeDisabled();

      rerender(<Button isLoading>Loading</Button>);
      expect(screen.getByRole("button", { name: /loading/i })).toBeDisabled();
    });
  });

  describe("Input", () => {
    it("renders input with label and helper error", () => {
      render(
        <Input
          label="Email Address"
          error="Invalid email address"
          placeholder="user@example.com"
        />
      );
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByText(/invalid email address/i)).toBeInTheDocument();
    });

    it("triggers onChange handler when typed into", () => {
      const handleChange = vi.fn();
      render(<Input placeholder="Type here" onChange={handleChange} />);
      const input = screen.getByPlaceholderText(/type here/i);
      fireEvent.change(input, { target: { value: "Hello" } });
      expect(handleChange).toHaveBeenCalled();
    });
  });

  describe("StatusBadge", () => {
    it("renders known status labels with appropriate text", () => {
      const { rerender } = render(<StatusBadge status="CREATED" />);
      expect(screen.getByText(/available/i)).toBeInTheDocument();

      rerender(<StatusBadge status="IN_TRANSIT" />);
      expect(screen.getByText(/in transit/i)).toBeInTheDocument();

      rerender(<StatusBadge status="DELIVERED" />);
      expect(screen.getByText(/delivered/i)).toBeInTheDocument();
    });
  });

  describe("Feedback States", () => {
    it("renders EmptyState with title, description, and action button", () => {
      const handleClick = vi.fn();
      render(
        <EmptyState
          title="No Donations Found"
          description="Create your first donation to begin matching."
          action={{
            label: "Create Donation",
            onClick: handleClick,
          }}
        />
      );
      expect(screen.getByText("No Donations Found")).toBeInTheDocument();
      expect(
        screen.getByText("Create your first donation to begin matching.")
      ).toBeInTheDocument();
      const actionBtn = screen.getByRole("button", { name: /create donation/i });
      fireEvent.click(actionBtn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("renders ErrorState with error message and triggers retry", () => {
      const onRetry = vi.fn();
      render(
        <ErrorState
          title="Failed to Load Matches"
          message="Server timed out while fetching geospatial matches."
          onRetry={onRetry}
        />
      );
      expect(screen.getByText("Failed to Load Matches")).toBeInTheDocument();
      expect(
        screen.getByText("Server timed out while fetching geospatial matches.")
      ).toBeInTheDocument();
      const retryBtn = screen.getByRole("button", { name: /try again/i });
      fireEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("renders LoadingState with message", () => {
      render(<LoadingState message="Fetching live dispatch coordinates..." />);
      expect(screen.getByText("Fetching live dispatch coordinates...")).toBeInTheDocument();
    });

    it("renders AccessDenied with current role and return workspace button", () => {
      render(<AccessDenied currentRole="FOOD_BUSINESS" />);
      expect(screen.getByText(/access restricted/i)).toBeInTheDocument();
      expect(screen.getByText(/food business/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /return to my workspace/i })).toBeInTheDocument();
    });
  });

  describe("Card and Alert", () => {
    it("renders Card container with title and content", () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Donation Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Weight: 15kg</p>
          </CardContent>
        </Card>
      );
      expect(screen.getByText("Donation Summary")).toBeInTheDocument();
      expect(screen.getByText("Weight: 15kg")).toBeInTheDocument();
    });

    it("renders Alert message with title", () => {
      render(
        <Alert variant="warning" title="Perishable Food Notice">
          Food must be stored under 4°C during transit.
        </Alert>
      );
      expect(screen.getByText("Perishable Food Notice")).toBeInTheDocument();
      expect(screen.getByText("Food must be stored under 4°C during transit.")).toBeInTheDocument();
    });
  });
});
