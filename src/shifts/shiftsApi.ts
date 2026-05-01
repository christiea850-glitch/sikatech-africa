// src/shifts/shiftsApi.ts

import {
  listShifts as apiListShifts,
  openShift as apiOpenShift,
  submitClosing as apiSubmitClosing,
  accountingReview as apiAccountingReview,
  approveClose as apiApproveClose,
} from "../api/mvpClient";

export type Shift = {
  id: string;
  businessId?: string;
  branchId?: string;
  departmentKey?: string;
  status?: "open" | "closing_submitted" | "accounting_reviewed" | "closed" | string;
  openedAt?: number;
};

export type ListShiftsResponse =
  | { ok: true; shifts: Shift[] }
  | { ok: false; error: string };

export type OneShiftResponse =
  | { ok: true; shift: Shift; closingId?: string | number }
  | { ok: false; error: string };

function pickErr(res: any, fallback: string) {
  return (res && typeof res === "object" && "error" in res && res.error) || fallback;
}

export async function listShifts(departmentKey?: string): Promise<ListShiftsResponse> {
  const res = await apiListShifts(departmentKey);
  if (!res.ok) return { ok: false, error: pickErr(res, "Failed to load shifts") };

  const shifts = Array.isArray((res.data as any)?.shifts) ? (res.data as any).shifts : [];
  return { ok: true, shifts };
}

export async function openShift(departmentKey: string): Promise<OneShiftResponse> {
  const key = String(departmentKey || "").trim().toLowerCase();
  if (!key) return { ok: false, error: "departmentKey is required" };

  const res = await apiOpenShift({ departmentKey: key });
  if (!res.ok) return { ok: false, error: pickErr(res, "Failed to open shift") };

  const shift = (res.data as any)?.shift;
  if (!shift) return { ok: false, error: "Server did not return shift" };
  return { ok: true, shift };
}

export async function submitClosing(shiftId: string): Promise<OneShiftResponse> {
  const id = String(shiftId || "").trim();
  if (!id) return { ok: false, error: "shiftId is required" };

  const res = await apiSubmitClosing(id);
  if (!res.ok) return { ok: false, error: pickErr(res, "Failed to submit closing") };

  const shift =
    (res.data as any)?.shift || ({
      id,
      status: "closing_submitted",
    } as Shift);
  return { ok: true, shift, closingId: (res.data as any)?.id };
}

export async function accountingReview(
  shiftId: string,
  note: string
): Promise<OneShiftResponse> {
  const id = String(shiftId || "").trim();
  if (!id) return { ok: false, error: "shiftId is required" };

  const res = await apiAccountingReview(id, String(note || ""));
  if (!res.ok) return { ok: false, error: pickErr(res, "Failed to accounting review") };

  const shift = (res.data as any)?.shift;
  if (!shift) return { ok: false, error: "Server did not return shift" };
  return { ok: true, shift };
}

export async function approveClose(shiftId: string): Promise<OneShiftResponse> {
  const id = String(shiftId || "").trim();
  if (!id) return { ok: false, error: "shiftId is required" };

  const res = await apiApproveClose(id);
  if (!res.ok) return { ok: false, error: pickErr(res, "Failed to approve close") };

  const shift = (res.data as any)?.shift;
  if (!shift) return { ok: false, error: "Server did not return shift" };
  return { ok: true, shift };
}
