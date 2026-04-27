import { normalizeDepartmentKey } from "./departments";

export type ShiftTraceStatus = "open" | "unclosed" | "submitted" | "reviewed" | "auto_submitted";
export type SubmissionMode = "manual" | "automatic";

export type ShiftTrace = {
  shiftId?: string;
  shiftStatus: ShiftTraceStatus;
  submittedAt?: string;
  submittedBy?: string;
  submissionMode?: SubmissionMode;
};

const TRACE_KEY = "sikatech_shift_trace_v1";
const EXPECTED_SHIFT_MS = 12 * 60 * 60 * 1000;

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
  } catch {
    // Trace metadata should never block transaction visibility.
  }
}

export function recordShiftSubmission(input: {
  shiftId?: string | number;
  status?: ShiftTraceStatus;
  submittedAt?: string;
  submittedBy?: string;
  submissionMode?: SubmissionMode;
}) {
  const shiftId = String(input.shiftId ?? "").trim();
  if (!shiftId) return;

  const store = readTraceStore();
  store[shiftId] = {
    shiftId,
    shiftStatus: input.status || "submitted",
    submittedAt: input.submittedAt || new Date().toISOString(),
    submittedBy: input.submittedBy,
    submissionMode: input.submissionMode || "manual",
  };
  writeTraceStore(store);
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
  if (value === "accounting_reviewed" || value === "reviewed" || value === "manager_approved" || value === "closed") return "reviewed";
  if (value === "closing_submitted" || value === "submitted" || value === "pending_close" || value === "pending_closing") return "submitted";
  if (value === "open") return "open";
  if (value === "unclosed") return "unclosed";
  return "unclosed";
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

  const openedAt = parseTraceTime(matchingShift?.openedAt);
  const hasSubmittedSignal = shiftStatus === "submitted" || shiftStatus === "reviewed";

  if (!hasSubmittedSignal && openedAt && now - openedAt > EXPECTED_SHIFT_MS) {
    shiftStatus = "auto_submitted";
    submittedAt = submittedAt || new Date(openedAt + EXPECTED_SHIFT_MS).toISOString();
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
