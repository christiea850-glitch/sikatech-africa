// server/src/middleware/requireOpenShifts.ts
import type { Request, Response, NextFunction } from "express";
import type { Pool } from "mysql2/promise";

export function requireOpenShift(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cashDeskId = String((req.params as any)?.cashDeskId ?? "").trim();

      if (!cashDeskId) {
        return res.status(400).json({ ok: false, error: "cashDeskId is required" });
      }

      // ✅ IMPORTANT: require shift.status='open' AND close_status='open'
      const [rows] = await pool.query<any[]>(
        `
        SELECT id, status, close_status
        FROM cash_desk_shifts
        WHERE cash_desk_id = ?
          AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1
        `,
        [cashDeskId]
      );

      const shift = rows?.[0];

      // No open shift at all
      if (!shift?.id) {
        return res.status(409).json({
          ok: false,
          code: "NO_OPEN_SHIFT",
          error: "No open shift for this cash desk. Open a shift first.",
        });
      }

      // Open shift exists but is locked (pending approval or any closed status)
      if (shift.close_status !== "open") {
        return res.status(409).json({
          ok: false,
          code: "SHIFT_LOCKED",
          error:
            "Shift is locked (close requested or already closed). Approval must be completed before new sales.",
          shiftId: shift.id,
          closeStatus: shift.close_status,
        });
      }

      // Attach for downstream usage
      (req as any).openShiftId = shift.id;
      next();
    } catch (err) {
      console.error("requireOpenShift error:", err);
      return res.status(500).json({ ok: false, error: "Server error" });
    }
  };
}
