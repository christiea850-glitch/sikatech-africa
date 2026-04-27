import { Router } from "express";
import { pool } from "../db";

const router = Router();

/**
 * GET /api/payment-methods
 * Returns all payment methods
 */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT id, name, kind
      FROM payment_methods
      ORDER BY name
      `
    );

    res.json({
      ok: true,
      rows,
    });
  } catch (error) {
    console.error("PAYMENT METHODS ERROR:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to load payment methods",
    });
  }
});

export default router;
