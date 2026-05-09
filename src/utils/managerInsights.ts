import type { SmartAlert } from "./smartAlerts";

type InsightType = "positive" | "warning" | "risk" | "neutral";
export type ManagerExecutiveBriefTone = "healthy" | "watch" | "risk" | "opportunity";
export type ManagerExecutiveBriefTargetView =
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

type MetricsLike = {
  totals?: {
    revenue?: number;
    collections?: number;
    cashCollections?: number;
    expenses?: number;
    netProfit?: number;
  };
  transactions?: number;
  pendingClosings?: number;
};

type GroupedRowLike = {
  key?: string;
  name?: string;
  revenue?: number;
  expenses?: number;
  collections?: number;
  netProfit?: number;
  transactions?: number;
};

export type ManagerInsight = {
  id: string;
  type: InsightType;
  title: string;
  message: string;
};

export type ManagerExecutiveBriefCard = {
  id: string;
  title: string;
  text: string;
  tone: ManagerExecutiveBriefTone;
  riskLevel: string;
  whyFlagged: string;
  keyNumbers: Array<{ label: string; value: string }>;
  recommendedAction: string;
  sourceArea: string;
  targetView: ManagerExecutiveBriefTargetView;
};

type InsightCandidate = ManagerInsight & {
  idea: string;
  importance: number;
};

type ExecutiveBriefInput = Pick<ManagerExecutiveBriefCard, "id" | "text" | "tone"> &
  Partial<Omit<ManagerExecutiveBriefCard, "id" | "text" | "tone">> & {
    importance: number;
  };

type ExecutiveBriefCandidate = ManagerExecutiveBriefCard & {
  importance: number;
};

type DepartmentSignalLike = {
  name?: string;
  total?: number;
  transactions?: number;
  status?: string;
};

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function label(row: GroupedRowLike) {
  return String(row.name || row.key || "Selected group").trim() || "Selected group";
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function money(value: number) {
  return safeNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function typePriority(type: InsightType) {
  if (type === "risk") return 0;
  if (type === "warning") return 1;
  if (type === "positive") return 2;
  return 3;
}

function briefTonePriority(tone: ManagerExecutiveBriefTone) {
  if (tone === "risk") return 0;
  if (tone === "watch") return 1;
  if (tone === "opportunity") return 2;
  return 3;
}

export function getManagerExecutiveBriefCards({
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
}: {
  metrics: MetricsLike;
  previousMetrics?: MetricsLike;
  alerts: SmartAlert[];
  insights: ManagerInsight[];
  departmentPerformance: DepartmentSignalLike[];
  strongestDepartment: DepartmentSignalLike | null;
  weakestDepartment: DepartmentSignalLike | null;
  receivablesTotal: number;
  collectionPercent: number;
  collectionGap: number;
  pendingClosings: unknown[];
  openShifts: unknown[];
  unpaidBookings: unknown[];
  revenueChange: number;
  revenueChangePercent: number;
}): ManagerExecutiveBriefCard[] {
  const cards: ExecutiveBriefCandidate[] = [];
  const usedIds = new Set<string>();
  const addCard = (card: ExecutiveBriefInput) => {
    if (usedIds.has(card.id)) return;
    usedIds.add(card.id);
    cards.push({
      ...card,
      title: card.title || "Manager Insight",
      riskLevel: card.riskLevel || card.tone,
      whyFlagged: card.whyFlagged || card.text,
      keyNumbers: card.keyNumbers || [],
      recommendedAction:
        card.recommendedAction || "Review the related manager dashboard panel for supporting context.",
      sourceArea: card.sourceArea || "Manager dashboard",
      targetView: card.targetView || "overview",
    });
  };

  const revenue = safeNumber(metrics.totals?.revenue);
  const previousRevenue = safeNumber(previousMetrics?.totals?.revenue);
  const expenses = safeNumber(metrics.totals?.expenses);
  const netProfit = safeNumber(metrics.totals?.netProfit);
  const transactions = safeNumber(metrics.transactions);
  const lowData = transactions > 0 && transactions < 3;
  const hasActivity = transactions > 0;
  const activeDepartments = departmentPerformance.filter(
    (department) => safeNumber(department.transactions) > 0
  ).length;
  const quietDepartments = departmentPerformance.filter(
    (department) => safeNumber(department.transactions) === 0
  ).length;
  const criticalAlerts = alerts.filter((alert) => alert.type === "critical");
  const warningAlerts = alerts.filter((alert) => alert.type === "warning");
  const profitMargin = revenue > 0 ? netProfit / revenue : 0;
  const expenseRatio = revenue > 0 ? expenses / revenue : 0;
  const receivablesRatio = revenue > 0 ? safeNumber(receivablesTotal) / revenue : 0;
  const collectionGapRatio = revenue > 0 ? safeNumber(collectionGap) / revenue : 0;

  if (criticalAlerts.length > 0) {
    const topAlert = criticalAlerts[0];
    addCard({
      id: `critical-alert:${topAlert.id}`,
      title: topAlert.title,
      text: `${topAlert.title}: ${topAlert.message}`,
      tone: "risk",
      riskLevel: "Critical",
      whyFlagged: topAlert.message,
      keyNumbers: [
        { label: "Critical Alerts", value: String(criticalAlerts.length) },
        { label: "Total Alerts", value: String(alerts.length) },
      ],
      recommendedAction: topAlert.recommendation || "Open manager alerts and review the source records.",
      sourceArea: "Alerts",
      targetView: "alerts",
      importance: 120,
    });
  } else if (warningAlerts.length > 0) {
    addCard({
      id: "warning-alerts",
      title: "Warning Alerts",
      text: `${warningAlerts.length} warning alert${warningAlerts.length === 1 ? "" : "s"} need manager review for this range.`,
      tone: "watch",
      riskLevel: "Watch",
      whyFlagged: "One or more warning alerts are active for the selected range.",
      keyNumbers: [
        { label: "Warning Alerts", value: String(warningAlerts.length) },
        { label: "Total Alerts", value: String(alerts.length) },
      ],
      recommendedAction: "Open manager alerts and resolve the highest-impact warning first.",
      sourceArea: "Alerts",
      targetView: "alerts",
      importance: 94,
    });
  }

  if (!hasActivity) {
    addCard({
      id: "low-activity:none",
      title: "Low Activity Period",
      text: "No transactions are visible in this range, so trend signals should be treated as incomplete until entries are confirmed.",
      tone: "watch",
      riskLevel: "Watch",
      whyFlagged: "The selected range has no ledger transactions, limiting trend confidence.",
      keyNumbers: [{ label: "Transactions", value: "0" }],
      recommendedAction: "Confirm whether operations were inactive or whether entries are pending.",
      sourceArea: "Ledger",
      targetView: "overview",
      importance: 118,
    });
  } else if (lowData) {
    addCard({
      id: "low-activity:limited",
      title: "Limited Activity Signal",
      text: `Only ${transactions} transaction${transactions === 1 ? "" : "s"} are visible, so manager insights should be read as early signals rather than firm trends.`,
      tone: "watch",
      riskLevel: "Watch",
      whyFlagged: "The selected range has too few transactions for strong trend confidence.",
      keyNumbers: [{ label: "Transactions", value: String(transactions) }],
      recommendedAction: "Use the overview as a preliminary read and confirm source entries.",
      sourceArea: "Ledger",
      targetView: "overview",
      importance: 108,
    });
  }

  if (hasActivity && revenue > 0) {
    const absChangePercent = Math.abs(safeNumber(revenueChangePercent));
    if (previousRevenue <= 0) {
      addCard({
        id: "revenue:new-activity",
        title: "Revenue Baseline",
        text: `Revenue is ${money(revenue)} with no prior matching revenue baseline available.`,
        tone: "opportunity",
        riskLevel: "Opportunity",
        whyFlagged: "Current revenue exists, but the prior matching period has no revenue baseline.",
        keyNumbers: [
          { label: "Revenue", value: money(revenue) },
          { label: "Prior Revenue", value: money(previousRevenue) },
        ],
        recommendedAction: "Review sales summary to establish the new performance baseline.",
        sourceArea: "Ledger",
        targetView: "sales-summary",
        importance: lowData ? 44 : 72,
      });
    } else if (Math.abs(safeNumber(revenueChange)) <= Math.max(1, previousRevenue * 0.02)) {
      addCard({
        id: "revenue:flat",
        title: "Revenue Steady",
        text: "Revenue is broadly flat compared with the prior matching range.",
        tone: "healthy",
        riskLevel: "Healthy",
        whyFlagged: "Revenue movement is within a small tolerance of the prior matching period.",
        keyNumbers: [
          { label: "Revenue", value: money(revenue) },
          { label: "Change", value: `${safeNumber(revenueChangePercent).toFixed(0)}%` },
        ],
        recommendedAction: "Use sales summary to compare supporting groups if needed.",
        sourceArea: "Ledger",
        targetView: "sales-summary",
        importance: lowData ? 36 : 64,
      });
    } else {
      const revenueUp = safeNumber(revenueChange) > 0;
      addCard({
        id: revenueUp ? "revenue:up" : "revenue:down",
        title: revenueUp ? "Revenue Up" : "Revenue Down",
        text: `Revenue is ${revenueUp ? "up" : "down"} ${absChangePercent.toFixed(0)}% compared with the prior matching range.`,
        tone: revenueUp ? "opportunity" : "watch",
        riskLevel: revenueUp ? "Opportunity" : "Watch",
        whyFlagged: "Revenue moved materially against the prior matching period.",
        keyNumbers: [
          { label: "Revenue", value: money(revenue) },
          { label: "Prior Revenue", value: money(previousRevenue) },
          { label: "Change", value: `${absChangePercent.toFixed(0)}%` },
        ],
        recommendedAction: revenueUp
          ? "Review sales summary to understand which group is driving the gain."
          : "Review sales summary and supporting groups to locate the drop.",
        sourceArea: "Ledger",
        targetView: "sales-summary",
        importance: lowData ? 48 : revenueUp ? 76 : 92,
      });
    }
  }

  if (hasActivity && revenue > 0) {
    if (collectionGapRatio >= 0.2 || receivablesRatio >= 0.2) {
      addCard({
        id: "collections:pressure",
        title: "Collection Pressure",
        text: `${money(safeNumber(receivablesTotal))} in receivables and ${money(safeNumber(collectionGap))} in collection gap are visible for this range.`,
        tone: collectionGapRatio >= 0.35 || receivablesRatio >= 0.35 ? "risk" : "watch",
        riskLevel: collectionGapRatio >= 0.35 || receivablesRatio >= 0.35 ? "Risk" : "Watch",
        whyFlagged: "Collections and/or receivables are materially behind recorded revenue.",
        keyNumbers: [
          { label: "Receivables", value: money(safeNumber(receivablesTotal)) },
          { label: "Collection Gap", value: money(safeNumber(collectionGap)) },
          { label: "Collection Coverage", value: `${safeNumber(collectionPercent).toFixed(0)}%` },
          { label: "Unpaid Balances", value: String(unpaidBookings.length) },
        ],
        recommendedAction: "Open front desk status and review unpaid balances against collections.",
        sourceArea: "Bookings / Ledger",
        targetView: "front-desk",
        importance: lowData ? 58 : 98,
      });
    } else if (safeNumber(collectionPercent) >= 90 && safeNumber(receivablesTotal) === 0) {
      addCard({
        id: "collections:healthy",
        title: "Collections Healthy",
        text: "Collections remain healthy with low receivable pressure.",
        tone: "healthy",
        riskLevel: "Healthy",
        whyFlagged: "Collections cover most revenue and receivables are not pressuring this range.",
        keyNumbers: [
          { label: "Collection Coverage", value: `${safeNumber(collectionPercent).toFixed(0)}%` },
          { label: "Receivables", value: money(safeNumber(receivablesTotal)) },
        ],
        recommendedAction: "Keep monitoring payment follow-through in sales summary.",
        sourceArea: "Ledger",
        targetView: "sales-summary",
        importance: lowData ? 30 : 58,
      });
    } else if (safeNumber(collectionPercent) >= 70) {
      addCard({
        id: "collections:watch",
        title: "Collections Watch",
        text: "Collections cover most recorded revenue, but receivables remain visible.",
        tone: "watch",
        riskLevel: "Watch",
        whyFlagged: "Collection coverage is acceptable, but unpaid balances remain visible.",
        keyNumbers: [
          { label: "Collection Coverage", value: `${safeNumber(collectionPercent).toFixed(0)}%` },
          { label: "Receivables", value: money(safeNumber(receivablesTotal)) },
        ],
        recommendedAction: "Review front desk balances and confirm expected settlements.",
        sourceArea: "Bookings / Ledger",
        targetView: "front-desk",
        importance: lowData ? 42 : 70,
      });
    }
  }

  if (hasActivity && revenue > 0) {
    if (netProfit < 0) {
      addCard({
        id: "profit:negative",
        title: "Negative Profit",
        text: `Net profit is negative at ${money(netProfit)}. Management may review expenses, discounts, and reconciliation timing.`,
        tone: "risk",
        riskLevel: "Risk",
        whyFlagged: "Recorded expenses exceed revenue for the selected range.",
        keyNumbers: [
          { label: "Revenue", value: money(revenue) },
          { label: "Expenses", value: money(expenses) },
          { label: "Net Profit", value: money(netProfit) },
        ],
        recommendedAction: "Open sales summary and compare expenses, revenue, and net profit by group.",
        sourceArea: "Ledger / Expenses",
        targetView: "sales-summary",
        importance: lowData ? 64 : 104,
      });
    } else if (profitMargin < 0.12) {
      addCard({
        id: "profit:low-margin",
        title: "Low Profit Margin",
        text: `Net profit margin is ${pct(profitMargin)}, which may indicate cost pressure or thin operating returns.`,
        tone: "watch",
        riskLevel: "Watch",
        whyFlagged: "Profit exists, but margin is below the manager watch threshold.",
        keyNumbers: [
          { label: "Net Profit", value: money(netProfit) },
          { label: "Profit Margin", value: pct(profitMargin) },
          { label: "Expenses", value: money(expenses) },
        ],
        recommendedAction: "Review grouped performance for low-margin departments or payment groups.",
        sourceArea: "Ledger / Expenses",
        targetView: "sales-summary",
        importance: lowData ? 46 : 82,
      });
    } else {
      addCard({
        id: "profit:healthy",
        title: "Profit Healthy",
        text: `Net profit margin is ${pct(profitMargin)}, keeping the operating read healthy for this range.`,
        tone: "healthy",
        riskLevel: "Healthy",
        whyFlagged: "Revenue and expenses produce a healthy positive margin.",
        keyNumbers: [
          { label: "Net Profit", value: money(netProfit) },
          { label: "Profit Margin", value: pct(profitMargin) },
        ],
        recommendedAction: "Use sales summary to preserve the groups driving margin.",
        sourceArea: "Ledger",
        targetView: "sales-summary",
        importance: lowData ? 28 : 52,
      });
    }
  }

  if (hasActivity && revenue > 0 && expenseRatio >= 0.6) {
    addCard({
      id: "expenses:pressure",
      title: "Expense Pressure",
      text: `Expenses are ${pct(expenseRatio)} of revenue, so cost control should stay on the manager watch list.`,
      tone: expenseRatio >= 1 ? "risk" : "watch",
      riskLevel: expenseRatio >= 1 ? "Risk" : "Watch",
      whyFlagged: "Expense ratio is high relative to revenue.",
      keyNumbers: [
        { label: "Expenses", value: money(expenses) },
        { label: "Revenue", value: money(revenue) },
        { label: "Expense Ratio", value: pct(expenseRatio) },
      ],
      recommendedAction: "Open sales summary and inspect groups where expenses pressure profit.",
      sourceArea: "Expenses / Ledger",
      targetView: "sales-summary",
      importance: lowData ? 52 : 86,
    });
  }

  if (hasActivity && !lowData && strongestDepartment) {
    addCard({
      id: `department:strongest:${strongestDepartment.name || "unknown"}`,
      title: "Strongest Department",
      text: `${strongestDepartment.name || "The leading department"} is the strongest department signal in this period.`,
      tone: "opportunity",
      riskLevel: "Opportunity",
      whyFlagged: "This department leads the active department ranking for the selected range.",
      keyNumbers: [
        { label: "Department", value: strongestDepartment.name || "Leading department" },
        { label: "Sales", value: money(safeNumber(strongestDepartment.total)) },
        { label: "Transactions", value: String(safeNumber(strongestDepartment.transactions)) },
      ],
      recommendedAction: "Open department activity to compare the leader against other departments.",
      sourceArea: "Departments / Ledger",
      targetView: "department-activity",
      importance: 68,
    });
  }

  if (hasActivity && !lowData && weakestDepartment) {
    const weakName = weakestDepartment.name || "A department";
    const weakStatus = String(weakestDepartment.status || "").toLowerCase();
    addCard({
      id: `department:weakest:${weakName}`,
      title: "Weakest Department",
      text:
        weakStatus === "needs review"
          ? `${weakName} needs review based on current department and closing signals.`
          : `${weakName} is the weakest department signal and may need manager follow-up.`,
      tone: weakStatus === "needs review" ? "watch" : "watch",
      riskLevel: "Watch",
      whyFlagged: "This department is at the low end of current activity or has review status.",
      keyNumbers: [
        { label: "Department", value: weakName },
        { label: "Sales", value: money(safeNumber(weakestDepartment.total)) },
        { label: "Transactions", value: String(safeNumber(weakestDepartment.transactions)) },
        { label: "Status", value: weakestDepartment.status || "Watch" },
      ],
      recommendedAction: "Open department activity and confirm whether follow-up is needed.",
      sourceArea: "Departments / Closings",
      targetView: "department-activity",
      importance: 66,
    });
  } else if (hasActivity && activeDepartments > 0 && quietDepartments === 0) {
    addCard({
      id: "departments:all-active",
      title: "Departments Active",
      text: "All enabled departments show activity in this range.",
      tone: "healthy",
      riskLevel: "Healthy",
      whyFlagged: "Every enabled department has visible activity in the selected range.",
      keyNumbers: [
        { label: "Active Departments", value: String(activeDepartments) },
        { label: "Quiet Departments", value: "0" },
      ],
      recommendedAction: "Open department activity to compare performance levels.",
      sourceArea: "Departments",
      targetView: "department-activity",
      importance: 42,
    });
  }

  if (quietDepartments > 0 && hasActivity && !lowData) {
    addCard({
      id: "departments:quiet",
      title: "Quiet Departments",
      text: `${quietDepartments} department${quietDepartments === 1 ? "" : "s"} show no activity and may require review.`,
      tone: "watch",
      riskLevel: "Watch",
      whyFlagged: "Some enabled departments have no transactions in the selected range.",
      keyNumbers: [
        { label: "Quiet Departments", value: String(quietDepartments) },
        { label: "Active Departments", value: String(activeDepartments) },
      ],
      recommendedAction: "Open department activity and confirm operational status or missing entries.",
      sourceArea: "Departments / Ledger",
      targetView: "department-activity",
      importance: 74,
    });
  }

  if (pendingClosings.length > 0) {
    addCard({
      id: "closings:pending",
      title: "Pending Closings",
      text: `${pendingClosings.length} pending closing${pendingClosings.length === 1 ? "" : "s"} need cash desk follow-up.`,
      tone: pendingClosings.length >= 5 ? "risk" : "watch",
      riskLevel: pendingClosings.length >= 5 ? "Risk" : "Watch",
      whyFlagged: "One or more shift closings remain pending or reviewed but not fully settled.",
      keyNumbers: [
        { label: "Pending Closings", value: String(pendingClosings.length) },
        { label: "Open Shifts", value: String(openShifts.length) },
      ],
      recommendedAction: "Open cash desk closings and complete manager review.",
      sourceArea: "Closings",
      targetView: "closings",
      importance: pendingClosings.length >= 5 ? 106 : 88,
    });
  } else if (hasActivity && openShifts.length === 0) {
    addCard({
      id: "closings:controlled",
      title: "Closings Controlled",
      text: "Cash desk closing pressure looks controlled for this range.",
      tone: "healthy",
      riskLevel: "Healthy",
      whyFlagged: "No pending closings or open shifts are adding pressure to the current read.",
      keyNumbers: [
        { label: "Pending Closings", value: "0" },
        { label: "Open Shifts", value: "0" },
      ],
      recommendedAction: "Keep monitoring closing status as new shifts complete.",
      sourceArea: "Closings",
      targetView: "closings",
      importance: 40,
    });
  }

  if (unpaidBookings.length > 0 && hasActivity) {
    addCard({
      id: "frontdesk:unpaid-bookings",
      title: "Unpaid Room Balances",
      text: `${unpaidBookings.length} unpaid room balance${unpaidBookings.length === 1 ? "" : "s"} remain visible for manager review.`,
      tone: "watch",
      riskLevel: "Watch",
      whyFlagged: "Front desk bookings include unpaid room balances.",
      keyNumbers: [
        { label: "Unpaid Balances", value: String(unpaidBookings.length) },
        { label: "Receivables", value: money(safeNumber(receivablesTotal)) },
      ],
      recommendedAction: "Open front desk status and reconcile unpaid balances.",
      sourceArea: "Bookings",
      targetView: "front-desk",
      importance: 78,
    });
  }

  if (alerts.length === 0 && insights.length === 0 && hasActivity && !lowData) {
    addCard({
      id: "signals:steady",
      title: "Operating Read Steady",
      text: "No active manager alerts are currently blocking the operating read.",
      tone: "healthy",
      riskLevel: "Healthy",
      whyFlagged: "No active alerts or generated risk insights were found for this range.",
      keyNumbers: [
        { label: "Alerts", value: "0" },
        { label: "Transactions", value: String(transactions) },
      ],
      recommendedAction: "Use overview or sales summary for routine performance review.",
      sourceArea: "Manager dashboard",
      targetView: "overview",
      importance: 38,
    });
  }

  return cards
    .sort((a, b) => briefTonePriority(a.tone) - briefTonePriority(b.tone) || b.importance - a.importance)
    .slice(0, 5)
    .map(({ importance: _importance, ...card }) => card);
}

export function getManagerInsights({
  metrics,
  previousMetrics,
  groupedRows,
  alerts,
  dateLabel,
}: {
  metrics: MetricsLike;
  previousMetrics?: MetricsLike;
  groupedRows: GroupedRowLike[];
  alerts: SmartAlert[];
  dateLabel: string;
}): ManagerInsight[] {
  const insights: InsightCandidate[] = [];
  const usedIdeas = new Set<string>();
  const addInsight = (insight: InsightCandidate) => {
    if (usedIdeas.has(insight.idea)) return;
    usedIdeas.add(insight.idea);
    insights.push(insight);
  };

  const revenue = safeNumber(metrics.totals?.revenue);
  const collections = safeNumber(metrics.totals?.collections);
  const cashCollections = safeNumber(metrics.totals?.cashCollections);
  const expenses = safeNumber(metrics.totals?.expenses);
  const netProfit = safeNumber(metrics.totals?.netProfit);
  const transactions = safeNumber(metrics.transactions);
  const pendingClosings = safeNumber(metrics.pendingClosings);
  const previousRevenue = safeNumber(previousMetrics?.totals?.revenue);

  const activeRows = groupedRows.filter((row) => safeNumber(row.transactions) > 0);
  const topRevenue = [...activeRows].sort((a, b) => safeNumber(b.revenue) - safeNumber(a.revenue))[0];
  const topProfit = [...activeRows].sort((a, b) => safeNumber(b.netProfit) - safeNumber(a.netProfit))[0];
  const lossRow = [...activeRows]
    .filter((row) => safeNumber(row.revenue) > 0 && safeNumber(row.netProfit) < 0)
    .sort((a, b) => safeNumber(a.netProfit) - safeNumber(b.netProfit))[0];
  const inactiveCount = groupedRows.filter((row) => safeNumber(row.transactions) === 0).length;
  const criticalAlerts = alerts.filter((alert) => alert.type === "critical").length;
  const warningAlerts = alerts.filter((alert) => alert.type === "warning").length;
  const collectionGapRatio = revenue > 0 ? Math.max(0, (revenue - collections) / revenue) : 0;
  const collectionVarianceRatio = revenue > 0 ? Math.abs(revenue - collections) / revenue : 0;
  const cashCollectionShare = collections > 0 ? cashCollections / collections : 0;
  const expenseRatio = revenue > 0 ? expenses / revenue : 0;
  const profitMargin = revenue > 0 ? netProfit / revenue : 0;
  const topRevenueAmount = safeNumber(topRevenue?.revenue);
  const topRevenueShare = revenue > 0 ? topRevenueAmount / revenue : 0;
  const topProfitAmount = safeNumber(topProfit?.netProfit);
  const meaningfulProfit = revenue > 0 ? Math.max(1, revenue * 0.08) : 1;

  if (transactions === 0) {
    addInsight({
      id: "low-activity-empty",
      idea: "low-activity",
      importance: 90,
      type: "neutral",
      title: "Low Activity Period",
      message: `Data shows no transactions for ${dateLabel}. Management may confirm whether operations were inactive or entries are pending.`,
    });
  } else if (transactions <= 2) {
    addInsight({
      id: "low-activity",
      idea: "low-activity",
      importance: 75,
      type: "neutral",
      title: "Low Activity Period",
      message: `Data shows only ${transactions} transaction${transactions === 1 ? "" : "s"} for ${dateLabel}. This may indicate a quiet period or incomplete entry activity.`,
    });
  }

  if (topRevenue && topRevenueShare >= 0.65 && activeRows.length > 1) {
    addInsight({
      id: "concentration-risk",
      idea: "revenue-concentration",
      importance: 88,
      type: "warning",
      title: "Concentration Risk",
      message: `Data shows ${label(topRevenue)} contributed ${pct(topRevenueShare)} of revenue. Management may review dependency risk across the business mix.`,
    });
  } else if (topRevenue && topRevenueShare >= 0.4) {
    addInsight({
      id: "top-revenue",
      idea: "top-revenue",
      importance: Math.round(topRevenueShare * 70),
      type: "positive",
      title: "Top Revenue Contributor",
      message: `Data shows ${label(topRevenue)} contributed ${pct(topRevenueShare)} of revenue for ${dateLabel}.`,
    });
  }

  if (topProfit && topProfitAmount >= meaningfulProfit) {
    addInsight({
      id: "top-profit",
      idea: "top-profit",
      importance: Math.round(Math.min(95, 45 + (topProfitAmount / Math.max(revenue, 1)) * 100)),
      type: "positive",
      title: "Highest Net Profit",
      message: `Data shows ${label(topProfit)} contributed the strongest meaningful net profit in the selected range.`,
    });
  }

  if (lossRow) {
    addInsight({
      id: "loss-row",
      idea: "loss-making",
      importance: Math.round(Math.min(100, 70 + Math.abs(safeNumber(lossRow.netProfit)))),
      type: "risk",
      title: "Loss-Making Activity",
      message: `${label(lossRow)} generated revenue but is operating at a loss. This may indicate cost pressure or reconciliation timing.`,
    });
  }

  if (collectionGapRatio >= 0.15) {
    addInsight({
      id: "collection-gap",
      idea: "collection-gap",
      importance: Math.round(60 + collectionGapRatio * 100),
      type: collectionGapRatio >= 0.25 ? "risk" : "warning",
      title: "Collection Gap",
      message: `Data shows collections are ${pct(collectionGapRatio)} below revenue. Management may review unpaid balances, room postings, and reconciliation timing.`,
    });
  }

  if (cashCollectionShare >= 0.7) {
    addInsight({
      id: "cash-dependency",
      idea: "cash-dependency",
      importance: Math.round(62 + cashCollectionShare * 35),
      type: cashCollectionShare >= 0.85 ? "risk" : "warning",
      title: "High Cash Dependency",
      message: `Data shows cash represents ${pct(cashCollectionShare)} of collections. Management may tighten cash controls and encourage traceable payment methods.`,
    });
  }

  if (pendingClosings > 0) {
    addInsight({
      id: "pending-closings",
      idea: "pending-closings",
      importance: Math.min(92, 62 + pendingClosings * 4),
      type: pendingClosings >= 5 ? "risk" : "warning",
      title: "Pending Closings",
      message: `${pendingClosings} shift closing${pendingClosings === 1 ? "" : "s"} still require review before final reporting can be trusted.`,
    });
  }

  if (revenue > 0 && expenseRatio >= 0.65) {
    addInsight({
      id: "expense-pressure",
      idea: "expense-pressure",
      importance: Math.round(55 + expenseRatio * 80),
      type: expenses > revenue ? "risk" : "warning",
      title: "Expense Pressure",
      message: `Data shows expenses are ${pct(expenseRatio)} of revenue. Management may review major cost categories and operating controls.`,
    });
  }

  if (revenue > 0 && netProfit >= 0 && profitMargin < 0.12) {
    addInsight({
      id: "profit-pressure",
      idea: "profit-pressure",
      importance: Math.round(70 - profitMargin * 100),
      type: "warning",
      title: "Profit Pressure",
      message: `Data shows revenue exists but net profit margin is ${pct(profitMargin)}. This may indicate cost pressure or discounting that management may review.`,
    });
  }

  if (inactiveCount > 0 && transactions >= 8) {
    addInsight({
      id: "inactive-groups",
      idea: "inactive-groups",
      importance: Math.min(65, 35 + inactiveCount * 10),
      type: "neutral",
      title: "Inactive Groups",
      message: `${inactiveCount} group${inactiveCount === 1 ? "" : "s"} recorded no transactions. Management may confirm operational status or missing entries.`,
    });
  }

  if (previousRevenue > 0) {
    const change = (revenue - previousRevenue) / previousRevenue;
    if (Math.abs(change) >= 0.15) {
      addInsight({
        id: "revenue-change",
        idea: "revenue-change",
        importance: Math.round(55 + Math.abs(change) * 100),
        type: change >= 0 ? "positive" : "warning",
        title: "Revenue Change",
        message: `Data shows revenue is ${change >= 0 ? "up" : "down"} ${pct(Math.abs(change))} versus the previous matching period.`,
      });
    }
  }

  if (activeRows.length >= 3 && criticalAlerts === 0 && warningAlerts === 0 && collectionGapRatio < 0.08 && expenseRatio < 0.55) {
    addInsight({
      id: "balanced-performance",
      idea: "balanced-performance",
      importance: 50,
      type: "positive",
      title: "Balanced Performance",
      message: "Data shows activity across multiple groups without major risk signals. This may indicate a healthy spread of business activity.",
    });
  }

  if (revenue > 0 && collections > 0 && collectionVarianceRatio <= 0.05) {
    addInsight({
      id: "collection-efficiency",
      idea: "collection-efficiency",
      importance: 48,
      type: "positive",
      title: "Collection Efficiency",
      message: `Data shows collections are closely aligned with revenue. This may indicate strong payment follow-through for ${dateLabel}.`,
    });
  }

  if (criticalAlerts > 0) {
    addInsight({
      id: "critical-alerts",
      idea: "priority-alerts",
      importance: 85,
      type: "risk",
      title: "Priority Review Needed",
      message: "Data shows one or more high-priority alerts. Management may review the related source records.",
    });
  }

  return insights
    .sort((a, b) => typePriority(a.type) - typePriority(b.type) || b.importance - a.importance)
    .slice(0, 5)
    .map(({ idea: _idea, importance: _importance, ...insight }) => insight);
}
