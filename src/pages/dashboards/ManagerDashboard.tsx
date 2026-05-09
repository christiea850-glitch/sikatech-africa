import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useDepartments } from "../../departments/DepartmentsContext";
import { useExpenses } from "../../expenses/ExpenseContext";
import { loadBookings } from "../../frontdesk/bookingsStorage";
import { loadLedgerEntries, roundLedgerMoney } from "../../finance/financialLedger";
import { useScrollHighlight } from "../../hooks/useScrollHighlight";
import { useSales } from "../../sales/SalesContext";
import { useShift } from "../../shifts/ShiftContext";
import { loadShiftClosings } from "../../shifts/shiftClosingStore";
import {
  getManagerExecutiveBriefCards,
  getManagerInsights,
  getManagerTrendIntelligence,
  type ManagerExecutiveBriefCard,
  type ManagerTrendIntelligence,
} from "../../utils/managerInsights";
import { getSmartAlerts, type SmartAlert } from "../../utils/smartAlerts";
import {
  dashboardDateInRange,
  getDashboardMetrics,
  type DashboardGroupBy,
} from "./dashboardMetrics";
import AIExecutiveBrief from "./manager/AIExecutiveBrief";
import AlertAnalytics from "./manager/AlertAnalytics";
import DepartmentAnalytics from "./manager/DepartmentAnalytics";
import InsightsAnalytics from "./manager/InsightsAnalytics";
import ManagerDecisionCenter from "./manager/ManagerDecisionCenter";
import ManagerIntelligenceSections from "./manager/ManagerIntelligenceSections";
import OperationsAnalytics from "./manager/OperationsAnalytics";
import SalesSummaryAnalytics from "./manager/SalesSummaryAnalytics";
import VisualInsightsHub from "./manager/VisualInsightsHub";

type AlertTone = "green" | "amber" | "red" | "blue";
type DatePreset = "today" | "yesterday" | "week" | "month" | "custom";
type GroupBy = DashboardGroupBy;
type ManagerDashboardView =
  | "overview"
  | "operations"
  | "front-desk"
  | "department-activity"
  | "sales-summary"
  | "business-health"
  | "ai-brief"
  | "decision-center"
  | "visual-insights"
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
  "operations",
  "front-desk",
  "department-activity",
  "sales-summary",
  "business-health",
  "ai-brief",
  "decision-center",
  "visual-insights",
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

function executiveBriefTone(tone: ManagerExecutiveBriefCard["tone"]): AlertTone {
  if (tone === "risk") return "red";
  if (tone === "watch") return "amber";
  if (tone === "healthy") return "green";
  return "blue";
}

function executiveBriefCardRank(card: ManagerExecutiveBriefCard) {
  if (card.tone === "risk") return 0;
  if (card.tone === "watch") return 1;
  if (card.tone === "opportunity") return 2;
  return 3;
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailMetric}>
      <div style={styles.detailMetricLabel}>{label}</div>
      <div style={styles.detailMetricValue}>{value}</div>
    </div>
  );
}

function TrendIntelligenceSection({
  trendIntelligence,
}: {
  trendIntelligence: ManagerTrendIntelligence;
}) {
  return (
    <section style={styles.trendIntelligence} aria-label="Trend Intelligence">
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>Trend Intelligence</h2>
          <p style={styles.sectionSubtitle}>
            Current range compared with the prior matching range.
          </p>
        </div>
        <span style={styles.sectionMeta}>{trendIntelligence.confidenceLevel}</span>
      </div>
      <div style={styles.detailGrid}>
        <DetailMetric label="Trend Direction" value={trendIntelligence.trendDirection} />
        <DetailMetric label="Momentum" value={trendIntelligence.momentum} />
        <DetailMetric label="Risk Acceleration" value={trendIntelligence.riskAcceleration} />
        <DetailMetric label="Stability Score" value={`${trendIntelligence.stabilityScore}/100`} />
        <DetailMetric label="Confidence" value={trendIntelligence.confidenceLevel} />
      </div>
    </section>
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
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [showAllDepartments, setShowAllDepartments] = useState(false);
  const [showGroupedPerformance, setShowGroupedPerformance] = useState(false);
  const [selectedExecutiveBrief, setSelectedExecutiveBrief] =
    useState<ManagerExecutiveBriefCard | null>(null);
  const previousGroupByRef = useRef<GroupBy>(groupBy);
  const handledViewRef = useRef<ManagerDashboardView | null>(null);
  const shouldScrollViewRef = useRef(searchParams.has("view"));
  const activeView = readDashboardView(searchParams.get("view") || initialParams.get("view"));
  const {
    ref: overviewRef,
    flash: overviewFlash,
    trigger: triggerOverviewHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 2000,
    block: "start",
  });
  const {
    ref: insightsRef,
    flash: insightsFlash,
    trigger: triggerInsightsHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 2000,
    block: "start",
  });
  const {
    ref: operationsRef,
    flash: operationsFlash,
    trigger: triggerOperationsHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 2000,
    block: "start",
  });
  const {
    ref: frontDeskRef,
    flash: frontDeskFlash,
    trigger: triggerFrontDeskHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 2000,
    block: "start",
  });
  const {
    ref: departmentActivityRef,
    flash: departmentActivityFlash,
    trigger: triggerDepartmentActivityHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 2000,
    block: "start",
  });
  const {
    ref: groupedPerformanceRef,
    flash: groupedPerformanceFlash,
    trigger: triggerGroupedPerformanceHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 2000,
    block: "start",
  });
  const {
    ref: visualInsightsRef,
    flash: visualInsightsFlash,
    trigger: triggerVisualInsightsHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 2000,
    block: "start",
  });
  const {
    ref: managerAlertsRef,
    flash: managerAlertsFlash,
    trigger: triggerManagerAlertsHighlight,
  } = useScrollHighlight<HTMLDivElement>({
    durationMs: 2000,
    block: "start",
  });
  const {
    ref: alertDetailRef,
    flash: alertDetailFlash,
    trigger: triggerAlertDetailHighlight,
  } = useScrollHighlight<HTMLDivElement>({
    durationMs: 2000,
    block: "start",
  });
  const {
    ref: closingStatusRef,
    flash: closingStatusFlash,
    trigger: triggerClosingStatusHighlight,
  } = useScrollHighlight<HTMLElement>({
    durationMs: 2000,
    block: "start",
  });

  const activeRange = datePreset === "custom" ? customRange : getPresetRange(datePreset);
  const previousRange = useMemo(() => getPreviousRange(activeRange), [activeRange]);

  useEffect(() => {
    const hasFilterParams =
      searchParams.has("dateFilter") ||
      searchParams.has("startDate") ||
      searchParams.has("endDate") ||
      searchParams.has("groupBy");

    if (hasFilterParams) {
      const nextDatePreset = readDatePreset(searchParams.get("dateFilter"));
      const nextRange = getPresetRange(nextDatePreset);
      const nextCustomRange = {
        startDate: searchParams.get("startDate") || nextRange.startDate,
        endDate: searchParams.get("endDate") || nextRange.endDate,
      };
      const nextGroupBy = readGroupBy(searchParams.get("groupBy"));
      let syncedFromParams = false;

      if (datePreset !== nextDatePreset) {
        setDatePreset(nextDatePreset);
        syncedFromParams = true;
      }

      if (
        customRange.startDate !== nextCustomRange.startDate ||
        customRange.endDate !== nextCustomRange.endDate
      ) {
        setCustomRange(nextCustomRange);
        syncedFromParams = true;
      }

      if (groupBy !== nextGroupBy) {
        setGroupBy(nextGroupBy);
        syncedFromParams = true;
      }

      if (syncedFromParams) return;
    }

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
    customRange.endDate,
    customRange.startDate,
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
    } else if (view === "operations") {
      triggerOperationsHighlight();
    } else if (view === "front-desk") {
      triggerFrontDeskHighlight();
    } else if (view === "department-activity") {
      triggerDepartmentActivityHighlight();
    } else if (view === "sales-summary") {
      triggerGroupedPerformanceHighlight();
    } else if (view === "visual-insights") {
      triggerVisualInsightsHighlight();
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
    triggerOperationsHighlight,
    triggerOverviewHighlight,
    triggerVisualInsightsHighlight,
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
  const visibleAlerts = showAllAlerts ? alerts : alerts.slice(0, 3);
  const hasMoreAlerts = alerts.length > visibleAlerts.length;
  const groupedPerformancePinned =
    activeView === "sales-summary" || activeView === "department-activity";
  const groupedPerformanceOpen =
    showGroupedPerformance || groupedPerformancePinned;
  const departmentCardsPinned = activeView === "department-activity";
  const departmentCardsOpen = showAllDepartments || departmentCardsPinned;
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

  useEffect(() => {
    if (!selectedAlert) return;

    window.requestAnimationFrame(() => {
      triggerAlertDetailHighlight();
    });
  }, [selectedAlert?.id, triggerAlertDetailHighlight]);

  const activeDepartments = departmentPerformance.filter((department) => department.transactions > 0).length;
  const receivablesTotal = metrics.totals.receivables || Math.max(0, metrics.totals.revenue - metrics.totals.collections);
  const dataConfidenceLabel = getDataConfidenceLabel(metrics.entries);
  const dataConfidenceHint = getDataConfidenceHint(dataConfidenceLabel);
  const isOverviewView = activeView === "overview";
  const isOverviewSummaryLayerView =
    activeView === "business-health" ||
    activeView === "ai-brief" ||
    activeView === "decision-center";
  const topPriorityAlert = alerts[0] || null;
  const topPriorityText =
    topPriorityAlert?.message ||
    featuredInsight?.message ||
    "No urgent issue is currently flagged for this range.";
  const businessHealthTone: AlertTone = alerts.some((alert) => alert.type === "critical")
    ? "red"
    : alerts.some((alert) => alert.type === "warning")
      ? "amber"
      : metrics.transactions > 0
        ? "green"
        : "blue";
  const businessHealthLabel =
    businessHealthTone === "red"
      ? "Needs Attention"
      : businessHealthTone === "amber"
        ? "Monitor Closely"
        : businessHealthTone === "green"
          ? "Steady"
          : "Low Activity";
  const topDepartments = departmentPerformance
    .filter((department) => department.transactions > 0)
    .slice()
    .sort((a, b) => b.total - a.total || b.transactions - a.transactions)
    .slice(0, 3);
  const quietDepartments = departmentPerformance.filter((department) => department.transactions === 0).length;

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

  const maxFinancialVisualValue = Math.max(
    metrics.totals.revenue,
    metrics.totals.collections,
    metrics.totals.expenses,
    Math.abs(metrics.totals.netProfit),
    1
  );
  const financialVisualRows = [
    { label: "Revenue", value: metrics.totals.revenue, tone: "revenue" },
    { label: "Collections", value: metrics.totals.collections, tone: "collections" },
    { label: "Expenses", value: metrics.totals.expenses, tone: "expenses" },
    { label: "Net Profit", value: metrics.totals.netProfit, tone: metrics.totals.netProfit < 0 ? "loss" : "profit" },
  ];
  const collectionPercent =
    metrics.totals.revenue > 0
      ? Math.min(100, Math.max(0, (metrics.totals.collections / metrics.totals.revenue) * 100))
      : 0;
  const topDepartmentVisualRows = topDepartments.slice(0, 4);
  const maxDepartmentVisualValue = Math.max(
    ...topDepartmentVisualRows.map((department) => department.total),
    1
  );
  const groupedVisualRows = metrics.groupedRows.slice(0, 4);
  const maxGroupedVisualValue = Math.max(
    ...groupedVisualRows.map((row) => row.revenue || row.collections || row.expenses),
    1
  );
  const alertSeverityRows = [
    {
      label: "Critical",
      count: alerts.filter((alert) => alert.type === "critical").length,
      tone: "loss",
    },
    {
      label: "Warning",
      count: alerts.filter((alert) => alert.type === "warning").length,
      tone: "expenses",
    },
    {
      label: "Info",
      count: alerts.filter((alert) => alert.type === "info").length,
      tone: "collections",
    },
  ];
  const maxAlertSeverityCount = Math.max(...alertSeverityRows.map((row) => row.count), 1);
  const hasVisualActivity =
    metrics.transactions > 0 ||
    metrics.totals.revenue > 0 ||
    metrics.totals.collections > 0 ||
    metrics.totals.expenses > 0 ||
    alerts.length > 0;
  const groupedRankingRows = metrics.groupedRows.slice(0, 8);
  const maxGroupedRevenue = Math.max(...groupedRankingRows.map((row) => row.revenue), 1);
  const weakestGroupedRow =
    metrics.groupedRows.length > 0
      ? metrics.groupedRows
          .slice()
          .sort((a, b) => a.netProfit - b.netProfit || a.revenue - b.revenue)[0]
      : null;
  const collectionGap = Math.max(0, metrics.totals.revenue - metrics.totals.collections);
  const departmentRankingRows = departmentPerformance
    .slice()
    .sort((a, b) => b.total - a.total || b.transactions - a.transactions);
  const maxDepartmentTotal = Math.max(...departmentRankingRows.map((department) => department.total), 1);
  const maxDepartmentTransactions = Math.max(
    ...departmentRankingRows.map((department) => department.transactions),
    1
  );
  const activeDepartmentPercent =
    enabledDepartments.length > 0 ? (activeDepartments / enabledDepartments.length) * 100 : 0;
  const alertsByGroup = alerts.reduce((map, alert) => {
    const key = alert.relatedGroup || labelize(alert.type);
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map<string, number>());
  const alertHotspots = Array.from(alertsByGroup.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const maxAlertHotspotCount = Math.max(...alertHotspots.map((row) => row.count), 1);
  const riskInsightCount = insights.filter((insight) => insight.type === "risk").length;
  const warningInsightCount = insights.filter((insight) => insight.type === "warning").length;
  const positiveInsightCount = insights.filter((insight) => insight.type === "positive").length;
  const insightPriorityRows = insights.slice(0, 5).map((insight) => ({
    id: insight.id,
    title: insight.title,
    type: insight.type,
    score: insight.type === "risk" ? 95 : insight.type === "warning" ? 76 : insight.type === "positive" ? 58 : 42,
  }));
  const strongestDepartment = departmentRankingRows.find((department) => department.transactions > 0) || null;
  const weakestDepartment =
    departmentRankingRows
      .slice()
      .reverse()
      .find((department) => department.transactions === 0 || department.status === "Needs Review") ||
    null;
  const operationsReadinessRows = [
    {
      label: "Shift Status",
      value: openShifts.length,
      helper: openShifts.length ? `${openShifts.length} open` : "No open shifts",
      tone: openShifts.length ? "expenses" : "profit",
    },
    {
      label: "Closings",
      value: pendingClosings.length,
      helper: pendingClosings.length ? `${pendingClosings.length} pending` : "Ready",
      tone: pendingClosings.length ? "expenses" : "profit",
    },
    {
      label: "Front Desk",
      value: unpaidBookings.length,
      helper: unpaidBookings.length ? `${unpaidBookings.length} unpaid` : "Settled",
      tone: unpaidBookings.length ? "loss" : "profit",
    },
    {
      label: "Departments",
      value: quietDepartments,
      helper: quietDepartments ? `${quietDepartments} quiet` : "All active",
      tone: quietDepartments ? "collections" : "profit",
    },
  ];
  const maxOperationsValue = Math.max(...operationsReadinessRows.map((row) => row.value), 1);

  const bestDepartment = topDepartments[0] || null;
  const priorityFocusTarget: ManagerDashboardView = topPriorityAlert ? "alerts" : "insights";
  const nextReviewTarget: ManagerDashboardView = topPriorityAlert
    ? "alerts"
    : featuredInsight
      ? "insights"
      : topDepartments.length || quietDepartments
        ? "department-activity"
        : "overview";
  const collectionWatchHasRisk = receivablesTotal > 0 || pendingClosings.length > 0;
  const revenueChange = roundLedgerMoney(metrics.totals.revenue - previousMetrics.totals.revenue);
  const revenueChangePercent =
    previousMetrics.totals.revenue > 0
      ? (revenueChange / previousMetrics.totals.revenue) * 100
      : metrics.totals.revenue > 0
        ? 100
        : 0;
  const baseExecutiveBriefItems = getManagerExecutiveBriefCards({
    metrics,
    previousMetrics,
    alerts,
    insights,
    departmentPerformance,
    strongestDepartment,
    weakestDepartment,
    receivablesTotal,
    collectionPercent,
    collectionGap,
    pendingClosings,
    openShifts,
    unpaidBookings,
    revenueChange,
    revenueChangePercent,
  });
  const trendIntelligence = getManagerTrendIntelligence({
    metrics,
    previousMetrics,
    receivablesTotal,
    collectionGap,
    existingCardIds: baseExecutiveBriefItems.map((item) => item.id),
  });
  const aiExecutiveBriefItems = [
    ...trendIntelligence.predictiveCards,
    ...baseExecutiveBriefItems,
  ]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((a, b) => executiveBriefCardRank(a) - executiveBriefCardRank(b))
    .slice(0, 5);
  const decisionCards: Array<{
    title: string;
    text: string;
    status: string;
    tone: AlertTone;
    actionLabel: string;
    target: ManagerDashboardView;
  }> = [
    {
      title: "Priority Focus",
      text: topPriorityAlert
        ? topPriorityAlert.message
        : featuredInsight?.message || "No urgent issue is currently flagged for this range.",
      status: topPriorityAlert ? "Needs review" : businessHealthLabel,
      tone: businessHealthTone,
      actionLabel: topPriorityAlert ? "Review alerts" : "Review insights",
      target: priorityFocusTarget,
    },
    {
      title: "Best Performer",
      text: bestDepartment
        ? `${bestDepartment.name} leads active departments with ${money(bestDepartment.total)} in sales.`
        : "No active department leader is available for this range yet.",
      status: bestDepartment ? "Leading" : "No leader yet",
      tone: bestDepartment ? "green" : "blue",
      actionLabel: "Review departments",
      target: "department-activity",
    },
    {
      title: "Collection / Cash Watch",
      text: collectionWatchHasRisk
        ? `${money(receivablesTotal)} in receivables and ${pendingClosings.length} pending closing${pendingClosings.length === 1 ? "" : "s"} are visible for this range.`
        : "Collections and cash desk signals look steady for this range.",
      status: collectionWatchHasRisk ? "Watch" : "Steady",
      tone: collectionWatchHasRisk ? "amber" : "green",
      actionLabel: "Review alerts",
      target: "alerts",
    },
    {
      title: "Next Review Step",
      text: topPriorityAlert
        ? "Start with the ranked manager alerts before moving into supporting details."
        : featuredInsight
          ? "Start with manager insights to understand the strongest signal in this range."
          : topDepartments.length || quietDepartments
            ? "Review department activity to confirm performance and quiet areas."
            : "Use supporting KPI details as the baseline for this range.",
      status: labelize(nextReviewTarget),
      tone: topPriorityAlert ? smartAlertTone(topPriorityAlert.type) : "blue",
      actionLabel: "Open review panel",
      target: nextReviewTarget,
    },
  ];
  const intelligenceSections: Array<{
    title: string;
    text: string;
    target: ManagerDashboardView;
  }> = [
    {
      title: "Overview",
      text: "Executive health, decision cards, KPI support, and quick review links.",
      target: "overview",
    },
    {
      title: "Business Health",
      text: "Focused executive health, top priority issue, and core manager numbers.",
      target: "business-health",
    },
    {
      title: "AI Brief",
      text: "Deterministic executive observations from the current dashboard signals.",
      target: "ai-brief",
    },
    {
      title: "Decision Center",
      text: "Focused attention areas, strengths, next action, and data confidence.",
      target: "decision-center",
    },
    {
      title: "Insights",
      text: "Plain-language risks, wins, and follow-up guidance from the selected range.",
      target: "insights",
    },
    {
      title: "Alerts",
      text: "Ranked issues with the existing alert detail panel.",
      target: "alerts",
    },
    {
      title: "Department Activity",
      text: "Department performance preview, leaders, quiet areas, and department cards.",
      target: "department-activity",
    },
    {
      title: "Sales Summary",
      text: "Grouped performance table using the current grouping selection.",
      target: "sales-summary",
    },
    {
      title: "Visual Insights Hub",
      text: "Power BI-style charts, trends, and manager visual analytics.",
      target: "visual-insights",
    },
    {
      title: "Operations Status",
      text: "Shift, front desk, department activity, and cash desk readiness.",
      target: "operations",
    },
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

  function openDashboardView(view: ManagerDashboardView) {
    const next = buildDashboardParams({
      source: searchParams,
      datePreset,
      activeRange,
      groupBy,
      view,
    });

    shouldScrollViewRef.current = true;
    if (view === activeView) {
      handledViewRef.current = view;
      setSearchParams(next);
      triggerDashboardView(view);
      return;
    }

    handledViewRef.current = null;
    setSearchParams(next);
  }

  function updateDashboardFilters(nextInput: {
    datePreset?: DatePreset;
    customRange?: DateRange;
    groupBy?: GroupBy;
  }) {
    const nextDatePreset = nextInput.datePreset ?? datePreset;
    const nextCustomRange = nextInput.customRange ?? customRange;
    const nextGroupBy = nextInput.groupBy ?? groupBy;
    const nextRange = nextDatePreset === "custom" ? nextCustomRange : getPresetRange(nextDatePreset);
    const next = buildDashboardParams({
      source: searchParams,
      datePreset: nextDatePreset,
      activeRange: nextRange,
      groupBy: nextGroupBy,
      view: activeView,
    });

    setSearchParams(next);
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

  function handleExecutiveBriefClick(card: ManagerExecutiveBriefCard) {
    setSelectedExecutiveBrief(card);

    if (card.targetView === "alerts" && card.id.startsWith("critical-alert:")) {
      const alertId = card.id.replace("critical-alert:", "");
      setSelectedAlert(alerts.find((alert) => alert.id === alertId) || null);
    }

    openDashboardView(card.targetView);
  }

  const snapshot = [
    {
      title: "Shift Status",
      text: openShifts.length ? `${openShifts.length} shift${openShifts.length === 1 ? "" : "s"} open.` : "No shift activity yet.",
      tone: openShifts.length ? "amber" : "green",
    },
    {
      title: "Front Desk Status",
      text: unpaidBookings.length ? `${unpaidBookings.length} unpaid room balance${unpaidBookings.length === 1 ? "" : "s"}.` : "Room balances look settled.",
      tone: unpaidBookings.length ? "red" : "green",
    },
    {
      title: "Department Activity",
      text: metrics.transactions ? `${activeDepartments} department${activeDepartments === 1 ? "" : "s"} active in range.` : "No department activity yet.",
      tone: metrics.transactions ? "blue" : "amber",
    },
    {
      title: "Cash Desk Readiness",
      text: pendingClosings.length ? `${pendingClosings.length} closing${pendingClosings.length === 1 ? "" : "s"} pending.` : "No pending closings.",
      tone: pendingClosings.length ? "amber" : "green",
    },
  ] as const;

  function handleAlertClick(alert: SmartAlert) {
    setSelectedAlert(alert);
  }

  return (
    <main style={styles.page}>
      <style>
        {`
          .manager-analytics-card,
          .manager-visual-card {
            transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
          }
          .manager-analytics-card:hover,
          .manager-visual-card:hover {
            transform: translateY(-1px);
            border-color: #c7d7e4;
            box-shadow: 0 12px 26px rgba(15, 38, 55, 0.08);
          }
          .manager-visual-fill {
            transition: width 420ms ease, height 420ms ease, opacity 160ms ease;
          }
          .manager-visual-row:hover .manager-visual-fill {
            opacity: 0.86;
          }
        `}
      </style>
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
            onChange={(event) => {
              const nextDatePreset = event.target.value as DatePreset;
              setDatePreset(nextDatePreset);
              updateDashboardFilters({ datePreset: nextDatePreset });
            }}
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
                onChange={(event) => {
                  const nextCustomRange = { ...customRange, startDate: event.target.value };
                  setCustomRange(nextCustomRange);
                  updateDashboardFilters({ datePreset: "custom", customRange: nextCustomRange });
                }}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="manager-end-date">End Date</label>
              <input
                id="manager-end-date"
                type="date"
                style={styles.input}
                value={customRange.endDate}
                onChange={(event) => {
                  const nextCustomRange = { ...customRange, endDate: event.target.value };
                  setCustomRange(nextCustomRange);
                  updateDashboardFilters({ datePreset: "custom", customRange: nextCustomRange });
                }}
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
            onChange={(event) => {
              const nextGroupBy = event.target.value as GroupBy;
              setGroupBy(nextGroupBy);
              updateDashboardFilters({ groupBy: nextGroupBy });
            }}
          >
            <option value="department">Department</option>
            <option value="payment">Payment Method</option>
            <option value="shift">Shift</option>
            <option value="staff">Staff</option>
            <option value="room_customer">Room / Customer</option>
          </select>
        </div>
      </section>

      {!isOverviewView ? (
        !isOverviewSummaryLayerView ? (
        <ManagerIntelligenceSections
          styles={styles}
          sections={intelligenceSections}
          activeView={activeView}
          labelize={labelize}
          openDashboardView={openDashboardView}
        />
        ) : null
      ) : null}

      {selectedExecutiveBrief ? (
      <section style={styles.alertDetailPanel} aria-label="Executive brief evidence">
        <div style={styles.rowBetween}>
          <div>
            <div style={styles.detailEyebrow}>Executive Brief Evidence</div>
            <h3 style={styles.detailTitle}>{selectedExecutiveBrief.title}</h3>
          </div>
          <button
            type="button"
            style={styles.closeButton}
            onClick={() => setSelectedExecutiveBrief(null)}
          >
            Close
          </button>
        </div>

        <div style={styles.detailGrid}>
          <DetailMetric label="Risk Level" value={selectedExecutiveBrief.riskLevel} />
          <DetailMetric label="Source Area" value={selectedExecutiveBrief.sourceArea} />
          <DetailMetric label="Target Panel" value={labelize(selectedExecutiveBrief.targetView)} />
          {selectedExecutiveBrief.trendDirection ? (
            <DetailMetric label="Trend Direction" value={selectedExecutiveBrief.trendDirection} />
          ) : null}
          {selectedExecutiveBrief.confidenceLevel ? (
            <DetailMetric label="Confidence" value={selectedExecutiveBrief.confidenceLevel} />
          ) : null}
        </div>

        <div style={styles.detailBlock}>
          <div style={styles.detailLabel}>Why it was flagged</div>
          <div style={styles.detailText}>{selectedExecutiveBrief.whyFlagged}</div>
        </div>

        {selectedExecutiveBrief.keyNumbers.length > 0 ? (
          <div style={styles.detailGrid}>
            {selectedExecutiveBrief.keyNumbers.map((item) => (
              <DetailMetric key={`${selectedExecutiveBrief.id}:${item.label}`} label={item.label} value={item.value} />
            ))}
          </div>
        ) : null}

        <div style={styles.detailBlock}>
          <div style={styles.detailLabel}>Recommended manager action</div>
          <div style={styles.detailText}>{selectedExecutiveBrief.recommendedAction}</div>
        </div>

        <button
          type="button"
          style={{
            ...styles.reviewSourceButton,
            ...alertStyle(executiveBriefTone(selectedExecutiveBrief.tone)),
          }}
          onClick={() => openDashboardView(selectedExecutiveBrief.targetView)}
        >
          Open {labelize(selectedExecutiveBrief.targetView)}
        </button>
      </section>
      ) : null}

      {isOverviewView ? (
      <>
      <section style={styles.executivePanel}>
        <div style={styles.executiveHeader}>
          <div>
            <h2 style={styles.executiveTitle}>Business Health Summary</h2>
            <p style={styles.sectionSubtitle}>
              Top priority, core numbers, and the next review focus for this range.
            </p>
          </div>
          <span style={{ ...styles.badge, ...alertStyle(businessHealthTone) }}>
            {businessHealthLabel}
          </span>
        </div>

        <div style={styles.executiveGrid}>
          <div style={styles.executivePriority}>
            <div style={styles.detailEyebrow}>Top Priority Issue</div>
            <h3 style={styles.detailTitle}>
              {topPriorityAlert?.title || featuredInsight?.title || "No urgent issue"}
            </h3>
            <p style={styles.detailText}>{topPriorityText}</p>
          </div>

          <div style={styles.executiveNumbers} aria-label="Key manager numbers">
            <DetailMetric label="Sales" value={money(metrics.totals.revenue)} />
            <DetailMetric label="Net Profit" value={money(metrics.totals.netProfit)} />
            <DetailMetric label="Receivables" value={money(receivablesTotal)} />
            <DetailMetric label="Pending Closings" value={String(pendingClosings.length)} />
            <DetailMetric label="Alerts" value={String(alerts.length)} />
          </div>
        </div>
      </section>

      <AIExecutiveBrief
        styles={styles}
        items={aiExecutiveBriefItems}
        activeItemId={selectedExecutiveBrief?.id || null}
        onSelectItem={(item) => handleExecutiveBriefClick(item as ManagerExecutiveBriefCard)}
      />

      <TrendIntelligenceSection trendIntelligence={trendIntelligence} />

      <ManagerDecisionCenter
        styles={styles}
        cards={decisionCards}
        dataConfidenceLabel={dataConfidenceLabel}
        businessHealthTone={businessHealthTone}
        alertStyle={alertStyle}
        openDashboardView={openDashboardView}
      />

      <section
        ref={overviewRef}
        className={overviewFlash ? "active-section" : undefined}
        style={{
          ...styles.section,
          ...(overviewFlash ? styles.sectionFlash : {}),
        }}
        aria-label="Supporting KPI details"
      >
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Executive KPI Support</h2>
            <p style={styles.sectionSubtitle}>
              Compact reference numbers behind the business health summary.
            </p>
          </div>
        </div>
        <div style={{ ...styles.kpiGrid, marginBottom: 0 }}>
          {kpis.map((kpi) => (
            <div key={kpi.label} style={styles.kpiCard}>
              <div style={styles.kpiLabel}>{kpi.label}</div>
              <div style={styles.kpiValue}>{kpi.value}</div>
              <div style={styles.kpiHint}>{kpi.hint}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Manager Alerts Preview</h2>
            <p style={styles.sectionSubtitle}>
              Compact alert status for the selected range.
            </p>
          </div>
          <span style={{ ...styles.badge, ...alertStyle(businessHealthTone) }}>
            {alerts.length} alert{alerts.length === 1 ? "" : "s"}
          </span>
        </div>
        <div style={styles.previewPanel}>
          {topPriorityAlert ? (
            <>
              <div style={styles.alertTitle}>{topPriorityAlert.title}</div>
              <div style={styles.alertText}>{topPriorityAlert.message}</div>
            </>
          ) : (
            <>
              <div style={styles.alertTitle}>No major issues detected.</div>
              <div style={styles.alertText}>Performance and operations look steady for this range.</div>
            </>
          )}
          <button
            type="button"
            style={styles.showMoreButton}
            onClick={() => openDashboardView("alerts")}
          >
            Review Alerts
          </button>
        </div>
      </section>

      <ManagerIntelligenceSections
        styles={styles}
        sections={intelligenceSections}
        activeView={activeView}
        labelize={labelize}
        openDashboardView={openDashboardView}
      />

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Manager Review Shortcuts</h2>
        </div>
        <div style={styles.quickActions}>
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
            onClick={() => openDashboardView("alerts")}
          >
            Review Alerts
          </button>
          <button
            type="button"
            style={styles.quickActionButton}
            onClick={() => openDashboardView("insights")}
          >
            Review Insights
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
            onClick={() => openDashboardView("operations")}
          >
            Operations / Status
          </button>
        </div>
      </section>
      </>
      ) : null}

      {activeView === "business-health" ? (
      <section style={styles.executivePanel}>
        <div style={styles.executiveHeader}>
          <div>
            <h2 style={styles.executiveTitle}>Business Health Summary</h2>
            <p style={styles.sectionSubtitle}>
              Top priority, core numbers, and the next review focus for this range.
            </p>
          </div>
          <span style={{ ...styles.badge, ...alertStyle(businessHealthTone) }}>
            {businessHealthLabel}
          </span>
        </div>

        <div style={styles.executiveGrid}>
          <div style={styles.executivePriority}>
            <div style={styles.detailEyebrow}>Top Priority Issue</div>
            <h3 style={styles.detailTitle}>
              {topPriorityAlert?.title || featuredInsight?.title || "No urgent issue"}
            </h3>
            <p style={styles.detailText}>{topPriorityText}</p>
          </div>

          <div style={styles.executiveNumbers} aria-label="Key manager numbers">
            <DetailMetric label="Sales" value={money(metrics.totals.revenue)} />
            <DetailMetric label="Net Profit" value={money(metrics.totals.netProfit)} />
            <DetailMetric label="Receivables" value={money(receivablesTotal)} />
            <DetailMetric label="Pending Closings" value={String(pendingClosings.length)} />
            <DetailMetric label="Alerts" value={String(alerts.length)} />
          </div>
        </div>
      </section>
      ) : null}

      {activeView === "ai-brief" ? (
      <>
      <AIExecutiveBrief
        styles={styles}
        items={aiExecutiveBriefItems}
        activeItemId={selectedExecutiveBrief?.id || null}
        onSelectItem={(item) => handleExecutiveBriefClick(item as ManagerExecutiveBriefCard)}
      />
      <TrendIntelligenceSection trendIntelligence={trendIntelligence} />
      </>
      ) : null}

      {activeView === "decision-center" ? (
      <ManagerDecisionCenter
        styles={styles}
        cards={decisionCards}
        dataConfidenceLabel={dataConfidenceLabel}
        businessHealthTone={businessHealthTone}
        alertStyle={alertStyle}
        openDashboardView={openDashboardView}
      />
      ) : null}

      {activeView === "visual-insights" ? (
      <section
        ref={visualInsightsRef}
        className={visualInsightsFlash ? "active-section" : undefined}
        style={{
          ...styles.section,
          ...(visualInsightsFlash ? styles.sectionFlash : {}),
        }}
      >
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Visual Insights Hub</h2>
            <p style={styles.sectionSubtitle}>
              Power BI-style charts, trends, and manager visual analytics for the selected range.
            </p>
          </div>
          <span style={styles.sectionMeta}>Grouped by {metrics.groupLabel}</span>
        </div>
        <VisualInsightsHub
          styles={styles}
          activeRangeLabel={getRangeLabel(activeRange)}
          groupLabel={metrics.groupLabel}
          hasVisualActivity={hasVisualActivity}
          collectionPercent={collectionPercent}
          totals={metrics.totals}
          financialVisualRows={financialVisualRows}
          maxFinancialVisualValue={maxFinancialVisualValue}
          topDepartmentVisualRows={topDepartmentVisualRows}
          maxDepartmentVisualValue={maxDepartmentVisualValue}
          groupedVisualRows={groupedVisualRows}
          maxGroupedVisualValue={maxGroupedVisualValue}
          alertSeverityRows={alertSeverityRows}
          maxAlertSeverityCount={maxAlertSeverityCount}
          receivablesTotal={receivablesTotal}
          alertsLength={alerts.length}
          riskInsightCount={riskInsightCount}
          warningInsightCount={warningInsightCount}
          activeDepartmentPercent={activeDepartmentPercent}
          strongestDepartment={strongestDepartment}
          weakestDepartment={weakestDepartment}
          money={money}
          labelize={labelize}
          openDashboardView={openDashboardView}
        />
      </section>
      ) : null}

      {activeView === "insights" ? (
      <>
      <section
        ref={insightsRef}
        className={insightsFlash ? "active-section" : undefined}
        style={{
          ...styles.section,
          ...(insightsFlash ? styles.sectionFlash : {}),
        }}
      >
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Manager Insights</h2>
            <p style={styles.sectionSubtitle}>
              Risks, wins, and next steps from the selected range.
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
      <InsightsAnalytics
        styles={styles}
        insights={insights}
        riskInsightCount={riskInsightCount}
        warningInsightCount={warningInsightCount}
        positiveInsightCount={positiveInsightCount}
        insightPriorityRows={insightPriorityRows}
        strongestDepartment={strongestDepartment}
        weakestDepartment={weakestDepartment}
        weakestGroupedRow={weakestGroupedRow}
        money={money}
        labelize={labelize}
      />
      </>
      ) : null}

      {activeView === "operations" ? (
      <>
      <section
        ref={operationsRef}
        className={operationsFlash ? "active-section" : undefined}
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
              className={
                (item.title === "Cash Desk Readiness" && closingStatusFlash) ||
                (item.title === "Front Desk Status" && frontDeskFlash)
                  ? "active-section"
                  : undefined
              }
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
            </article>
          ))}
        </div>
      </section>
      <OperationsAnalytics
        styles={styles}
        rangeLabel={getRangeLabel(activeRange)}
        operationsReadinessRows={operationsReadinessRows}
        maxOperationsValue={maxOperationsValue}
        pendingClosingsLength={pendingClosings.length}
        openShiftsLength={openShifts.length}
        unpaidBookingsLength={unpaidBookings.length}
        activeDepartmentPercent={activeDepartmentPercent}
        activeDepartments={activeDepartments}
        quietDepartments={quietDepartments}
        DetailMetric={DetailMetric}
        labelize={labelize}
      />
      </>
      ) : null}

      {activeView === "front-desk" ? (
      <section
        ref={frontDeskRef}
        className={frontDeskFlash ? "active-section" : undefined}
        style={{
          ...styles.section,
          ...(frontDeskFlash ? styles.sectionFlash : {}),
        }}
      >
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Front Desk Status</h2>
            <p style={styles.sectionSubtitle}>
              Manager-safe receivables and room balance context for the selected range.
            </p>
          </div>
          <span style={{ ...styles.badge, ...alertStyle(unpaidBookings.length ? "red" : "green") }}>
            {unpaidBookings.length ? "Review balances" : "Settled"}
          </span>
        </div>

        <div style={styles.managerReviewStrip}>
          <div style={styles.reviewBlock}>
            <div style={styles.detailEyebrow}>Current front desk signal</div>
            <div style={styles.detailText}>
              {unpaidBookings.length
                ? `${unpaidBookings.length} unpaid room balance${unpaidBookings.length === 1 ? "" : "s"} need manager review.`
                : "Room balances look settled for this range."}
            </div>
          </div>
          <div style={styles.reviewBlock}>
            <div style={styles.detailEyebrow}>Collection context</div>
            <div style={styles.detailText}>
              {receivablesTotal > 0
                ? `${money(receivablesTotal)} remains visible in receivables against current revenue activity.`
                : "Receivables are not creating a visible pressure point in this range."}
            </div>
          </div>
        </div>

        <div style={styles.detailGrid}>
          <DetailMetric label="Receivables" value={money(receivablesTotal)} />
          <DetailMetric label="Unpaid Room Balances" value={String(unpaidBookings.length)} />
          <DetailMetric label="Collections" value={money(metrics.totals.collections)} />
          <DetailMetric label="Collection Coverage" value={`${collectionPercent.toFixed(0)}%`} />
        </div>
      </section>
      ) : null}

      {activeView === "closings" ? (
      <section
        ref={closingStatusRef}
        className={closingStatusFlash ? "active-section" : undefined}
        style={{
          ...styles.section,
          ...(closingStatusFlash ? styles.sectionFlash : {}),
        }}
      >
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Cash Desk / Closings Status</h2>
            <p style={styles.sectionSubtitle}>
              Manager-safe closing readiness and cash desk context for the selected range.
            </p>
          </div>
          <span style={{ ...styles.badge, ...alertStyle(pendingClosings.length ? "amber" : "green") }}>
            {pendingClosings.length ? "Closings pending" : "Ready"}
          </span>
        </div>

        <div style={styles.managerReviewStrip}>
          <div style={styles.reviewBlock}>
            <div style={styles.detailEyebrow}>Cash desk readiness</div>
            <div style={styles.detailText}>
              {pendingClosings.length
                ? `${pendingClosings.length} closing${pendingClosings.length === 1 ? "" : "s"} remain pending for manager review.`
                : "No pending closings are visible for this range."}
            </div>
          </div>
          <div style={styles.reviewBlock}>
            <div style={styles.detailEyebrow}>Shift context</div>
            <div style={styles.detailText}>
              {openShifts.length
                ? `${openShifts.length} shift${openShifts.length === 1 ? "" : "s"} are still open.`
                : "No open shifts are currently adding closing pressure."}
            </div>
          </div>
        </div>

        <div style={styles.detailGrid}>
          <DetailMetric label="Pending Closings" value={String(pendingClosings.length)} />
          <DetailMetric label="Open Shifts" value={String(openShifts.length)} />
          <DetailMetric label="Cash Collections" value={money(metrics.totals.collections)} />
          <DetailMetric label="Receivables" value={money(receivablesTotal)} />
        </div>
      </section>
      ) : null}

      {activeView === "department-activity" ? (
      <>
      <section
        ref={departmentActivityRef}
        className={departmentActivityFlash ? "active-section" : undefined}
        style={{
          ...styles.section,
          ...(departmentActivityFlash ? styles.sectionFlash : {}),
        }}
      >
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Department Performance Preview</h2>
            <p style={styles.sectionSubtitle}>
              Quick department totals before opening the full department cards.
            </p>
          </div>
          <span style={styles.sectionMeta}>{getRangeLabel(activeRange)}</span>
        </div>
        {departmentPerformance.length === 0 ? (
          <div style={styles.emptyState}>No department activity yet.</div>
        ) : (
          <>
            <div style={styles.managerReviewStrip}>
              <div style={styles.reviewBlock}>
                <div style={styles.detailEyebrow}>What is performing well</div>
                <div style={styles.detailText}>
                  {topDepartments.length
                    ? topDepartments
                        .map((department) => `${department.name} (${money(department.total)})`)
                        .join(", ")
                    : "No active department leaders yet."}
                </div>
              </div>
              <div style={styles.reviewBlock}>
                <div style={styles.detailEyebrow}>What needs attention</div>
                <div style={styles.detailText}>
                  {quietDepartments
                    ? `${quietDepartments} department${quietDepartments === 1 ? "" : "s"} recorded no activity.`
                    : "All enabled departments have activity in this range."}
                </div>
              </div>
            </div>

            {departmentCardsOpen ? (
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
            ) : null}

            {!departmentCardsPinned ? (
              <button
                type="button"
                style={styles.showMoreButton}
                onClick={() => setShowAllDepartments((current) => !current)}
              >
                {departmentCardsOpen ? "Hide department cards" : "Show all department cards"}
              </button>
            ) : null}
          </>
        )}
      </section>
      <DepartmentAnalytics
        styles={styles}
        departmentPerformance={departmentPerformance}
        departmentRankingRows={departmentRankingRows}
        activeDepartments={activeDepartments}
        enabledDepartmentsLength={enabledDepartments.length}
        quietDepartments={quietDepartments}
        activeDepartmentPercent={activeDepartmentPercent}
        maxDepartmentTotal={maxDepartmentTotal}
        maxDepartmentTransactions={maxDepartmentTransactions}
        money={money}
      />
      </>
      ) : null}

      {activeView === "sales-summary" ? (
      <>
      <section
        ref={groupedPerformanceRef}
        className={groupedPerformanceFlash ? "active-section" : undefined}
        style={{
          ...styles.section,
          ...(groupedPerformanceFlash ? styles.sectionFlash : {}),
        }}
      >
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Grouped Performance</h2>
          <span style={styles.sectionMeta}>
            Comparing by {metrics.groupLabel} | {dataConfidenceLabel}
          </span>
        </div>
        {groupedPerformanceOpen ? (
          metrics.groupedRows.length === 0 ? (
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
          )
        ) : (
          <div style={styles.emptyState}>
            Detailed rows are hidden. Open this view to compare revenue, collections, expenses, net profit, and transactions by {metrics.groupLabel.toLowerCase()}.
          </div>
        )}
        {!groupedPerformancePinned ? (
          <button
            type="button"
            style={styles.showMoreButton}
            onClick={() => setShowGroupedPerformance((current) => !current)}
          >
            {groupedPerformanceOpen ? "Hide grouped performance" : "Show grouped performance"}
          </button>
        ) : null}
      </section>
      <SalesSummaryAnalytics
        styles={styles}
        groupLabel={metrics.groupLabel}
        groupedRows={metrics.groupedRows}
        totals={metrics.totals}
        collectionGap={collectionGap}
        maxFinancialVisualValue={maxFinancialVisualValue}
        groupedRankingRows={groupedRankingRows}
        maxGroupedRevenue={maxGroupedRevenue}
        weakestGroupedRow={weakestGroupedRow}
        DetailMetric={DetailMetric}
        money={money}
        labelize={labelize}
      />
      </>
      ) : null}

      {activeView === "alerts" ? (
      <>
      <section
        ref={managerAlertsRef}
        className={managerAlertsFlash ? "active-section" : undefined}
        style={{
          ...styles.section,
          ...(managerAlertsFlash ? styles.sectionFlash : {}),
        }}
      >
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Manager Alerts</h2>
              <p style={styles.sectionSubtitle}>Issues ranked for manager review; select one to see details.</p>
            </div>
          </div>
          <div style={styles.alertList}>
            {alerts.length === 0 ? (
              <article style={{ ...styles.alertCard, ...alertStyle("blue") }}>
                <div style={styles.alertTitle}>No major issues detected.</div>
                <div style={styles.alertText}>Performance and operations look steady for this range.</div>
              </article>
            ) : (
              visibleAlerts.map((alert) => (
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
            {hasMoreAlerts || showAllAlerts ? (
              <button
                type="button"
                style={styles.showMoreButton}
                onClick={() => setShowAllAlerts((current) => !current)}
              >
                {showAllAlerts ? "Show fewer alerts" : `Show more alerts (${alerts.length - visibleAlerts.length})`}
              </button>
            ) : null}
          </div>

          {selectedAlert ? (
            <div
              ref={alertDetailRef}
              className={alertDetailFlash ? "active-section" : undefined}
              style={{
                ...styles.alertDetailPanel,
                ...(alertDetailFlash ? styles.sectionFlash : {}),
              }}
            >
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
                  {selectedAlert.reviewLabel || "Review Related Section"}
                </button>
              ) : null}
            </div>
          ) : null}
      </section>
      <AlertAnalytics
        styles={styles}
        alerts={alerts}
        alertSeverityRows={alertSeverityRows}
        maxAlertSeverityCount={maxAlertSeverityCount}
        alertHotspots={alertHotspots}
        maxAlertHotspotCount={maxAlertHotspotCount}
        labelize={labelize}
      />
      </>
      ) : null}
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
  executivePanel: {
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 18,
    marginBottom: 20,
    boxShadow: "0 10px 24px rgba(15, 38, 55, 0.06)",
  },
  executiveHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 14,
  },
  executiveTitle: {
    margin: 0,
    fontSize: 20,
    color: "#17364b",
  },
  executiveGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(240px, 1.2fr) minmax(260px, 1fr)",
    gap: 14,
  },
  executivePriority: {
    border: "1px solid #edf2f6",
    borderRadius: 8,
    padding: 14,
    background: "#f8fafc",
  },
  executiveNumbers: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
    gap: 10,
  },
  intelligenceNav: {
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    boxShadow: "0 8px 20px rgba(15, 38, 55, 0.04)",
  },
  intelligenceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 10,
  },
  intelligenceCard: {
    border: "1px solid #dce5ec",
    borderRadius: 8,
    background: "#f8fafc",
    color: "#17364b",
    padding: 12,
    textAlign: "left",
    cursor: "pointer",
    display: "grid",
    gap: 6,
    font: "inherit",
  },
  intelligenceCardActive: {
    background: "#eff6ff",
    borderColor: "#93c5fd",
    boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.12)",
  },
  intelligenceTitle: {
    fontSize: 13,
    fontWeight: 900,
    color: "#17364b",
  },
  intelligenceText: {
    fontSize: 12,
    lineHeight: 1.35,
    color: "#607486",
  },
  decisionCenter: {
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 18,
    marginBottom: 20,
    boxShadow: "0 10px 24px rgba(15, 38, 55, 0.05)",
  },
  decisionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  decisionCard: {
    border: "1px solid #edf2f6",
    borderRadius: 8,
    padding: 14,
    background: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 180,
  },
  decisionCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  decisionTitle: {
    margin: 0,
    color: "#17364b",
    fontSize: 15,
  },
  decisionPill: {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  decisionText: {
    margin: 0,
    color: "#354b5d",
    fontSize: 13,
    lineHeight: 1.45,
    flex: 1,
  },
  decisionButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    border: "1px solid #cfdbe4",
    borderRadius: 8,
    background: "#ffffff",
    color: "#17364b",
    fontWeight: 800,
    padding: "0 11px",
    cursor: "pointer",
  },
  visualIntelligence: {
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    boxShadow: "0 10px 24px rgba(15, 38, 55, 0.05)",
  },
  visualGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: 12,
  },
  visualCard: {
    border: "1px solid #edf2f6",
    borderRadius: 8,
    padding: 14,
    background: "#f8fafc",
    minHeight: 180,
  },
  visualLegend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    color: "#607486",
    fontSize: 11,
    fontWeight: 800,
  },
  visualLegendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  },
  visualLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "#0f5e7a",
    flex: "0 0 auto",
  },
  visualInsightRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTop: "1px solid #edf2f6",
    color: "#354b5d",
    fontSize: 12,
    fontWeight: 800,
  },
  visualCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  visualTitle: {
    margin: 0,
    color: "#17364b",
    fontSize: 15,
  },
  visualSub: {
    margin: "4px 0 0",
    color: "#607486",
    fontSize: 12,
    lineHeight: 1.35,
  },
  visualLinkButton: {
    border: "1px solid #cfdbe4",
    borderRadius: 8,
    background: "#ffffff",
    color: "#17364b",
    fontWeight: 800,
    fontSize: 12,
    minHeight: 30,
    padding: "0 10px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  collectionTrack: {
    height: 16,
    background: "#e8eef3",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 12,
  },
  collectionFill: {
    height: "100%",
    background: "#0f5e7a",
    borderRadius: 999,
    transition: "width 420ms ease",
  },
  visualSplit: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 12,
    color: "#354b5d",
    fontSize: 12,
    fontWeight: 800,
  },
  visualBarStack: {
    display: "grid",
    gap: 10,
    marginTop: 12,
  },
  visualBarRow: {
    display: "grid",
    gridTemplateColumns: "minmax(80px, 0.9fr) minmax(90px, 1.5fr) minmax(58px, auto)",
    gap: 8,
    alignItems: "center",
  },
  visualBarLabel: {
    color: "#354b5d",
    fontSize: 12,
    fontWeight: 800,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  visualBarTrack: {
    height: 10,
    background: "#e8eef3",
    borderRadius: 999,
    overflow: "hidden",
  },
  visualBarFill: {
    height: "100%",
    borderRadius: 999,
    transition: "width 420ms ease, opacity 160ms ease",
  },
  visualBarRevenue: {
    background: "#0f5e7a",
  },
  visualBarCollections: {
    background: "#2563eb",
  },
  visualBarExpenses: {
    background: "#d97706",
  },
  visualBarProfit: {
    background: "#16a34a",
  },
  visualBarLoss: {
    background: "#dc2626",
  },
  visualBarValue: {
    color: "#17364b",
    fontSize: 12,
    fontWeight: 900,
    textAlign: "right",
  },
  miniColumnChart: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
    alignItems: "end",
    minHeight: 150,
  },
  miniColumnItem: {
    display: "grid",
    gap: 6,
    alignItems: "end",
    minWidth: 0,
  },
  miniColumnFrame: {
    height: 88,
    borderRadius: 8,
    background: "#e8eef3",
    display: "flex",
    alignItems: "flex-end",
    overflow: "hidden",
  },
  miniColumnFill: {
    width: "100%",
    background: "#0f5e7a",
    borderRadius: "8px 8px 0 0",
    transition: "height 420ms ease, opacity 160ms ease",
  },
  miniColumnLabel: {
    color: "#354b5d",
    fontSize: 11,
    fontWeight: 800,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  miniColumnValue: {
    color: "#17364b",
    fontSize: 11,
    fontWeight: 900,
  },
  visualEmpty: {
    color: "#607486",
    fontSize: 13,
    padding: "18px 0",
  },
  analyticsPanel: {
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    boxShadow: "0 10px 24px rgba(15, 38, 55, 0.05)",
  },
  analyticsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
  },
  executiveAnalytics: {
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    boxShadow: "0 10px 24px rgba(15, 38, 55, 0.05)",
  },
  executiveAnalyticsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 12,
  },
  executiveAnalyticsCard: {
    border: "1px solid #edf2f6",
    borderRadius: 8,
    padding: 14,
    background: "#f8fafc",
    minHeight: 190,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  executiveAnalyticsTopline: {
    display: "grid",
    gap: 8,
  },
  executiveAnalyticsPill: {
    justifySelf: "start",
    border: "1px solid #d7e2ea",
    borderRadius: 999,
    background: "#ffffff",
    color: "#354b5d",
    fontSize: 11,
    fontWeight: 900,
    padding: "5px 8px",
  },
  executiveAnalyticsText: {
    margin: 0,
    color: "#354b5d",
    fontSize: 13,
    lineHeight: 1.45,
    flex: 1,
  },
  executiveAnalyticsMeter: {
    height: 10,
    background: "#e8eef3",
    borderRadius: 999,
    overflow: "hidden",
  },
  executiveAnalyticsMeterFill: {
    height: "100%",
    borderRadius: 999,
    transition: "width 420ms ease, opacity 160ms ease",
  },
  aiBrief: {
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    boxShadow: "0 10px 24px rgba(15, 38, 55, 0.05)",
  },
  trendIntelligence: {
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    boxShadow: "0 10px 24px rgba(15, 38, 55, 0.05)",
  },
  aiBriefBadge: {
    border: "1px solid #d7e2ea",
    borderRadius: 999,
    background: "#f8fafc",
    color: "#354b5d",
    fontSize: 11,
    fontWeight: 900,
    padding: "5px 9px",
    textTransform: "uppercase",
  },
  aiBriefGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  aiBriefCard: {
    border: "1px solid #edf2f6",
    borderRadius: 8,
    padding: 14,
    background: "#f8fafc",
    minHeight: 126,
    display: "grid",
    alignContent: "start",
    gap: 10,
  },
  aiBriefCardButton: {
    width: "100%",
    textAlign: "left",
    font: "inherit",
    cursor: "pointer",
  },
  aiBriefPill: {
    justifySelf: "start",
    border: "1px solid",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    padding: "5px 8px",
    textTransform: "uppercase",
  },
  aiBriefPillHealthy: {
    background: "#ecfdf5",
    borderColor: "#bbf7d0",
    color: "#166534",
  },
  aiBriefPillWatch: {
    background: "#fffbeb",
    borderColor: "#fde68a",
    color: "#92400e",
  },
  aiBriefPillRisk: {
    background: "#fff1f2",
    borderColor: "#fecdd3",
    color: "#9f1239",
  },
  aiBriefPillOpportunity: {
    background: "#eff6ff",
    borderColor: "#bfdbfe",
    color: "#1d4ed8",
  },
  aiBriefText: {
    margin: 0,
    color: "#24394a",
    fontSize: 14,
    lineHeight: 1.45,
    fontWeight: 800,
  },
  drilldownMetricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 10,
    marginTop: 12,
  },
  drilldownFocusValue: {
    marginTop: 14,
    color: "#17364b",
    fontSize: 22,
    fontWeight: 900,
    lineHeight: 1.15,
  },
  drilldownList: {
    display: "grid",
    gap: 8,
    marginTop: 12,
  },
  drilldownListRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderBottom: "1px solid #edf2f6",
    paddingBottom: 8,
    color: "#354b5d",
    fontSize: 12,
    fontWeight: 800,
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
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 8,
    marginBottom: 12,
  },
  kpiCard: {
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: "10px 12px",
    boxShadow: "0 4px 12px rgba(15, 38, 55, 0.04)",
  },
  kpiLabel: {
    fontSize: 12,
    color: "#607486",
    fontWeight: 800,
  },
  kpiValue: {
    marginTop: 5,
    fontSize: 18,
    fontWeight: 900,
    color: "#0f2637",
  },
  kpiHint: {
    marginTop: 4,
    color: "#6b7f90",
    fontSize: 11,
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
  managerReviewStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginBottom: 12,
  },
  reviewBlock: {
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 14,
    boxShadow: "0 8px 20px rgba(15, 38, 55, 0.04)",
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
  previewPanel: {
    display: "grid",
    gap: 10,
    background: "#ffffff",
    border: "1px solid #dce5ec",
    borderRadius: 8,
    padding: 14,
    boxShadow: "0 8px 20px rgba(15, 38, 55, 0.04)",
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
