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

function groupName(
  entry: CanonicalLedgerEntry,
  groupBy: DashboardGroupBy,
  departmentLabels: Map<string, string>
) {
  if (groupBy === "department") {
    return departmentLabels.get(entry.departmentKey) || labelize(entry.departmentKey);
  }
  if (groupBy === "payment") return labelize(entry.paymentMethod);
  if (groupBy === "shift") return entry.shiftId ? `Shift ${entry.shiftId}` : "No Shift";
  if (groupBy === "staff") {
    return entry.createdBy?.employeeId || entry.createdBy?.name || "Unassigned Staff";
  }

  if (entry.roomNo) return `Room ${entry.roomNo}`;
  if (entry.customerName) return entry.customerName;
  if (entry.bookingCode) return entry.bookingCode;
  return "Walk-in / Unassigned";
}

function buildGroupedRows(
  entries: CanonicalLedgerEntry[],
  groupBy: DashboardGroupBy,
  departmentLabels: Map<string, string>
): DashboardGroupedRow[] {
  const map = new Map<string, DashboardGroupedRow>();

  entries.forEach((entry) => {
    const name = groupName(entry, groupBy, departmentLabels);
    const key = `${groupBy}:${name}`;
    const current =
      map.get(key) ||
      {
        key,
        name,
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
    salesCount,
    expenseCount,
    transactions: entries.length,
  };
}
