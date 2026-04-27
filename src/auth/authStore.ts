export type AuthUser = {
  employeeId: string;
  role?: string;
  businessId?: string;
  departmentId?: string;
};

const KEY = "sikatech_auth_user";

export function setAuthUser(user: AuthUser) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function getAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearAuthUser() {
  localStorage.removeItem(KEY);
}
