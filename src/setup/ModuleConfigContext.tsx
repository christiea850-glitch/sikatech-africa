// src/setup/ModuleConfigContext.tsx
import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "../auth/AuthContext";
import { ALL_ROLES, canManageSetup, canReviewFinancials } from "../auth/permissions";

export type Role = User["role"];

export type ModuleConfig = {
  key: string;
  label: string;
  enabled: boolean;
  viewRoles: Role[];
  editRoles: Role[];
  system?: boolean;
};

type ModuleConfigContextType = {
  modules: ModuleConfig[];

  addModule: (m: Omit<ModuleConfig, "key"> & { key?: string }) => void;
  updateModule: (key: string, patch: Partial<Omit<ModuleConfig, "key">>) => void;
  deleteModule: (key: string) => void;

  setEnabled: (key: string, enabled: boolean) => void;
  resetModules: () => void;

  toKey: (label: string) => string;
};

const ModuleConfigContext = createContext<ModuleConfigContextType | undefined>(undefined);

const LS_KEY = "sikatech_modules_v1";

function toKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const FINANCIAL_VIEW_ROLES = ALL_ROLES.filter((role) => canReviewFinancials(role));
const SETUP_ROLES = ALL_ROLES.filter((role) => canManageSetup(role));

const DEFAULT_MODULES: ModuleConfig[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    enabled: true,
    viewRoles: ALL_ROLES,
    editRoles: [],
    system: true,
  },
  {
    key: "audit-logs",
    label: "Audit Logs",
    enabled: true,
    viewRoles: ["owner", "super_admin", "admin", "manager", "assistant_manager", "auditor"],
    editRoles: [],
    system: true,
  },
  {
    key: "activity",
    label: "Activity Feed",
    enabled: true,
    viewRoles: ["owner", "super_admin", "admin", "manager", "assistant_manager", "auditor"],
    editRoles: [],
    system: true,
  },
  {
    key: "executive-overview",
    label: "Executive Overview Log",
    enabled: true,
    viewRoles: ["owner", "super_admin", "admin", "manager"],
    editRoles: [],
    system: true,
  },

  // Admin tools
  {
    key: "manage-modules",
    label: "Manage Modules",
    enabled: true,
    viewRoles: SETUP_ROLES,
    editRoles: SETUP_ROLES,
    system: true,
  },
  {
    key: "manage-departments",
    label: "Manage Departments",
    enabled: true,
    viewRoles: SETUP_ROLES,
    editRoles: SETUP_ROLES,
    system: true,
  },

  // Normal modules
  {
    key: "notifications",
    label: "Notifications",
    enabled: true,
    viewRoles: ALL_ROLES,
    editRoles: ["accounting"],
  },
  {
    key: "sales",
    label: "Sales",
    enabled: true,
    viewRoles: ALL_ROLES,
    editRoles: ["accounting"],
  },
  {
    key: "accounting",
    label: "Accounting",
    enabled: true,
    viewRoles: FINANCIAL_VIEW_ROLES,
    editRoles: ["accounting"],
  },
];

// ---------- helpers ----------
function save(mods: ModuleConfig[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(mods));
}

function ensureModule(mods: ModuleConfig[], mustExist: ModuleConfig): ModuleConfig[] {
  const existing = mods.find((m) => m.key === mustExist.key);

  if (!existing) return [...mods, mustExist];

  const needsFix =
    existing.enabled !== true ||
    !Array.isArray(existing.viewRoles) ||
    mustExist.viewRoles.some((r) => !existing.viewRoles.includes(r)) ||
    !Array.isArray(existing.editRoles) ||
    mustExist.editRoles.some((r) => !existing.editRoles.includes(r)) ||
    existing.label !== mustExist.label;

  if (!needsFix) return mods;

  return mods.map((m) => {
    if (m.key !== mustExist.key) return m;
    return {
      ...m,
      label: mustExist.label,
      enabled: true,
      viewRoles: mustExist.viewRoles,
      editRoles: mustExist.editRoles,
      system: true,
    };
  });
}

// Migration + self-heal
function migrate(mods: ModuleConfig[]): ModuleConfig[] {
  let next = mods.slice();

  // Fix any old confusion where manage-modules had "Manage Departments"
  next = next.map((m) => {
    if (m.key === "manage-modules" && m.label === "Manage Departments") {
      return { ...m, label: "Manage Modules" };
    }
    return m;
  });

  // Ensure critical modules always exist
  const mustHaveKeys = [
    "dashboard",
    "audit-logs",
    "activity",
    "executive-overview",
    "manage-modules",
    "manage-departments",
  ] as const;

  for (const key of mustHaveKeys) {
    const mustExist = DEFAULT_MODULES.find((m) => m.key === key);
    if (mustExist) next = ensureModule(next, mustExist);
  }

  // Stable ordering: defaults first
  const defaultOrder = new Map(DEFAULT_MODULES.map((m, i) => [m.key, i]));
  next = next
    .slice()
    .sort((a, b) => (defaultOrder.get(a.key) ?? 9999) - (defaultOrder.get(b.key) ?? 9999));

  return next;
}

function loadInitial(): ModuleConfig[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_MODULES;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_MODULES;

    const hasDashboard = parsed.some((m: any) => m?.key === "dashboard");
    if (!hasDashboard) return DEFAULT_MODULES;

    const migrated = migrate(parsed as ModuleConfig[]);
    save(migrated);
    return migrated;
  } catch {
    return DEFAULT_MODULES;
  }
}

// ---------- Provider ----------
export function ModuleConfigProvider({ children }: { children: ReactNode }) {
  const [modules, setModules] = useState<ModuleConfig[]>(() => loadInitial());

  const api = useMemo<ModuleConfigContextType>(() => {
    const addModule: ModuleConfigContextType["addModule"] = (m) => {
      const key = (m.key?.trim() || toKey(m.label)).toLowerCase();
      const label = m.label.trim();
      if (!key || !label) return;

      setModules((prev) => {
        if (prev.some((x) => x.key === key)) return prev;

        const next: ModuleConfig[] = [
          ...prev,
          {
            key,
            label,
            enabled: m.enabled ?? true,
            viewRoles: m.viewRoles ?? FINANCIAL_VIEW_ROLES,
            editRoles: m.editRoles ?? ["accounting"],
            system: false,
          },
        ];

        save(next);
        return next;
      });
    };

    const updateModule: ModuleConfigContextType["updateModule"] = (key, patch) => {
      setModules((prev) => {
        const next = prev.map((m) => {
          if (m.key !== key) return m;
          return {
            ...m,
            ...patch,
            label: patch.label ?? m.label,
            enabled: patch.enabled ?? m.enabled,
            viewRoles: patch.viewRoles ?? m.viewRoles,
            editRoles: patch.editRoles ?? m.editRoles,
          };
        });

        save(next);
        return next;
      });
    };

    const deleteModule: ModuleConfigContextType["deleteModule"] = (key) => {
      setModules((prev) => {
        const target = prev.find((m) => m.key === key);
        if (!target) return prev;
        if (target.system) return prev;

        const next = prev.filter((m) => m.key !== key);
        save(next);
        return next;
      });
    };

    const setEnabled: ModuleConfigContextType["setEnabled"] = (key, enabled) => {
      updateModule(key, { enabled });
    };

    const resetModules: ModuleConfigContextType["resetModules"] = () => {
      setModules(() => {
        save(DEFAULT_MODULES);
        return DEFAULT_MODULES;
      });
    };

    return {
      modules,
      addModule,
      updateModule,
      deleteModule,
      setEnabled,
      resetModules,
      toKey,
    };
  }, [modules]);

  return <ModuleConfigContext.Provider value={api}>{children}</ModuleConfigContext.Provider>;
}

export function useModuleConfig() {
  const ctx = useContext(ModuleConfigContext);
  if (!ctx) throw new Error("useModuleConfig must be used inside ModuleConfigProvider");
  return ctx;
}

