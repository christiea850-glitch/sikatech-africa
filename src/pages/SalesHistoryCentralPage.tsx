// src/pages/SalesHistoryCentralPage.tsx
import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import type { Transaction } from "../sales/FrontDeskEntry";

const STORAGE_KEY = "sikatech_transactions_v1";

/* ---------------- helpers ---------------- */

function loadTx(): Transaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Transaction[]) : [];
  } catch {
    return [];
  }
}

function dateKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function weekKey(ts: number) {
  const d = new Date(ts);
  const oneJan = new Date(d.getFullYear(), 0, 1);
  const day = Math.floor((ts - oneJan.getTime()) / 86400000) + 1;
  const week = Math.ceil(day / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function monthKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function yearKey(ts: number) {
  return String(new Date(ts).getFullYear());
}

function money(n: number) {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

/* ---------------- page ---------------- */

export default function SalesHistoryCentralPage() {
  const { user } = useAuth();

  const [groupBy, setGroupBy] = useState<"day" | "week" | "month" | "year">("day");
  const [q, setQ] = useState("");

  const { groups, count } = useMemo(() => {
    const all = loadTx();

    let filtered = [...all];

    // search
    const query = q.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((t) => {
        const text = [
          t.id,
          t.sourceDept,
          t.roomNo,
          t.customerName,
          t.note,
          t.createdBy?.employeeId,
          ...(t.items || []).map((i) => i.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return text.includes(query);
      });
    }

    // newest first
    filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // grouping
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const ts = t.createdAt || 0;
      const key =
        groupBy === "year"
          ? yearKey(ts)
          : groupBy === "month"
          ? monthKey(ts)
          : groupBy === "week"
          ? weekKey(ts)
          : dateKey(ts);

      const arr = map.get(key) || [];
      arr.push(t);
      map.set(key, arr);
    }

    const groups = Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => ({
        key,
        count: list.length,
        total: list.reduce((s, x) => s + (Number(x.total) || 0), 0),
        list,
      }));

    return { groups, count: filtered.length };
  }, [groupBy, q]);

  if (!user) return null;

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "#0b2a3a" }}>
            Central Sales History
          </h2>
          <div style={{ marginTop: 6, fontWeight: 700, opacity: 0.7 }}>
            Full access — all departments, all time
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search transactions, staff, rooms…"
            style={inputStyle}
          />

          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
            style={inputStyle}
          >
            <option value="day">Group by Day</option>
            <option value="week">Group by Week</option>
            <option value="month">Group by Month</option>
            <option value="year">Group by Year</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {groups.length === 0 ? (
          <div style={card}>No records found.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {groups.map((g) => (
              <div key={g.key} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <strong>{g.key}</strong>
                  <strong>
                    {g.count} tx • Total {money(g.total)}
                  </strong>
                </div>

                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={th}>Timestamp</th>
                        <th style={th}>ID</th>
                        <th style={th}>Department</th>
                        <th style={th}>Staff</th>
                        <th style={th}>Room</th>
                        <th style={th}>Total</th>
                        <th style={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.list.slice(0, 50).map((t) => (
                        <tr key={t.id}>
                          <td style={td}>{new Date(t.createdAt).toLocaleString()}</td>
                          <td style={td}>{t.id}</td>
                          <td style={td}>{t.sourceDept}</td>
                          <td style={td}>{t.createdBy?.employeeId}</td>
                          <td style={td}>{t.roomNo ?? "—"}</td>
                          <td style={td}>{money(t.total)}</td>
                          <td style={td}>{t.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {g.list.length > 50 && (
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>
                      Showing first 50 records in this group
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
        Records loaded: {count}
      </div>
    </div>
  );
}

/* ---------------- styles ---------------- */

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(11,42,58,0.18)",
  outline: "none",
  fontWeight: 700,
};

const card: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.8)",
  border: "1px solid rgba(11,42,58,0.12)",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px",
  fontSize: 12,
  borderBottom: "1px solid rgba(11,42,58,0.12)",
};

const td: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid rgba(11,42,58,0.08)",
  whiteSpace: "nowrap",
};
