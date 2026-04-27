// src/expenses/ExpenseContext.tsx

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ExpenseCategory =
  | "inventory"
  | "supplies"
  | "repairs"
  | "utilities"
  | "transport"
  | "staff_welfare"
  | "maintenance"
  | "miscellaneous";

export type ExpenseRecord = {
  id: string;
  createdAt: string;

  deptKey: string;

  category: ExpenseCategory;
  description: string;
  amount: number;

  enteredBy: string;
  enteredByName?: string;

  note?: string;
};

export type AddExpenseInput = {
  deptKey: string;

  category: ExpenseCategory;
  description: string;
  amount: number;

  enteredBy: string;
  enteredByName?: string;

  note?: string;
};

type ExpenseContextType = {
  records: ExpenseRecord[];
  addExpense: (input: AddExpenseInput) => void;
  deleteExpense: (id: string) => void;
  clearAllExpenses: () => void;
};

const ExpenseContext = createContext<ExpenseContextType | undefined>(undefined);

const LS_KEY = "sikatech_expense_records_v1";

function uid() {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

function normalizeDeptKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function load(): ExpenseRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExpenseRecord[]) : [];
  } catch {
    return [];
  }
}

function save(list: ExpenseRecord[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export function ExpenseProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<ExpenseRecord[]>(() => load());

  useEffect(() => {
    save(records);
  }, [records]);

  const api = useMemo<ExpenseContextType>(() => {
    const addExpense: ExpenseContextType["addExpense"] = (input) => {
      const amount = Number(input.amount);
      const safeAmount = Math.max(0, amount);

      const next: ExpenseRecord = {
        id: uid(),
        createdAt: new Date().toISOString(),

        deptKey: normalizeDeptKey(input.deptKey),

        category: input.category,
        description: String(input.description ?? "").trim(),
        amount: safeAmount,

        enteredBy: String(input.enteredBy ?? "").trim(),
        enteredByName: input.enteredByName?.trim() || undefined,

        note: input.note?.trim() || undefined,
      };

      setRecords((prev) => [next, ...prev]);
    };

    const deleteExpense: ExpenseContextType["deleteExpense"] = (id) => {
      setRecords((prev) => prev.filter((r) => r.id !== id));
    };

    const clearAllExpenses: ExpenseContextType["clearAllExpenses"] = () => {
      setRecords([]);
    };

    return {
      records,
      addExpense,
      deleteExpense,
      clearAllExpenses,
    };
  }, [records]);

  return <ExpenseContext.Provider value={api}>{children}</ExpenseContext.Provider>;
}

export function useExpenses() {
  const ctx = useContext(ExpenseContext);
  if (!ctx) {
    throw new Error("useExpenses must be used inside ExpenseProvider");
  }
  return ctx;
}

export function formatExpenseMoney(n: number) {
  if (!Number.isFinite(n)) return "0.00";

  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function getExpenseCategoryLabel(category: ExpenseCategory) {
  switch (category) {
    case "inventory":
      return "Inventory";
    case "supplies":
      return "Supplies";
    case "repairs":
      return "Repairs";
    case "utilities":
      return "Utilities";
    case "transport":
      return "Transport";
    case "staff_welfare":
      return "Staff Welfare";
    case "maintenance":
      return "Maintenance";
    case "miscellaneous":
      return "Miscellaneous";
    default:
      return "Miscellaneous";
  }
}