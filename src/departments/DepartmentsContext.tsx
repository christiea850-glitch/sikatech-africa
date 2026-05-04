// src/departments/DepartmentsContext.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import type { User } from "../auth/AuthContext";
import { canManageSetup } from "../auth/permissions";

export type BusinessType =
  | "hotel_restaurant"
  | "retail_store"
  | "hair_beauty"
  | "bookshop"
  | "procurement"
  | "other";

export type Role = User["role"];

export type Department = {
  key: string; // stable slug (routes/refs)
  name: string; // display name
  enabled: boolean;

  /**
   * If true, this department participates in Sales Summary (Central).
   */
  hasSales: boolean;

  // Who can view the department page/records
  viewRoles: Role[];

  // Who can create/edit records INSIDE the department
  editRoles: Role[];

  // Who can REVIEW this department (Accounting Review page)
  reviewRoles: Role[];

  // Optional: employeeId list (future backend)
  accountingReviewers?: string[];
};

type DepartmentsContextType = {
  departments: Department[];

  businessType: BusinessType;
  setBusinessType: (bt: BusinessType) => void;

  addDepartment: (input: { name: string; key?: string }) => void;
  updateDepartment: (key: string, patch: Partial<Omit<Department, "key">>) => void;
  setEnabled: (key: string, enabled: boolean) => void;
  deleteDepartment: (key: string) => void;
  resetToDefault: () => void;

  toKey: (label: string) => string;

  canManageDepartments: boolean;
};

const DepartmentsContext = createContext<DepartmentsContextType | undefined>(undefined);

// LocalStorage keys
const LS_BIZ_TYPE = "sikatech_business_type_v1";
const LS_DEPTS = "sikatech_departments_v1";

// Keys we never allow as business departments
const PROTECTED_KEYS = new Set<string>([
  "executive-overview",
  "auditor",
  "audit-logs",
  "activity",
  "manage-modules",
  "manage-departments",
  "dashboard",
  "notifications",
  "accounting",
  "sales",
]);

export function toKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Default role rules (if roles are missing/empty)
const DEFAULT_VIEW_ROLES: Role[] = ["owner", "super_admin", "admin", "manager", "assistant_manager", "auditor", "front_desk", "staff"];
const DEFAULT_EDIT_ROLES: Role[] = ["owner", "super_admin", "admin", "manager", "assistant_manager", "front_desk", "staff"];
const DEFAULT_REVIEW_ROLES: Role[] = ["owner", "super_admin", "admin", "manager", "accounting"];

// Default template (Hotel/Restaurant)
const HOTEL_DEFAULT_DEPARTMENTS: Department[] = [
  {
    key: "front-desk",
    name: "Front Desk",
    enabled: true,
    hasSales: true,
    viewRoles: DEFAULT_VIEW_ROLES,
    editRoles: DEFAULT_EDIT_ROLES,
    reviewRoles: DEFAULT_REVIEW_ROLES,
  },
  {
    key: "kitchen",
    name: "Kitchen",
    enabled: true,
    hasSales: true,
    viewRoles: DEFAULT_VIEW_ROLES,
    editRoles: DEFAULT_EDIT_ROLES,
    reviewRoles: DEFAULT_REVIEW_ROLES,
  },
  {
    key: "bar",
    name: "Bar",
    enabled: true,
    hasSales: true,
    viewRoles: DEFAULT_VIEW_ROLES,
    editRoles: DEFAULT_EDIT_ROLES,
    reviewRoles: DEFAULT_REVIEW_ROLES,
  },
  {
    key: "laundry-cleaning",
    name: "Laundry & Cleaning",
    enabled: true,
    hasSales: false,
    viewRoles: DEFAULT_VIEW_ROLES,
    editRoles: DEFAULT_EDIT_ROLES,
    reviewRoles: DEFAULT_REVIEW_ROLES,
  },
  {
    key: "gym",
    name: "Gym",
    enabled: true,
    hasSales: true,
    viewRoles: DEFAULT_VIEW_ROLES,
    editRoles: DEFAULT_EDIT_ROLES,
    reviewRoles: DEFAULT_REVIEW_ROLES,
  },
];

function getDefaultsFor(bt: BusinessType): Department[] {
  switch (bt) {
    case "hotel_restaurant":
    default:
      return HOTEL_DEFAULT_DEPARTMENTS;
  }
}

function loadBusinessType(): BusinessType {
  const raw = localStorage.getItem(LS_BIZ_TYPE);
  return (raw as BusinessType) || "hotel_restaurant";
}

function saveBusinessType(bt: BusinessType) {
  localStorage.setItem(LS_BIZ_TYPE, bt);
}

function saveDepartments(depts: Department[]) {
  localStorage.setItem(LS_DEPTS, JSON.stringify(depts));
}

function rolesFromUnknown(x: unknown, fallback: Role[]): Role[] {
  // ✅ If roles missing OR empty => fallback
  if (!Array.isArray(x) || x.length === 0) return fallback;
  if (!x.every((v) => typeof v === "string")) return fallback;
  return x as Role[];
}

/**
 * Normalize + migrate:
 * - ensures key/name/roles are valid
 * - ensures enabled exists (defaults true)
 * - ensures hasSales exists (defaults false if missing)
 * - IMPORTANT: if roles arrays are empty, we treat it as "no restriction" and fallback
 */
function normalizeDepartments(list: unknown[]): Department[] {
  const seen = new Set<string>();
  const cleaned: Department[] = [];

  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;

    const key = String(r.key ?? "").trim().toLowerCase();
    if (!key || PROTECTED_KEYS.has(key)) continue;
    if (seen.has(key)) continue;

    const name = String(r.name ?? key).trim() || key;

    const enabled = r.enabled === undefined ? true : Boolean(r.enabled);
    const hasSales = r.hasSales === true;

    const viewRoles = rolesFromUnknown(r.viewRoles, DEFAULT_VIEW_ROLES);
    const editRoles = rolesFromUnknown(r.editRoles, DEFAULT_EDIT_ROLES);
    const reviewRoles = rolesFromUnknown(r.reviewRoles, DEFAULT_REVIEW_ROLES);

    const accountingReviewers = Array.isArray(r.accountingReviewers)
      ? (r.accountingReviewers.filter((x) => typeof x === "string") as string[])
      : undefined;

    seen.add(key);
    cleaned.push({
      key,
      name,
      enabled,
      hasSales,
      viewRoles,
      editRoles,
      reviewRoles,
      accountingReviewers: accountingReviewers?.length ? accountingReviewers : undefined,
    });
  }

  return cleaned;
}

function loadDepartments(bt: BusinessType): Department[] {
  try {
    const raw = localStorage.getItem(LS_DEPTS);
    if (!raw) return getDefaultsFor(bt);

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getDefaultsFor(bt);

    const normalized = normalizeDepartments(parsed);
    return normalized.length ? normalized : getDefaultsFor(bt);
  } catch {
    return getDefaultsFor(bt);
  }
}

function sameDepts(a: Department[], b: Department[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function DepartmentsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [businessType, setBusinessTypeState] = useState<BusinessType>(() => loadBusinessType());
  const [departments, setDepartments] = useState<Department[]>(() =>
    loadDepartments(loadBusinessType())
  );

  useEffect(() => {
    saveBusinessType(businessType);
  }, [businessType]);

  // One-time migration: normalize and only save if changed
  useEffect(() => {
    setDepartments((prev) => {
      const next = normalizeDepartments(prev);
      if (!sameDepts(prev, next)) saveDepartments(next);
      return next;
    });
  }, []);

  const canManageDepartments = !!user && canManageSetup(user);

  const api = useMemo<DepartmentsContextType>(() => {
    const setBusinessType: DepartmentsContextType["setBusinessType"] = (bt) => {
      setBusinessTypeState(bt);

      // ✅ Switch business type resets to that template (simple + predictable)
      const next = normalizeDepartments(getDefaultsFor(bt));
      setDepartments(next);
      saveDepartments(next);
    };

    const addDepartment: DepartmentsContextType["addDepartment"] = ({ name, key }) => {
      const nm = name.trim();
      if (!nm) return;

      const k = (key?.trim() || toKey(nm)).toLowerCase();
      if (!k || PROTECTED_KEYS.has(k)) return;

      setDepartments((prev) => {
        if (prev.some((d) => d.key === k)) return prev;

        const next = normalizeDepartments([
          ...prev,
          {
            key: k,
            name: nm,
            enabled: true,
            hasSales: false,
            viewRoles: DEFAULT_VIEW_ROLES,
            editRoles: DEFAULT_EDIT_ROLES,
            reviewRoles: DEFAULT_REVIEW_ROLES,
          },
        ]);

        saveDepartments(next);
        return next;
      });
    };

    const updateDepartment: DepartmentsContextType["updateDepartment"] = (key, patch) => {
      const k = key.trim().toLowerCase();
      if (!k || PROTECTED_KEYS.has(k)) return;

      setDepartments((prev) => {
        const next = normalizeDepartments(prev.map((d) => (d.key === k ? { ...d, ...patch } : d)));
        saveDepartments(next);
        return next;
      });
    };

    const setEnabled: DepartmentsContextType["setEnabled"] = (key, enabled) => {
      updateDepartment(key, { enabled });
    };

    const deleteDepartment: DepartmentsContextType["deleteDepartment"] = (key) => {
      const k = key.trim().toLowerCase();
      if (!k || PROTECTED_KEYS.has(k)) return;

      setDepartments((prev) => {
        const next = prev.filter((d) => d.key !== k);
        saveDepartments(next);
        return next;
      });
    };

    const resetToDefault: DepartmentsContextType["resetToDefault"] = () => {
      const next = normalizeDepartments(getDefaultsFor(businessType));
      setDepartments(next);
      saveDepartments(next);
    };

    return {
      departments,
      businessType,
      setBusinessType,
      addDepartment,
      updateDepartment,
      setEnabled,
      deleteDepartment,
      resetToDefault,
      toKey,
      canManageDepartments,
    };
  }, [departments, businessType, canManageDepartments]);

  return <DepartmentsContext.Provider value={api}>{children}</DepartmentsContext.Provider>;
}

export function useDepartments() {
  const ctx = useContext(DepartmentsContext);
  if (!ctx) throw new Error("useDepartments must be used inside DepartmentsProvider");
  return ctx;
}
