// src/setup/canShowNav.ts
import type { User } from "../auth/AuthContext";
import { ROLE_ACCESS } from "../auth/access";

export type ModuleConfig = {
  key: string;
  enabled?: boolean;
  viewRoles?: string[];
};

const PRIVILEGED_ROLES = [
  "admin",
  "manager",
  "assistant_manager",
  "accounting",
  "auditor",
] as const;

function isPrivileged(role: string): boolean {
  return (PRIVILEGED_ROLES as readonly string[]).includes(role);
}

/**
 * If true, privileged roles can still SEE disabled modules in the sidebar.
 * Recommended: false so "disabled" means hidden for everyone.
 */
const PRIVILEGED_BYPASS_DISABLED = false;

/**
 * Normalize "non-module" route keys to a real permission key.
 */
export function permissionKeyFor(rawKey: string): string {
  switch (rawKey) {
    case "activity":
      return "dashboard";
    case "sales-dashboard":
    case "sales-history":
    case "sales-history-central":
      return "sales";
    default:
      return rawKey;
  }
}

/**
 * Sidebar visibility helper.
 * Keeps sidebar visibility aligned with ProtectedRoute logic.
 */
export function canShowNav(
  user: User | null | undefined,
  modules: ModuleConfig[],
  rawKey: string
): boolean {
  if (!user) return false;

  const key = permissionKeyFor(rawKey);
  const privileged = isPrivileged(user.role);

  const mod = modules.find((m) => m.key === key);

  // If module exists and is disabled, hide it (unless bypass enabled)
  if (mod?.enabled === false && !(PRIVILEGED_BYPASS_DISABLED && privileged)) {
    return false;
  }

  // Static (role) access
  const allowedList = ROLE_ACCESS[user.role] as readonly string[] | undefined;
  if (allowedList?.includes(key) === true) return true;

  // Dynamic (module) access
  if (!mod) return false;
  if (!Array.isArray(mod.viewRoles)) return false;

  return mod.viewRoles.includes(user.role);
}

