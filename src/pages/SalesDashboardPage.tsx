// src/pages/SalesDashboardPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { useDepartments } from "../departments/DepartmentsContext";
import ClickableCard from "../components/ClickableCard";
import FocusedViewPanel from "../components/FocusedViewPanel";
import {
  handleOpenFocusedView,
  handleCloseFocusedView,
} from "../components/focusedNavigation";
import { normalizeDepartmentKey } from "../lib/departments";
import { formatShiftStatus } from "../lib/shiftTrace";
import {
  hasAccountingDateRange,
  loadAccountingDateRange,
  saveAccountingDateRange,
} from "../accounting/accountingDateRangeStorage";
import {
  FINANCIAL_LEDGER_CHANGED_EVENT,
  filterLedgerEntries,
  loadLedgerEntries,
  normalizeLedgerPaymentMethod,
  selectDashboardLedgerSummary,
  selectDepartmentIntelligence,
  selectDepartmentRootCauseAnalysis,
  selectSmartLedgerAlerts,
  type CanonicalLedgerEntry,
  type DepartmentIntelligenceClassification,
} from "../finance/financialLedger";
import { generateRecommendedActions } from "../finance/actionEngine";
type Tx = any;
type ExpenseRow = any;

type MainTab =
  | "overview"
  | "payments"
  | "expenses"
  | "departments"
  | "activity";

type RangeFilter = "today" | "yesterday" | "week" | "month" | "all";
type QuickRangeFilter = RangeFilter | "custom";
type DateRange = { startDate: string; endDate: string };
type DashboardFocus = "all" | "revenue" | "collections" | "receivables" | "expenses";
type FocusedDashboardView =
  | { type: "kpi"; focus: DashboardFocus | "netProfit" | "transactions" | "cash" | "momo" | "card"; title: string }
  | { type: "alert"; alert: any }
  | { type: "action"; action: any }
  | { type: "department"; departmentKey: string; title: string }
  | { type: "transaction"; tx: Tx }
  | { type: "expense"; expense: ExpenseRow };
const DEPARTMENT_ANALYTICS_LEDGER_SOURCE_TYPES = new Set([
  "room_booking_revenue",
  "guest_payment_collection",
  "direct_pos_sale",
  "expense",
]);

function money(n: number) {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function upper(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function formatDepartmentLabel(value: string) {
  const key = normalizeDepartmentKey(value);
  if (key === "unknown") return "Unknown";

  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCategoryLabel(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "Miscellaneous";

  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toDateInputValue(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPresetDateRange(range: RangeFilter): DateRange {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  if (range === "all") {
    return { startDate: "", endDate: "" };
  }

  if (range === "yesterday") {
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    const value = toDateInputValue(yesterday);
    return { startDate: value, endDate: value };
  }

  if (range === "week") {
    const weekStart = new Date(todayStart);
    const currentDay = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - currentDay);
    return {
      startDate: toDateInputValue(weekStart),
      endDate: toDateInputValue(todayStart),
    };
  }

  if (range === "month") {
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    return {
      startDate: toDateInputValue(monthStart),
      endDate: toDateInputValue(todayStart),
    };
  }

  const today = toDateInputValue(todayStart);
  return { startDate: today, endDate: today };
}

function formatDateInputLabel(value: string) {
  if (!value) return "";

  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDateRangeLabel(startDate: string, endDate: string) {
  if (!startDate && !endDate) return "All time";
  if (startDate && endDate && startDate === endDate) {
    return formatDateInputLabel(startDate);
  }
  if (startDate && endDate) {
    return `${formatDateInputLabel(startDate)} - ${formatDateInputLabel(endDate)}`;
  }
  if (startDate) return `From ${formatDateInputLabel(startDate)}`;
  return `Until ${formatDateInputLabel(endDate)}`;
}

function getTxAmount(t: Tx) {
  const value =
    Number(t?.collectionAmount) ||
    Number(t?.revenueAmount) ||
    Number(t?.expenseAmount) ||
    Number(t?.grandTotal) ||
    Number(t?.total) ||
    Number(t?.amountPaid) ||
    Number(t?.amount) ||
    0;

  return Number.isFinite(value) ? value : 0;
}

function getTxTime(t: Tx) {
  return t?.occurredAt || t?.createdAt || t?.timestamp || t?.date || "";
}

function parseDashboardDate(value: string | number) {
  if (typeof value === "number") {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(ms);
  }

  const raw = String(value || "").trim();
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return new Date(n < 10_000_000_000 ? n * 1000 : n);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00`);
  }
  return new Date(raw);
}

function formatDateTime(value: string) {
  if (!value) return "—";

  const d = parseDashboardDate(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleString();
}

function formatShortDate(value: string) {
  if (!value) return "—";

  const d = parseDashboardDate(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function statusLabel(t: Tx) {
  return upper(t?.status || "PAID");
}

function getDepartmentValue(t: Tx) {
  return normalizeDepartmentKey(
    t?.departmentId ||
      t?.departmentName ||
      t?.department ||
      t?.departmentKey ||
      t?.deptKey ||
      "unknown"
  );
}

function getLedgerDepartmentValue(entry: CanonicalLedgerEntry) {
  return normalizeDepartmentKey(entry.departmentKey || "unknown");
}

function getStaffLabel(t: Tx) {
  if (t?.createdBy?.name || t?.createdBy?.employeeId) {
    return t.createdBy.name || t.createdBy.employeeId;
  }
  const id = t?.staffId || t?.employeeId || "—";
  const name = t?.staffName || t?.cashierName || "";

  return name ? `${id} / ${name}` : String(id);
}

function getAccountingSourceLabel(t: Tx) {
  if (t?.sourceType) return formatCategoryLabel(t.sourceType);
  return "Direct sale";
}

function getTransactionItems(t: Tx) {
  const rawItems = Array.isArray(t?.items) ? t.items : [];
  const items = rawItems
    .map((item: any, index: number) => {
      const qty = Number(item?.qty ?? item?.quantity ?? 1) || 1;
      const unitPrice = Number(item?.unitPrice ?? item?.price ?? item?.rate ?? 0) || 0;
      const discount = Number(item?.discount ?? 0) || 0;
      const total =
        Number(item?.total ?? item?.lineTotal) ||
        Math.max(0, qty * unitPrice - discount);

      return {
        id: item?.id || `${index}`,
        name: item?.name || item?.productName || item?.itemName || "Item",
        qty,
        unitPrice,
        discount,
        total,
      };
    })
    .filter((item: any) => item.name || item.total > 0);

  if (items.length > 0) return items;

  const name = t?.productName || t?.itemName;
  if (!name) return [];

  const qty = Number(t?.qty ?? 1) || 1;
  const unitPrice = Number(t?.unitPrice ?? getTxAmount(t)) || 0;
  const discount = Number(t?.discount ?? 0) || 0;
  const total =
    Number(t?.total ?? t?.amount ?? t?.grandTotal) ||
    Math.max(0, qty * unitPrice - discount);

  return [{ id: t?.id || t?.txId || "single", name, qty, unitPrice, discount, total }];
}

function getDepartmentLabel(
  value: string,
  departmentOptions: Array<{ value: string; label: string }>
) {
  return (
    departmentOptions.find((d) => d.value === value)?.label ||
    formatDepartmentLabel(value) ||
    "Unknown"
  );
}

function MetricCard({
  title,
  value,
  note,
  accent,
  onClick,
  active,
}: {
  title: string;
  value: string;
  note: string;
  accent: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
      <div style={styles.metricTitle}>{title}</div>
      <div style={styles.metricValue}>{value}</div>
      <div style={styles.metricNote}>{note}</div>
    </>
  );

  if (onClick) {
    return (
      <ClickableCard
        onClick={onClick}
        style={{
          ...styles.metricCard,
          borderTop: `4px solid ${accent}`,
        }}
        active={active}
        activeStyle={styles.metricCardActive}
        hint="Click to view"
        ariaLabel={`View ${title} details`}
      >
        {content}
      </ClickableCard>
    );
  }

  return (
    <div style={{ ...styles.metricCard, borderTop: `4px solid ${accent}` }}>
      {content}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailItem}>
      <div style={styles.detailLabel}>{label}</div>
      <div style={styles.detailValue}>{value || "—"}</div>
    </div>
  );
}

function TransactionItemBreakdown({ tx }: { tx: Tx }) {
  const items = getTransactionItems(tx);

  if (items.length === 0) {
    return (
      <div style={styles.itemBreakdownEmpty}>
        No item breakdown available for this transaction.
      </div>
    );
  }

  return (
    <div style={styles.itemBreakdown}>
      <div style={styles.itemBreakdownTitle}>Item Breakdown</div>
      <div style={styles.itemBreakdownTableWrap}>
        <table style={styles.itemBreakdownTable}>
          <thead>
            <tr>
              <th style={styles.itemBreakdownThLeft}>Item</th>
              <th style={styles.itemBreakdownThRight}>Qty</th>
              <th style={styles.itemBreakdownThRight}>Unit</th>
              <th style={styles.itemBreakdownThRight}>Discount</th>
              <th style={styles.itemBreakdownThRight}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.id}>
                <td style={styles.itemBreakdownTdLeft}>{item.name}</td>
                <td style={styles.itemBreakdownTdRight}>{item.qty}</td>
                <td style={styles.itemBreakdownTdRight}>{money(item.unitPrice)}</td>
                <td style={styles.itemBreakdownTdRight}>{money(item.discount)}</td>
                <td style={styles.itemBreakdownTdRight}>{money(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function departmentIntelligenceBadge(
  classification: DepartmentIntelligenceClassification
) {
  if (classification === "top") return "Top Performer";
  if (classification === "loss") return "Loss";
  if (classification === "cash_risk") return "Risk";
  return "Stable";
}

function getExpenseDepartmentValue(e: ExpenseRow) {
  return normalizeDepartmentKey(e?.departmentKey || e?.deptKey || e?.department || "unknown");
}

function ChartCard({
  title,
  helper,
  children,
}: {
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.sectionCard}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>{title}</h2>
        {helper ? <span style={styles.helperText}>{helper}</span> : null}
      </div>
      {children}
    </div>
  );
}

export default function SalesDashboardPage() {
  const { departments = [] } = useDepartments();
  const previousScrollRef = useRef(0);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [quickRange, setQuickRange] = useState<QuickRangeFilter>(() =>
    hasAccountingDateRange() ? "custom" : "today"
  );
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    loadAccountingDateRange(getPresetDateRange("today"))
  );
  const [selectedFocus, setSelectedFocus] = useState<DashboardFocus>("all");
  const [selectedDepartmentKey, setSelectedDepartmentKey] = useState<string | null>(null);
  const [focusedDashboardView, setFocusedDashboardView] =
    useState<FocusedDashboardView | null>(null);
  const [selectedTx, setSelectedTx] = useState<Tx | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRow | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>("overview");
  const [ledgerVersion, setLedgerVersion] = useState(0);

  useEffect(() => {
    const refreshLedger = () => setLedgerVersion((v) => v + 1);
    window.addEventListener(FINANCIAL_LEDGER_CHANGED_EVENT, refreshLedger);
    window.addEventListener("storage", refreshLedger);
    return () => {
      window.removeEventListener(FINANCIAL_LEDGER_CHANGED_EVENT, refreshLedger);
      window.removeEventListener("storage", refreshLedger);
    };
  }, []);

  function openDashboardFocusedView(view: FocusedDashboardView) {
    previousScrollRef.current = window.scrollY;
    handleOpenFocusedView(setFocusedDashboardView, view);
  }

  function closeDashboardFocusedView() {
  handleCloseFocusedView(setFocusedDashboardView);
}

  const ledgerEntries = useMemo(() => loadLedgerEntries(), [ledgerVersion]);

  const departmentOptions = useMemo(() => {
    const fromConfig = (departments || []).map((d: any) => ({
      value: normalizeDepartmentKey(d?.key || d?.id || d?.name),
      label: formatDepartmentLabel(d?.name || d?.key || d?.id),
    }));

    const ledgerDepts = Array.from(
      new Set(ledgerEntries.map((entry) => getLedgerDepartmentValue(entry)).filter(Boolean))
    ).map((value) => ({
      value,
      label: formatDepartmentLabel(value),
    }));

    const merged = [...fromConfig, ...ledgerDepts];
    const seen = new Set<string>();

    return merged.filter((item) => {
      if (!item.value || seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    });
  }, [departments, ledgerEntries]);
  const filteredLedgerEntries = useMemo(() => {
    return filterLedgerEntries(ledgerEntries, {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      departmentKey: selectedDepartmentKey || departmentFilter,
      search,
    });
  }, [ledgerEntries, dateRange, departmentFilter, selectedDepartmentKey, search]);

  const focusedLedgerEntries = useMemo(() => {
    if (selectedFocus === "all") return filteredLedgerEntries;

    return filteredLedgerEntries.filter((entry) => {
      if (selectedFocus === "revenue") return entry.revenueAmount > 0;
      if (selectedFocus === "collections") return entry.collectionAmount > 0;
      if (selectedFocus === "receivables") return entry.receivableAmount > 0;
      if (selectedFocus === "expenses") return entry.expenseAmount > 0;
      return true;
    });
  }, [filteredLedgerEntries, selectedFocus]);

  const dashboardLedgerSummary = useMemo(
    () =>
      selectDashboardLedgerSummary(ledgerEntries, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        departmentKey: selectedDepartmentKey || departmentFilter,
        search,
      }),
    [ledgerEntries, dateRange, departmentFilter, selectedDepartmentKey, search]
  );

  const paymentBreakdown = useMemo(() => {
    const emptyBreakdown = {
      cash: 0,
      momo: 0,
      card: 0,
      transfer: 0,
      other: 0,
      total: 0,
    };

    return filteredLedgerEntries
      .filter((entry) => entry.sourceType === "guest_payment_collection")
      .reduce((totals, entry) => {
        const amount = Number(entry.collectionAmount) || 0;
        const method = normalizeLedgerPaymentMethod(entry.paymentMethod, "cash");

        if (method === "cash") totals.cash += amount;
        else if (method === "momo") totals.momo += amount;
        else if (method === "card") totals.card += amount;
        else if (method === "transfer") totals.transfer += amount;
        else totals.other += amount;

        totals.total += amount;
        return totals;
      }, emptyBreakdown);
  }, [filteredLedgerEntries]);

  const summary = useMemo(() => {
    const ledgerTotals = dashboardLedgerSummary.totals;
    const revenueTransactionCount = filteredLedgerEntries.filter(
      (entry) => entry.revenueAmount > 0
    ).length;
    const averageSale =
      revenueTransactionCount > 0 ? ledgerTotals.revenue / revenueTransactionCount : 0;

    return {
      revenue: ledgerTotals.revenue,
      collections: ledgerTotals.collections,
      receivables: ledgerTotals.receivables,
      expenses: ledgerTotals.expenses,
      netProfit: dashboardLedgerSummary.netProfit,
      averageSale,
      transactions: filteredLedgerEntries.length,
      cash: paymentBreakdown.cash,
      momo: paymentBreakdown.momo,
      card: paymentBreakdown.card,
      transfer: paymentBreakdown.transfer,
      other: paymentBreakdown.other,
      paymentCollections: paymentBreakdown.total,
    };
  }, [dashboardLedgerSummary, filteredLedgerEntries, paymentBreakdown]);

  const departmentPerformance = useMemo(() => {
    const transactionCounts = new Map<string, number>();

    for (const entry of filteredLedgerEntries) {
      if (!DEPARTMENT_ANALYTICS_LEDGER_SOURCE_TYPES.has(entry.sourceType)) continue;
      const dept = getLedgerDepartmentValue(entry);
      transactionCounts.set(dept, (transactionCounts.get(dept) || 0) + 1);
    }

    return selectDepartmentIntelligence(filteredLedgerEntries)
      .map((row) => ({
        ...row,
        transactions: transactionCounts.get(row.department) || 0,
        badge: departmentIntelligenceBadge(row.classification),
      }))
      .filter((row) => row.transactions > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredLedgerEntries]);

  const expenseAnalytics = useMemo(() => {
    const byCategory = new Map<
      string,
      { category: string; amount: number; percent: number }
    >();

    let total = 0;

    for (const entry of filteredLedgerEntries.filter((item) => item.sourceType === "expense")) {
      const category = String(entry.sourceId || entry.customerName || "expense").trim();
      const amount = Number(entry.expenseAmount) || 0;

      total += amount;

      const current = byCategory.get(category) || {
        category,
        amount: 0,
        percent: 0,
      };

      current.amount += amount;
      byCategory.set(category, current);
    }

    const rows = Array.from(byCategory.values())
      .map((row) => ({
        ...row,
        percent: total > 0 ? (row.amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const topCategory = rows.length > 0 ? rows[0] : null;

    return {
      total,
      rows,
      topCategory,
    };
  }, [filteredLedgerEntries]);

  const departmentExpenseAnalytics = useMemo(() => {
    const map = new Map<string, { department: string; amount: number }>();

    for (const entry of filteredLedgerEntries.filter((item) => item.sourceType === "expense")) {
      const dept = getLedgerDepartmentValue(entry);
      const current = map.get(dept) || {
        department: dept,
        amount: 0,
      };

      current.amount += Number(entry.expenseAmount) || 0;
      map.set(dept, current);
    }

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredLedgerEntries]);

  const paymentMix = useMemo(() => {
    const total = summary.paymentCollections || 1;

    return [
      { label: "Cash", value: summary.cash, percent: (summary.cash / total) * 100 },
      { label: "MoMo", value: summary.momo, percent: (summary.momo / total) * 100 },
      { label: "Card", value: summary.card, percent: (summary.card / total) * 100 },
      {
        label: "Transfer",
        value: summary.transfer,
        percent: (summary.transfer / total) * 100,
      },
      { label: "Other", value: summary.other, percent: (summary.other / total) * 100 },
    ].filter((x) => x.value > 0);
  }, [summary]);

  const departmentHighlights = useMemo(() => {
    if (departmentPerformance.length === 0) {
      return {
        topRevenue: null as any,
        topExpense: null as any,
        topProfit: null as any,
        underperforming: null as any,
      };
    }

    const topRevenue = [...departmentPerformance].sort(
      (a, b) => b.revenue - a.revenue
    )[0];

    const topExpense = [...departmentPerformance].sort(
      (a, b) => b.expenses - a.expenses
    )[0];

    const topProfit = [...departmentPerformance].sort((a, b) => b.net - a.net)[0];
    const underperforming = [...departmentPerformance].sort((a, b) => {
      const aReceivablePressure = a.revenue > 0 ? a.receivables / a.revenue : 0;
      const bReceivablePressure = b.revenue > 0 ? b.receivables / b.revenue : 0;
      if (bReceivablePressure !== aReceivablePressure) {
        return bReceivablePressure - aReceivablePressure;
      }
      return a.revenue - b.revenue;
    })[0];

    return {
      topRevenue,
      topExpense,
      topProfit,
      underperforming,
    };
  }, [departmentPerformance]);

  const departmentProfitBars = useMemo(() => {
    const maxRevenue =
      departmentPerformance.length > 0
        ? Math.max(...departmentPerformance.map((row) => row.revenue), 0)
        : 0;

    return departmentPerformance.map((row) => ({
      ...row,
      revenueWidth: maxRevenue > 0 ? (row.revenue / maxRevenue) * 100 : 0,
      tone: row.net < 0 ? "loss" : "profit",
    }));
  }, [departmentPerformance]);

  const departmentLeaderboard = useMemo(() => {
    return departmentPerformance
      .map((row, index) => {
        return {
          ...row,
          rank: index + 1,
          marginPct: row.margin * 100,
          collectionPct: row.revenue > 0 ? (row.collections / row.revenue) * 100 : 0,
          receivablePct: row.revenue > 0 ? (row.receivables / row.revenue) * 100 : 0,
          status: row.badge,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [departmentPerformance]);

  const recentActivity = useMemo(() => {
    const latestTransactions = focusedLedgerEntries
      .filter((entry) => entry.revenueAmount > 0 || entry.collectionAmount > 0)
      .slice(0, 5)
      .map((entry) => ({
        type: "transaction",
        id: entry.id,
        time: entry.occurredAt,
        amount: entry.collectionAmount || entry.revenueAmount,
        department: getDepartmentLabel(getLedgerDepartmentValue(entry), departmentOptions),
        title:
          entry.sourceType === "room_folio_charge"
            ? `Room folio charge - ${entry.roomNo || "room"}`
            : entry.sourceType === "guest_payment_collection"
            ? `Guest payment - ${entry.roomNo || "room"}`
            : `${getDepartmentLabel(getLedgerDepartmentValue(entry), departmentOptions)} sale`,
        subtitle: `${entry.createdBy?.name || entry.createdBy?.employeeId || "Ledger"} - ${upper(
          entry.paymentMethod || "other"
        )}`,
        raw: entry,
      }));

    const latestExpenses = focusedLedgerEntries
      .filter((entry) => entry.sourceType === "expense")
      .slice(0, 5)
      .map((entry) => ({
        type: "expense",
        id: entry.id,
        time: entry.occurredAt,
        amount: Number(entry.expenseAmount) || 0,
        department: getDepartmentLabel(getLedgerDepartmentValue(entry), departmentOptions),
        title: `${getDepartmentLabel(getLedgerDepartmentValue(entry), departmentOptions)} expense`,
        subtitle: entry.customerName || entry.sourceId || "Expense",
        raw: entry,
      }));

    return {
      transactions: latestTransactions,
      expenses: latestExpenses,
    };
  }, [focusedLedgerEntries, departmentOptions]);
  const overviewTrendData = useMemo(() => {
    const map = new Map<string, { label: string; revenue: number; expenses: number }>();

    filteredLedgerEntries.forEach((entry) => {
      const key = formatShortDate(entry.occurredAt);
      const current = map.get(key) || { label: key, revenue: 0, expenses: 0 };
      current.revenue += Number(entry.revenueAmount) || 0;
      current.expenses += Number(entry.expenseAmount) || 0;
      map.set(key, current);
    });

    return Array.from(map.values()).slice(-10);
  }, [filteredLedgerEntries]);
  const todayVsYesterday = useMemo(() => {
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);

    let todayRevenue = 0;
    let yesterdayRevenue = 0;

    ledgerEntries.forEach((entry) => {
      const d = new Date(entry.occurredAt);
      const amount = Number(entry.revenueAmount) || 0;
      const dept = getLedgerDepartmentValue(entry);

      if (Number.isNaN(d.getTime())) return;
      if (departmentFilter !== "all" && dept !== departmentFilter) return;
      if (selectedDepartmentKey && dept !== selectedDepartmentKey) return;

      if (d >= todayStart) {
        todayRevenue += amount;
      } else if (d >= yesterdayStart && d < todayStart) {
        yesterdayRevenue += amount;
      }
    });

    const change =
      yesterdayRevenue === 0
        ? todayRevenue > 0
          ? 100
          : 0
        : ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100;

    return {
      todayRevenue,
      yesterdayRevenue,
      change,
    };
  }, [ledgerEntries, departmentFilter, selectedDepartmentKey]);
  const departmentTodayVsYesterday = useMemo(() => {
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);

    const map = new Map<
      string,
      {
        department: string;
        today: number;
        yesterday: number;
        change: number;
        status: "up" | "down" | "flat" | "new";
      }
    >();

    ledgerEntries.forEach((entry) => {
      const d = new Date(entry.occurredAt);
      if (Number.isNaN(d.getTime())) return;

      const dept = getLedgerDepartmentValue(entry);
      const amount = Number(entry.revenueAmount) || 0;

      if (departmentFilter !== "all" && dept !== departmentFilter) return;
      if (selectedDepartmentKey && dept !== selectedDepartmentKey) return;

      const current = map.get(dept) || {
        department: dept,
        today: 0,
        yesterday: 0,
        change: 0,
        status: "flat" as const,
      };

      if (d >= todayStart) {
        current.today += amount;
      } else if (d >= yesterdayStart && d < todayStart) {
        current.yesterday += amount;
      }

      map.set(dept, current);
    });

    const rows = Array.from(map.values()).map((row) => {
      let change = 0;
      let status: "up" | "down" | "flat" | "new" = "flat";

      if (row.yesterday === 0 && row.today > 0) {
        change = 100;
        status = "new";
      } else if (row.yesterday > 0) {
        change = ((row.today - row.yesterday) / row.yesterday) * 100;
        if (change > 0.1) status = "up";
        else if (change < -0.1) status = "down";
        else status = "flat";
      }

      return {
        ...row,
        change,
        status,
      };
    });

    return rows.sort((a, b) => b.today - a.today);
  }, [ledgerEntries, departmentFilter, selectedDepartmentKey]);
  const hourlySalesTrend = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      sales: 0,
      transactions: 0,
    }));

    filteredLedgerEntries.forEach((entry) => {
      const d = new Date(entry.occurredAt);
      if (Number.isNaN(d.getTime())) return;

      const hour = d.getHours();
      const amount = Number(entry.revenueAmount) || 0;

      buckets[hour].sales += amount;
      buckets[hour].transactions += 1;
    });

    return buckets;
  }, [filteredLedgerEntries]);
  const smartAlerts = useMemo(
    () =>
      selectSmartLedgerAlerts(filteredLedgerEntries, {
        departmentKeys: departmentOptions.map((department) => department.value),
      }),
    [filteredLedgerEntries, departmentOptions]
  );
  const recommendedActions = useMemo(() => {
    return generateRecommendedActions(filteredLedgerEntries);
  }, [filteredLedgerEntries]);

  const drilldownDepartmentKey =
    selectedDepartmentKey ||
    (departmentFilter !== "all" ? departmentFilter : departmentPerformance[0]?.department || "");
  const departmentRootCause = useMemo(() => {
    if (!drilldownDepartmentKey) return null;
    return selectDepartmentRootCauseAnalysis(filteredLedgerEntries, drilldownDepartmentKey);
  }, [filteredLedgerEntries, drilldownDepartmentKey]);

  const paymentChartData = useMemo(() => {
    return paymentMix.map((item) => ({
      name: item.label,
      value: item.value,
    }));
  }, [paymentMix]);

  const expenseChartData = useMemo(() => {
    return expenseAnalytics.rows.map((item) => ({
      name: formatCategoryLabel(item.category),
      value: item.amount,
    }));
  }, [expenseAnalytics]);

  const departmentChartData = useMemo(() => {
    return departmentPerformance.map((row) => ({
      name: getDepartmentLabel(row.department, departmentOptions),
      revenue: row.revenue,
      collections: row.collections,
      receivables: row.receivables,
      expenses: row.expenses,
      net: row.net,
    }));
  }, [departmentPerformance, departmentOptions]);

  const expenseDeptChartData = useMemo(() => {
    return departmentExpenseAnalytics.map((row) => ({
      name: getDepartmentLabel(row.department, departmentOptions),
      amount: row.amount,
    }));
  }, [departmentExpenseAnalytics, departmentOptions]);

  const departmentDayComparisonChart = useMemo(() => {
    return departmentTodayVsYesterday.map((row) => ({
      name: getDepartmentLabel(row.department, departmentOptions),
      today: row.today,
      yesterday: row.yesterday,
    }));
  }, [departmentTodayVsYesterday, departmentOptions]);

  const activeViewingLabel = selectedDepartmentKey
    ? `Viewing: ${getDepartmentLabel(selectedDepartmentKey, departmentOptions)} only`
    : departmentFilter === "all"
    ? "Viewing: All sales departments"
    : `Viewing: ${getDepartmentLabel(departmentFilter, departmentOptions)}`;
  const activeFocusLabel =
    selectedFocus === "all" ? "All activity" : formatCategoryLabel(selectedFocus);

  const selectedDateRangeLabel = getDateRangeLabel(
    dateRange.startDate,
    dateRange.endDate
  );

  const tabs: Array<{ key: MainTab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "payments", label: "Payments" },
    { key: "expenses", label: "Expenses" },
    { key: "departments", label: "Departments" },
    { key: "activity", label: "Activity" },
  ];

  const pieColors = ["#0F172A", "#2563EB", "#8B5CF6", "#10B981", "#F59E0B"];

  const focusedViewDepartment = useMemo(() => {
    if (focusedDashboardView?.type !== "department") return null;
    return departmentPerformance.find(
      (row) => row.department === focusedDashboardView.departmentKey
    ) || null;
  }, [focusedDashboardView, departmentPerformance]);

  const focusedViewRows = useMemo(() => {
    if (focusedDashboardView?.type !== "kpi") return [];

    return filteredLedgerEntries.filter((entry) => {
      if (focusedDashboardView.focus === "revenue") return entry.revenueAmount > 0;
      if (focusedDashboardView.focus === "collections") return entry.collectionAmount > 0;
      if (focusedDashboardView.focus === "receivables") return entry.receivableAmount > 0;
      if (focusedDashboardView.focus === "expenses") return entry.expenseAmount > 0;
      if (focusedDashboardView.focus === "cash") {
        return entry.collectionAmount > 0 && normalizeLedgerPaymentMethod(entry.paymentMethod) === "cash";
      }
      if (focusedDashboardView.focus === "momo") {
        return entry.collectionAmount > 0 && normalizeLedgerPaymentMethod(entry.paymentMethod) === "momo";
      }
      if (focusedDashboardView.focus === "card") {
        return entry.collectionAmount > 0 && normalizeLedgerPaymentMethod(entry.paymentMethod) === "card";
      }
      return true;
    });
  }, [focusedDashboardView, filteredLedgerEntries]);

  const exportSummary = useMemo(() => {
    const topDept = departmentLeaderboard[0];
    const underperformingDept = departmentHighlights.underperforming;
    const peakHour = [...hourlySalesTrend].sort((a, b) => b.sales - a.sales)[0];

    return {
      generatedAt: new Date().toLocaleString(),
      range: selectedDateRangeLabel,
      departmentView: selectedDepartmentKey
        ? getDepartmentLabel(selectedDepartmentKey, departmentOptions)
        : departmentFilter === "all"
        ? "All departments"
        : getDepartmentLabel(departmentFilter, departmentOptions),
      kpis: {
        revenue: summary.revenue,
        collections: summary.collections,
        receivables: summary.receivables,
        expenses: summary.expenses,
        netProfit: summary.netProfit,
        transactions: summary.transactions,
        averageSale: summary.averageSale,
        cash: summary.cash,
        momo: summary.momo,
        card: summary.card,
        transfer: summary.transfer,
        other: summary.other,
      },
      topExpenseCategory: expenseAnalytics.topCategory
        ? {
            category: formatCategoryLabel(expenseAnalytics.topCategory.category),
            amount: expenseAnalytics.topCategory.amount,
            percent: expenseAnalytics.topCategory.percent,
          }
        : null,
      todayVsYesterday,
      topDepartment: topDept
        ? {
            name: getDepartmentLabel(topDept.department, departmentOptions),
            net: topDept.net,
            revenue: topDept.revenue,
            collections: topDept.collections,
            receivables: topDept.receivables,
            expenses: topDept.expenses,
            marginPct: topDept.marginPct,
            status: topDept.status,
          }
        : null,
      weakestDepartment: underperformingDept
        ? {
            name: getDepartmentLabel(underperformingDept.department, departmentOptions),
            net: underperformingDept.net,
            revenue: underperformingDept.revenue,
            collections: underperformingDept.collections,
            receivables: underperformingDept.receivables,
            expenses: underperformingDept.expenses,
            marginPct:
              underperformingDept.revenue > 0
                ? (underperformingDept.net / underperformingDept.revenue) * 100
                : 0,
            status:
              departmentLeaderboard.find(
                (row) => row.department === underperformingDept.department
              )?.status || "Needs Attention",
          }
        : null,
      peakHour:
        peakHour && peakHour.sales > 0
          ? {
              label: peakHour.label,
              sales: peakHour.sales,
              transactions: peakHour.transactions,
            }
          : null,
      smartAlerts: smartAlerts.map((x) => ({
        title: x.title,
        message: x.message,
        severity: x.severity,
        recommendedAction: x.recommendedAction,
      })),
      departmentLeaderboard: departmentLeaderboard.map((row) => ({
        rank: row.rank,
        department: getDepartmentLabel(row.department, departmentOptions),
        revenue: row.revenue,
        collections: row.collections,
        receivables: row.receivables,
        expenses: row.expenses,
        net: row.net,
        transactions: row.transactions,
        marginPct: row.marginPct,
        status: row.status,
      })),
    };
  }, [
    selectedDateRangeLabel,
    selectedDepartmentKey,
    departmentFilter,
    departmentOptions,
    summary,
    expenseAnalytics,
    todayVsYesterday,
    departmentLeaderboard,
    departmentHighlights,
    hourlySalesTrend,
    smartAlerts,
  ]);

  function handlePrintSummary() {
    window.print();
  }

  function handleExportJson() {
    const dataStr = JSON.stringify(exportSummary, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `sikatech-dashboard-summary-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function handleExportText() {
    const lines: string[] = [];

    lines.push("SIKATECH AFRICA DASHBOARD SUMMARY");
    lines.push("");
    lines.push(`Generated: ${exportSummary.generatedAt}`);
    lines.push(`Range: ${exportSummary.range}`);
    lines.push(`Department View: ${exportSummary.departmentView}`);
    lines.push("");

    lines.push("KEY METRICS");
    lines.push(`Revenue: ${money(exportSummary.kpis.revenue)}`);
    lines.push(`Collections: ${money(exportSummary.kpis.collections)}`);
    lines.push(`Receivables: ${money(exportSummary.kpis.receivables)}`);
    lines.push(`Expenses: ${money(exportSummary.kpis.expenses)}`);
    lines.push(`Net Profit: ${money(exportSummary.kpis.netProfit)}`);
    lines.push(`Transactions: ${exportSummary.kpis.transactions}`);
    lines.push(`Average Sale: ${money(exportSummary.kpis.averageSale)}`);
    lines.push(`Cash: ${money(exportSummary.kpis.cash)}`);
    lines.push(`MoMo: ${money(exportSummary.kpis.momo)}`);
    lines.push(`Card: ${money(exportSummary.kpis.card)}`);
    lines.push(`Transfer: ${money(exportSummary.kpis.transfer)}`);
    lines.push(`Other: ${money(exportSummary.kpis.other)}`);
    lines.push("");

    lines.push("TODAY VS YESTERDAY");
    lines.push(`Today Revenue: ${money(exportSummary.todayVsYesterday.todayRevenue)}`);
    lines.push(
      `Yesterday Revenue: ${money(exportSummary.todayVsYesterday.yesterdayRevenue)}`
    );
    lines.push(
      `Change: ${Math.abs(exportSummary.todayVsYesterday.change).toFixed(1)}% ${
        exportSummary.todayVsYesterday.change >= 0 ? "up" : "down"
      }`
    );
    lines.push("");

    if (exportSummary.topExpenseCategory) {
      lines.push("TOP EXPENSE CATEGORY");
      lines.push(
        `${exportSummary.topExpenseCategory.category}: ${money(
          exportSummary.topExpenseCategory.amount
        )} (${exportSummary.topExpenseCategory.percent.toFixed(1)}%)`
      );
      lines.push("");
    }

    if (exportSummary.topDepartment) {
      lines.push("TOP DEPARTMENT");
      lines.push(
        `${exportSummary.topDepartment.name} | Net: ${money(
          exportSummary.topDepartment.net
        )} | Revenue: ${money(exportSummary.topDepartment.revenue)} | Collections: ${money(
          exportSummary.topDepartment.collections
        )} | Receivables: ${money(
          exportSummary.topDepartment.receivables
        )} | Expenses: ${money(
          exportSummary.topDepartment.expenses
        )} | Margin: ${exportSummary.topDepartment.marginPct.toFixed(1)}%`
      );
      lines.push("");
    }

    if (exportSummary.weakestDepartment) {
      lines.push("WEAKEST DEPARTMENT");
      lines.push(
        `${exportSummary.weakestDepartment.name} | Net: ${money(
          exportSummary.weakestDepartment.net
        )} | Revenue: ${money(
          exportSummary.weakestDepartment.revenue
        )} | Collections: ${money(
          exportSummary.weakestDepartment.collections
        )} | Receivables: ${money(
          exportSummary.weakestDepartment.receivables
        )} | Expenses: ${money(
          exportSummary.weakestDepartment.expenses
        )} | Margin: ${exportSummary.weakestDepartment.marginPct.toFixed(1)}%`
      );
      lines.push("");
    }

    if (exportSummary.peakHour) {
      lines.push("PEAK SALES HOUR");
      lines.push(
        `${exportSummary.peakHour.label} | Sales: ${money(
          exportSummary.peakHour.sales
        )} | Transactions: ${exportSummary.peakHour.transactions}`
      );
      lines.push("");
    }

    lines.push("SMART ALERTS");
    if (exportSummary.smartAlerts.length === 0) {
      lines.push("No alerts.");
    } else {
      exportSummary.smartAlerts.forEach((alert, index) => {
        lines.push(`${index + 1}. ${alert.title} - ${alert.message}`);
        lines.push(`Action: ${alert.recommendedAction}`);
      });
    }
    lines.push("");

    lines.push("DEPARTMENT LEADERBOARD");
    if (exportSummary.departmentLeaderboard.length === 0) {
      lines.push("No department data.");
    } else {
      exportSummary.departmentLeaderboard.forEach((row) => {
        lines.push(
          `#${row.rank} ${row.department} | Revenue: ${money(row.revenue)} | Collections: ${money(
            row.collections
          )} | Receivables: ${money(row.receivables)} | Expenses: ${money(
            row.expenses
          )} | Net: ${money(row.net)} | Tx: ${row.transactions} | Margin: ${row.marginPct.toFixed(
            1
          )}% | Status: ${row.status}`
        );
      });
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `sikatech-dashboard-summary-${new Date()
      .toISOString()
      .slice(0, 10)}.txt`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerBlock}>
        <div>
          <h1 style={styles.title}>Sales Summary (Central)</h1>
          <p style={styles.subtitle}>
            Central overview first, then department breakdown and recent transactions.
          </p>
        </div>

        <div style={styles.exportActions}>
          <button onClick={handlePrintSummary} style={styles.exportButtonPrimary}>
            Print Summary
          </button>
          <button onClick={handleExportText} style={styles.exportButton}>
            Export TXT
          </button>
          <button onClick={handleExportJson} style={styles.exportButton}>
            Export JSON
          </button>
        </div>
      </div>

      {focusedDashboardView ? (
        <FocusedViewPanel
          title={
            focusedDashboardView.type === "kpi"
              ? focusedDashboardView.title
              : focusedDashboardView.type === "alert"
              ? focusedDashboardView.alert.title
              : focusedDashboardView.type === "action"
              ? focusedDashboardView.action.title
              : focusedDashboardView.type === "department"
              ? focusedDashboardView.title
              : focusedDashboardView.type === "transaction"
              ? "Transaction Details"
              : "Expense Details"
          }
          subtitle={selectedDateRangeLabel}
          onBack={closeDashboardFocusedView}
        >
          {focusedDashboardView.type === "kpi" ? (
            <div style={styles.focusedMode}>
              <div style={styles.detailGrid}>
                <DetailItem label="Matching Ledger Entries" value={String(focusedViewRows.length)} />
                <DetailItem
                  label="Total Revenue"
                  value={money(focusedViewRows.reduce((sum, entry) => sum + entry.revenueAmount, 0))}
                />
                <DetailItem
                  label="Collections"
                  value={money(focusedViewRows.reduce((sum, entry) => sum + entry.collectionAmount, 0))}
                />
                <DetailItem
                  label="Expenses"
                  value={money(focusedViewRows.reduce((sum, entry) => sum + entry.expenseAmount, 0))}
                />
              </div>
              <div style={styles.activityList}>
                {focusedViewRows.slice(0, 10).map((entry) => (
                  <button
                    key={entry.id}
                    style={styles.activityCardButton}
                    onClick={() =>
                      openDashboardFocusedView(
                        entry.expenseAmount > 0
                          ? { type: "expense", expense: entry }
                          : { type: "transaction", tx: entry }
                      )
                    }
                  >
                    <div style={styles.activityCard}>
                      <div style={styles.activityTop}>
                        <span style={entry.expenseAmount > 0 ? styles.activityBadgeNegative : styles.activityBadgePositive}>
                          {entry.sourceType.replace(/_/g, " ")}
                        </span>
                        <span style={entry.expenseAmount > 0 ? styles.activityAmountNegative : styles.activityAmount}>
                          {money(entry.expenseAmount || entry.collectionAmount || entry.revenueAmount)}
                        </span>
                      </div>
                      <div style={styles.activityTitle}>{getAccountingSourceLabel(entry)}</div>
                      <div style={styles.activityMeta}>
                        <span>{formatDateTime(entry.occurredAt)}</span>
                        <span>{getDepartmentLabel(getLedgerDepartmentValue(entry), departmentOptions)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {focusedDashboardView.type === "alert" ? (
            <div style={styles.focusedMode}>
              <div style={styles.alertMessage}>{focusedDashboardView.alert.message}</div>
              <div style={styles.alertAction}>{focusedDashboardView.alert.recommendedAction}</div>
              {focusedDashboardView.alert.departmentKey ? (
                <div style={styles.detailGrid}>
                  <DetailItem
                    label="Department"
                    value={getDepartmentLabel(focusedDashboardView.alert.departmentKey, departmentOptions)}
                  />
                  <DetailItem label="Metric Value" value={money(Number(focusedDashboardView.alert.metricValue) || 0)} />
                </div>
              ) : null}
            </div>
          ) : null}

          {focusedDashboardView.type === "action" ? (
            <div style={styles.focusedMode}>
              <div style={styles.alertMessage}>{focusedDashboardView.action.description}</div>
              <div style={styles.alertAction}>Severity: {focusedDashboardView.action.severity}</div>
              {focusedDashboardView.action.departmentKey ? (
                <DetailItem
                  label="Department"
                  value={getDepartmentLabel(focusedDashboardView.action.departmentKey, departmentOptions)}
                />
              ) : null}
            </div>
          ) : null}

          {focusedDashboardView.type === "department" ? (
            <div style={styles.focusedMode}>
              {!focusedViewDepartment ? (
                <div style={styles.emptyState}>No department data found for this filter.</div>
              ) : (
                <div style={styles.detailGrid}>
                  <DetailItem label="Revenue" value={money(focusedViewDepartment.revenue)} />
                  <DetailItem label="Collections" value={money(focusedViewDepartment.collections)} />
                  <DetailItem label="Receivables" value={money(focusedViewDepartment.receivables)} />
                  <DetailItem label="Expenses" value={money(focusedViewDepartment.expenses)} />
                  <DetailItem label="Net" value={money(focusedViewDepartment.net)} />
                  <DetailItem label="Transactions" value={String(focusedViewDepartment.transactions)} />
                  <DetailItem label="Insight" value={focusedViewDepartment.insight} />
                </div>
              )}
            </div>
          ) : null}

          {focusedDashboardView.type === "transaction" ? (
            <div style={styles.detailGrid}>
              <DetailItem label="Tx ID" value={focusedDashboardView.tx?.txId || focusedDashboardView.tx?.id || "—"} />
              <DetailItem label="Time" value={formatDateTime(getTxTime(focusedDashboardView.tx))} />
              <DetailItem
                label="Department"
                value={getDepartmentLabel(getDepartmentValue(focusedDashboardView.tx), departmentOptions)}
              />
              <DetailItem label="Source" value={getAccountingSourceLabel(focusedDashboardView.tx)} />
              <DetailItem label="Booking Code" value={focusedDashboardView.tx?.bookingCode || "—"} />
              <DetailItem label="Room" value={focusedDashboardView.tx?.roomNo || focusedDashboardView.tx?.room || "—"} />
              <DetailItem label="Staff" value={getStaffLabel(focusedDashboardView.tx)} />
              <DetailItem label="Payment Method" value={focusedDashboardView.tx?.paymentMethod || "—"} />
              <DetailItem label="Status" value={statusLabel(focusedDashboardView.tx)} />
              <DetailItem label="Total" value={money(getTxAmount(focusedDashboardView.tx))} />
              <TransactionItemBreakdown tx={focusedDashboardView.tx} />
            </div>
          ) : null}

          {focusedDashboardView.type === "expense" ? (
            <div style={styles.detailGrid}>
              <DetailItem label="Time" value={formatDateTime(getTxTime(focusedDashboardView.expense))} />
              <DetailItem
                label="Department"
                value={getDepartmentLabel(
                  getExpenseDepartmentValue(focusedDashboardView.expense),
                  departmentOptions
                )}
              />
              <DetailItem
                label="Category"
                value={formatCategoryLabel(
                  focusedDashboardView.expense?.category || focusedDashboardView.expense?.sourceType
                )}
              />
              <DetailItem label="Amount" value={money(getTxAmount(focusedDashboardView.expense))} />
              <DetailItem label="Description" value={focusedDashboardView.expense?.description || "—"} />
              <DetailItem label="Note" value={focusedDashboardView.expense?.note || "—"} />
            </div>
          ) : null}
        </FocusedViewPanel>
      ) : (
        <>
      <div style={styles.filtersRow}>
        <input
          type="text"
          placeholder="Search tx, staff, phone, room, item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />

        <select
          value={departmentFilter}
          onChange={(e) => {
            setDepartmentFilter(e.target.value);
            setSelectedDepartmentKey(null);
          }}
          style={styles.select}
        >
          <option value="all">All sales departments</option>
          {departmentOptions.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>

        <div style={styles.dateRangeControls}>
          <label style={styles.dateField}>
            <span style={styles.dateLabel}>Start Date</span>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => {
                setQuickRange("custom");
                setDateRange((prev) =>
                  saveAccountingDateRange({ ...prev, startDate: e.target.value })
                );
              }}
              style={styles.dateInput}
            />
          </label>

          <label style={styles.dateField}>
            <span style={styles.dateLabel}>End Date</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => {
                setQuickRange("custom");
                setDateRange((prev) =>
                  saveAccountingDateRange({ ...prev, endDate: e.target.value })
                );
              }}
              style={styles.dateInput}
            />
          </label>

          <select
            value={quickRange}
            onChange={(e) => {
              const next = e.target.value as QuickRangeFilter;
              setQuickRange(next);
              if (next !== "custom") {
                setDateRange(saveAccountingDateRange(getPresetDateRange(next)));
              }
            }}
            style={styles.select}
          >
            <option value="custom">Custom range</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      <div style={styles.printSummaryCard}>
        <div style={styles.printSummaryTitle}>Dashboard Summary Snapshot</div>
        <div style={styles.printSummaryGrid}>
          <div style={styles.printSummaryItem}>
            <span style={styles.printSummaryLabel}>Generated</span>
            <span style={styles.printSummaryValue}>{exportSummary.generatedAt}</span>
          </div>
          <div style={styles.printSummaryItem}>
            <span style={styles.printSummaryLabel}>Range</span>
            <span style={styles.printSummaryValue}>{exportSummary.range}</span>
          </div>
          <div style={styles.printSummaryItem}>
            <span style={styles.printSummaryLabel}>Department View</span>
            <span style={styles.printSummaryValue}>{exportSummary.departmentView}</span>
          </div>
          <div style={styles.printSummaryItem}>
            <span style={styles.printSummaryLabel}>Revenue</span>
            <span style={styles.printSummaryValue}>{money(summary.revenue)}</span>
          </div>
          <div style={styles.printSummaryItem}>
            <span style={styles.printSummaryLabel}>Collections</span>
            <span style={styles.printSummaryValue}>{money(summary.collections)}</span>
          </div>
          <div style={styles.printSummaryItem}>
            <span style={styles.printSummaryLabel}>Receivables</span>
            <span style={styles.printSummaryValue}>{money(summary.receivables)}</span>
          </div>
          <div style={styles.printSummaryItem}>
            <span style={styles.printSummaryLabel}>Expenses</span>
            <span style={styles.printSummaryValue}>{money(summary.expenses)}</span>
          </div>
          <div style={styles.printSummaryItem}>
            <span style={styles.printSummaryLabel}>Net Profit</span>
            <span style={styles.printSummaryValue}>{money(summary.netProfit)}</span>
          </div>
        </div>
      </div>

      <div style={styles.chipsRow}>
        <div style={styles.chip}>{activeViewingLabel}</div>
        <div style={styles.chip}>Focus: {activeFocusLabel}</div>
        <div style={styles.chip}>Range: {selectedDateRangeLabel}</div>

        {selectedFocus !== "all" && (
          <button
            onClick={() => setSelectedFocus("all")}
            style={styles.clearButton}
          >
            Clear focus
          </button>
        )}

        {selectedDepartmentKey && (
          <button
            onClick={() => setSelectedDepartmentKey(null)}
            style={styles.clearButton}
          >
            Clear department row filter
          </button>
        )}
      </div>

      <div style={styles.cardsGrid}>
        <MetricCard
          title="Revenue"
          value={money(summary.revenue)}
          note="All visible departments"
          accent="#D1A84B"
          active={selectedFocus === "revenue"}
          onClick={() => {
            setSelectedFocus("revenue");
            openDashboardFocusedView({ type: "kpi", focus: "revenue", title: "Revenue Drill-Down" });
          }}
        />
        <MetricCard
          title="Collections"
          value={money(summary.collections)}
          note="Ledger collections"
          accent="#2563EB"
          active={selectedFocus === "collections"}
          onClick={() => {
            setSelectedFocus("collections");
            openDashboardFocusedView({ type: "kpi", focus: "collections", title: "Collections Drill-Down" });
          }}
        />
        <MetricCard
          title="Receivables"
          value={money(summary.receivables)}
          note="Ledger receivables"
          accent="#F59E0B"
          active={selectedFocus === "receivables"}
          onClick={() => {
            setSelectedFocus("receivables");
            openDashboardFocusedView({ type: "kpi", focus: "receivables", title: "Receivables Drill-Down" });
          }}
        />
        <MetricCard
          title="Expenses"
          value={money(summary.expenses)}
          note="Operational spending"
          accent="#EF4444"
          active={selectedFocus === "expenses"}
          onClick={() => {
            setSelectedFocus("expenses");
            openDashboardFocusedView({ type: "kpi", focus: "expenses", title: "Expenses Drill-Down" });
          }}
        />
        <MetricCard
          title="Net Profit"
          value={money(summary.netProfit)}
          note="Revenue minus expenses"
          accent="#10B981"
          onClick={() =>
            openDashboardFocusedView({ type: "kpi", focus: "netProfit", title: "Net Profit Drill-Down" })
          }
        />
        <MetricCard
          title="Transactions"
          value={String(summary.transactions)}
          note={`Within ${selectedDateRangeLabel.toLowerCase()}`}
          accent="#94A3B8"
          onClick={() =>
            openDashboardFocusedView({ type: "kpi", focus: "transactions", title: "Transaction Drill-Down" })
          }
        />
        <MetricCard
          title="Cash"
          value={money(summary.cash)}
          note="Cash payments"
          accent="#22C55E"
          onClick={() =>
            openDashboardFocusedView({ type: "kpi", focus: "cash", title: "Cash Collections" })
          }
        />
        <MetricCard
          title="MoMo"
          value={money(summary.momo)}
          note="Mobile money"
          accent="#8B5CF6"
          onClick={() =>
            openDashboardFocusedView({ type: "kpi", focus: "momo", title: "MoMo Collections" })
          }
        />
        <MetricCard
          title="Card"
          value={money(summary.card)}
          note="Card payments"
          accent="#3B82F6"
          onClick={() =>
            openDashboardFocusedView({ type: "kpi", focus: "card", title: "Card Collections" })
          }
        />
      </div>

      <div style={styles.panelTabsRow}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            style={{
              ...styles.panelTab,
              ...(activeTab === tab.key ? styles.panelTabActive : {}),
            }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          <ChartCard title="Smart Alerts" helper="What needs attention right now">
            {smartAlerts.length === 0 ? (
              <div style={styles.emptyState}>No alerts at the moment.</div>
            ) : (
              <div style={styles.alertsGrid}>
                {smartAlerts.map((alert) => (
                  <ClickableCard
                    key={alert.id}
                    onClick={() => {
                      if (alert.departmentKey) setSelectedDepartmentKey(alert.departmentKey);
                      if (alert.type === "high_expense") setSelectedFocus("expenses");
                      if (alert.type === "collection_risk") setSelectedFocus("receivables");
                      if (alert.type === "top_performer") setSelectedFocus("revenue");
                      if (alert.type === "loss_making_department") setSelectedFocus("all");
                      if (alert.type === "no_activity") setSelectedFocus("all");
                      if (alert.type === "unusual_activity") setSelectedFocus("all");
                      setActiveTab(
                        alert.type === "loss_making_department" ||
                          alert.type === "high_expense"
                          ? "expenses"
                          : "activity"
                      );
                      openDashboardFocusedView({ type: "alert", alert });
                    }}
                    style={{
                      ...styles.alertCard,
                      ...(alert.severity === "danger"
                        ? styles.alertDanger
                        : alert.severity === "warning"
                        ? styles.alertWarning
                        : alert.severity === "success"
                        ? styles.alertSuccess
                        : styles.alertInfo),
                    }}
                    hint="Click to view"
                    ariaLabel={`View alert details: ${alert.title}`}
                  >
                    <div style={styles.alertTitle}>
                      {alert.title}
                      <span
                        style={{
                          ...styles.alertBadge,
                          ...(alert.severity === "danger"
                            ? styles.alertBadgeDanger
                            : alert.severity === "warning"
                            ? styles.alertBadgeWarning
                            : alert.severity === "success"
                            ? styles.alertBadgeSuccess
                            : styles.alertBadgeInfo),
                        }}
                      >
                        {alert.severity}
                      </span>
                    </div>
                    <div style={styles.alertMessage}>{alert.message}</div>
                    <div style={styles.alertAction}>{alert.recommendedAction}</div>
                  </ClickableCard>
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Recommended Actions" helper="Suggested next steps">
            {recommendedActions.length === 0 ? (
              <div style={styles.emptyState}>No recommended actions at this time.</div>
            ) : (
              <div style={styles.alertsGrid}>
                {recommendedActions.map((action) => (
                  <ClickableCard
                    key={action.id}
                    onClick={() => openDashboardFocusedView({ type: "action", action })}
                    style={{
                      ...styles.alertCard,
                      ...(action.severity === "high"
                        ? styles.alertDanger
                        : action.severity === "medium"
                        ? styles.alertWarning
                        : styles.alertInfo),
                    }}
                    hint="View details"
                    ariaLabel={`View recommended action: ${action.title}`}
                  >
                    <div style={styles.alertTitle}>
                      {action.title}
                      <span
                        style={{
                          ...styles.alertBadge,
                          ...(action.severity === "high"
                            ? styles.alertBadgeDanger
                            : action.severity === "medium"
                            ? styles.alertBadgeWarning
                            : styles.alertBadgeInfo),
                        }}
                      >
                        {action.severity}
                      </span>
                    </div>

                    <div style={styles.alertMessage}>{action.description}</div>

                    {action.departmentKey ? (
                      <div style={styles.alertAction}>
                        Department: {getDepartmentLabel(action.departmentKey, departmentOptions)}
                      </div>
                    ) : null}
                  </ClickableCard>
                ))}
              </div>
            )}
          </ChartCard>

          {departmentRootCause && (
            <ChartCard
              title="Breakdown Panel"
              helper={getDepartmentLabel(departmentRootCause.departmentKey, departmentOptions)}
            >
              <div style={styles.breakdownGrid}>
                <div style={styles.insightCard}>
                  <div style={styles.insightLabel}>Revenue Breakdown</div>
                  <div style={styles.breakdownLine}>
                    <span>Total transactions</span>
                    <strong>{departmentRootCause.revenue.transactions}</strong>
                  </div>
                  <div style={styles.breakdownLine}>
                    <span>Average sale value</span>
                    <strong>{money(departmentRootCause.revenue.averageSale)}</strong>
                  </div>
                </div>

                <div style={styles.insightCard}>
                  <div style={styles.insightLabel}>Expense Breakdown</div>
                  {departmentRootCause.expenses.topCategories.length === 0 ? (
                    <div style={styles.insightSub}>No expense categories found.</div>
                  ) : (
                    departmentRootCause.expenses.topCategories.map((category) => (
                      <div key={category.category} style={styles.breakdownLine}>
                        <span>{formatCategoryLabel(category.category)}</span>
                        <strong>
                          {money(category.amount)} ({category.percent.toFixed(0)}%)
                        </strong>
                      </div>
                    ))
                  )}
                </div>

                <div style={styles.insightCard}>
                  <div style={styles.insightLabel}>Net Analysis</div>
                  <div style={styles.breakdownLine}>
                    <span>Revenue vs expenses gap</span>
                    <strong>{money(departmentRootCause.net.gap)}</strong>
                  </div>
                  <div style={styles.insightSub}>{departmentRootCause.causeInsight}</div>
                  <div style={styles.alertAction}>{departmentRootCause.actionHint}</div>
                </div>
              </div>
            </ChartCard>
          )}

          <div style={styles.intelligenceGrid}>
            <div style={styles.sectionCard}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Top Expense Category</h2>
                <span style={styles.helperText}>Highest cost bucket</span>
              </div>

              {expenseAnalytics.topCategory ? (
                <div style={styles.insightCard}>
                  <div style={styles.insightLabel}>
                    {formatCategoryLabel(expenseAnalytics.topCategory.category)}
                  </div>
                  <div style={styles.insightValue}>
                    {money(expenseAnalytics.topCategory.amount)}
                  </div>
                  <div style={styles.insightSub}>
                    {expenseAnalytics.topCategory.percent.toFixed(1)}% of total expenses
                  </div>
                </div>
              ) : (
                <div style={styles.emptyState}>No expense records yet.</div>
              )}
            </div>

            <div
              style={{
                ...styles.sectionCard,
                border:
                  summary.netProfit < 0
                    ? "1px solid #FCA5A5"
                    : "1px solid #BBF7D0",
                background: summary.netProfit < 0 ? "#FEF2F2" : "#F0FDF4",
              }}
            >
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Financial Alert</h2>
                <span style={styles.helperText}>Performance signal</span>
              </div>

              {summary.netProfit < 0 ? (
                <div>
                  <div style={{ ...styles.insightLabel, color: "#991B1B" }}>
                    Operating at a loss
                  </div>
                  <div style={{ ...styles.insightSub, color: "#7F1D1D" }}>
                    Expenses are higher than revenue for this selected period.
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ ...styles.insightLabel, color: "#166534" }}>
                    Positive net performance
                  </div>
                  <div style={{ ...styles.insightSub, color: "#166534" }}>
                    Revenue is currently covering expenses for this selected period.
                  </div>
                </div>
              )}
            </div>

            <div style={styles.sectionCard}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Revenue Trend</h2>
                <span style={styles.helperText}>Today vs Yesterday</span>
              </div>

              <div style={styles.insightCard}>
                <div style={styles.insightLabel}>Revenue Today</div>
                <div style={styles.insightValue}>
                  {money(todayVsYesterday.todayRevenue)}
                </div>

                <div style={styles.insightSub}>
                  Yesterday: {money(todayVsYesterday.yesterdayRevenue)}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontWeight: 800,
                    fontSize: 16,
                    color: todayVsYesterday.change >= 0 ? "#166534" : "#B91C1C",
                  }}
                >
                  {todayVsYesterday.change >= 0 ? "↑" : "↓"}{" "}
                  {Math.abs(todayVsYesterday.change).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          <ChartCard title="Today vs Yesterday by Department" helper="Which department changed the overall trend">
            {departmentTodayVsYesterday.length === 0 ? (
              <div style={styles.emptyState}>No department day comparison data yet.</div>
            ) : (
              <div style={styles.deptCompareList}>
                {departmentTodayVsYesterday.map((row) => (
                  <div key={row.department} style={styles.deptCompareCard}>
                    <div style={styles.deptCompareTop}>
                      <div>
                        <div style={styles.deptCompareTitle}>
                          {getDepartmentLabel(row.department, departmentOptions)}
                        </div>
                        <div style={styles.deptCompareMeta}>
                          Today: {money(row.today)} • Yesterday: {money(row.yesterday)}
                        </div>
                      </div>

                      <div
                        style={{
                          ...styles.deptCompareBadge,
                          ...(row.status === "up"
                            ? styles.deptCompareUp
                            : row.status === "down"
                            ? styles.deptCompareDown
                            : row.status === "new"
                            ? styles.deptCompareNew
                            : styles.deptCompareFlat),
                        }}
                      >
                        {row.status === "up"
                          ? `↑ ${Math.abs(row.change).toFixed(1)}%`
                          : row.status === "down"
                          ? `↓ ${Math.abs(row.change).toFixed(1)}%`
                          : row.status === "new"
                          ? "New today"
                          : "No change"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Department Leaderboard" helper="Top performing departments by revenue">
            {departmentLeaderboard.length === 0 ? (
              <div style={styles.emptyState}>No department data available yet.</div>
            ) : (
              <div style={styles.leaderboardList}>
                {departmentLeaderboard.slice(0, 5).map((row) => (
                  <ClickableCard
                    key={row.department}
                    style={styles.leaderboardCard}
                    onClick={() => {
                      setSelectedDepartmentKey(row.department);
                      openDashboardFocusedView({
                        type: "department",
                        departmentKey: row.department,
                        title: `${getDepartmentLabel(row.department, departmentOptions)} Department`,
                      });
                    }}
                    hint="View department"
                    ariaLabel={`View ${getDepartmentLabel(row.department, departmentOptions)} department details`}
                  >
                    <div style={styles.leaderboardTop}>
                      <div style={styles.leaderboardLeft}>
                        <div style={styles.rankBadge}>{row.rank}</div>
                        <div>
                          <div style={styles.leaderboardDept}>
                            {getDepartmentLabel(row.department, departmentOptions)}
                          </div>
                          <div style={styles.leaderboardMeta}>
                            Revenue: {money(row.revenue)} • Expenses: {money(row.expenses)}
                          </div>
                          <div style={styles.insightSub}>{row.insight}</div>
                        </div>
                      </div>

                      <div style={styles.leaderboardRight}>
                        <div
                          style={{
                            ...styles.leaderboardNet,
                            color: row.net < 0 ? "#B91C1C" : "#166534",
                          }}
                        >
                          {money(row.net)}
                        </div>
                        <div
                          style={{
                            ...styles.leaderboardStatus,
                            ...(row.status === "Top Performer"
                              ? styles.leaderboardStatusStrong
                              : row.status === "Loss" || row.status === "Risk"
                              ? styles.leaderboardStatusLoss
                              : styles.leaderboardStatusWatch),
                          }}
                        >
                          {row.status}
                        </div>
                      </div>
                    </div>

                    <div style={styles.leaderboardBottom}>
                      <span>Transactions: {row.transactions}</span>
                      <span>Margin: {row.marginPct.toFixed(1)}%</span>
                      <span>Collections: {row.collectionPct.toFixed(1)}%</span>
                    </div>
                  </ClickableCard>
                ))}
              </div>
            )}
          </ChartCard>

          <div style={styles.chartGrid}>
            <ChartCard title="Revenue vs Expenses Trend" helper="Quick period trend">
              {overviewTrendData.length === 0 ? (
                <div style={styles.emptyState}>No trend data available.</div>
              ) : (
                <div style={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overviewTrendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <Tooltip formatter={(value: any) => money(Number(value))} />
                      <Legend />
                      <Bar
                        dataKey="revenue"
                        name="Revenue"
                        fill="#0F172A"
                        radius={[6, 6, 0, 0]}
                      />
                      <Bar
                        dataKey="expenses"
                        name="Expenses"
                        fill="#DC2626"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Payment Mix Chart" helper="Revenue by method">
              {paymentChartData.length === 0 ? (
                <div style={styles.emptyState}>No payment chart data available.</div>
              ) : (
                <div style={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentChartData}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={85}
                        label
                      >
                        {paymentChartData.map((_, index) => (
                          <Cell key={index} fill={pieColors[index % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => money(Number(value))} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Hourly Sales Trend" helper="Sales by hour of day">
            {hourlySalesTrend.every((row) => row.sales === 0) ? (
              <div style={styles.emptyState}>No hourly sales data available yet.</div>
            ) : (
              <div style={styles.chartWrapWide}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hourlySalesTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      interval={1}
                      angle={-35}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis />
                    <Tooltip formatter={(value: any) => money(Number(value))} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="sales"
                      name="Sales"
                      stroke="#0F172A"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <div style={styles.sectionCard}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Department Highlights</h2>
              <span style={styles.helperText}>Fast management insights</span>
            </div>

            <div style={styles.highlightsGrid}>
              <div style={styles.insightCard}>
                <div style={styles.insightLabel}>Highest Revenue</div>
                <div style={styles.insightValue}>
                  {departmentHighlights.topRevenue
                    ? money(departmentHighlights.topRevenue.revenue)
                    : "0.00"}
                </div>
                <div style={styles.insightSub}>
                  {departmentHighlights.topRevenue
                    ? getDepartmentLabel(
                        departmentHighlights.topRevenue.department,
                        departmentOptions
                      )
                    : "No data"}
                </div>
              </div>

              <div style={styles.insightCard}>
                <div style={styles.insightLabel}>Highest Expense</div>
                <div style={styles.insightValue}>
                  {departmentHighlights.topExpense
                    ? money(departmentHighlights.topExpense.expenses)
                    : "0.00"}
                </div>
                <div style={styles.insightSub}>
                  {departmentHighlights.topExpense
                    ? getDepartmentLabel(
                        departmentHighlights.topExpense.department,
                        departmentOptions
                      )
                    : "No data"}
                </div>
              </div>

              <div style={styles.insightCard}>
                <div style={styles.insightLabel}>Best Net Profit</div>
                <div style={styles.insightValue}>
                  {departmentHighlights.topProfit
                    ? money(departmentHighlights.topProfit.net)
                    : "0.00"}
                </div>
                <div style={styles.insightSub}>
                  {departmentHighlights.topProfit
                    ? getDepartmentLabel(
                        departmentHighlights.topProfit.department,
                        departmentOptions
                      )
                    : "No data"}
                </div>
              </div>

              <div style={styles.insightCard}>
                <div style={styles.insightLabel}>Needs Attention</div>
                <div style={styles.insightValue}>
                  {departmentHighlights.underperforming
                    ? money(departmentHighlights.underperforming.receivables)
                    : "0.00"}
                </div>
                <div style={styles.insightSub}>
                  {departmentHighlights.underperforming
                    ? getDepartmentLabel(
                        departmentHighlights.underperforming.department,
                        departmentOptions
                      )
                    : "No data"}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === "payments" && (
        <div style={styles.chartGrid}>
          <ChartCard title="Payment Mix" helper="Revenue split by method">
            {paymentMix.length === 0 ? (
              <div style={styles.emptyState}>No payment data in the selected filter.</div>
            ) : (
              <div style={styles.paymentMixList}>
                {paymentMix.map((item) => (
                  <div key={item.label} style={styles.paymentMixRow}>
                    <div style={styles.paymentMixTop}>
                      <span>{item.label}</span>
                      <span>
                        {money(item.value)} • {item.percent.toFixed(1)}%
                      </span>
                    </div>

                    <div style={styles.progressTrack}>
                      <div
                        style={{
                          ...styles.progressFill,
                          ...styles.progressFillProfit,
                          width: `${Math.max(4, item.percent)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Payment Pie Chart" helper="Visual payment mix">
            {paymentChartData.length === 0 ? (
              <div style={styles.emptyState}>No chart data available.</div>
            ) : (
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentChartData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={95}
                      label
                    >
                      {paymentChartData.map((_, index) => (
                        <Cell key={index} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => money(Number(value))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>
      )}

      {activeTab === "expenses" && (
        <>
          <div style={styles.chartGrid}>
            <ChartCard title="Expense Mix" helper="Where money is going">
              {expenseAnalytics.rows.length === 0 ? (
                <div style={styles.emptyState}>No expense data in the selected filter.</div>
              ) : (
                <div style={styles.paymentMixList}>
                  {expenseAnalytics.rows.map((item) => (
                    <div key={item.category} style={styles.paymentMixRow}>
                      <div style={styles.paymentMixTop}>
                        <span>{formatCategoryLabel(item.category)}</span>
                        <span>
                          {money(item.amount)} • {item.percent.toFixed(1)}%
                        </span>
                      </div>

                      <div style={styles.progressTrack}>
                        <div
                          style={{
                            ...styles.progressFill,
                            ...styles.progressFillProfit,
                            width: `${Math.max(4, item.percent)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>

            <ChartCard title="Expense Category Chart" helper="Expense by category">
              {expenseChartData.length === 0 ? (
                <div style={styles.emptyState}>No expense chart data available.</div>
              ) : (
                <div style={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={expenseChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value: any) => money(Number(value))} />
                      <Bar
                        dataKey="value"
                        name="Expense"
                        fill="#DC2626"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Department Expense Analytics" helper="Highest spending departments">
            {departmentExpenseAnalytics.length === 0 ? (
              <div style={styles.emptyState}>No expense data in the selected filter.</div>
            ) : (
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseDeptChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => money(Number(value))} />
                    <Bar
                      dataKey="amount"
                      name="Expense Total"
                      fill="#DC2626"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </>
      )}

      {activeTab === "departments" && (
        <>
          <ChartCard title="Today vs Yesterday by Department" helper="Department-level daily comparison">
            {departmentTodayVsYesterday.length === 0 ? (
              <div style={styles.emptyState}>No department day comparison data yet.</div>
            ) : (
              <div style={styles.deptCompareList}>
                {departmentTodayVsYesterday.map((row) => (
                  <div key={row.department} style={styles.deptCompareCard}>
                    <div style={styles.deptCompareTop}>
                      <div>
                        <div style={styles.deptCompareTitle}>
                          {getDepartmentLabel(row.department, departmentOptions)}
                        </div>
                        <div style={styles.deptCompareMeta}>
                          Today: {money(row.today)} • Yesterday: {money(row.yesterday)}
                        </div>
                      </div>

                      <div
                        style={{
                          ...styles.deptCompareBadge,
                          ...(row.status === "up"
                            ? styles.deptCompareUp
                            : row.status === "down"
                            ? styles.deptCompareDown
                            : row.status === "new"
                            ? styles.deptCompareNew
                            : styles.deptCompareFlat),
                        }}
                      >
                        {row.status === "up"
                          ? `↑ ${Math.abs(row.change).toFixed(1)}%`
                          : row.status === "down"
                          ? `↓ ${Math.abs(row.change).toFixed(1)}%`
                          : row.status === "new"
                          ? "New today"
                          : "No change"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Department Day Comparison Chart" helper="Today vs yesterday revenue by department">
            {departmentDayComparisonChart.length === 0 ? (
              <div style={styles.emptyState}>No department day chart data available.</div>
            ) : (
              <div style={styles.chartWrapWide}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={departmentDayComparisonChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => money(Number(value))} />
                    <Legend />
                    <Bar
                      dataKey="today"
                      name="Today"
                      fill="#0F172A"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="yesterday"
                      name="Yesterday"
                      fill="#94A3B8"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Department Leaderboard" helper="Ranked by revenue">
            {departmentLeaderboard.length === 0 ? (
              <div style={styles.emptyState}>No department data available yet.</div>
            ) : (
              <div style={styles.leaderboardList}>
                {departmentLeaderboard.map((row) => (
                  <ClickableCard
                    key={row.department}
                    style={styles.leaderboardCard}
                    onClick={() => {
                      setSelectedDepartmentKey(row.department);
                      openDashboardFocusedView({
                        type: "department",
                        departmentKey: row.department,
                        title: `${getDepartmentLabel(row.department, departmentOptions)} Department`,
                      });
                    }}
                    hint="View department"
                    ariaLabel={`View ${getDepartmentLabel(row.department, departmentOptions)} department details`}
                  >
                    <div style={styles.leaderboardTop}>
                      <div style={styles.leaderboardLeft}>
                        <div style={styles.rankBadge}>{row.rank}</div>
                        <div>
                          <div style={styles.leaderboardDept}>
                            {getDepartmentLabel(row.department, departmentOptions)}
                          </div>
                          <div style={styles.leaderboardMeta}>
                            Revenue: {money(row.revenue)} • Expenses: {money(row.expenses)}
                          </div>
                          <div style={styles.insightSub}>{row.insight}</div>
                        </div>
                      </div>

                      <div style={styles.leaderboardRight}>
                        <div
                          style={{
                            ...styles.leaderboardNet,
                            color: row.net < 0 ? "#B91C1C" : "#166534",
                          }}
                        >
                          {money(row.net)}
                        </div>
                        <div
                          style={{
                            ...styles.leaderboardStatus,
                            ...(row.status === "Top Performer"
                              ? styles.leaderboardStatusStrong
                              : row.status === "Loss" || row.status === "Risk"
                              ? styles.leaderboardStatusLoss
                              : styles.leaderboardStatusWatch),
                          }}
                        >
                          {row.status}
                        </div>
                      </div>
                    </div>

                    <div style={styles.leaderboardBottom}>
                      <span>Transactions: {row.transactions}</span>
                      <span>Margin: {row.marginPct.toFixed(1)}%</span>
                      <span>Collections: {row.collectionPct.toFixed(1)}%</span>
                    </div>
                  </ClickableCard>
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Department Performance" helper="Revenue vs expenses by department">
            {departmentPerformance.length === 0 ? (
              <div style={styles.emptyState}>No transactions found for this filter.</div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.thLeft}>Department</th>
                    <th style={styles.thRight}>Transactions</th>
                    <th style={styles.thRight}>Revenue</th>
                    <th style={styles.thRight}>Collections</th>
                    <th style={styles.thRight}>Receivables</th>
                    <th style={styles.thRight}>Expenses</th>
                    <th style={styles.thRight}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {departmentPerformance.map((row) => {
                    const active = selectedDepartmentKey === row.department;

                    return (
                      <tr
                        key={row.department}
                        onClick={() =>
                          {
                            setSelectedDepartmentKey(row.department);
                            openDashboardFocusedView({
                              type: "department",
                              departmentKey: row.department,
                              title: `${getDepartmentLabel(row.department, departmentOptions)} Department`,
                            });
                          }
                        }
                        style={{
                          ...styles.tableRow,
                          cursor: "pointer",
                          ...(active ? styles.tableRowActive : {}),
                        }}
                      >
                        <td style={styles.tdLeft}>
                          <div>{getDepartmentLabel(row.department, departmentOptions)}</div>
                          <div style={styles.insightSub}>
                            {row.badge} • {row.insight}
                          </div>
                        </td>
                        <td style={styles.tdRight}>{row.transactions}</td>
                        <td style={styles.tdRight}>{money(row.revenue)}</td>
                        <td style={styles.tdRight}>{money(row.collections)}</td>
                        <td
                          style={{
                            ...styles.tdRight,
                            color: row.receivables > 0 ? "#B45309" : "#0F172A",
                            fontWeight: row.receivables > 0 ? 800 : 700,
                          }}
                        >
                          {money(row.receivables)}
                        </td>
                        <td style={styles.tdRight}>{money(row.expenses)}</td>
                        <td
                          style={{
                            ...styles.tdRight,
                            color: row.net < 0 ? "#B91C1C" : "#0F172A",
                            fontWeight: 800,
                          }}
                        >
                          {money(row.net)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ChartCard>

          <div style={styles.chartGrid}>
            <ChartCard title="Department Revenue vs Expense Chart" helper="Department comparison">
              {departmentChartData.length === 0 ? (
                <div style={styles.emptyState}>No department chart data available.</div>
              ) : (
                <div style={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={departmentChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value: any) => money(Number(value))} />
                      <Legend />
                      <Bar
                        dataKey="revenue"
                        name="Revenue"
                        fill="#0F172A"
                        radius={[6, 6, 0, 0]}
                      />
                      <Bar
                        dataKey="expenses"
                        name="Expenses"
                        fill="#DC2626"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Department Net Profit Chart" helper="Profitability by department">
              {departmentChartData.length === 0 ? (
                <div style={styles.emptyState}>No net chart data available.</div>
              ) : (
                <div style={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={departmentChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value: any) => money(Number(value))} />
                      <Bar
                        dataKey="net"
                        name="Net Profit"
                        fill="#10B981"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Department Revenue Bars" helper="Visual comparison across departments">
            {departmentProfitBars.length === 0 ? (
              <div style={styles.emptyState}>No department performance data yet.</div>
            ) : (
              <div style={styles.paymentMixList}>
                {departmentProfitBars.map((row) => (
                  <div key={row.department} style={styles.paymentMixRow}>
                    <div style={styles.paymentMixTop}>
                      <span>{getDepartmentLabel(row.department, departmentOptions)}</span>
                      <span>{money(row.revenue)}</span>
                    </div>

                    <div style={styles.progressTrack}>
                      <div
                        style={{
                          ...styles.progressFill,
                          ...(row.tone === "loss"
                            ? styles.progressFillLoss
                            : styles.progressFillProfit),
                          width: `${Math.max(4, row.revenueWidth)}%`,
                        }}
                      />
                    </div>

                    <div
                      style={{
                        ...styles.insightSub,
                        color: row.net < 0 ? "#B91C1C" : "#166534",
                      }}
                    >
                      Net: {money(row.net)} • Expenses: {money(row.expenses)} • Tx:{" "}
                      {row.transactions}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </>
      )}

      {activeTab === "activity" && (
        <div style={styles.activityGrid}>
          <div style={styles.sectionCard}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Top 5 Recent Transactions</h2>
              <span style={styles.helperText}>{activeFocusLabel}</span>
            </div>

            {recentActivity.transactions.length === 0 ? (
              <div style={styles.emptyState}>No recent transactions found.</div>
            ) : (
              <div style={styles.activityList}>
                {recentActivity.transactions.map((item) => (
                  <button
                    key={`tx-${item.id}`}
                    style={styles.activityCardButton}
                    onClick={() =>
                      openDashboardFocusedView({ type: "transaction", tx: item.raw })
                    }
                  >
                    <div style={styles.activityCard}>
                      <div style={styles.activityTop}>
                        <span style={styles.activityBadgePositive}>Transaction</span>
                        <span style={styles.activityAmount}>+ {money(item.amount)}</span>
                      </div>
                      <div style={styles.activityTitle}>{item.title}</div>
                      <div style={styles.activitySub}>{item.subtitle}</div>
                      <div style={styles.activityMeta}>
                        <span>{formatDateTime(item.time)}</span>
                        <span>{item.department}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={styles.sectionCard}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Top 5 Recent Expenses</h2>
              <span style={styles.helperText}>{activeFocusLabel}</span>
            </div>

            {recentActivity.expenses.length === 0 ? (
              <div style={styles.emptyState}>No recent expenses found.</div>
            ) : (
              <div style={styles.activityList}>
                {recentActivity.expenses.map((item) => (
                  <button
                    key={`expense-${item.id}`}
                    style={styles.activityCardButton}
                    onClick={() =>
                      openDashboardFocusedView({ type: "expense", expense: item.raw })
                    }
                  >
                    <div style={styles.activityCard}>
                      <div style={styles.activityTop}>
                        <span style={styles.activityBadgeNegative}>Expense</span>
                        <span style={styles.activityAmountNegative}>- {money(item.amount)}</span>
                      </div>
                      <div style={styles.activityTitle}>{item.title}</div>
                      <div style={styles.activitySub}>{item.subtitle}</div>
                      <div style={styles.activityMeta}>
                        <span>{formatDateTime(item.time)}</span>
                        <span>{item.department}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedTx && (
        <div style={styles.detailCard}>
          <div style={styles.detailHeader}>
            <h3 style={styles.detailTitle}>Transaction Details</h3>
            <button onClick={() => setSelectedTx(null)} style={styles.closeButton}>
              Close
            </button>
          </div>

          <div style={styles.detailGrid}>
            <DetailItem label="Tx ID" value={selectedTx?.txId || selectedTx?.id || "—"} />
            <DetailItem label="Time" value={formatDateTime(getTxTime(selectedTx))} />
            <DetailItem label="Transaction Time" value={formatDateTime(getTxTime(selectedTx))} />
            <DetailItem
              label="Department"
              value={getDepartmentLabel(
                getDepartmentValue(selectedTx),
                departmentOptions
              )}
            />
            <DetailItem label="Source" value={getAccountingSourceLabel(selectedTx)} />
            <DetailItem label="Booking Code" value={selectedTx?.bookingCode || "—"} />
            <DetailItem label="Room" value={selectedTx?.roomNo || selectedTx?.room || "—"} />
            <DetailItem label="Staff" value={getStaffLabel(selectedTx)} />
            <DetailItem
              label="Customer"
              value={selectedTx?.customerName || selectedTx?.guestName || "-"}
            />
            <DetailItem
              label="Payment Method"
              value={selectedTx?.paymentMethod || "—"}
            />
            <DetailItem label="Status" value={statusLabel(selectedTx)} />
            <DetailItem
              label="Shift Status"
              value={formatShiftStatus(selectedTx?.shiftReconciliationStatus || "unclosed")}
            />
            <DetailItem label="Shift ID" value={selectedTx?.shiftId || "-"} />
            <DetailItem label="Submitted At" value={selectedTx?.submittedAt ? formatDateTime(selectedTx.submittedAt) : "-"} />
            <DetailItem label="Submitted By" value={selectedTx?.submittedBy || "-"} />
            <DetailItem label="Submission Mode" value={selectedTx?.submissionMode || "-"} />
            <DetailItem
              label="Customer Phone"
              value={selectedTx?.customerPhone || selectedTx?.phone || "—"}
            />
            <DetailItem label="Total" value={money(getTxAmount(selectedTx))} />
          </div>

          <TransactionItemBreakdown tx={selectedTx} />
        </div>
      )}

      {selectedExpense && (
        <div style={styles.detailCard}>
          <div style={styles.detailHeader}>
            <h3 style={styles.detailTitle}>Expense Details</h3>
            <button
              onClick={() => setSelectedExpense(null)}
              style={styles.closeButton}
            >
              Close
            </button>
          </div>

          <div style={styles.detailGrid}>
            <DetailItem label="Time" value={formatDateTime(getTxTime(selectedExpense))} />
            <DetailItem
              label="Department"
              value={getDepartmentLabel(
                getExpenseDepartmentValue(selectedExpense),
                departmentOptions
              )}
            />
            <DetailItem
              label="Category"
              value={formatCategoryLabel(
                selectedExpense?.category || selectedExpense?.sourceType
              )}
            />
            <DetailItem
              label="Amount"
              value={money(getTxAmount(selectedExpense))}
            />
            <DetailItem
              label="Entered By"
              value={
                selectedExpense?.createdBy?.name ||
                selectedExpense?.createdBy?.employeeId ||
                selectedExpense?.enteredByName ||
                selectedExpense?.enteredBy ||
                "—"
              }
            />
            <DetailItem
              label="Description"
              value={selectedExpense?.description || "—"}
            />
            <DetailItem label="Note" value={selectedExpense?.note || "—"} />
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    background: "#F6F8FB",
    minHeight: "100vh",
  },
  headerBlock: {
    marginBottom: 18,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    color: "#0F172A",
  },
  subtitle: {
    margin: "6px 0 0",
    fontSize: 14,
    color: "#64748B",
    fontWeight: 500,
  },
  exportActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  exportButton: {
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  exportButtonPrimary: {
    border: "1px solid #0F172A",
    background: "#0F172A",
    color: "#FFFFFF",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  printSummaryCard: {
    background: "#FFFFFF",
    border: "1px solid #E5EAF3",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 2px 10px rgba(15, 23, 42, 0.03)",
  },
  printSummaryTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 12,
  },
  printSummaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  },
  printSummaryItem: {
    background: "#F8FAFC",
    border: "1px solid #E9EEF5",
    borderRadius: 12,
    padding: 12,
    display: "grid",
    gap: 6,
  },
  printSummaryLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#64748B",
  },
  printSummaryValue: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0F172A",
  },
  filtersRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 220px minmax(420px, 1fr)",
    gap: 12,
    marginBottom: 12,
  },
  searchInput: {
    height: 44,
    borderRadius: 12,
    border: "1px solid #DBE3EF",
    padding: "0 14px",
    fontSize: 14,
    outline: "none",
    background: "#FFFFFF",
  },
  select: {
    height: 44,
    borderRadius: 12,
    border: "1px solid #DBE3EF",
    padding: "0 12px",
    fontSize: 14,
    outline: "none",
    background: "#FFFFFF",
  },
  dateRangeControls: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 150px",
    gap: 10,
    alignItems: "end",
  },
  dateField: {
    display: "grid",
    gap: 4,
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: "#64748B",
  },
  dateInput: {
    height: 44,
    borderRadius: 12,
    border: "1px solid #DBE3EF",
    padding: "0 12px",
    fontSize: 14,
    outline: "none",
    background: "#FFFFFF",
    color: "#0F172A",
  },
  chipsRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  chip: {
    background: "#F7F1DE",
    color: "#1F2937",
    border: "1px solid #EADFB7",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 700,
  },
  clearButton: {
    border: "1px solid #DBE3EF",
    background: "#FFFFFF",
    borderRadius: 999,
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
  },
  cardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    border: "1px solid #E5EAF3",
    boxShadow: "0 2px 10px rgba(15, 23, 42, 0.03)",
  },
  metricCardButton: {
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
  },
  metricCardActive: {
    outline: "2px solid #0F172A",
    outlineOffset: 2,
  },
  metricTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#64748B",
    marginBottom: 10,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 6,
  },
  metricNote: {
    fontSize: 13,
    color: "#475569",
    fontWeight: 500,
  },
  sectionCard: {
    background: "#FFFFFF",
    borderRadius: 18,
    border: "1px solid #E5EAF3",
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 2px 10px rgba(15, 23, 42, 0.03)",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: "#0F172A",
  },
  helperText: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: 700,
  },
  emptyState: {
    padding: "16px 0",
    color: "#64748B",
    fontSize: 14,
    fontWeight: 500,
  },
  alertsGrid: {
    display: "grid",
    gap: 12,
  },
  alertCard: {
    borderRadius: 14,
    padding: 14,
    border: "1px solid transparent",
  },
  alertCardButton: {
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
  },
  actionCard: {
    borderRadius: 14,
    padding: 14,
    border: "1px solid #E5EAF3",
    background: "#FFFFFF",
  },
  alertDanger: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
  },
  alertWarning: {
    background: "#FFFBEB",
    border: "1px solid #FDE68A",
  },
  alertSuccess: {
    background: "#F0FDF4",
    border: "1px solid #BBF7D0",
  },
  alertInfo: {
    background: "#EFF6FF",
    border: "1px solid #BFDBFE",
  },
  alertTitle: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 6,
  },
  alertBadge: {
    borderRadius: 999,
    padding: "3px 8px",
    border: "1px solid rgba(15, 23, 42, 0.1)",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  alertBadgeDanger: {
    background: "#DC2626",
    color: "#FFFFFF",
  },
  alertBadgeWarning: {
    background: "#F59E0B",
    color: "#111827",
  },
  alertBadgeSuccess: {
    background: "#16A34A",
    color: "#FFFFFF",
  },
  alertBadgeInfo: {
    background: "#2563EB",
    color: "#FFFFFF",
  },
  actionBadgeHigh: {
    background: "#DC2626",
    color: "#FFFFFF",
  },
  actionBadgeMedium: {
    background: "#F59E0B",
    color: "#111827",
  },
  actionBadgeLow: {
    background: "#2563EB",
    color: "#FFFFFF",
  },
  alertMessage: {
    fontSize: 13,
    color: "#475569",
    fontWeight: 600,
    lineHeight: 1.45,
  },
  alertAction: {
    marginTop: 8,
    fontSize: 12,
    color: "#0F172A",
    fontWeight: 800,
  },
  focusedMode: {
    display: "grid",
    gap: 14,
  },
  intelligenceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 16,
    marginBottom: 16,
  },
  chartGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 16,
  },
  chartWrap: {
    width: "100%",
    minHeight: 300,
    height: 300,
  },
  chartWrapWide: {
    width: "100%",
    minHeight: 340,
    height: 340,
  },
  insightCard: {
    background: "#F8FAFC",
    border: "1px solid #E9EEF5",
    borderRadius: 14,
    padding: 16,
  },
  insightLabel: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 8,
  },
  insightValue: {
    fontSize: 28,
    fontWeight: 900,
    color: "#0F172A",
    marginBottom: 6,
  },
  insightSub: {
    fontSize: 13,
    color: "#475569",
    fontWeight: 600,
  },
  breakdownGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  },
  breakdownLine: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    fontSize: 13,
    color: "#334155",
    fontWeight: 600,
    marginTop: 8,
  },
  highlightsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  },
  deptCompareList: {
    display: "grid",
    gap: 12,
  },
  deptCompareCard: {
    background: "#F8FAFC",
    border: "1px solid #E9EEF5",
    borderRadius: 14,
    padding: 14,
  },
  deptCompareTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  deptCompareTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 4,
  },
  deptCompareMeta: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: 600,
  },
  deptCompareBadge: {
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 800,
  },
  deptCompareUp: {
    background: "#DCFCE7",
    color: "#166534",
  },
  deptCompareDown: {
    background: "#FEE2E2",
    color: "#991B1B",
  },
  deptCompareNew: {
    background: "#DBEAFE",
    color: "#1D4ED8",
  },
  deptCompareFlat: {
    background: "#E5E7EB",
    color: "#374151",
  },
  leaderboardList: {
    display: "grid",
    gap: 12,
  },
  leaderboardCard: {
    background: "#F8FAFC",
    border: "1px solid #E9EEF5",
    borderRadius: 14,
    padding: 14,
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
  },
  leaderboardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 10,
  },
  leaderboardLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  rankBadge: {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "#0F172A",
    color: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 14,
    flexShrink: 0,
  },
  leaderboardDept: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 4,
  },
  leaderboardMeta: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: 600,
  },
  leaderboardRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 8,
  },
  leaderboardNet: {
    fontSize: 18,
    fontWeight: 900,
  },
  leaderboardStatus: {
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 800,
  },
  leaderboardStatusStrong: {
    background: "#DCFCE7",
    color: "#166534",
  },
  leaderboardStatusWatch: {
    background: "#FEF3C7",
    color: "#92400E",
  },
  leaderboardStatusLoss: {
    background: "#FEE2E2",
    color: "#991B1B",
  },
  leaderboardBottom: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    fontSize: 12,
    color: "#475569",
    fontWeight: 700,
  },
  activityGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 16,
  },
  activityList: {
    display: "grid",
    gap: 12,
  },
  activityCardButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    textAlign: "left",
    cursor: "pointer",
  },
  activityCard: {
    background: "#F8FAFC",
    border: "1px solid #E9EEF5",
    borderRadius: 14,
    padding: 14,
  },
  activityTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  activityBadgePositive: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    padding: "4px 10px",
    background: "#DCFCE7",
    color: "#166534",
    fontSize: 12,
    fontWeight: 800,
  },
  activityBadgeNegative: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    padding: "4px 10px",
    background: "#FEE2E2",
    color: "#991B1B",
    fontSize: 12,
    fontWeight: 800,
  },
  activityAmount: {
    fontSize: 15,
    fontWeight: 800,
    color: "#166534",
  },
  activityAmountNegative: {
    fontSize: 15,
    fontWeight: 800,
    color: "#991B1B",
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 6,
  },
  activitySub: {
    fontSize: 13,
    color: "#475569",
    fontWeight: 600,
    marginBottom: 10,
  },
  activityMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    flexWrap: "wrap",
  },
  panelTabsRow: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  panelTab: {
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  panelTabActive: {
    background: "#0F172A",
    color: "#FFFFFF",
    border: "1px solid #0F172A",
    boxShadow: "none",
  },
  paymentMixList: {
    display: "grid",
    gap: 12,
  },
  paymentMixRow: {
    display: "grid",
    gap: 6,
  },
  paymentMixTop: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    color: "#334155",
    fontWeight: 700,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    background: "#EEF2F7",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  progressFillProfit: {
    background: "#0F172A",
  },
  progressFillLoss: {
    background: "#DC2626",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  thLeft: {
    textAlign: "left",
    padding: "12px 10px",
    fontSize: 13,
    color: "#475569",
    borderBottom: "1px solid #E9EEF5",
  },
  thRight: {
    textAlign: "right",
    padding: "12px 10px",
    fontSize: 13,
    color: "#475569",
    borderBottom: "1px solid #E9EEF5",
  },
  tdLeft: {
    textAlign: "left",
    padding: "14px 10px",
    fontSize: 14,
    color: "#0F172A",
    borderBottom: "1px solid #F1F5F9",
  },
  tdRight: {
    textAlign: "right",
    padding: "14px 10px",
    fontSize: 14,
    color: "#0F172A",
    borderBottom: "1px solid #F1F5F9",
  },
  tableRow: {
    cursor: "default",
  },
  tableRowActive: {
    background: "#F8FAFC",
  },
  detailCard: {
    background: "#FFFFFF",
    borderRadius: 18,
    border: "1px solid #E5EAF3",
    padding: 16,
    boxShadow: "0 2px 10px rgba(15, 23, 42, 0.03)",
    marginBottom: 16,
  },
  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  detailTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: "#0F172A",
  },
  closeButton: {
    border: "1px solid #DBE3EF",
    background: "#FFFFFF",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 700,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  },
  detailItem: {
    background: "#F8FAFC",
    border: "1px solid #E9EEF5",
    borderRadius: 12,
    padding: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 14,
    color: "#0F172A",
    fontWeight: 700,
  },
  itemBreakdown: {
    marginTop: 16,
  },
  itemBreakdownTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 8,
  },
  itemBreakdownEmpty: {
    marginTop: 16,
    padding: 12,
    border: "1px solid #E9EEF5",
    borderRadius: 12,
    background: "#F8FAFC",
    color: "#64748B",
    fontSize: 13,
    fontWeight: 700,
  },
  itemBreakdownTableWrap: {
    overflowX: "auto",
  },
  itemBreakdownTable: {
    width: "100%",
    borderCollapse: "collapse",
  },
  itemBreakdownThLeft: {
    textAlign: "left",
    padding: "10px",
    borderBottom: "1px solid #E9EEF5",
    color: "#475569",
    fontSize: 12,
  },
  itemBreakdownThRight: {
    textAlign: "right",
    padding: "10px",
    borderBottom: "1px solid #E9EEF5",
    color: "#475569",
    fontSize: 12,
  },
  itemBreakdownTdLeft: {
    textAlign: "left",
    padding: "10px",
    borderBottom: "1px solid #F1F5F9",
    color: "#0F172A",
    fontSize: 13,
    fontWeight: 700,
  },
  itemBreakdownTdRight: {
    textAlign: "right",
    padding: "10px",
    borderBottom: "1px solid #F1F5F9",
    color: "#0F172A",
    fontSize: 13,
    fontWeight: 700,
  },
};





