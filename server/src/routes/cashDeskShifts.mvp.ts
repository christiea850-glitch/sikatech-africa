// server/src/routes/cashDeskShifts.mvp.ts
import { Router } from "express";
import crypto from "crypto";
import { pool } from "../db";
import type {
  PoolConnection,
  RowDataPacket,
  ResultSetHeader,
} from "mysql2/promise";
import { getPayNowSalesTotal } from "../mvp/expectedTotals";

const router = Router();

/* ----------------------------- Types ----------------------------- */
type ShiftStatus = "open" | "closed";

type CloseStatus =
  | "open"
  | "pending_approval"
  | "closed_balanced"
  | "closed_mismatch_approved";

type ShiftRow = RowDataPacket & {
  id: string;
  cash_desk_id: string;
  shift_label: string;
  opened_at: Date;
  closed_at: Date | null;
  opening_cash: string;
  closing_cash_counted: string | null;
  expected_total: string | null;
  variance_amount: string | null;
  variance_reason: string | null;
  status: ShiftStatus;
  close_status: CloseStatus;
  created_by: string | null;
  closed_by: string | null;
};

type IdRow = RowDataPacket & { id: string };

/* ----------------------------- Helpers ----------------------------- */
function asNumber(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function generateShiftLabel(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `SHIFT-${yyyy}${mm}${dd}-${hh}${min}`;
}

/* ====================================================================
   GET /api/cash-desk-shifts/cash-desks/:cashDeskId/open-shift
==================================================================== */
router.get("/cash-desks/:cashDeskId/open-shift", async (req, res) => {
  try {
    const cashDeskId = String(req.params.cashDeskId ?? "").trim();

    if (!cashDeskId) {
      return res
        .status(400)
        .json({ ok: false, error: "cashDeskId is required" });
    }

    const [rows] = await pool.query<ShiftRow[]>(
      `
      SELECT
        id,
        cash_desk_id,
        shift_label,
        opened_at,
        closed_at,
        opening_cash,
        closing_cash_counted,
        expected_total,
        variance_amount,
        variance_reason,
        status,
        close_status,
        created_by,
        closed_by
      FROM cash_desk_shifts
      WHERE cash_desk_id = ?
        AND status = 'open'
        AND close_status = 'open'
      ORDER BY opened_at DESC
      LIMIT 1
      `,
      [cashDeskId]
    );

    return res.json({ ok: true, shift: rows[0] ?? null });
  } catch (err) {
    console.error("GET OPEN SHIFT ERROR:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* ====================================================================
   POST /api/cash-desk-shifts/open
==================================================================== */
router.post("/open", async (req, res) => {
  const cashDeskId = String(req.body?.cashDeskId ?? "").trim();
  const openedBy = (req.body?.openedBy ?? null) as string | null;
  const openingCash = asNumber(req.body?.openingCash, 0);

  if (!cashDeskId) {
    return res.status(400).json({ ok: false, error: "cashDeskId is required" });
  }

  if (openingCash < 0) {
    return res
      .status(400)
      .json({ ok: false, error: "openingCash must be >= 0" });
  }

  let conn: PoolConnection | null = null;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Ensure no open + writable shift exists
    const [openRows] = await conn.query<IdRow[]>(
      `
      SELECT id
      FROM cash_desk_shifts
      WHERE cash_desk_id = ?
        AND status = 'open'
        AND close_status = 'open'
      LIMIT 1
      FOR UPDATE
      `,
      [cashDeskId]
    );

    if (openRows.length > 0) {
      await conn.rollback();
      return res.status(409).json({
        ok: false,
        error: "There is already an open shift for this cash desk",
        shiftId: openRows[0].id,
      });
    }

    const shiftId = crypto.randomUUID();
    const now = new Date();
    const shiftLabel = generateShiftLabel(now);

    await conn.query<ResultSetHeader>(
      `
      INSERT INTO cash_desk_shifts (
        id,
        cash_desk_id,
        shift_label,
        opened_at,
        opening_cash,
        status,
        close_status,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, 'open', 'open', ?)
      `,
      [shiftId, cashDeskId, shiftLabel, now, openingCash, openedBy]
    );

    await conn.commit();

    return res.json({
      ok: true,
      result: "shift_opened",
      shiftId,
      shiftLabel,
      cashDeskId,
      openingCash,
      openedBy,
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("OPEN SHIFT ERROR:", err);
    return res.status(500).json({ ok: false, error: "Failed to open shift" });
  } finally {
    conn?.release();
  }
});

/* ====================================================================
   POST /api/cash-desk-shifts/:shiftId/close
   Body: { countedTotal, varianceReason?, requestedBy? }
   ✅ expectedTotal is pay_now only (shared helper)
==================================================================== */
router.post("/:shiftId/close", async (req, res) => {
  const shiftId = String(req.params.shiftId ?? "").trim();
  const countedTotal = asNumber(req.body?.countedTotal, NaN);
  const varianceReason = (req.body?.varianceReason ?? null) as string | null;
  const requestedBy = (req.body?.requestedBy ?? null) as string | null;

  if (!shiftId) {
    return res.status(400).json({ ok: false, error: "shiftId is required" });
  }

  if (!Number.isFinite(countedTotal) || countedTotal < 0) {
    return res
      .status(400)
      .json({ ok: false, error: "countedTotal must be >= 0" });
  }

  let conn: PoolConnection | null = null;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [shiftRows] = await conn.query<ShiftRow[]>(
      `
      SELECT *
      FROM cash_desk_shifts
      WHERE id = ?
      FOR UPDATE
      `,
      [shiftId]
    );

    const shift = shiftRows[0];
    if (!shift) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: "Shift not found" });
    }

    if (shift.status !== "open") {
      await conn.rollback();
      return res.status(409).json({ ok: false, error: "Shift is not open" });
    }

    if (shift.close_status !== "open") {
      await conn.rollback();
      return res.status(409).json({
        ok: false,
        error: "Shift is locked (close requested or already closed).",
        closeStatus: shift.close_status,
      });
    }

    // ✅ Shared expected total logic (pay_now only)
    const expectedTotal = await getPayNowSalesTotal(conn, shiftId);

    const variance = Number((countedTotal - expectedTotal).toFixed(2));
    const balanced = Math.abs(variance) < 0.005;
    const now = new Date();

    await conn.query<ResultSetHeader>(
      `
      UPDATE cash_desk_shifts
      SET
        closing_cash_counted = ?,
        expected_total = ?,
        variance_amount = ?,
        variance_reason = ?,
        close_status = ?,
        closed_at = ?,
        closed_by = ?
      WHERE id = ?
      `,
      [
        countedTotal,
        expectedTotal,
        variance,
        balanced ? null : varianceReason,
        balanced ? "closed_balanced" : "pending_approval",
        now,
        requestedBy,
        shiftId,
      ]
    );

    if (balanced) {
      await conn.query<ResultSetHeader>(
        `
        UPDATE cash_desk_shifts
        SET status = 'closed'
        WHERE id = ?
        `,
        [shiftId]
      );

      await conn.commit();
      return res.json({
        ok: true,
        result: "closed_balanced",
        shiftId,
        expectedTotal,
        countedTotal,
      });
    }

    await conn.query<ResultSetHeader>(
      `
      INSERT INTO cash_desk_shift_closings (
        id,
        cash_desk_shift_id,
        expected_total,
        counted_total,
        variance_amount,
        variance_reason,
        status,
        requested_by,
        requested_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'pending_review', ?, ?)
      `,
      [
        crypto.randomUUID(),
        shiftId,
        expectedTotal,
        countedTotal,
        variance,
        varianceReason,
        requestedBy,
        now,
      ]
    );

    await conn.commit();
    return res.json({
      ok: true,
      result: "pending_approval",
      shiftId,
      expectedTotal,
      countedTotal,
      variance,
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("CLOSE SHIFT ERROR:", err);
    return res.status(500).json({ ok: false, error: "Failed to close shift" });
  } finally {
    conn?.release();
  }
});

export default router;

