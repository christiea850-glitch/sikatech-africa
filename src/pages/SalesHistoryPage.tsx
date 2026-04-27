import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../auth/AuthContext";
import type { Transaction } from "../sales/FrontDeskEntry";

const STORAGE_KEY = "sikatech_transactions_v1";

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

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dateKey(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function weekStart(ts: number) {
  // Monday-based week start
  const d = new Date(ts);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function weekKey(ts: number) {
  const w = new Date(weekStart(ts));
  const y = w.getFullYear();
  const m = String(w.getMonth() + 1).padStart(2, "0");
  const dd = String(w.getDate()).padStart(2, "0");
  return `${y}-Wk of ${m}/${dd}`;
}

function money(n: number) {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

/**
 * Staff can only see last 30 days and only their dept(s).
 * Adjust prefixes to match your employeeId rules.
 */
function allowedDeptsForStaff(employeeId: string) {
  const id = employeeId.trim().toLowerCase();

  // If you use "sales001" for Sales & Front Desk staff:
  if (id.startsWith("sales")) return ["front-desk", "sales"];

  // Front desk staff:
  if (id.startsWith("fd") || id.startsWith("front")) return ["front-desk"];

  // Default (safest): front-desk only
  return ["front-desk"];
}

type GroupRow = {
  key: string; // display label
  sortTs: number; // used for correct ordering
  count: number;
  total: number;
  list: Transaction[];
};

export default function SalesHistoryPage() {
  const { user } = useAuth();

  const [groupBy, setGroupBy] = useState<"day" | "week">("day");
  const [q, setQ] = useState("");

  const { rows, groups } = useMemo(() => {
    const all = loadTx();

    const now = Date.now();
    const minTs = now - 30 * 24 * 60 * 60 * 1000; // last 30 days

    const allowed = user ? allowedDeptsForStaff(user.employeeId) : [];

    // Base filter: time window
    let filtered = all.filter((t) => (t.createdAt ?? 0) >= minTs);

    // Dept filter
    filtered = filtered.filter((t) => allowed.includes(String(t.sourceDept || "").toLowerCase()));

    // Search
    const query = q.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((t) => {
        const text = [
          t.id,
          t.roomNo,
          t.customerName,
          t.note,
          t.createdBy?.employeeId,
          ...(t.items || []).map((x) => x.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return text.includes(query);
      });
    }

    // Newest first
    filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Grouping (✅ uses startOfDay)
    const map = new Map<string, GroupRow>();

    for (const t of filtered) {
      const createdAt = t.createdAt || 0;

      const sortTs = groupBy === "week" ? weekStart(createdAt) : startOfDay(createdAt);
      const key = groupBy === "week" ? weekKey(createdAt) : dateKey(createdAt);

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          sortTs,
          count: 1,
          total: Number(t.total) || 0,
          list: [t],
        });
      } else {
        existing.count += 1;
        existing.total += Number(t.total) || 0;
        existing.list.push(t);
      }
    }

    const orderedGroups = Array.from(map.values()).sort((a, b) => b.sortTs - a.sortTs);

    return { rows: filtered, groups: orderedGroups };
  }, [user, groupBy, q]);

  if (!user) return null;

  return (
    <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0b2a3a" }}>
            Sales History (Last 30 days)
          </h2>
          <div style={{ color: "rgba(11,42,58,0.7)", fontWeight: 700, marginTop: 6 }}>
            This is limited to your department only.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search..."
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(11,42,58,0.18)",
              outline: "none",
              minWidth: 260,
            }}
          />

          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as "day" | "week")}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(11,42,58,0.18)",
              outline: "none",
            }}
          >
            <option value="day">Group by Day</option>
            <option value="week">Group by Week</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {groups.length === 0 ? (
          <div style={{ padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.75)" }}>
            No records found.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {groups.map((g) => (
              <div
                key={g.key}
                style={{
                  padding: 14,
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.75)",
                  border: "1px solid rgba(11,42,58,0.12)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900, color: "#0b2a3a" }}>{g.key}</div>
                  <div style={{ fontWeight: 900, color: "#0b2a3a" }}>
                    {g.count} tx • Total {money(g.total)}
                  </div>
                </div>

                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        <th style={th}>Timestamp</th>
                        <th style={th}>ID</th>
                        <th style={th}>Room</th>
                        <th style={th}>Total</th>
                        <th style={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.list.slice(0, 25).map((t) => (
                        <tr key={t.id}>
                          <td style={td}>{new Date(t.createdAt).toLocaleString()}</td>
                          <td style={td}>{t.id}</td>
                          <td style={td}>{t.roomNo ?? "—"}</td>
                          <td style={td}>{money(t.total)}</td>
                          <td style={td}>{t.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {g.list.length > 25 && (
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>
                      Showing first 25 in this group. Use search to narrow.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
        Records loaded: {rows.length}
      </div>
    </div>
  );
}

const th: CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid rgba(11,42,58,0.12)",
  fontSize: 12,
  whiteSpace: "nowrap",
  color: "rgba(11,42,58,0.8)",
};

const td: CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(11,42,58,0.08)",
  whiteSpace: "nowrap",
};
