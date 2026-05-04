import { useMemo, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { useDepartments } from "../../departments/DepartmentsContext";
import { loadBookings } from "../../frontdesk/bookingsStorage";
import { useSales } from "../../sales/SalesContext";
import { useShift } from "../../shifts/ShiftContext";
import { loadShiftClosings } from "../../shifts/shiftClosingStore";

type AlertTone = "green" | "amber" | "red" | "blue";

type ManagerAlert = {
  title: string;
  message: string;
  tone: AlertTone;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isToday(value: string | number | undefined) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d >= startOfToday();
}

function money(value: number) {
  return (Number.isFinite(value) ? value : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusText(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function alertStyle(tone: AlertTone): CSSProperties {
  const palette: Record<AlertTone, CSSProperties> = {
    green: { background: "#ecfdf5", borderColor: "#bbf7d0", color: "#166534" },
    amber: { background: "#fffbeb", borderColor: "#fde68a", color: "#92400e" },
    red: { background: "#fef2f2", borderColor: "#fecaca", color: "#991b1b" },
    blue: { background: "#eff6ff", borderColor: "#bfdbfe", color: "#1e40af" },
  };

  return palette[tone];
}

export default function ManagerDashboard() {
  const { records } = useSales();
  const { departments } = useDepartments();
  const { shifts, isShiftOpen } = useShift();

  const enabledDepartments = useMemo(
    () => departments.filter((department) => department.enabled),
    [departments]
  );

  const todaySales = useMemo(
    () => records.filter((record) => isToday(record.createdAt)),
    [records]
  );

  const closings = useMemo(() => loadShiftClosings(), []);
  const bookings = useMemo(() => loadBookings(), []);

  const openShifts = useMemo(
    () =>
      shifts.filter((shift: any) => {
        const status = String(shift?.status || "").toLowerCase();
        return status === "open" || (!status && !shift?.closedAt);
      }),
    [shifts]
  );

  const pendingClosings = useMemo(
    () =>
      closings.filter((closing) => {
        const status = String(closing.status || "").toLowerCase();
        return status === "pending" || status === "reviewed";
      }),
    [closings]
  );

  const unpaidBookings = useMemo(
    () => bookings.filter((booking) => Number(booking.balance) > 0),
    [bookings]
  );

  const departmentPerformance = useMemo(() => {
    const salesByDepartment = new Map<string, { total: number; transactions: number }>();

    todaySales.forEach((record) => {
      const key = record.deptKey || "unknown";
      const current = salesByDepartment.get(key) || { total: 0, transactions: 0 };
      current.total += Number(record.total) || 0;
      current.transactions += 1;
      salesByDepartment.set(key, current);
    });

    return enabledDepartments.map((department) => {
      const activity = salesByDepartment.get(department.key) || { total: 0, transactions: 0 };
      const hasPendingClosing = pendingClosings.some(
        (closing) => String(closing.department_key || "") === department.key
      );
      const status = hasPendingClosing
        ? "Needs Review"
        : activity.transactions > 0
          ? "Active"
          : "Quiet";

      return {
        key: department.key,
        name: department.name,
        total: activity.total,
        transactions: activity.transactions,
        status,
      };
    });
  }, [enabledDepartments, pendingClosings, todaySales]);

  const quietDepartments = departmentPerformance.filter((department) => department.status === "Quiet");

  const alerts = useMemo<ManagerAlert[]>(() => {
    const next: ManagerAlert[] = [];

    if (openShifts.length > 0 || isShiftOpen) {
      next.push({
        title: "Shift still open",
        message: "One or more shifts are still open and should be checked before close.",
        tone: "amber",
      });
    }

    if (unpaidBookings.length > 0) {
      next.push({
        title: "Unpaid room balances",
        message: `${unpaidBookings.length} room balance${unpaidBookings.length === 1 ? "" : "s"} need front desk follow-up.`,
        tone: "red",
      });
    }

    if (quietDepartments.length > 0) {
      next.push({
        title: "Quiet department activity",
        message: `${quietDepartments.length} department${quietDepartments.length === 1 ? "" : "s"} have no activity yet today.`,
        tone: "amber",
      });
    }

    if (pendingClosings.length > 0) {
      next.push({
        title: "Pending review items",
        message: `${pendingClosings.length} cash desk closing${pendingClosings.length === 1 ? "" : "s"} are awaiting attention.`,
        tone: "blue",
      });
    }

    if (next.length === 0) {
      next.push({
        title: "No alerts to review",
        message: "Operations look calm right now.",
        tone: "green",
      });
    }

    return next;
  }, [isShiftOpen, openShifts.length, pendingClosings.length, quietDepartments.length, unpaidBookings.length]);

  const totalTodaySales = todaySales.reduce((sum, record) => sum + (Number(record.total) || 0), 0);
  const activeDepartments = departmentPerformance.filter((department) => department.transactions > 0).length;

  const kpis = [
    { label: "Today's Sales", value: money(totalTodaySales), hint: "Operational gross sales" },
    { label: "Transactions", value: String(todaySales.length), hint: "Recorded today" },
    { label: "Active Departments", value: `${activeDepartments}/${enabledDepartments.length}`, hint: "Departments with activity" },
    { label: "Open Shifts", value: String(openShifts.length), hint: "Currently open" },
    { label: "Pending Closings", value: String(pendingClosings.length), hint: "Awaiting review" },
    { label: "Alerts", value: String(alerts.filter((alert) => alert.tone !== "green").length), hint: "Items needing attention" },
  ];

  const snapshot = [
    {
      title: "Shift Status",
      text: openShifts.length ? `${openShifts.length} shift${openShifts.length === 1 ? "" : "s"} open.` : "No shift activity yet.",
      action: "View Shift Closing",
      to: "/app/shift-closing",
      tone: openShifts.length ? "amber" : "green",
    },
    {
      title: "Front Desk Status",
      text: unpaidBookings.length ? `${unpaidBookings.length} unpaid room balance${unpaidBookings.length === 1 ? "" : "s"}.` : "Room balances look settled.",
      action: "View Front Desk",
      to: "/app/frontdesk",
      tone: unpaidBookings.length ? "red" : "green",
    },
    {
      title: "Department Activity",
      text: todaySales.length ? `${activeDepartments} department${activeDepartments === 1 ? "" : "s"} active today.` : "No department activity yet.",
      action: "Review Sales Summary",
      to: "/app/sales-dashboard",
      tone: todaySales.length ? "blue" : "amber",
    },
    {
      title: "Cash Desk Readiness",
      text: pendingClosings.length ? `${pendingClosings.length} closing${pendingClosings.length === 1 ? "" : "s"} pending.` : "No pending closings.",
      action: "Review Closings",
      to: "/app/cash-desk-closings",
      tone: pendingClosings.length ? "amber" : "green",
    },
  ] as const;

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Manager Dashboard</h1>
          <p style={styles.subtitle}>
            Track daily performance, department activity, and shift readiness.
          </p>
        </div>
      </header>

      <section style={styles.kpiGrid} aria-label="Manager KPI summary">
        {kpis.map((kpi) => (
          <div key={kpi.label} style={styles.kpiCard}>
            <div style={styles.kpiLabel}>{kpi.label}</div>
            <div style={styles.kpiValue}>{kpi.value}</div>
            <div style={styles.kpiHint}>{kpi.hint}</div>
          </div>
        ))}
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Operations Snapshot</h2>
        </div>
        <div style={styles.snapshotGrid}>
          {snapshot.map((item) => (
            <article key={item.title} style={styles.card}>
              <span style={{ ...styles.badge, ...alertStyle(item.tone) }}>{statusText(item.tone)}</span>
              <h3 style={styles.cardTitle}>{item.title}</h3>
              <p style={styles.cardText}>{item.text}</p>
              <Link to={item.to} style={styles.actionLink}>
                {item.action}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Department Performance Preview</h2>
        </div>
        {departmentPerformance.length === 0 ? (
          <div style={styles.emptyState}>No department activity yet.</div>
        ) : (
          <div style={styles.departmentGrid}>
            {departmentPerformance.map((department) => (
              <article key={department.key} style={styles.card}>
                <div style={styles.rowBetween}>
                  <h3 style={styles.cardTitle}>{department.name}</h3>
                  <span
                    style={{
                      ...styles.badge,
                      ...alertStyle(
                        department.status === "Active"
                          ? "green"
                          : department.status === "Needs Review"
                            ? "amber"
                            : "blue"
                      ),
                    }}
                  >
                    {department.status}
                  </span>
                </div>
                <div style={styles.departmentAmount}>{money(department.total)}</div>
                <div style={styles.kpiHint}>
                  {department.transactions
                    ? `${department.transactions} transaction${department.transactions === 1 ? "" : "s"} today`
                    : "No department activity yet."}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={styles.twoColumn}>
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Manager Alerts</h2>
          </div>
          <div style={styles.alertList}>
            {alerts.map((alert) => (
              <article key={alert.title} style={{ ...styles.alertCard, ...alertStyle(alert.tone) }}>
                <div style={styles.alertTitle}>{alert.title}</div>
                <div style={styles.alertText}>{alert.message}</div>
              </article>
            ))}
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Quick Actions</h2>
          </div>
          <div style={styles.quickActions}>
            <Link to="/app/shift-closing" style={styles.quickAction}>
              Go to Shift Closing
            </Link>
            <Link to="/app/sales-dashboard" style={styles.quickAction}>
              View Sales Summary
            </Link>
            <Link to="/app/frontdesk" style={styles.quickAction}>
              View Front Desk / Room Board
            </Link>
            <Link to="/app/cash-desk-closings" style={styles.quickAction}>
              Review Cash Desk Closings
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    padding: 24,
    background: "#f6f8fb",
    minHeight: "100%",
    color: "#102033",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 20,
  },
  title: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.15,
    color: "#0f2637",
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#587083",
    fontSize: 15,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 14,
    marginBottom: 20,
  },
  kpiCard: {
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 16,
    boxShadow: "0 8px 20px rgba(15, 38, 55, 0.05)",
  },
  kpiLabel: {
    fontSize: 13,
    color: "#607486",
    fontWeight: 700,
  },
  kpiValue: {
    marginTop: 8,
    fontSize: 25,
    fontWeight: 900,
    color: "#0f2637",
  },
  kpiHint: {
    marginTop: 6,
    color: "#6b7f90",
    fontSize: 13,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    color: "#17364b",
  },
  snapshotGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 14,
  },
  departmentGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
  },
  card: {
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 16,
    boxShadow: "0 8px 20px rgba(15, 38, 55, 0.05)",
  },
  cardTitle: {
    margin: "10px 0 6px",
    fontSize: 16,
    color: "#17364b",
  },
  cardText: {
    minHeight: 40,
    margin: "0 0 14px",
    color: "#5d7182",
    lineHeight: 1.4,
  },
  actionLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 8,
    background: "#0f5e7a",
    color: "#ffffff",
    fontWeight: 800,
    textDecoration: "none",
    fontSize: 13,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid",
    borderRadius: 999,
    padding: "5px 9px",
    fontSize: 12,
    fontWeight: 800,
  },
  rowBetween: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  departmentAmount: {
    marginTop: 12,
    fontSize: 23,
    fontWeight: 900,
    color: "#0f2637",
  },
  emptyState: {
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 18,
    color: "#607486",
  },
  twoColumn: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 18,
  },
  alertList: {
    display: "grid",
    gap: 10,
  },
  alertCard: {
    border: "1px solid",
    borderRadius: 8,
    padding: 14,
  },
  alertTitle: {
    fontWeight: 900,
    marginBottom: 5,
  },
  alertText: {
    fontSize: 13,
    lineHeight: 1.4,
  },
  quickActions: {
    display: "grid",
    gap: 10,
  },
  quickAction: {
    display: "flex",
    alignItems: "center",
    minHeight: 42,
    padding: "0 14px",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    background: "#ffffff",
    color: "#17364b",
    fontWeight: 800,
    textDecoration: "none",
    boxShadow: "0 8px 20px rgba(15, 38, 55, 0.04)",
  },
};
