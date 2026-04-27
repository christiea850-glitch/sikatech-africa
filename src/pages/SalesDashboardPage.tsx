// src/pages/SalesDashboardPage.tsx
import React, { useMemo, useState } from "react";
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
import { useSales } from "../sales/SalesContext";
import { useExpenses } from "../expenses/ExpenseContext";
import { getAllBookings } from "../frontdesk/bookingsStorage";

type Tx = any;
type ExpenseRow = any;

type MainTab =
  | "overview"
  | "payments"
  | "expenses"
  | "departments"
  | "activity";

type AlertTone = "danger" | "warning" | "success" | "info";

type RangeFilter = "today" | "yesterday" | "week" | "month" | "all";
type QuickRangeFilter = RangeFilter | "custom";
type DateRange = { startDate: string; endDate: string };

function money(n: number) {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function upper(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function lower(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function formatDepartmentLabel(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "Unknown";

  return raw
    .split(/[-_\s]+/)
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

function getPaymentBucket(t: Tx) {
  const pm = upper(t?.paymentMethod);

  if (pm === "CASH") return "cash";
  if (pm === "MOMO") return "momo";
  if (pm === "CARD") return "card";
  if (pm === "TRANSFER" || pm === "BANK_TRANSFER") return "transfer";

  return "other";
}

function isRoomFolioSaleRecord(t: Tx) {
  return (
    lower(t?.paymentMode) === "post_to_room" ||
    lower(t?.paymentMethod) === "room_folio"
  );
}

function isGuestPayment(t: Tx) {
  return lower(t?.accountingSource) === "guest_payment";
}

function getTxAmount(t: Tx) {
  const value =
    Number(t?.grandTotal) ||
    Number(t?.total) ||
    Number(t?.amountPaid) ||
    Number(t?.amount) ||
    0;

  return Number.isFinite(value) ? value : 0;
}

function getRevenueAmount(t: Tx) {
  return isGuestPayment(t) ? 0 : getTxAmount(t);
}

function getCollectionAmount(t: Tx) {
  return lower(t?.accountingSource) === "room_folio_charge" ? 0 : getTxAmount(t);
}

function getTxTime(t: Tx) {
  return t?.createdAt || t?.timestamp || t?.date || "";
}

function parseDashboardDate(value: string) {
  const raw = String(value || "").trim();
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

function withinDateRange(dateValue: string, startDate: string, endDate: string) {
  if (!startDate && !endDate) return true;
  if (!dateValue) return false;

  const d = parseDashboardDate(dateValue);
  if (Number.isNaN(d.getTime())) return false;

  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T00:00:00`) : null;

  if (start && Number.isNaN(start.getTime())) return false;
  if (end && Number.isNaN(end.getTime())) return false;

  if (end) end.setDate(end.getDate() + 1);

  if (start && d < start) return false;
  if (end && d >= end) return false;

  return true;
}

function getSearchBlob(t: Tx) {
  return [
    t?.id,
    t?.txId,
    t?.departmentId,
    t?.departmentName,
    t?.department,
    t?.deptKey,
    t?.staffId,
    t?.staffName,
    t?.employeeId,
    t?.customerPhone,
    t?.phone,
    t?.roomNumber,
    t?.room,
    t?.itemName,
    t?.productName,
    Array.isArray(t?.items) ? t.items.map((x: any) => x?.name).join(" ") : "",
    t?.paymentMethod,
    t?.accountingSource,
    t?.bookingCode,
    t?.guestName,
    t?.roomNo,
    t?.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getExpenseSearchBlob(e: ExpenseRow) {
  return [
    e?.id,
    e?.deptKey,
    e?.category,
    e?.description,
    e?.note,
    e?.enteredBy,
    e?.enteredByName,
    e?.amount,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function statusLabel(t: Tx) {
  return upper(t?.status || "PAID");
}

function getDepartmentValue(t: Tx) {
  return lower(
    t?.departmentId ||
      t?.departmentName ||
      t?.department ||
      t?.deptKey ||
      "unknown"
  );
}

function getStaffLabel(t: Tx) {
  if (t?.accountingSource === "room_folio_charge") return "Front Desk / Folio";
  if (t?.accountingSource === "guest_payment") return "Front Desk / Guest Payment";

  const id = t?.staffId || t?.employeeId || "—";
  const name = t?.staffName || t?.cashierName || "";

  return name ? `${id} / ${name}` : String(id);
}

function getAccountingSourceLabel(t: Tx) {
  if (t?.accountingSource === "room_folio_charge") return "Room folio charge";
  if (t?.accountingSource === "guest_payment") return "Guest payment";
  return "Direct sale";
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
}: {
  title: string;
  value: string;
  note: string;
  accent: string;
}) {
  return (
    <div style={{ ...styles.metricCard, borderTop: `4px solid ${accent}` }}>
      <div style={styles.metricTitle}>{title}</div>
      <div style={styles.metricValue}>{value}</div>
      <div style={styles.metricNote}>{note}</div>
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
  const { records } = useSales();
  const { records: expenseRecords } = useExpenses();

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [quickRange, setQuickRange] = useState<QuickRangeFilter>("today");
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    getPresetDateRange("today")
  );
  const [selectedDeptRow, setSelectedDeptRow] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<Tx | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRow | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>("overview");

  const rawTransactions = useMemo(() => {
    const directSales = (records || [])
      .filter((r: any) => !isRoomFolioSaleRecord(r))
      .map((r: any) => ({
        ...r,
        txId: r.id,
        itemName: r.productName,
        amount: r.total,
        status: "PAID",
        accountingSource: "direct_sale",
      }));

    const folioRows = getAllBookings().flatMap((booking) =>
      (booking.folioActivity || [])
        .filter((activity) => activity.type === "charge" || activity.type === "payment")
        .map((activity) => {
          const isPayment = activity.type === "payment";
          const amount = Number(activity.amount) || 0;

          return {
            id: activity.id,
            txId: activity.transactionId || activity.id,
            createdAt: new Date(activity.createdAt).toISOString(),
            deptKey: "front-desk",
            department: "front-desk",
            itemName: activity.title,
            productName: activity.title,
            items: activity.items || [],
            amount,
            total: amount,
            paymentMethod: isPayment ? activity.paymentMethod || "other" : "room_folio",
            paymentMode: isPayment ? "pay_now" : "post_to_room",
            status: isPayment ? "PAID" : "POSTED_TO_ROOM",
            accountingSource: isPayment ? "guest_payment" : "room_folio_charge",
            bookingId: booking.id,
            bookingCode: booking.bookingCode,
            roomNo: booking.roomNo,
            guestName: booking.guestName,
            customerName: booking.guestName,
            customerPhone: booking.guestPhone,
            note: activity.note,
          };
        })
    );

    return [...directSales, ...folioRows];
  }, [records]);

  const departmentOptions = useMemo(() => {
    const fromConfig = (departments || []).map((d: any) => ({
      value: lower(d?.id || d?.name),
      label: d?.name || d?.id || "Unknown",
    }));

    const txDepts = Array.from(
      new Set(rawTransactions.map((t: Tx) => getDepartmentValue(t)).filter(Boolean))
    ).map((value) => ({
      value,
      label: formatDepartmentLabel(value),
    }));

    const expenseDepts = Array.from(
      new Set(
        (expenseRecords || [])
          .map((e: any) => lower(e?.deptKey || "unknown"))
          .filter(Boolean)
      )
    ).map((value) => ({
      value,
      label: formatDepartmentLabel(value),
    }));

    const merged = [...fromConfig, ...txDepts, ...expenseDepts];
    const seen = new Set<string>();

    return merged.filter((item) => {
      if (!item.value || seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    });
  }, [departments, rawTransactions, expenseRecords]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rawTransactions
      .filter((t: Tx) =>
        withinDateRange(getTxTime(t), dateRange.startDate, dateRange.endDate)
      )
      .filter((t: Tx) => {
        if (departmentFilter === "all") return true;
        return getDepartmentValue(t) === departmentFilter;
      })
      .filter((t: Tx) => {
        if (!selectedDeptRow) return true;
        return getDepartmentValue(t) === selectedDeptRow;
      })
      .filter((t: Tx) => {
        if (!q) return true;
        return getSearchBlob(t).includes(q);
      })
      .sort((a: Tx, b: Tx) => {
        const da = new Date(getTxTime(a)).getTime() || 0;
        const db = new Date(getTxTime(b)).getTime() || 0;
        return db - da;
      });
  }, [rawTransactions, dateRange, departmentFilter, selectedDeptRow, search]);

  const visibleExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();

    return (expenseRecords || [])
      .filter((e: ExpenseRow) =>
        withinDateRange(e?.createdAt, dateRange.startDate, dateRange.endDate)
      )
      .filter((e: ExpenseRow) => {
        if (departmentFilter === "all") return true;
        return lower(e?.deptKey) === departmentFilter;
      })
      .filter((e: ExpenseRow) => {
        if (!selectedDeptRow) return true;
        return lower(e?.deptKey) === selectedDeptRow;
      })
      .filter((e: ExpenseRow) => {
        if (!q) return true;
        return getExpenseSearchBlob(e).includes(q);
      })
      .sort((a: ExpenseRow, b: ExpenseRow) => {
        const da = new Date(a?.createdAt).getTime() || 0;
        const db = new Date(b?.createdAt).getTime() || 0;
        return db - da;
      });
  }, [expenseRecords, dateRange, departmentFilter, selectedDeptRow, search]);

  const summary = useMemo(() => {
    let revenue = 0;
    let cash = 0;
    let momo = 0;
    let card = 0;
    let transfer = 0;
    let other = 0;

    for (const t of filteredTransactions) {
      const amount = getCollectionAmount(t);
      revenue += getRevenueAmount(t);

      const bucket = getPaymentBucket(t);
      if (bucket === "cash") cash += amount;
      else if (bucket === "momo") momo += amount;
      else if (bucket === "card") card += amount;
      else if (bucket === "transfer") transfer += amount;
      else other += amount;
    }

    const expenses = visibleExpenses.reduce(
      (sum: number, e: ExpenseRow) => sum + (Number(e?.amount) || 0),
      0
    );

    const netProfit = revenue - expenses;
    const revenueTransactionCount = filteredTransactions.filter(
      (t: Tx) => getRevenueAmount(t) > 0
    ).length;
    const averageSale = revenueTransactionCount > 0 ? revenue / revenueTransactionCount : 0;
    const collections = cash + momo + card + transfer + other;

    return {
      revenue,
      collections,
      expenses,
      netProfit,
      averageSale,
      transactions: filteredTransactions.length,
      cash,
      momo,
      card,
      transfer,
      other,
    };
  }, [filteredTransactions, visibleExpenses]);

  const departmentPerformance = useMemo(() => {
    const map = new Map<
      string,
      {
        department: string;
        transactions: number;
        revenue: number;
        expenses: number;
        net: number;
      }
    >();

    for (const t of filteredTransactions) {
      const dept = getDepartmentValue(t);

      const current = map.get(dept) || {
        department: dept,
        transactions: 0,
        revenue: 0,
        expenses: 0,
        net: 0,
      };

      current.transactions += 1;
      current.revenue += getRevenueAmount(t);
      map.set(dept, current);
    }

    for (const e of visibleExpenses) {
      const dept = lower(e?.deptKey || "unknown");

      const current = map.get(dept) || {
        department: dept,
        transactions: 0,
        revenue: 0,
        expenses: 0,
        net: 0,
      };

      current.expenses += Number(e?.amount) || 0;
      map.set(dept, current);
    }

    for (const row of map.values()) {
      row.net = row.revenue - row.expenses;
    }

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [filteredTransactions, visibleExpenses]);

  const expenseAnalytics = useMemo(() => {
    const byCategory = new Map<
      string,
      { category: string; amount: number; percent: number }
    >();

    let total = 0;

    for (const e of visibleExpenses) {
      const category = String(e?.category || "miscellaneous").trim();
      const amount = Number(e?.amount) || 0;

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
  }, [visibleExpenses]);

  const departmentExpenseAnalytics = useMemo(() => {
    const map = new Map<string, { department: string; amount: number }>();

    for (const e of visibleExpenses) {
      const dept = lower(e?.deptKey || "unknown");
      const current = map.get(dept) || {
        department: dept,
        amount: 0,
      };

      current.amount += Number(e?.amount) || 0;
      map.set(dept, current);
    }

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [visibleExpenses]);

  const paymentMix = useMemo(() => {
    const total = summary.collections || 1;

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
        lowestProfit: null as any,
      };
    }

    const topRevenue = [...departmentPerformance].sort(
      (a, b) => b.revenue - a.revenue
    )[0];

    const topExpense = [...departmentPerformance].sort(
      (a, b) => b.expenses - a.expenses
    )[0];

    const topProfit = [...departmentPerformance].sort((a, b) => b.net - a.net)[0];
    const lowestProfit = [...departmentPerformance].sort((a, b) => a.net - b.net)[0];

    return {
      topRevenue,
      topExpense,
      topProfit,
      lowestProfit,
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
        let status = "Watch";
        if (row.net > 0 && row.revenue > row.expenses * 1.3) status = "Strong";
        else if (row.net < 0) status = "Loss";

        return {
          ...row,
          rank: index + 1,
          marginPct: row.revenue > 0 ? (row.net / row.revenue) * 100 : 0,
          status,
        };
      })
      .sort((a, b) => b.net - a.net);
  }, [departmentPerformance]);

  const recentActivity = useMemo(() => {
    const latestTransactions = filteredTransactions.slice(0, 5).map((t: Tx) => ({
      type: "transaction",
      id: t?.txId || t?.id || "—",
      time: getTxTime(t),
      amount: getTxAmount(t),
      department: getDepartmentLabel(getDepartmentValue(t), departmentOptions),
      title:
        t?.accountingSource === "room_folio_charge"
          ? `Room folio charge - ${t?.roomNo || "room"}`
          : t?.accountingSource === "guest_payment"
          ? `Guest payment - ${t?.roomNo || "room"}`
          : `${getDepartmentLabel(getDepartmentValue(t), departmentOptions)} sale`,
      subtitle: `${getStaffLabel(t)} • ${upper(t?.paymentMethod || "other")}`,
      raw: t,
    }));

    const latestExpenses = visibleExpenses.slice(0, 5).map((e: ExpenseRow) => ({
      type: "expense",
      id: e?.id || "—",
      time: e?.createdAt || "",
      amount: Number(e?.amount) || 0,
      department: getDepartmentLabel(lower(e?.deptKey || "unknown"), departmentOptions),
      title: `${getDepartmentLabel(
        lower(e?.deptKey || "unknown"),
        departmentOptions
      )} expense`,
      subtitle: `${formatCategoryLabel(e?.category || "miscellaneous")} • ${
        e?.description || "No description"
      }`,
      raw: e,
    }));

    return {
      transactions: latestTransactions,
      expenses: latestExpenses,
    };
  }, [filteredTransactions, visibleExpenses, departmentOptions]);

  const overviewTrendData = useMemo(() => {
    const map = new Map<string, { label: string; revenue: number; expenses: number }>();

    filteredTransactions.forEach((t) => {
      const key = formatShortDate(getTxTime(t));
      const current = map.get(key) || { label: key, revenue: 0, expenses: 0 };
      current.revenue += getRevenueAmount(t);
      map.set(key, current);
    });

    visibleExpenses.forEach((e) => {
      const key = formatShortDate(e?.createdAt || "");
      const current = map.get(key) || { label: key, revenue: 0, expenses: 0 };
      current.expenses += Number(e?.amount) || 0;
      map.set(key, current);
    });

    return Array.from(map.values()).slice(-10);
  }, [filteredTransactions, visibleExpenses]);

  const todayVsYesterday = useMemo(() => {
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);

    let todayRevenue = 0;
    let yesterdayRevenue = 0;

    rawTransactions.forEach((t: Tx) => {
      const d = new Date(getTxTime(t));
      const amount = getRevenueAmount(t);
      const dept = getDepartmentValue(t);

      if (Number.isNaN(d.getTime())) return;
      if (departmentFilter !== "all" && dept !== departmentFilter) return;
      if (selectedDeptRow && dept !== selectedDeptRow) return;

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
  }, [rawTransactions, departmentFilter, selectedDeptRow]);

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

    rawTransactions.forEach((t: Tx) => {
      const d = new Date(getTxTime(t));
      if (Number.isNaN(d.getTime())) return;

      const dept = getDepartmentValue(t);
      const amount = getRevenueAmount(t);

      if (departmentFilter !== "all" && dept !== departmentFilter) return;
      if (selectedDeptRow && dept !== selectedDeptRow) return;

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
  }, [rawTransactions, departmentFilter, selectedDeptRow]);

  const hourlySalesTrend = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      sales: 0,
      transactions: 0,
    }));

    filteredTransactions.forEach((t) => {
      const d = new Date(getTxTime(t));
      if (Number.isNaN(d.getTime())) return;

      const hour = d.getHours();
      const amount = getRevenueAmount(t);

      buckets[hour].sales += amount;
      buckets[hour].transactions += 1;
    });

    return buckets;
  }, [filteredTransactions]);

  const smartAlerts = useMemo(() => {
    const alerts: Array<{
      id: string;
      title: string;
      message: string;
      tone: AlertTone;
    }> = [];

    if (summary.expenses > summary.revenue && summary.revenue > 0) {
      alerts.push({
        id: "overall-loss",
        title: "Expenses above revenue",
        message: `Visible expenses (${money(summary.expenses)}) are higher than revenue (${money(summary.revenue)}).`,
        tone: "danger",
      });
    }

    if (summary.transactions > 0 && summary.revenue > 0 && summary.cash > summary.revenue * 0.7) {
      alerts.push({
        id: "cash-heavy",
        title: "Cash payments unusually high",
        message: `${((summary.cash / summary.revenue) * 100).toFixed(
          1
        )}% of visible revenue is coming from cash.`,
        tone: "warning",
      });
    }

    if (expenseAnalytics.topCategory && expenseAnalytics.topCategory.percent >= 45) {
      alerts.push({
        id: "top-expense-category",
        title: "One expense category is dominating",
        message: `${formatCategoryLabel(
          expenseAnalytics.topCategory.category
        )} makes up ${expenseAnalytics.topCategory.percent.toFixed(1)}% of visible expenses.`,
        tone: "warning",
      });
    }

    const lossDepartments = departmentPerformance.filter((row) => row.net < 0);
    if (lossDepartments.length > 0) {
      const worst = [...lossDepartments].sort((a, b) => a.net - b.net)[0];
      alerts.push({
        id: "dept-loss",
        title: "A department is operating at a loss",
        message: `${getDepartmentLabel(
          worst.department,
          departmentOptions
        )} has a visible net of ${money(worst.net)}.`,
        tone: "danger",
      });
    }

    if (todayVsYesterday.change >= 15 && todayVsYesterday.yesterdayRevenue > 0) {
      alerts.push({
        id: "revenue-up",
        title: "Revenue is trending up",
        message: `Today is up ${todayVsYesterday.change.toFixed(
          1
        )}% versus yesterday.`,
        tone: "success",
      });
    }

    if (todayVsYesterday.yesterdayRevenue === 0 && todayVsYesterday.todayRevenue > 0) {
      alerts.push({
        id: "new-revenue-today",
        title: "New revenue recorded today",
        message: `There were no visible sales yesterday, and today has started with ${money(
          todayVsYesterday.todayRevenue
        )} in revenue.`,
        tone: "info",
      });
    }

    if (todayVsYesterday.change <= -15 && todayVsYesterday.yesterdayRevenue > 0) {
      alerts.push({
        id: "revenue-down",
        title: "Revenue dropped versus yesterday",
        message: `Today is down ${Math.abs(todayVsYesterday.change).toFixed(
          1
        )}% versus yesterday.`,
        tone: "danger",
      });
    }

    if (departmentLeaderboard.length > 0 && departmentLeaderboard[0].net > 0) {
      const leader = departmentLeaderboard[0];
      alerts.push({
        id: "leaderboard-top",
        title: "Top department right now",
        message: `${getDepartmentLabel(
          leader.department,
          departmentOptions
        )} leads with net ${money(leader.net)}.`,
        tone: "info",
      });
    }

    const peakHour = [...hourlySalesTrend].sort((a, b) => b.sales - a.sales)[0];
    if (peakHour && peakHour.sales > 0) {
      alerts.push({
        id: "peak-hour",
        title: "Peak sales hour identified",
        message: `${peakHour.label} is currently the strongest visible selling hour with ${money(
          peakHour.sales
        )} from ${peakHour.transactions} transaction(s).`,
        tone: "info",
      });
    }

    return alerts.slice(0, 6);
  }, [
    summary,
    expenseAnalytics,
    departmentPerformance,
    todayVsYesterday,
    departmentLeaderboard,
    departmentOptions,
    hourlySalesTrend,
  ]);

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

  const activeViewingLabel = selectedDeptRow
    ? `Viewing: ${getDepartmentLabel(selectedDeptRow, departmentOptions)} only`
    : departmentFilter === "all"
    ? "Viewing: All sales departments"
    : `Viewing: ${getDepartmentLabel(departmentFilter, departmentOptions)}`;

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

  const exportSummary = useMemo(() => {
    const topDept = departmentLeaderboard[0];
    const lossDept = [...departmentLeaderboard].sort((a, b) => a.net - b.net)[0];
    const peakHour = [...hourlySalesTrend].sort((a, b) => b.sales - a.sales)[0];

    return {
      generatedAt: new Date().toLocaleString(),
      range: selectedDateRangeLabel,
      departmentView: selectedDeptRow
        ? getDepartmentLabel(selectedDeptRow, departmentOptions)
        : departmentFilter === "all"
        ? "All departments"
        : getDepartmentLabel(departmentFilter, departmentOptions),
      kpis: {
        revenue: summary.revenue,
        collections: summary.collections,
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
            expenses: topDept.expenses,
            marginPct: topDept.marginPct,
            status: topDept.status,
          }
        : null,
      weakestDepartment: lossDept
        ? {
            name: getDepartmentLabel(lossDept.department, departmentOptions),
            net: lossDept.net,
            revenue: lossDept.revenue,
            expenses: lossDept.expenses,
            marginPct: lossDept.marginPct,
            status: lossDept.status,
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
        tone: x.tone,
      })),
      departmentLeaderboard: departmentLeaderboard.map((row) => ({
        rank: row.rank,
        department: getDepartmentLabel(row.department, departmentOptions),
        revenue: row.revenue,
        expenses: row.expenses,
        net: row.net,
        transactions: row.transactions,
        marginPct: row.marginPct,
        status: row.status,
      })),
    };
  }, [
    selectedDateRangeLabel,
    selectedDeptRow,
    departmentFilter,
    departmentOptions,
    summary,
    expenseAnalytics,
    todayVsYesterday,
    departmentLeaderboard,
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
        )} | Revenue: ${money(exportSummary.topDepartment.revenue)} | Expenses: ${money(
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
      });
    }
    lines.push("");

    lines.push("DEPARTMENT LEADERBOARD");
    if (exportSummary.departmentLeaderboard.length === 0) {
      lines.push("No department data.");
    } else {
      exportSummary.departmentLeaderboard.forEach((row) => {
        lines.push(
          `#${row.rank} ${row.department} | Revenue: ${money(row.revenue)} | Expenses: ${money(
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
            setSelectedDeptRow(null);
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
                setDateRange((prev) => ({ ...prev, startDate: e.target.value }));
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
                setDateRange((prev) => ({ ...prev, endDate: e.target.value }));
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
                setDateRange(getPresetDateRange(next));
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
        <div style={styles.chip}>Range: {selectedDateRangeLabel}</div>

        {selectedDeptRow && (
          <button
            onClick={() => setSelectedDeptRow(null)}
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
        />
        <MetricCard
          title="Expenses"
          value={money(summary.expenses)}
          note="Operational spending"
          accent="#EF4444"
        />
        <MetricCard
          title="Net Profit"
          value={money(summary.netProfit)}
          note="Revenue minus expenses"
          accent="#10B981"
        />
        <MetricCard
          title="Transactions"
          value={String(summary.transactions)}
          note={`Within ${selectedDateRangeLabel.toLowerCase()}`}
          accent="#94A3B8"
        />
        <MetricCard
          title="Cash"
          value={money(summary.cash)}
          note="Cash payments"
          accent="#22C55E"
        />
        <MetricCard
          title="MoMo"
          value={money(summary.momo)}
          note="Mobile money"
          accent="#8B5CF6"
        />
        <MetricCard
          title="Card"
          value={money(summary.card)}
          note="Card payments"
          accent="#3B82F6"
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
                  <div
                    key={alert.id}
                    style={{
                      ...styles.alertCard,
                      ...(alert.tone === "danger"
                        ? styles.alertDanger
                        : alert.tone === "warning"
                        ? styles.alertWarning
                        : alert.tone === "success"
                        ? styles.alertSuccess
                        : styles.alertInfo),
                    }}
                  >
                    <div style={styles.alertTitle}>{alert.title}</div>
                    <div style={styles.alertMessage}>{alert.message}</div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

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

          <ChartCard title="Department Leaderboard" helper="Top performing departments by net profit">
            {departmentLeaderboard.length === 0 ? (
              <div style={styles.emptyState}>No department data available yet.</div>
            ) : (
              <div style={styles.leaderboardList}>
                {departmentLeaderboard.slice(0, 5).map((row) => (
                  <div key={row.department} style={styles.leaderboardCard}>
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
                            ...(row.status === "Strong"
                              ? styles.leaderboardStatusStrong
                              : row.status === "Loss"
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
                    </div>
                  </div>
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
                <div style={styles.insightLabel}>Lowest Net Profit</div>
                <div style={styles.insightValue}>
                  {departmentHighlights.lowestProfit
                    ? money(departmentHighlights.lowestProfit.net)
                    : "0.00"}
                </div>
                <div style={styles.insightSub}>
                  {departmentHighlights.lowestProfit
                    ? getDepartmentLabel(
                        departmentHighlights.lowestProfit.department,
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

          <ChartCard title="Department Leaderboard" helper="Ranked by net profit">
            {departmentLeaderboard.length === 0 ? (
              <div style={styles.emptyState}>No department data available yet.</div>
            ) : (
              <div style={styles.leaderboardList}>
                {departmentLeaderboard.map((row) => (
                  <div key={row.department} style={styles.leaderboardCard}>
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
                            ...(row.status === "Strong"
                              ? styles.leaderboardStatusStrong
                              : row.status === "Loss"
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
                    </div>
                  </div>
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
                    <th style={styles.thRight}>Expenses</th>
                    <th style={styles.thRight}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {departmentPerformance.map((row) => {
                    const active = selectedDeptRow === row.department;

                    return (
                      <tr
                        key={row.department}
                        onClick={() =>
                          setSelectedDeptRow((prev) =>
                            prev === row.department ? null : row.department
                          )
                        }
                        style={{
                          ...styles.tableRow,
                          cursor: "pointer",
                          ...(active ? styles.tableRowActive : {}),
                        }}
                      >
                        <td style={styles.tdLeft}>
                          {getDepartmentLabel(row.department, departmentOptions)}
                        </td>
                        <td style={styles.tdRight}>{row.transactions}</td>
                        <td style={styles.tdRight}>{money(row.revenue)}</td>
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
              <span style={styles.helperText}>Latest sales activity</span>
            </div>

            {recentActivity.transactions.length === 0 ? (
              <div style={styles.emptyState}>No recent transactions found.</div>
            ) : (
              <div style={styles.activityList}>
                {recentActivity.transactions.map((item) => (
                  <button
                    key={`tx-${item.id}`}
                    style={styles.activityCardButton}
                    onClick={() => {
                      setSelectedTx(item.raw);
                      setSelectedExpense(null);
                    }}
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
              <span style={styles.helperText}>Latest expense activity</span>
            </div>

            {recentActivity.expenses.length === 0 ? (
              <div style={styles.emptyState}>No recent expenses found.</div>
            ) : (
              <div style={styles.activityList}>
                {recentActivity.expenses.map((item) => (
                  <button
                    key={`expense-${item.id}`}
                    style={styles.activityCardButton}
                    onClick={() => {
                      setSelectedExpense(item.raw);
                      setSelectedTx(null);
                    }}
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
              label="Payment Method"
              value={selectedTx?.paymentMethod || "—"}
            />
            <DetailItem label="Status" value={statusLabel(selectedTx)} />
            <DetailItem
              label="Customer Phone"
              value={selectedTx?.customerPhone || selectedTx?.phone || "—"}
            />
            <DetailItem label="Total" value={money(getTxAmount(selectedTx))} />
          </div>
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
            <DetailItem label="Time" value={formatDateTime(selectedExpense?.createdAt)} />
            <DetailItem
              label="Department"
              value={getDepartmentLabel(
                lower(selectedExpense?.deptKey || "unknown"),
                departmentOptions
              )}
            />
            <DetailItem
              label="Category"
              value={formatCategoryLabel(selectedExpense?.category)}
            />
            <DetailItem
              label="Amount"
              value={money(Number(selectedExpense?.amount) || 0)}
            />
            <DetailItem
              label="Entered By"
              value={
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
    fontSize: 14,
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 6,
  },
  alertMessage: {
    fontSize: 13,
    color: "#475569",
    fontWeight: 600,
    lineHeight: 1.45,
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
};
