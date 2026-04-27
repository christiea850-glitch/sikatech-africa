// server/src/routes/reconcile.mvp.ts
import { Router, type Request, type Response } from "express";
import * as StoreModule from "../mvp/store.js";

const router = Router();

/**
 * Grab the actual store object no matter how you exported it.
 * Supports:
 *  - export const store = ...
 *  - export const mvpStore = ...
 *  - export default ...
 */
const mvpStore: any =
  (StoreModule as any).default ??
  (StoreModule as any).store ??
  (StoreModule as any).mvpStore ??
  StoreModule;

const PRIV_ROLES = new Set([
  "admin",
  "manager",
  "assistant_manager",
  "accounting",
  "auditor",
  "front_desk",
]);

function getRole(req: Request) {
  return String(req.headers["x-role"] ?? "").toLowerCase();
}

function requirePriv(req: Request, res: Response) {
  const role = getRole(req);
  if (!PRIV_ROLES.has(role)) {
    res.status(403).json({ ok: false, error: "Not authorized" });
    return false;
  }
  return true;
}

function getAllTransactions(): any[] {
  // Most common shapes
  return (
    mvpStore?.transactions ||
    mvpStore?.txns ||
    mvpStore?.data?.transactions ||
    mvpStore?.mvp?.transactions ||
    []
  );
}

function saveAllTransactions(next: any[]) {
  if (Array.isArray(mvpStore?.transactions)) {
    mvpStore.transactions = next;
    return;
  }
  if (mvpStore?.data && Array.isArray(mvpStore.data.transactions)) {
    mvpStore.data.transactions = next;
    return;
  }
  if (mvpStore?.mvp && Array.isArray(mvpStore.mvp.transactions)) {
    mvpStore.mvp.transactions = next;
    return;
  }
  // fallback
  mvpStore.transactions = next;
}

/**
 * GET /api/reconcile/shift-summary?shiftId=...
 * Returns totals by department only (no item-level details).
 */
router.get("/shift-summary", (req: Request, res: Response) => {
  if (!requirePriv(req, res)) return;

  const shiftId = String(req.query.shiftId ?? "").trim();
  if (!shiftId) {
    res.status(400).json({ ok: false, error: "shiftId is required" });
    return;
  }

  const txs = getAllTransactions().filter((t: any) => {
    if (!t) return false;
    if (String(t.shiftId ?? "") !== shiftId) return false;
    if (String(t.status ?? "").toUpperCase() === "VOID") return false;
    return true;
  });

  const byDept = new Map<
    string,
    { deptKey: string; count: number; total: number; payNowTotal: number; postedToRoomTotal: number }
  >();

  for (const t of txs) {
    const deptKey = String(t.sourceDept ?? t.departmentKey ?? "unknown");
    const total = Number(t.total ?? 0) || 0;
    const status = String(t.status ?? "").toUpperCase();

    const row =
      byDept.get(deptKey) ??
      { deptKey, count: 0, total: 0, payNowTotal: 0, postedToRoomTotal: 0 };

    row.count += 1;
    row.total += total;

    if (status === "POSTED_TO_ROOM") row.postedToRoomTotal += total;
    else row.payNowTotal += total;

    byDept.set(deptKey, row);
  }

  res.json({ ok: true, shiftId, summary: Array.from(byDept.values()) });
});

/**
 * GET /api/reconcile/room-folio?shiftId=...&roomNo=...
 * Totals by dept for POSTED_TO_ROOM charges for that room.
 */
router.get("/room-folio", (req: Request, res: Response) => {
  if (!requirePriv(req, res)) return;

  const shiftId = String(req.query.shiftId ?? "").trim();
  const roomNo = String(req.query.roomNo ?? "").trim();

  if (!shiftId || !roomNo) {
    res.status(400).json({ ok: false, error: "shiftId and roomNo are required" });
    return;
  }

  const txs = getAllTransactions().filter((t: any) => {
    if (!t) return false;
    if (String(t.shiftId ?? "") !== shiftId) return false;
    if (String(t.roomNo ?? "").trim() !== roomNo) return false;
    if (String(t.status ?? "").toUpperCase() !== "POSTED_TO_ROOM") return false;
    return true;
  });

  const byDept = new Map<string, { deptKey: string; count: number; total: number }>();
  let totalDue = 0;

  for (const t of txs) {
    const deptKey = String(t.sourceDept ?? t.departmentKey ?? "unknown");
    const total = Number(t.total ?? 0) || 0;

    totalDue += total;

    const row = byDept.get(deptKey) ?? { deptKey, count: 0, total: 0 };
    row.count += 1;
    row.total += total;

    byDept.set(deptKey, row);
  }

  res.json({ ok: true, shiftId, roomNo, charges: Array.from(byDept.values()), totalDue });
});

/**
 * POST /api/reconcile/room-settle
 * body: { shiftId, roomNo, paymentMethod }
 * Marks room POSTED_TO_ROOM items as PAID.
 */
router.post("/room-settle", (req: Request, res: Response) => {
  if (!requirePriv(req, res)) return;

  const shiftId = String(req.body?.shiftId ?? "").trim();
  const roomNo = String(req.body?.roomNo ?? "").trim();
  const paymentMethod = String(req.body?.paymentMethod ?? "").trim();

  if (!shiftId || !roomNo || !paymentMethod) {
    res.status(400).json({ ok: false, error: "shiftId, roomNo, paymentMethod are required" });
    return;
  }

  const all = getAllTransactions();
  let settledCount = 0;
  let settledTotal = 0;

  const next = all.map((t: any) => {
    if (!t) return t;

    const isTarget =
      String(t.shiftId ?? "") === shiftId &&
      String(t.roomNo ?? "").trim() === roomNo &&
      String(t.status ?? "").toUpperCase() === "POSTED_TO_ROOM";

    if (!isTarget) return t;

    const total = Number(t.total ?? 0) || 0;
    settledCount += 1;
    settledTotal += total;

    return {
      ...t,
      status: "PAID",
      settledAt: Date.now(),
      settledPaymentMethod: paymentMethod,
    };
  });

  saveAllTransactions(next);

  res.json({ ok: true, settledCount, settledTotal });
});

export default router;
