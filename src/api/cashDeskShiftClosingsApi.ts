// src/api/cashDeskShiftClosingsApi.ts

import {
  listCashDeskShiftClosings,
  managerApproveCashDeskClosing,
  approveCloseCashDeskClosing,
  rejectCashDeskClosing,
  type CashDeskShiftClosing,
  type ApiResult,
} from "./mvpClient";

export type { CashDeskShiftClosing };

export async function fetchClosings(
  status: string
): Promise<ApiResult<{ rows: CashDeskShiftClosing[] }>> {
  return listCashDeskShiftClosings(status);
}

export async function managerApprove(id: string) {
  return managerApproveCashDeskClosing(id);
}

export async function approveClose(id: string) {
  return approveCloseCashDeskClosing(id);
}

export async function reject(id: string, reason?: string) {
  // ✅ make sure we always pass a string
  return rejectCashDeskClosing(id, (reason ?? "").trim());
}
