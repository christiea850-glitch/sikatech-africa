// src/pages/DynamicModulePage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useModuleConfig } from "../setup/ModuleConfigContext";

type ModuleShape = {
  key: string;
  label: string;
  enabled: boolean;
  viewRoles: string[];
  editRoles: string[];
  system?: boolean;
};

export default function DynamicModulePage() {
  const { moduleKey } = useParams<{ moduleKey: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { modules, updateModule } = useModuleConfig();

  const module = useMemo<ModuleShape | null>(() => {
    if (!moduleKey) return null;
    return (modules.find((m: any) => m.key === moduleKey) as ModuleShape | undefined) ?? null;
  }, [modules, moduleKey]);

  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    if (!moduleKey) return;
    if (!module) navigate("/app/dashboard", { replace: true });
  }, [moduleKey, module, navigate]);

  if (!moduleKey || !module || !user) return null;

  const canView = Array.isArray(module.viewRoles) && module.viewRoles.includes(user.role);
  if (!canView) {
    return (
      <div style={styles.wrap}>
        <h2 style={styles.h2}>Not Authorized</h2>
        <p style={styles.p}>You don’t have permission to view this module.</p>
      </div>
    );
  }

  const canEdit = Array.isArray(module.editRoles) && module.editRoles.includes(user.role);
  const isSystem = !!module.system;

  const onRename = () => {
    const label = newLabel.trim();
    if (!label) return;
    updateModule(module.key, { label });
    setNewLabel("");
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.topRow}>
        <div>
          <h2 style={styles.h2}>{module.label}</h2>
          <div style={styles.meta}>
            Key: <b>{module.key}</b> • Status: <b>{module.enabled ? "Enabled" : "Disabled"}</b> • Your role:{" "}
            <b style={{ textTransform: "capitalize" }}>{user.role}</b> {canEdit ? " (Can edit)" : " (View only)"}
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.h3}>Module Activity (MVP)</h3>
        <p style={styles.p}>Next, we’ll add “Add Record”, history, and activity feed that rolls up to management.</p>

        {!isSystem && canEdit && (
          <div style={styles.renameRow}>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRename();
              }}
              placeholder="Rename module (optional)"
              style={styles.input}
            />
            <button type="button" style={styles.primaryBtn} onClick={onRename} disabled={!newLabel.trim()}>
              Rename
            </button>
          </div>
        )}

        <div style={styles.notice}>
          ✅ Access granted because your role is included in <b>viewRoles</b>.
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: 18 },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  h2: { margin: 0, color: "#0b2a3a", fontWeight: 900 },
  h3: { marginTop: 0, color: "#0b2a3a", fontWeight: 900 },
  p: { marginTop: 8, color: "rgba(11,42,58,0.78)" },
  meta: { marginTop: 6, color: "rgba(11,42,58,0.75)" },

  card: {
    marginTop: 14,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(11,42,58,0.12)",
    borderRadius: 16,
    padding: 14,
  },

  renameRow: { marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" },
  input: {
    flex: 1,
    minWidth: 240,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(11,42,58,0.18)",
    outline: "none",
  },
  primaryBtn: {
    border: "none",
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 12,
    background: "#0b2a3a",
    color: "white",
    fontWeight: 900,
    opacity: 1,
  },

  notice: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    background: "rgba(209,162,27,0.18)",
    border: "1px solid rgba(209,162,27,0.28)",
    color: "#0b2a3a",
    fontWeight: 700,
  },
};

