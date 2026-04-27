// src/pages/NotificationsPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import type { SikaNotification, Role } from "../notifications/notificationsTypes";
import {
  readNotifications,
  markRead,
  markAllReadFor,
  clearAll,
  canUserSeeNotification,
} from "../notifications/notificationsStore";

type AnyN = SikaNotification & {
  id?: string;
  title?: string;
  message?: string;
  summary?: string;
  createdAt?: number;
  timestamp?: number;
  at?: number;
  readBy?: string[];
  toRoles?: Role[];
  severity?: "info" | "success" | "warning" | "error";
};

function getTime(n: AnyN) {
  return n.createdAt ?? n.timestamp ?? n.at ?? Date.now();
}

function getText(n: AnyN) {
  return (n.message ?? n.summary ?? "").toString();
}

function getTitle(n: AnyN) {
  return (n.title ?? "Notification").toString();
}

function isReadBy(n: AnyN, employeeId: string) {
  const rb = (n as any).readBy as string[] | undefined;
  return Array.isArray(rb) && rb.includes(employeeId);
}

export default function NotificationsPage() {
  const { user } = useAuth();

  const employeeId = user?.employeeId ?? "";
  const role = (user?.role ?? "staff") as Role;

  const [items, setItems] = useState<SikaNotification[]>([]);
  const [q, setQ] = useState("");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  // Load + keep synced (also reacts to localStorage updates from other tabs)
  useEffect(() => {
    const refresh = () => setItems(readNotifications());
    refresh();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "sikatech_notify_v1") refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();

    return (items as AnyN[])
      .filter((n) => canUserSeeNotification(n as any, role))
      .filter((n) => {
        if (!showUnreadOnly) return true;
        return !isReadBy(n, employeeId);
      })
      .filter((n) => {
        if (!query) return true;
        const hay = [
          getTitle(n),
          getText(n),
          new Date(getTime(n)).toLocaleString(),
          String((n as any).severity ?? ""),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => getTime(b) - getTime(a));
  }, [items, q, showUnreadOnly, employeeId, role]);

  const unreadCount = useMemo(() => {
    return (items as AnyN[]).filter((n) => canUserSeeNotification(n as any, role)).filter((n) => !isReadBy(n, employeeId))
      .length;
  }, [items, employeeId, role]);

  const refresh = () => setItems(readNotifications());

  const onMarkRead = (id: string) => {
    if (!employeeId) return;
    markRead(id, employeeId);     // ✅ 2 args
    refresh();                    // ✅ re-read and update UI
  };

  const onMarkAllRead = () => {
    if (!employeeId) return;
    markAllReadFor(employeeId);   // ✅ requires employeeId
    refresh();
  };

  const onClearAll = () => {
    clearAll();
    refresh();
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.topRow}>
        <div>
          <h2 style={styles.h2}>Notifications</h2>
          <p style={styles.p}>
            Alerts for Admin/Accounting/GM (and any role targeted by the notification).{" "}
            <b>{unreadCount}</b> unread.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={styles.btn} onClick={onMarkAllRead}>
            Mark all read
          </button>

          {/* If you want: restrict this to admin only */}
          <button type="button" style={{ ...styles.btn, ...styles.btnDanger }} onClick={onClearAll}>
            Clear all
          </button>
        </div>
      </div>

      <div style={styles.filters}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notifications..."
          style={styles.input}
        />

        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={showUnreadOnly}
            onChange={(e) => setShowUnreadOnly(e.target.checked)}
          />
          <span>Unread only</span>
        </label>
      </div>

      <div style={styles.card}>
        {visible.length === 0 ? (
          <div style={styles.empty}>No notifications to show.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {visible.map((raw) => {
              const n = raw as AnyN;
              const id = (n as any).id as string | undefined;
              const t = getTime(n);
              const read = isReadBy(n, employeeId);

              return (
                <div key={id ?? `${t}-${getTitle(n)}`} style={styles.item}>
                  <div style={styles.itemTop}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ ...styles.pill, ...(read ? styles.pillRead : styles.pillUnread) }}>
                        {read ? "Read" : "Unread"}
                      </span>
                      <div style={styles.title}>{getTitle(n)}</div>
                    </div>

                    <div style={styles.time}>{new Date(t).toLocaleString()}</div>
                  </div>

                  <div style={styles.msg}>{getText(n) || "—"}</div>

                  <div style={styles.actions}>
                    {!read && id && (
                      <button type="button" style={styles.btnSmall} onClick={() => onMarkRead(id)}>
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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

  filters: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 10, marginBottom: 12 },
  input: {
    flex: 1,
    minWidth: 260,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(11,42,58,0.18)",
    outline: "none",
  },
  checkbox: { display: "flex", gap: 8, alignItems: "center", fontWeight: 800, color: "#0b2a3a" },

  card: {
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(11,42,58,0.12)",
  },
  empty: { color: "rgba(11,42,58,0.7)", fontWeight: 800 },

  item: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(11,42,58,0.12)",
    background: "rgba(255,255,255,0.78)",
  },
  itemTop: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" },
  title: { fontWeight: 900, color: "#0b2a3a" },
  time: { color: "rgba(11,42,58,0.65)", fontWeight: 800, fontSize: 12 },
  msg: { marginTop: 8, color: "rgba(11,42,58,0.85)", fontWeight: 700, lineHeight: 1.35 },

  actions: { marginTop: 10, display: "flex", gap: 10 },

  btn: {
    border: "none",
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 12,
    background: "#0b2a3a",
    color: "white",
    fontWeight: 900,
    height: 40,
  },
  btnDanger: { background: "rgba(180,38,38,0.92)" },
  btnSmall: {
    border: "none",
    cursor: "pointer",
    padding: "8px 12px",
    borderRadius: 10,
    background: "rgba(11,42,58,0.10)",
    color: "#0b2a3a",
    fontWeight: 900,
  },

  pill: {
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
  },
  pillUnread: { background: "rgba(209,162,27,0.20)", color: "#0b2a3a" },
  pillRead: { background: "rgba(11,42,58,0.10)", color: "#0b2a3a" },
};

