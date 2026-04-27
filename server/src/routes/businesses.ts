import { Router } from "express";
import { pool } from "../db.js";
import { randomUUID } from "node:crypto";

type Industry = "hotel" | "restaurant" | "mixed" | "other";
type Status = "active" | "inactive";

const router = Router();

/**
 * GET /api/businesses
 * Returns all businesses (latest first)
 */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, industry, timezone, status, created_at, updated_at
       FROM businesses
       ORDER BY created_at DESC`
    );

    res.json({ ok: true, rows });
  } catch (err) {
    console.error("GET /api/businesses error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch businesses" });
  }
});

/**
 * POST /api/businesses
 * Body: { name, industry?, timezone?, status? }
 */
router.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const industry = (req.body?.industry ?? "other") as Industry;
    const timezone = String(req.body?.timezone ?? "Africa/Accra").trim();
    const status = (req.body?.status ?? "active") as Status;

    // Basic validation
    if (!name) {
      return res.status(400).json({ ok: false, error: "Name is required" });
    }

    const allowedIndustry: Industry[] = ["hotel", "restaurant", "mixed", "other"];
    if (!allowedIndustry.includes(industry)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid industry. Use one of: ${allowedIndustry.join(", ")}`,
      });
    }

    const allowedStatus: Status[] = ["active", "inactive"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid status. Use one of: ${allowedStatus.join(", ")}`,
      });
    }

    const id = randomUUID();

    await pool.query(
      `INSERT INTO businesses (id, name, industry, timezone, status)
       VALUES (?, ?, ?, ?, ?)`,
      [id, name, industry, timezone, status]
    );

    // Return the created row
    const [rows] = await pool.query(
      `SELECT id, name, industry, timezone, status, created_at, updated_at
       FROM businesses
       WHERE id = ?`,
      [id]
    );

    // rows is an array; the new item is rows[0]
    res.status(201).json({ ok: true, row: (rows as any[])[0] });
  } catch (err: any) {
    console.error("POST /api/businesses error:", err);
    res.status(500).json({ ok: false, error: "Failed to create business" });
  }
});

export default router;

