import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { adminOrganizationsApi } from "@/lib/api/admin";
import { apiClient } from "@/lib/api/client";
import { ROLE_NAVIGATION } from "@/components/layout/navigation-config";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AdminOrganization } from "@/types";

describe("Admin Organizations API Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockOrg: AdminOrganization = {
    id: "org-uuid-1",
    user_id: "user-uuid-1",
    org_name: "Community Food Relief",
    org_type: "FOOD_BANK",
    tax_id: "TAX-12345",
    address_text: "123 Hope Ave, Metropolis",
    location: { latitude: 37.7749, longitude: -122.4194 },
    contact_phone: "+1-555-123-4567",
    verification_status: "PENDING",
    max_capacity_kg: 1000,
    current_capacity_kg: 250,
    accepted_categories: ["PREPARED_MEALS", "BAKERY"],
    can_pickup: true,
    owner_email: "director@communityrelief.org",
    is_active: true,
    created_at: "2026-10-01T12:00:00Z",
    updated_at: "2026-10-01T12:00:00Z",
  };

  it("lists organizations with filter parameters", async () => {
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue([mockOrg]);

    const result = await adminOrganizationsApi.list({
      verification_status: "PENDING",
      search: "Hope",
      limit: 20,
      offset: 0,
    });

    expect(getSpy).toHaveBeenCalledWith("/admin/organizations", {
      params: {
        verification_status: "PENDING",
        search: "Hope",
        limit: 20,
        offset: 0,
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].org_name).toBe("Community Food Relief");
    expect(result[0].owner_email).toBe("director@communityrelief.org");
  });

  it("fetches single organization details by ID", async () => {
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue(mockOrg);

    const result = await adminOrganizationsApi.getById("org-uuid-1");
    expect(getSpy).toHaveBeenCalledWith("/admin/organizations/org-uuid-1");
    expect(result.id).toBe("org-uuid-1");
  });

  it("submits verification for an organization", async () => {
    const verifiedOrg = { ...mockOrg, verification_status: "VERIFIED" as const };
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue(verifiedOrg);

    const result = await adminOrganizationsApi.verify("org-uuid-1");
    expect(postSpy).toHaveBeenCalledWith("/admin/organizations/org-uuid-1/verify");
    expect(result.verification_status).toBe("VERIFIED");
  });

  it("submits rejection with mandatory reason", async () => {
    const rejectedOrg = { ...mockOrg, verification_status: "REJECTED" as const };
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue(rejectedOrg);

    const result = await adminOrganizationsApi.reject(
      "org-uuid-1",
      "Expired non-profit charity certificate"
    );
    expect(postSpy).toHaveBeenCalledWith("/admin/organizations/org-uuid-1/reject", {
      reason: "Expired non-profit charity certificate",
    });
    expect(result.verification_status).toBe("REJECTED");
  });
});

describe("Admin Navigation & UI Components", () => {
  it("enables Verification Queue and All Organizations in ADMIN navigation", () => {
    const adminNav = ROLE_NAVIGATION.ADMIN[0].items;
    const verificationItem = adminNav.find((item) => item.title === "Verification Queue");
    const orgsItem = adminNav.find((item) => item.title === "All Organizations");
    const usersItem = adminNav.find((item) => item.title === "All Users");

    expect(verificationItem).toBeDefined();
    expect(verificationItem?.disabled).toBeFalsy();
    expect(verificationItem?.href).toBe("/app/admin/verifications");

    expect(orgsItem).toBeDefined();
    expect(orgsItem?.disabled).toBeFalsy();
    expect(orgsItem?.href).toBe("/app/admin/organizations");

    expect(usersItem).toBeDefined();
    expect(usersItem?.disabled).toBeFalsy();
    expect(usersItem?.href).toBe("/app/admin/users");
  });

  it("renders verification status badges with appropriate semantics", () => {
    const { rerender } = render(<StatusBadge status="PENDING" />);
    expect(screen.getByText("Pending Verification")).toBeDefined();

    rerender(<StatusBadge status="VERIFIED" />);
    expect(screen.getByText("Verified")).toBeDefined();

    rerender(<StatusBadge status="REJECTED" />);
    expect(screen.getByText("Rejected")).toBeDefined();

    rerender(<StatusBadge status="SUSPENDED" />);
    expect(screen.getByText("Suspended")).toBeDefined();
  });

  it("handles ConfirmDialog verify interaction correctly", async () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title="Verify Organization"
        description="Are you sure you want to verify this organization?"
        confirmText="Verify Now"
      />
    );

    expect(screen.getByText("Verify Organization")).toBeDefined();
    const confirmButton = screen.getByRole("button", { name: "Verify Now" });
    fireEvent.click(confirmButton);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });
});
