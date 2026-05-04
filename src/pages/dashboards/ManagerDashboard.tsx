import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { useDepartments } from "../../departments/DepartmentsContext";
import { useExpenses } from "../../expenses/ExpenseContext";
import { loadBookings } from "../../frontdesk/bookingsStorage";
import { loadLedgerEntries, roundLedgerMoney } from "../../finance/financialLedger";
import { useScrollHighlight } from "../../hooks/useScrollHighlight";
import { useSales } from "../../sales/SalesContext";
import { useShift } from "../../shifts/ShiftContext";
import { loadShiftClosings } from "../../shifts/shiftClosingStore";
import { getSmartAlerts, type SmartAlert } from "../../utils/smartAlerts";
import {
  getDashboardMetrics,
  type DashboardGroupBy,
} from "./dashboardMetrics";

type AlertTone = "green" | "amber" | "red" | "blue";
type DatePreset = "today" | "yesterday" | "week" | "month" | "custom";
type GroupBy = DashboardGroupBy;

type DateRange = {
  startDate: string;
  endDate: string;
};

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPresetRange(preset: DatePreset): DateRange {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  if (preset === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const value = toDateInputValue(yesterday);
    return { startDate: value, endDate: value };
  }

  if (preset === "week") {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    return { startDate: toDateInputValue(weekStart), endDate: toDateInputValue(today) };
  }

  if (preset === "month") {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return { startDate: toDateInputValue(monthStart), endDate: toDateInputValue(today) };
  }

  const value = toDateInputValue(today);
  return { startDate: value, endDate: value };
}

function getPreviousRange(range: DateRange): DateRange {
  const start = new Date(`${range.startDate}T00:00:00`);
  const end = new Date(`${range.endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return range;
  }

  const durationDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  );
  const previousEnd = new Date(start);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - durationDays + 1);

  return {
    startDate: toDateInputValue(previousStart),
    endDate: toDateInputValue(previousEnd),
  };
}

function money(value: number) {
  return (Number.isFinite(value) ? value : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function labelize(value: string) {
  return String(value || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Unassigned";
}

function getRangeLabel(range: DateRange) {
  if (range.startDate === range.endDate) return range.startDate;
  return `${range.startDate || "Start"} to ${range.endDate || "End"}`;
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

function smartAlertTone(type: SmartAlert["type"]): AlertTone {
  if (type === "critical") return "red";
  if (type === "warning") return "amber";
  return "blue";
}

export default function ManagerDashboard() {
  const { records } = useSales();
  const { records: expenseRecords } = useExpenses();
  const { departments } = useDepartments();
  const { shifts } = useShift();

  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [customRange, setCustomRange] = useState<DateRange>(() => getPresetRange("today"));
  const [groupBy, setGroupBy] = useState<GroupBy>("department");
  const previousGroupByRef = useRef<GroupBy>(groupBy);
  const {
    ref: groupedPerformanceRef,
    flash: groupedPerformanceFlash,
    trigger: triggerGroupedPerformanceHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 1000,
    block: "start",
  });

  const activeRange = datePreset === "custom" ? customRange : getPresetRange(datePreset);
  const previousRange = useMemo(() => getPreviousRange(activeRange), [activeRange]);

  useEffect(() => {
    if (previousGroupByRef.current === groupBy) return;

    previousGroupByRef.current = groupBy;
    triggerGroupedPerformanceHighlight();
  }, [groupBy, triggerGroupedPerformanceHighlight]);

  const enabledDepartments = useMemo(
    () => departments.filter((department) => department.enabled),
    [departments]
  );

  const departmentLabels = useMemo(() => {
    return new Map(enabledDepartments.map((department) => [department.key, department.name]));
  }, [enabledDepartments]);

  const ledgerEntries = useMemo(
    () => loadLedgerEntries(),
    [records, expenseRecords]
  );

  const metrics = useMemo(
    () =>
      getDashboardMetrics({
        startDate: activeRange.startDate,
        endDate: activeRange.endDate,
        groupBy,
        ledgerEntries,
        salesRecords: records,
        expenseRecords,
        departmentLabels,
      }),
    [
      activeRange.endDate,
      activeRange.startDate,
      departmentLabels,
      expenseRecords,
      groupBy,
      ledgerEntries,
      records,
    ]
  );

  const previousMetrics = useMemo(
    () =>
      getDashboardMetrics({
        startDate: previousRange.startDate,
        endDate: previousRange.endDate,
        groupBy,
        ledgerEntries,
        salesRecords: records,
        expenseRecords,
        departmentLabels,
      }),
    [
      departmentLabels,
      expenseRecords,
      groupBy,
      ledgerEntries,
      previousRange.endDate,
      previousRange.startDate,
      records,
    ]
  );

  const closings = useMemo(() => loadShiftClosings(), [records, expenseRecords]);
  const bookings = useMemo(() => loadBookings(), [records]);

  const filteredClosings = useMemo(
    () =>
      closings.filter((closing) =>
        metrics.entries.some(
          (entry) =>
            String(entry.shiftId || "") === String(closing.shift_id || "") &&
            Boolean(closing.shift_id)
        ) ||
        (closing.submitted_at &&
          closing.submitted_at >= `${activeRange.startDate}T00:00:00` &&
          closing.submitted_at <= `${activeRange.endDate}T23:59:59`)
      ),
    [activeRange.endDate, activeRange.startDate, closings, metrics.entries]
  );

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
      filteredClosings.filter((closing) => {
        const status = String(closing.status || "").toLowerCase();
        return status === "pending" || status === "reviewed";
      }),
    [filteredClosings]
  );

  const unpaidBookings = useMemo(
    () => bookings.filter((booking) => Number(booking.balance) > 0),
    [bookings]
  );

  const departmentPerformance = useMemo(() => {
    const totalsByDepartment = new Map<string, { total: number; transactions: number }>();

    metrics.entries.forEach((entry) => {
      const key = entry.departmentKey || "unknown";
      const current = totalsByDepartment.get(key) || { total: 0, transactions: 0 };
      current.total = roundLedgerMoney(current.total + (Number(entry.revenueAmount) || 0));
      current.transactions += 1;
      totalsByDepartment.set(key, current);
    });

    return enabledDepartments.map((department) => {
      const activity = totalsByDepartment.get(department.key) || { total: 0, transactions: 0 };
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
  }, [enabledDepartments, metrics.entries, pendingClosings]);

  const alerts = useMemo(
    () =>
      getSmartAlerts({
        metrics: {
          ...metrics,
          pendingClosings: pendingClosings.length,
        },
        previousMetrics,
        groupedData: departmentPerformance,
      }),
    [departmentPerformance, metrics, pendingClosings.length, previousMetrics]
  );

  const activeDepartments = departmentPerformance.filter((department) => department.transactions > 0).length;

  const kpis = [
    { label: "Sales", value: money(metrics.totals.revenue), hint: getRangeLabel(activeRange) },
    { label: "Collections", value: money(metrics.totals.collections), hint: "Collected in range" },
    { label: "Transactions", value: String(metrics.transactions || metrics.salesCount), hint: "Ledger activity" },
    { label: "Expenses", value: money(metrics.totals.expenses), hint: `${metrics.expenseCount} expense record${metrics.expenseCount === 1 ? "" : "s"}` },
    { label: "Active Departments", value: `${activeDepartments}/${enabledDepartments.length}`, hint: "Departments with activity" },
    { label: "Alerts", value: String(alerts.length), hint: "Items needing attention" },
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
      text: metrics.transactions ? `${activeDepartments} department${activeDepartments === 1 ? "" : "s"} active in range.` : "No department activity yet.",
      action: "Review Sales Summary",
      to: "/app/sales-dashboard",
      tone: metrics.transactions ? "blue" : "amber",
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

      <section style={styles.filterBar} aria-label="Manager dashboard filters">
        <div style={styles.field}>
          <label style={styles.label} htmlFor="manager-date-filter">Date Filter</label>
          <select
            id="manager-date-filter"
            style={styles.input}
            value={datePreset}
            onChange={(event) => setDatePreset(event.target.value as DatePreset)}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {datePreset === "custom" ? (
          <>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="manager-start-date">Start Date</label>
              <input
                id="manager-start-date"
                type="date"
                style={styles.input}
                value={customRange.startDate}
                onChange={(event) =>
                  setCustomRange((current) => ({ ...current, startDate: event.target.value }))
                }
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="manager-end-date">End Date</label>
              <input
                id="manager-end-date"
                type="date"
                style={styles.input}
                value={customRange.endDate}
                onChange={(event) =>
                  setCustomRange((current) => ({ ...current, endDate: event.target.value }))
                }
              />
            </div>
          </>
        ) : null}

        <div style={styles.field}>
          <label style={styles.label} htmlFor="manager-group-by">Group By</label>
          <select
            id="manager-group-by"
            style={styles.input}
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as GroupBy)}
          >
            <option value="department">Department</option>
            <option value="payment">Payment Method</option>
            <option value="shift">Shift</option>
            <option value="staff">Staff</option>
            <option value="room_customer">Room / Customer</option>
          </select>
        </div>
      </section>

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
              <span style={{ ...styles.badge, ...alertStyle(item.tone as AlertTone) }}>
                {labelize(item.tone)}
              </span>
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
          <span style={styles.sectionMeta}>{getRangeLabel(activeRange)}</span>
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
                    ? `${department.transactions} transaction${department.transactions === 1 ? "" : "s"} in range`
                    : "No department activity yet."}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        ref={groupedPerformanceRef}
        style={{
          ...styles.section,
          ...(groupedPerformanceFlash ? styles.sectionFlash : {}),
        }}
      >
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Grouped Performance</h2>
          <span style={styles.sectionMeta}>
            Grouped by: {metrics.groupLabel}
          </span>
        </div>
        {metrics.groupedRows.length === 0 ? (
          <div style={styles.emptyState}>No grouped performance data for this range.</div>
        ) : (
          <div style={styles.tableWrap}>
            <div style={styles.tableHead}>
              <div>Group</div>
              <div>Revenue</div>
              <div>Collections</div>
              <div>Expenses</div>
              <div>Net Profit</div>
              <div>Transactions</div>
            </div>
            {metrics.groupedRows.map((row) => (
              <div key={row.key} style={styles.tableRow}>
                <div style={styles.groupName}>{row.name}</div>
                <div>{money(row.revenue)}</div>
                <div>{money(row.collections)}</div>
                <div>{money(row.expenses)}</div>
                <div style={row.netProfit < 0 ? styles.negativeValue : styles.positiveValue}>
                  {money(row.netProfit)}
                </div>
                <div>{row.transactions}</div>
              </div>
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
            {alerts.length === 0 ? (
              <article style={{ ...styles.alertCard, ...alertStyle("blue") }}>
                <div style={styles.alertTitle}>No major issues detected.</div>
                <div style={styles.alertText}>Performance and operations look steady for this range.</div>
              </article>
            ) : (
              alerts.map((alert) => (
                <article key={alert.id} style={{ ...styles.alertCard, ...alertStyle(smartAlertTone(alert.type)) }}>
                  <div style={styles.alertTitle}>{alert.title}</div>
                  <div style={styles.alertText}>{alert.message}</div>
                </article>
              ))
            )}
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
  filterBar: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    alignItems: "end",
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 14,
    marginBottom: 18,
    boxShadow: "0 8px 20px rgba(15, 38, 55, 0.04)",
  },
  field: {
    display: "grid",
    gap: 6,
  },
  label: {
    color: "#607486",
    fontSize: 12,
    fontWeight: 800,
  },
  input: {
    minHeight: 38,
    border: "1px solid #cfdbe4",
    borderRadius: 8,
    padding: "0 10px",
    background: "#ffffff",
    color: "#102033",
    fontWeight: 700,
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
  sectionFlash: {
    borderRadius: 8,
    background: "rgba(239, 246, 255, 0.75)",
    boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.16), 0 12px 28px rgba(15, 38, 55, 0.08)",
    transition: "background 220ms ease, box-shadow 220ms ease",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    color: "#17364b",
  },
  sectionMeta: {
    color: "#6b7f90",
    fontSize: 13,
    fontWeight: 700,
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
  tableWrap: {
    overflowX: "auto",
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    boxShadow: "0 8px 20px rgba(15, 38, 55, 0.05)",
  },
  tableHead: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 1.5fr) repeat(5, minmax(110px, 1fr))",
    gap: 10,
    minWidth: 780,
    padding: "12px 14px",
    borderBottom: "1px solid #dce5ec",
    color: "#607486",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 1.5fr) repeat(5, minmax(110px, 1fr))",
    gap: 10,
    minWidth: 780,
    padding: "13px 14px",
    borderBottom: "1px solid #edf2f6",
    color: "#24394a",
    fontSize: 13,
    alignItems: "center",
  },
  groupName: {
    color: "#17364b",
    fontWeight: 900,
  },
  positiveValue: {
    color: "#166534",
    fontWeight: 900,
  },
  negativeValue: {
    color: "#991b1b",
    fontWeight: 900,
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
