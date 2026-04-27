import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../auth/AuthContext";
import { useSales } from "../sales/SalesContext";
import { useExpenses } from "../expenses/ExpenseContext";
import { getAllBookings } from "../frontdesk/bookingsStorage";
import {
  loadAccountingWorkbenchReviews,
  upsertAccountingWorkbenchReview,
  type AccountingReviewStatus,
} from "../accounting/accountingWorkbenchStorage";

type SourceType = "direct_sale" | "room_folio_charge" | "guest_payment" | "expense";
type GroupBy = "department" | "paymentMethod" | "staff" | "date" | "source";

type AccountingRow = {
  id: string;
  date: string;
  source: SourceType;
  department: string;
  paymentMethod: string;
  staff: string;
  description: string;
  revenue: number;
  expense: number;
  collection: number;
  roomFolioReceivable: number;
  guestPayment: number;
  bookingCode?: string;
  roomNo?: string;
};

function money(n: number) {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function lower(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function dateOnly(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function inRange(value: string, start: string, end: string) {
  if (!start && !end) return true;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const s = start ? new Date(`${start}T00:00:00`) : null;
  const e = end ? new Date(`${end}T00:00:00`) : null;
  if (e) e.setDate(e.getDate() + 1);
  if (s && d < s) return false;
  if (e && d >= e) return false;
  return true;
}

function sourceLabel(source: SourceType) {
  if (source === "direct_sale") return "Direct Sale";
  if (source === "room_folio_charge") return "Room Folio Charge";
  if (source === "guest_payment") return "Guest Payment";
  return "Expense";
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function AccountingWorkbenchPage() {
  const { user } = useAuth();
  const { records: salesRecords } = useSales();
  const { records: expenseRecords } = useExpenses();

  const [reviewVersion, setReviewVersion] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [department, setDepartment] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [source, setSource] = useState("all");
  const [staff, setStaff] = useState("all");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("department");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const allowed = user?.role === "accounting" || user?.role === "admin";

  const reviews = useMemo(() => {
    void reviewVersion;
    return loadAccountingWorkbenchReviews();
  }, [reviewVersion]);

  const reviewMap = useMemo(() => {
    return new Map(reviews.map((item) => [item.recordId, item]));
  }, [reviews]);

  const rows = useMemo<AccountingRow[]>(() => {
    const directSales: AccountingRow[] = (salesRecords || [])
      .filter(
        (sale) =>
          lower(sale.paymentMode) !== "post_to_room" &&
          lower(sale.paymentMethod) !== "room_folio"
      )
      .map((sale) => ({
        id: `sale:${sale.id}`,
        date: sale.createdAt,
        source: "direct_sale",
        department: sale.deptKey || "unknown",
        paymentMethod: sale.paymentMethod || "other",
        staff: sale.staffName || sale.staffId || "unknown",
        description: sale.productName || "Sale",
        revenue: Number(sale.total) || 0,
        expense: 0,
        collection: Number(sale.total) || 0,
        roomFolioReceivable: 0,
        guestPayment: 0,
      }));

    const folioRows: AccountingRow[] = getAllBookings().flatMap((booking) =>
      (booking.folioActivity || [])
        .filter((activity) => activity.type === "charge" || activity.type === "payment")
        .map((activity) => {
          const amount = Number(activity.amount) || 0;
          const isPayment = activity.type === "payment";
          return {
            id: `folio:${booking.id}:${activity.id}`,
            date: new Date(activity.createdAt).toISOString(),
            source: isPayment ? "guest_payment" : "room_folio_charge",
            department: "front-desk",
            paymentMethod: isPayment ? activity.paymentMethod || "other" : "room_folio",
            staff: "Front Desk",
            description: activity.title || sourceLabel(isPayment ? "guest_payment" : "room_folio_charge"),
            revenue: isPayment ? 0 : amount,
            expense: 0,
            collection: isPayment ? amount : 0,
            roomFolioReceivable: isPayment ? 0 : amount,
            guestPayment: isPayment ? amount : 0,
            bookingCode: booking.bookingCode,
            roomNo: booking.roomNo,
          };
        })
    );

    const expenses: AccountingRow[] = (expenseRecords || []).map((expense) => ({
      id: `expense:${expense.id}`,
      date: expense.createdAt,
      source: "expense",
      department: expense.deptKey || "unknown",
      paymentMethod: "expense",
      staff: expense.enteredByName || expense.enteredBy || "unknown",
      description: expense.description || expense.category || "Expense",
      revenue: 0,
      expense: Number(expense.amount) || 0,
      collection: 0,
      roomFolioReceivable: 0,
      guestPayment: 0,
    }));

    return [...directSales, ...folioRows, ...expenses].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [salesRecords, expenseRecords]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const review = reviewMap.get(row.id);
      const status = review?.status || "unreviewed";
      if (!inRange(row.date, startDate, endDate)) return false;
      if (department !== "all" && row.department !== department) return false;
      if (paymentMethod !== "all" && row.paymentMethod !== paymentMethod) return false;
      if (source !== "all" && row.source !== source) return false;
      if (staff !== "all" && row.staff !== staff) return false;
      if (reviewStatus !== "all" && status !== reviewStatus) return false;
      return true;
    });
  }, [rows, reviewMap, startDate, endDate, department, paymentMethod, source, staff, reviewStatus]);

  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, row) => {
        acc.revenue += row.revenue;
        acc.expenses += row.expense;
        acc.collections += row.collection;
        acc.roomFolioReceivables += row.roomFolioReceivable;
        acc.guestPayments += row.guestPayment;
        if (row.paymentMethod === "cash") acc.cash += row.collection;
        if (row.paymentMethod === "momo") acc.momo += row.collection;
        if (row.paymentMethod === "card") acc.card += row.collection;
        if (row.paymentMethod === "bank_transfer" || row.paymentMethod === "transfer") {
          acc.transfer += row.collection;
        }
        return acc;
      },
      {
        revenue: 0,
        expenses: 0,
        collections: 0,
        cash: 0,
        momo: 0,
        card: 0,
        transfer: 0,
        roomFolioReceivables: 0,
        guestPayments: 0,
      }
    );
  }, [filtered]);

  const groupRows = useMemo(() => {
    const map = new Map<string, { label: string; count: number; revenue: number; expenses: number; net: number; collections: number }>();

    filtered.forEach((row) => {
      const key =
        groupBy === "department"
          ? row.department
          : groupBy === "paymentMethod"
          ? row.paymentMethod
          : groupBy === "staff"
          ? row.staff
          : groupBy === "date"
          ? dateOnly(row.date)
          : row.source;

      const current = map.get(key) || {
        label: groupBy === "source" ? sourceLabel(key as SourceType) : key || "unknown",
        count: 0,
        revenue: 0,
        expenses: 0,
        net: 0,
        collections: 0,
      };
      current.count += 1;
      current.revenue += row.revenue;
      current.expenses += row.expense;
      current.collections += row.collection;
      current.net = current.revenue - current.expenses;
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [filtered, groupBy]);

  const departments = Array.from(new Set(rows.map((row) => row.department))).sort();
  const paymentMethods = Array.from(new Set(rows.map((row) => row.paymentMethod))).sort();
  const staffOptions = Array.from(new Set(rows.map((row) => row.staff))).sort();

  function updateReview(row: AccountingRow, status: AccountingReviewStatus) {
    upsertAccountingWorkbenchReview({
      recordId: row.id,
      status,
      note: noteDrafts[row.id] ?? reviewMap.get(row.id)?.note,
    });
    setReviewVersion((v) => v + 1);
  }

  function saveNote(row: AccountingRow) {
    upsertAccountingWorkbenchReview({
      recordId: row.id,
      status: reviewMap.get(row.id)?.status || "unreviewed",
      note: noteDrafts[row.id] ?? "",
    });
    setReviewVersion((v) => v + 1);
  }

  function exportCsv() {
    const header = [
      "Date",
      "Source",
      "Department",
      "Payment Method",
      "Staff",
      "Description",
      "Revenue",
      "Expense",
      "Collection",
      "Review Status",
      "Note",
    ];
    const lines = filtered.map((row) => {
      const review = reviewMap.get(row.id);
      return [
        row.date,
        sourceLabel(row.source),
        row.department,
        row.paymentMethod,
        row.staff,
        row.description,
        money(row.revenue),
        money(row.expense),
        money(row.collection),
        review?.status || "unreviewed",
        review?.note || "",
      ].map(csvCell).join(",");
    });
    downloadText("accounting-workbench-records.csv", [header.map(csvCell).join(","), ...lines].join("\n"), "text/csv");
  }

  function exportStatement() {
    const payload = {
      generatedAt: new Date().toISOString(),
      filters: { startDate, endDate, department, paymentMethod, source, staff, reviewStatus },
      summary: {
        ...summary,
        netProfit: summary.revenue - summary.expenses,
        records: filtered.length,
      },
      groups: groupRows,
    };
    downloadText("accounting-summary.json", JSON.stringify(payload, null, 2), "application/json");
  }

  if (!allowed) {
    return <div style={styles.notice}>Accounting Workbench is available to accounting and admin users only.</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>Accounting</div>
          <h1 style={styles.title}>Reconciliation Workbench</h1>
          <p style={styles.subtitle}>Review sales, room folios, guest payments, and expenses without changing source records.</p>
        </div>
        <div style={styles.actions}>
          <button style={styles.secondaryBtn} onClick={exportCsv}>Export CSV</button>
          <button style={styles.primaryBtn} onClick={exportStatement}>Export Statement</button>
        </div>
      </div>

      <div style={styles.summaryGrid}>
        <Metric label="Total Revenue" value={money(summary.revenue)} />
        <Metric label="Total Expenses" value={money(summary.expenses)} />
        <Metric label="Net Profit" value={money(summary.revenue - summary.expenses)} />
        <Metric label="Total Cash" value={money(summary.cash)} />
        <Metric label="Total MoMo" value={money(summary.momo)} />
        <Metric label="Total Card" value={money(summary.card)} />
        <Metric label="Total Transfer" value={money(summary.transfer)} />
        <Metric label="Room Folio Receivables" value={money(summary.roomFolioReceivables)} />
        <Metric label="Guest Payments Collected" value={money(summary.guestPayments)} />
      </div>

      <div style={styles.panel}>
        <div style={styles.filterGrid}>
          <Field label="Start Date"><input type="date" style={styles.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="End Date"><input type="date" style={styles.input} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
          <Field label="Department"><Select value={department} onChange={setDepartment} options={["all", ...departments]} /></Field>
          <Field label="Payment Method"><Select value={paymentMethod} onChange={setPaymentMethod} options={["all", ...paymentMethods]} /></Field>
          <Field label="Source / Type"><Select value={source} onChange={setSource} options={["all", "direct_sale", "room_folio_charge", "guest_payment", "expense"]} labeler={(v) => v === "all" ? "All" : sourceLabel(v as SourceType)} /></Field>
          <Field label="Staff"><Select value={staff} onChange={setStaff} options={["all", ...staffOptions]} /></Field>
          <Field label="Review Status"><Select value={reviewStatus} onChange={setReviewStatus} options={["all", "unreviewed", "reviewed", "issue"]} /></Field>
          <Field label="Group By"><Select value={groupBy} onChange={(v) => setGroupBy(v as GroupBy)} options={["department", "paymentMethod", "staff", "date", "source"]} /></Field>
        </div>
      </div>

      <div style={styles.grid2}>
        <div style={styles.panel}>
          <h2 style={styles.sectionTitle}>Grouped Summary</h2>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead><tr><Th>Group</Th><Th>Count</Th><Th>Revenue</Th><Th>Expenses</Th><Th>Collections</Th><Th>Net</Th></tr></thead>
              <tbody>
                {groupRows.map((row) => (
                  <tr key={row.label}>
                    <Td>{row.label}</Td><Td>{row.count}</Td><Td>{money(row.revenue)}</Td><Td>{money(row.expenses)}</Td><Td>{money(row.collections)}</Td><Td>{money(row.net)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={styles.panel}>
          <h2 style={styles.sectionTitle}>Review Status</h2>
          <div style={styles.reviewStats}>
            <Metric label="Filtered Records" value={String(filtered.length)} />
            <Metric label="Reviewed" value={String(filtered.filter((r) => reviewMap.get(r.id)?.status === "reviewed").length)} />
            <Metric label="Flagged" value={String(filtered.filter((r) => reviewMap.get(r.id)?.status === "issue").length)} />
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        <h2 style={styles.sectionTitle}>Financial Records</h2>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <Th>Date</Th><Th>Source</Th><Th>Dept</Th><Th>Method</Th><Th>Staff</Th><Th>Description</Th><Th>Revenue</Th><Th>Expense</Th><Th>Collected</Th><Th>Review</Th><Th>Note</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const review = reviewMap.get(row.id);
                const status = review?.status || "unreviewed";
                return (
                  <tr key={row.id}>
                    <Td>{new Date(row.date).toLocaleDateString()}</Td>
                    <Td>{sourceLabel(row.source)}</Td>
                    <Td>{row.department}</Td>
                    <Td>{row.paymentMethod}</Td>
                    <Td>{row.staff}</Td>
                    <Td>{row.description}{row.bookingCode ? ` (${row.bookingCode}${row.roomNo ? ` / ${row.roomNo}` : ""})` : ""}</Td>
                    <Td>{money(row.revenue)}</Td>
                    <Td>{money(row.expense)}</Td>
                    <Td>{money(row.collection)}</Td>
                    <Td><span style={status === "issue" ? styles.badgeDanger : status === "reviewed" ? styles.badgeGood : styles.badgeMuted}>{status}</span></Td>
                    <Td>
                      <input
                        style={styles.noteInput}
                        value={noteDrafts[row.id] ?? review?.note ?? ""}
                        onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        placeholder="Accounting note"
                      />
                    </Td>
                    <Td>
                      <div style={styles.rowActions}>
                        <button style={styles.smallBtn} onClick={() => updateReview(row, "reviewed")}>Reviewed</button>
                        <button style={styles.warnBtn} onClick={() => updateReview(row, "issue")}>Flag</button>
                        <button style={styles.smallBtn} onClick={() => saveNote(row)}>Save Note</button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div style={styles.metric}><div style={styles.metricLabel}>{label}</div><div style={styles.metricValue}>{value}</div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={styles.field}><span style={styles.label}>{label}</span>{children}</label>;
}

function Select({ value, onChange, options, labeler }: { value: string; onChange: (value: string) => void; options: string[]; labeler?: (value: string) => string }) {
  return <select style={styles.input} value={value} onChange={(e) => onChange(e.target.value)}>{options.map((option) => <option key={option} value={option}>{labeler ? labeler(option) : option === "all" ? "All" : option}</option>)}</select>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={styles.th}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={styles.td}>{children}</td>;
}

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: 18 },
  header: { display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" },
  eyebrow: { color: "#64748b", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 },
  title: { margin: "4px 0 0", color: "#111827", fontSize: 28 },
  subtitle: { margin: "6px 0 0", color: "#64748b", fontWeight: 600 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  primaryBtn: { border: "none", background: "#111827", color: "#fff", borderRadius: 8, padding: "10px 14px", fontWeight: 800, cursor: "pointer" },
  secondaryBtn: { border: "1px solid rgba(15,23,42,0.14)", background: "#fff", color: "#111827", borderRadius: 8, padding: "10px 14px", fontWeight: 800, cursor: "pointer" },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 },
  metric: { padding: 14, border: "1px solid rgba(15,23,42,0.08)", borderRadius: 10, background: "#fff", boxShadow: "0 8px 20px rgba(15,23,42,0.04)" },
  metricLabel: { color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 },
  metricValue: { marginTop: 8, color: "#111827", fontSize: 22, fontWeight: 900 },
  panel: { padding: 16, border: "1px solid rgba(15,23,42,0.08)", borderRadius: 10, background: "#fff" },
  filterGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 },
  field: { display: "grid", gap: 6 },
  label: { color: "#334155", fontSize: 13, fontWeight: 800 },
  input: { width: "100%", padding: "10px 11px", borderRadius: 8, border: "1px solid rgba(15,23,42,0.14)", background: "#fff" },
  grid2: { display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 12 },
  sectionTitle: { margin: "0 0 12px", color: "#111827", fontSize: 18, fontWeight: 900 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0 },
  th: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(15,23,42,0.12)", color: "#64748b", fontSize: 12, textTransform: "uppercase", whiteSpace: "nowrap" },
  td: { padding: "10px 8px", borderBottom: "1px solid rgba(15,23,42,0.08)", color: "#111827", fontSize: 13, fontWeight: 650, verticalAlign: "top", whiteSpace: "nowrap" },
  reviewStats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 },
  noteInput: { minWidth: 180, padding: "8px 9px", borderRadius: 8, border: "1px solid rgba(15,23,42,0.14)" },
  rowActions: { display: "flex", gap: 6, flexWrap: "wrap" },
  smallBtn: { border: "1px solid rgba(15,23,42,0.14)", background: "#fff", color: "#111827", borderRadius: 7, padding: "7px 9px", fontWeight: 800, cursor: "pointer" },
  warnBtn: { border: "1px solid rgba(180,38,38,0.18)", background: "rgba(180,38,38,0.08)", color: "#991b1b", borderRadius: 7, padding: "7px 9px", fontWeight: 800, cursor: "pointer" },
  badgeGood: { color: "#047857", background: "rgba(4,120,87,0.10)", borderRadius: 999, padding: "4px 8px", fontWeight: 900 },
  badgeDanger: { color: "#b91c1c", background: "rgba(185,28,28,0.10)", borderRadius: 999, padding: "4px 8px", fontWeight: 900 },
  badgeMuted: { color: "#475569", background: "rgba(71,85,105,0.10)", borderRadius: 999, padding: "4px 8px", fontWeight: 900 },
  notice: { padding: 16, borderRadius: 10, background: "rgba(185,28,28,0.08)", color: "#991b1b", fontWeight: 900 },
};
