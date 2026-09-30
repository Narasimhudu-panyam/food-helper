import { describe, it, expect } from "vitest";
import {
  ROLE_WORKSPACE_ROOTS,
  ROLE_NAVIGATION,
} from "@/components/layout/navigation-config";
import { UserRole } from "@/types";

describe("Navigation Configuration", () => {
  const roles: UserRole[] = ["FOOD_BUSINESS", "ORGANIZATION", "VOLUNTEER", "ADMIN"];

  it("defines root workspace paths for all roles", () => {
    expect(ROLE_WORKSPACE_ROOTS.FOOD_BUSINESS).toBe("/app/business");
    expect(ROLE_WORKSPACE_ROOTS.ORGANIZATION).toBe("/app/organization");
    expect(ROLE_WORKSPACE_ROOTS.VOLUNTEER).toBe("/app/volunteer");
    expect(ROLE_WORKSPACE_ROOTS.ADMIN).toBe("/app/admin");
  });

  it("defines valid navigation sections and non-empty items for each role", () => {
    for (const role of roles) {
      const sections = ROLE_NAVIGATION[role];
      expect(sections).toBeDefined();
      expect(sections.length).toBeGreaterThan(0);
      for (const section of sections) {
        expect(section.items.length).toBeGreaterThan(0);
        for (const item of section.items) {
          expect(item.title).toBeTruthy();
          expect(item.href).toMatch(/^\/app\//);
          expect(item.icon).toBeDefined();
        }
      }
    }
  });
});
