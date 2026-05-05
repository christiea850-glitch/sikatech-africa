type SmartAlertType = "warning" | "info" | "critical";

type MetricsLike = {
  totals?: {
    revenue?: number;
    collections?: number;
    cashCollections?: number;
    expenses?: number;
    netProfit?: number;
  };
  groupBy?: string;
  transactions?: number;
  pendingClosings?: number;
};

type GroupedDataLike = Array<{
  key?: string;
  name?: string;
  revenue?: number;
  expenses?: number;
  collections?: number;
  cashCollections?: number;
  netProfit?: number;
  transactions?: number;
}>;

export type SmartAlert = {
  id: string;
  type: SmartAlertType;
  title: string;
  message: string;
  recommendation?: string;
  reviewPath?: string;
  reviewLabel?: string;
  relatedGroup?: string;
  relatedMetric?: string;
  relatedValues?: {
    revenue?: number;
    collections?: number;
    expenses?: number;
    netProfit?: number;
    transactions?: number;
    cashCollections?: number;
    previousRevenue?: number;
    previousExpenses?: number;
    pendingClosings?: number;
    percent?: number;
  };
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

function groupValues(row: GroupedDataLike[number]) {
  return {
    revenue: safeNumber(row.revenue),
    collections: safeNumber(row.collections),
    expenses: safeNumber(row.expenses),
    netProfit: safeNumber(row.netProfit),
    transactions: safeNumber(row.transactions),
    cashCollections: safeNumber(row.cashCollections),
  };
}

// Rule-based business intelligence from live metrics; this is not an AI model yet.
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
      relatedMetric: "Revenue",
      relatedValues: {
        revenue,
        previousRevenue,
        percent: drop,
        transactions: safeNumber(metrics.transactions),
      },
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
      relatedMetric: "Expenses",
      relatedValues: {
        expenses,
        previousExpenses,
        percent: increase,
      },
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
      recommendation: "Confirm operational status or check for missing entries.",
      reviewPath: "/app/dashboard",
      reviewLabel: "Review Department Performance",
      relatedGroup: names,
      relatedMetric: "Transactions",
      relatedValues: {
        transactions: 0,
      },
    });
  }

  const collections = safeNumber(metrics.totals?.collections);
  const cashCollections = safeNumber(metrics.totals?.cashCollections);
  const cashShare = collections > 0 ? cashCollections / collections : 0;
  if (cashShare > 0.7) {
    pushAlert({
      id: "high-cash-dependency",
      type: "warning",
      title: "High Cash Dependency",
      message: `Cash represents ${pct(cashShare)} of collections. High cash usage may increase reconciliation risk.`,
      recommendation: "Encourage digital payments and strengthen cash control procedures.",
      reviewPath: "/app/sales-dashboard",
      reviewLabel: "Review Payment and Cash Activity",
      relatedMetric: "Cash Collections",
      relatedValues: {
        collections,
        cashCollections,
        percent: cashShare,
      },
    });
  }

  const imbalance = Math.abs(revenue - collections);
  const imbalanceRatio = revenue > 0 ? imbalance / revenue : 0;
  if (revenue > 0 && imbalanceRatio >= 0.1) {
    pushAlert({
      id: "cash-imbalance",
      type: imbalanceRatio >= 0.25 ? "critical" : "warning",
      title: "Cash Imbalance",
      message: `Collections differ from revenue by ${pct(imbalanceRatio)}. This requires reconciliation review.`,
      recommendation: "Compare cash desk totals with ledger entries and verify manual adjustments.",
      reviewPath: "/app/sales-dashboard",
      reviewLabel: "Review Sales Summary",
      relatedMetric: "Revenue vs Collections",
      relatedValues: {
        revenue,
        collections,
        cashCollections,
        percent: imbalanceRatio,
      },
    });
  }

  const collectionGap = revenue - collections;
  const collectionGapRatio = revenue > 0 ? collectionGap / revenue : 0;
  if (revenue > 0 && collectionGapRatio > 0.2) {
    pushAlert({
      id: "collection-gap-detected",
      type: collectionGapRatio >= 0.4 ? "critical" : "warning",
      title: "Collection Gap Detected",
      message: `Revenue is higher than collections by ${money(collectionGap)}. This may indicate unpaid balances, room postings, or pending reconciliation.`,
      recommendation: "Review unpaid room balances, POS payments, and shift closing records.",
      reviewPath: "/app/frontdesk",
      reviewLabel: "Review Front Desk / Room Balances",
      relatedMetric: "Collection Gap",
      relatedValues: {
        revenue,
        collections,
        cashCollections,
        percent: collectionGapRatio,
      },
    });
  }

  const pendingClosings = safeNumber(metrics.pendingClosings);
  if (pendingClosings > 5) {
    pushAlert({
      id: "pending-closings",
      type: pendingClosings > 10 ? "critical" : "warning",
      title: "Pending Closings",
      message: `${pendingClosings} shift closings are pending review.`,
      recommendation: "Complete and verify all shift closing processes.",
      reviewPath: "/app/cash-desk-closings",
      reviewLabel: "Review Cash Desk Closings",
      relatedMetric: "Pending Closings",
      relatedValues: {
        pendingClosings,
      },
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
    const groupCollections = safeNumber(row.collections);
    const groupCashCollections = safeNumber(row.cashCollections);
    const groupNetProfit = safeNumber(row.netProfit);

    if (groupRevenue > 0 && groupNetProfit < 0) {
      pushAlert({
        id: `loss-detected:${groupKey}`,
        type: "critical",
        title: "Loss Detected",
        message: `${groupName} generated revenue but is operating at a loss of ${money(Math.abs(groupNetProfit))}.`,
        reviewPath: "/app/sales-dashboard",
        reviewLabel: "Review Financial Performance",
        relatedGroup: groupName,
        relatedMetric: "Net Profit",
        relatedValues: groupValues(row),
      });
    }

    if (groupRevenue > 0 && groupNetProfit / groupRevenue < 0.15) {
      pushAlert({
        id: `low-profit-margin:${groupKey}`,
        type: "warning",
        title: "Low Profit Margin",
        message: `${groupName} profit margin is below 15%.`,
        reviewPath: "/app/sales-dashboard",
        reviewLabel: "Review Financial Performance",
        relatedGroup: groupName,
        relatedMetric: "Profit Margin",
        relatedValues: {
          ...groupValues(row),
          percent: groupRevenue > 0 ? groupNetProfit / groupRevenue : 0,
        },
      });
    }

    if (groupExpenses > groupRevenue) {
      pushAlert({
        id: `expenses-exceed-revenue:${groupKey}`,
        type: "critical",
        title: "Expenses Exceed Revenue",
        message: `${groupName} expenses are higher than revenue.`,
        reviewPath: "/app/sales-dashboard",
        reviewLabel: "Review Financial Performance",
        relatedGroup: groupName,
        relatedMetric: "Expenses vs Revenue",
        relatedValues: groupValues(row),
      });
    }

    if (metrics.groupBy === "department" && groupRevenue > 0 && groupCollections / groupRevenue < 0.8) {
      pushAlert({
        id: `department-collection-gap:${groupKey}`,
        type: groupCollections / groupRevenue < 0.55 ? "critical" : "warning",
        title: "Department Collection Gap",
        message: `${groupName} has revenue of ${money(groupRevenue)} but collections of ${money(groupCollections)}.`,
        relatedGroup: groupName,
        relatedMetric: "Department Collections",
        relatedValues: groupValues(row),
      });
    }

    if (groupCashCollections > 0 && groupNetProfit < 0) {
      pushAlert({
        id: `cash-leakage-risk:${groupKey}`,
        type: "critical",
        title: "Cash Leakage Risk",
        message: `${groupName} collected cash but shows negative net profit. This may indicate cost or reconciliation issues.`,
        recommendation: "Review expenses, discounts, voided sales, and operational records.",
        reviewPath: "/app/sales-dashboard",
        reviewLabel: "Review Payment and Cash Activity",
        relatedGroup: groupName,
        relatedMetric: "Cash Collections and Net Profit",
        relatedValues: groupValues(row),
      });
    }
  });

  if (metrics.groupBy === "staff") {
    const staffRowsWithCash = groupedData.filter((row) => safeNumber(row.cashCollections) > 0);
    const staffCashTotal = staffRowsWithCash.reduce(
      (sum, row) => sum + safeNumber(row.cashCollections),
      0
    );
    const topStaff = staffRowsWithCash.sort(
      (a, b) => safeNumber(b.cashCollections) - safeNumber(a.cashCollections)
    )[0];
    const averageStaffCash = staffRowsWithCash.length > 0 ? staffCashTotal / staffRowsWithCash.length : 0;

    if (
      topStaff &&
      staffCashTotal > 0 &&
      safeNumber(topStaff.cashCollections) / staffCashTotal >= 0.45 &&
      safeNumber(topStaff.cashCollections) >= averageStaffCash * 1.8
    ) {
      const staffName = groupLabel(topStaff);
      const staffKey = String(topStaff.key || staffName).toLowerCase();
      pushAlert({
        id: `staff-cash-concentration:${staffKey}`,
        type: "warning",
        title: "Staff Cash Concentration",
        message: `${staffName} handled a high share of cash collections in this period.`,
        recommendation: "Review shift logs, approvals, and workload distribution.",
        reviewPath: "/app/sales-dashboard",
        reviewLabel: "Review Payment and Cash Activity",
        relatedGroup: staffName,
        relatedMetric: "Staff Cash Collections",
        relatedValues: {
          ...groupValues(topStaff),
          percent: safeNumber(topStaff.cashCollections) / staffCashTotal,
        },
      });
    }
  }

  const topPerformer = profitableGroups[0];
  if (topPerformer) {
    const groupName = groupLabel(topPerformer);
    const groupKey = String(topPerformer.key || groupName).toLowerCase();
    pushAlert({
      id: `top-performer:${groupKey}`,
      type: "info",
      title: "Top Performer",
      message: `${groupName} contributed the highest net profit in this period.`,
      relatedGroup: groupName,
      relatedMetric: "Net Profit",
      relatedValues: groupValues(topPerformer),
    });
  }

  return alerts.sort(
    (a, b) => alertPriority(a.type) - alertPriority(b.type) || a.title.localeCompare(b.title)
  );
}
