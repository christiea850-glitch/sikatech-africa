// src/auth/ProtectedRoute.tsx
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useModuleConfig } from "../setup/ModuleConfigContext";
import { canShowNav } from "../nav/canSeeNav";
import { canManageSetup, canReviewFinancials, canViewModuleKey } from "./permissions";

type Props = {
  children: ReactNode;
  moduleKey?: string;
};

export default function ProtectedRoute({ children, moduleKey }: Props) {
  const { user } = useAuth();
  const { modules } = useModuleConfig();
  const loc = useLocation();

  // Not logged in
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  // If a moduleKey is provided, enforce access
  if (moduleKey) {
    // ✅ hard role rule for manage-departments (even if module is enabled)
    if (moduleKey === "manage-departments") {
      const allowed = canManageSetup(user);

      if (!allowed) {
        const deptKey = (user as any).departmentKey;
        return (
          <Navigate
            to={deptKey ? `/app/departments/${deptKey}` : "/app/dashboard"}
            replace
          />
        );
      }
    }

    if (moduleKey === "accounting-workbench") {
      const allowed = canReviewFinancials(user);
      if (!allowed) return <Navigate to="/app/not-authorized" replace />;
      return <>{children}</>;
    }

    // Normal module access rules
    const ok = canViewModuleKey(user, moduleKey) && canShowNav(user as any, modules as any, moduleKey);
    if (!ok) return <Navigate to="/app/not-authorized" replace />;
  }

  return <>{children}</>;
}
