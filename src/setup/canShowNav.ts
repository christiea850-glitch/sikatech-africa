// src/setup/canShowNav.ts
import type { User } from "../auth/AuthContext";
import { canViewModuleKey } from "../auth/permissions";

export type ModuleConfig = {
  key: string;
  enabled?: boolean;
  viewRoles?: string[];
};

/**
 * If true, privileged roles can still SEE disabled modules in the sidebar.
 * Recommended: false so "disabled" means hidden for everyone.
 */
const PRIVILEGED_BYPASS_DISABLED = false;

/**
 * Normalize "non-module" route keys to a real permission key.
 */
export function permissionKeyFor(rawKey: string): string {
  return rawKey;
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
  const capabilityAllowed = canViewModuleKey(user, key);
  if (!capabilityAllowed) return false;

  const mod = modules.find((m) => m.key === key);

  // If module exists and is disabled, hide it (unless bypass enabled)
  if (mod?.enabled === false && !PRIVILEGED_BYPASS_DISABLED) {
    return false;
  }

  // Static routes without a module entry are governed by the shared capability map.
  if (!mod) return true;

  if (!Array.isArray(mod.viewRoles) || mod.viewRoles.length === 0) return true;

  return mod.viewRoles.includes(user.role);
}

