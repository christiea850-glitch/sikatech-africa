// src/accounting/AccountingReviewContext.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";

export type Severity = "normal" | "urgent";
export type CorrectionStatus = "open" | "resolved";

export type CorrectionRequest = {
  id: string;
  deptKey: string;
  createdAt: string;
  severity: Severity;
  message: string;
  createdBy: string; // string label (email/role/etc)
  status: CorrectionStatus;
  referenceId?: string;
};

export type AddRequestInput = {
  deptKey: string;
  severity?: Severity;
  message: string;
  referenceId?: string;
};

type AccountingReviewContextType = {
  requests: CorrectionRequest[];
  addRequest: (input: AddRequestInput) => void;
  resolveRequest: (id: string) => void;
  reopenRequest: (id: string) => void;
  deleteRequest: (id: string) => void;
};

const AccountingReviewContext = createContext<AccountingReviewContextType | undefined>(undefined);

const LS_KEY = "sikatech_accounting_corrections_v1";

function uid() {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

function load(): CorrectionRequest[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CorrectionRequest[]) : [];
  } catch {
    return [];
  }
}

function save(list: CorrectionRequest[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export function AccountingReviewProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<CorrectionRequest[]>(() => load());

  useEffect(() => {
    save(requests);
  }, [requests]);

  const api = useMemo<AccountingReviewContextType>(() => {
    const addRequest: AccountingReviewContextType["addRequest"] = (input) => {
      const createdBy =
        // use whatever your User actually has; fallback safely
        (user as any)?.email ||
        (user as any)?.username ||
        (user as any)?.role ||
        "accounting";

      const next: CorrectionRequest = {
        id: uid(),
        deptKey: input.deptKey,
        createdAt: new Date().toISOString(),
        severity: input.severity ?? "normal",
        message: input.message.trim(),
        createdBy,
        status: "open",
        referenceId: input.referenceId?.trim() || undefined,
      };

      setRequests((prev) => [next, ...prev]);
    };

    const resolveRequest: AccountingReviewContextType["resolveRequest"] = (id) => {
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: "resolved" } : r)));
    };

    const reopenRequest: AccountingReviewContextType["reopenRequest"] = (id) => {
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: "open" } : r)));
    };

    const deleteRequest: AccountingReviewContextType["deleteRequest"] = (id) => {
      setRequests((prev) => prev.filter((r) => r.id !== id));
    };

    return { requests, addRequest, resolveRequest, reopenRequest, deleteRequest };
  }, [user]);

  return <AccountingReviewContext.Provider value={api}>{children}</AccountingReviewContext.Provider>;
}

export function useAccountingReview() {
  const ctx = useContext(AccountingReviewContext);
  if (!ctx) throw new Error("useAccountingReview must be used inside AccountingReviewProvider");
  return ctx;
}


