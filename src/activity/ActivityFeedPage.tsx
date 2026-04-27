// src/activity/ActivityFeedPage.tsx
import { useMemo, useState } from "react";
import { useActivity } from "./ActivityContext";
import { useModuleConfig } from "../setup/ModuleConfigContext";
import type { ActivityEvent } from "./activityTypes";

type ActionFilter =
  | "ALL"
  | "DEPARTMENT_CREATED"
  | "DEPARTMENT_UPDATED"
  | "DEPARTMENT_DELETED"
  | "RECORD_CREATED"
  | "PAGE_VIEWS"
  | "ACCESS_DENIED";

type AnyActivity = ActivityEvent & {
  at?: number;
  timestamp?: number;
  createdAt?: number;
  ts?: number;
};

function getEventTime(a: AnyActivity): number {
  return a.at ?? a.timestamp ?? a.createdAt ?? a.ts ?? Date.now();
}

function parseMeta(summary: string) {
  const s = String(summary ?? "");
  const isView = s.startsWith("[VIEW]");
  const isDenied = s.startsWith("[DENIED]");
  const sid = s.match(/\bsid=([^\s|]+)/)?.[1] ?? "";
  const path = s.match(/\bpath=([^\s|]+)/)?.[1] ?? "";
  return { isView, isDenied, sid, path, raw: s };
}

function cleanTitle(summary: string) {
  const s = String(summary ?? "");
  // remove tags + metadata
  return s
    .replace(/^\[(VIEW|DENIED)\]\s*/i, "")
    .replace(/\s*\|\s*path=[^\|]+/i, "")
    .replace(/\s*\|\s*sid=[^\|]+/i, "")
    .trim();
}

function shortSid(sid: string) {
  if (!sid) return "";
  return sid.length > 12 ? `${sid.slice(0, 8)}…${sid.slice(-4)}` : sid;
}

export default function ActivityFeedPage() {
  const { activities, clear } = useActivity();
  const { modules } = useModuleConfig();

  const [q, setQ] = useState("");
  const [deptKey, setDeptKey] = useState<string>("ALL");
  const [action, setAction] = useState<ActionFilter>("ALL");
  const [groupBySession, setGroupBySession] = useState(true);

  const deptOptions = useMemo(() => {
    const custom = modules.filter((m) => !m.system);
    return custom.slice().sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [modules]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = ((activities as AnyActivity[]) ?? []).slice();

    const matchesAction = (a: AnyActivity) => {
      if (action === "ALL") return true;

      const meta = parseMeta(a.summary);
      if (action === "PAGE_VIEWS") return meta.isView;
      if (action === "ACCESS_DENIED") return meta.isDenied;

      return a.action === action;
    };

    return list
      .filter((a) => (deptKey === "ALL" ? true : a.moduleKey === deptKey))
      .filter(matchesAction)
      .filter((a) => {
        if (!query) return true;

        const t = getEventTime(a);
        const meta = parseMeta(a.summary);

        const haystack = [
          cleanTitle(a.summary),
          a.moduleLabel,
          a.moduleKey,
          a.action,
          a.actor?.employeeId,
          String(a.actor?.role ?? ""),
          meta.path,
          meta.sid,
          new Date(t).toLocaleString(),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      })
      .sort((a, b) => getEventTime(b) - getEventTime(a));
  }, [activities, q, deptKey, action]);

  const groups = useMemo(() => {
    if (!groupBySession) return [{ title: "", sid: "", items: filtered }];

    const bySid = new Map<string, AnyActivity[]>();
    for (const a of filtered) {
      const { sid } = parseMeta(a.summary);
      const key = sid || "no-sid";
      const arr = bySid.get(key) ?? [];
      arr.push(a);
      bySid.set(key, arr);
    }

    return Array.from(bySid.entries())
      .map(([sid, items]) => ({
        sid,
        title: sid === "no-sid" ? "Session" : `Session (${shortSid(sid)})`,
        items,
        lastTs: items.length ? getEventTime(items[0]) : 0,
      }))
      .sort((a, b) => b.lastTs - a.lastTs);
  }, [filtered, groupBySession]);

  const renderActionPill = (a: AnyActivity) => {
    const meta = parseMeta(a.summary);

    if (meta.isView) return <span style={{ ...styles.pill, ...styles.pillBlue }}>View</span>;
    if (meta.isDenied) return <span style={{ ...styles.pill, ...styles.pillRed }}>Denied</span>;

    if (a.action === "DEPARTMENT_CREATED") return <span style={{ ...styles.pill, ...styles.pillGreen }}>Created</span>;
    if (a.action === "DEPARTMENT_UPDATED") return <span style={{ ...styles.pill, ...styles.pillBlue }}>Updated</span>;
    if (a.action === "DEPARTMENT_DELETED") return <span style={{ ...styles.pill, ...styles.pillRed }}>Deleted</span>;
    if (a.action === "RECORD_CREATED") return <span style={{ ...styles.pill, ...styles.pillGold }}>Record</span>;

    return <span style={styles.pill}>{a.action}</span>;
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.topRow}>
        <div>
          <h2 style={styles.h2}>Activity Feed</h2>
          <p style={styles.p}>What Admin/Management/Auditors review (department changes, records, access, page views)</p>
        </div>

        <button type="button" onClick={clear} style={styles.clearBtn}>
          Clear
        </button>
      </div>

      <div style={styles.filters}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search activity (department, user, action...)"
          style={styles.input}
        />

        <select value={deptKey} onChange={(e) => setDeptKey(e.target.value)} style={styles.select}>
          <option value="ALL">All Departments</option>
          {deptOptions.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>

        <select value={action} onChange={(e) => setAction(e.target.value as ActionFilter)} style={styles.select}>
          <option value="ALL">All Actions</option>
          <option value="PAGE_VIEWS">Page Views</option>
          <option value="ACCESS_DENIED">Access Denied</option>
          <option value="DEPARTMENT_CREATED">Department Created</option>
          <option value="DEPARTMENT_UPDATED">Department Updated</option>
          <option value="DEPARTMENT_DELETED">Department Deleted</option>
          <option value="RECORD_CREATED">Record Created</option>
        </select>

        <label style={styles.checkRow}>
          <input type="checkbox" checked={groupBySession} onChange={(e) => setGroupBySession(e.target.checked)} />
          Group by session
        </label>
      </div>

      <div style={styles.card}>
        {filtered.length === 0 ? (
          <div style={styles.empty}>No activity events yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {groups.map((g, gi) => (
              <div key={g.title || `all-${gi}`} style={g.title ? styles.groupCard : undefined}>
                {g.title ? <div style={styles.groupTitle}>{g.title}</div> : null}

                <div style={{ display: "grid", gap: 10 }}>
                  {g.items.map((a) => {
                    const t = getEventTime(a);
                    const meta = parseMeta(a.summary);

                    return (
                      <div key={a.id} style={styles.item}>
                        <div style={styles.itemTop}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            {renderActionPill(a)}
                            <div style={styles.itemTitle}>{cleanTitle(a.summary)}</div>
                          </div>

                          <div style={styles.time}>{new Date(t).toLocaleString()}</div>
                        </div>

                        <div style={styles.meta}>
                          <span>
                            <b>Department:</b> {a.moduleLabel} <span style={styles.dot}>•</span>{" "}
                            <span style={styles.muted}>({a.moduleKey})</span>
                          </span>

                          <span style={styles.dot}>•</span>

                          <span>
                            <b>By:</b> {a.actor.employeeId}{" "}
                            <span style={styles.muted}>({String(a.actor.role).replace(/_/g, " ")})</span>
                          </span>

                          {meta.path ? (
                            <>
                              <span style={styles.dot}>•</span>
                              <span>
                                <b>Path:</b> <span style={styles.mono}>{meta.path}</span>
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: 18, maxWidth: 1100, margin: "0 auto" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  h2: { margin: 0, fontSize: 22, fontWeight: 900, color: "#0b2a3a" },
  p: { marginTop: 6, color: "rgba(11,42,58,0.78)" },

  filters: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, marginBottom: 12, alignItems: "center" },

  input: {
    flex: 1,
    minWidth: 260,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(11,42,58,0.18)",
    outline: "none",
  },

  select: {
    minWidth: 200,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(11,42,58,0.18)",
    outline: "none",
    background: "white",
    fontWeight: 800,
    color: "#0b2a3a",
  },

  checkRow: { display: "flex", alignItems: "center", gap: 8, fontWeight: 900, color: "#0b2a3a" },

  card: {
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(11,42,58,0.12)",
  },

  groupCard: {
    border: "1px solid rgba(11,42,58,0.10)",
    borderRadius: 14,
    padding: 12,
    background: "rgba(255,255,255,0.60)",
  },

  groupTitle: { fontWeight: 900, color: "#0b2a3a", marginBottom: 10 },

  empty: { color: "rgba(11,42,58,0.7)", fontWeight: 800 },

  item: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(11,42,58,0.12)",
    background: "rgba(255,255,255,0.75)",
  },

  itemTop: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" },
  itemTitle: { fontWeight: 900, color: "#0b2a3a" },
  time: { color: "rgba(11,42,58,0.65)", fontWeight: 800, fontSize: 12 },

  meta: {
    marginTop: 8,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    color: "rgba(11,42,58,0.82)",
    fontWeight: 750,
    fontSize: 13,
  },

  muted: { color: "rgba(11,42,58,0.6)", fontWeight: 800 },
  dot: { color: "rgba(11,42,58,0.35)" },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },

  clearBtn: {
    border: "none",
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 12,
    background: "rgba(180,38,38,0.9)",
    color: "white",
    fontWeight: 900,
    height: 40,
  },

  pill: {
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    background: "rgba(11,42,58,0.10)",
    color: "#0b2a3a",
  },
  pillGreen: { background: "rgba(30,150,80,0.18)" },
  pillBlue: { background: "rgba(20,90,200,0.16)" },
  pillRed: { background: "rgba(180,38,38,0.16)" },
  pillGold: { background: "rgba(209,162,27,0.20)" },
};

