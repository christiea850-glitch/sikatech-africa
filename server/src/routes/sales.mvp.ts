// server/src/routes/sales.mvp.ts
import { Router } from "express";
import crypto from "crypto";
import { pool } from "../db";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { requireOpenShift } from "../middleware/requireOpenShift";
import { requireAuthDev } from "../mvp/authDev.js";



const router = Router();

/* ----------------------------- Types ----------------------------- */
type SaleRow = RowDataPacket & {
  id: string;
  cash_desk_shift_id: string;
  cash_desk_id: string;
  department_id: string;
  payment_method_id: string;
  amount: string; // DECIMAL returns as string
  status: "active" | "voided";
};

/* ----------------------------- Helpers ----------------------------- */
function asNumber(v: unknown, fallback = NaN) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* ====================================================================
   POST /api/sales/cash-desks/:cashDeskId
   ✅ Requires an OPEN + WRITABLE shift (not pending approval)
   Body: { departmentId, paymentMethodId, amount }
==================================================================== */
router.post(
  "/cash-desks/:cashDeskId",
  requireOpenShift(pool),
  async (req, res) => {
    try {
      const cashDeskId = String(req.params.cashDeskId ?? "").trim();
      const shiftId = String((req as any).openShiftId ?? "").trim();

      const departmentId = String(req.body?.departmentId ?? "").trim();
      const paymentMethodId = String(req.body?.paymentMethodId ?? "").trim();
      const amount = asNumber(req.body?.amount, NaN);

      if (!departmentId) {
        return res.status(400).json({ ok: false, error: "departmentId is required" });
      }
      if (!paymentMethodId) {
        return res.status(400).json({ ok: false, error: "paymentMethodId is required" });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ ok: false, error: "amount must be > 0" });
      }

      const saleId = crypto.randomUUID();

      await pool.query<ResultSetHeader>(
        `
        INSERT INTO sales (
          id,
          cash_desk_shift_id,
          cash_desk_id,
          department_id,
          payment_method_id,
          amount,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, 'active')
        `,
        [saleId, shiftId, cashDeskId, departmentId, paymentMethodId, amount]
      );

      return res.json({
        ok: true,
        result: "sale_created",
        saleId,
        cashDeskId,
        cashDeskShiftId: shiftId,
        departmentId,
        paymentMethodId,
        amount: Number(amount.toFixed(2)),
      });
    } catch (err) {
      console.error("CREATE SALE ERROR:", err);
      return res.status(500).json({ ok: false, error: "Failed to create sale" });
    }
  }
);

/* ====================================================================
   GET /api/sales/by-shift/:shiftId   (debug helper)
==================================================================== */
router.get("/by-shift/:shiftId", async (req, res) => {
  try {
    const shiftId = String(req.params.shiftId ?? "").trim();
    if (!shiftId) {
      return res.status(400).json({ ok: false, error: "shiftId is required" });
    }

    const [rows] = await pool.query<SaleRow[]>(
      `
      SELECT
        id,
        cash_desk_shift_id,
        cash_desk_id,
        department_id,
        payment_method_id,
        amount,
        status
      FROM sales
      WHERE cash_desk_shift_id = ?
      ORDER BY id DESC
      LIMIT 200
      `,
      [shiftId]
    );

    return res.json({
      ok: true,
      shiftId,
      sales: rows.map((r) => ({ ...r, amount: Number(Number(r.amount ?? 0).toFixed(2)) })),
    });
  } catch (err) {
    console.error("LIST SALES ERROR:", err);
    return res.status(500).json({ ok: false, error: "Failed to load sales" });
  }
});

/* ====================================================================
   POST /api/sales/:saleId/void
   Body: { reason }
   NOTE: This does not enforce approvals yet (we’ll do that next).
==================================================================== */
router.post("/:saleId/void", async (req, res) => {
  try {
    const saleId = String(req.params.saleId ?? "").trim();
    const reason = String(req.body?.reason ?? "").trim();

    if (!saleId) return res.status(400).json({ ok: false, error: "saleId is required" });
    if (!reason) return res.status(400).json({ ok: false, error: "reason is required" });

    const [rows] = await pool.query<SaleRow[]>(
      `SELECT id, status FROM sales WHERE id = ? LIMIT 1`,
      [saleId]
    );

    const sale = rows[0];
    if (!sale) return res.status(404).json({ ok: false, error: "Sale not found" });
    if (sale.status !== "active") {
      return res.status(409).json({ ok: false, error: "Sale is not active" });
    }

    await pool.query<ResultSetHeader>(
      `UPDATE sales SET status = 'voided' WHERE id = ?`,
      [saleId]
    );

    return res.json({ ok: true, result: "sale_voided", saleId, reason });
  } catch (err) {
    console.error("VOID SALE ERROR:", err);
    return res.status(500).json({ ok: false, error: "Failed to void sale" });
  }
});

export default router;
