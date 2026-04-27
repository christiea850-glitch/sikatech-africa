// src/server.ts (or src/index.ts)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { pool } from "./db";

// Core routes
import authRouter from "./routes/auth";
import businessesRouter from "./routes/businesses";
import shiftsRouter from "./routes/shift";
import shiftClosingRouter from "./routes/shiftClosing";

// MVP / debug routes
import debugRouter from "./routes/debug.mvp";

// MVP routes
import shiftsMvp from "./routes/shifts.mvp";
import transactionsMvp from "./routes/transactions.mvp";
import reconcileMvp from "./routes/reconcile.mvp";

// Cash Desk / Sales / Reports (MVP)
import cashDeskShiftsMvp from "./routes/cashDeskShifts.mvp";
import cashDeskShiftClosingsMvp from "./routes/cashDeskShiftClosings.mvp";
import salesMvp from "./routes/sales.mvp";
import reportsMvp from "./routes/reports.mvp";
import paymentMethodsMvp from "./routes/paymentMethods.mvp";

dotenv.config();

const app = express();

/* -----------------------------
   Middleware
------------------------------ */

// ✅ If you later use login cookies/sessions, this is the right CORS shape.
// For now it still works fine for local dev.
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

/* -----------------------------
   Health + DB
------------------------------ */

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/db-check", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, rows });
  } catch (error) {
    console.error("DB ERROR:", error);
    res.status(500).json({ ok: false, error: "Database connection failed" });
  }
});

/* -----------------------------
   Core Routes
------------------------------ */

app.use("/api/auth", authRouter);
app.use("/api/businesses", businessesRouter);
app.use("/api/shifts", shiftsRouter);
app.use("/api/shift-closing", shiftClosingRouter);

/* -----------------------------
   MVP Routes
------------------------------ */

// debug
app.use("/api/mvp/debug", debugRouter);

// shifts / transactions / reconcile
app.use("/api/mvp/shifts", shiftsMvp);
app.use("/api/mvp/transactions", transactionsMvp);
app.use("/api/mvp/reconcile", reconcileMvp);

// cash desk shifts + closings + sales + reports + payment methods
// ✅ kept under /api/mvp so your frontend calls match cleanly
app.use("/api/mvp/cash-desk-shifts", cashDeskShiftsMvp);
app.use("/api/mvp/cash-desk-shift-closings", cashDeskShiftClosingsMvp);
app.use("/api/mvp/sales", salesMvp);
app.use("/api/mvp/reports", reportsMvp);
app.use("/api/mvp/payment-methods", paymentMethodsMvp);

/* -----------------------------
   404 + Error Handler
------------------------------ */

app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

// ✅ catches thrown errors from routes/middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("UNHANDLED ERROR:", err);
  res.status(500).json({ ok: false, error: "Server error" });
});

const PORT = Number(process.env.PORT || 4000);

app.listen(PORT, () => {
  console.log(`✅ SikaTech Africa API running on http://localhost:${PORT}`);
});
