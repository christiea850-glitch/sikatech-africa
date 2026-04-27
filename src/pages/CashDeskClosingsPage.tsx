// src/pages/CashDeskClosingsPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";

type Role =
  | "admin"
  | "manager"
  | "assistant_manager"
  | "accounting"
  | "auditor"
  | "staff"
  | "front_desk";

type ClosingRow = {
  id: number | string;
  business_id: number;
  shift_id: number | string | null;

  submitted_by_user_id: number | string | null;
  submitted_at: string | null;

  status: "submitted" | "accounting_reviewed" | "manager_approved" | "rejected" | string;

  cash_expected: number | string;
  cash_counted: number | string;
  card_total: number | string;
  momo_total: number | string;
  expenses_total: number | string;

  notes?: string | null;

  accounting_reviewed_by_user_id?: number | string | null;
  accounting_reviewed_at?: string | null;
  accounting_note?: string | null;

  manager_approved_by_user_id?: number | string | null;
  manager_approved_at?: string | null;
  manager_note?: string | null;

  rejected_by_user_id?: number | string | null;
  rejected_at?: string | null;
  reject_reason?: string | null;
};

const API_BASE = "http://localhost:4000";

function fmtMoney(v: string | number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return String(v ?? "0");
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDateTime(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

function buildAuthHeaders(userRole?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("auth_token") ||
    localStorage.getItem("access_token");

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  const devUserId = localStorage.getItem("dev_user_id");
  const devRole = localStorage.getItem("dev_role") || userRole;

  if (devUserId) headers["x-user-id"] = devUserId;
  if (devRole) headers["x-role"] = devRole;

  return headers;
}

function resolveBusinessId(raw: unknown): number {
  const value = String(raw ?? "").trim();

  if (value === "biz_main") return 1;

  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  return 1;
}

function canManagerApprove(role: string) {
  return role === "manager" || role === "assistant_manager" || role === "admin";
}

function canAccountingReview(role: string) {
  return role === "accounting" || role === "admin";
}

function canReject(role: string) {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "assistant_manager" ||
    role === "accounting" ||
    role === "auditor"
  );
}

function statusLabel(status: string) {
  switch (status) {
    case "":
      return "All";
    case "submitted":
      return "Submitted";
    case "accounting_reviewed":
      return "Accounting Reviewed";
    case "manager_approved":
      return "Manager Approved";
    case "rejected":
      return "Rejected";
    default:
      return status || "All";
  }
}

function badgeStyle(status: string): React.CSSProperties {
  switch (status) {
    case "submitted":
      return {
        padding: "6px 10px",
        borderRadius: 999,
        fontWeight: 800,
        background: "rgba(245, 158, 11, 0.18)",
        display: "inline-block",
      };
    case "accounting_reviewed":
      return {
        padding: "6px 10px",
        borderRadius: 999,
        fontWeight: 800,
        background: "rgba(59, 130, 246, 0.18)",
        display: "inline-block",
      };
    case "manager_approved":
      return {
        padding: "6px 10px",
        borderRadius: 999,
        fontWeight: 800,
        background: "rgba(34, 197, 94, 0.18)",
        display: "inline-block",
      };
    case "rejected":
      return {
        padding: "6px 10px",
        borderRadius: 999,
        fontWeight: 800,
        background: "rgba(220, 38, 38, 0.18)",
        display: "inline-block",
      };
    default:
      return {
        padding: "6px 10px",
        borderRadius: 999,
        fontWeight: 800,
        background: "rgba(0,0,0,0.08)",
        display: "inline-block",
      };
  }
}

export default function CashDeskClosingsPage() {
  const { user } = useAuth();
  const role = (user?.role ?? "staff") as Role;

  const [status, setStatus] = useState<string>("");
  const [rows, setRows] = useState<ClosingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | number | null>(null);

  const canSeePage = useMemo(() => {
    return (
      role === "admin" ||
      role === "manager" ||
      role === "assistant_manager" ||
      role === "accounting" ||
      role === "auditor"
    );
  }, [role]);

  const currentBusinessId = resolveBusinessId(user?.businessId);

  async function load() {
    try {
      setErr(null);
      setLoading(true);

      const query = new URLSearchParams();
      query.set("businessId", String(currentBusinessId));
      if (status) query.set("status", status);

      const res = await fetch(`${API_BASE}/api/shift-closing?${query.toString()}`, {
        headers: buildAuthHeaders(role),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setRows([]);
        setErr(data?.error || `Failed to load (${res.status})`);
        return;
      }

      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setRows([]);
      setErr(e?.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }

  async function handleAccountingReview(closingId: string | number) {
    try {
      setErr(null);
      setBusyId(closingId);

      const note = window.prompt("Optional accounting note:", "") ?? "";

      const res = await fetch(`${API_BASE}/api/shift-closing/${closingId}/accounting-review`, {
        method: "PATCH",
        headers: buildAuthHeaders(role),
        body: JSON.stringify({
          accountingNote: note.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(data?.error || `Accounting review failed (${res.status})`);
        return;
      }

      await load();
    } catch (e: any) {
      setErr(e?.message || "Accounting review failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleManagerApprove(closingId: string | number) {
    try {
      setErr(null);
      setBusyId(closingId);

      const note = window.prompt("Optional manager note:", "") ?? "";

      const res = await fetch(`${API_BASE}/api/shift-closing/${closingId}/manager-approve`, {
        method: "PATCH",
        headers: buildAuthHeaders(role),
        body: JSON.stringify({
          managerNote: note.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(data?.error || `Manager approval failed (${res.status})`);
        return;
      }

      await load();
    } catch (e: any) {
      setErr(e?.message || "Manager approval failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(closingId: string | number) {
    try {
      setErr(null);
      setBusyId(closingId);

      const reason = window.prompt("Enter rejection reason:");
      if (!reason || reason.trim().length < 3) {
        setErr("Rejection reason must be at least 3 characters.");
        return;
      }

      const res = await fetch(`${API_BASE}/api/shift-closing/${closingId}/reject`, {
        method: "PATCH",
        headers: buildAuthHeaders(role),
        body: JSON.stringify({
          reason: reason.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(data?.error || `Reject failed (${res.status})`);
        return;
      }

      await load();
    } catch (e: any) {
      setErr(e?.message || "Reject failed");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (!canSeePage) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canSeePage, currentBusinessId]);

  if (!canSeePage) {
    return (
      <div style={{ padding: 18 }}>
        <h2 style={{ margin: 0 }}>Not authorized</h2>
        <p style={{ opacity: 0.8 }}>
          Only Admin, Manager, Accounting, and Auditor can access Cash Desk Closings.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Cash Desk Closings — {statusLabel(status)}</h2>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            Logged in as: <b>{role}</b> {user?.employeeId ? `(${user.employeeId})` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 10, fontWeight: 800 }}
          >
            <option value="">All</option>
            <option value="submitted">Submitted</option>
            <option value="accounting_reviewed">Accounting Reviewed</option>
            <option value="manager_approved">Manager Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {err && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            background: "rgba(220,38,38,0.12)",
          }}
        >
          <b>Error:</b> {err}
        </div>
      )}

      {!loading && rows.length === 0 ? (
        <div style={{ marginTop: 14, opacity: 0.8 }}>No rows found.</div>
      ) : (
        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={th}>ID</th>
                <th style={th}>Shift</th>
                <th style={th}>Submitted</th>
                <th style={th}>Cash Expected</th>
                <th style={th}>Cash Counted</th>
                <th style={th}>Card</th>
                <th style={th}>MoMo</th>
                <th style={th}>Expenses</th>
                <th style={th}>Notes</th>
                <th style={th}>Accounting</th>
                <th style={th}>Manager</th>
                <th style={th}>Rejected</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const canDoAccountingReview =
                  canAccountingReview(role) && r.status === "submitted";

                const canDoManagerApprove =
                  canManagerApprove(role) && r.status === "accounting_reviewed";

                const canDoReject =
                  canReject(role) &&
                  (r.status === "submitted" || r.status === "accounting_reviewed");

                const isBusy = busyId === r.id;

                return (
                  <tr key={String(r.id)} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                    <td style={tdMono}>{r.id}</td>
                    <td style={tdMono}>{r.shift_id ?? "—"}</td>

                    <td style={td}>
                      <div>{fmtDateTime(r.submitted_at)}</div>
                      <div style={{ opacity: 0.75 }}>
                        User: {r.submitted_by_user_id ?? "—"}
                      </div>
                    </td>

                    <td style={td}>{fmtMoney(r.cash_expected)}</td>
                    <td style={td}>{fmtMoney(r.cash_counted)}</td>
                    <td style={td}>{fmtMoney(r.card_total)}</td>
                    <td style={td}>{fmtMoney(r.momo_total)}</td>
                    <td style={td}>{fmtMoney(r.expenses_total)}</td>
                    <td style={td}>{r.notes || "—"}</td>

                    <td style={td}>
                      <div>{r.accounting_reviewed_at ? "✅" : "—"}</div>
                      <div style={smallText}>
                        {r.accounting_reviewed_at ? fmtDateTime(r.accounting_reviewed_at) : ""}
                      </div>
                      <div style={smallText}>
                        {r.accounting_reviewed_by_user_id ?? ""}
                      </div>
                      <div style={smallText}>{r.accounting_note || ""}</div>
                    </td>

                    <td style={td}>
                      <div>{r.manager_approved_at ? "✅" : "—"}</div>
                      <div style={smallText}>
                        {r.manager_approved_at ? fmtDateTime(r.manager_approved_at) : ""}
                      </div>
                      <div style={smallText}>
                        {r.manager_approved_by_user_id ?? ""}
                      </div>
                      <div style={smallText}>{r.manager_note || ""}</div>
                    </td>

                    <td style={td}>
                      <div>{r.rejected_at ? "❌" : "—"}</div>
                      <div style={smallText}>
                        {r.rejected_at ? fmtDateTime(r.rejected_at) : ""}
                      </div>
                      <div style={smallText}>{r.rejected_by_user_id ?? ""}</div>
                      <div style={smallText}>{r.reject_reason || ""}</div>
                    </td>

                    <td style={td}>
                      <span style={badgeStyle(r.status)}>{r.status}</span>
                    </td>

                    <td style={td}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {canDoAccountingReview && (
                          <button
                            style={btnGood}
                            disabled={isBusy}
                            onClick={() => handleAccountingReview(r.id)}
                          >
                            {isBusy ? "Working..." : "Accounting Review"}
                          </button>
                        )}

                        {canDoManagerApprove && (
                          <button
                            style={btnGood}
                            disabled={isBusy}
                            onClick={() => handleManagerApprove(r.id)}
                          >
                            {isBusy ? "Working..." : "Manager Approve"}
                          </button>
                        )}

                        {canDoReject && (
                          <button
                            style={btnBad}
                            disabled={isBusy}
                            onClick={() => handleReject(r.id)}
                          >
                            {isBusy ? "Working..." : "Reject"}
                          </button>
                        )}

                        {!canDoAccountingReview && !canDoManagerApprove && !canDoReject && (
                          <span style={{ opacity: 0.7 }}>No actions</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 10px",
  fontWeight: 900,
  letterSpacing: 0.2,
};

const td: React.CSSProperties = {
  padding: "10px 10px",
  verticalAlign: "top",
};

const tdMono: React.CSSProperties = {
  ...td,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  fontSize: 12,
};

const smallText: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  marginTop: 2,
};

const btnGood: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  cursor: "pointer",
  fontWeight: 900,
};

const btnBad: React.CSSProperties = {
  ...btnGood,
  background: "rgba(220,38,38,0.18)",
};