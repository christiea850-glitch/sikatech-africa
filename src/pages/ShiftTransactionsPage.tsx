// src/pages/ShiftTransactionsPage.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createTransaction,
  listShiftTransactions,
  type LineItem,
  type Transaction,
} from "../api/mvpClient";
import { useAuth } from "../auth/AuthContext";
import { toAuthedUser } from "../api/toAuthedUser";

function money(n: number) {
  return n.toFixed(2);
}
function getErr(e: unknown, fallback: string) {
  return e instanceof Error ? e.message || fallback : fallback;
}

export default function ShiftTransactionsPage() {
  const { shiftId } = useParams<{ shiftId: string }>();
  const { user } = useAuth();
  const authed = useMemo(() => toAuthedUser(user), [user]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [itemName, setItemName] = useState("Water");
  const [qty, setQty] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(3);

  const canFetch = Boolean(authed && shiftId);

  const totalSales = useMemo(
    () => transactions.reduce((sum, t) => sum + (t.status === "VOID" ? 0 : t.total), 0),
    [transactions]
  );

  const refresh = useCallback(async () => {
    if (!authed || !shiftId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await listShiftTransactions(authed, shiftId);
      setTransactions(res.transactions);
    } catch (e) {
      setError(getErr(e, "Failed to load transactions"));
    } finally {
      setLoading(false);
    }
  }, [authed, shiftId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAddTxn = useCallback(async () => {
    if (!authed || !shiftId) return;

    const name = itemName.trim();
    if (!name) {
      setError("Please enter an item name.");
      return;
    }

    const cleanQty = Math.max(1, Number.isFinite(qty) ? qty : 1);
    const cleanUnit = Math.max(0, Number.isFinite(unitPrice) ? unitPrice : 0);

    const items: LineItem[] = [
      {
        id: crypto.randomUUID(),
        name,
        qty: cleanQty,
        unitPrice: cleanUnit,
        discount: 0,
      },
    ];

    setError(null);
    setLoading(true);
    try {
      await createTransaction(authed, { shiftId, status: "PAID", items });
      await refresh();
    } catch (e) {
      setError(getErr(e, "Failed to create transaction"));
    } finally {
      setLoading(false);
    }
  }, [authed, shiftId, itemName, qty, unitPrice, refresh]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ marginTop: 0 }}>Transactions</h2>
        <Link to="/app/shifts">← Back to Shifts</Link>
      </div>

      <div style={{ marginBottom: 10 }}>
        <strong>Shift:</strong> {shiftId || "(missing shift id)"}
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #f00" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={refresh} disabled={loading || !canFetch}>
          Refresh
        </button>

        <div style={{ padding: 10, border: "1px solid #ddd" }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Total sales (non-void)</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>${money(totalSales)}</div>
        </div>
      </div>

      <div style={{ padding: 12, border: "1px solid #ccc", marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Add Quick Transaction</h3>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input value={itemName} onChange={(e) => setItemName(e.target.value)} />
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            style={{ width: 90 }}
            min={1}
          />
          <input
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(Number(e.target.value))}
            style={{ width: 120 }}
            min={0}
            step={0.01}
          />
          <button onClick={onAddTxn} disabled={loading || !canFetch}>
            Add
          </button>
        </div>

        {!canFetch && (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
            Log in and open a shift first.
          </div>
        )}
      </div>

      <h3 style={{ marginTop: 0 }}>Recent Transactions</h3>

      {loading && transactions.length === 0 ? (
        <div>Loading...</div>
      ) : transactions.length === 0 ? (
        <div>No transactions yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {transactions.map((t) => (
            <div key={t.id} style={{ padding: 12, border: "1px solid #ddd" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <strong>{t.status}</strong> • ${money(t.total)}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {new Date(t.createdAt).toLocaleString()}
                </div>
              </div>

              <div style={{ fontSize: 13, marginTop: 6 }}>
                {t.items.map((it) => (
                  <div key={it.id}>
                    {it.qty} × {it.name} @ ${money(it.unitPrice)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
