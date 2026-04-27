// server/src/routes/cashDeskShiftClosings.mvp.ts

import { Router } from "express";
import { pool } from "../db.js";

// ✅ Correct paths based on your project tree
import { requireAuthDev } from "../mvp/authDev.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

/**
 * GET /api/cash-desk-shift-closings?status=pending_review|approved_close|rejected
 *
 * Roles allowed:
 * - admin
 * - manager
 * - assistant_manager
 * - accounting
 * - auditor
 */
router.get(
  "/",
  requireAuthDev,
  requireRole([
    "admin",
    "manager",
    "assistant_manager",
    "accounting",
    "auditor",
  ]),
  async (req, res) => {
    try {
      const status = String(req.query.status ?? "pending_review");

      const allowed = new Set([
        "pending_review",
        "approved_close",
        "rejected",
      ]);

      if (!allowed.has(status)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid status",
        });
      }

      const [rows] = await pool.query(
        `
        SELECT
          cdc.id,
          cdc.cash_desk_shift_id,
          cdc.expected_total,
          cdc.counted_total,
          cdc.variance_amount,
          cdc.variance_reason,
          cdc.status,
          cdc.requested_by,
          cdc.requested_at,
          cdc.manager_approved_by,
          cdc.manager_approved_at,
          cdc.accounting_approved_by,
          cdc.accounting_approved_at
        FROM cash_desk_closings cdc
        WHERE cdc.status = ?
        ORDER BY cdc.requested_at DESC
        `,
        [status]
      );

      res.json({
        ok: true,
        rows,
      });
    } catch (err) {
      console.error("Cash desk closings error:", err);
      res.status(500).json({
        ok: false,
        error: "Failed to load cash desk closings",
      });
    }
  }
);

export default router;
