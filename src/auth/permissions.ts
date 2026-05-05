import type { Role, User } from "./AuthContext";

export const ALL_ROLES: Role[] = [
  "owner",
  "super_admin",
  "admin",
  "manager",
  "assistant_manager",
  "accounting",
  "auditor",
  "front_desk",
  "staff",
];

export const OWNER_ROLES: Role[] = ["owner", "super_admin"];

export function roleOf(input: Role | string | Pick<User, "role"> | null | undefined): Role | null {
  const raw = typeof input === "string" ? input : input?.role;
  const role = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (ALL_ROLES as string[]).includes(role) ? (role as Role) : null;
}

export function isOwnerRole(input: Role | string | Pick<User, "role"> | null | undefined): boolean {
  const role = roleOf(input);
  return !!role && OWNER_ROLES.includes(role);
}

export function canOperateSales(input: Role | string | Pick<User, "role"> | null | undefined): boolean {
  const role = roleOf(input);
  return (
    role === "owner" ||
    role === "super_admin" ||
    role === "admin" ||
    role === "manager" ||
    role === "assistant_manager" ||
    role === "front_desk" ||
    role === "staff"
  );
}

export function canOperateFrontDesk(input: Role | string | Pick<User, "role"> | null | undefined): boolean {
  const role = roleOf(input);
  return (
    role === "owner" ||
    role === "super_admin" ||
    role === "admin" ||
    role === "manager" ||
    role === "assistant_manager" ||
    role === "front_desk"
  );
}

export function canReviewFinancials(input: Role | string | Pick<User, "role"> | null | undefined): boolean {
  const role = roleOf(input);
  return (
    role === "owner" ||
    role === "super_admin" ||
    role === "admin" ||
    role === "accounting" ||
    role === "auditor"
  );
}

export function canManageSetup(input: Role | string | Pick<User, "role"> | null | undefined): boolean {
  const role = roleOf(input);
  return (
    role === "owner" ||
    role === "super_admin" ||
    role === "admin"
  );
}

export function canApproveClosings(input: Role | string | Pick<User, "role"> | null | undefined): boolean {
  const role = roleOf(input);
  return (
    role === "owner" ||
    role === "super_admin" ||
    role === "admin" ||
    role === "manager" ||
    role === "assistant_manager"
  );
}

export function canAuditReadOnly(input: Role | string | Pick<User, "role"> | null | undefined): boolean {
  const role = roleOf(input);
  return role === "auditor";
}

export function canAccessExpenses(input: Role | string | Pick<User, "role"> | null | undefined): boolean {
  const role = roleOf(input);
  return (
    role === "owner" ||
    role === "super_admin" ||
    role === "admin" ||
    role === "accounting"
  );
}

export function canViewDepartmentRoute(
  input: Role | string | Pick<User, "role" | "departmentKey"> | null | undefined,
  departmentKey?: string | null
): boolean {
  const role = roleOf(input);
  if (!role) return false;
  if (canManageSetup(role) || canReviewFinancials(role)) return true;

  const userDeptKey = typeof input === "string" ? null : input?.departmentKey ?? null;
  return !!departmentKey && !!userDeptKey && userDeptKey === departmentKey;
}

export function canViewBroadOperations(input: Role | string | Pick<User, "role"> | null | undefined): boolean {
  const role = roleOf(input);
  return !!role && role !== "staff" && role !== "front_desk";
}

export function canViewModuleKey(input: Role | string | Pick<User, "role"> | null | undefined, moduleKey: string): boolean {
  const role = roleOf(input);
  if (!role) return false;

  switch (moduleKey) {
    case "dashboard":
    case "notifications":
      return true;
    case "sales":
    case "sales-entry":
      return canOperateSales(role);
    case "front-desk":
    case "front-desk-room-board":
      return canOperateFrontDesk(role);
    case "sales-summary":
    case "sales-dashboard":
    case "sales-history":
    case "sales-history-central":
      return canReviewFinancials(role) && !canAuditReadOnly(role);
    case "ledger-debug":
      return isOwnerRole(role) || role === "admin";
    case "reconcile":
      return canReviewFinancials(role);
    case "accounting":
      return canReviewFinancials(role);
    case "accounting-workbench":
      return canReviewFinancials(role) && !canAuditReadOnly(role);
    case "cash-desk-closings":
      return canReviewFinancials(role);
    case "expenses":
      return canAccessExpenses(role);
    case "departments":
    case "department":
      return canManageSetup(role) || canReviewFinancials(role);
    case "manage-modules":
    case "manage-departments":
      return canManageSetup(role);
    case "audit-logs":
    case "activity":
    case "executive-overview":
      return isOwnerRole(role) || role === "admin" || role === "auditor";
    case "shift-closing":
      return canOperateSales(role) || canApproveClosings(role);
    default:
      return canViewBroadOperations(role);
  }
}
