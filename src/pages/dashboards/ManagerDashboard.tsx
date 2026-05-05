import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { canViewModuleKey } from "../../auth/permissions";
import { useDepartments } from "../../departments/DepartmentsContext";
import { useExpenses } from "../../expenses/ExpenseContext";
import { loadBookings } from "../../frontdesk/bookingsStorage";
import { loadLedgerEntries, roundLedgerMoney } from "../../finance/financialLedger";
import { useScrollHighlight } from "../../hooks/useScrollHighlight";
import { useSales } from "../../sales/SalesContext";
import { useShift } from "../../shifts/ShiftContext";
import { loadShiftClosings } from "../../shifts/shiftClosingStore";
import { getManagerInsights } from "../../utils/managerInsights";
import { getSmartAlerts, type SmartAlert } from "../../utils/smartAlerts";
import {
  dashboardDateInRange,
  getDashboardMetrics,
  type DashboardGroupBy,
} from "./dashboardMetrics";

type AlertTone = "green" | "amber" | "red" | "blue";
type DatePreset = "today" | "yesterday" | "week" | "month" | "custom";
type GroupBy = DashboardGroupBy;
type ManagerDashboardView =
  | "overview"
  | "front-desk"
  | "department-activity"
  | "sales-summary"
  | "closings"
  | "alerts"
  | "insights";

type DateRange = {
  startDate: string;
  endDate: string;
};

const DATE_PRESETS: DatePreset[] = ["today", "yesterday", "week", "month", "custom"];
const GROUP_BY_OPTIONS: GroupBy[] = ["department", "payment", "shift", "staff", "room_customer"];
const DASHBOARD_VIEWS: ManagerDashboardView[] = [
  "overview",
  "front-desk",
  "department-activity",
  "sales-summary",
  "closings",
  "alerts",
  "insights",
];
const MANAGER_DASHBOARD_FILTER_STORAGE_KEY = "sikatech.managerDashboard.filters";

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

function readDatePreset(value: string | null): DatePreset {
  return DATE_PRESETS.includes(value as DatePreset) ? (value as DatePreset) : "today";
}

function readGroupBy(value: string | null): GroupBy {
  return GROUP_BY_OPTIONS.includes(value as GroupBy) ? (value as GroupBy) : "department";
}

function readDashboardView(value: string | null): ManagerDashboardView {
  return DASHBOARD_VIEWS.includes(value as ManagerDashboardView)
    ? (value as ManagerDashboardView)
    : "overview";
}

function readStoredDashboardParams() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(MANAGER_DASHBOARD_FILTER_STORAGE_KEY);
    return raw ? new URLSearchParams(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredDashboardParams(params: URLSearchParams) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      MANAGER_DASHBOARD_FILTER_STORAGE_KEY,
      params.toString()
    );
  } catch {
    // Session storage is a convenience for restoring dashboard filters.
  }
}

function hasDashboardFilterParams(params: URLSearchParams) {
  return (
    params.has("dateFilter") ||
    params.has("startDate") ||
    params.has("endDate") ||
    params.has("groupBy") ||
    params.has("view")
  );
}

function buildDashboardParams(input: {
  source: URLSearchParams;
  datePreset: DatePreset;
  activeRange: DateRange;
  groupBy: GroupBy;
  view: ManagerDashboardView;
}) {
  const params = new URLSearchParams(input.source);
  params.set("dateFilter", input.datePreset);
  params.set("startDate", input.activeRange.startDate);
  params.set("endDate", input.activeRange.endDate);
  params.set("groupBy", input.groupBy);
  params.set("view", input.view);
  return params;
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

function getDataConfidenceLabel(entries: Array<{ status?: string }>) {
  if (entries.length === 0) return "Operational View";

  const reviewedStatuses = new Set(["reviewed", "approved", "reconciled"]);
  const reviewedCount = entries.filter((entry) =>
    reviewedStatuses.has(String(entry.status || "").toLowerCase())
  ).length;

  if (reviewedCount === entries.length) return "Reviewed View";
  if (reviewedCount > 0) return "Mixed Operational / Reviewed View";
  return "Operational View";
}

function getDataConfidenceHint(label: string) {
  if (label === "Reviewed View") {
    return "All ledger entries in this range are marked reviewed, approved, or reconciled.";
  }
  if (label === "Mixed Operational / Reviewed View") {
    return "Some ledger entries are reviewed, but this range still includes operational records awaiting accounting review.";
  }
  return "Live ledger activity before final accounting review or reconciliation.";
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

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailMetric}>
      <div style={styles.detailMetricLabel}>{label}</div>
      <div style={styles.detailMetricValue}>{value}</div>
    </div>
  );
}

function insightStyle(type: string): CSSProperties {
  if (type === "positive") {
    return { borderColor: "#bbf7d0", background: "#f0fdf4" };
  }
  if (type === "risk") {
    return { borderColor: "#fecaca", background: "#fff7f7" };
  }
  if (type === "warning") {
    return { borderColor: "#fde68a", background: "#fffbeb" };
  }
  return { borderColor: "#bfdbfe", background: "#eff6ff" };
}

function insightAction(type: string) {
  if (type === "risk") {
    return "Review source records and assign follow-up before close of shift.";
  }
  if (type === "warning") {
    return "Monitor the pattern and review supporting transactions.";
  }
  if (type === "positive") {
    return "Preserve the current operating pattern and compare against future periods.";
  }
  return "Keep monitoring this range as more activity is recorded.";
}

function insightGroupLabel(type: string) {
  if (type === "risk") return "Risks";
  if (type === "warning") return "Warnings";
  if (type === "positive") return "Positives";
  return "Context";
}

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { records } = useSales();
  const { records: expenseRecords } = useExpenses();
  const { departments } = useDepartments();
  const { shifts } = useShift();

  const initialParams =
    !hasDashboardFilterParams(searchParams) && readStoredDashboardParams()
      ? readStoredDashboardParams()!
      : searchParams;
  const initialDatePreset = readDatePreset(initialParams.get("dateFilter"));
  const initialRange = getPresetRange(initialDatePreset);
  const [datePreset, setDatePreset] = useState<DatePreset>(initialDatePreset);
  const [customRange, setCustomRange] = useState<DateRange>(() => ({
    startDate: initialParams.get("startDate") || initialRange.startDate,
    endDate: initialParams.get("endDate") || initialRange.endDate,
  }));
  const [groupBy, setGroupBy] = useState<GroupBy>(() => readGroupBy(initialParams.get("groupBy")));
  const [selectedAlert, setSelectedAlert] = useState<SmartAlert | null>(null);
  const [showAllInsights, setShowAllInsights] = useState(false);
  const previousGroupByRef = useRef<GroupBy>(groupBy);
  const handledViewRef = useRef<ManagerDashboardView | null>(null);
  const shouldScrollViewRef = useRef(searchParams.has("view"));
  const activeView = readDashboardView(searchParams.get("view") || initialParams.get("view"));
  const {
    ref: overviewRef,
    flash: overviewFlash,
    trigger: triggerOverviewHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 1000,
    block: "start",
  });
  const {
    ref: insightsRef,
    flash: insightsFlash,
    trigger: triggerInsightsHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 1000,
    block: "start",
  });
  const {
    ref: operationsRef,
    flash: operationsFlash,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 1000,
    block: "start",
  });
  const {
    ref: frontDeskRef,
    flash: frontDeskFlash,
    trigger: triggerFrontDeskHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 1000,
    block: "center",
  });
  const {
    ref: departmentActivityRef,
    flash: departmentActivityFlash,
    trigger: triggerDepartmentActivityHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 1000,
    block: "start",
  });
  const {
    ref: groupedPerformanceRef,
    flash: groupedPerformanceFlash,
    trigger: triggerGroupedPerformanceHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 1000,
    block: "start",
  });
  const {
    ref: managerAlertsRef,
    flash: managerAlertsFlash,
    trigger: triggerManagerAlertsHighlight,
  } = useScrollHighlight<HTMLDivElement>({
    durationMs: 1000,
    block: "start",
  });
  const {
    ref: closingStatusRef,
    flash: closingStatusFlash,
    trigger: triggerClosingStatusHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 1000,
    block: "center",
  });

  const activeRange = datePreset === "custom" ? customRange : getPresetRange(datePreset);
  const previousRange = useMemo(() => getPreviousRange(activeRange), [activeRange]);

  useEffect(() => {
    const next = buildDashboardParams({
      source: searchParams,
      datePreset,
      activeRange,
      groupBy,
      view: activeView,
    });

    writeStoredDashboardParams(next);

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [
    activeRange.endDate,
    activeRange.startDate,
    activeView,
    datePreset,
    groupBy,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    if (previousGroupByRef.current === groupBy) return;

    previousGroupByRef.current = groupBy;
    triggerGroupedPerformanceHighlight();
  }, [groupBy, triggerGroupedPerformanceHighlight]);

  function triggerDashboardView(view: ManagerDashboardView) {
    if (view === "overview") {
      triggerOverviewHighlight();
    } else if (view === "front-desk") {
      triggerFrontDeskHighlight();
    } else if (view === "department-activity") {
      triggerDepartmentActivityHighlight();
    } else if (view === "sales-summary") {
      triggerGroupedPerformanceHighlight();
    } else if (view === "closings") {
      triggerClosingStatusHighlight();
    } else if (view === "alerts") {
      triggerManagerAlertsHighlight();
    } else if (view === "insights") {
      triggerInsightsHighlight();
    }
  }

  useEffect(() => {
    if (handledViewRef.current === activeView) return;

    handledViewRef.current = activeView;
    if (!shouldScrollViewRef.current && !searchParams.has("view")) return;

    shouldScrollViewRef.current = true;
    triggerDashboardView(activeView);
  }, [
    activeView,
    searchParams,
    triggerClosingStatusHighlight,
    triggerDepartmentActivityHighlight,
    triggerFrontDeskHighlight,
    triggerGroupedPerformanceHighlight,
    triggerInsightsHighlight,
    triggerManagerAlertsHighlight,
    triggerOverviewHighlight,
  ]);

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
        dashboardDateInRange(
          closing.submitted_at || closing.created_at || closing.updated_at || "",
          activeRange.startDate,
          activeRange.endDate
        )
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
        groupedData: metrics.groupedRows,
        departmentData: departmentPerformance,
      }),
    [departmentPerformance, metrics, pendingClosings.length, previousMetrics]
  );

  const insights = useMemo(
    () =>
      getManagerInsights({
        metrics: {
          ...metrics,
          pendingClosings: pendingClosings.length,
        },
        previousMetrics,
        groupedRows: metrics.groupedRows,
        alerts,
        dateLabel: getRangeLabel(activeRange),
      }),
    [activeRange, alerts, metrics, pendingClosings.length, previousMetrics]
  );

  const defaultInsights = useMemo(() => {
    const hasRisk = insights.some((insight) => insight.type === "risk");
    const focusedInsights = hasRisk
      ? insights.filter((insight) => insight.type !== "positive")
      : insights;

    return (focusedInsights.length ? focusedInsights : insights).slice(0, 3);
  }, [insights]);

  const visibleInsights = showAllInsights ? insights : defaultInsights;
  const featuredInsight = visibleInsights[0];
  const groupedInsights = useMemo(() => {
    const groups = [
      { key: "risk", label: "Risks", items: [] as typeof insights },
      { key: "warning", label: "Warnings", items: [] as typeof insights },
      { key: "positive", label: "Positives", items: [] as typeof insights },
      { key: "neutral", label: "Context", items: [] as typeof insights },
    ];

    visibleInsights.slice(1).forEach((insight) => {
      const group = groups.find((item) => item.key === insight.type) || groups[3];
      group.items.push(insight);
    });

    return groups.filter((group) => group.items.length > 0);
  }, [insights, visibleInsights]);
  const hasMoreInsights = insights.length > defaultInsights.length;

  useEffect(() => {
    if (!selectedAlert) return;
    const nextSelected = alerts.find((alert) => alert.id === selectedAlert.id) || null;
    setSelectedAlert(nextSelected);
  }, [alerts, selectedAlert?.id]);

  const activeDepartments = departmentPerformance.filter((department) => department.transactions > 0).length;
  const receivablesTotal = metrics.totals.receivables || Math.max(0, metrics.totals.revenue - metrics.totals.collections);
  const dataConfidenceLabel = getDataConfidenceLabel(metrics.entries);
  const dataConfidenceHint = getDataConfidenceHint(dataConfidenceLabel);

  const kpis = [
    { label: "Total Sales", value: money(metrics.totals.revenue), hint: getRangeLabel(activeRange) },
    { label: "Collections", value: money(metrics.totals.collections), hint: "Collected in range" },
    { label: "Expenses", value: money(metrics.totals.expenses), hint: `${metrics.expenseCount} expense record${metrics.expenseCount === 1 ? "" : "s"}` },
    { label: "Net Profit", value: money(metrics.totals.netProfit), hint: "Revenue less expenses" },
    { label: "Receivables", value: money(receivablesTotal), hint: `${unpaidBookings.length} unpaid room balance${unpaidBookings.length === 1 ? "" : "s"}` },
    { label: "Active Departments", value: `${activeDepartments}/${enabledDepartments.length}`, hint: "Departments with activity" },
    { label: "Open Shifts", value: String(openShifts.length), hint: `${pendingClosings.length} pending closing${pendingClosings.length === 1 ? "" : "s"}` },
    { label: "Alerts", value: String(alerts.length), hint: "Items needing attention" },
  ];

  const dashboardPathFor = (view: ManagerDashboardView) => {
    const params = buildDashboardParams({
      source: searchParams,
      datePreset,
      activeRange,
      groupBy,
      view,
    });
    return `/app/dashboard?${params.toString()}`;
  };

  const shiftClosingPath = useMemo(() => {
    const returnTo = dashboardPathFor(activeView);
    return `/app/shift-closing?returnTo=${encodeURIComponent(returnTo)}`;
  }, [
    activeRange.endDate,
    activeRange.startDate,
    activeView,
    datePreset,
    groupBy,
    searchParams,
  ]);
  const canOpenShiftClosing = !!user && canViewModuleKey(user, "shift-closing");

  function openDashboardView(view: ManagerDashboardView) {
    const next = buildDashboardParams({
      source: searchParams,
      datePreset,
      activeRange,
      groupBy,
      view,
    });

    shouldScrollViewRef.current = true;
    handledViewRef.current = view;
    setSearchParams(next);
    triggerDashboardView(view);
  }

  function openShiftClosingReview() {
    if (canOpenShiftClosing) {
      navigate(shiftClosingPath);
      return;
    }

    openDashboardView("closings");
  }

  function managerSafeReviewPath(path?: string | null) {
    if (!path) return dashboardPathFor(activeView);

    if (
      path.startsWith("/app/cash-desk-closings") ||
      path.startsWith("/app/accounting-workbench")
    ) {
      return dashboardPathFor("closings");
    }

    if (
      path.startsWith("/app/sales-dashboard") ||
      path.startsWith("/app/departments/")
    ) {
      return dashboardPathFor(path.startsWith("/app/sales-dashboard") ? "sales-summary" : "department-activity");
    }

    if (path.startsWith("/app/frontdesk")) {
      return dashboardPathFor("front-desk");
    }

    if (path.startsWith("/app/dashboard")) {
      const existing = new URLSearchParams(path.split("?")[1] || "");
      const view = existing.has("view")
        ? readDashboardView(existing.get("view"))
        : "department-activity";
      return dashboardPathFor(view);
    }

    return path;
  }

  function openManagerSafeReviewPath(path?: string | null) {
    const safePath = managerSafeReviewPath(path);

    if (safePath.startsWith("/app/dashboard")) {
      const next = new URLSearchParams(safePath.split("?")[1] || "");
      openDashboardView(readDashboardView(next.get("view")));
      return;
    }

    navigate(safePath);
  }

  const snapshot = [
    {
      title: "Shift Status",
      text: openShifts.length ? `${openShifts.length} shift${openShifts.length === 1 ? "" : "s"} open.` : "No shift activity yet.",
      action: "View Closing Status",
      view: "closings",
      tone: openShifts.length ? "amber" : "green",
    },
    {
      title: "Front Desk Status",
      text: unpaidBookings.length ? `${unpaidBookings.length} unpaid room balance${unpaidBookings.length === 1 ? "" : "s"}.` : "Room balances look settled.",
      action: "Review Front Desk Overview",
      view: "front-desk",
      tone: unpaidBookings.length ? "red" : "green",
    },
    {
      title: "Department Activity",
      text: metrics.transactions ? `${activeDepartments} department${activeDepartments === 1 ? "" : "s"} active in range.` : "No department activity yet.",
      action: "Review Department Activity",
      view: "department-activity",
      tone: metrics.transactions ? "blue" : "amber",
    },
    {
      title: "Cash Desk Readiness",
      text: pendingClosings.length ? `${pendingClosings.length} closing${pendingClosings.length === 1 ? "" : "s"} pending.` : "No pending closings.",
      action: "View Closing Status",
      view: "closings",
      tone: pendingClosings.length ? "amber" : "green",
    },
  ] as const;

  function handleAlertClick(alert: SmartAlert) {
    setSelectedAlert(alert);
    if (alert.reviewPath) {
      openManagerSafeReviewPath(alert.reviewPath);
      return;
    }

    openDashboardView("alerts");
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Manager Dashboard</h1>
          <p style={styles.subtitle}>
            Track daily performance, department activity, and shift readiness.
          </p>
        </div>
        <div style={styles.statusPanel}>
          <div style={styles.statusLabel}>{dataConfidenceLabel}</div>
          <div style={styles.statusText}>{dataConfidenceHint}</div>
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

      <section
        ref={overviewRef}
        style={{
          ...styles.kpiGrid,
          ...(overviewFlash ? styles.sectionFlash : {}),
        }}
        aria-label="Manager KPI summary"
      >
        {kpis.map((kpi) => (
          <div key={kpi.label} style={styles.kpiCard}>
            <div style={styles.kpiLabel}>{kpi.label}</div>
            <div style={styles.kpiValue}>{kpi.value}</div>
            <div style={styles.kpiHint}>{kpi.hint}</div>
          </div>
        ))}
      </section>

      <section
        ref={insightsRef}
        style={{
          ...styles.section,
          ...(insightsFlash ? styles.sectionFlash : {}),
        }}
      >
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Manager Insights</h2>
            <p style={styles.sectionSubtitle}>
              Plain-language intelligence from selected dashboard data.
            </p>
          </div>
        </div>
        {insights.length === 0 ? (
          <div style={styles.emptyState}>No major insights detected for this range.</div>
        ) : (
          <div style={styles.insightStack}>
            {featuredInsight ? (
              <article
                style={{
                  ...styles.insightCard,
                  ...styles.featuredInsightCard,
                  ...insightStyle(featuredInsight.type),
                }}
              >
                <div style={styles.insightType}>
                  Top Priority · {insightGroupLabel(featuredInsight.type)}
                </div>
                <h3 style={styles.featuredInsightTitle}>{featuredInsight.title}</h3>
                <p style={styles.insightText}>{featuredInsight.message}</p>
                <div style={styles.insightAction}>
                  <b>Recommended Action:</b> {insightAction(featuredInsight.type)}
                </div>
              </article>
            ) : null}

            {groupedInsights.map((group) => (
              <div key={group.key} style={styles.insightGroup}>
                <div style={styles.insightGroupTitle}>{group.label}</div>
                <div style={styles.insightGrid}>
                  {group.items.map((insight) => (
                    <article
                      key={insight.id}
                      style={{ ...styles.insightCard, ...insightStyle(insight.type) }}
                    >
                      <div style={styles.insightType}>{labelize(insight.type)}</div>
                      <h3 style={styles.insightTitle}>{insight.title}</h3>
                      <p style={styles.insightText}>{insight.message}</p>
                      <div style={styles.insightAction}>
                        <b>Recommended Action:</b> {insightAction(insight.type)}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}

            {hasMoreInsights ? (
              <button
                type="button"
                style={styles.showMoreButton}
                onClick={() => setShowAllInsights((current) => !current)}
              >
                {showAllInsights ? "Show fewer insights" : `Show more insights (${insights.length - defaultInsights.length})`}
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section
        ref={operationsRef}
        style={{
          ...styles.section,
          ...(operationsFlash ? styles.sectionFlash : {}),
        }}
      >
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Operations Snapshot</h2>
        </div>
        <div style={styles.snapshotGrid}>
          {snapshot.map((item) => (
            <article
              key={item.title}
              ref={
                item.title === "Cash Desk Readiness"
                  ? closingStatusRef
                  : item.title === "Front Desk Status"
                    ? frontDeskRef
                    : undefined
              }
              style={{
                ...styles.card,
                ...(item.title === "Cash Desk Readiness" && closingStatusFlash
                  ? styles.sectionFlash
                  : {}),
                ...(item.title === "Front Desk Status" && frontDeskFlash
                  ? styles.sectionFlash
                  : {}),
              }}
            >
              <span style={{ ...styles.badge, ...alertStyle(item.tone as AlertTone) }}>
                {labelize(item.tone)}
              </span>
              <h3 style={styles.cardTitle}>{item.title}</h3>
              <p style={styles.cardText}>{item.text}</p>
              <button
                type="button"
                style={styles.actionButton}
                onClick={() => openDashboardView(item.view)}
              >
                {item.action}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section
        ref={departmentActivityRef}
        style={{
          ...styles.section,
          ...(departmentActivityFlash ? styles.sectionFlash : {}),
        }}
      >
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
            Grouped by: {metrics.groupLabel} | {dataConfidenceLabel}
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
        <div
          ref={managerAlertsRef}
          style={{
            ...styles.section,
            ...(managerAlertsFlash ? styles.sectionFlash : {}),
          }}
        >
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
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => handleAlertClick(alert)}
                  style={{
                    ...styles.alertButton,
                    ...alertStyle(smartAlertTone(alert.type)),
                    ...(selectedAlert?.id === alert.id ? styles.alertButtonActive : {}),
                  }}
                >
                  <div style={styles.alertTitle}>{alert.title}</div>
                  <div style={styles.alertText}>{alert.message}</div>
                  {alert.recommendation ? (
                    <div style={styles.alertRecommendation}>
                      <b>Suggested Review:</b> {alert.recommendation}
                    </div>
                  ) : null}
                </button>
              ))
            )}
          </div>

          {selectedAlert ? (
            <div style={styles.alertDetailPanel}>
              <div style={styles.rowBetween}>
                <div>
                  <div style={styles.detailEyebrow}>Alert Detail</div>
                  <h3 style={styles.detailTitle}>{selectedAlert.title}</h3>
                </div>
                <button
                  type="button"
                  style={styles.closeButton}
                  onClick={() => setSelectedAlert(null)}
                >
                  Close
                </button>
              </div>

              <div style={styles.detailBlock}>
                <div style={styles.detailLabel}>What the data shows</div>
                <div style={styles.detailText}>{selectedAlert.message}</div>
              </div>

              {selectedAlert.recommendation ? (
                <div style={styles.detailBlock}>
                  <div style={styles.detailLabel}>Suggested Review</div>
                  <div style={styles.detailText}>{selectedAlert.recommendation}</div>
                </div>
              ) : null}

              <div style={styles.detailGrid}>
                {selectedAlert.relatedGroup ? (
                  <DetailMetric label="Related Group" value={selectedAlert.relatedGroup} />
                ) : null}
                {selectedAlert.relatedMetric ? (
                  <DetailMetric label="Related Metric" value={selectedAlert.relatedMetric} />
                ) : null}
                {selectedAlert.relatedValues?.revenue !== undefined ? (
                  <DetailMetric label="Revenue" value={money(selectedAlert.relatedValues.revenue)} />
                ) : null}
                {selectedAlert.relatedValues?.collections !== undefined ? (
                  <DetailMetric label="Collections" value={money(selectedAlert.relatedValues.collections)} />
                ) : null}
                {selectedAlert.relatedValues?.expenses !== undefined ? (
                  <DetailMetric label="Expenses" value={money(selectedAlert.relatedValues.expenses)} />
                ) : null}
                {selectedAlert.relatedValues?.netProfit !== undefined ? (
                  <DetailMetric label="Net Profit" value={money(selectedAlert.relatedValues.netProfit)} />
                ) : null}
                {selectedAlert.relatedValues?.cashCollections !== undefined ? (
                  <DetailMetric label="Cash Collections" value={money(selectedAlert.relatedValues.cashCollections)} />
                ) : null}
                {selectedAlert.relatedValues?.transactions !== undefined ? (
                  <DetailMetric label="Transactions" value={String(selectedAlert.relatedValues.transactions)} />
                ) : null}
                {selectedAlert.relatedValues?.pendingClosings !== undefined ? (
                  <DetailMetric label="Pending Closings" value={String(selectedAlert.relatedValues.pendingClosings)} />
                ) : null}
                {selectedAlert.relatedValues?.percent !== undefined ? (
                  <DetailMetric label="Indicator" value={`${Math.round(selectedAlert.relatedValues.percent * 100)}%`} />
                ) : null}
              </div>

              {selectedAlert.reviewPath ? (
                <button
                  type="button"
                  style={styles.reviewSourceButton}
                  onClick={() => openManagerSafeReviewPath(selectedAlert.reviewPath)}
                >
                  {selectedAlert.reviewLabel || "Review Source"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Quick Actions</h2>
          </div>
          <div style={styles.quickActions}>
            <button
              type="button"
              style={styles.quickActionButton}
              onClick={openShiftClosingReview}
            >
              Go to Shift Closing
            </button>
            <button
              type="button"
              style={styles.quickActionButton}
              onClick={() => openDashboardView("department-activity")}
            >
              Review Department Activity
            </button>
            <button
              type="button"
              style={styles.quickActionButton}
              onClick={() => openDashboardView("sales-summary")}
            >
              Review Sales Summary
            </button>
            <button
              type="button"
              style={styles.quickActionButton}
              onClick={() => openDashboardView("front-desk")}
            >
              Review Front Desk Overview
            </button>
            <button
              type="button"
              style={styles.quickActionButton}
              onClick={() => openDashboardView("closings")}
            >
              View Closing Status
            </button>
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
  statusPanel: {
    maxWidth: 340,
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 12,
    boxShadow: "0 8px 20px rgba(15, 38, 55, 0.04)",
  },
  statusLabel: {
    color: "#17364b",
    fontSize: 13,
    fontWeight: 900,
  },
  statusText: {
    marginTop: 4,
    color: "#607486",
    fontSize: 12,
    lineHeight: 1.35,
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
  sectionSubtitle: {
    margin: "4px 0 0",
    color: "#6b7f90",
    fontSize: 13,
  },
  sectionMeta: {
    color: "#6b7f90",
    fontSize: 13,
    fontWeight: 700,
  },
  insightStack: {
    display: "grid",
    gap: 12,
  },
  insightGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  insightCard: {
    border: "1px solid",
    borderRadius: 8,
    padding: 14,
  },
  featuredInsightCard: {
    padding: 18,
    boxShadow: "0 12px 28px rgba(15, 38, 55, 0.1)",
  },
  insightGroup: {
    display: "grid",
    gap: 8,
  },
  insightGroupTitle: {
    color: "#607486",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  insightType: {
    color: "#607486",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  insightTitle: {
    margin: "8px 0 6px",
    color: "#17364b",
    fontSize: 15,
  },
  featuredInsightTitle: {
    margin: "8px 0 8px",
    color: "#17364b",
    fontSize: 20,
  },
  insightText: {
    margin: 0,
    color: "#354b5d",
    fontSize: 13,
    lineHeight: 1.45,
  },
  insightAction: {
    marginTop: 10,
    color: "#24394a",
    fontSize: 13,
    lineHeight: 1.4,
  },
  showMoreButton: {
    justifySelf: "flex-start",
    minHeight: 36,
    border: "1px solid #cfdbe4",
    borderRadius: 8,
    background: "#ffffff",
    color: "#17364b",
    fontWeight: 800,
    padding: "0 12px",
    cursor: "pointer",
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
  actionButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    padding: "0 12px",
    border: 0,
    borderRadius: 8,
    background: "#0f5e7a",
    color: "#ffffff",
    font: "inherit",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
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
  alertButton: {
    border: "1px solid",
    borderRadius: 8,
    padding: 14,
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
  },
  alertButtonActive: {
    boxShadow: "0 0 0 3px rgba(15, 94, 122, 0.18)",
  },
  alertTitle: {
    fontWeight: 900,
    marginBottom: 5,
  },
  alertText: {
    fontSize: 13,
    lineHeight: 1.4,
  },
  alertRecommendation: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 1.4,
  },
  alertDetailPanel: {
    marginTop: 14,
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 16,
    boxShadow: "0 10px 24px rgba(15, 38, 55, 0.08)",
  },
  detailEyebrow: {
    color: "#607486",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  detailTitle: {
    margin: "4px 0 0",
    color: "#17364b",
    fontSize: 18,
  },
  closeButton: {
    border: "1px solid #cfdbe4",
    borderRadius: 8,
    background: "#ffffff",
    color: "#17364b",
    fontWeight: 800,
    minHeight: 34,
    padding: "0 12px",
    cursor: "pointer",
  },
  detailBlock: {
    marginTop: 14,
  },
  detailLabel: {
    color: "#607486",
    fontSize: 12,
    fontWeight: 900,
    marginBottom: 4,
  },
  detailText: {
    color: "#24394a",
    fontSize: 14,
    lineHeight: 1.45,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
    marginTop: 14,
  },
  detailMetric: {
    border: "1px solid #edf2f6",
    borderRadius: 8,
    padding: 10,
    background: "#f8fafc",
  },
  detailMetricLabel: {
    color: "#607486",
    fontSize: 12,
    fontWeight: 800,
  },
  detailMetricValue: {
    marginTop: 4,
    color: "#102033",
    fontSize: 14,
    fontWeight: 900,
  },
  reviewSourceButton: {
    marginTop: 14,
    minHeight: 38,
    border: "1px solid #0f5e7a",
    borderRadius: 8,
    background: "#0f5e7a",
    color: "#ffffff",
    fontWeight: 900,
    padding: "0 14px",
    cursor: "pointer",
  },
  quickActions: {
    display: "grid",
    gap: 10,
  },
  quickActionButton: {
    display: "flex",
    alignItems: "center",
    minHeight: 42,
    padding: "0 14px",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    background: "#ffffff",
    color: "#17364b",
    font: "inherit",
    fontWeight: 800,
    textAlign: "left",
    boxShadow: "0 8px 20px rgba(15, 38, 55, 0.04)",
    cursor: "pointer",
  },
};
