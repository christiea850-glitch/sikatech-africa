// src/auth/ProtectedRoute.tsx
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useModuleConfig } from "../setup/ModuleConfigContext";
import { canShowNav } from "../setup/canShowNav";
import {
  canAccessExpenses,
  canApproveClosings,
  canManageSetup,
  canOperateFrontDesk,
  canOperateSales,
  canReviewFinancials,
  canViewDepartmentRoute,
  canViewModuleKey,
} from "./permissions";

export type RouteCapability =
  | "all"
  | "operateSales"
  | "operateFrontDesk"
  | "reviewFinancials"
  | "manageSetup"
  | "approveClosings"
  | "approveOrReviewClosings"
  | "accessExpenses"
  | "departmentView";

type Props = {
  children: ReactNode;
  moduleKey?: string;
  capability?: RouteCapability;
  departmentKey?: string | null;
  redirectTo?: string;
};

function canUseCapability(
  user: NonNullable<ReturnType<typeof useAuth>["user"]>,
  capability: RouteCapability,
  departmentKey?: string | null
) {
  switch (capability) {
    case "all":
      return true;
    case "operateSales":
      return canOperateSales(user);
    case "operateFrontDesk":
      return canOperateFrontDesk(user);
    case "reviewFinancials":
      return canReviewFinancials(user);
    case "manageSetup":
      return canManageSetup(user);
    case "approveClosings":
      return canApproveClosings(user);
    case "approveOrReviewClosings":
      return canApproveClosings(user) || canReviewFinancials(user);
    case "accessExpenses":
      return canAccessExpenses(user);
    case "departmentView":
      return canViewDepartmentRoute(user, departmentKey);
    default:
      return false;
  }
}

export default function ProtectedRoute({
  children,
  moduleKey,
  capability,
  departmentKey,
  redirectTo = "/app/not-authorized",
}: Props) {
  const { user } = useAuth();
  const { modules } = useModuleConfig();
  const loc = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  if (capability && !canUseCapability(user, capability, departmentKey)) {
    return <Navigate to={redirectTo} replace />;
  }

  if (moduleKey) {
    if (moduleKey === "manage-departments" && !canManageSetup(user)) {
      const deptKey = (user as any).departmentKey;
      return <Navigate to={deptKey ? `/app/departments/${deptKey}` : "/app/dashboard"} replace />;
    }

    const ok =
      canViewModuleKey(user, moduleKey) &&
      canShowNav(user as any, modules as any, moduleKey);

    if (!ok) return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
