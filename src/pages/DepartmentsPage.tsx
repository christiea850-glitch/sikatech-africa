// src/pages/DepartmentsPage.tsx
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useDepartments } from "../departments/DepartmentsContext";
import type { Role } from "../departments/DepartmentsContext";

const MANAGE_ROLES = new Set<Role>(["admin", "manager", "assistant_manager"]);

export default function DepartmentsPage() {
  const { user } = useAuth();
  const {
    departments,
    addDepartment,
    setEnabled,
    deleteDepartment,
    resetToDefault,
    updateDepartment,
    toKey,
  } = useDepartments();

  const [name, setName] = useState("");

  if (!user) return null;

  // ✅ HARD STOP: staff/auditor/accounting must NEVER see this page
  if (!MANAGE_ROLES.has(user.role as Role)) {
    // If staff has a departmentKey, send them back to their dept page
    const deptKey = (user as any).departmentKey;
    return <Navigate to={deptKey ? `/app/departments/${deptKey}` : "/app/dashboard"} replace />;
  }

  const visible = useMemo(() => {
    // ✅ Same rule as Sidebar:
    // if viewRoles missing OR empty => everyone can view
    const canRoleView = (d: any) => {
      const roles = d.viewRoles;
      if (!Array.isArray(roles) || roles.length === 0) return true;
      return roles.includes(user.role);
    };

    return departments.filter(canRoleView);
  }, [departments, user.role]);

  const toggleAccountingReview = (deptKey: string, checked: boolean, current: Role[]) => {
    const accounting: Role = "accounting";

    const nextRoles: Role[] = checked
      ? Array.from(new Set<Role>([...current, accounting]))
      : current.filter((r) => r !== accounting);

    updateDepartment(deptKey, { reviewRoles: nextRoles });
  };

  return (
    <div style={{ padding: 22 }}>
      <div style={topRow}>
        <div>
          <h1 style={{ margin: 0, fontSize: 34 }}>Manage Departments</h1>
          <p style={{ opacity: 0.8, marginTop: 6 }}>
            Enable/disable departments and mark which ones generate sales.
          </p>
        </div>

        <button style={secondaryBtn} onClick={resetToDefault}>
          Reset to Hotel Defaults
        </button>
      </div>

      {/* Add Department */}
      <div style={{ ...card, marginTop: 14 }}>
        <h3 style={h3}>Add Department</h3>

        <label style={label}>Department Name</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            style={input}
            value={name}
            placeholder="e.g., Spa, Transport, Events"
            onChange={(e) => setName(e.target.value)}
          />
          <button
            style={btn}
            onClick={() => {
              const nm = name.trim();
              if (!nm) return;
              addDepartment({ name: nm });
              setName("");
            }}
          >
            Add
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
          Key preview: <b>{name.trim() ? toKey(name) : "new-department"}</b>
        </div>
      </div>

      {/* Existing Departments */}
      <div style={{ ...card, marginTop: 14 }}>
        <h3 style={h3}>Departments</h3>

        {visible.length === 0 ? (
          <div style={{ opacity: 0.7, marginTop: 8 }}>No departments found.</div>
        ) : (
          visible.map((d: any) => {
            const hasAccounting = (d.reviewRoles ?? []).includes("accounting");

            return (
              <div key={d.key} style={listItem}>
                <div style={rowBetween}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>
                      {d.name} <span style={{ opacity: 0.6 }}>({d.key})</span>
                    </div>
                    <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
                      Enabled: <b>{d.enabled ? "Yes" : "No"}</b>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      style={d.enabled ? secondaryBtn : btn}
                      onClick={() => setEnabled(d.key, !d.enabled)}
                    >
                      {d.enabled ? "Disable" : "Enable"}
                    </button>

                    <button style={dangerBtn} onClick={() => deleteDepartment(d.key)}>
                      Delete
                    </button>
                  </div>
                </div>

                {/* Accounting Review Toggle */}
                <div style={section}>
                  <label style={toggleRow}>
                    <input
                      type="checkbox"
                      checked={hasAccounting}
                      onChange={(e) =>
                        toggleAccountingReview(d.key, e.target.checked, d.reviewRoles ?? [])
                      }
                    />
                    <span style={{ fontWeight: 900 }}>Allow Accounting Review</span>
                    <span style={{ opacity: 0.75, fontSize: 13 }}>
                      (adds/removes <b>accounting</b> from reviewRoles)
                    </span>
                  </label>

                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                    Review roles: <b>{(d.reviewRoles ?? []).join(", ") || "none"}</b>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const topRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.75)",
  borderRadius: 16,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.10)",
};

const h3: React.CSSProperties = { margin: 0, fontSize: 18, fontWeight: 900 };

const label: React.CSSProperties = {
  display: "block",
  marginTop: 10,
  fontWeight: 800,
  fontSize: 13,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  marginTop: 6,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.18)",
  outline: "none",
};

const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "none",
  background: "#0b2a3a",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const secondaryBtn: React.CSSProperties = {
  border: "1px solid rgba(11,42,58,0.18)",
  cursor: "pointer",
  padding: "10px 12px",
  borderRadius: 12,
  background: "white",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const dangerBtn: React.CSSProperties = {
  border: "none",
  cursor: "pointer",
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(180,38,38,0.9)",
  color: "white",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const listItem: React.CSSProperties = {
  background: "rgba(255,255,255,0.7)",
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 14,
  padding: 12,
  marginTop: 10,
};

const rowBetween: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const section: React.CSSProperties = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid rgba(0,0,0,0.08)",
};

const toggleRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  cursor: "pointer",
};


