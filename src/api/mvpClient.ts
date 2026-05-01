// src/api/mvpClient.ts

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type AuthedUserLike = {
  employeeId: string;
  role: string;
  businessId: string;
  branchId: string;
  departmentKey?: string;
};

const API_BASE = "http://localhost:4000/api";

// dev seed
localStorage.setItem("dev_user_id", localStorage.getItem("dev_user_id") || "1");
localStorage.setItem("dev_role", localStorage.getItem("dev_role") || "staff");
localStorage.setItem(
  "dev_business_id",
  localStorage.getItem("dev_business_id") || "1"
);
localStorage.setItem(
  "dev_branch_id",
  localStorage.getItem("dev_branch_id") || "main"
);
localStorage.setItem(
  "dev_department_key",
  localStorage.getItem("dev_department_key") || "bar"
);

function getDevAuthHeaders(): Record<string, string> {
  return {
    "x-user-id": localStorage.getItem("dev_user_id") || "1",
    "x-role": localStorage.getItem("dev_role") || "staff",
    "x-business-id": localStorage.getItem("dev_business_id") || "1",
    "x-branch-id": localStorage.getItem("dev_branch_id") || "main",
    "x-department-key": localStorage.getItem("dev_department_key") || "bar",
  };
}

export async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(API_BASE + url, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...getDevAuthHeaders(),
        ...(options.headers || {}),
      },
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return { ok: false, error: data?.error || "Request failed" };
    }

    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Network error" };
  }
}

async function unwrap<T>(result: ApiResult<T>): Promise<T> {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/* =====================================================
   MVP SHIFTS
===================================================== */

export type Shift = {
  id: string;
  businessId?: string;
  branchId?: string;
  departmentKey?: string;
  status?: "open" | "closing_submitted" | "accounting_reviewed" | "closed" | string;
  openedAt?: number | string;
  closedAt?: number | string | null;
};

export async function listShifts(departmentKey?: string) {
  const qs = departmentKey
    ? `?departmentKey=${encodeURIComponent(departmentKey)}`
    : "";

  return request<{ ok: true; shifts: Shift[] }>(`/mvp/shifts${qs}`);
}

export async function openShift(payload: { departmentKey: string }) {
  return request<{ ok: true; shift: Shift; existing?: boolean }>(
    `/mvp/shifts/open`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function getShiftSummary(shiftId: string) {
  return request<{
    shiftId: string;
    byDepartment: Array<{
      departmentKey: string;
      departmentName?: string;
      total: number;
      count?: number;
      postedToRoomTotal?: number;
      cashTotal?: number;
      momoTotal?: number;
      cardTotal?: number;
      transferTotal?: number;
      payNowTotal?: number;
    }>;
    grandTotal?: number;
  }>(`/mvp/shifts/${encodeURIComponent(shiftId)}/summary`, {
    method: "GET",
  });
}

export async function getRoomFolio(shiftId: string, roomNo: string) {
  return request<{
    roomNo: string;
    total: number;
    items: Array<{
      departmentKey: string;
      count?: number;
      total: number;
    }>;
  }>(
    `/mvp/shifts/${encodeURIComponent(shiftId)}/room-folio/${encodeURIComponent(
      roomNo
    )}`,
    {
      method: "GET",
    }
  );
}

/* =====================================================
   SHIFT CLOSING
===================================================== */

export async function submitClosing(shiftId: string, note?: string) {
  const businessId = Number(localStorage.getItem("dev_business_id") || "1");

  return request<{ ok: true; id?: number; shift?: Shift }>(`/shift-closing`, {
    method: "POST",
    body: JSON.stringify({
      businessId,
      shiftId,
      notes: note ?? "",
      cashExpected: 0,
      cashCounted: 0,
      cardTotal: 0,
      momoTotal: 0,
      expensesTotal: 0,
    }),
  });
}

export async function accountingReview(
  shiftClosingId: string | number,
  note: string
) {
  return request<{ ok: true }>(
    `/shift-closing/${encodeURIComponent(
      String(shiftClosingId)
    )}/accounting-review`,
    {
      method: "PATCH",
      body: JSON.stringify({
        accountingNote: note ?? "",
      }),
    }
  );
}

export async function approveClose(
  shiftClosingId: string | number,
  note?: string
) {
  return request<{ ok: true }>(
    `/shift-closing/${encodeURIComponent(
      String(shiftClosingId)
    )}/manager-approve`,
    {
      method: "PATCH",
      body: JSON.stringify({
        managerNote: note ?? "",
      }),
    }
  );
}

/* =====================================================
   CASH DESK SHIFT CLOSINGS
===================================================== */

export type CashDeskShiftClosing = {
  id: string | number;
  status?: string;
  businessId?: string | number;
  branchId?: string;
  departmentKey?: string;
  cashExpected?: number;
  cashCounted?: number;
  cardTotal?: number;
  momoTotal?: number;
  expensesTotal?: number;
  notes?: string;
  accountingNote?: string;
  managerNote?: string;
  rejectionReason?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  submittedAt?: string | number;
};

export function listCashDeskShiftClosings(status: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<{ rows: CashDeskShiftClosing[] }>(
    `/cash-desk-shift-closings${qs}`
  );
}

export function managerApproveCashDeskClosing(id: string | number) {
  return request<{ ok: true }>(
    `/cash-desk-shift-closings/${encodeURIComponent(String(id))}/manager-approve`,
    { method: "PATCH" }
  );
}

export function approveCloseCashDeskClosing(id: string | number) {
  return request<{ ok: true }>(
    `/cash-desk-shift-closings/${encodeURIComponent(String(id))}/approve-close`,
    { method: "PATCH" }
  );
}

export function rejectCashDeskClosing(id: string | number, reason: string) {
  return request<{ ok: true }>(
    `/cash-desk-shift-closings/${encodeURIComponent(String(id))}/reject`,
    {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    }
  );
}

/* =====================================================
   SHIFT TRANSACTIONS
===================================================== */

export type LineItem = {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
};

export type Transaction = {
  id: string;
  shiftId: string;
  status: "OPEN" | "PAID" | "VOID" | string;
  items: LineItem[];
  subtotal: number;
  discountTotal: number;
  total: number;
  createdAt: string | number;
};

function authHeaders(user: AuthedUserLike): Record<string, string> {
  return {
    "x-user-id": user.employeeId,
    "x-role": user.role,
    "x-business-id": user.businessId,
    "x-branch-id": user.branchId,
    ...(user.departmentKey ? { "x-department-key": user.departmentKey } : {}),
  };
}

export async function listShiftTransactions(
  user: AuthedUserLike,
  shiftId: string
) {
  return unwrap(
    await request<{ transactions: Transaction[] }>(
      `/mvp/shifts/${encodeURIComponent(shiftId)}/transactions`,
      { headers: authHeaders(user) }
    )
  );
}

export async function createTransaction(
  user: AuthedUserLike,
  input: {
    shiftId: string;
    status: Transaction["status"];
    items: LineItem[];
  }
) {
  return unwrap(
    await request<{ transaction: Transaction }>(
      `/mvp/shifts/${encodeURIComponent(input.shiftId)}/transactions`,
      {
        method: "POST",
        headers: authHeaders(user),
        body: JSON.stringify({
          status: input.status,
          items: input.items,
        }),
      }
    )
  );
}
