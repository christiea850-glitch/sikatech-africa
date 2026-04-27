// src/pages/DepartmentPage.tsx
import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDepartments } from "../departments/DepartmentsContext";

export default function DepartmentPage() {
  const { deptKey } = useParams<{ deptKey: string }>();
  const { user } = useAuth();
  const { departments } = useDepartments();

  if (!user) return <Navigate to="/login" replace />;
  if (!deptKey) return <Navigate to="/app/dashboard" replace />;

  const dept = useMemo(
    () => departments.find((d: any) => d.key === deptKey),
    [departments, deptKey]
  );

  if (!dept || !dept.enabled) return <Navigate to="/app/dashboard" replace />;

  const privileged = ["admin", "manager", "assistant_manager", "accounting", "auditor"].includes(
    user.role
  );
  const userDeptKey = (user as any).departmentKey ?? null;

  // staff must ONLY see their own department page
  if (!privileged && userDeptKey && userDeptKey !== deptKey) {
    return <Navigate to={`/app/departments/${userDeptKey}`} replace />;
  }

  return (
    <div style={{ padding: 22 }}>
      <h1 style={{ margin: 0, fontSize: 34 }}>{dept.name}</h1>
      <p style={{ opacity: 0.8, marginTop: 6 }}>
        Department key: <b>{dept.key}</b>
      </p>

      <div
        style={{
          marginTop: 18,
          padding: 16,
          borderRadius: 14,
          background: "rgba(255,255,255,0.75)",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Department Dashboard</div>
        <div style={{ opacity: 0.75 }}>
          Put department-specific widgets here (shift status, today’s sales, inventory, etc).
        </div>
      </div>
    </div>
  );
}
