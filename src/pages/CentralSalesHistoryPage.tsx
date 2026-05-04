import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { canReviewFinancials } from "../auth/permissions";
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

function money(n: number) {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function ymd(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ym(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function year(ts: number) {
  return String(new Date(ts).getFullYear());
}

// simple week key
function weekKey(ts: number) {
  const d = new Date(ts);
  const onejan = new Date(d.getFullYear(), 0, 1);
  const day = Math.floor((ts - onejan.getTime()) / 86400000) + 1;
  const week = Math.ceil(day / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

type GroupBy = "day" | "week" | "month" | "year";

type DeptFilter =
  | "all"
  | "front-desk"
  | "sales"
  | "bar"
  | "kitchen"
  | "cleaning-laundry"
  | "gym"
  | "spa"
  | "marketing"
  | "procurement"
  | "operations"
  | "transport"
  | "accounting";

const deptOptions: Array<{ value: DeptFilter; label: string }> = [
  { value: "all", label: "All departments" },
  { value: "front-desk", label: "Front Desk" },
  { value: "sales", label: "Sales" },
  { value: "bar", label: "Bar" },
  { value: "kitchen", label: "Kitchen" },
  { value: "cleaning-laundry", label: "Laundry & Cleaning" },
  { value: "gym", label: "Gym" },
  { value: "spa", label: "Spa" },
  { value: "marketing", label: "Marketing" },
  { value: "procurement", label: "Procurement" },
  { value: "operations", label: "Operations" },
  { value: "transport", label: "Transport" },
  { value: "accounting", label: "Accounting" },
];

function canAccessCentral(role?: string) {
  return canReviewFinancials(role);
}

export default function CentralSalesHistoryPage() {
  const { user } = useAuth();

  const [groupBy, setGroupBy] = useState<GroupBy>("month");
  const [dept, setDept] = useState<DeptFilter>("all");
  const [q, setQ] = useState("");
  const [showLimit, setShowLimit] = useState<number>(40); // show first N per group

  const { groups, totals, count } = useMemo(() => {
    const all = loadTx();

    // Security: only allow specific roles even if they type the URL
    if (!user || !canAccessCentral(user.role)) {
      return { groups: [], totals: { grandTotal: 0 }, count: 0 };
    }

    let filtered = all.slice();

    // dept filter
    if (dept !== "all") {
      filtered = filtered.filter((t) => (t.sourceDept || "").toLowerCase() === dept);
    }

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
          t.createdBy?.role,
          t.status,
          ...(t.items || []).map((x) => x.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return text.includes(query);
      });
    }

    // newest first
    filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // group key
    const keyOf = (t: Transaction) => {
      const ts = t.createdAt || 0;
      if (groupBy === "year") return year(ts);
      if (groupBy === "month") return ym(ts);
      if (groupBy === "week") return weekKey(ts);
      return ymd(ts); // day
    };

    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const key = keyOf(t);
      const arr = map.get(key) || [];
      arr.push(t);
      map.set(key, arr);
    }

    const groupEntries = Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));

    const g = groupEntries.map(([key, list]) => {
      const total = list.reduce((s, x) => s + (Number(x.total) || 0), 0);
      const paid = list
        .filter((x) => x.status === "PAID")
        .reduce((s, x) => s + (Number(x.total) || 0), 0);
      const open = list
        .filter((x) => x.status === "OPEN")
        .reduce((s, x) => s + (Number(x.total) || 0), 0);
      const posted = list
        .filter((x) => x.status === "POSTED_TO_ROOM")
        .reduce((s, x) => s + (Number(x.total) || 0), 0);

      return {
        key,
        count: list.length,
        total,
        paid,
        open,
        posted,
        list,
      };
    });

    const grandTotal = filtered.reduce((s, x) => s + (Number(x.total) || 0), 0);

    return { groups: g, totals: { grandTotal }, count: filtered.length };
  }, [user, groupBy, dept, q]);

  if (!user) return null;

  // If user somehow accesses page without proper role:
  if (!canAccessCentral(user.role)) {
    return (
      <div style={{ padding: 18, maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0b2a3a" }}>
          Not Authorized
        </h2>
        <div style={{ marginTop: 10, fontWeight: 700, color: "rgba(11,42,58,0.7)" }}>
          You don’t have access to Central Sales History.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 18, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0b2a3a" }}>
            Central Sales History
          </h2>
          <div style={{ marginTop: 6, fontWeight: 800, color: "rgba(11,42,58,0.70)" }}>
            All departments • Days / Weeks / Months / Years • Full timestamps
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by ID, staff, room, item..."
            style={input}
          />

          <select value={dept} onChange={(e) => setDept(e.target.value as DeptFilter)} style={input}>
            {deptOptions.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>

          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} style={input}>
            <option value="day">Group by Day</option>
            <option value="week">Group by Week</option>
            <option value="month">Group by Month</option>
            <option value="year">Group by Year</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={pill}>
          Records: <b>{count}</b>
        </div>
        <div style={pill}>
          Grand Total: <b>{money(totals.grandTotal)}</b>
        </div>

        <div style={{ ...pill, display: "flex", gap: 8, alignItems: "center" }}>
          Show per group:
          <select
            value={showLimit}
            onChange={(e) => setShowLimit(Number(e.target.value))}
            style={{ ...input, padding: "6px 10px" }}
          >
            <option value={20}>20</option>
            <option value={40}>40</option>
            <option value={80}>80</option>
            <option value={150}>150</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {groups.length === 0 ? (
          <div style={card}>No records found.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {groups.map((g) => (
              <div key={g.key} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900, color: "#0b2a3a" }}>{g.key}</div>
                  <div style={{ fontWeight: 900, color: "#0b2a3a" }}>
                    {g.count} tx • Total {money(g.total)}
                  </div>
                </div>

                <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={miniPill}>Paid: <b>{money(g.paid)}</b></div>
                  <div style={miniPill}>Open: <b>{money(g.open)}</b></div>
                  <div style={miniPill}>Posted to Room: <b>{money(g.posted)}</b></div>
                </div>

                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        <th style={th}>Timestamp</th>
                        <th style={th}>Department</th>
                        <th style={th}>ID</th>
                        <th style={th}>Staff</th>
                        <th style={th}>Room</th>
                        <th style={th}>Total</th>
                        <th style={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.list.slice(0, showLimit).map((t) => (
                        <tr key={t.id}>
                          <td style={td}>{new Date(t.createdAt).toLocaleString()}</td>
                          <td style={td}>{t.sourceDept ?? "—"}</td>
                          <td style={td}>{t.id}</td>
                          <td style={td}>{t.createdBy?.employeeId ?? "—"}</td>
                          <td style={td}>{t.roomNo ?? "—"}</td>
                          <td style={td}>{money(t.total)}</td>
                          <td style={td}>{t.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {g.list.length > showLimit && (
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
                      Showing {showLimit} of {g.list.length} in this group. Increase “Show per group” or search.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const input: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(11,42,58,0.18)",
  outline: "none",
  background: "white",
  fontWeight: 700,
};

const card: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.75)",
  border: "1px solid rgba(11,42,58,0.12)",
};

const pill: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 999,
  background: "rgba(11,42,58,0.10)",
  color: "#0b2a3a",
  fontWeight: 800,
};

const miniPill: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 999,
  background: "rgba(209,162,27,0.14)",
  color: "#0b2a3a",
  fontWeight: 800,
  fontSize: 12,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid rgba(11,42,58,0.12)",
  fontSize: 12,
  whiteSpace: "nowrap",
  color: "rgba(11,42,58,0.8)",
};

const td: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(11,42,58,0.08)",
  whiteSpace: "nowrap",
};
