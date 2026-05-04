type SmartAlertType = "warning" | "info" | "critical";

type MetricsLike = {
  totals?: {
    revenue?: number;
    collections?: number;
    expenses?: number;
    netProfit?: number;
  };
  transactions?: number;
  pendingClosings?: number;
};

type GroupedDataLike = Array<{
  name?: string;
  transactions?: number;
}>;

export type SmartAlert = {
  id: string;
  type: SmartAlertType;
  title: string;
  message: string;
};

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function getSmartAlerts({
  metrics,
  previousMetrics,
  groupedData,
}: {
  metrics: MetricsLike;
  previousMetrics?: MetricsLike;
  groupedData: GroupedDataLike;
}): SmartAlert[] {
  const alerts: SmartAlert[] = [];

  const revenue = safeNumber(metrics.totals?.revenue);
  const previousRevenue = safeNumber(previousMetrics?.totals?.revenue);
  if (previousRevenue > 0 && revenue < previousRevenue * 0.8) {
    const drop = (previousRevenue - revenue) / previousRevenue;
    alerts.push({
      id: "revenue-drop",
      type: drop >= 0.35 ? "critical" : "warning",
      title: "Revenue Drop",
      message: `Revenue is down ${pct(drop)} compared with the previous matching period.`,
    });
  }

  const expenses = safeNumber(metrics.totals?.expenses);
  const previousExpenses = safeNumber(previousMetrics?.totals?.expenses);
  if (previousExpenses > 0 && expenses > previousExpenses * 1.3) {
    const increase = (expenses - previousExpenses) / previousExpenses;
    alerts.push({
      id: "expense-spike",
      type: increase >= 0.6 ? "critical" : "warning",
      title: "Expense Spike",
      message: `Expenses increased ${pct(increase)} compared with the previous matching period.`,
    });
  }

  const inactiveDepartments = groupedData.filter((row) => safeNumber(row.transactions) === 0);
  if (inactiveDepartments.length > 0) {
    const names = inactiveDepartments
      .map((row) => row.name || "Unnamed department")
      .slice(0, 4)
      .join(", ");
    const suffix = inactiveDepartments.length > 4 ? ` and ${inactiveDepartments.length - 4} more` : "";
    alerts.push({
      id: "inactive-departments",
      type: "info",
      title: "Inactive Department",
      message: `${names}${suffix} recorded no transactions in this period.`,
    });
  }

  const collections = safeNumber(metrics.totals?.collections);
  const imbalance = Math.abs(revenue - collections);
  const imbalanceRatio = revenue > 0 ? imbalance / revenue : 0;
  if (revenue > 0 && imbalanceRatio >= 0.1) {
    alerts.push({
      id: "cash-imbalance",
      type: imbalanceRatio >= 0.25 ? "critical" : "warning",
      title: "Cash Imbalance",
      message: `Collections differ from revenue by ${pct(imbalanceRatio)}. Review cash desk and room folio activity.`,
    });
  }

  const pendingClosings = safeNumber(metrics.pendingClosings);
  if (pendingClosings > 5) {
    alerts.push({
      id: "pending-closings",
      type: pendingClosings > 10 ? "critical" : "warning",
      title: "Pending Closings",
      message: `${pendingClosings} cash desk closings are pending review.`,
    });
  }

  return alerts;
}
