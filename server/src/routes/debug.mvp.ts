import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/db", async (_req, res) => {
  try {
    const [rows] = await pool.query<any[]>(
      "SELECT DATABASE() AS db, @@hostname AS host, @@port AS port"
    );
    res.json({ ok: true, dbInfo: rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "DB error" });
  }
});

export default router;
