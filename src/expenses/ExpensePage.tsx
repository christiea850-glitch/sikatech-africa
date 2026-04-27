// src/expenses/ExpensePage.tsx

import React, { useState } from "react";
import { useExpenses } from "./ExpenseContext";
import type { ExpenseCategory } from "./ExpenseContext";
import { useDepartments } from "../departments/DepartmentsContext";
import { useAuth } from "../auth/AuthContext";

const categories: { value: ExpenseCategory; label: string }[] = [
  { value: "inventory", label: "Inventory" },
  { value: "supplies", label: "Supplies" },
  { value: "repairs", label: "Repairs" },
  { value: "utilities", label: "Utilities" },
  { value: "transport", label: "Transport" },
  { value: "staff_welfare", label: "Staff Welfare" },
  { value: "maintenance", label: "Maintenance" },
  { value: "miscellaneous", label: "Miscellaneous" },
];

function formatDeptLabel(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "Unknown";

  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCategoryLabel(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "Miscellaneous";

  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ExpensePage() {
  const { addExpense, records } = useExpenses();
  const { departments = [] } = useDepartments();
  const { user } = useAuth();

  const [deptKey, setDeptKey] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("inventory");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  function reset() {
    setDescription("");
    setAmount("");
    setNote("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const numAmount = Number(amount);

    if (!deptKey) {
      setMsg("Please select a department.");
      return;
    }

    if (!description.trim()) {
      setMsg("Please enter expense description.");
      return;
    }

    if (!numAmount || numAmount <= 0) {
      setMsg("Enter a valid expense amount.");
      return;
    }

    addExpense({
      deptKey,
      category,
      description: description.trim(),
      amount: numAmount,
      note: note.trim() || undefined,
      enteredBy: user?.employeeId || "unknown",
      enteredByName: ((user as any)?.name || (user as any)?.fullName || "").trim() || undefined,
    });

    setMsg("Expense recorded successfully.");
    reset();
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Department Expense Entry</h1>

      <form style={styles.form} onSubmit={handleSubmit}>
        <div style={styles.field}>
          <label style={styles.label}>Department</label>
          <select
            value={deptKey}
            onChange={(e) => setDeptKey(e.target.value)}
            style={styles.input}
          >
            <option value="">Select department</option>
            {departments.map((d: any) => (
              <option key={d.id || d.name} value={String(d.id || d.name).toLowerCase()}>
                {d.name || d.id}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Expense Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            style={styles.input}
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Description</label>
          <input
            type="text"
            placeholder="Example: Beer restock"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Amount</label>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Note (optional)</label>
          <textarea
            placeholder="Additional information..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={styles.textarea}
          />
        </div>

        <button type="submit" style={styles.button}>
          Record Expense
        </button>

        {msg ? <div style={styles.msg}>{msg}</div> : null}
      </form>

      <div style={styles.section}>
        <h2 style={styles.subtitle}>Recent Expenses</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Dept</th>
                <th style={styles.th}>Category</th>
                <th style={styles.th}>Description</th>
                <th style={styles.thRight}>Amount</th>
              </tr>
            </thead>

            <tbody>
              {records.slice(0, 10).map((r) => (
                <tr key={r.id}>
                  <td style={styles.td}>{new Date(r.createdAt).toLocaleString()}</td>
                  <td style={styles.td}>{formatDeptLabel(r.deptKey)}</td>
                  <td style={styles.td}>{formatCategoryLabel(r.category)}</td>
                  <td style={styles.td}>{r.description}</td>
                  <td style={styles.tdRight}>{r.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    background: "#f6f8fb",
    minHeight: "100vh",
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 20,
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 10,
    color: "#0f172a",
  },
  form: {
    background: "#fff",
    padding: 20,
    borderRadius: 12,
    border: "1px solid #e5eaf3",
    marginBottom: 30,
    maxWidth: 600,
  },
  field: {
    marginBottom: 14,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontWeight: 600,
    color: "#334155",
  },
  input: {
    height: 40,
    borderRadius: 8,
    border: "1px solid #dbe3ef",
    padding: "0 10px",
    background: "#fff",
  },
  textarea: {
    minHeight: 80,
    borderRadius: 8,
    border: "1px solid #dbe3ef",
    padding: 10,
    background: "#fff",
  },
  button: {
    height: 42,
    borderRadius: 8,
    border: "none",
    background: "#0f172a",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    padding: "0 14px",
  },
  msg: {
    marginTop: 10,
    color: "#16a34a",
    fontWeight: 600,
  },
  section: {
    background: "#fff",
    padding: 20,
    borderRadius: 12,
    border: "1px solid #e5eaf3",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "12px 10px",
    borderBottom: "1px solid #e5eaf3",
    color: "#475569",
    fontSize: 13,
  },
  thRight: {
    textAlign: "right",
    padding: "12px 10px",
    borderBottom: "1px solid #e5eaf3",
    color: "#475569",
    fontSize: 13,
  },
  td: {
    textAlign: "left",
    padding: "12px 10px",
    borderBottom: "1px solid #f1f5f9",
    color: "#0f172a",
    fontSize: 14,
  },
  tdRight: {
    textAlign: "right",
    padding: "12px 10px",
    borderBottom: "1px solid #f1f5f9",
    color: "#0f172a",
    fontSize: 14,
  },
};