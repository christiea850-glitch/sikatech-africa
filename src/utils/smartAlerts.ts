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
  key?: string;
  name?: string;
  revenue?: number;
  expenses?: number;
  netProfit?: number;
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

function money(value: number) {
  return safeNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function groupLabel(row: GroupedDataLike[number]) {
  return String(row.name || row.key || "Unassigned group").trim() || "Unassigned group";
}

function alertPriority(type: SmartAlertType) {
  if (type === "critical") return 0;
  if (type === "warning") return 1;
  return 2;
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
  const seen = new Set<string>();

  function pushAlert(alert: SmartAlert) {
    if (seen.has(alert.id)) return;
    seen.add(alert.id);
    alerts.push(alert);
  }

  const revenue = safeNumber(metrics.totals?.revenue);
  const previousRevenue = safeNumber(previousMetrics?.totals?.revenue);
  if (previousRevenue > 0 && revenue < previousRevenue * 0.8) {
    const drop = (previousRevenue - revenue) / previousRevenue;
    pushAlert({
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
    pushAlert({
      id: "expense-spike",
      type: increase >= 0.6 ? "critical" : "warning",
      title: "Expense Spike",
      message: `Expenses increased ${pct(increase)} compared with the previous matching period.`,
    });
  }

  const inactiveDepartments = groupedData.filter((row) => safeNumber(row.transactions) === 0);
  if (inactiveDepartments.length > 0) {
    const names = inactiveDepartments
      .map(groupLabel)
      .slice(0, 4)
      .join(", ");
    const suffix = inactiveDepartments.length > 4 ? ` and ${inactiveDepartments.length - 4} more` : "";
    pushAlert({
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
    pushAlert({
      id: "cash-imbalance",
      type: imbalanceRatio >= 0.25 ? "critical" : "warning",
      title: "Cash Imbalance",
      message: `Collections differ from revenue by ${pct(imbalanceRatio)}. Review cash desk and room folio activity.`,
    });
  }

  const pendingClosings = safeNumber(metrics.pendingClosings);
  if (pendingClosings > 5) {
    pushAlert({
      id: "pending-closings",
      type: pendingClosings > 10 ? "critical" : "warning",
      title: "Pending Closings",
      message: `${pendingClosings} cash desk closings are pending review.`,
    });
  }

  const profitableGroups = groupedData
    .filter((row) => safeNumber(row.netProfit) > 0)
    .sort((a, b) => safeNumber(b.netProfit) - safeNumber(a.netProfit));

  groupedData.forEach((row) => {
    const groupName = groupLabel(row);
    const groupKey = String(row.key || groupName).toLowerCase();
    const groupRevenue = safeNumber(row.revenue);
    const groupExpenses = safeNumber(row.expenses);
    const groupNetProfit = safeNumber(row.netProfit);

    if (groupRevenue > 0 && groupNetProfit < 0) {
      pushAlert({
        id: `loss-detected:${groupKey}`,
        type: "critical",
        title: "Loss Detected",
        message: `${groupName} generated revenue but is operating at a loss of ${money(Math.abs(groupNetProfit))}.`,
      });
    }

    if (groupRevenue > 0 && groupNetProfit / groupRevenue < 0.15) {
      pushAlert({
        id: `low-profit-margin:${groupKey}`,
        type: "warning",
        title: "Low Profit Margin",
        message: `${groupName} profit margin is below 15%.`,
      });
    }

    if (groupExpenses > groupRevenue) {
      pushAlert({
        id: `expenses-exceed-revenue:${groupKey}`,
        type: "critical",
        title: "Expenses Exceed Revenue",
        message: `${groupName} expenses are higher than revenue.`,
      });
    }
  });

  const topPerformer = profitableGroups[0];
  if (topPerformer) {
    const groupName = groupLabel(topPerformer);
    const groupKey = String(topPerformer.key || groupName).toLowerCase();
    pushAlert({
      id: `top-performer:${groupKey}`,
      type: "info",
      title: "Top Performer",
      message: `${groupName} contributed the highest net profit in this period.`,
    });
  }

  return alerts.sort(
    (a, b) => alertPriority(a.type) - alertPriority(b.type) || a.title.localeCompare(b.title)
  );
}
