// src/auth/access.ts
import type { Role } from "./AuthContext";
import {
  ALL_ROLES,
  canManageSetup,
} from "./permissions";

/**
 * High-level module keys.
 * NOTE:
 * - Department routes (/app/departments/:key) are enforced in ProtectedRoute
 * - Sales entry vs sales dashboard is enforced in App + ProtectedRoute
 */
export const ALL_MODULES = [
  "dashboard",
  "notifications",
  "sales",
  "accounting",
  "manage-modules",
  "audit-logs",
  "executive-overview",
  "shift-closing",
  "reconcile",
  "cash-desk-closings",
  "ledger-debug",
] as const;

export type ModuleKey = (typeof ALL_MODULES)[number];

/**
 * ROLE_ACCESS = broad permission gate
 * Final enforcement still happens in ProtectedRoute
 */
export const ROLE_ACCESS: Record<Role, readonly ModuleKey[]> = {
  owner: [...ALL_MODULES],
  super_admin: [...ALL_MODULES],
  admin: [...ALL_MODULES],
  manager: [...ALL_MODULES],
  assistant_manager: ALL_MODULES.filter((key) => !["manage-modules", "manage-departments"].includes(key)),
  accounting: ALL_MODULES.filter((key) => ["dashboard", "notifications", "accounting", "cash-desk-closings", "ledger-debug"].includes(key)),
  auditor: ALL_MODULES.filter((key) => ["dashboard", "notifications", "audit-logs", "executive-overview", "accounting", "cash-desk-closings"].includes(key)),
  front_desk: ALL_MODULES.filter((key) => ["dashboard", "notifications", "sales", "shift-closing", "reconcile"].includes(key)),
  staff: ALL_MODULES.filter((key) => ["dashboard", "notifications", "sales", "shift-closing"].includes(key)),
};

/**
 * Editing permissions (future-proof)
 */
export const CAN_EDIT: Record<Role, boolean> = Object.fromEntries(
  ALL_ROLES.map((role) => [role, canManageSetup(role) || role === "accounting"])
) as Record<Role, boolean>;

/**
 * Alert / system actions
 */
export const CAN_SEND_ALERTS: Record<Role, boolean> = Object.fromEntries(
  ALL_ROLES.map((role) => [role, canManageSetup(role) || role === "accounting"])
) as Record<Role, boolean>;
