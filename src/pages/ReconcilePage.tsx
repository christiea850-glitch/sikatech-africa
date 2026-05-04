// src/pages/ReconcilePage.tsx

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../auth/AuthContext";
import { canOperateFrontDesk } from "../auth/permissions";
import { useShift } from "../shifts/ShiftContext";
import { getRoomFolio, getShiftSummary } from "../api/mvpClient";

function money(n: number) {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

type SummaryRow = {
  departmentKey: string;
  departmentName?: string;
  total: number;
  count?: number;
  postedToRoomTotal?: number;
  cashTotal?: number;
  momoTotal?: number;
  cardTotal?: number;
  transferTotal?: number;
  payNowTotal?: number;
};

export default function ReconcilePage() {
  const { user } = useAuth();
  const { activeShift } = useShift();

  const [roomNo, setRoomNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [folio, setFolio] = useState<any | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const canView = !!user && canOperateFrontDesk(user);

  const loadSummary = async () => {
    if (!user || !activeShift?.id || !canView) return;

    setLoading(true);
    setMsg(null);

    const r = await getShiftSummary(activeShift.id);

    if (r.ok) setSummary((r.data as any)?.byDepartment ?? []);
    else setMsg(r.error);

    setLoading(false);
  };

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeShift?.id, canView]);

  const totalAll = useMemo(
    () => summary.reduce((s, x) => s + Number(x.total || 0), 0),
    [summary]
  );

  const fetchFolio = async () => {
    if (!user || !activeShift?.id) return;

    const rn = roomNo.trim();
    if (!rn) return;

    setLoading(true);
    setMsg(null);
    setFolio(null);

    const r = await getRoomFolio(activeShift.id, rn);

    if (r.ok) setFolio(r.data);
    else setMsg(r.error);

    setLoading(false);
  };

  if (!user) return null;

  if (!canView) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.h2}>Not authorized</div>
          <div style={styles.p}>
            Only Front Desk / Accounting / Managers can access reconciliation.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.topRow}>
        <div>
          <div style={styles.h2}>Front Desk Reconciliation</div>
          <div style={styles.p}>
            Shift totals by department + room folio view (summary only).
          </div>
          <div style={styles.small}>
            Active Shift: <b>{activeShift?.id ?? "none"}</b>
          </div>
        </div>

        <button style={styles.btn} onClick={loadSummary} disabled={loading}>
          Refresh
        </button>
      </div>

      {msg ? <div style={styles.notice}>{msg}</div> : null}

      <div style={styles.card}>
        <div style={styles.h3}>Shift Summary</div>
        <div style={styles.small}>No item details shown. Totals only.</div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Department</th>
                <th style={styles.thR}>Count</th>
                <th style={styles.thR}>Posted to Room</th>
                <th style={styles.thR}>Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.departmentKey}>
                  <td style={styles.td}>
                    {String(s.departmentName ?? s.departmentKey).replace(/_/g, " ")}
                  </td>
                  <td style={styles.tdR}>{Number(s.count ?? 0)}</td>
                  <td style={styles.tdR}>{money(Number(s.postedToRoomTotal ?? 0))}</td>
                  <td style={styles.tdR}>
                    <b>{money(Number(s.total ?? 0))}</b>
                  </td>
                </tr>
              ))}
              {summary.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={4}>
                    {loading ? "Loading..." : "No summary data yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={styles.totalBox}>
          Grand Total: <b>{money(totalAll)}</b>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.h3}>Room Folio</div>

        <div style={styles.row}>
          <input
            value={roomNo}
            onChange={(e) => setRoomNo(e.target.value)}
            placeholder="Enter Room No (e.g., 305)"
            style={styles.input}
          />
          <button style={styles.btn} onClick={fetchFolio} disabled={loading}>
            View Folio
          </button>
        </div>

        {folio ? (
          <>
            <div style={{ marginTop: 10, fontWeight: 900 }}>
              Room {folio.roomNo} — Total: {money(Number(folio.total ?? 0))}
            </div>

            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Department</th>
                    <th style={styles.thR}>Count</th>
                    <th style={styles.thR}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(folio.items || []).map((c: any) => (
                    <tr key={c.departmentKey}>
                      <td style={styles.td}>{String(c.departmentKey).replace(/_/g, " ")}</td>
                      <td style={styles.tdR}>{Number(c.count ?? 0)}</td>
                      <td style={styles.tdR}>
                        <b>{money(Number(c.total ?? 0))}</b>
                      </td>
                    </tr>
                  ))}
                  {(folio.items || []).length === 0 ? (
                    <tr>
                      <td style={styles.td} colSpan={3}>
                        No posted-to-room charges for this room.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div style={styles.small}>
            Enter a room number to view posted-to-room charges.
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { padding: 18, maxWidth: 1100, margin: "0 auto" },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  card: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(11,42,58,0.12)",
  },
  h2: { fontSize: 22, fontWeight: 900, color: "#0b2a3a" },
  h3: { fontSize: 16, fontWeight: 900, color: "#0b2a3a" },
  p: { marginTop: 6, color: "rgba(11,42,58,0.78)", fontWeight: 700 },
  small: {
    marginTop: 6,
    color: "rgba(11,42,58,0.65)",
    fontSize: 12,
    fontWeight: 800,
  },
  notice: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: "rgba(11,42,58,0.08)",
    border: "1px solid rgba(11,42,58,0.12)",
    fontWeight: 800,
  },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0 },
  th: {
    textAlign: "left",
    padding: "10px 10px",
    borderBottom: "1px solid rgba(11,42,58,0.12)",
    fontSize: 12,
    color: "rgba(11,42,58,0.8)",
  },
  thR: {
    textAlign: "right",
    padding: "10px 10px",
    borderBottom: "1px solid rgba(11,42,58,0.12)",
    fontSize: 12,
    color: "rgba(11,42,58,0.8)",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 10px",
    borderBottom: "1px solid rgba(11,42,58,0.08)",
    fontWeight: 800,
    color: "#0b2a3a",
  },
  tdR: {
    padding: "10px 10px",
    borderBottom: "1px solid rgba(11,42,58,0.08)",
    textAlign: "right",
    fontWeight: 800,
    color: "#0b2a3a",
    whiteSpace: "nowrap",
  },
  totalBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: "rgba(209,162,27,0.12)",
    border: "1px solid rgba(209,162,27,0.22)",
    fontWeight: 900,
  },
  row: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 12,
    alignItems: "center",
  },
  input: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(11,42,58,0.18)",
    background: "white",
    minWidth: 220,
  },
  btn: {
    border: "none",
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 12,
    background: "#0b2a3a",
    color: "white",
    fontWeight: 900,
  },
};
