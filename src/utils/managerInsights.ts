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
  const insights: ManagerInsight[] = [];
  const revenue = safeNumber(metrics.totals?.revenue);
  const collections = safeNumber(metrics.totals?.collections);
  const expenses = safeNumber(metrics.totals?.expenses);
  const previousRevenue = safeNumber(previousMetrics?.totals?.revenue);

  const activeRows = groupedRows.filter((row) => safeNumber(row.transactions) > 0);
  const topRevenue = [...activeRows].sort((a, b) => safeNumber(b.revenue) - safeNumber(a.revenue))[0];
  const topProfit = [...activeRows].sort((a, b) => safeNumber(b.netProfit) - safeNumber(a.netProfit))[0];
  const lossRow = activeRows.find((row) => safeNumber(row.revenue) > 0 && safeNumber(row.netProfit) < 0);
  const inactiveCount = groupedRows.filter((row) => safeNumber(row.transactions) === 0).length;

  if (topRevenue && safeNumber(topRevenue.revenue) > 0) {
    insights.push({
      id: "top-revenue",
      type: "positive",
      title: "Top Revenue Contributor",
      message: `Data shows ${label(topRevenue)} contributed the highest revenue for ${dateLabel}.`,
    });
  }

  if (topProfit && safeNumber(topProfit.netProfit) > 0) {
    insights.push({
      id: "top-profit",
      type: "positive",
      title: "Highest Net Profit",
      message: `Data shows ${label(topProfit)} contributed the strongest net profit in the selected range.`,
    });
  }

  if (lossRow) {
    insights.push({
      id: "loss-row",
      type: "risk",
      title: "Loss-Making Activity",
      message: `${label(lossRow)} generated revenue but is operating at a loss. This may indicate cost pressure or reconciliation timing.`,
    });
  }

  if (revenue > 0 && revenue > collections) {
    const gapRatio = (revenue - collections) / revenue;
    if (gapRatio >= 0.1) {
      insights.push({
        id: "collection-gap",
        type: gapRatio >= 0.2 ? "risk" : "warning",
        title: "Collection Gap",
        message: `Data shows collections are ${pct(gapRatio)} below revenue. Management may review unpaid balances and room postings.`,
      });
    }
  }

  if (revenue > 0 && expenses / revenue >= 0.6) {
    insights.push({
      id: "expense-pressure",
      type: expenses > revenue ? "risk" : "warning",
      title: "Expense Pressure",
      message: `Data shows expenses are ${pct(expenses / revenue)} of revenue. Management may review major cost categories.`,
    });
  }

  if (inactiveCount > 0) {
    insights.push({
      id: "inactive-groups",
      type: "neutral",
      title: "Inactive Groups",
      message: `${inactiveCount} group${inactiveCount === 1 ? "" : "s"} recorded no transactions. Management may confirm operational status or missing entries.`,
    });
  }

  if (previousRevenue > 0) {
    const change = (revenue - previousRevenue) / previousRevenue;
    if (Math.abs(change) >= 0.1) {
      insights.push({
        id: "revenue-change",
        type: change >= 0 ? "positive" : "warning",
        title: "Revenue Change",
        message: `Data shows revenue is ${change >= 0 ? "up" : "down"} ${pct(Math.abs(change))} versus the previous matching period.`,
      });
    }
  }

  if (alerts.some((alert) => alert.type === "critical")) {
    insights.push({
      id: "critical-alerts",
      type: "risk",
      title: "Priority Review Needed",
      message: "Data shows one or more high-priority alerts. Management may review the related source records.",
    });
  }

  return insights.slice(0, 6);
}
