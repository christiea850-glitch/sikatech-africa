import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

/* -------------------------------------------------------
   Helpers
-------------------------------------------------------- */

function norm(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

/* -------------------------------------------------------
   GET /api/shifts
   ?departmentKey=bar
-------------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const departmentKey = norm(req.query.departmentKey);

    let sql = `
      SELECT *
      FROM shifts
    `;
    const params: any[] = [];

    if (departmentKey) {
      sql += ` WHERE LOWER(department_key) = ? `;
      params.push(departmentKey);
    }

    sql += ` ORDER BY opened_at DESC `;

    const [rows] = await pool.query(sql, params);

    const shifts = (rows as any[]).map((s) => ({
      ...s,
      status: norm(s.status),
    }));

    res.json({ shifts });
  } catch (err) {
    console.error("GET /api/shifts error:", err);
    res.status(500).json({ ok: false, error: "Failed to load shifts" });
  }
});

/* -------------------------------------------------------
   POST /api/shifts/open
   body: { departmentKey }
-------------------------------------------------------- */
router.post("/open", async (req, res) => {
  try {
    const departmentKey = norm(req.body.departmentKey);
    const employeeId = req.headers["x-employee-id"];
    const role = req.headers["x-role"];

    if (!departmentKey) {
      return res.status(400).json({ ok: false, error: "departmentKey required" });
    }

    /* ---- check if an open shift already exists ---- */
    const [existing] = await pool.query(
      `
      SELECT *
      FROM shifts
      WHERE LOWER(department_key) = ?
        AND LOWER(status) = 'open'
      LIMIT 1
      `,
      [departmentKey]
    );

    if ((existing as any[]).length > 0) {
      return res.json({
        ok: true,
        existing: true,
        shift: {
          ...(existing as any[])[0],
          status: "open",
        },
      });
    }

    /* ---- create new shift ---- */
    const shiftId = crypto.randomUUID();
    const now = Date.now();

    await pool.query(
      `
      INSERT INTO shifts
        (id, department_key, status, opened_at, opened_by_employee_id, opened_by_role)
      VALUES
        (?, ?, 'open', ?, ?, ?)
      `,
      [shiftId, departmentKey, now, employeeId ?? null, role ?? null]
    );

    const shift = {
      id: shiftId,
      departmentKey,
      status: "open",
      openedAt: now,
      openedBy: { employeeId, role },
    };

    res.json({ ok: true, shift });
  } catch (err) {
    console.error("POST /api/shifts/open error:", err);
    res.status(500).json({ ok: false, error: "Failed to open shift" });
  }
});

/* -------------------------------------------------------
   POST /api/shifts/:shiftId/submit-closing
-------------------------------------------------------- */
router.post("/:shiftId/submit-closing", async (req, res) => {
  try {
    const shiftId = req.params.shiftId;

    await pool.query(
      `
      UPDATE shifts
      SET status = 'closing_submitted'
      WHERE id = ?
      `,
      [shiftId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("submit-closing error:", err);
    res.status(500).json({ ok: false, error: "Failed to submit closing" });
  }
});

/* -------------------------------------------------------
   POST /api/shifts/:shiftId/accounting-review
-------------------------------------------------------- */
router.post("/:shiftId/accounting-review", async (req, res) => {
  try {
    const shiftId = req.params.shiftId;
    const note = req.body?.note ?? null;

    await pool.query(
      `
      UPDATE shifts
      SET status = 'accounting_reviewed',
          accounting_note = ?
      WHERE id = ?
      `,
      [note, shiftId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("accounting-review error:", err);
    res.status(500).json({ ok: false, error: "Failed accounting review" });
  }
});

/* -------------------------------------------------------
   POST /api/shifts/:shiftId/approve-close
-------------------------------------------------------- */
router.post("/:shiftId/approve-close", async (req, res) => {
  try {
    const shiftId = req.params.shiftId;

    await pool.query(
      `
      UPDATE shifts
      SET status = 'closed'
      WHERE id = ?
      `,
      [shiftId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("approve-close error:", err);
    res.status(500).json({ ok: false, error: "Failed to close shift" });
  }
});

export default router;
