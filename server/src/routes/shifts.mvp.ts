// server/src/routes/shifts.mvp.ts
import { Router, type Request } from "express";
import { db, uid, type Shift } from "../mvp/store.js";
import { requireUser } from "../mvp/authDev.js";
import {
  assertScope,
  canAccountingReview,
  canApprove,
  denyIfSameCloseAndApprove,
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

// authDev attaches req.user at runtime
function getUser(req: Request): ReqUser {
  const user = (req as unknown as { user?: ReqUser }).user;
  if (!user) throw new Error("Unauthorized: req.user missing");
  return user;
}

function normBranchId(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeDept(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * Find the latest open shift for a dept in the user's business + branch
 */
function findLatestOpenShift(user: ReqUser, deptKey: string) {
  const userBranch = normBranchId(user.branchId);

  return Array.from(db.shifts.values())
    .filter((s) => {
      if (s.businessId !== user.businessId) return false;
      if (normBranchId(s.branchId) !== userBranch) return false;
      if (s.departmentKey !== deptKey) return false;
      return s.status === "open";
    })
    .sort((a, b) => b.openedAt - a.openedAt)[0];
}

/**
 * Shared handler for opening shifts
 */
function handleOpenShift(req: Request, res: any) {
  const user = getUser(req);

  const dept = normalizeDept((req as any).body?.departmentKey);
  if (!dept) {
    return res.status(400).json({ ok: false, error: "departmentKey is required" });
  }

  // Staff can only open shifts for their own department
  if (user.role === "staff" && user.departmentKey && dept !== user.departmentKey) {
    return res
      .status(403)
      .json({ ok: false, error: "Not allowed to open shift for another department." });
  }

  const existing = findLatestOpenShift(user, dept);
  if (existing) {
    return res.json({ ok: true, shift: existing, existing: true });
  }

  const shift: Shift = {
    id: uid("shift"),
    businessId: user.businessId,
    branchId: normBranchId(user.branchId),
    departmentKey: dept,
    openedBy: { employeeId: user.employeeId, role: user.role as any },
    openedAt: Date.now(),
    status: "open",
  };

  db.shifts.set(shift.id, shift);
  return res.json({ ok: true, shift, existing: false });
}

/**
 * ✅ Frontend expects: POST /api/shifts/open
 */
router.post("/open", (req, res) => handleOpenShift(req, res));

/**
 * ✅ Keep your original: POST /api/shifts (backward compatible)
 */
router.post("/", (req, res) => handleOpenShift(req, res));

/**
 * GET /api/shifts?departmentKey=
 */
router.get("/", (req, res) => {
  const user = getUser(req);

  const deptQ = normalizeDept(req.query.departmentKey);
  const userBranch = normBranchId(user.branchId);

  const all = Array.from(db.shifts.values()).filter((s) => {
    if (s.businessId !== user.businessId) return false;
    if (normBranchId(s.branchId) !== userBranch) return false;
    if (deptQ && s.departmentKey !== deptQ) return false;
    return true;
  });

  const scoped =
    user.role === "staff" && user.departmentKey
      ? all.filter((s) => s.departmentKey === user.departmentKey)
      : all;

  scoped.sort((a, b) => b.openedAt - a.openedAt);
  return res.json({ ok: true, shifts: scoped });
});

/**
 * GET /api/shifts/open/current?departmentKey=
 */
router.get("/open/current", (req, res) => {
  const user = getUser(req);

  const deptQ = normalizeDept(req.query.departmentKey);
  if (!deptQ) {
    return res.status(400).json({ ok: false, error: "departmentKey is required" });
  }

  if (user.role === "staff" && user.departmentKey && deptQ !== user.departmentKey) {
    return res.status(403).json({ ok: false, error: "Not allowed" });
  }

  const open = findLatestOpenShift(user, deptQ) ?? null;
  return res.json({ ok: true, shift: open });
});

/**
 * GET /api/shifts/:shiftId
 */
router.get("/:shiftId", (req, res) => {
  const user = getUser(req);

  const shift = db.shifts.get(req.params.shiftId);
  if (!shift) return res.status(404).json({ ok: false, error: "Shift not found" });

  const sc = assertScope(user as any, shift);
  if (!sc.ok) return res.status(403).json({ ok: false, error: sc.error });

  return res.json({ ok: true, shift });
});

/**
 * GET /api/shifts/:shiftId/transactions
 */
router.get("/:shiftId/transactions", (req, res) => {
  const user = getUser(req);

  const shift = db.shifts.get(req.params.shiftId);
  if (!shift) return res.status(404).json({ ok: false, error: "Shift not found" });

  const sc = assertScope(user as any, shift);
  if (!sc.ok) return res.status(403).json({ ok: false, error: sc.error });

  const txns = Array.from(db.transactions.values()).filter((t) => t.shiftId === shift.id);
  txns.sort((a, b) => b.createdAt - a.createdAt);

  return res.json({ ok: true, transactions: txns });
});

/**
 * POST /api/shifts/:shiftId/transactions
 * body: { type, amount, note? }
 * ✅ (Frontend will need this soon)
 */
router.post("/:shiftId/transactions", (req, res) => {
  const user = getUser(req);

  const shift = db.shifts.get(req.params.shiftId);
  if (!shift) return res.status(404).json({ ok: false, error: "Shift not found" });

  const sc = assertScope(user as any, shift);
  if (!sc.ok) return res.status(403).json({ ok: false, error: sc.error });

  const type = String((req as any).body?.type ?? "").trim();
  const amount = Number((req as any).body?.amount ?? 0);
  const note = String((req as any).body?.note ?? "").trim();

  if (!type) return res.status(400).json({ ok: false, error: "type is required" });
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: "amount must be > 0" });
  }

  const txn = {
    id: uid("txn"),
    shiftId: shift.id,
    type,
    amount,
    note: note || undefined,
    createdAt: Date.now(),
    createdBy: { employeeId: user.employeeId, role: user.role as any },
  };

  db.transactions.set(txn.id, txn as any);
  return res.json({ ok: true, transaction: txn });
});

/**
 * POST /api/shifts/:shiftId/submit-closing
 */
router.post("/:shiftId/submit-closing", (req, res) => {
  const user = getUser(req);

  const shift = db.shifts.get(req.params.shiftId);
  if (!shift) return res.status(404).json({ ok: false, error: "Shift not found" });

  const sc = assertScope(user as any, shift);
  if (!sc.ok) return res.status(403).json({ ok: false, error: sc.error });

  if (shift.status !== "open") {
    return res.status(400).json({ ok: false, error: "Shift is not open." });
  }

  shift.status = "closing_submitted";
  shift.closingSubmittedBy = { employeeId: user.employeeId, role: user.role as any };
  shift.closingSubmittedAt = Date.now();

  db.shifts.set(shift.id, shift);
  return res.json({ ok: true, shift });
});

/**
 * POST /api/shifts/:shiftId/accounting-review
 */
router.post("/:shiftId/accounting-review", (req, res) => {
  const user = getUser(req);

  const shift = db.shifts.get(req.params.shiftId);
  if (!shift) return res.status(404).json({ ok: false, error: "Shift not found" });

  const sc = assertScope(user as any, shift);
  if (!sc.ok) return res.status(403).json({ ok: false, error: sc.error });

  if (!canAccountingReview(user.role as any)) {
    return res
      .status(403)
      .json({ ok: false, error: "Not allowed to accounting-review shifts." });
  }

  if (shift.status !== "closing_submitted") {
    return res.status(400).json({ ok: false, error: "Shift must be closing_submitted first." });
  }

  shift.status = "accounting_reviewed";
  shift.accountingReviewedBy = { employeeId: user.employeeId, role: user.role as any };
  shift.accountingReviewedAt = Date.now();

  const note = String((req as any).body?.note ?? "").trim();
  shift.accountingNote = note || undefined;

  db.shifts.set(shift.id, shift);
  return res.json({ ok: true, shift });
});

/**
 * POST /api/shifts/:shiftId/approve-close
 */
router.post("/:shiftId/approve-close", (req, res) => {
  const user = getUser(req);

  const shift = db.shifts.get(req.params.shiftId);
  if (!shift) return res.status(404).json({ ok: false, error: "Shift not found" });

  const sc = assertScope(user as any, shift);
  if (!sc.ok) return res.status(403).json({ ok: false, error: sc.error });

  if (!canApprove(user.role as any)) {
    return res.status(403).json({ ok: false, error: "Not allowed to approve close." });
  }

  if (shift.status !== "accounting_reviewed") {
    return res
      .status(400)
      .json({ ok: false, error: "Shift must be accounting_reviewed before close." });
  }

  const sep = denyIfSameCloseAndApprove(user as any, shift);
  if (!sep.ok) return res.status(403).json({ ok: false, error: sep.error });

  shift.status = "closed";
  shift.approvedClosedBy = { employeeId: user.employeeId, role: user.role as any };
  shift.approvedClosedAt = Date.now();

  db.shifts.set(shift.id, shift);
  return res.json({ ok: true, shift });
});

export default router;

