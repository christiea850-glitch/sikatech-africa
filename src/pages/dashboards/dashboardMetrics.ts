import type { ExpenseRecord } from "../../expenses/ExpenseContext";
import {
  loadLedgerEntries,
  roundLedgerMoney,
  selectLedgerTotals,
  type CanonicalLedgerEntry,
} from "../../finance/financialLedger";
import type { SaleRecord } from "../../sales/SalesContext";

export type DashboardGroupBy = "department" | "payment" | "shift" | "staff" | "room_customer";

export type DashboardGroupedRow = {
  key: string;
  name: string;
  revenue: number;
  collections: number;
  cashCollections: number;
  expenses: number;
  netProfit: number;
  transactions: number;
};

export const DASHBOARD_GROUP_LABELS: Record<DashboardGroupBy, string> = {
  department: "Department",
  payment: "Payment Method",
  shift: "Shift",
  staff: "Staff",
  room_customer: "Room / Customer",
};

export type DashboardMetricsInput = {
  startDate: string;
  endDate: string;
  groupBy: DashboardGroupBy;
  ledgerEntries?: CanonicalLedgerEntry[];
  salesRecords?: SaleRecord[];
  expenseRecords?: ExpenseRecord[];
  departmentLabels?: Map<string, string>;
};

function labelize(value: string) {
  return String(value || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Unassigned";
}

function parseDateValue(value: string | number | undefined, boundary?: "start" | "end") {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "number") {
    const date = new Date(value < 10_000_000_000 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    const date = new Date(n < 10_000_000_000 ? n * 1000 : n);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const [, year, month, day] = ymd;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (boundary === "end") date.setHours(23, 59, 59, 999);
    return date;
  }

  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, month, day, year] = mdy;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (boundary === "end") date.setHours(23, 59, 59, 999);
    return date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dashboardDateInRange(
  value: string | number | undefined,
  startDate: string,
  endDate: string
) {
  const date = parseDateValue(value);
  if (!date) return false;

  const start = parseDateValue(startDate, "start");
  const end = parseDateValue(endDate, "end");

  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function groupIdentity(
  entry: CanonicalLedgerEntry,
  groupBy: DashboardGroupBy,
  departmentLabels: Map<string, string>
) {
  if (groupBy === "department") {
    const key = entry.departmentKey || "unknown";
    return {
      key,
      name: departmentLabels.get(key) || labelize(key),
    };
  }
  if (groupBy === "payment") {
    const key = entry.paymentMethod || "other";
    return { key, name: labelize(key) };
  }
  if (groupBy === "shift") {
    const key = entry.shiftId || "no-shift";
    return { key, name: entry.shiftId ? `Shift ${entry.shiftId}` : "No Shift" };
  }
  if (groupBy === "staff") {
    const employeeId = entry.createdBy?.employeeId || "";
    const name = entry.createdBy?.name || "";
    const key = employeeId || name || "unassigned-staff";
    return {
      key,
      name: employeeId && name ? `${employeeId} / ${name}` : employeeId || name || "Unassigned Staff",
    };
  }

  const roomNo = entry.roomNo || "";
  const customer = entry.customerName || "";
  const booking = entry.bookingCode || "";
  const key = roomNo || customer || booking || "walk-in-unassigned";
  if (roomNo && customer) return { key, name: `Room ${roomNo} / ${customer}` };
  if (roomNo) return { key, name: `Room ${roomNo}` };
  if (customer) return { key, name: customer };
  if (booking) return { key, name: booking };
  return { key, name: "Walk-in / Unassigned" };
}

function buildGroupedRows(
  entries: CanonicalLedgerEntry[],
  groupBy: DashboardGroupBy,
  departmentLabels: Map<string, string>
): DashboardGroupedRow[] {
  const map = new Map<string, DashboardGroupedRow>();

  entries.forEach((entry) => {
    const identity = groupIdentity(entry, groupBy, departmentLabels);
    const key = `${groupBy}:${identity.key}`;
    const current =
      map.get(key) ||
      {
        key,
        name: identity.name,
        revenue: 0,
        collections: 0,
        cashCollections: 0,
        expenses: 0,
        netProfit: 0,
        transactions: 0,
      };

    current.revenue = roundLedgerMoney(current.revenue + (Number(entry.revenueAmount) || 0));
    current.collections = roundLedgerMoney(
      current.collections + (Number(entry.collectionAmount) || 0)
    );
    if (entry.paymentMethod === "cash") {
      current.cashCollections = roundLedgerMoney(
        current.cashCollections + (Number(entry.collectionAmount) || 0)
      );
    }
    current.expenses = roundLedgerMoney(current.expenses + (Number(entry.expenseAmount) || 0));
    current.netProfit = roundLedgerMoney(current.revenue - current.expenses);
    current.transactions += 1;
    map.set(key, current);
  });

  return Array.from(map.values()).sort(
    (a, b) => b.revenue - a.revenue || b.collections - a.collections
  );
}

export function getDashboardMetrics({
  startDate,
  endDate,
  groupBy,
  ledgerEntries,
  salesRecords = [],
  expenseRecords = [],
  departmentLabels = new Map<string, string>(),
}: DashboardMetricsInput) {
  const sourceEntries = ledgerEntries ?? loadLedgerEntries();
  const entries = sourceEntries.filter((entry) =>
    dashboardDateInRange(entry.occurredAt, startDate, endDate)
  );
  const totals = selectLedgerTotals(entries);
  const cashCollections = entries.reduce((sum, entry) => {
    if (entry.paymentMethod !== "cash") return sum;
    return roundLedgerMoney(sum + (Number(entry.collectionAmount) || 0));
  }, 0);
  const groupedRows = buildGroupedRows(entries, groupBy, departmentLabels);
  const salesCount = salesRecords.filter((record) =>
    dashboardDateInRange(record.createdAt, startDate, endDate)
  ).length;
  const expenseCount = expenseRecords.filter((record) =>
    dashboardDateInRange(record.createdAt, startDate, endDate)
  ).length;

  return {
    entries,
    totals: {
      ...totals,
      cashCollections,
      netProfit: roundLedgerMoney(totals.revenue - totals.expenses),
    },
    groupedRows,
    groupBy,
    groupLabel: DASHBOARD_GROUP_LABELS[groupBy],
    salesCount,
    expenseCount,
    transactions: entries.length,
  };
}
