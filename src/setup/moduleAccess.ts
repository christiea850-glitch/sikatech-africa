// src/setup/moduleAccess.ts
import type { User } from "../auth/AuthContext";

type Role = User["role"];

type AnyModule = {
  key: string;
  enabled?: boolean;
  viewRoles?: Role[];
};

export function canAccessModule(modules: AnyModule[], key: string, role: Role) {
  const mod = modules.find((m) => m.key === key);
  if (!mod) return false;
  if (mod.enabled === false) return false;
  return Array.isArray(mod.viewRoles) ? mod.viewRoles.includes(role) : false;
}
