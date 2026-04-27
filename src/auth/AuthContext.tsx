// src/auth/AuthContext.tsx
import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/* -------------------- Types -------------------- */
export type Role =
  | "admin"
  | "manager"
  | "assistant_manager"
  | "accounting"
  | "auditor"
  | "front_desk"
  | "staff";

export type User = {
  employeeId: string;
  role: Role;

  businessId?: string;
  branchId?: string;
  departmentKey?: string;

  token?: string;
  accessToken?: string;
  jwt?: string;
};

type AuthContextType = {
  user: User | null;
  login: (employeeId: string, password: string) => Promise<User>;
  logout: () => void;
};

/* -------------------- Constants -------------------- */
const STORAGE_KEY = "sikatech_user";
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

/* -------------------- Helpers -------------------- */
const VALID_ROLES: Role[] = [
  "admin",
  "manager",
  "assistant_manager",
  "accounting",
  "auditor",
  "front_desk",
  "staff",
];

function isRole(x: unknown): x is Role {
  return typeof x === "string" && (VALID_ROLES as string[]).includes(x);
}

function cleanString(x: unknown): string | undefined {
  if (typeof x !== "string") return undefined;
  const v = x.trim();
  return v.length ? v : undefined;
}

/**
 * ✅ Canonical departmentKey format (use DASHES)
 * Because your UI / messages use examples like: "front-desk, bar, kitchen".
 * We accept underscores/spaces and normalize to dashes.
 */
function normalizeDeptKey(x: unknown): string | undefined {
  const s = cleanString(x);
  if (!s) return undefined;

  const v = s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  // normalize common variations
  if (v === "frontdesk" || v === "front-desk" || v === "front-desk") return "front-desk";
  if (v === "laundry-cleaning" || v === "laundry-cleaning") return "laundry-cleaning";

  return v;
}

function inferDepartmentKey(employeeIdRaw: string): string | undefined {
  const id = employeeIdRaw.trim().toLowerCase();

  if (id.startsWith("fd") || id.startsWith("front")) return "front-desk";
  if (id.startsWith("bar")) return "bar";
  if (id.startsWith("kit") || id.startsWith("kitchen")) return "kitchen";
  if (id.startsWith("cln") || id.startsWith("lau") || id.startsWith("clean"))
    return "laundry-cleaning";
  if (id.startsWith("gym")) return "gym";
  if (id.startsWith("spa")) return "spa";

  return undefined;
}

function toSafeUser(input: unknown): User | null {
  if (!input || typeof input !== "object") return null;
  const u = input as Record<string, unknown>;

  const employeeId = cleanString(u.employeeId);
  if (!employeeId) return null;

  const role: Role = isRole(u.role) ? (u.role as Role) : "staff";

  const safe: User = { employeeId, role };

  const businessId = cleanString(u.businessId);
  if (businessId) safe.businessId = businessId;

  const branchId = cleanString(u.branchId);
  if (branchId) safe.branchId = branchId;

  const departmentKey = normalizeDeptKey(u.departmentKey);
  if (departmentKey) safe.departmentKey = departmentKey;

  const token = cleanString(u.token);
  if (token) safe.token = token;

  const accessToken = cleanString(u.accessToken);
  if (accessToken) safe.accessToken = accessToken;

  const jwt = cleanString(u.jwt);
  if (jwt) safe.jwt = jwt;

  return safe;
}

function loadSavedUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    if (raw.length > 50_000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return toSafeUser(JSON.parse(raw));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveUserSafe(u: User) {
  const safe = toSafeUser(u);
  if (!safe) return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch {
      // ignore
    }
  }
}

/* -------------------- API Types -------------------- */
type LoginOk = {
  ok: true;
  user?: Partial<User>;

  employeeId?: string;
  role?: Role;
  businessId?: string;
  branchId?: string;
  departmentKey?: string;

  token?: string;
  accessToken?: string;
  jwt?: string;

  message?: string;
};

type LoginFail = {
  ok: false;
  error?: string;
  message?: string;
};

type LoginApiResponse = LoginOk | LoginFail;

/* -------------------- Context -------------------- */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/* -------------------- Provider -------------------- */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => loadSavedUser());

  const login = async (employeeId: string, password: string) => {
    const emp = employeeId.trim();
    const pwd = password;

    if (!emp || !pwd) throw new Error("Employee ID and password are required.");

    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: emp, password: pwd }),
    });

    let data: LoginApiResponse | null = null;
    try {
      data = (await res.json()) as LoginApiResponse;
    } catch {
      data = null;
    }

    if (!res.ok || !data || (data as any).ok === false) {
      const msg =
        (data as any)?.error ||
        (data as any)?.message ||
        `Login failed (${res.status})`;
      throw new Error(msg);
    }

    const ok = data as LoginOk;
    const fromUserObj = (ok.user ?? {}) as Partial<User>;

    const employeeIdFromApi =
      cleanString(fromUserObj.employeeId) ?? cleanString(ok.employeeId) ?? emp;

    const roleFromApi = fromUserObj.role ?? ok.role;
    const role: Role = isRole(roleFromApi) ? roleFromApi : "staff";

    // ✅ get departmentKey from API (normalize), else infer
    const deptFromApi =
      normalizeDeptKey(fromUserObj.departmentKey) ?? normalizeDeptKey(ok.departmentKey);

    // ✅ IMPORTANT: also assign dept for front_desk (not only staff)
    const inferredDept =
      inferDepartmentKey(employeeIdFromApi) ||
      (role === "front_desk" ? "front-desk" : undefined);

    const departmentKey = deptFromApi ?? inferredDept;

    const token = cleanString(fromUserObj.token) ?? cleanString(ok.token) ?? undefined;
    const accessToken =
      cleanString(fromUserObj.accessToken) ?? cleanString(ok.accessToken) ?? undefined;
    const jwt = cleanString(fromUserObj.jwt) ?? cleanString(ok.jwt) ?? undefined;

    const nextUser: User = {
      employeeId: employeeIdFromApi,
      role,
      businessId: cleanString(fromUserObj.businessId) ?? cleanString(ok.businessId),
      branchId: cleanString(fromUserObj.branchId) ?? cleanString(ok.branchId),
      departmentKey,
      token,
      accessToken,
      jwt,
    };

    const safe = toSafeUser(nextUser);
    if (!safe) throw new Error("Login failed: invalid user response.");

    setUser(safe);
    saveUserSafe(safe);
    return safe;
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const value = useMemo<AuthContextType>(() => ({ user, login, logout }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* -------------------- Hook -------------------- */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
