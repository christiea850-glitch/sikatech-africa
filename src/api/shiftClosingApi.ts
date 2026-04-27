// src/api/shiftClosingApi.ts

const API_BASE = "http://localhost:4000";

export type SubmitShiftClosingInput = {
  businessId: number;
  cashExpected: number;
  cashCounted: number;
  cardTotal: number;
  momoTotal: number;
  expensesTotal: number;
  notes?: string | null;
};

export type SubmitShiftClosingResponse = {
  ok: true;
  id: number;
};

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("auth_token") ||
    localStorage.getItem("access_token");

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  const devUserId = localStorage.getItem("dev_user_id");
  const devRole = localStorage.getItem("dev_role");

  if (devUserId) headers["x-user-id"] = devUserId;
  if (devRole) headers["x-role"] = devRole;

  return headers;
}

export async function submitShiftClosing(
  input: SubmitShiftClosingInput
): Promise<SubmitShiftClosingResponse> {
  const res = await fetch(`${API_BASE}/api/shift-closing`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({
      businessId: input.businessId,
      cashExpected: input.cashExpected,
      cashCounted: input.cashCounted,
      cardTotal: input.cardTotal,
      momoTotal: input.momoTotal,
      expensesTotal: input.expensesTotal,
      notes: input.notes ?? null,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || `Failed to submit shift closing (${res.status})`);
  }

  return {
    ok: true,
    id: Number(data.id),
  };
}