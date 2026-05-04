// src/pages/ManageModulesPage.tsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useModuleConfig } from "../setup/ModuleConfigContext";
import type { User } from "../auth/AuthContext";
import { useActivity } from "../activity/ActivityContext";
import { useAuth } from "../auth/AuthContext";
import { ALL_ROLES, canReviewFinancials } from "../auth/permissions";

type Role = User["role"];

const DEFAULT_VIEW_ROLES = ALL_ROLES.filter((role) => canReviewFinancials(role));

function toKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function ManageModulesPage() {
  const { modules, addModule, updateModule, deleteModule, resetModules } = useModuleConfig();
  const { log } = useActivity();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const nameRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);

  const [viewRoles, setViewRoles] = useState<Role[]>(DEFAULT_VIEW_ROLES);
  const [editRoles, setEditRoles] = useState<Role[]>(["accounting"]);

  const sorted = useMemo(() => {
    return [...modules].sort((a: any, b: any) =>
      String(a.label ?? a.name ?? "").localeCompare(String(b.label ?? b.name ?? ""))
    );
  }, [modules]);

  const toggleRole = (arr: Role[], r: Role) => (arr.includes(r) ? arr.filter((x) => x !== r) : [...arr, r]);

  const focusNameInput = () => nameRef.current?.focus();

  useEffect(() => {
    const shouldFocus = searchParams.get("focus") === "1";
    if (!shouldFocus) return;

    setTimeout(() => focusNameInput(), 0);

    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAdd = () => {
    const label = name.trim();
    if (!label) return;

    const key = toKey(label);
    if (!key) return;

    if (modules.some((m: any) => m.key === key)) {
      alert(`A module with key "${key}" already exists.`);
      return;
    }

    const newModule = {
      key,
      label,
      enabled,
      viewRoles,
      editRoles,
      system: false,
    };

    addModule(newModule);

    if (user) {
      log({
        actor: { employeeId: user.employeeId, role: user.role },
        moduleKey: newModule.key,
        moduleLabel: newModule.label,
        action: "DEPARTMENT_CREATED",
        summary: `Created module: ${newModule.label}`,
      });
    }

    setName("");
    setEnabled(true);
    setViewRoles(DEFAULT_VIEW_ROLES);
    setEditRoles(["accounting"]);

    setSearchParams({ focus: "1" }, { replace: true });
  };

  const onToggleEnabled = (m: any) => {
    const nextEnabled = !m.enabled;
    updateModule(m.key, { enabled: nextEnabled });

    if (user) {
      log({
        actor: { employeeId: user.employeeId, role: user.role },
        moduleKey: m.key,
        moduleLabel: m.label,
        action: "DEPARTMENT_UPDATED",
        summary: `${nextEnabled ? "Enabled" : "Disabled"} module: ${m.label}`,
      });
    }
  };

  const onDelete = (m: any) => {
    if (!confirm(`Delete "${m.label}"?`)) return;

    deleteModule(m.key);

    if (user) {
      log({
        actor: { employeeId: user.employeeId, role: user.role },
        moduleKey: m.key,
        moduleLabel: m.label,
        action: "DEPARTMENT_DELETED",
        summary: `Deleted module: ${m.label}`,
      });
    }
  };

  const onReset = () => {
    if (!confirm("Reset modules to default settings? This will overwrite your saved module settings.")) return;

    resetModules();

    if (user) {
      log({
        actor: { employeeId: user.employeeId, role: user.role },
        moduleKey: "manage-modules",
        moduleLabel: "Manage Modules",
        action: "DEPARTMENT_UPDATED",
        summary: "Reset modules to default settings",
      });
    }

    setSearchParams({ focus: "1" }, { replace: true });
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.topRow}>
        <div>
          <h2 style={styles.h2}>Manage Modules</h2>
          <p style={styles.p}>Add/disable modules and control who can view/edit them.</p>
        </div>

        <div style={styles.topActions}>
          <button type="button" onClick={onReset} style={styles.resetBtn}>
            Reset Modules
          </button>

          <button type="button" onClick={focusNameInput} style={styles.addTopBtn}>
            + ADD NEW MODULE
          </button>
        </div>
      </div>

      {/* Add module */}
      <div style={styles.card}>
        {/* ✅ fixed layout (no overlap) */}
        <div style={styles.addRow}>
          <div style={{ minWidth: 0 }}>
            <label style={styles.label}>Module Name</label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Inventory, HR, Front Desk"
              style={styles.input}
            />
            <div style={styles.help}>
              Key preview: <b>{toKey(name || "new module")}</b>
            </div>
          </div>

          <div style={styles.enabledBox}>
            <label style={styles.label}>Enabled</label>
            <select
              value={enabled ? "yes" : "no"}
              onChange={(e) => setEnabled(e.target.value === "yes")}
              style={styles.select}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <label style={styles.label}>Who can VIEW?</label>
            <div style={styles.chips}>
              {ALL_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setViewRoles((prev) => toggleRole(prev, r))}
                  style={{
                    ...styles.chip,
                    ...(viewRoles.includes(r) ? styles.chipOn : {}),
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 280 }}>
            <label style={styles.label}>Who can EDIT?</label>
            <div style={styles.chips}>
              {ALL_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setEditRoles((prev) => toggleRole(prev, r))}
                  style={{
                    ...styles.chip,
                    ...(editRoles.includes(r) ? styles.chipOn : {}),
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button type="button" onClick={onAdd} style={styles.primaryBtn}>
          Add Module
        </button>
      </div>

      {/* Existing modules */}
      <div style={styles.card}>
        <h3 style={styles.h3}>Existing Modules</h3>

        {sorted.length === 0 ? (
          <div style={styles.empty}>No modules yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {sorted.map((m: any) => (
              <div key={m.key} style={styles.moduleRow}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={styles.moduleTitle}>
                    {m.label} <span style={styles.muted}>({m.key})</span>
                  </div>

                  <div style={styles.mutedSmall}>
                    View: {(m.viewRoles ?? []).join(", ") || "—"} | Edit: {(m.editRoles ?? []).join(", ") || "—"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" style={styles.secondaryBtn} onClick={() => onToggleEnabled(m)}>
                    {m.enabled ? "Disable" : "Enable"}
                  </button>

                  <button type="button" style={styles.dangerBtn} onClick={() => onDelete(m)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const baseField: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 44,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(11,42,58,0.18)",
  outline: "none",
  boxSizing: "border-box",
  display: "block",
  position: "static",
};

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: 18, maxWidth: 1100, margin: "0 auto" },

  topRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },

  topActions: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },

  h2: { margin: 0, fontSize: 22, fontWeight: 900, color: "#0b2a3a" },
  h3: { margin: "0 0 10px", fontSize: 16, fontWeight: 900, color: "#0b2a3a" },
  p: { marginTop: 6, color: "rgba(11,42,58,0.8)" },

  addTopBtn: {
    border: "1px solid rgba(209,162,27,0.35)",
    cursor: "pointer",
    padding: "12px 14px",
    borderRadius: 14,
    background: "rgba(209,162,27,0.22)",
    color: "#0b2a3a",
    fontWeight: 900,
    height: 44,
    whiteSpace: "nowrap",
  },

  resetBtn: {
    border: "1px solid rgba(180,38,38,0.45)",
    cursor: "pointer",
    padding: "12px 14px",
    borderRadius: 14,
    background: "rgba(180,38,38,0.10)",
    color: "#8b1f1f",
    fontWeight: 900,
    height: 44,
    whiteSpace: "nowrap",
  },

  card: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(11,42,58,0.12)",
  },

  row: { display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" },

  // ✅ hard stop for overlap: grid + fixed right column + static positioning
  addRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 260px",
    gap: 14,
    alignItems: "start",
    marginBottom: 14,
  },

  enabledBox: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    width: 260,
    justifySelf: "end",
    position: "static",
  },

  label: { display: "block", fontWeight: 800, marginBottom: 6, color: "#0b2a3a" },

  input: { ...baseField },
  select: { ...baseField },

  help: { marginTop: 8, color: "rgba(11,42,58,0.7)", fontSize: 12 },

  chips: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: {
    border: "1px solid rgba(11,42,58,0.18)",
    borderRadius: 999,
    padding: "8px 10px",
    cursor: "pointer",
    background: "white",
    fontWeight: 800,
    textTransform: "capitalize",
  },
  chipOn: { background: "rgba(11,42,58,0.12)" },

  primaryBtn: {
    marginTop: 12,
    border: "none",
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 12,
    background: "#0b2a3a",
    color: "white",
    fontWeight: 900,
  },

  secondaryBtn: {
    border: "1px solid rgba(11,42,58,0.18)",
    cursor: "pointer",
    padding: "10px 12px",
    borderRadius: 12,
    background: "white",
    fontWeight: 900,
  },

  dangerBtn: {
    border: "none",
    cursor: "pointer",
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(180,38,38,0.9)",
    color: "white",
    fontWeight: 900,
  },

  moduleRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(11,42,58,0.12)",
    background: "rgba(255,255,255,0.75)",
    flexWrap: "wrap",
  },

  moduleTitle: { fontWeight: 900, color: "#0b2a3a" },
  muted: { fontWeight: 700, color: "rgba(11,42,58,0.55)" },
  mutedSmall: { fontSize: 12, color: "rgba(11,42,58,0.65)", marginTop: 4 },

  empty: { color: "rgba(11,42,58,0.7)" },
};
