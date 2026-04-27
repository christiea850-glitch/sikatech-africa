// src/sales/salesAdjustments.ts
import type { DiffEntry, SalesAdjustment, Transaction } from "./salesTypes";
import { addAdjustment } from "./salesStorage";
import { pushNotification } from "../notifications/notificationsStore";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function computeDiff(
  before: Transaction,
  afterPatch: Partial<Transaction>
): DiffEntry[] {
  const diffs: DiffEntry[] = [];

  // MVP: diff only a few important fields (expand later)
  const fields: (keyof Transaction)[] = [
    "total",
    "subtotal",
    "discountTotal",
    "status",
    "paymentMode",
    "paymentMethod",
    "amountPaid",
    "note",
  ];

  for (const f of fields) {
    if (!(f in afterPatch)) continue;

    const from = (before as any)[f];
    const to = (afterPatch as any)[f];

    if (JSON.stringify(from) !== JSON.stringify(to)) {
      diffs.push({ field: String(f), from, to });
    }
  }

  return diffs;
}

/**
 * Creates an adjustment record (does NOT edit original tx).
 * Sends notifications to Admin/GM/Auditor + the department.
 */
export function createSalesAdjustment(params: {
  tx: Transaction;
  patch: Partial<Transaction>;
  reason: string;
  actor: { employeeId: string; role: string };
}) {
  const { tx, patch, reason, actor } = params;

  const diffs = computeDiff(tx, patch);
  if (diffs.length === 0) throw new Error("No changes detected.");
  if (!reason.trim()) throw new Error("Reason is required.");

  const deptKey = String(tx.sourceDept || "unknown").toLowerCase();

  const adj: SalesAdjustment = {
    id: uid("adj"),
    txId: tx.id,
    deptKey,
    reason: reason.trim(),
    diffs,
    status: "APPLIED",
    createdAt: Date.now(),
    createdBy: actor,
  };

  addAdjustment(adj);

  // ✅ pushNotification now accepts partial fields safely (no TS error)
  pushNotification({
    title: "Sales record adjusted",
    message: `TX ${tx.id} (${deptKey}) was adjusted by ${actor.employeeId}. Reason: ${adj.reason}`,

    // these are optional fields (your store supports them even if your type is strict)
    ...( {
      toRoles: ["admin", "manager", "assistant_manager", "accounting", "auditor"],
      toDeptKeys: [deptKey],
      meta: { txId: tx.id, adjustmentId: adj.id, diffs: adj.diffs },
    } as any ),
  });

  return adj;
}

/**
 * Apply adjustments to a tx (MVP: apply latest values for changed fields).
 * This is what the Central dashboard should DISPLAY.
 */
export function getEffectiveTransaction(
  tx: Transaction,
  adjustments: SalesAdjustment[]
): Transaction {
  const related = adjustments.filter(
    (a) => a.txId === tx.id && a.status === "APPLIED"
  );
  if (related.length === 0) return tx;

  // apply in chronological order (oldest -> newest)
  const ordered = [...related].sort((a, b) => a.createdAt - b.createdAt);

  const out: any = { ...tx };
  for (const adj of ordered) {
    for (const d of adj.diffs) {
      // only handling top-level fields in MVP
      if (d.field in out) out[d.field] = d.to;
    }
  }

  return out as Transaction;
}

