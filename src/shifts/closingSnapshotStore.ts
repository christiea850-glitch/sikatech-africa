// src/shifts/closingSnapshotStore.ts
import type { ShiftSummary } from "./shiftsSummary";

export type ClosingSnapshot = {
  shiftId: string;
  departmentKey?: string;
  createdAt: number;

  // copy of computed summary at the moment of closing
  summary: ShiftSummary;
};

const KEY = "sikatech_shift_closing_snapshots_v1";

function readAll(): ClosingSnapshot[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ClosingSnapshot[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: ClosingSnapshot[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function saveClosingSnapshot(snapshot: ClosingSnapshot) {
  const all = readAll();
  const next = [snapshot, ...all.filter((s) => s.shiftId !== snapshot.shiftId)];
  writeAll(next);
}

export function getClosingSnapshot(shiftId: string) {
  return readAll().find((s) => s.shiftId === shiftId) ?? null;
}
