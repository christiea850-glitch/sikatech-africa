// src/api/http.ts
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:4000";
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  const headers = new Headers(options.headers || {});

  // Always accept JSON
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  // If sending JSON body, set Content-Type
  const hasBody = options.body !== undefined && options.body !== null;
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // 1) Try token first (if your backend supports it)
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("auth_token") ||
    sessionStorage.getItem("token") ||
    sessionStorage.getItem("auth_token");

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // 2) Otherwise fall back to dev/user headers (your backend currently accepts these)
  const userId =
    localStorage.getItem("dev_user_id") ||
    localStorage.getItem("user_id") ||
    localStorage.getItem("auth_user_id") ||
    sessionStorage.getItem("dev_user_id") ||
    sessionStorage.getItem("user_id") ||
    sessionStorage.getItem("auth_user_id");

  const role =
    localStorage.getItem("dev_role") ||
    localStorage.getItem("role") ||
    localStorage.getItem("auth_role") ||
    sessionStorage.getItem("dev_role") ||
    sessionStorage.getItem("role") ||
    sessionStorage.getItem("auth_role");

  // Only set if not already present
  if (!headers.has("x-user-id") && userId) headers.set("x-user-id", userId);
  if (!headers.has("x-role") && role) headers.set("x-role", role);

  const res = await fetch(url, { ...options, headers });

  // Parse JSON safely
  const data = await res.json().catch(() => ({} as any));

  if (!res.ok || (data && data.ok === false)) {
    const msg = data?.error || data?.message || `Request failed: ${res.status}`;
    throw new Error(msg);
  }

  return data as T;
}
