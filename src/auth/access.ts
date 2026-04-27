// src/auth/access.ts
import type { Role } from "./AuthContext";

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
] as const;

export type ModuleKey = (typeof ALL_MODULES)[number];

/**
 * ROLE_ACCESS = broad permission gate
 * Final enforcement still happens in ProtectedRoute
 */
export const ROLE_ACCESS: Record<Role, readonly ModuleKey[]> = {
  staff: [
    "dashboard",
    "notifications",
    "sales", // staff sales entry is allowed, dashboard redirect handled elsewhere
  ],

  front_desk: [
    "dashboard",
    "notifications",
    "sales",
  ],

  assistant_manager: [
    "dashboard",
    "notifications",
    "sales",
    "accounting",
  ],

  accounting: [
    "dashboard",
    "notifications",
    "sales",
    "accounting",
  ],

  auditor: [
    "dashboard",
    "notifications",
    "audit-logs",
    "executive-overview",
  ],

  manager: [
    ...ALL_MODULES,
  ],

  admin: [
    ...ALL_MODULES,
  ],
};

/**
 * Editing permissions (future-proof)
 */
export const CAN_EDIT: Record<Role, boolean> = {
  staff: false,
  front_desk: false,
  assistant_manager: false,
  auditor: false,
  accounting: true,
  manager: true,
  admin: true,
};

/**
 * Alert / system actions
 */
export const CAN_SEND_ALERTS: Record<Role, boolean> = {
  staff: false,
  front_desk: false,
  assistant_manager: false,
  auditor: false,
  accounting: true,
  manager: true,
  admin: true,
};
