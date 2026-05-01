import { normalizeDepartmentKey } from "./departments";
import { ensureShiftClosingRecord, SHIFT_CLOSINGS_CHANGED_EVENT } from "../shifts/shiftClosingStore";

export type ShiftTraceStatus = "open" | "unclosed" | "submitted" | "reviewed" | "auto_submitted";
export type SubmissionMode = "manual" | "automatic";
export const SHIFT_TRACE_CHANGED_EVENT = "sikatech_shift_trace_changed";

export type ShiftTrace = {
  shiftId?: string;
  shiftStatus: ShiftTraceStatus;
  submittedAt?: string;
  submittedBy?: string;
  submissionMode?: SubmissionMode;
};

const TRACE_KEY = "sikatech_shift_trace_v1";
const EXPECTED_SHIFT_MS = 12 * 60 * 60 * 1000;
const EXPECTED_END_FIELDS = [
  "expectedEndAt",
  "expectedCloseAt",
  "scheduledEndAt",
  "scheduledCloseAt",
  "shiftEndAt",
  "endAt",
  "endsAt",
];

function readTraceStore(): Record<string, ShiftTrace> {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRACE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeTraceStore(store: Record<string, ShiftTrace>) {
  try {
    localStorage.setItem(TRACE_KEY, JSON.stringify(store));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(SHIFT_TRACE_CHANGED_EVENT));
    }, 0);
  } catch {
    // Trace metadata should never block transaction visibility.
  }
}

export function recordShiftSubmission(input: {
  shiftId?: string | number;
  closingId?: string | number;
  status?: ShiftTraceStatus;
  submittedAt?: string;
  submittedBy?: string;
  submissionMode?: SubmissionMode;
  businessId?: string | number;
  branchId?: string | null;
  departmentKey?: string | null;
  notes?: string | null;
  cashExpected?: number;
  cashCounted?: number;
  cardTotal?: number;
  momoTotal?: number;
  transferTotal?: number;
  expensesTotal?: number;
}) {
  const shiftId = String(input.shiftId ?? "").trim();
  if (!shiftId) return;
  const shiftStatus = input.status || "submitted";
  const submittedAt = input.submittedAt || new Date().toISOString();

  const store = readTraceStore();
  store[shiftId] = {
    shiftId,
    shiftStatus,
    submittedAt,
    submittedBy: input.submittedBy,
    submissionMode: input.submissionMode || "manual",
  };
  writeTraceStore(store);

  if (shiftStatus === "submitted" || shiftStatus === "auto_submitted" || shiftStatus === "reviewed") {
    ensureShiftClosingRecord({
      id: input.closingId,
      shiftId,
      businessId: input.businessId,
      branchId: input.branchId,
      departmentKey: input.departmentKey,
      submittedAt,
      submittedBy: input.submittedBy,
      submissionMode: input.submissionMode || "manual",
      status: shiftStatus,
      notes: input.notes,
      cashExpected: input.cashExpected,
      cashCounted: input.cashCounted,
      cardTotal: input.cardTotal,
      momoTotal: input.momoTotal,
      transferTotal: input.transferTotal,
      expensesTotal: input.expensesTotal,
    });
  } else {
    try {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(SHIFT_CLOSINGS_CHANGED_EVENT));
      }, 0);
    } catch {
      // Best-effort cross-dashboard refresh only.
    }
  }
}

export function parseTraceTime(value: unknown) {
  if (typeof value === "number") {
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return 0;
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      return n < 10_000_000_000 ? n * 1000 : n;
    }
    const parsed = new Date(raw).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function normalizeShiftTraceStatus(status: unknown): ShiftTraceStatus {
  const value = String(status ?? "").trim().toLowerCase();
  if (value === "auto_submitted" || value === "auto-submitted") return "auto_submitted";
  if (value === "accounting_reviewed" || value === "accounting_approved" || value === "reviewed" || value === "manager_approved" || value === "closed") return "reviewed";
  if (value === "closing_submitted" || value === "submitted" || value === "pending_close" || value === "pending_closing") return "submitted";
  if (value === "open") return "open";
  if (value === "unclosed") return "unclosed";
  return "unclosed";
}

export function getExpectedShiftEndAt(shift: Record<string, any> | null | undefined) {
  if (!shift) return 0;

  for (const field of EXPECTED_END_FIELDS) {
    const value = parseTraceTime(shift[field]);
    if (value) return value;
  }

  const openedAt = parseTraceTime(shift.openedAt);
  return openedAt ? openedAt + EXPECTED_SHIFT_MS : 0;
}

function findMatchingShift(record: Record<string, any>, shifts: any[]) {
  const shiftId = String(record.shiftId ?? "").trim();
  if (shiftId) {
    const direct = shifts.find((shift) => String(shift?.id ?? "").trim() === shiftId);
    if (direct) return direct;
  }

  const recordTime = parseTraceTime(record.createdAt ?? record.transactionTime ?? record.date);
  const recordDept = normalizeDepartmentKey(record.deptKey || record.department || record.sourceDept);
  if (!recordTime) return null;

  return (
    shifts.find((shift) => {
      if (normalizeDepartmentKey(shift?.departmentKey) !== recordDept) return false;
      const openedAt = parseTraceTime(shift?.openedAt);
      const closedAt = parseTraceTime(shift?.closedAt);
      if (!openedAt) return false;
      if (recordTime < openedAt) return false;
      if (closedAt && recordTime > closedAt) return false;
      return true;
    }) || null
  );
}

export function resolveShiftTrace(record: Record<string, any>, shifts: any[] = [], now = Date.now()): ShiftTrace {
  const store = readTraceStore();
  const matchingShift = findMatchingShift(record, shifts);
  const shiftId = String(record.shiftId ?? matchingShift?.id ?? "").trim() || undefined;
  const stored = shiftId ? store[shiftId] : undefined;

  const explicitStatus = record.shiftStatus || record.shiftReconciliationStatus || record.closingStatus;
  let shiftStatus = explicitStatus
    ? normalizeShiftTraceStatus(explicitStatus)
    : stored?.shiftStatus || normalizeShiftTraceStatus(matchingShift?.status);

  let submittedAt = record.submittedAt || stored?.submittedAt || matchingShift?.submittedAt || matchingShift?.closedAt;
  let submittedBy = record.submittedBy || stored?.submittedBy || matchingShift?.submittedBy;
  let submissionMode = record.submissionMode || stored?.submissionMode;

  const hasSubmittedSignal = shiftStatus === "submitted" || shiftStatus === "reviewed";
  const expectedEndAt = getExpectedShiftEndAt(matchingShift);

  if (!hasSubmittedSignal && expectedEndAt && now > expectedEndAt) {
    shiftStatus = "auto_submitted";
    submittedAt = submittedAt || new Date(expectedEndAt).toISOString();
    submittedBy = submittedBy || "system";
    submissionMode = "automatic";
    if (shiftId && !stored) {
      recordShiftSubmission({ shiftId, status: shiftStatus, submittedAt, submittedBy, submissionMode });
    }
  } else if (!shiftId && !explicitStatus) {
    shiftStatus = "unclosed";
  }

  if ((shiftStatus === "submitted" || shiftStatus === "reviewed") && !submissionMode) {
    submissionMode = "manual";
  }

  return {
    shiftId,
    shiftStatus,
    submittedAt: submittedAt ? new Date(parseTraceTime(submittedAt)).toISOString() : undefined,
    submittedBy,
    submissionMode,
  };
}

export function formatShiftStatus(status: unknown) {
  const value = normalizeShiftTraceStatus(status);
  if (value === "auto_submitted") return "Auto Submitted";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
