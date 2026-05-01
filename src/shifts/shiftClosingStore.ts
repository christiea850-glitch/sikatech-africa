import { loadTransactions } from "../sales/salesStorage";

export type ShiftClosingAccountingStatus = "pending" | "approved" | "rejected";
export type ShiftClosingStatus = "pending" | "reviewed" | "approved" | "rejected";
type StoredShiftStatus = "open" | "unclosed" | "submitted" | "reviewed" | "auto_submitted";

export type ShiftClosingRecord = {
  id: string | number;
  business_id: number;
  branch_id?: string | null;
  department_key?: string | null;
  shift_id: string | number | null;
  submitted_by_user_id: string | number | null;
  submitted_at: string | null;
  submission_mode?: "manual" | "automatic";
  status: ShiftClosingStatus | string;
  shift_status?: StoredShiftStatus;
  cash_expected: number;
  cash_counted: number;
  card_total: number;
  momo_total: number;
  transfer_total?: number;
  expenses_total: number;
  notes?: string | null;
  accounting_review_status?: ShiftClosingAccountingStatus;
  accounting_reviewed_by_user_id?: string | number | null;
  accounting_reviewed_at?: string | null;
  accounting_note?: string | null;
  manager_approved_by_user_id?: string | number | null;
  manager_approved_at?: string | null;
  manager_note?: string | null;
  rejected_by_user_id?: string | number | null;
  rejected_at?: string | null;
  reject_reason?: string | null;
  created_at: string;
  updated_at: string;
};

type ClosingFinancialInput = {
  cashExpected?: number;
  cashCounted?: number;
  cardTotal?: number;
  momoTotal?: number;
  transferTotal?: number;
  expensesTotal?: number;
};

export type UpsertShiftClosingInput = ClosingFinancialInput & {
  id?: string | number;
  closingId?: string | number;
  businessId?: string | number;
  branchId?: string | null;
  departmentKey?: string | null;
  shiftId?: string | number | null;
  submittedBy?: string | number | null;
  submittedAt?: string | null;
  submissionMode?: "manual" | "automatic";
  status?: ShiftClosingRecord["status"];
  shiftStatus?: StoredShiftStatus;
  notes?: string | null;
};

export type ShiftClosingReviewInput = {
  id: string | number;
  reviewStatus?: Exclude<ShiftClosingAccountingStatus, "pending">;
  note?: string | null;
  reviewedBy?: string | number | null;
};

const STORAGE_KEY = "sikatech_shift_closings_v1";
export const SHIFT_CLOSINGS_CHANGED_EVENT = "sikatech_shift_closings_changed";

type Totals = {
  cashExpected: number;
  cashCounted: number;
  cardTotal: number;
  momoTotal: number;
  transferTotal: number;
  expensesTotal: number;
};

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function readJsonArray<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function normalizeMethod(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function addPayment(totals: Totals, method: unknown, amount: unknown) {
  const value = roundMoney(Math.max(0, safeNumber(amount)));
  const normalized = normalizeMethod(method);

  if (normalized === "cash") totals.cashExpected += value;
  if (normalized === "momo" || normalized === "mobile_money") totals.momoTotal += value;
  if (normalized === "card") totals.cardTotal += value;
  if (normalized === "transfer" || normalized === "bank_transfer") {
    totals.transferTotal += value;
  }
}

function paymentAmount(record: Record<string, unknown>) {
  return (
    safeNumber(record.grandTotal) ||
    safeNumber(record.total) ||
    safeNumber(record.amountPaid) ||
    safeNumber(record.amount)
  );
}

function hasShift(record: Record<string, unknown>, shiftId: string) {
  return String(record.shiftId ?? "").trim() === shiftId;
}

function computeShiftTotals(shiftId?: string | number | null): Totals {
  const id = String(shiftId ?? "").trim();
  const totals: Totals = {
    cashExpected: 0,
    cashCounted: 0,
    cardTotal: 0,
    momoTotal: 0,
    transferTotal: 0,
    expensesTotal: 0,
  };

  if (!id) return totals;

  const salesRecords = readJsonArray<Record<string, unknown>>("sikatech_sales_records_v3");
  const saleTransactionIds = new Set<string>();

  salesRecords.forEach((sale) => {
    if (!hasShift(sale, id)) return;

    const paymentMode = normalizeMethod(sale.paymentMode);
    const method = normalizeMethod(sale.paymentMethod);
    if (paymentMode === "post_to_room" || method === "room_folio") return;

    addPayment(totals, method, paymentAmount(sale));

    const transactionId = String(sale.transactionId ?? "").trim();
    if (transactionId) saleTransactionIds.add(transactionId);
  });

  loadTransactions().forEach((tx) => {
    if (String(tx.shiftId ?? "").trim() !== id) return;
    if (saleTransactionIds.has(String(tx.id ?? "").trim())) return;
    if (tx.status === "POSTED_TO_ROOM" || tx.paymentMode === "POST_TO_ROOM") return;
    addPayment(totals, tx.paymentMethod, tx.amountPaid || tx.total);
  });

  const bookings = readJsonArray<Record<string, any>>("sikatech_frontdesk_bookings_v1");
  bookings.forEach((booking) => {
    (booking.folioActivity || []).forEach((activity: Record<string, unknown>) => {
      if (activity.type !== "payment") return;
      if (!hasShift(activity, id)) return;
      addPayment(totals, activity.paymentMethod, activity.amount);
    });
  });

  const expenses = readJsonArray<Record<string, unknown>>("sikatech_expense_records_v1");
  expenses.forEach((expense) => {
    if (!hasShift(expense, id)) return;
    totals.expensesTotal += roundMoney(Math.max(0, safeNumber(expense.amount)));
  });

  totals.cashExpected = roundMoney(totals.cashExpected);
  totals.cashCounted = totals.cashExpected;
  totals.cardTotal = roundMoney(totals.cardTotal);
  totals.momoTotal = roundMoney(totals.momoTotal);
  totals.transferTotal = roundMoney(totals.transferTotal);
  totals.expensesTotal = roundMoney(totals.expensesTotal);

  return totals;
}

function writeShiftClosings(list: ShiftClosingRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  try {
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(SHIFT_CLOSINGS_CHANGED_EVENT));
    }, 0);
  } catch {
    // Closing review storage should also work in non-browser test contexts.
  }
}

function resolveBusinessId(value: unknown) {
  const raw = String(value ?? "").trim();
  if (raw === "biz_main") return 1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeClosingStatus(status: unknown): ShiftClosingStatus {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "approved" || normalized === "accounting_approved" || normalized === "manager_approved" || normalized === "closed") {
    return "approved";
  }
  if (normalized === "reviewed" || normalized === "accounting_reviewed") return "reviewed";
  if (normalized === "rejected") return "rejected";
  return "pending";
}

function shiftStatusFromClosingSignal(status: unknown): StoredShiftStatus {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "open") return "open";
  if (normalized === "auto_submitted" || normalized === "auto-submitted") return "auto_submitted";
  if (
    normalized === "reviewed" ||
    normalized === "accounting_reviewed" ||
    normalized === "accounting_approved" ||
    normalized === "approved" ||
    normalized === "manager_approved" ||
    normalized === "closed"
  ) {
    return "reviewed";
  }
  if (
    normalized === "submitted" ||
    normalized === "closing_submitted" ||
    normalized === "pending" ||
    normalized === "pending_close" ||
    normalized === "pending_closing"
  ) {
    return "submitted";
  }
  return "unclosed";
}

function shouldPreserveStatus(existing: ShiftClosingRecord, nextStatus: ShiftClosingRecord["status"]) {
  const finalStatuses = new Set(["approved", "rejected"]);
  const normalizedNext = normalizeClosingStatus(nextStatus);
  return (
    finalStatuses.has(normalizeClosingStatus(existing.status)) &&
    (normalizedNext === "pending" || normalizedNext === "reviewed")
  );
}

function nextClosingId(input: UpsertShiftClosingInput) {
  const explicit = input.id ?? input.closingId;
  if (explicit !== undefined && explicit !== null && String(explicit).trim()) return explicit;

  const shiftId = String(input.shiftId ?? "").trim();
  if (shiftId) return `shift:${shiftId}`;

  return `closing:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function loadShiftClosings(status = ""): ShiftClosingRecord[] {
  const normalizedStatus = normalizeClosingStatus(status);
  const rows = readJsonArray<ShiftClosingRecord>(STORAGE_KEY);
  return rows
    .map((row) => ({
      ...row,
      status: normalizeClosingStatus(row.status),
      shift_status: row.shift_status || shiftStatusFromClosingSignal(row.status),
    }))
    .filter((row) => !status || normalizeClosingStatus(row.status) === normalizedStatus)
    .sort(
      (a, b) =>
        new Date(b.submitted_at || b.created_at || 0).getTime() -
        new Date(a.submitted_at || a.created_at || 0).getTime()
    );
}

export function getShiftClosingById(id: string | number) {
  const target = String(id);
  return loadShiftClosings().find((row) => String(row.id) === target) || null;
}

export function upsertShiftClosingRecord(input: UpsertShiftClosingInput) {
  const now = new Date().toISOString();
  const rows = loadShiftClosings();
  const shiftId = String(input.shiftId ?? "").trim();
  const inputId = String(input.id ?? input.closingId ?? "").trim();
  const existingIndex = rows.findIndex((row) => {
    if (inputId && String(row.id) === inputId) return true;
    return shiftId && String(row.shift_id ?? "").trim() === shiftId;
  });
  const existing = existingIndex >= 0 ? rows[existingIndex] : undefined;
  const computed = computeShiftTotals(input.shiftId);
  const requestedStatus = normalizeClosingStatus(input.status || "pending");
  const nextStatus =
    existing && shouldPreserveStatus(existing, requestedStatus)
      ? normalizeClosingStatus(existing.status)
      : requestedStatus;

  const next: ShiftClosingRecord = {
    id: existing?.id ?? nextClosingId(input),
    business_id: resolveBusinessId(input.businessId ?? existing?.business_id),
    branch_id: input.branchId ?? existing?.branch_id ?? null,
    department_key: input.departmentKey ?? existing?.department_key ?? null,
    shift_id: input.shiftId ?? existing?.shift_id ?? null,
    submitted_by_user_id:
      input.submittedBy ?? existing?.submitted_by_user_id ?? "system",
    submitted_at: input.submittedAt || existing?.submitted_at || now,
    submission_mode: input.submissionMode || existing?.submission_mode || "manual",
    status: nextStatus,
    shift_status:
      input.shiftStatus || existing?.shift_status || shiftStatusFromClosingSignal(input.status),
    cash_expected: roundMoney(
      input.cashExpected ?? existing?.cash_expected ?? computed.cashExpected
    ),
    cash_counted: roundMoney(
      input.cashCounted ?? existing?.cash_counted ?? computed.cashCounted
    ),
    card_total: roundMoney(input.cardTotal ?? existing?.card_total ?? computed.cardTotal),
    momo_total: roundMoney(input.momoTotal ?? existing?.momo_total ?? computed.momoTotal),
    transfer_total: roundMoney(
      input.transferTotal ?? existing?.transfer_total ?? computed.transferTotal
    ),
    expenses_total: roundMoney(
      input.expensesTotal ?? existing?.expenses_total ?? computed.expensesTotal
    ),
    notes: input.notes ?? existing?.notes ?? null,
    accounting_review_status: existing?.accounting_review_status ?? "pending",
    accounting_reviewed_by_user_id: existing?.accounting_reviewed_by_user_id ?? null,
    accounting_reviewed_at: existing?.accounting_reviewed_at ?? null,
    accounting_note: existing?.accounting_note ?? null,
    manager_approved_by_user_id: existing?.manager_approved_by_user_id ?? null,
    manager_approved_at: existing?.manager_approved_at ?? null,
    manager_note: existing?.manager_note ?? null,
    rejected_by_user_id: existing?.rejected_by_user_id ?? null,
    rejected_at: existing?.rejected_at ?? null,
    reject_reason: existing?.reject_reason ?? null,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  const nextRows =
    existingIndex >= 0
      ? rows.map((row, index) => (index === existingIndex ? next : row))
      : [next, ...rows];

  writeShiftClosings(nextRows);
  return next;
}

export function ensureShiftClosingRecord(input: UpsertShiftClosingInput) {
  return upsertShiftClosingRecord({
    ...input,
    status: normalizeClosingStatus(input.status),
    shiftStatus: input.shiftStatus || shiftStatusFromClosingSignal(input.status),
  });
}

export function reviewShiftClosing(input: ShiftClosingReviewInput): ShiftClosingRecord {
  const rows = loadShiftClosings();
  const target = String(input.id);
  const now = new Date().toISOString();
  const index = rows.findIndex((row) => String(row.id) === target);

  if (index < 0) {
    throw new Error("Closing record was not found.");
  }

  const row = rows[index];
  const reviewStatus = input.reviewStatus ?? row.accounting_review_status ?? "pending";
  const updated: ShiftClosingRecord = {
    ...row,
    status:
      reviewStatus === "approved"
        ? "approved"
        : reviewStatus === "rejected"
        ? "rejected"
        : row.status,
    shift_status:
      reviewStatus === "approved" || reviewStatus === "rejected"
        ? "reviewed"
        : row.shift_status,
    accounting_review_status: reviewStatus,
    accounting_reviewed_by_user_id:
      input.reviewedBy ?? row.accounting_reviewed_by_user_id ?? null,
    accounting_reviewed_at:
      reviewStatus === "pending" ? row.accounting_reviewed_at ?? null : now,
    accounting_note: input.note?.trim() || row.accounting_note || null,
    rejected_by_user_id:
      reviewStatus === "rejected"
        ? input.reviewedBy ?? row.rejected_by_user_id ?? null
        : row.rejected_by_user_id ?? null,
    rejected_at: reviewStatus === "rejected" ? now : row.rejected_at ?? null,
    reject_reason:
      reviewStatus === "rejected"
        ? input.note?.trim() || row.reject_reason || "Rejected by accounting"
        : row.reject_reason ?? null,
    updated_at: now,
  };

  const nextRows = rows.map((item, itemIndex) => (itemIndex === index ? updated : item));

  writeShiftClosings(nextRows);
  return updated;
}

export function syncShiftClosingsFromShifts(
  shifts: Array<Record<string, any>>,
  defaults: {
    businessId?: string | number;
    branchId?: string | null;
    departmentKey?: string | null;
    submittedBy?: string | number | null;
  } = {}
) {
  let changed = false;

  (shifts || []).forEach((shift) => {
    const shiftId = String(shift?.id ?? "").trim();
    if (!shiftId) return;

    const shiftStatus = shiftStatusFromClosingSignal(shift?.status);
    if (shiftStatus === "open" || shiftStatus === "unclosed") return;

    const existing = loadShiftClosings().find(
      (row) => String(row.shift_id ?? "").trim() === shiftId
    );

    if (existing) return;

    upsertShiftClosingRecord({
      shiftId,
      businessId: shift?.businessId || defaults.businessId,
      branchId: shift?.branchId || defaults.branchId,
      departmentKey: shift?.departmentKey || defaults.departmentKey,
      submittedAt: shift?.submittedAt || shift?.closedAt || new Date().toISOString(),
      submittedBy: shift?.submittedBy || defaults.submittedBy || "system",
      submissionMode: shiftStatus === "auto_submitted" ? "automatic" : "manual",
      status: normalizeClosingStatus(shift?.status),
      shiftStatus,
      notes: shift?.notes || null,
    });
    changed = true;
  });

  return changed;
}
