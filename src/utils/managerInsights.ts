import type { SmartAlert } from "./smartAlerts";

type InsightType = "positive" | "warning" | "risk" | "neutral";

type MetricsLike = {
  totals?: {
    revenue?: number;
    collections?: number;
    expenses?: number;
    netProfit?: number;
  };
  transactions?: number;
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

type InsightCandidate = ManagerInsight & {
  idea: string;
  importance: number;
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

function typePriority(type: InsightType) {
  if (type === "risk") return 0;
  if (type === "warning") return 1;
  if (type === "positive") return 2;
  return 3;
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
  const expenses = safeNumber(metrics.totals?.expenses);
  const netProfit = safeNumber(metrics.totals?.netProfit);
  const transactions = safeNumber(metrics.transactions);
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
