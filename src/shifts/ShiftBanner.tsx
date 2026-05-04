// src/shifts/ShiftBanner.tsx
import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import { canApproveClosings } from "../auth/permissions";
import { useShift } from "./ShiftContext";

type Role = "owner" | "super_admin" | "admin" | "manager" | "assistant_manager" | "accounting" | "auditor" | "front_desk" | "staff";

const CAN_OPEN_SHIFT = new Set<Role>(["staff"]);
const CAN_SUBMIT_CLOSE = new Set<Role>(["staff"]);
const CAN_ACCOUNTING_REVIEW = new Set<Role>(["accounting"]);

// Try to understand backend shift status values safely
function normStatus(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function getShiftState(shift: any): "NO_SHIFT" | "OPEN" | "SUBMITTED" | "ACCOUNTING" | "APPROVAL" | "CLOSED" {
  if (!shift) return "NO_SHIFT";

  const status = normStatus(shift.status);

  // Most common patterns (support multiple backends)
  const OPEN = new Set(["open"]);
  const CLOSED = new Set(["closed", "approved", "done", "completed"]);

  const SUBMITTED = new Set([
    "submitted",
    "pending_close",
    "closing_submitted",
    "pending_closing",
    "close_submitted",
    "awaiting_close",
  ]);

  const ACCOUNTING = new Set([
    "pending_accounting",
    "accounting_review",
    "awaiting_accounting",
    "accounting_pending",
  ]);

  const APPROVAL = new Set([
    "pending_approval",
    "awaiting_approval",
    "manager_approval",
    "approval_pending",
    "ready_for_approval",
  ]);

  if (OPEN.has(status)) return "OPEN";
  if (CLOSED.has(status)) return "CLOSED";
  if (APPROVAL.has(status)) return "APPROVAL";
  if (ACCOUNTING.has(status)) return "ACCOUNTING";
  if (SUBMITTED.has(status)) return "SUBMITTED";

  // Fallbacks if status is missing:
  // If closedAt exists => CLOSED; else if closedAt missing => treat as OPEN-ish
  if (shift.closedAt != null) return "CLOSED";
  return "OPEN";
}

export default function ShiftBanner() {
  const { user } = useAuth();
  const {
    activeShift,
    isShiftOpen,
    loading,
    error,
    refresh,
    openForDept,
    submitClose,
    accountingReview,
    approveClose,
  } = useShift();

  const role = (user as any)?.role as Role | undefined;

  const departmentKey = useMemo(() => {
    return String((user as any)?.departmentKey || (user as any)?.selectedDepartmentKey || "").trim();
  }, [user]);

  const shift: any = activeShift as any;
  const shiftId = shift?.id as string | undefined;
  const shiftDept = String(shift?.departmentKey ?? "").trim() || departmentKey;

  const state = getShiftState(shift);

  // Role gates + status gates
  const canOpen =
    !!user && !!role && CAN_OPEN_SHIFT.has(role) && !!departmentKey && state !== "OPEN" && !isShiftOpen;

  const canSubmitClose =
    !!user && !!role && CAN_SUBMIT_CLOSE.has(role) && !!shiftId && state === "OPEN";

  // Accounting should only review after staff submits close (SUBMITTED) OR when explicitly pending accounting
  const canReview =
    !!user &&
    !!role &&
    CAN_ACCOUNTING_REVIEW.has(role) &&
    !!shiftId &&
    (state === "SUBMITTED" || state === "ACCOUNTING");

  // Managers approve after accounting step, OR if your backend skips accounting, allow from SUBMITTED too
  const canApprove =
    !!user &&
    !!role &&
    canApproveClosings(role) &&
    !!shiftId &&
    (state === "APPROVAL" || state === "ACCOUNTING" || state === "SUBMITTED");

  return (
    <div style={styles.wrap}>
      <div>
        <div style={styles.title}>Shift</div>

        {!user ? (
          <div style={styles.subtle}>Not logged in</div>
        ) : isShiftOpen ? (
          <div style={styles.subtle}>
            Open shift: <b>{shiftId}</b> • Dept: <b>{shiftDept || "(unknown)"}</b>
            <span style={{ marginLeft: 8, opacity: 0.7 }}>
              (status: <b>{normStatus(shift?.status) || "open"}</b>)
            </span>
          </div>
        ) : (
          <div style={styles.subtle}>
            No open shift • Dept: <b>{departmentKey || "(none)"}</b>
          </div>
        )}

        {error ? <div style={styles.error}>{error}</div> : null}
      </div>

      <div style={styles.actions}>
        <button
          type="button"
          onClick={() => refresh(departmentKey || undefined)}
          disabled={loading}
          style={styles.btnOutline}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>

        {/* Staff only: Open Shift */}
        <button
          type="button"
          onClick={() => openForDept(departmentKey)}
          disabled={!canOpen || loading}
          style={canOpen ? styles.btnPrimary : styles.btnDisabled}
          title="Staff only"
        >
          Open Shift
        </button>

        {/* Staff only: Submit Close */}
        {role === "staff" ? (
          <button
            type="button"
            onClick={() => {
              if (!shiftId) return;
              const ok = window.confirm("Submit this shift for closing?");
              if (!ok) return;
              submitClose(shiftId);
            }}
            disabled={!canSubmitClose || loading}
            style={canSubmitClose ? styles.btnWarn : styles.btnDisabled}
          >
            Submit Close
          </button>
        ) : null}

        {/* Accounting: Review */}
        {role === "accounting" ? (
          <button
            type="button"
            onClick={() => {
              if (!shiftId) return;
              const note = window.prompt("Accounting review note (required):", "");
              if (!note || !note.trim()) return;
              accountingReview(shiftId, note.trim());
            }}
            disabled={!canReview || loading}
            style={canReview ? styles.btnPrimary : styles.btnDisabled}
          >
            Accounting Review
          </button>
        ) : null}

        {/* Manager/Admin: Approve Close */}
        {canApproveClosings(role) ? (
          <button
            type="button"
            onClick={() => {
              if (!shiftId) return;
              const ok = window.confirm("Approve closing for this shift?");
              if (!ok) return;
              approveClose(shiftId);
            }}
            disabled={!canApprove || loading}
            style={canApprove ? styles.btnPrimary : styles.btnDisabled}
          >
            Approve Close
          </button>
        ) : null}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: 12,
    border: "1px solid rgba(11,42,58,0.12)",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    background: "rgba(255,255,255,0.65)",
  },
  title: { fontWeight: 900, color: "#0b2a3a" },
  subtle: { opacity: 0.85, fontWeight: 700, color: "rgba(11,42,58,0.85)" },
  error: { marginTop: 6, color: "#8b1f1f", fontSize: 13, fontWeight: 800 },

  actions: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },

  btnPrimary: {
    border: "none",
    cursor: "pointer",
    padding: "10px 12px",
    borderRadius: 12,
    background: "#0b2a3a",
    color: "white",
    fontWeight: 900,
  },
  btnOutline: {
    border: "1px solid rgba(11,42,58,0.18)",
    cursor: "pointer",
    padding: "10px 12px",
    borderRadius: 12,
    background: "white",
    fontWeight: 900,
    color: "#0b2a3a",
  },
  btnWarn: {
    border: "1px solid rgba(209,162,27,0.35)",
    cursor: "pointer",
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(209,162,27,0.16)",
    fontWeight: 900,
    color: "#0b2a3a",
  },
  btnDisabled: {
    border: "1px solid rgba(0,0,0,0.12)",
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(0,0,0,0.04)",
    fontWeight: 900,
    color: "rgba(0,0,0,0.35)",
    cursor: "not-allowed",
  },
};
