import { normalizeDepartmentKey } from "../lib/departments";

export const LEDGER_SOURCE_TYPES = [
  "direct_pos_sale",
  "room_booking_revenue",
  "room_folio_charge",
  "guest_payment_collection",
  "room_folio_settlement",
  "department_sale",
  "expense",
  "shift_closing_review",
] as const;

export type LedgerSourceType = (typeof LEDGER_SOURCE_TYPES)[number];

export const LEDGER_PAYMENT_METHODS = [
  "cash",
  "momo",
  "card",
  "transfer",
  "other",
  "room_folio",
  "room_booking",
  "expense",
  "closing",
] as const;

export type LedgerPaymentMethod = (typeof LEDGER_PAYMENT_METHODS)[number];

export type LedgerEntryStatus =
  | "pending"
  | "posted"
  | "reviewed"
  | "approved"
  | "rejected"
  | "reconciled"
  | "void";

export type LedgerActor = {
  employeeId?: string;
  role?: string;
  name?: string;
};

export type CanonicalLedgerEntry = {
  id: string;
  occurredAt: string;
  departmentKey: string;
  shiftId?: string;
  sourceType: LedgerSourceType;
  sourceId: string;
  bookingId?: string;
  bookingCode?: string;
  roomNo?: string;
  customerName?: string;
  paymentMethod: LedgerPaymentMethod;
  revenueAmount: number;
  collectionAmount: number;
  receivableAmount: number;
  expenseAmount: number;
  status: LedgerEntryStatus;
  createdBy?: LedgerActor;
};

const LEDGER_STORAGE_KEY = "sikatech_financial_ledger_v1";
export const FINANCIAL_LEDGER_CHANGED_EVENT = "sikatech_financial_ledger_changed";

export type LedgerAmountTotals = {
  revenue: number;
  collections: number;
  expenses: number;
  receivables: number;
  count: number;
};

export type LedgerPaymentMethodTotals = Record<
  LedgerPaymentMethod,
  LedgerAmountTotals
>;

export type LedgerDepartmentTotals = Record<string, LedgerAmountTotals>;

export type LedgerShiftTotals = Record<
  string,
  LedgerAmountTotals & {
    paymentMethods: LedgerPaymentMethodTotals;
  }
>;

export type DepartmentIntelligenceClassification =
  | "loss"
  | "top"
  | "cash_risk"
  | "normal";

export type DepartmentIntelligenceRow = {
  department: string;
  revenue: number;
  expenses: number;
  net: number;
  collections: number;
  receivables: number;
  margin: number;
  classification: DepartmentIntelligenceClassification;
  insight: string;
};

export type SmartLedgerAlertType =
  | "loss_making_department"
  | "collection_risk"
  | "high_expense"
  | "top_performer"
  | "no_activity"
  | "unusual_activity";

export type SmartLedgerAlertSeverity = "info" | "warning" | "danger" | "success";

export type SmartLedgerAlert = {
  id: string;
  type: SmartLedgerAlertType;
  severity: SmartLedgerAlertSeverity;
  title: string;
  message: string;
  departmentKey?: string;
  sourceType?: LedgerSourceType;
  metricValue: number;
  recommendedAction: string;
};

export type SmartLedgerAlertOptions = {
  departmentKeys?: string[];
};

export type LedgerFilterInput = {
  startDate?: string;
  endDate?: string;
  departmentKey?: string;
  search?: string;
  sourceTypes?: LedgerSourceType[];
};

const OVER_COLLECTION_TOLERANCE = 0.01;
const overCollectionWarningKeys = new Set<string>();

export function roundLedgerMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function deriveLedgerReceivableAmount(
  revenueAmount: number,
  collectionAmount: number
) {
  return roundLedgerMoney(roundLedgerMoney(revenueAmount) - roundLedgerMoney(collectionAmount));
}

function readLedgerArray(): CanonicalLedgerEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEDGER_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? (parsed as CanonicalLedgerEntry[]) : [];
  } catch {
    return [];
  }
}

function ledgerEntryBookingId(entry: CanonicalLedgerEntry) {
  if (entry.bookingId) return entry.bookingId;
  if (entry.sourceType === "room_booking_revenue" && entry.sourceId) return entry.sourceId;

  const idMatch = String(entry.id || "").match(
    /^(?:guest_payment_collection|room_folio_charge):([^:]+):/
  );
  if (idMatch?.[1]) return idMatch[1];

  const legacySourceMatch = String(entry.sourceId || "").match(
    /^(booking_[^:]+):legacy_amount_paid$/
  );
  return legacySourceMatch?.[1] || null;
}

function ledgerEntryIntegrityKey(entry: CanonicalLedgerEntry) {
  const bookingId = ledgerEntryBookingId(entry);

  if (entry.sourceType === "room_booking_revenue" && bookingId) {
    return `room_booking_revenue:${bookingId}`;
  }

  if (entry.sourceType === "guest_payment_collection" && bookingId) {
    const isLegacy =
      String(entry.id || "").includes("legacy_amount_paid") ||
      String(entry.sourceId || "").includes("legacy_amount_paid");
    return isLegacy
      ? `guest_payment_collection:${bookingId}:legacy_amount_paid`
      : `guest_payment_collection:${bookingId}:${entry.sourceId || entry.id}`;
  }

  return entry.id;
}

function normalizeLedgerEntriesForStorage(entries: CanonicalLedgerEntry[]) {
  const byIntegrityKey = new Map<string, CanonicalLedgerEntry>();

  entries.forEach((rawEntry) => {
    const entry = createLedgerEntry(rawEntry);
    const key = ledgerEntryIntegrityKey(entry);
    const existing = byIntegrityKey.get(key);

    if (existing) {
      if (entry.sourceType === "guest_payment_collection") {
        console.warn("Duplicate guest_payment_collection detected", {
          keptEntryId: existing.id,
          skippedEntryId: entry.id,
          bookingId: entry.bookingId,
          sourceId: entry.sourceId,
        });
      }

      if (entry.sourceType === "room_booking_revenue") {
        console.warn("Duplicate room_booking_revenue detected", {
          keptEntryId: existing.id,
          skippedEntryId: entry.id,
          bookingId: entry.bookingId,
          sourceId: entry.sourceId,
        });
      }

      return;
    }

    byIntegrityKey.set(key, entry);
  });

  return Array.from(byIntegrityKey.values()).sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );
}

function warnIfOverCollected(totals: LedgerAmountTotals, context: string) {
  if (totals.collections <= totals.revenue + OVER_COLLECTION_TOLERANCE) return;

  const key = `${context}:${totals.revenue}:${totals.collections}`;
  if (overCollectionWarningKeys.has(key)) return;
  overCollectionWarningKeys.add(key);

  console.warn("Over-collection detected", {
    context,
    revenueAmount: totals.revenue,
    collectionAmount: totals.collections,
    receivableAmount: totals.receivables,
  });
}

function writeLedgerArray(entries: CanonicalLedgerEntry[]) {
  localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(entries));
  try {
    window.dispatchEvent(new CustomEvent(FINANCIAL_LEDGER_CHANGED_EVENT));
  } catch {
    // Ledger storage should stay safe in non-browser test contexts.
  }
}

export function loadLedgerEntries(): CanonicalLedgerEntry[] {
  return readLedgerArray().sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );
}

export function removeLedgerEntries(
  shouldRemove: (entry: CanonicalLedgerEntry) => boolean
) {
  const current = loadLedgerEntries();
  const next = current.filter((entry) => !shouldRemove(entry));
  if (JSON.stringify(next) === JSON.stringify(current)) return current;
  saveLedgerEntries(next);
  return next;
}

export function saveLedgerEntries(entries: CanonicalLedgerEntry[]) {
  const normalized = normalizeLedgerEntriesForStorage(entries);
  validateLedgerIntegrity(normalized, "financial ledger");
  writeLedgerArray(normalized);
}

export function upsertLedgerEntries(entries: CanonicalLedgerEntry[]) {
  if (entries.length === 0) return loadLedgerEntries();

  const current = loadLedgerEntries();
  const replacements = normalizeLedgerEntriesForStorage(entries);
  const replacementIds = new Set(replacements.map((entry) => entry.id));
  const next = normalizeLedgerEntriesForStorage(
    replacements.concat(current.filter((entry) => !replacementIds.has(entry.id)))
  );
  if (JSON.stringify(next) === JSON.stringify(current)) return current;
  saveLedgerEntries(next);
  return next;
}

export function replaceLedgerEntries(
  shouldReplace: (entry: CanonicalLedgerEntry) => boolean,
  entries: CanonicalLedgerEntry[]
) {
  const current = loadLedgerEntries();
  const replacements = normalizeLedgerEntriesForStorage(entries);
  const replacementIds = new Set(replacements.map((entry) => entry.id));
  const next = normalizeLedgerEntriesForStorage(
    replacements.concat(
      current.filter((entry) => !shouldReplace(entry) && !replacementIds.has(entry.id))
    )
  );
  if (JSON.stringify(next) === JSON.stringify(current)) return current;
  saveLedgerEntries(next);
  return next;
}

export function getLedgerEntryById(id: string) {
  return loadLedgerEntries().find((entry) => entry.id === id) || null;
}

export function normalizeLedgerPaymentMethod(
  value: unknown,
  fallback: LedgerPaymentMethod = "cash"
): LedgerPaymentMethod {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "cash") return "cash";
  if (normalized === "momo" || normalized === "mobile_money") return "momo";
  if (normalized === "card" || normalized === "credit_card" || normalized === "debit_card") {
    return "card";
  }
  if (normalized === "transfer" || normalized === "bank_transfer") return "transfer";
  if (normalized === "other" || normalized === "unknown" || normalized === "credit") {
    return "other";
  }
  if (normalized === "room_folio" || normalized === "post_to_room") return "room_folio";
  if (normalized === "room_booking" || normalized === "booking") return "room_booking";
  if (normalized === "expense") return "expense";
  if (normalized === "closing" || normalized === "shift_closing") return "closing";

  return fallback;
}

export function normalizeLedgerSourceType(
  value: unknown,
  fallback: LedgerSourceType = "direct_pos_sale"
): LedgerSourceType {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  return LEDGER_SOURCE_TYPES.includes(normalized as LedgerSourceType)
    ? (normalized as LedgerSourceType)
    : fallback;
}

export function defaultPaymentMethodForSourceType(
  sourceType: LedgerSourceType
): LedgerPaymentMethod {
  if (sourceType === "room_booking_revenue") return "room_booking";
  if (sourceType === "room_folio_charge") return "room_folio";
  if (sourceType === "expense") return "expense";
  if (sourceType === "shift_closing_review") return "closing";
  return "cash";
}

export function emptyLedgerTotals(): LedgerAmountTotals {
  return {
    revenue: 0,
    collections: 0,
    expenses: 0,
    receivables: 0,
    count: 0,
  };
}

export function addLedgerEntryToTotals(
  totals: LedgerAmountTotals,
  entry: Pick<
    CanonicalLedgerEntry,
    "revenueAmount" | "collectionAmount" | "expenseAmount" | "receivableAmount"
  >
): LedgerAmountTotals {
  const revenue = roundLedgerMoney(totals.revenue + entry.revenueAmount);
  const collections = roundLedgerMoney(totals.collections + entry.collectionAmount);

  return {
    revenue,
    collections,
    expenses: roundLedgerMoney(totals.expenses + entry.expenseAmount),
    receivables: deriveLedgerReceivableAmount(revenue, collections),
    count: totals.count + 1,
  };
}

export function selectLedgerTotals(entries: CanonicalLedgerEntry[]): LedgerAmountTotals {
  return entries.reduce(
    (totals, entry) => addLedgerEntryToTotals(totals, entry),
    emptyLedgerTotals()
  );
}

export function validateLedgerIntegrity(
  entries: CanonicalLedgerEntry[],
  context = "ledger"
) {
  const totals = selectLedgerTotals(entries);
  warnIfOverCollected(totals, context);
  return totals;
}

export function selectTotalRevenue(entries: CanonicalLedgerEntry[]) {
  return selectLedgerTotals(entries).revenue;
}

export function selectTotalCollections(entries: CanonicalLedgerEntry[]) {
  return selectLedgerTotals(entries).collections;
}

export function selectTotalExpenses(entries: CanonicalLedgerEntry[]) {
  return selectLedgerTotals(entries).expenses;
}

export function selectReceivables(entries: CanonicalLedgerEntry[]) {
  return selectLedgerTotals(entries).receivables;
}

function ledgerDateInRange(value: string, startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return true;
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T00:00:00`) : null;

  if (start && Number.isNaN(start.getTime())) return false;
  if (end && Number.isNaN(end.getTime())) return false;
  if (end) end.setDate(end.getDate() + 1);

  if (start && date < start) return false;
  if (end && date >= end) return false;
  return true;
}

function ledgerSearchText(entry: CanonicalLedgerEntry) {
  return [
    entry.id,
    entry.sourceType,
    entry.sourceId,
    entry.departmentKey,
    entry.shiftId,
    entry.bookingId,
    entry.bookingCode,
    entry.roomNo,
    entry.customerName,
    entry.paymentMethod,
    entry.status,
    entry.createdBy?.employeeId,
    entry.createdBy?.name,
    entry.createdBy?.role,
    entry.revenueAmount,
    entry.collectionAmount,
    entry.receivableAmount,
    entry.expenseAmount,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterLedgerEntries(
  entries: CanonicalLedgerEntry[],
  filters: LedgerFilterInput = {}
) {
  const departmentKey =
    filters.departmentKey && filters.departmentKey !== "all"
      ? normalizeDepartmentKey(filters.departmentKey)
      : "";
  const search = String(filters.search || "").trim().toLowerCase();
  const sourceTypes = filters.sourceTypes?.length ? new Set(filters.sourceTypes) : null;

  return entries.filter((entry) => {
    if (sourceTypes && !sourceTypes.has(entry.sourceType)) return false;
    if (!ledgerDateInRange(entry.occurredAt, filters.startDate, filters.endDate)) {
      return false;
    }
    if (departmentKey && normalizeDepartmentKey(entry.departmentKey) !== departmentKey) {
      return false;
    }
    if (search && !ledgerSearchText(entry).includes(search)) return false;
    return true;
  });
}

export function selectDashboardLedgerSummary(
  entries: CanonicalLedgerEntry[],
  filters: LedgerFilterInput = {}
) {
  const filteredEntries = filterLedgerEntries(entries, filters);
  const totals = selectLedgerTotals(filteredEntries);
  return {
    entries: filteredEntries,
    totals,
    netProfit: roundLedgerMoney(totals.revenue - totals.expenses),
  };
}

export function selectAccountingLedgerRows(
  entries: CanonicalLedgerEntry[],
  filters: LedgerFilterInput = {}
) {
  return filterLedgerEntries(entries, filters).map((entry) => ({
    id: entry.id,
    date: entry.occurredAt,
    source: entry.sourceType,
    department: normalizeDepartmentKey(entry.departmentKey),
    paymentMethod: entry.paymentMethod,
    staff: entry.createdBy?.name || entry.createdBy?.employeeId || "unknown",
    description: entry.customerName || entry.bookingCode || entry.sourceId,
    revenue: entry.revenueAmount,
    expense: entry.expenseAmount,
    collection: entry.collectionAmount,
    receivable: entry.receivableAmount,
    net: roundLedgerMoney(entry.revenueAmount - entry.expenseAmount),
    bookingId: entry.bookingId,
    bookingCode: entry.bookingCode,
    roomNo: entry.roomNo,
    customerName: entry.customerName,
    shiftId: entry.shiftId,
    status: entry.status,
    raw: entry,
  }));
}

export function createEmptyPaymentMethodTotals(): LedgerPaymentMethodTotals {
  return LEDGER_PAYMENT_METHODS.reduce((acc, method) => {
    acc[method] = emptyLedgerTotals();
    return acc;
  }, {} as LedgerPaymentMethodTotals);
}

export function selectPaymentMethodTotals(
  entries: CanonicalLedgerEntry[]
): LedgerPaymentMethodTotals {
  return entries.reduce((totals, entry) => {
    const method = normalizeLedgerPaymentMethod(entry.paymentMethod);
    totals[method] = addLedgerEntryToTotals(totals[method], entry);
    return totals;
  }, createEmptyPaymentMethodTotals());
}

export function selectDepartmentTotals(
  entries: CanonicalLedgerEntry[]
): LedgerDepartmentTotals {
  return entries.reduce((totals, entry) => {
    const departmentKey = entry.departmentKey || "unknown";
    totals[departmentKey] = addLedgerEntryToTotals(
      totals[departmentKey] || emptyLedgerTotals(),
      entry
    );
    return totals;
  }, {} as LedgerDepartmentTotals);
}

export function selectDepartmentIntelligence(
  entries: CanonicalLedgerEntry[]
): DepartmentIntelligenceRow[] {
  return Object.entries(selectDepartmentTotals(entries))
    .map(([department, totals]) => {
      const revenue = roundLedgerMoney(totals.revenue);
      const expenses = roundLedgerMoney(totals.expenses);
      const collections = roundLedgerMoney(totals.collections);
      const net = roundLedgerMoney(revenue - expenses);
      const receivables = roundLedgerMoney(revenue - collections);
      const margin = revenue > 0 ? net / revenue : 0;

      let classification: DepartmentIntelligenceClassification = "normal";
      let insight = "Stable performance";

      if (net < 0) {
        classification = "loss";
        insight = "Loss making department";
      } else if (margin > 0.5) {
        classification = "top";
        insight = "High performing department";
      } else if (collections < revenue) {
        classification = "cash_risk";
        insight = "Low collection rate";
      }

      return {
        department: normalizeDepartmentKey(department),
        revenue,
        expenses,
        net,
        collections,
        receivables,
        margin,
        classification,
        insight,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

function formatLedgerDepartmentLabel(value: string) {
  return normalizeDepartmentKey(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function selectSmartLedgerAlerts(
  entries: CanonicalLedgerEntry[],
  options: SmartLedgerAlertOptions = {}
): SmartLedgerAlert[] {
  const departmentRows = selectDepartmentIntelligence(entries);
  const alerts: SmartLedgerAlert[] = [];
  const severityRank: Record<SmartLedgerAlertSeverity, number> = {
    danger: 0,
    warning: 1,
    info: 2,
    success: 3,
  };
  const totalExpenses = departmentRows.reduce((sum, row) => sum + row.expenses, 0);

  const worstLoss = departmentRows
    .filter((row) => row.net < 0)
    .sort((a, b) => a.net - b.net)[0];
  if (worstLoss) {
    const label = formatLedgerDepartmentLabel(worstLoss.department);
    alerts.push({
      id: `loss_making_department:${worstLoss.department}`,
      type: "loss_making_department",
      severity: "danger",
      title: "Loss making department",
      message: `${label} is operating at a loss of ${roundLedgerMoney(worstLoss.net).toFixed(2)}.`,
      departmentKey: worstLoss.department,
      metricValue: worstLoss.net,
      recommendedAction: "Review expenses or increase pricing.",
    });
  }

  const weakestCollection = departmentRows
    .filter((row) => row.revenue > 0 && row.collections / row.revenue < 0.7)
    .sort((a, b) => a.collections / a.revenue - b.collections / b.revenue)[0];
  if (weakestCollection) {
    const label = formatLedgerDepartmentLabel(weakestCollection.department);
    const collectionRate = Math.round((weakestCollection.collections / weakestCollection.revenue) * 100);
    alerts.push({
      id: `collection_risk:${weakestCollection.department}`,
      type: "collection_risk",
      severity: "warning",
      title: "Low collection rate",
      message: `${label} has low collection rate (${collectionRate}%).`,
      departmentKey: weakestCollection.department,
      sourceType: "guest_payment_collection",
      metricValue: collectionRate,
      recommendedAction: "Follow up on outstanding payments.",
    });
  }

  const expenseLeader = departmentRows
    .filter((row) => totalExpenses > 0 && row.expenses / totalExpenses > 0.5)
    .sort((a, b) => b.expenses - a.expenses)[0];
  if (expenseLeader) {
    const label = formatLedgerDepartmentLabel(expenseLeader.department);
    alerts.push({
      id: `high_expense:${expenseLeader.department}`,
      type: "high_expense",
      severity: "warning",
      title: "High expense concentration",
      message: `${label} contributes majority of expenses.`,
      departmentKey: expenseLeader.department,
      sourceType: "expense",
      metricValue: expenseLeader.expenses,
      recommendedAction: "Audit expense categories.",
    });
  }

  const topRevenue = departmentRows
    .filter((row) => row.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)[0];
  if (topRevenue) {
    const label = formatLedgerDepartmentLabel(topRevenue.department);
    alerts.push({
      id: `top_performer:${topRevenue.department}`,
      type: "top_performer",
      severity: "success",
      title: "Top performer",
      message: `${label} is top performing department.`,
      departmentKey: topRevenue.department,
      metricValue: topRevenue.revenue,
      recommendedAction: "Maintain strategy or scale operations.",
    });
  }

  const activeDepartmentKeys = new Set(departmentRows.map((row) => row.department));
  const inactiveDepartment = (options.departmentKeys || [])
    .map((key) => normalizeDepartmentKey(key))
    .filter((key) => key && key !== "unknown" && !activeDepartmentKeys.has(key))
    .sort()[0];
  if (inactiveDepartment) {
    const label = formatLedgerDepartmentLabel(inactiveDepartment);
    alerts.push({
      id: `no_activity:${inactiveDepartment}`,
      type: "no_activity",
      severity: "info",
      title: "No department activity",
      message: `${label} has no activity.`,
      departmentKey: inactiveDepartment,
      metricValue: 0,
      recommendedAction: "Check if department is inactive or misconfigured.",
    });
  }

  const now = Date.now();
  const recentEntries = entries.filter((entry) => {
    const time = new Date(entry.occurredAt).getTime();
    return Number.isFinite(time) && now - time <= 24 * 60 * 60 * 1000;
  });
  const recentRevenue = recentEntries.reduce(
    (sum, entry) => sum + (Number(entry.revenueAmount) || 0),
    0
  );
  const totalRevenue = entries.reduce(
    (sum, entry) => sum + (Number(entry.revenueAmount) || 0),
    0
  );

  if (recentEntries.length >= 10 || (totalRevenue > 0 && recentRevenue > totalRevenue * 0.5)) {
    alerts.push({
      id: "unusual_activity:recent_volume",
      type: "unusual_activity",
      severity: "info",
      title: "Unusual activity",
      message: `${recentEntries.length} ledger entries were posted in the last 24 hours.`,
      metricValue: recentEntries.length,
      recommendedAction: "Scan recent activity for duplicates, reversals, or unusually large entries.",
    });
  }

  return alerts
    .sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        Math.abs(b.metricValue) - Math.abs(a.metricValue)
    )
    .slice(0, 5);
}

export function selectShiftTotals(entries: CanonicalLedgerEntry[]): LedgerShiftTotals {
  return entries.reduce((totals, entry) => {
    const shiftId = entry.shiftId || "unassigned";
    const current =
      totals[shiftId] || {
        ...emptyLedgerTotals(),
        paymentMethods: createEmptyPaymentMethodTotals(),
      };
    const nextTotals = addLedgerEntryToTotals(current, entry);
    const paymentMethod = normalizeLedgerPaymentMethod(entry.paymentMethod);

    totals[shiftId] = {
      ...nextTotals,
      paymentMethods: {
        ...current.paymentMethods,
        [paymentMethod]: addLedgerEntryToTotals(
          current.paymentMethods[paymentMethod],
          entry
        ),
      },
    };

    return totals;
  }, {} as LedgerShiftTotals);
}

export function createLedgerEntry(
  input: Omit<
    CanonicalLedgerEntry,
    | "id"
    | "occurredAt"
    | "departmentKey"
    | "paymentMethod"
    | "revenueAmount"
    | "collectionAmount"
    | "receivableAmount"
    | "expenseAmount"
    | "status"
  > &
    Partial<
      Pick<
        CanonicalLedgerEntry,
        | "id"
        | "occurredAt"
        | "departmentKey"
        | "paymentMethod"
        | "revenueAmount"
        | "collectionAmount"
        | "receivableAmount"
        | "expenseAmount"
        | "status"
      >
    >
): CanonicalLedgerEntry {
  const sourceType = normalizeLedgerSourceType(input.sourceType);
  const sourceId = String(input.sourceId || "").trim() || "unknown";
  const revenueAmount = roundLedgerMoney(input.revenueAmount || 0);
  const collectionAmount = roundLedgerMoney(input.collectionAmount || 0);

  return {
    ...input,
    id: input.id || `${sourceType}:${sourceId}`,
    occurredAt: input.occurredAt || new Date().toISOString(),
    departmentKey: normalizeDepartmentKey(input.departmentKey),
    sourceType,
    sourceId,
    paymentMethod: normalizeLedgerPaymentMethod(
      input.paymentMethod,
      defaultPaymentMethodForSourceType(sourceType)
    ),
    revenueAmount,
    collectionAmount,
    receivableAmount: deriveLedgerReceivableAmount(revenueAmount, collectionAmount),
    expenseAmount: roundLedgerMoney(input.expenseAmount || 0),
    status: input.status || "posted",
  };
}
