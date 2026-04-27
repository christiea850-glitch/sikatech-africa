import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";

type PaymentMethod = "cash" | "momo" | "card" | "bank_transfer" | "credit" | "other";

type ExpenseRecord = {
  id: string;
  createdAt: string;

  category: string; // e.g. Utilities, Supplies, Payroll
  description: string;
  amount: number;

  paymentMethod: PaymentMethod;
  vendor?: string;
  reference?: string;

  staffLabel: string;
};

const LS_KEY = "sikatech_accounting_expenses_v1";

function uid() {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

function money(n: number) {
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function loadExpenses(): ExpenseRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExpenseRecord[]) : [];
  } catch {
    return [];
  }
}

function saveExpenses(list: ExpenseRecord[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export default function AccountingExpensesPage() {
  const { user } = useAuth();

  const staffLabel = useMemo(() => {
    return (
      (user as any)?.staffId ||
      (user as any)?.employeeId ||
      (user as any)?.email ||
      (user as any)?.username ||
      user?.role ||
      "staff"
    );
  }, [user]);

  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [vendor, setVendor] = useState("");
  const [reference, setReference] = useState("");

  const [records, setRecords] = useState<ExpenseRecord[]>(() => loadExpenses());

  useEffect(() => {
    saveExpenses(records);
  }, [records]);

  const canSave =
    category.trim().length > 0 &&
    description.trim().length > 0 &&
    Number.isFinite(amount) &&
    amount > 0;

  function reset() {
    setCategory("");
    setDescription("");
    setAmount(0);
    setPaymentMethod("cash");
    setVendor("");
    setReference("");
  }

  function onSave() {
    if (!canSave) return;

    const next: ExpenseRecord = {
      id: uid(),
      createdAt: new Date().toISOString(),
      category: category.trim(),
      description: description.trim(),
      amount: Number(amount),
      paymentMethod,
      vendor: vendor.trim() || undefined,
      reference: reference.trim() || undefined,
      staffLabel: String(staffLabel),
    };

    setRecords((prev) => [next, ...prev]);
    reset();
  }

  function deleteRow(id: string) {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  function clearAll() {
    if (!confirm("Clear ALL expense records? This cannot be undone.")) return;
    setRecords([]);
  }

  return (
    <div style={{ padding: 22 }}>
      <h1 style={{ fontSize: 34, margin: 0 }}>Accounting — Expense Log</h1>
      <p style={{ opacity: 0.8, marginTop: 6 }}>
        Record expenses/cash movements. Sales should be recorded by departments.
      </p>

      <div style={{ ...card, marginTop: 16 }}>
        <h2 style={{ margin: 0, fontSize: 24 }}>Record New Expense</h2>

        <div style={{ marginTop: 12 }}>
          <label style={label}>Category</label>
          <input
            style={input}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g., Utilities, Supplies, Payroll"
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={label}>Description</label>
          <input
            style={input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was this expense for?"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
          <div>
            <label style={label}>Amount</label>
            <input
              style={input}
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>

          <div>
            <label style={label}>Payment Method</label>
            <select
              style={input}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              <option value="cash">Cash</option>
              <option value="momo">Mobile Money</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="credit">Credit</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
          <div>
            <label style={label}>Vendor (optional)</label>
            <input style={input} value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div>
            <label style={label}>Reference (optional)</label>
            <input style={input} value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={label}>Staff (auto)</label>
          <input style={{ ...input, background: "rgba(255,255,255,0.65)" }} readOnly value={staffLabel} />
        </div>

        <button
          style={{ ...btn, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}
          disabled={!canSave}
          onClick={onSave}
        >
          Save Expense
        </button>
      </div>

      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>Expense Log</h2>
          <button style={btnOutline} onClick={clearAll}>Clear All</button>
        </div>

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>No.</th>
                <th style={th}>Date/Time</th>
                <th style={th}>Category</th>
                <th style={th}>Description</th>
                <th style={th}>Amount</th>
                <th style={th}>Payment</th>
                <th style={th}>Vendor</th>
                <th style={th}>Reference</th>
                <th style={th}>Staff</th>
                <th style={th}>Action</th>
              </tr>
            </thead>

            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td style={td} colSpan={10}>
                    <div style={{ opacity: 0.7 }}>No expenses recorded yet.</div>
                  </td>
                </tr>
              ) : (
                records.map((r, idx) => (
                  <tr key={r.id}>
                    <td style={td}>{idx + 1}</td>
                    <td style={td}>{new Date(r.createdAt).toLocaleString()}</td>
                    <td style={td}>{r.category}</td>
                    <td style={td}>{r.description}</td>
                    <td style={td}><b>${money(r.amount)}</b></td>
                    <td style={td}>{r.paymentMethod.replace(/_/g, " ")}</td>
                    <td style={td}>{r.vendor ?? "—"}</td>
                    <td style={td}>{r.reference ?? "—"}</td>
                    <td style={td}>{r.staffLabel}</td>
                    <td style={td}>
                      <button style={btnDangerMini} onClick={() => deleteRow(r.id)}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.75)",
  borderRadius: 16,
  padding: 16,
  border: "1px solid rgba(0,0,0,0.10)",
};

const label: React.CSSProperties = { display: "block", fontWeight: 900, fontSize: 13 };

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  marginTop: 6,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.18)",
  outline: "none",
};

const btn: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 14px",
  borderRadius: 12,
  border: "none",
  background: "#0b2a3a",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
  width: "100%",
};

const btnOutline: React.CSSProperties = {
  border: "1px solid rgba(11,42,58,0.25)",
  cursor: "pointer",
  padding: "10px 12px",
  borderRadius: 12,
  background: "white",
  fontWeight: 900,
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 980,
  overflow: "hidden",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  background: "rgba(209,162,27,0.25)",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontWeight: 900,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 13,
  background: "rgba(255,255,255,0.72)",
  whiteSpace: "nowrap",
};

const btnDangerMini: React.CSSProperties = {
  border: "none",
  cursor: "pointer",
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(180,38,38,0.92)",
  color: "white",
  fontWeight: 900,
};
