// src/api/mvpClient.ts

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

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

export async function submitClosing(_shiftId: string, note?: string) {
  const businessId = Number(localStorage.getItem("dev_business_id") || "1");

  return request<{ ok: true; id?: number }>(`/shift-closing`, {
    method: "POST",
    body: JSON.stringify({
      businessId,
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