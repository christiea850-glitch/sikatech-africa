const API_BASE = "http://localhost:4000";

export type LoginPayload = {
  employeeId: string;
  password: string;
};

export type LoginResponse = {
  ok: boolean;
  message?: string;
  employeeId?: string;
  role?: string;           // later
  businessId?: string;     // later
  departmentId?: string;   // later
};

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // handle non-200 nicely
  const data = (await res.json().catch(() => null)) as LoginResponse | null;

  if (!res.ok) {
    return {
      ok: false,
      message: data?.message || `Login failed (${res.status})`,
    };
  }

  return data || { ok: false, message: "Login failed (empty response)" };
}
