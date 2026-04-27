// server/src/routes/transactions.mvp.ts
import { Router, type Request } from "express";
import { db, uid, type ApprovalRequest, type Transaction } from "../mvp/store.js";
import { requireUser } from "../mvp/authDev.js";
import {
  assertScope,
  canCreateTxn,
  canEditTxnDirect,
  canVoidTxnDirect,
  canApprove,
  denyIfSelfApprove,
} from "../mvp/guards.js";

const router = Router();
router.use(requireUser);

type ReqUser = {
  employeeId: string;
  role: string;
  businessId: string;
  branchId?: string;
  departmentKey?: string;
};

function getUser(req: Request): ReqUser {
  const user = (req as unknown as { user?: ReqUser }).user;
  if (!user) throw new Error("Unauthorized: req.user missing");
  return user;
}

function normBranchId(v: unknown) {
  return String(v ?? "").trim();
}

function getCloseStatus(shift: any): string {
  return String(shift?.close_status ?? shift?.closeStatus ?? "open");
}

function isShiftWritable(shift: any): boolean {
  return shift?.status === "open" && getCloseStatus(shift) === "open";
}

type Totals = {
  items: Array<{ id: string; name: string; qty: number; unitPrice: number; discount: number }>;
  subtotal: number;
  discountTotal: number;
  total: number;
};

function computeTotals(items: unknown): Totals {
  const safe = (Array.isArray(items) ? items : [])
    .map((x: any) => ({
      id: String(x?.id || uid("li")),
      name: String(x?.name || "").trim(),
      qty: Math.max(0, Number(x?.qty) || 0),
      unitPrice: Math.max(0, Number(x?.unitPrice) || 0),
      discount: Math.max(0, Number(x?.discount) || 0),
    }))
    .filter((x) => x.name && x.qty > 0);

  const subtotal = safe.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const discountTotal = safe.reduce((s, it) => s + it.discount, 0);
  const total = Math.max(0, subtotal - discountTotal);

  return { items: safe, subtotal, discountTotal, total };
}

function normalizeTxnStatus(raw: unknown): Transaction["status"] {
  const s = String(raw ?? "PAID").toUpperCase();
  if (s === "OPEN" || s === "PAID" || s === "POSTED_TO_ROOM" || s === "VOID") return s;
  return "PAID";
}

/**
 * POST /api/transactions
 * body: { shiftId, items, status? }
 */
router.post("/transactions", (req, res) => {
  const user = getUser(req);

  const shiftId = String(req.body?.shiftId ?? "").trim();
  if (!shiftId) return res.status(400).json({ ok: false, error: "shiftId is required" });

  const shift = db.shifts.get(shiftId);
  if (!shift) return res.status(404).json({ ok: false, error: "Shift not found" });

  // ✅ NEW: shift lock rule
  if (!isShiftWritable(shift)) {
    return res.status(409).json({
      ok: false,
      code: "SHIFT_LOCKED",
      error: "Shift is locked (close requested or already closed).",
      closeStatus: getCloseStatus(shift),
    });
  }

  const sc = assertScope(user as any, shift as any);
  if (!sc.ok) return res.status(403).json({ ok: false, error: sc.error });

  const allowed = canCreateTxn(user as any, shift as any);
  if (!allowed.ok) return res.status(403).json({ ok: false, error: allowed.error });

  const totals = computeTotals(req.body?.items);
  if (totals.items.length === 0) {
    return res.status(400).json({ ok: false, error: "Add at least one item." });
  }

  const txn: Transaction = {
    id: uid("txn"),
    businessId: user.businessId,
    branchId: normBranchId(user.branchId),
    departmentKey: shift.departmentKey,
    shiftId: shift.id,

    items: totals.items,
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    total: totals.total,

    status: normalizeTxnStatus(req.body?.status),
    createdAt: Date.now(),
    createdBy: { employeeId: user.employeeId, role: user.role as any },
  };

  db.transactions.set(txn.id, txn);
  return res.json({ ok: true, transaction: txn });
});

/**
 * PATCH /api/transactions/:txnId
 */
router.patch("/transactions/:txnId", (req, res) => {
  const user = getUser(req);

  const txn = db.transactions.get(req.params.txnId);
  if (!txn) return res.status(404).json({ ok: false, error: "Transaction not found" });

  const sc = assertScope(user as any, txn as any);
  if (!sc.ok) return res.status(403).json({ ok: false, error: sc.error });

  const shift = db.shifts.get(txn.shiftId);
  if (!shift) return res.status(500).json({ ok: false, error: "Shift missing for txn" });

  // ✅ NEW: shift lock rule
  if (!isShiftWritable(shift)) {
    return res.status(409).json({
      ok: false,
      code: "SHIFT_LOCKED",
      error: "Shift is locked (close requested or already closed).",
      closeStatus: getCloseStatus(shift),
    });
  }

  const allowed = canEditTxnDirect(user as any, shift as any);
  if (!allowed.ok) return res.status(403).json({ ok: false, error: allowed.error });

  const totals = computeTotals(req.body?.items ?? txn.items);
  if (totals.items.length === 0) {
    return res.status(400).json({ ok: false, error: "Items cannot be empty." });
  }

  txn.items = totals.items;
  txn.subtotal = totals.subtotal;
  txn.discountTotal = totals.discountTotal;
  txn.total = totals.total;

  if (req.body?.status !== undefined) {
    const s = normalizeTxnStatus(req.body.status);
    if (s === "OPEN" || s === "PAID" || s === "POSTED_TO_ROOM") txn.status = s;
  }

  txn.updatedAt = Date.now();
  txn.updatedBy = { employeeId: user.employeeId, role: user.role as any };

  db.transactions.set(txn.id, txn);
  return res.json({ ok: true, transaction: txn });
});

/**
 * POST /api/transactions/:txnId/void
 */
router.post("/transactions/:txnId/void", (req, res) => {
  const user = getUser(req);

  const txn = db.transactions.get(req.params.txnId);
  if (!txn) return res.status(404).json({ ok: false, error: "Transaction not found" });

  const sc = assertScope(user as any, txn as any);
  if (!sc.ok) return res.status(403).json({ ok: false, error: sc.error });

  const shift = db.shifts.get(txn.shiftId);
  if (!shift) return res.status(500).json({ ok: false, error: "Shift missing for txn" });

  // ✅ NEW: shift lock rule
  if (!isShiftWritable(shift)) {
    return res.status(409).json({
      ok: false,
      code: "SHIFT_LOCKED",
      error: "Shift is locked (close requested or already closed).",
      closeStatus: getCloseStatus(shift),
    });
  }

  const allowed = canVoidTxnDirect(user as any, shift as any);
  if (!allowed.ok) return res.status(403).json({ ok: false, error: allowed.error });

  const reason = String(req.body?.reason ?? "").trim();
  if (!reason) return res.status(400).json({ ok: false, error: "Void reason is required." });

  txn.status = "VOID";
  txn.voidReason = reason;
  txn.updatedAt = Date.now();
  txn.updatedBy = { employeeId: user.employeeId, role: user.role as any };

  db.transactions.set(txn.id, txn);
  return res.json({ ok: true, transaction: txn });
});

/**
 * POST /api/transactions/:txnId/request-change
 */
router.post("/transactions/:txnId/request-change", (req, res) => {
  const user = getUser(req);

  const txn = db.transactions.get(req.params.txnId);
  if (!txn) return res.status(404).json({ ok: false, error: "Transaction not found" });

  const sc = assertScope(user as any, txn as any);
  if (!sc.ok) return res.status(403).json({ ok: false, error: sc.error });

  const shift = db.shifts.get(txn.shiftId);
  if (!shift) return res.status(500).json({ ok: false, error: "Shift missing for txn" });

  // If shift is open & writable, they should edit directly
  if (isShiftWritable(shift)) {
    return res.status(400).json({
      ok: false,
      error: "Shift is open. Edit/void directly instead of request.",
    });
  }

  const action = String(req.body?.action ?? "").toUpperCase();
  if (action !== "EDIT" && action !== "VOID") {
    return res.status(400).json({ ok: false, error: "action must be EDIT or VOID" });
  }

  const reason = String(req.body?.reason ?? "").trim();
  if (!reason) return res.status(400).json({ ok: false, error: "reason is required" });

  const ar: ApprovalRequest = {
    id: uid("apr"),
    businessId: txn.businessId,
    branchId: normBranchId(txn.branchId),
    departmentKey: txn.departmentKey,
    targetType: "transaction",
    targetId: txn.id,
    shiftId: txn.shiftId,
    action: action as ApprovalRequest["action"],
    proposedPatch: req.body?.proposedPatch,
    reason,
    requestedBy: { employeeId: user.employeeId, role: user.role as any },
    requestedAt: Date.now(),
    status: "PENDING",
  };

  db.approvalRequests.set(ar.id, ar);
  return res.json({ ok: true, request: ar });
});

/**
 * POST /api/approval-requests/:requestId/approve
 */
router.post("/approval-requests/:requestId/approve", (req, res) => {
  const user = getUser(req);

  const ar = db.approvalRequests.get(req.params.requestId);
  if (!ar) return res.status(404).json({ ok: false, error: "Approval request not found" });

  if (!canApprove(user.role as any)) {
    return res.status(403).json({ ok: false, error: "Not allowed to approve." });
  }

  const sep = denyIfSelfApprove(user as any, ar as any);
  if (!sep.ok) return res.status(403).json({ ok: false, error: sep.error });

  const txn = db.transactions.get(ar.targetId);
  if (!txn) return res.status(404).json({ ok: false, error: "Target transaction not found" });

  const sc = assertScope(user as any, txn as any);
  if (!sc.ok) return res.status(403).json({ ok: false, error: sc.error });

  if (ar.action === "VOID") {
    txn.status = "VOID";
    txn.voidReason = ar.reason;
  } else {
    const patch = (ar.proposedPatch ?? {}) as any;

    if (patch.items) {
      const totals = computeTotals(patch.items);
      if (totals.items.length === 0) {
        return res.status(400).json({ ok: false, error: "Proposed items cannot be empty." });
      }
      txn.items = totals.items;
      txn.subtotal = totals.subtotal;
      txn.discountTotal = totals.discountTotal;
      txn.total = totals.total;
    }

    if (
      patch.status &&
      (patch.status === "OPEN" || patch.status === "PAID" || patch.status === "POSTED_TO_ROOM")
    ) {
      txn.status = patch.status;
    }
  }

  txn.updatedAt = Date.now();
  txn.updatedBy = { employeeId: user.employeeId, role: user.role as any };
  db.transactions.set(txn.id, txn);

  ar.status = "APPROVED";
  ar.decidedBy = { employeeId: user.employeeId, role: user.role as any };
  ar.decidedAt = Date.now();
  ar.decisionNote = String(req.body?.note ?? "").trim() || undefined;
  db.approvalRequests.set(ar.id, ar);

  return res.json({ ok: true, request: ar, transaction: txn });
});

/**
 * POST /api/approval-requests/:requestId/reject
 */
router.post("/approval-requests/:requestId/reject", (req, res) => {
  const user = getUser(req);

  const ar = db.approvalRequests.get(req.params.requestId);
  if (!ar) return res.status(404).json({ ok: false, error: "Approval request not found" });

  if (!canApprove(user.role as any)) {
    return res.status(403).json({ ok: false, error: "Not allowed to reject." });
  }

  const sep = denyIfSelfApprove(user as any, ar as any);
  if (!sep.ok) return res.status(403).json({ ok: false, error: sep.error });

  ar.status = "REJECTED";
  ar.decidedBy = { employeeId: user.employeeId, role: user.role as any };
  ar.decidedAt = Date.now();
  ar.decisionNote = String(req.body?.note ?? "").trim() || undefined;

  db.approvalRequests.set(ar.id, ar);
  return res.json({ ok: true, request: ar });
});

export default router;
