import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import * as AuthContextModule from "@/lib/auth/auth-context";

// Mock NotificationCenter to keep layout tests clean
vi.mock("@/components/notifications/notification-center", () => ({
  NotificationCenter: () => <div data-testid="notification-center">Notifications</div>,
}));

describe("Layout Components", () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Sidebar", () => {
    it("renders Food Business navigation items for FOOD_BUSINESS role", () => {
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        user: {
          id: "biz-1",
          email: "owner@bakery.com",
          role: "FOOD_BUSINESS",
          is_active: true,
          created_at: "2026-10-01T00:00:00Z",
          updated_at: "2026-10-01T00:00:00Z",
        },
        isLoading: false,
        isAuthenticated: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: mockLogout,
        refreshUser: vi.fn(),
      });

      render(<Sidebar />);

      expect(screen.getByText("FoodRescue")).toBeInTheDocument();
      expect(screen.getByText("Donations")).toBeInTheDocument();
      expect(screen.getByText("Pickups")).toBeInTheDocument();
      expect(screen.getByText("Profile")).toBeInTheDocument();
      expect(screen.getByText("FOOD BUSINESS")).toBeInTheDocument();
    });

    it("renders Organization navigation items for ORGANIZATION role", () => {
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        user: {
          id: "org-1",
          email: "director@foodbank.org",
          role: "ORGANIZATION",
          is_active: true,
          created_at: "2026-10-01T00:00:00Z",
          updated_at: "2026-10-01T00:00:00Z",
        },
        isLoading: false,
        isAuthenticated: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: mockLogout,
        refreshUser: vi.fn(),
      });

      render(<Sidebar />);

      expect(screen.getByText("Matches")).toBeInTheDocument();
      expect(screen.getByText("Capacity")).toBeInTheDocument();
      expect(screen.getByText("ORGANIZATION")).toBeInTheDocument();
    });

    it("triggers logout when Sign Out button is clicked", () => {
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        user: {
          id: "vol-1",
          email: "driver@volunteer.org",
          role: "VOLUNTEER",
          is_active: true,
          created_at: "2026-10-01T00:00:00Z",
          updated_at: "2026-10-01T00:00:00Z",
        },
        isLoading: false,
        isAuthenticated: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: mockLogout,
        refreshUser: vi.fn(),
      });

      render(<Sidebar />);

      const signOutBtn = screen.getByRole("button", { name: /sign out/i });
      fireEvent.click(signOutBtn);
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe("Topbar", () => {
    it("renders breadcrumbs and notification center", () => {
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        user: {
          id: "biz-1",
          email: "donor@kitchen.com",
          role: "FOOD_BUSINESS",
          is_active: true,
          created_at: "2026-10-01T00:00:00Z",
          updated_at: "2026-10-01T00:00:00Z",
        },
        isLoading: false,
        isAuthenticated: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: mockLogout,
        refreshUser: vi.fn(),
      });

      render(<Topbar onOpenMobileMenu={vi.fn()} />);

      expect(screen.getByTestId("notification-center")).toBeInTheDocument();
      expect(screen.getByText("donor@kitchen.com")).toBeInTheDocument();
    });
  });
});
