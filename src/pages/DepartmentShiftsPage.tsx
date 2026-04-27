// src/pages/DepartmentShiftsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listShifts, openShift, submitClosing, type Shift } from "../shifts/shiftsApi";
import { useAuth } from "../auth/AuthContext";

function fmt(ms?: number) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
}

export default function DepartmentShiftsPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const departmentKey =
    (user as any)?.departmentKey || (user as any)?.selectedDepartmentKey || "";

  const openShiftItem = useMemo(
    () => shifts.find((s) => (s as any).status === "open"),
    [shifts]
  );

  async function refresh() {
    setLoading(true);
    setError(null);

    const res = await listShifts(departmentKey || undefined);
    if (!res.ok) {
      setError(res.error || "Failed to load shifts");
      setShifts([]);
      setLoading(false);
      return;
    }

    setShifts(res.shifts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(user as any)?.employeeId, (user as any)?.role, departmentKey]);

  async function onOpenShift() {
    if (!departmentKey) {
      setError("No department selected for this user.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await openShift(departmentKey);
    if (!res.ok) {
      setError(res.error || "Failed to open shift");
      setLoading(false);
      return;
    }

    await refresh();
    setLoading(false);
  }

  async function onSubmitClosing(shiftId: string) {
    setLoading(true);
    setError(null);

    const res = await submitClosing(shiftId);
    if (!res.ok) {
      setError(res.error || "Failed to submit closing");
      setLoading(false);
      return;
    }

    await refresh();
    setLoading(false);
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Shifts</h2>

      {!user ? (
        <div>
          <p>You are not logged in.</p>
          <Link to="/login">Go to Login</Link>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <div>
              <strong>User:</strong> {(user as any).employeeId} ({(user as any).role})
            </div>
            <div>
              <strong>Department:</strong> {departmentKey || "(none)"}
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: 12, padding: 10, border: "1px solid #f00" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <button onClick={refresh} disabled={loading}>
              Refresh
            </button>

            <button onClick={onOpenShift} disabled={loading || !departmentKey || !!openShiftItem}>
              Open Shift
            </button>

            {openShiftItem && (
              <button onClick={() => onSubmitClosing(openShiftItem.id)} disabled={loading}>
                Submit Closing (Open Shift)
              </button>
            )}
          </div>

          {openShiftItem && (
            <div style={{ marginBottom: 16, padding: 12, border: "1px solid #ccc" }}>
              <div>
                <strong>Open Shift:</strong> {openShiftItem.id}
              </div>
              <div>Status: {(openShiftItem as any).status ?? "-"}</div>
              <div>Opened: {fmt((openShiftItem as any).openedAt)}</div>

              <div style={{ marginTop: 8 }}>
                <Link to={`/app/shift/${openShiftItem.id}/transactions`}>
                  Go to Transactions →
                </Link>
              </div>
            </div>
          )}

          <h3 style={{ marginTop: 0 }}>All Shifts</h3>

          {loading && shifts.length === 0 ? (
            <div>Loading...</div>
          ) : shifts.length === 0 ? (
            <div>No shifts yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {shifts.map((s) => (
                <div key={s.id} style={{ padding: 12, border: "1px solid #ddd" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <strong>{(s as any).departmentKey ?? "-"}</strong> •{" "}
                      {(s as any).status ?? "-"}
                    </div>
                    <Link to={`/app/shift/${s.id}/transactions`}>Transactions</Link>
                  </div>

                  <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6 }}>
                    Opened: {fmt((s as any).openedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
