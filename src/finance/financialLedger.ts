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

export function roundLedgerMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
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
  return {
    revenue: roundLedgerMoney(totals.revenue + entry.revenueAmount),
    collections: roundLedgerMoney(totals.collections + entry.collectionAmount),
    expenses: roundLedgerMoney(totals.expenses + entry.expenseAmount),
    receivables: roundLedgerMoney(totals.receivables + entry.receivableAmount),
    count: totals.count + 1,
  };
}

export function selectLedgerTotals(entries: CanonicalLedgerEntry[]): LedgerAmountTotals {
  return entries.reduce(
    (totals, entry) => addLedgerEntryToTotals(totals, entry),
    emptyLedgerTotals()
  );
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

  return {
    ...input,
    id: input.id || `${sourceType}:${sourceId}`,
    occurredAt: input.occurredAt || new Date().toISOString(),
    departmentKey: String(input.departmentKey || "unknown").trim() || "unknown",
    sourceType,
    sourceId,
    paymentMethod: normalizeLedgerPaymentMethod(
      input.paymentMethod,
      defaultPaymentMethodForSourceType(sourceType)
    ),
    revenueAmount: roundLedgerMoney(input.revenueAmount || 0),
    collectionAmount: roundLedgerMoney(input.collectionAmount || 0),
    receivableAmount: roundLedgerMoney(input.receivableAmount || 0),
    expenseAmount: roundLedgerMoney(input.expenseAmount || 0),
    status: input.status || "posted",
  };
}
