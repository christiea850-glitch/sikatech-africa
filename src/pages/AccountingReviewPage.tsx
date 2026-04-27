// src/pages/AccountingReviewPage.tsx
import React, { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useDepartments } from "../departments/DepartmentsContext";
import { useAccountingReview } from "../accounting/AccountingReviewContext";

export default function AccountingReviewPage() {
  const { user } = useAuth();
  const { departments } = useDepartments();
  const { addRequest, requests, resolveRequest, reopenRequest, deleteRequest } = useAccountingReview();

  const reviewableDepartments = useMemo(() => {
    if (!user) return [];
    return departments
      .filter((d) => d.enabled)
      .filter((d) => d.reviewRoles.includes(user.role));
  }, [departments, user]);

  const openRequests = useMemo(() => requests.filter((r) => r.status === "open"), [requests]);
  const resolvedRequests = useMemo(() => requests.filter((r) => r.status === "resolved"), [requests]);

  if (!user) return null;

  return (
    <div style={{ padding: 22 }}>
      <h1 style={{ fontSize: 34, margin: 0 }}>Accounting Review</h1>
      <p style={{ opacity: 0.8, marginTop: 6 }}>
        Send correction requests to departments you’re allowed to review. Accounting does not directly edit department records.
      </p>

      {reviewableDepartments.length === 0 && (
        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>No departments available for review.</div>
          <div style={{ opacity: 0.75, marginTop: 6 }}>
            Ask Admin/Manager to enable <b>Allow Accounting Review</b> for a department.
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
          marginTop: 18,
        }}
      >
        <div style={card}>
          <h3 style={h3}>New Correction Request</h3>
          <RequestBox
            departments={reviewableDepartments}
            onSend={(payload) => addRequest(payload)}
            createdBy={(user as any)?.email || (user as any)?.username || user.role}
          />
        </div>

        <div style={card}>
          <h3 style={h3}>Requests</h3>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Open ({openRequests.length})</div>

            {openRequests.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No open requests.</div>
            ) : (
              openRequests.map((r) => (
                <div key={r.id} style={listItem}>
                  <div style={{ fontWeight: 900 }}>{deptLabel(departments, r.deptKey)}</div>
                  <div style={{ opacity: 0.9, marginTop: 6 }}>{r.message}</div>

                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                    {r.severity.toUpperCase()} • {new Date(r.createdAt).toLocaleString()} • by {r.createdBy}
                    {r.referenceId ? ` • ref: ${r.referenceId}` : ""}
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button style={btnSmall} onClick={() => resolveRequest(r.id)}>
                      Mark Resolved
                    </button>
                    <button style={btnDangerSmall} onClick={() => deleteRequest(r.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Resolved ({resolvedRequests.length})</div>

            {resolvedRequests.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No resolved requests.</div>
            ) : (
              resolvedRequests.map((r) => (
                <div key={r.id} style={listItem}>
                  <div style={{ fontWeight: 900 }}>{deptLabel(departments, r.deptKey)}</div>
                  <div style={{ opacity: 0.9, marginTop: 6 }}>{r.message}</div>

                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                    RESOLVED • {new Date(r.createdAt).toLocaleString()}
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button style={btnSmall} onClick={() => reopenRequest(r.id)}>
                      Reopen
                    </button>
                    <button style={btnDangerSmall} onClick={() => deleteRequest(r.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RequestBox({
  departments,
  onSend,
  createdBy,
}: {
  departments: { key: string; name: string }[];
  onSend: (payload: { deptKey: string; severity: "normal" | "urgent"; message: string; referenceId?: string }) => void;
  createdBy: string;
}) {
  const [deptKey, setDeptKey] = useState("");
  const [severity, setSeverity] = useState<"normal" | "urgent">("normal");
  const [referenceId, setReferenceId] = useState("");
  const [message, setMessage] = useState("");

  const disabled = departments.length === 0;

  return (
    <div style={{ marginTop: 10, opacity: disabled ? 0.6 : 1 }}>
      <label style={label}>Department</label>
      <select style={input} value={deptKey} onChange={(e) => setDeptKey(e.target.value)} disabled={disabled}>
        <option value="">{disabled ? "No departments available…" : "Select department…"}</option>
        {departments.map((d) => (
          <option key={d.key} value={d.key}>
            {d.name}
          </option>
        ))}
      </select>

      <label style={label}>Severity</label>
      <select style={input} value={severity} onChange={(e) => setSeverity(e.target.value as any)} disabled={disabled}>
        <option value="normal">Normal</option>
        <option value="urgent">Urgent</option>
      </select>

      <label style={label}>Reference (optional)</label>
      <input style={input} value={referenceId} onChange={(e) => setReferenceId(e.target.value)} disabled={disabled} />

      <label style={label}>Message</label>
      <textarea
        style={{ ...input, minHeight: 90 }}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={disabled}
      />

      <button
        style={btn}
        disabled={disabled}
        onClick={() => {
          if (!deptKey) return alert("Select a department.");
          if (!message.trim()) return alert("Write a message.");

          onSend({
            deptKey,
            severity,
            message: message.trim(),
            referenceId: referenceId.trim() || undefined,
          });

          setMessage("");
          setReferenceId("");
          alert(`Request sent by ${createdBy}.`);
        }}
      >
        Send Request
      </button>
    </div>
  );
}

function deptLabel(list: { key: string; name: string }[], deptKey: string) {
  const found = list.find((d) => d.key === deptKey);
  return found ? found.name : deptKey;
}

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
  marginTop: 14,
  padding: "10px 14px",
  borderRadius: 12,
  border: "none",
  background: "#0b2a3a",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "none",
  background: "#0b2a3a",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const btnDangerSmall: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "none",
  background: "#b3261e",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const listItem: React.CSSProperties = {
  background: "rgba(255,255,255,0.7)",
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 14,
  padding: 12,
  marginTop: 10,
};
