import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useModuleConfig } from "../setup/ModuleConfigContext";

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { modules } = useModuleConfig();

  const [q, setQ] = useState("");

  const visibleModules = useMemo(() => {
    if (!user) return [];
    return (modules ?? []).filter(
      (m: any) => m?.enabled && (m.viewRoles ?? []).includes(user.role)
    );
  }, [modules, user]);

  const quickRoutes: Record<string, string> = useMemo(
    () => ({
      dashboard: "/app/dashboard",
      activity: "/app/activity",
      notifications: "/app/notifications",
      sales: "/app/sales",
      accounting: "/app/accounting",
      shifts: "/app/shifts",
      "manage departments": "/app/departments/manage",
      departments: "/app/departments/manage",
    }),
    []
  );

  const onEnterSearch = () => {
    const raw = normalize(q);
    if (!raw) return;

    const special = quickRoutes[raw];
    if (special) {
      navigate(special);
      setQ("");
      return;
    }

    const byKey = visibleModules.find((m: any) => normalize(m.key) === raw);
    const byLabel = visibleModules.find((m: any) => normalize(m.label) === raw);
    const byPartial = visibleModules.find(
      (m: any) =>
        normalize(m.label).includes(raw) || normalize(m.key).includes(raw)
    );

    const target = byKey ?? byLabel ?? byPartial;

    if (!target) {
      alert(`No module found for "${raw}"`);
      return;
    }

    navigate(`/app/${target.key}`);
    setQ("");
  };

  const onLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <div>
          <div style={styles.pageTitle}>SikaTech Africa</div>
          <div style={styles.date}>{new Date().toDateString()}</div>
        </div>

        <input
          type="text"
          placeholder="Search modules, records..."
          style={styles.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnterSearch();
          }}
        />
      </div>

      <div style={styles.right}>
        <div style={styles.userBlock}>
          <div style={styles.userId}>{user?.employeeId || "staff"}</div>
          <div style={styles.userRole}>{user?.role ?? "staff"}</div>
        </div>

        <span style={styles.rolePill}>{user?.role ?? "staff"}</span>

        <button style={styles.logout} onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    minHeight: 78,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 24px",
    background: "rgba(255,255,255,0.86)",
    borderBottom: "1px solid var(--sk-border)",
    boxShadow: "0 8px 20px rgba(15, 23, 32, 0.05)",
    backdropFilter: "blur(8px)",
    position: "sticky",
    top: 0,
    zIndex: 20,
    gap: 16,
  },

  left: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    minWidth: 0,
    flex: 1,
  },

  pageTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: "var(--sk-navy)",
    lineHeight: 1.1,
  },

  date: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: 700,
    color: "var(--sk-text-soft)",
    whiteSpace: "nowrap",
  },

  search: {
    width: 420,
    maxWidth: "48vw",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid var(--sk-border)",
    outline: "none",
    background: "#ffffff",
    color: "var(--sk-text)",
    fontWeight: 500,
    boxShadow: "inset 0 1px 1px rgba(15,23,32,0.04)",
  },

  right: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },

  userBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
  },

  userId: {
    fontSize: 13,
    fontWeight: 800,
    color: "var(--sk-navy)",
  },

  userRole: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--sk-text-soft)",
    textTransform: "capitalize",
  },

  rolePill: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(209, 162, 27, 0.16)",
    color: "var(--sk-navy)",
    fontWeight: 800,
    textTransform: "capitalize",
    fontSize: 12,
    whiteSpace: "nowrap",
  },

  logout: {
    border: "1px solid rgba(11, 42, 58, 0.08)",
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 12,
    background: "var(--sk-navy)",
    color: "white",
    fontWeight: 800,
  },
};
