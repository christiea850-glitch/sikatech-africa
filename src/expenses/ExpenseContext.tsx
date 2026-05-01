// src/expenses/ExpenseContext.tsx

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createLedgerEntry,
  removeLedgerEntries,
  upsertLedgerEntries,
} from "../finance/financialLedger";
import { normalizeDepartmentKey } from "../lib/departments";

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
  shiftId?: string;
  shiftStatus?: string;
  submittedAt?: string;
  submittedBy?: string;
  submissionMode?: "manual" | "automatic";
};

export type AddExpenseInput = {
  deptKey: string;

  category: ExpenseCategory;
  description: string;
  amount: number;

  enteredBy: string;
  enteredByName?: string;

  note?: string;
  shiftId?: string;
  shiftStatus?: string;
  submittedAt?: string;
  submittedBy?: string;
  submissionMode?: "manual" | "automatic";
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

function expenseLedgerEntry(record: ExpenseRecord) {
  const amount = Math.max(0, Number(record.amount) || 0);
  if (amount <= 0) return null;

  return createLedgerEntry({
    id: `expense:${record.id}`,
    occurredAt: record.createdAt,
    departmentKey: normalizeDepartmentKey(record.deptKey),
    shiftId: record.shiftId,
    sourceType: "expense",
    sourceId: record.id,
    customerName: record.description,
    paymentMethod: "expense",
    revenueAmount: 0,
    collectionAmount: 0,
    expenseAmount: amount,
    status: "posted",
    createdBy: {
      employeeId: record.enteredBy,
      name: record.enteredByName,
      role: "staff",
    },
  });
}

function syncExpensesToLedger(records: ExpenseRecord[]) {
  const entries = records
    .map((record) => expenseLedgerEntry(record))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  upsertLedgerEntries(entries);
}

function removeExpenseLedgerEntries(ids: Set<string>) {
  removeLedgerEntries((entry) => entry.sourceType === "expense" && ids.has(entry.sourceId));
}

export function ExpenseProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<ExpenseRecord[]>(() => load());

  useEffect(() => {
    // Legacy expense storage is preserved for existing screens while the ledger becomes canonical.
    save(records);
  }, [records]);

  useEffect(() => {
    syncExpensesToLedger(records);
  }, [records]);

  const api = useMemo<ExpenseContextType>(() => {
    const addExpense: ExpenseContextType["addExpense"] = (input) => {
      const amount = Number(input.amount);
      const safeAmount = Math.max(0, amount);

      const next: ExpenseRecord = {
        id: uid(),
        createdAt: new Date().toISOString(),

        deptKey: normalizeDepartmentKey(input.deptKey),

        category: input.category,
        description: String(input.description ?? "").trim(),
        amount: safeAmount,

        enteredBy: String(input.enteredBy ?? "").trim(),
        enteredByName: input.enteredByName?.trim() || undefined,

        note: input.note?.trim() || undefined,
        shiftId: input.shiftId?.trim() || undefined,
        shiftStatus: input.shiftStatus?.trim() || undefined,
        submittedAt: input.submittedAt?.trim() || undefined,
        submittedBy: input.submittedBy?.trim() || undefined,
        submissionMode: input.submissionMode,
      };

      setRecords((prev) => [next, ...prev]);
      const ledgerEntry = expenseLedgerEntry(next);
      if (ledgerEntry) upsertLedgerEntries([ledgerEntry]);
    };

    const deleteExpense: ExpenseContextType["deleteExpense"] = (id) => {
      setRecords((prev) => prev.filter((r) => r.id !== id));
      removeExpenseLedgerEntries(new Set([id]));
    };

    const clearAllExpenses: ExpenseContextType["clearAllExpenses"] = () => {
      removeExpenseLedgerEntries(new Set(records.map((record) => record.id)));
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
