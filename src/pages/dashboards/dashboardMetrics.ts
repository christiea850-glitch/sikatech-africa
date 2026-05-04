import type { ExpenseRecord } from "../../expenses/ExpenseContext";
import {
  filterLedgerEntries,
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

function inDateRange(value: string | number | undefined, startDate: string, endDate: string) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T00:00:00`) : null;
  if (end) end.setDate(end.getDate() + 1);

  if (start && date < start) return false;
  if (end && date >= end) return false;
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
        expenses: 0,
        netProfit: 0,
        transactions: 0,
      };

    current.revenue = roundLedgerMoney(current.revenue + (Number(entry.revenueAmount) || 0));
    current.collections = roundLedgerMoney(
      current.collections + (Number(entry.collectionAmount) || 0)
    );
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
  const entries = filterLedgerEntries(ledgerEntries ?? loadLedgerEntries(), {
    startDate,
    endDate,
  });
  const totals = selectLedgerTotals(entries);
  const groupedRows = buildGroupedRows(entries, groupBy, departmentLabels);
  const salesCount = salesRecords.filter((record) =>
    inDateRange(record.createdAt, startDate, endDate)
  ).length;
  const expenseCount = expenseRecords.filter((record) =>
    inDateRange(record.createdAt, startDate, endDate)
  ).length;

  return {
    entries,
    totals: {
      ...totals,
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
