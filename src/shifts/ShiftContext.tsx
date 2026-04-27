// src/shifts/ShiftContext.tsx
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthContext";
import {
  listShifts,
  openShift as apiOpenShift,
  submitClosing as apiSubmitClosing,
  accountingReview as apiAccountingReview,
  approveClose as apiApproveClose,
  type Shift,
} from "./shiftsApi";
import { recordShiftSubmission } from "../lib/shiftTrace";

type ShiftCtx = {
  shifts: Shift[];
  activeShift: Shift | null;
  isShiftOpen: boolean;

  loading: boolean;
  error: string | null;

  refresh: (departmentKey?: string, force?: boolean) => Promise<void>;
  openForDept: (departmentKey?: string) => Promise<void>;
  submitClose: (shiftId: string) => Promise<void>;
  accountingReview: (shiftId: string, note: string) => Promise<void>;
  approveClose: (shiftId: string) => Promise<void>;
};

const ShiftContext = createContext<ShiftCtx | null>(null);

function getUserDeptKey(user: unknown): string | undefined {
  const u = user as any;
  const key = u?.departmentKey || u?.selectedDepartmentKey;
  if (typeof key !== "string") return undefined;
  const t = key.trim();
  return t ? t : undefined;
}

function isOpenShift(s: any): boolean {
  if (!s) return false;
  if (s.status) return String(s.status).toLowerCase() === "open";
  return s.closedAt == null;
}

function newestOpenShift(shifts: Shift[]): Shift | null {
  const open = shifts.filter(isOpenShift);
  if (!open.length) return null;

  const score = (s: any) => Number(s.openedAt ?? 0);
  open.sort((a: any, b: any) => score(b) - score(a));
  return open[0] ?? null;
}

export function ShiftProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deptKey = useMemo(() => getUserDeptKey(user), [user]);
  const activeShift = useMemo(() => newestOpenShift(shifts), [shifts]);
  const isShiftOpen = Boolean(activeShift);

  const inFlightRef = useRef(false);

  const refresh = async (departmentKey?: string, _force = false) => {
    if (!user) {
      setShifts([]);
      setError(null);
      return;
    }
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const dept = departmentKey?.trim() || deptKey;
      const res = await listShifts(dept);

      if (!res.ok) {
        setShifts([]);
        setError(res.error || "Failed to load shifts");
        return;
      }

      setShifts(Array.isArray(res.shifts) ? res.shifts : []);
    } catch (e: any) {
      setShifts([]);
      setError(e?.message ?? "Failed to load shifts");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  const openForDept = async (departmentKey?: string) => {
    if (!user) return setError("You are not logged in.");

    const key = (departmentKey?.trim() || deptKey || "").trim();
    if (!key) return setError("No department selected.");

    setLoading(true);
    setError(null);

    try {
      const res = await apiOpenShift(key);
      if (!res.ok) return setError(res.error || "Failed to open shift");
      await refresh(key, true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to open shift");
    } finally {
      setLoading(false);
    }
  };

  const submitClose = async (shiftId: string) => {
    if (!user) return setError("You are not logged in.");

    const id = String(shiftId || "").trim();
    if (!id) return setError("Missing shiftId.");

    setLoading(true);
    setError(null);

    try {
      const res = await apiSubmitClosing(id);
      if (!res.ok) return setError(res.error || "Failed to submit closing");
      recordShiftSubmission({
        shiftId: id,
        status: "submitted",
        submittedAt: new Date().toISOString(),
        submittedBy: (user as any)?.employeeId || "staff",
        submissionMode: "manual",
      });
      await refresh(deptKey, true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to submit closing");
    } finally {
      setLoading(false);
    }
  };

  const accountingReview = async (shiftId: string, note: string) => {
    if (!user) return setError("You are not logged in.");

    const id = String(shiftId || "").trim();
    if (!id) return setError("Missing shiftId.");

    setLoading(true);
    setError(null);

    try {
      const res = await apiAccountingReview(id, String(note ?? ""));
      if (!res.ok) return setError(res.error || "Failed to submit accounting review");
      recordShiftSubmission({
        shiftId: id,
        status: "reviewed",
        submittedAt: new Date().toISOString(),
        submittedBy: (user as any)?.employeeId || "accounting",
        submissionMode: "manual",
      });
      await refresh(deptKey, true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to submit accounting review");
    } finally {
      setLoading(false);
    }
  };

  const approveClose = async (shiftId: string) => {
    if (!user) return setError("You are not logged in.");

    const id = String(shiftId || "").trim();
    if (!id) return setError("Missing shiftId.");

    setLoading(true);
    setError(null);

    try {
      const res = await apiApproveClose(id);
      if (!res.ok) return setError(res.error || "Failed to approve closing");
      recordShiftSubmission({
        shiftId: id,
        status: "reviewed",
        submittedAt: new Date().toISOString(),
        submittedBy: (user as any)?.employeeId || "manager",
        submissionMode: "manual",
      });
      await refresh(deptKey, true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to approve closing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setShifts([]);
      setError(null);
      return;
    }
    refresh(deptKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, deptKey]);

  const value: ShiftCtx = {
    shifts,
    activeShift,
    isShiftOpen,
    loading,
    error,
    refresh,
    openForDept,
    submitClose,
    accountingReview,
    approveClose,
  };

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>;
}

export function useShift() {
  const ctx = useContext(ShiftContext);
  if (!ctx) throw new Error("useShift must be used within ShiftProvider");
  return ctx;
}
