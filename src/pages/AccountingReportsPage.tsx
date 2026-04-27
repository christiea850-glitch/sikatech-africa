
export default function AccountingReportsPage() {
  return (
    <div style={{ padding: 22 }}>
      <h1 style={{ fontSize: 34, margin: 0 }}>Accounting — Reports</h1>
      <p style={{ opacity: 0.8, marginTop: 6 }}>
        Next: Daily Sales Summary, Income Statement, Cash vs MoMo vs Card, Cash reconciliation.
      </p>

      <div
        style={{
          marginTop: 14,
          background: "rgba(255,255,255,0.75)",
          borderRadius: 16,
          padding: 16,
          border: "1px solid rgba(0,0,0,0.10)",
        }}
      >
        <div style={{ fontWeight: 900 }}>Coming soon</div>
        <div style={{ marginTop: 6, opacity: 0.85 }}>
          We will auto-calculate these from Department Sales + Accounting Expenses.
        </div>
      </div>
    </div>
  );
}
