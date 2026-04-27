// src/api/toAuthedUser.ts
import type { User } from "../auth/AuthContext";

const DEFAULT_BUSINESS_ID = "biz_main";
const DEFAULT_BRANCH_ID = "main";

type Role =
  | "admin"
  | "manager"
  | "assistant_manager"
  | "accounting"
  | "auditor"
  | "staff";

export type AuthedUser = {
  employeeId: string;
  role: Role;
  businessId: string;
  branchId: string;
  departmentKey?: string;
};

const ROLES: Role[] = [
  "admin",
  "manager",
  "assistant_manager",
  "accounting",
  "auditor",
  "staff",
];

function isRole(x: unknown): x is Role {
  return typeof x === "string" && (ROLES as string[]).includes(x);
}

/**
 * Convert AuthContext User -> API AuthedUser
 * Returns null if essentials are missing.
 */
export function toAuthedUser(user: User | null | undefined): AuthedUser | null {
  if (!user) return null;

  const employeeId = String((user as any).employeeId ?? "").trim();
  const roleRaw = (user as any).role;
  const role = isRole(roleRaw) ? roleRaw : null;

  if (!employeeId || !role) return null;

  const businessId = String((user as any).businessId ?? DEFAULT_BUSINESS_ID).trim();
  const branchId = String((user as any).branchId ?? DEFAULT_BRANCH_ID).trim();

  const departmentKey =
    String(
      (user as any).departmentKey ??
        (user as any).selectedDepartmentKey ??
        ""
    ).trim() || undefined;

  return {
    employeeId,
    role,
    businessId,
    branchId,
    departmentKey,
  };
}