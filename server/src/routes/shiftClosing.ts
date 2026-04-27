import { Router } from "express";
import { pool } from "../db.js";
import { requireUser } from "../mvp/authDev.js";

const router = Router();

router.get("/ping", (_req, res) => res.json({ ok: true, route: "shift-closing" }));

type DevUser = {
  employeeId: string;
  role: string;
  businessId: string;
  branchId?: string;
  departmentKey?: string;
};

function getUser(req: any): DevUser {
  const user = req.user as DevUser | undefined;
  if (!user) {
    throw new Error("Unauthorized: req.user missing");
  }
  return user;
}

const isAccounting = (role: string) =>
  ["accounting", "auditor", "admin"].includes(String(role).toLowerCase());

const isManager = (role: string) =>
  ["manager", "assistant_manager", "admin"].includes(String(role).toLowerCase());

const canReject = (role: string) =>
  ["accounting", "auditor", "manager", "assistant_manager", "admin"].includes(
    String(role).toLowerCase()
  );

/**
 * Turn values like "1", "bar01", "user7" into a usable numeric id.
 * Falls back to 1 for local MVP.
 */
function toSafeNumericUserId(value: unknown): number {
  const raw = String(value ?? "").trim();

  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  const digits = raw.match(/\d+/)?.[0];
  if (digits) {
    return Number(digits);
  }

  return 1;
}

router.use(requireUser);

router.get("/", async (req: any, res) => {
  try {
    const user = getUser(req);

    const businessId = Number(req.query.businessId ?? user.businessId);
    const status = String(req.query.status ?? "").trim();

    if (!businessId) {
      return res.status(400).json({ ok: false, error: "businessId is required" });
    }

    const params: any[] = [businessId];
    let where = "WHERE business_id = ?";

    if (status) {
      where += " AND status = ?";
      params.push(status);
    }

    if (String(user.role).toLowerCase() === "staff") {
      where += " AND submitted_by_user_id = ?";
      params.push(toSafeNumericUserId(user.employeeId));
    }

    const [rows] = await pool.query(
      `
      SELECT
        id, business_id, shift_id,
        submitted_by_user_id, submitted_at,
        status,
        cash_expected, cash_counted, card_total, momo_total, expenses_total,
        notes,
        accounting_reviewed_by_user_id, accounting_reviewed_at, accounting_note,
        manager_approved_by_user_id, manager_approved_at, manager_note,
        rejected_by_user_id, rejected_at, reject_reason
      FROM shift_closings
      ${where}
      ORDER BY submitted_at DESC
      LIMIT 200
      `,
      params
    );

    res.json({ ok: true, rows });
  } catch (e) {
    console.error("shift-closing GET error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const user = getUser(req);

    const {
      businessId = user.businessId,
      notes = null,
      cashExpected = 0,
      cashCounted = 0,
      cardTotal = 0,
      momoTotal = 0,
      expensesTotal = 0,
    } = req.body ?? {};

    const safeBusinessId = Number(businessId);
    const safeUserId = toSafeNumericUserId(user.employeeId);

    if (!safeBusinessId) {
      return res.status(400).json({ ok: false, error: "businessId is required" });
    }

    const sqlShiftId = null;

    const [result]: any = await pool.query(
      `
      INSERT INTO shift_closings
      (business_id, shift_id, submitted_by_user_id,
       cash_expected, cash_counted, card_total, momo_total, expenses_total, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')
      `,
      [
        safeBusinessId,
        sqlShiftId,
        safeUserId,
        Number(cashExpected),
        Number(cashCounted),
        Number(cardTotal),
        Number(momoTotal),
        Number(expensesTotal),
        notes,
      ]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (e) {
    console.error("shift-closing POST error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

router.patch("/:id/accounting-review", async (req: any, res) => {
  try {
    const user = getUser(req);

    if (!isAccounting(user.role)) {
      return res.status(403).json({ ok: false, error: "Not allowed" });
    }

    const id = Number(req.params.id);
    const { accountingNote = null } = req.body ?? {};

    const [result]: any = await pool.query(
      `
      UPDATE shift_closings
      SET status='accounting_reviewed',
          accounting_reviewed_by_user_id=?,
          accounting_reviewed_at=NOW(),
          accounting_note=?
      WHERE id=? AND status='submitted'
      `,
      [toSafeNumericUserId(user.employeeId), accountingNote, id]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({ ok: false, error: "Not in submitted state or not found" });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("shift-closing accounting-review error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

router.patch("/:id/manager-approve", async (req: any, res) => {
  try {
    const user = getUser(req);

    if (!isManager(user.role)) {
      return res.status(403).json({ ok: false, error: "Not allowed" });
    }

    const id = Number(req.params.id);
    const { managerNote = null } = req.body ?? {};

    const [result]: any = await pool.query(
      `
      UPDATE shift_closings
      SET status='manager_approved',
          manager_approved_by_user_id=?,
          manager_approved_at=NOW(),
          manager_note=?
      WHERE id=? AND status='accounting_reviewed'
      `,
      [toSafeNumericUserId(user.employeeId), managerNote, id]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        ok: false,
        error: "Not in accounting_reviewed state or not found",
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("shift-closing manager-approve error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

router.patch("/:id/reject", async (req: any, res) => {
  try {
    const user = getUser(req);

    if (!canReject(user.role)) {
      return res.status(403).json({ ok: false, error: "Not allowed" });
    }

    const id = Number(req.params.id);
    const { reason } = req.body ?? {};

    if (!reason || String(reason).trim().length < 3) {
      return res.status(400).json({ ok: false, error: "reason is required" });
    }

    const [result]: any = await pool.query(
      `
      UPDATE shift_closings
      SET status='rejected',
          rejected_by_user_id=?,
          rejected_at=NOW(),
          reject_reason=?
      WHERE id=? AND status IN ('submitted','accounting_reviewed')
      `,
      [toSafeNumericUserId(user.employeeId), String(reason).trim(), id]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({ ok: false, error: "Not rejectable state or not found" });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("shift-closing reject error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;