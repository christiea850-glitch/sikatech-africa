// src/sales/salesStorage.ts
import type { Transaction, SalesAdjustment } from "./salesTypes";

export const TX_STORAGE_KEY = "sikatech_transactions_v1";
export const ADJ_STORAGE_KEY = "sikatech_sales_adjustments_v1";

export function loadTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(TX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Transaction[]) : [];
  } catch {
    return [];
  }
}

export function saveTransactions(list: Transaction[]) {
  localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(list));
}

export function loadAdjustments(): SalesAdjustment[] {
  try {
    const raw = localStorage.getItem(ADJ_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SalesAdjustment[]) : [];
  } catch {
    return [];
  }
}

export function saveAdjustments(list: SalesAdjustment[]) {
  localStorage.setItem(ADJ_STORAGE_KEY, JSON.stringify(list));
}

export function addAdjustment(adj: SalesAdjustment) {
  const existing = loadAdjustments();
  saveAdjustments([adj, ...existing]);
}
