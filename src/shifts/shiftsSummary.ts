// src/shifts/shiftSummary.ts
type PayMethod = "CASH" | "MOMO" | "CARD" | "TRANSFER";
type PaymentMode = "PAY_NOW" | "POST_TO_ROOM";

export type LocalTransaction = {
  id: string;
  shiftId?: string;

  sourceDept: string;
  total: number;

  paymentMode: PaymentMode;
  paymentMethod?: PayMethod;
  amountPaid?: number;

  status: "OPEN" | "PAID" | "POSTED_TO_ROOM";
  createdAt: number;
};

const STORAGE_KEY = "sikatech_transactions_v1";

export type ShiftSummary = {
  count: number;

  grossTotal: number;

  paidTotal: number;
  unpaidTotal: number;

  postedToRoomTotal: number;

  byMethod: Record<PayMethod, number>;

  lastSaleAt?: number;
};

function safeNum(n: unknown) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

export function loadLocalTransactions(): LocalTransaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as LocalTransaction[];
  } catch {
    return [];
  }
}

export function summarizeShift(
  shiftId: string,
  opts?: { departmentKey?: string }
): ShiftSummary {
  const list = loadLocalTransactions().filter((t) => {
    if (!t.shiftId) return false;
    if (t.shiftId !== shiftId) return false;
    if (opts?.departmentKey && t.sourceDept !== opts.departmentKey) return false;
    return true;
  });

  const byMethod: Record<PayMethod, number> = {
    CASH: 0,
    MOMO: 0,
    CARD: 0,
    TRANSFER: 0,
  };

  let grossTotal = 0;
  let paidTotal = 0;
  let unpaidTotal = 0;
  let postedToRoomTotal = 0;

  let lastSaleAt: number | undefined = undefined;

  for (const t of list) {
    const total = safeNum(t.total);
    grossTotal += total;

    if (typeof t.createdAt === "number") {
      if (!lastSaleAt || t.createdAt > lastSaleAt) lastSaleAt = t.createdAt;
    }

    if (t.status === "POSTED_TO_ROOM" || t.paymentMode === "POST_TO_ROOM") {
      postedToRoomTotal += total;
      continue;
    }

    // PAY_NOW
    const paid = safeNum(t.amountPaid);
    if (paid >= total && total > 0) {
      paidTotal += total;
    } else {
      // still count what’s owed (if any)
      unpaidTotal += Math.max(0, total - paid);
      paidTotal += Math.min(total, paid);
    }

    const m = t.paymentMethod;
    if (m && byMethod[m] !== undefined) {
      byMethod[m] += Math.min(total, paid > 0 ? paid : total); // best-effort
    }
  }

  return {
    count: list.length,
    grossTotal,
    paidTotal,
    unpaidTotal,
    postedToRoomTotal,
    byMethod,
    lastSaleAt,
  };
}

export function money(n: number) {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}
