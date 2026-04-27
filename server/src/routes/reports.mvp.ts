// server/src/routes/reports.mvp.ts
import { Router } from "express";
import { pool } from "../db";
import type { RowDataPacket } from "mysql2/promise";
import { getPayNowSalesTotal } from "../mvp/expectedTotals";


const router = Router();

/* ----------------------------- Types ----------------------------- */
type DepartmentTotalsRow = RowDataPacket & {
  department: string;
  total: string | null; // MySQL returns DECIMAL as string
};

type CashDeskTotalsRow = RowDataPacket & {
  cashDesk: string;
  total: string | null;
};

type ShiftOpenRow = RowDataPacket & {
  opening_cash: string | null;
};

type PayNowRow = RowDataPacket & {
  pay_now_sales: string | null;
};

/* ----------------------------- Helpers ----------------------------- */
function asNumber(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * GET /api/reports/shift-summary?cashDeskShiftId=...
 */
router.get("/shift-summary", async (req, res) => {
  try {
    const cashDeskShiftId = String(req.query.cashDeskShiftId ?? "").trim();

    if (!cashDeskShiftId) {
      return res.status(400).json({
        ok: false,
        error: "cashDeskShiftId is required",
      });
    }

    /* ---------------- Department Totals ---------------- */
    const [departmentTotals] = await pool.query<DepartmentTotalsRow[]>(
      `
      SELECT d.name AS department, COALESCE(SUM(s.amount), 0) AS total
      FROM sales s
      JOIN departments d ON d.id = s.department_id
      WHERE s.cash_desk_shift_id = ?
        AND s.status = 'active'
      GROUP BY d.name
      ORDER BY total DESC
      `,
      [cashDeskShiftId]
    );

    /* ---------------- Cash Desk Totals (Pay Now) ---------------- */
    const [cashDeskTotals] = await pool.query<CashDeskTotalsRow[]>(
      `
      SELECT cd.name AS cashDesk, COALESCE(SUM(s.amount), 0) AS total
      FROM sales s
      JOIN cash_desks cd ON cd.id = s.cash_desk_id
      JOIN payment_methods pm ON pm.id = s.payment_method_id
      WHERE s.cash_desk_shift_id = ?
        AND s.status = 'active'
        AND pm.kind = 'pay_now'
      GROUP BY cd.name
      ORDER BY total DESC
      `,
      [cashDeskShiftId]
    );

    /* ---------------- Opening Cash ---------------- */
    const [shiftRows] = await pool.query<ShiftOpenRow[]>(
      `
      SELECT opening_cash
      FROM cash_desk_shifts
      WHERE id = ?
      LIMIT 1
      `,
      [cashDeskShiftId]
    );

    const openingCash = asNumber(shiftRows[0]?.opening_cash, 0);

    /* ---------------- Pay Now Sales ---------------- */
    const [payNowRows] = await pool.query<PayNowRow[]>(
      `
      SELECT COALESCE(SUM(s.amount), 0) AS pay_now_sales
      FROM sales s
      JOIN payment_methods pm ON pm.id = s.payment_method_id
      WHERE s.cash_desk_shift_id = ?
        AND s.status = 'active'
        AND pm.kind = 'pay_now'
      `,
      [cashDeskShiftId]
    );

    const payNowSales = asNumber(payNowRows[0]?.pay_now_sales, 0);

    return res.json({
      ok: true,
      cashDeskShiftId,
      openingCash,
      payNowSales,
      expectedCash: Number((openingCash + payNowSales).toFixed(2)),
      departmentTotals: departmentTotals.map((r) => ({
        department: r.department,
        total: asNumber(r.total, 0),
      })),
      cashDeskTotals: cashDeskTotals.map((r) => ({
        cashDesk: r.cashDesk,
        total: asNumber(r.total, 0),
      })),
    });
  } catch (error) {
    console.error("REPORT ERROR:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to load shift summary",
    });
  }
});

export default router;
