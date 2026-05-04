// src/components/Sidebar.tsx
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth, type User } from "../auth/AuthContext";
import { useModuleConfig } from "../setup/ModuleConfigContext";
import { useDepartments } from "../departments/DepartmentsContext";
import { canShowNav } from "../setup/canShowNav";

type Item = {
  key: string;
  label: string;
  path: string;
  group: "daily" | "financial" | "business" | "system" | "departments";
};

const PRIVILEGED_ROLES = [
  "admin",
  "manager",
  "assistant_manager",
  "accounting",
  "auditor",
  "front_desk",
] as const;

function isPrivilegedRole(role: string) {
  return (PRIVILEGED_ROLES as readonly string[]).includes(role);
}

function getUserDepartmentKey(user: User): string | null {
  return user.departmentKey ?? null;
}

const CASH_DESK_CLOSINGS_ROLES: User["role"][] = [
  "admin",
  "manager",
  "assistant_manager",
  "accounting",
  "auditor",
];

export default function Sidebar() {
  const { user } = useAuth();
  const { modules } = useModuleConfig();
  const { departments, canManageDepartments } = useDepartments();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(true);
  const [financialOpen, setFinancialOpen] = useState(true);
  const [businessOpen, setBusinessOpen] = useState(true);
  const [systemOpen, setSystemOpen] = useState(true);

  const [q, setQ] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  if (!user) return null;

  const privileged = isPrivilegedRole(user.role);
  const staffDeptKey = privileged ? null : getUserDepartmentKey(user);

  const modulePath = (key: string) => {
    if (key === "dashboard") return "/app/dashboard";
    if (key === "sales-entry") return "/app/sales";
    if (key === "sales-summary") return "/app/sales-dashboard";
    if (key === "accounting-workbench") return "/app/accounting-workbench";
    if (key === "ledger-debug") return "/app/ledger-debug";
    if (key === "notifications") return "/app/notifications";
    if (key === "reconcile") return "/app/reconcile";
    if (key === "manage-modules") return "/app/manage-modules";
    if (key === "audit-logs") return "/app/audit-logs";
    if (key === "cash-desk-closings") return "/app/cash-desk-closings";
    return `/app/${key}`;
  };

  const dailyItems: Item[] = useMemo(() => {
    const items: Item[] = [];

    items.push({
      key: "dashboard",
      label: "Dashboard",
      path: modulePath("dashboard"),
      group: "daily",
    });

    if (canShowNav(user, modules, "sales")) {
      items.push({
        key: "sales-entry",
        label: "Sales Entry",
        path: modulePath("sales-entry"),
        group: "daily",
      });

      if (privileged) {
        items.push({
          key: "front-desk-room-board",
          label: "Front Desk / Room Board",
          path: modulePath("sales-entry"),
          group: "daily",
        });
      }
    }

    if (canShowNav(user, modules, "shift-closing") || user.role === "admin") {
      items.push({
        key: "shift-closing",
        label: "Shift Closing",
        path: modulePath("shift-closing"),
        group: "daily",
      });
    }

    return items;
  }, [user, modules, privileged]);

  const financialItems: Item[] = useMemo(() => {
    if (!privileged) return [];

    const items: Item[] = [];

    if (canShowNav(user, modules, "sales")) {
      items.push({
        key: "sales-summary",
        label: "Sales Summary Analytics",
        path: modulePath("sales-summary"),
        group: "financial",
      });
    }

    if (canShowNav(user, modules, "reconcile") || user.role === "admin") {
      items.push({
        key: "reconcile",
        label: "Reconcile Sales",
        path: modulePath("reconcile"),
        group: "financial",
      });
    }

    if (user.role === "accounting" || user.role === "admin") {
      items.push({
        key: "accounting-workbench",
        label: "Accounting Review",
        path: modulePath("accounting-workbench"),
        group: "financial",
      });
    }

    const canSeeCDC =
      CASH_DESK_CLOSINGS_ROLES.includes(user.role) &&
      (canShowNav(user, modules, "cash-desk-closings") || user.role === "admin");

    if (canSeeCDC) {
      items.push({
        key: "cash-desk-closings",
        label: "Cash Desk Closings",
        path: modulePath("cash-desk-closings"),
        group: "financial",
      });
    }

    return items;
  }, [user, modules, privileged]);

  const visibleDepartments = useMemo(() => {
    const canRoleView = (d: any) => {
      const roles = d.viewRoles;
      if (!Array.isArray(roles) || roles.length === 0) return true;
      return roles.includes(user.role);
    };

    const base = departments
      .filter((d: any) => d.enabled)
      .filter(canRoleView)
      .slice()
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));

    if (privileged) return base;

    if (!staffDeptKey) return [];
    return base.filter((d: any) => d.key === staffDeptKey);
  }, [departments, user.role, privileged, staffDeptKey]);

  const departmentItems: Item[] = useMemo(() => {
    return visibleDepartments.map((d: any) => ({
      key: d.key,
      label: d.name,
      path: `/app/departments/${d.key}`,
      group: "departments" as const,
    }));
  }, [visibleDepartments]);

  const businessItems: Item[] = useMemo(() => {
    if (!privileged) return [];

    const items: Item[] = [];

    if (canManageDepartments) {
      items.push({
        key: "manage-departments",
        label: "Departments",
        path: "/app/departments/manage",
        group: "business",
      });
    }

    if (canShowNav(user, modules, "manage-modules") || user.role === "admin") {
      items.push({
        key: "manage-modules",
        label: "Manage Modules",
        path: modulePath("manage-modules"),
        group: "business",
      });
    }

    return items;
  }, [privileged, canManageDepartments, user, modules]);

  const systemItems: Item[] = useMemo(() => {
    const items: Item[] = [];

    if (canShowNav(user, modules, "notifications")) {
      items.push({
        key: "notifications",
        label: "Notifications",
        path: modulePath("notifications"),
        group: "system",
      });
    }

    if (user.role === "accounting" || user.role === "admin") {
      items.push({
        key: "ledger-debug",
        label: "Ledger Debug",
        path: modulePath("ledger-debug"),
        group: "system",
      });
    }

    if (canShowNav(user, modules, "audit-logs") || user.role === "admin") {
      items.push({
        key: "audit-logs",
        label: "Audit Logs",
        path: modulePath("audit-logs"),
        group: "system",
      });
    }

    return items;
  }, [user, modules]);

  const allItems: Item[] = useMemo(
    () => [...dailyItems, ...financialItems, ...departmentItems, ...businessItems, ...systemItems],
    [dailyItems, financialItems, departmentItems, businessItems, systemItems]
  );

  const query = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!query) return [];
    const starts = allItems.filter((i) => i.label.toLowerCase().startsWith(query));
    const includes = allItems.filter(
      (i) => !i.label.toLowerCase().startsWith(query) && i.label.toLowerCase().includes(query)
    );
    return [...starts, ...includes].slice(0, 8);
  }, [query, allItems]);

  const showSuggestions = !collapsed && query.length > 0;

  function goTo(item: Item) {
    navigate(item.path);
    setQ("");
    setActiveIndex(0);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!filtered.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((v) => Math.min(v + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((v) => Math.max(v - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[activeIndex] ?? filtered[0];
      if (item) goTo(item);
    } else if (e.key === "Escape") {
      setQ("");
      setActiveIndex(0);
    }
  }

  const SectionTitle = ({
    title,
    open,
    onToggle,
  }: {
    title: string;
    open: boolean;
    onToggle: () => void;
  }) => (
    <div style={styles.sectionRow}>
      {!collapsed && (
        <button style={styles.sectionToggle} onClick={onToggle} aria-label={`Toggle ${title}`}>
          {open ? "▼" : "▶"}
        </button>
      )}
      {!collapsed && <div style={styles.sectionTitle}>{title}</div>}
    </div>
  );

  const LinkRow = ({ label, path }: { label: string; path: string }) => (
    <NavLink
      to={path}
      style={({ isActive }) => ({
        ...styles.link,
        ...(collapsed ? styles.linkCollapsed : {}),
        ...(isActive ? styles.linkActive : {}),
      })}
      title={collapsed ? label : undefined}
    >
      {!collapsed && label}
      {collapsed && <span style={styles.dotBullet}>•</span>}
    </NavLink>
  );

  return (
    <aside
      style={{
        ...styles.sidebar,
        width: collapsed ? 84 : 292,
        padding: collapsed ? 12 : 16,
      }}
    >
      <div style={styles.brandRow}>
        {!collapsed && (
          <div>
            <div style={styles.brand}>SikaTech Africa</div>
            <div style={styles.brandSub}>Hospitality Ops Platform</div>
          </div>
        )}

        <button
          onClick={() => setCollapsed((v) => !v)}
          style={styles.collapseBtn}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "☰" : "⟨"}
        </button>
      </div>

      {!collapsed && (
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Search modules..."
            style={styles.search}
          />

          {showSuggestions && (
            <div style={styles.suggestBox}>
              {filtered.length === 0 ? (
                <div style={styles.suggestEmpty}>No matches</div>
              ) : (
                filtered.map((item, idx) => (
                  <button
                    key={`${item.group}-${item.key}-${idx}`}
                    style={{
                      ...styles.suggestItem,
                      ...(idx === activeIndex ? styles.suggestItemActive : {}),
                    }}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => goTo(item)}
                  >
                    <div style={{ fontWeight: 800 }}>{item.label}</div>
                    <div style={styles.suggestMeta}>{item.group.toUpperCase()}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <nav style={styles.nav}>
        <SectionTitle title="Daily Operations" open={dailyOpen} onToggle={() => setDailyOpen((v) => !v)} />
        {collapsed
          ? null
          : !dailyOpen
          ? null
          : dailyItems.map((i) => <LinkRow key={i.key} label={i.label} path={i.path} />)}

        {financialItems.length > 0 ? (
          <>
            <SectionTitle title="Financial Control" open={financialOpen} onToggle={() => setFinancialOpen((v) => !v)} />
            {collapsed
              ? null
              : !financialOpen
              ? null
              : financialItems.map((i) => <LinkRow key={i.key} label={i.label} path={i.path} />)}
          </>
        ) : null}

        {businessItems.length > 0 || departmentItems.length > 0 ? (
          <>
            <SectionTitle title="Business Setup" open={businessOpen} onToggle={() => setBusinessOpen((v) => !v)} />
            {collapsed ? null : !businessOpen ? null : (
              <>
                {businessItems.map((i) => (
                  <LinkRow key={i.key} label={i.label} path={i.path} />
                ))}
                {departmentItems.length === 0 ? (
                  <div style={styles.mutedText}>
                    {privileged
                      ? "No departments."
                      : "No department assigned."}
                  </div>
                ) : (
                  departmentItems.map((i) => <LinkRow key={i.key} label={i.label} path={i.path} />)
                )}
              </>
            )}
          </>
        ) : null}

        {systemItems.length > 0 ? (
          <>
            <SectionTitle title="System" open={systemOpen} onToggle={() => setSystemOpen((v) => !v)} />
            {collapsed
              ? null
              : !systemOpen
              ? null
              : systemItems.map((i) => <LinkRow key={i.key} label={i.label} path={i.path} />)}
          </>
        ) : null}
      </nav>
    </aside>
  );
}

const styles: Record<string, CSSProperties> = {
  sidebar: {
    background:
      "linear-gradient(180deg, #0d3145 0%, #0a2635 55%, #071c27 100%)",
    color: "#e8f1f5",
    position: "sticky",
    top: 0,
    height: "100vh",
    overflowY: "auto",
    borderRight: "1px solid rgba(255,255,255,0.1)",
    boxShadow:
      "inset -1px 0 0 rgba(255,255,255,0.04), 8px 0 20px rgba(6, 17, 24, 0.25)",
  },
  brandRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 18,
  },
  brand: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: 0.2,
    lineHeight: 1.1,
    color: "#ffffff",
  },
  brandSub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(232,241,245,0.7)",
  },
  collapseBtn: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.12)",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 900,
    borderRadius: 10,
    padding: "8px 10px",
    cursor: "pointer",
    minWidth: 40,
  },
  search: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.12)",
    color: "#ffffff",
    outline: "none",
    fontWeight: 600,
  },
  suggestBox: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    background: "#102f40",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 12,
    overflow: "hidden",
    zIndex: 50,
    boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
  },
  suggestEmpty: {
    padding: "10px 12px",
    opacity: 0.75,
    fontWeight: 600,
  },
  suggestItem: {
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    border: "none",
    background: "transparent",
    color: "#ffffff",
    cursor: "pointer",
  },
  suggestItemActive: {
    background: "rgba(255,255,255,0.08)",
  },
  suggestMeta: {
    fontSize: 11,
    opacity: 0.65,
    marginTop: 2,
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingTop: 6,
  },
  sectionRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 6,
    padding: "0 4px",
  },
  sectionToggle: {
    border: "none",
    background: "rgba(255,255,255,0.08)",
    color: "#ffffff",
    fontWeight: 900,
    borderRadius: 8,
    padding: "6px 8px",
    cursor: "pointer",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(232,241,245,0.65)",
    flex: 1,
  },
  mutedText: {
    padding: "0 8px",
    opacity: 0.7,
    fontSize: 13,
    lineHeight: 1.4,
  },
  link: {
    textDecoration: "none",
    color: "rgba(232,241,245,0.95)",
    padding: "11px 12px",
    borderRadius: 12,
    fontWeight: 700,
    transition: "all 0.15s ease",
    display: "block",
    border: "1px solid transparent",
  },
  linkCollapsed: {
    padding: "12px 10px",
    textAlign: "center",
  },
  linkActive: {
    background: "rgba(255,255,255,0.16)",
    color: "#ffffff",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
  },
  dotBullet: {
    fontWeight: 900,
    fontSize: 18,
    lineHeight: 1,
  },
};
