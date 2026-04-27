// src/shifts/ClosingSnapshotModal.tsx
import { money } from "./shiftsSummary";
import type { ShiftSummary } from "./shiftsSummary";

export default function ClosingSnapshotModal({
  open,
  onClose,
  onConfirm,
  loading,
  shiftOpenedAt,
  summary,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  shiftOpenedAt?: number;
  summary: ShiftSummary;
}) {
  if (!open) return null;

  const unpaid = summary.unpaidTotal > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 760,
          maxWidth: "100%",
          borderRadius: 18,
          background: "white",
          border: "1px solid rgba(11,42,58,0.12)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid rgba(11,42,58,0.10)" }}>
          <div style={{ fontWeight: 900, fontSize: 18, color: "#0b2a3a" }}>
            Closing Snapshot
          </div>
          <div style={{ marginTop: 6, fontWeight: 800, color: "rgba(11,42,58,0.70)" }}>
            Review totals before you submit closing.
            {shiftOpenedAt ? (
              <span style={{ marginLeft: 8, opacity: 0.8 }}>
                (Shift opened {new Date(shiftOpenedAt).toLocaleString()})
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ padding: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <Card label="Transactions" value={String(summary.count)} />
            <Card label="Gross Total" value={money(summary.grossTotal)} />
            <Card label="Posted to Room" value={money(summary.postedToRoomTotal)} />

            <Card label="Paid Total" value={money(summary.paidTotal)} />
            <Card label="Unpaid Balance" value={money(summary.unpaidTotal)} />
            <Card
              label="Last Sale"
              value={summary.lastSaleAt ? new Date(summary.lastSaleAt).toLocaleTimeString() : "—"}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 900, color: "#0b2a3a" }}>Payment Breakdown</div>
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Pill label="Cash" value={money(summary.byMethod.CASH)} />
              <Pill label="MoMo" value={money(summary.byMethod.MOMO)} />
              <Pill label="Card" value={money(summary.byMethod.CARD)} />
              <Pill label="Transfer" value={money(summary.byMethod.TRANSFER)} />
            </div>
          </div>

          {unpaid ? (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 14,
                background: "rgba(180,38,38,0.10)",
                border: "1px solid rgba(180,38,38,0.18)",
                color: "#8b1f1f",
                fontWeight: 900,
              }}
            >
              Unpaid balance exists. Please settle outstanding transactions before submitting closing.
            </div>
          ) : (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 14,
                background: "rgba(20,140,90,0.10)",
                border: "1px solid rgba(20,140,90,0.18)",
                color: "#0b2a3a",
                fontWeight: 900,
              }}
            >
              Looks good. You can submit closing now.
            </div>
          )}
        </div>

        <div
          style={{
            padding: 16,
            borderTop: "1px solid rgba(11,42,58,0.10)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={!!loading}
            style={{
              border: "1px solid rgba(11,42,58,0.18)",
              cursor: "pointer",
              padding: "10px 12px",
              borderRadius: 12,
              background: "white",
              fontWeight: 900,
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={!!loading || unpaid}
            style={{
              border: "none",
              cursor: unpaid ? "not-allowed" : "pointer",
              padding: "10px 14px",
              borderRadius: 12,
              background: "#0b2a3a",
              color: "white",
              fontWeight: 900,
              opacity: unpaid ? 0.5 : 1,
            }}
          >
            Confirm Submit Closing
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 14,
        border: "1px solid rgba(11,42,58,0.10)",
        background: "rgba(255,255,255,0.75)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(11,42,58,0.65)" }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900, color: "#0b2a3a" }}>
        {value}
      </div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid rgba(11,42,58,0.12)",
        background: "rgba(11,42,58,0.06)",
        fontWeight: 900,
        color: "#0b2a3a",
        fontSize: 12,
      }}
    >
      {label}: <span style={{ marginLeft: 6 }}>{value}</span>
    </div>
  );
}
