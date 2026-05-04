// src/nav/canSeeNav.ts
import type { User } from "../auth/AuthContext";
import { canViewModuleKey } from "../auth/permissions";

/**
 * Sidebar item definition
 */
export type NavItem = {
  label: string;
  to: string;
  moduleKey: string;
  kind: "dashboard" | "department" | "admin";
};

/**
 * Roles that can see ALL enabled modules (nav visibility)
 * NOTE: Keep as string[] so TS doesn't fail when your Role union is missing a value.
 */
/**
 * Sidebar visibility
 */
export function canSeeNavItem(user: User, item: NavItem): boolean {
  if (!user) return false;

  if (canViewModuleKey(user, item.moduleKey)) return true;

  // Always visible for staff
  if (item.moduleKey === "dashboard") return true;
  if (item.moduleKey === "notifications") return true;

  // Staff can only see their own department page/module
  if (item.kind === "department") {
    return item.moduleKey === user.departmentKey;
  }

  return false;
}

/**
 * ModuleConfigContext visibility:
 * - if module missing, don't lock user out (MVP-safe)
 * - if disabled, hide
 * - if viewRoles empty, allow
 */
export function canShowNav(user: User, modules: any[], moduleKey: string): boolean {
  if (!user) return false;

  const mod = modules?.find((m: any) => m?.key === moduleKey);

  // If module config missing, don't lock the user out
  if (!mod) return true;

  if (mod.enabled === false) return false;

  const roles = mod.viewRoles;
  if (!Array.isArray(roles) || roles.length === 0) return true;

  return roles.includes(user.role);
}
