import { useMemo, useState } from "react";
import { useBusinessSetup } from "../setup/BusinessSetupContext";
import { submitShiftClosing } from "../api/shiftClosingApi";
import { upsertShiftClosingRecord } from "../shifts/shiftClosingStore";

function toNumber(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function ShiftClosingSubmitPage() {
  const businessSetup: any = useBusinessSetup();

  const businessId: number | null =
    typeof businessSetup?.businessId === "number"
      ? businessSetup.businessId
      : typeof businessSetup?.business?.id === "number"
      ? businessSetup.business.id
      : typeof businessSetup?.selectedBusiness?.id === "number"
      ? businessSetup.selectedBusiness.id
      : 1;

  const [cashExpected, setCashExpected] = useState("0");
  const [cashCounted, setCashCounted] = useState("0");
  const [cardTotal, setCardTotal] = useState("0");
  const [momoTotal, setMomoTotal] = useState("0");
  const [expensesTotal, setExpensesTotal] = useState("0");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const variance = useMemo(() => {
    const expected = toNumber(cashExpected);
    const counted = toNumber(cashCounted);
    return counted - expected;
  }, [cashExpected, cashCounted]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    if (!businessId) {
      setErr("Business is not set. Please complete Business Setup first.");
      return;
    }

    setLoading(true);
    try {
      const res = await submitShiftClosing({
        businessId,
        cashExpected: toNumber(cashExpected),
        cashCounted: toNumber(cashCounted),
        cardTotal: toNumber(cardTotal),
        momoTotal: toNumber(momoTotal),
        expensesTotal: toNumber(expensesTotal),
        notes: notes.trim() ? notes.trim() : null,
      });

      upsertShiftClosingRecord({
        id: res.id,
        businessId,
        submittedAt: new Date().toISOString(),
        submittedBy:
          localStorage.getItem("dev_user_id") ||
          localStorage.getItem("dev_role") ||
          "staff",
        submissionMode: "manual",
        status: "submitted",
        cashExpected: toNumber(cashExpected),
        cashCounted: toNumber(cashCounted),
        cardTotal: toNumber(cardTotal),
        momoTotal: toNumber(momoTotal),
        expensesTotal: toNumber(expensesTotal),
        notes: notes.trim() ? notes.trim() : null,
      });

      setMsg(`Submitted! Closing ID: ${res.id}`);

      setCashExpected("0");
      setCashCounted("0");
      setCardTotal("0");
      setMomoTotal("0");
      setExpensesTotal("0");
      setNotes("");
    } catch (e: any) {
      setErr(e?.message || "Failed to submit shift closing");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        Close Shift
      </h2>

      {!businessId && (
        <div
          style={{
            border: "1px solid #f0c36d",
            background: "#fff7e6",
            padding: 12,
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          Business is not set yet. Go to Business Setup and select a business.
        </div>
      )}

      <div
        style={{
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600 }}>Cash Variance</div>
        <div style={{ fontSize: 18 }}>{variance.toFixed(2)}</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Variance = Cash Counted − Cash Expected
        </div>
      </div>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <label>
          Cash Expected
          <input
            type="number"
            step="0.01"
            value={cashExpected}
            onChange={(e) => setCashExpected(e.target.value)}
          />
        </label>

        <label>
          Cash Counted
          <input
            type="number"
            step="0.01"
            value={cashCounted}
            onChange={(e) => setCashCounted(e.target.value)}
          />
        </label>

        <label>
          Card Total
          <input
            type="number"
            step="0.01"
            value={cardTotal}
            onChange={(e) => setCardTotal(e.target.value)}
          />
        </label>

        <label>
          Mobile Money Total
          <input
            type="number"
            step="0.01"
            value={momoTotal}
            onChange={(e) => setMomoTotal(e.target.value)}
          />
        </label>

        <label>
          Expenses Total
          <input
            type="number"
            step="0.01"
            value={expensesTotal}
            onChange={(e) => setExpensesTotal(e.target.value)}
          />
        </label>

        <label>
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </label>

        <button
          disabled={loading || !businessId}
          type="submit"
          style={{ padding: "10px 14px" }}
        >
          {loading ? "Submitting..." : "Submit Closing"}
        </button>

        {msg && <div style={{ color: "green" }}>{msg}</div>}
        {err && <div style={{ color: "crimson" }}>{err}</div>}
      </form>
    </div>
  );
}
