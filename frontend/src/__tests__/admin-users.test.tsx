import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { adminUsersApi } from "@/lib/api/admin";
import { apiClient } from "@/lib/api/client";
import { ROLE_NAVIGATION } from "@/components/layout/navigation-config";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AdminUser, AdminUserDetail } from "@/types";

describe("Admin Users API Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockUser: AdminUser = {
    id: "user-uuid-1",
    email: "business@bakery.com",
    role: "FOOD_BUSINESS",
    is_active: true,
    is_verified: true,
    created_at: "2026-10-01T12:00:00Z",
    updated_at: "2026-10-01T12:00:00Z",
    display_name: "Daily Bread Bakery",
  };

  const mockUserDetail: AdminUserDetail = {
    ...mockUser,
    business_profile: {
      id: "biz-uuid-1",
      business_name: "Daily Bread Bakery",
      business_type: "BAKERY",
      contact_phone: "+1-555-987-6543",
      address_text: "456 Market St, Downtown",
    },
  };

  it("lists users with filter parameters", async () => {
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue([mockUser]);

    const result = await adminUsersApi.list({
      role: "FOOD_BUSINESS",
      is_active: true,
      search: "bakery",
      limit: 25,
      offset: 0,
    });

    expect(getSpy).toHaveBeenCalledWith("/admin/users", {
      params: {
        role: "FOOD_BUSINESS",
        is_active: true,
        is_verified: undefined,
        search: "bakery",
        limit: 25,
        offset: 0,
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("business@bakery.com");
    expect(result[0].role).toBe("FOOD_BUSINESS");
  });

  it("fetches single user details by ID", async () => {
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue(mockUserDetail);

    const result = await adminUsersApi.getById("user-uuid-1");
    expect(getSpy).toHaveBeenCalledWith("/admin/users/user-uuid-1");
    expect(result.id).toBe("user-uuid-1");
    expect(result.business_profile?.business_name).toBe("Daily Bread Bakery");
  });

  it("activates an inactive user account", async () => {
    const activatedUser = { ...mockUser, is_active: true };
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue(activatedUser);

    const result = await adminUsersApi.activate("user-uuid-1");
    expect(postSpy).toHaveBeenCalledWith("/admin/users/user-uuid-1/activate");
    expect(result.is_active).toBe(true);
  });

  it("deactivates an active user account", async () => {
    const deactivatedUser = { ...mockUser, is_active: false };
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue(deactivatedUser);

    const result = await adminUsersApi.deactivate("user-uuid-1");
    expect(postSpy).toHaveBeenCalledWith("/admin/users/user-uuid-1/deactivate");
    expect(result.is_active).toBe(false);
  });
});

describe("Admin Users Navigation & Confirmation Dialogs", () => {
  it("enables All Users in ADMIN navigation structure", () => {
    const adminNav = ROLE_NAVIGATION.ADMIN[0].items;
    const usersItem = adminNav.find((item) => item.title === "All Users");

    expect(usersItem).toBeDefined();
    expect(usersItem?.disabled).toBeFalsy();
    expect(usersItem?.href).toBe("/app/admin/users");
  });

  it("handles ConfirmDialog deactivation confirmation correctly", async () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title="Confirm Account Deactivation"
        description="Are you sure you want to deactivate this account?"
        confirmText="Deactivate Account"
        variant="destructive"
      />

    );

    expect(screen.getByText("Confirm Account Deactivation")).toBeDefined();
    const confirmButton = screen.getByRole("button", { name: "Deactivate Account" });
    fireEvent.click(confirmButton);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });
});
