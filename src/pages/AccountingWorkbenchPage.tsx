import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../auth/AuthContext";
import { useSales } from "../sales/SalesContext";
import { useExpenses } from "../expenses/ExpenseContext";
import { useBusinessSetup } from "../setup/BusinessSetupContext";
import { getAllBookings } from "../frontdesk/bookingsStorage";
import { formatDepartmentLabel, normalizeDepartmentKey } from "../lib/departments";
import { useShift } from "../shifts/ShiftContext";
import { formatShiftStatus, resolveShiftTrace, type ShiftTraceStatus } from "../lib/shiftTrace";
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
  transactionTime: string;
  shiftId?: string;
  shiftStatus: ShiftTraceStatus;
  submittedAt?: string;
  submittedBy?: string;
  submissionMode?: string;
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

function cleanBusinessName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function resolveBusinessName(user: unknown, setupBusinessName: string) {
  const userRecord = user && typeof user === "object" ? (user as Record<string, any>) : {};
  const candidates = [
    userRecord.businessName,
    userRecord.business?.name,
    userRecord.business?.businessName,
    setupBusinessName,
  ];
  return candidates.map(cleanBusinessName).find(Boolean) || "Your Business Name";
}

function formatDateTime(value: Date) {
  return value.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateRange(startDate: string, endDate: string) {
  if (startDate && endDate) return `${startDate} to ${endDate}`;
  if (startDate) return `From ${startDate}`;
  if (endDate) return `Through ${endDate}`;
  return "All dates";
}

export default function AccountingWorkbenchPage() {
  const { user } = useAuth();
  const { businessName: setupBusinessName } = useBusinessSetup();
  const { records: salesRecords } = useSales();
  const { records: expenseRecords } = useExpenses();
  const { shifts } = useShift();

  const [reviewVersion, setReviewVersion] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [department, setDepartment] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [source, setSource] = useState("all");
  const [staff, setStaff] = useState("all");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [shiftStatusFilter, setShiftStatusFilter] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("department");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [statementGeneratedAt, setStatementGeneratedAt] = useState(() => new Date());
  const [selectedRecord, setSelectedRecord] = useState<AccountingRow | null>(null);

  const allowed = user?.role === "accounting" || user?.role === "admin";
  const businessName = resolveBusinessName(user, setupBusinessName);

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
      .map((sale) => {
        const trace = resolveShiftTrace(sale as any, shifts);
        return {
          id: `sale:${sale.id}`,
          date: sale.createdAt,
          source: "direct_sale",
          department: normalizeDepartmentKey(sale.deptKey),
          paymentMethod: sale.paymentMethod || "other",
          staff: sale.staffName || sale.staffId || "unknown",
          description: sale.productName || "Sale",
          revenue: Number(sale.total) || 0,
          expense: 0,
          collection: Number(sale.total) || 0,
          roomFolioReceivable: 0,
          guestPayment: 0,
          transactionTime: sale.createdAt,
          shiftId: trace.shiftId,
          shiftStatus: trace.shiftStatus,
          submittedAt: trace.submittedAt,
          submittedBy: trace.submittedBy,
          submissionMode: trace.submissionMode,
        };
      });

    const folioRows: AccountingRow[] = getAllBookings().flatMap((booking) =>
      (booking.folioActivity || [])
        .filter((activity) => activity.type === "charge" || activity.type === "payment")
        .map((activity) => {
          const amount = Number(activity.amount) || 0;
          const isPayment = activity.type === "payment";
          const activityDate = new Date(activity.createdAt).toISOString();
          const trace = resolveShiftTrace(
            {
              ...activity,
              createdAt: activityDate,
              deptKey: "front-desk",
              department: "front-desk",
            },
            shifts
          );
          return {
            id: `folio:${booking.id}:${activity.id}`,
            date: activityDate,
            source: isPayment ? "guest_payment" : "room_folio_charge",
            department: normalizeDepartmentKey("front-desk"),
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
            transactionTime: activityDate,
            shiftId: trace.shiftId,
            shiftStatus: trace.shiftStatus,
            submittedAt: trace.submittedAt,
            submittedBy: trace.submittedBy,
            submissionMode: trace.submissionMode,
          };
        })
    );

    const expenses: AccountingRow[] = (expenseRecords || []).map((expense) => {
      const trace = resolveShiftTrace(expense as any, shifts);
      return {
        id: `expense:${expense.id}`,
        date: expense.createdAt,
        source: "expense",
        department: normalizeDepartmentKey(expense.deptKey),
        paymentMethod: "expense",
        staff: expense.enteredByName || expense.enteredBy || "unknown",
        description: expense.description || expense.category || "Expense",
        revenue: 0,
        expense: Number(expense.amount) || 0,
        collection: 0,
        roomFolioReceivable: 0,
        guestPayment: 0,
        transactionTime: expense.createdAt,
        shiftId: trace.shiftId,
        shiftStatus: trace.shiftStatus,
        submittedAt: trace.submittedAt,
        submittedBy: trace.submittedBy,
        submissionMode: trace.submissionMode,
      };
    });

    return [...directSales, ...folioRows, ...expenses].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [salesRecords, expenseRecords, shifts]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const review = reviewMap.get(row.id);
      const status = review?.status || "unreviewed";
      if (!inRange(row.date, startDate, endDate)) return false;
      if (department !== "all" && row.department !== normalizeDepartmentKey(department)) return false;
      if (paymentMethod !== "all" && row.paymentMethod !== paymentMethod) return false;
      if (source !== "all" && row.source !== source) return false;
      if (staff !== "all" && row.staff !== staff) return false;
      if (reviewStatus !== "all" && status !== reviewStatus) return false;
      if (shiftStatusFilter !== "all" && row.shiftStatus !== shiftStatusFilter) return false;
      return true;
    });
  }, [rows, reviewMap, startDate, endDate, department, paymentMethod, source, staff, reviewStatus, shiftStatusFilter]);

  const summary = useMemo(() => {
    const totals = filtered.reduce(
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

    return {
      ...totals,
      netProfit: totals.revenue - totals.expenses,
    };
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
      "Transaction Time",
      "Source",
      "Department",
      "Payment Method",
      "Staff",
      "Description",
      "Revenue",
      "Expense",
      "Collection",
      "Shift ID",
      "Shift Status",
      "Submitted At",
      "Submitted By",
      "Submission Mode",
      "Review Status",
      "Note",
    ];
    const lines = filtered.map((row) => {
      const review = reviewMap.get(row.id);
      return [
        row.date,
        row.transactionTime,
        sourceLabel(row.source),
        row.department,
        row.paymentMethod,
        row.staff,
        row.description,
        money(row.revenue),
        money(row.expense),
        money(row.collection),
        row.shiftId || "",
        row.shiftStatus,
        row.submittedAt || "",
        row.submittedBy || "",
        row.submissionMode || "",
        review?.status || "unreviewed",
        review?.note || "",
      ].map(csvCell).join(",");
    });
    downloadText("accounting-workbench-records.csv", [header.map(csvCell).join(","), ...lines].join("\n"), "text/csv");
  }

  function exportStatement() {
    const payload = {
      generatedAt: new Date().toISOString(),
      filters: { startDate, endDate, department, paymentMethod, source, staff, reviewStatus, shiftStatusFilter },
      summary: {
        ...summary,
        netProfit: summary.netProfit,
        records: filtered.length,
      },
      groups: groupRows,
    };
    downloadText("accounting-summary.json", JSON.stringify(payload, null, 2), "application/json");
  }

  function printStatement() {
    setStatementGeneratedAt(new Date());
    document.body.classList.add("accounting-statement-printing");
    const clearPrintMode = () => {
      document.body.classList.remove("accounting-statement-printing");
      window.removeEventListener("afterprint", clearPrintMode);
    };
    window.addEventListener("afterprint", clearPrintMode);
    window.setTimeout(() => window.print(), 0);
  }

  const reviewedCount = filtered.filter((r) => reviewMap.get(r.id)?.status === "reviewed").length;
  const flaggedCount = filtered.filter((r) => reviewMap.get(r.id)?.status === "issue").length;
  const dateRangeLabel = formatDateRange(startDate, endDate);
  const departmentFilterLabel = department === "all" ? "All departments" : department;
  const generatedAtLabel = formatDateTime(statementGeneratedAt);
  const groupByLabel = groupBy === "paymentMethod" ? "Payment Method" : groupBy.charAt(0).toUpperCase() + groupBy.slice(1);

  if (!allowed) {
    return <div style={styles.notice}>Accounting Workbench is available to accounting and admin users only.</div>;
  }

  return (
    <div style={styles.page} className="accounting-workbench-page">
      <div className="accounting-screen" style={styles.screenContent}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>Accounting</div>
          <h1 style={styles.title}>Reconciliation Workbench</h1>
          <p style={styles.subtitle}>Review sales, room folios, guest payments, and expenses without changing source records.</p>
        </div>
        <div style={styles.actions}>
          <button style={styles.secondaryBtn} onClick={exportCsv}>Export CSV</button>
          <button style={styles.primaryBtn} onClick={exportStatement}>Export Statement</button>
          <button style={styles.primaryBtn} onClick={printStatement}>Print Statement</button>
        </div>
      </div>

      <div style={styles.summaryGrid}>
        <Metric label="Total Revenue" value={money(summary.revenue)} />
        <Metric label="Total Expenses" value={money(summary.expenses)} />
        <Metric label="Net Profit" value={money(summary.netProfit)} />
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
          <Field label="Department"><Select value={department} onChange={setDepartment} options={["all", ...departments]} labeler={(v) => v === "all" ? "All" : formatDepartmentLabel(v)} /></Field>
          <Field label="Payment Method"><Select value={paymentMethod} onChange={setPaymentMethod} options={["all", ...paymentMethods]} /></Field>
          <Field label="Source / Type"><Select value={source} onChange={setSource} options={["all", "direct_sale", "room_folio_charge", "guest_payment", "expense"]} labeler={(v) => v === "all" ? "All" : sourceLabel(v as SourceType)} /></Field>
          <Field label="Staff"><Select value={staff} onChange={setStaff} options={["all", ...staffOptions]} /></Field>
          <Field label="Review Status"><Select value={reviewStatus} onChange={setReviewStatus} options={["all", "unreviewed", "reviewed", "issue"]} /></Field>
          <Field label="Shift Status"><Select value={shiftStatusFilter} onChange={setShiftStatusFilter} options={["all", "open", "unclosed", "submitted", "reviewed", "auto_submitted"]} labeler={(v) => v === "all" ? "All" : formatShiftStatus(v)} /></Field>
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
                    <Td>{groupBy === "department" ? formatDepartmentLabel(row.label) : row.label}</Td><Td>{row.count}</Td><Td>{money(row.revenue)}</Td><Td>{money(row.expenses)}</Td><Td>{money(row.collections)}</Td><Td>{money(row.net)}</Td>
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
            <Metric label="Reviewed" value={String(reviewedCount)} />
            <Metric label="Flagged" value={String(flaggedCount)} />
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        <h2 style={styles.sectionTitle}>Financial Records</h2>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <Th>Transaction Time</Th><Th>Source</Th><Th>Dept</Th><Th>Method</Th><Th>Staff</Th><Th>Description</Th><Th>Revenue</Th><Th>Expense</Th><Th>Collected</Th><Th>Shift</Th><Th>Review</Th><Th>Note</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const review = reviewMap.get(row.id);
                const status = review?.status || "unreviewed";
                return (
                  <tr
                    key={row.id}
                    style={styles.clickableRow}
                    tabIndex={0}
                    role="button"
                    onClick={() => setSelectedRecord(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedRecord(row);
                      }
                    }}
                  >
                    <Td>{formatDateTime(new Date(row.transactionTime))}</Td>
                    <Td>{sourceLabel(row.source)}</Td>
                    <Td>{formatDepartmentLabel(row.department)}</Td>
                    <Td>{row.paymentMethod}</Td>
                    <Td>{row.staff}</Td>
                    <Td>{row.description}{row.bookingCode ? ` (${row.bookingCode}${row.roomNo ? ` / ${row.roomNo}` : ""})` : ""}</Td>
                    <Td>{money(row.revenue)}</Td>
                    <Td>{money(row.expense)}</Td>
                    <Td>{money(row.collection)}</Td>
                    <Td>{formatShiftStatus(row.shiftStatus)}</Td>
                    <Td><span style={status === "issue" ? styles.badgeDanger : status === "reviewed" ? styles.badgeGood : styles.badgeMuted}>{status}</span></Td>
                    <Td>
                      <input
                        style={styles.noteInput}
                        value={noteDrafts[row.id] ?? review?.note ?? ""}
                        onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Accounting note"
                      />
                    </Td>
                    <Td>
                      <div
                        style={styles.rowActions}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
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

      {selectedRecord && (
        <div style={styles.detailPanel}>
          <div style={styles.detailHeader}>
            <div>
              <h2 style={styles.detailTitle}>Financial Record Details</h2>
              <div style={styles.detailSubtitle}>{sourceLabel(selectedRecord.source)} | {selectedRecord.id}</div>
            </div>
            <button style={styles.secondaryBtn} onClick={() => setSelectedRecord(null)}>Close</button>
          </div>

          <div style={styles.detailGrid}>
            <DetailItem label="Date" value={formatDateTime(new Date(selectedRecord.date))} />
            <DetailItem label="Transaction Time" value={formatDateTime(new Date(selectedRecord.transactionTime))} />
            <DetailItem label="Source / Type" value={sourceLabel(selectedRecord.source)} />
            <DetailItem label="Department" value={formatDepartmentLabel(selectedRecord.department)} />
            <DetailItem label="Payment Method" value={selectedRecord.paymentMethod} />
            <DetailItem label="Staff" value={selectedRecord.staff} />
            <DetailItem label="Description" value={selectedRecord.description} />
            <DetailItem label="Revenue" value={money(selectedRecord.revenue)} />
            <DetailItem label="Expense" value={money(selectedRecord.expense)} />
            <DetailItem label="Collected" value={money(selectedRecord.collection)} />
            <DetailItem label="Booking Code" value={selectedRecord.bookingCode || "-"} />
            <DetailItem label="Room Number" value={selectedRecord.roomNo || "-"} />
            <DetailItem label="Shift ID" value={selectedRecord.shiftId || "-"} />
            <DetailItem label="Shift Status" value={formatShiftStatus(selectedRecord.shiftStatus)} />
            <DetailItem label="Submitted At" value={selectedRecord.submittedAt ? formatDateTime(new Date(selectedRecord.submittedAt)) : "-"} />
            <DetailItem label="Submitted By" value={selectedRecord.submittedBy || "-"} />
            <DetailItem label="Submission Mode" value={selectedRecord.submissionMode || "-"} />
            <DetailItem label="Review Status" value={reviewMap.get(selectedRecord.id)?.status || "unreviewed"} />
            <DetailItem label="Accounting Note" value={noteDrafts[selectedRecord.id] ?? reviewMap.get(selectedRecord.id)?.note ?? "-"} wide />
          </div>
        </div>
      )}
      </div>

      <section className="accounting-print-statement" style={styles.printStatement} aria-label="Printable financial statement">
        <div style={styles.printHeader}>
          <div>
            <h1 style={styles.printBusinessName}>{businessName}</h1>
            <div style={styles.printTitle}>Financial Reconciliation Statement</div>
          </div>
          <div style={styles.printMeta}>
            <div><strong>Date Range:</strong> {dateRangeLabel}</div>
            <div><strong>Department:</strong> {departmentFilterLabel}</div>
            <div><strong>Generated:</strong> {generatedAtLabel}</div>
          </div>
        </div>

        <div style={styles.printSummaryGrid}>
          <PrintMetric label="Total Revenue" value={money(summary.revenue)} />
          <PrintMetric label="Total Expenses" value={money(summary.expenses)} />
          <PrintMetric label="Net Profit" value={money(summary.netProfit)} />
          <PrintMetric label="Cash Collected" value={money(summary.cash)} />
          <PrintMetric label="MoMo Collected" value={money(summary.momo)} />
          <PrintMetric label="Card Collected" value={money(summary.card)} />
          <PrintMetric label="Transfer Collected" value={money(summary.transfer)} />
          <PrintMetric label="Room Folio Receivables" value={money(summary.roomFolioReceivables)} />
          <PrintMetric label="Guest Payments Collected" value={money(summary.guestPayments)} />
        </div>

        <StatementSection title={`Grouped Summary by ${groupByLabel}`}>
          <table style={styles.printTable}>
            <thead><tr><PrintTh>Group</PrintTh><PrintTh>Count</PrintTh><PrintTh>Revenue</PrintTh><PrintTh>Expenses</PrintTh><PrintTh>Collections</PrintTh><PrintTh>Net</PrintTh></tr></thead>
            <tbody>
              {groupRows.map((row) => (
                <tr key={row.label}>
                  <PrintTd>{groupBy === "department" ? formatDepartmentLabel(row.label) : row.label}</PrintTd>
                  <PrintTd>{row.count}</PrintTd>
                  <PrintTd>{money(row.revenue)}</PrintTd>
                  <PrintTd>{money(row.expenses)}</PrintTd>
                  <PrintTd>{money(row.collections)}</PrintTd>
                  <PrintTd>{money(row.net)}</PrintTd>
                </tr>
              ))}
            </tbody>
          </table>
        </StatementSection>

        <StatementSection title="Detailed Financial Records">
          <table style={styles.printTable}>
            <thead>
              <tr>
                <PrintTh>Transaction Time</PrintTh><PrintTh>Source / Type</PrintTh><PrintTh>Department</PrintTh><PrintTh>Payment Method</PrintTh><PrintTh>Staff</PrintTh><PrintTh>Description</PrintTh><PrintTh>Revenue</PrintTh><PrintTh>Expense</PrintTh><PrintTh>Collected</PrintTh><PrintTh>Shift Status</PrintTh><PrintTh>Review Status</PrintTh><PrintTh>Note</PrintTh>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const review = reviewMap.get(row.id);
                return (
                  <tr key={row.id}>
                    <PrintTd>{formatDateTime(new Date(row.transactionTime))}</PrintTd>
                    <PrintTd>{sourceLabel(row.source)}</PrintTd>
                    <PrintTd>{formatDepartmentLabel(row.department)}</PrintTd>
                    <PrintTd>{row.paymentMethod}</PrintTd>
                    <PrintTd>{row.staff}</PrintTd>
                    <PrintTd>{row.description}{row.bookingCode ? ` (${row.bookingCode}${row.roomNo ? ` / ${row.roomNo}` : ""})` : ""}</PrintTd>
                    <PrintTd>{money(row.revenue)}</PrintTd>
                    <PrintTd>{money(row.expense)}</PrintTd>
                    <PrintTd>{money(row.collection)}</PrintTd>
                    <PrintTd>{formatShiftStatus(row.shiftStatus)}</PrintTd>
                    <PrintTd>{review?.status || "unreviewed"}</PrintTd>
                    <PrintTd>{review?.note || ""}</PrintTd>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </StatementSection>

        <StatementSection title="Review Summary">
          <div style={styles.printReviewGrid}>
            <PrintMetric label="Total Filtered Records" value={String(filtered.length)} />
            <PrintMetric label="Reviewed" value={String(reviewedCount)} />
            <PrintMetric label="Flagged" value={String(flaggedCount)} />
          </div>
        </StatementSection>
      </section>
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

function DetailItem({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={{ ...styles.detailItem, ...(wide ? styles.detailItemWide : {}) }}>
      <div style={styles.detailLabel}>{label}</div>
      <div style={styles.detailValue}>{value || "-"}</div>
    </div>
  );
}

function StatementSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={styles.printSection}>
      <h2 style={styles.printSectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function PrintMetric({ label, value }: { label: string; value: string }) {
  return <div style={styles.printMetric}><div style={styles.printMetricLabel}>{label}</div><div style={styles.printMetricValue}>{value}</div></div>;
}

function PrintTh({ children }: { children: React.ReactNode }) {
  return <th style={styles.printTh}>{children}</th>;
}

function PrintTd({ children }: { children: React.ReactNode }) {
  return <td style={styles.printTd}>{children}</td>;
}

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: 18 },
  screenContent: { display: "grid", gap: 18 },
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
  clickableRow: { cursor: "pointer" },
  reviewStats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 },
  noteInput: { minWidth: 180, padding: "8px 9px", borderRadius: 8, border: "1px solid rgba(15,23,42,0.14)" },
  rowActions: { display: "flex", gap: 6, flexWrap: "wrap" },
  smallBtn: { border: "1px solid rgba(15,23,42,0.14)", background: "#fff", color: "#111827", borderRadius: 7, padding: "7px 9px", fontWeight: 800, cursor: "pointer" },
  warnBtn: { border: "1px solid rgba(180,38,38,0.18)", background: "rgba(180,38,38,0.08)", color: "#991b1b", borderRadius: 7, padding: "7px 9px", fontWeight: 800, cursor: "pointer" },
  badgeGood: { color: "#047857", background: "rgba(4,120,87,0.10)", borderRadius: 999, padding: "4px 8px", fontWeight: 900 },
  badgeDanger: { color: "#b91c1c", background: "rgba(185,28,28,0.10)", borderRadius: 999, padding: "4px 8px", fontWeight: 900 },
  badgeMuted: { color: "#475569", background: "rgba(71,85,105,0.10)", borderRadius: 999, padding: "4px 8px", fontWeight: 900 },
  notice: { padding: 16, borderRadius: 10, background: "rgba(185,28,28,0.08)", color: "#991b1b", fontWeight: 900 },
  detailPanel: { padding: 16, border: "1px solid rgba(15,23,42,0.10)", borderRadius: 10, background: "#fff", boxShadow: "0 8px 20px rgba(15,23,42,0.04)" },
  detailHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 },
  detailTitle: { margin: 0, color: "#111827", fontSize: 18, fontWeight: 900 },
  detailSubtitle: { marginTop: 4, color: "#64748b", fontSize: 12, fontWeight: 800 },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 },
  detailItem: { padding: 12, border: "1px solid rgba(15,23,42,0.08)", borderRadius: 8, background: "#f8fafc" },
  detailItemWide: { gridColumn: "1 / -1" },
  detailLabel: { color: "#64748b", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.3 },
  detailValue: { marginTop: 5, color: "#111827", fontSize: 14, fontWeight: 800, overflowWrap: "anywhere" },
  printStatement: { display: "none", color: "#111827", background: "#fff" },
  printHeader: { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", borderBottom: "2px solid #111827", paddingBottom: 18, marginBottom: 18 },
  printBusinessName: { margin: 0, fontSize: 28, color: "#111827", lineHeight: 1.15 },
  printTitle: { marginTop: 6, fontSize: 16, fontWeight: 900, color: "#334155" },
  printMeta: { display: "grid", gap: 4, fontSize: 11, color: "#334155", textAlign: "right" },
  printSummaryGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 },
  printMetric: { border: "1px solid #cbd5e1", padding: "8px 10px", borderRadius: 4, breakInside: "avoid" },
  printMetricLabel: { color: "#475569", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.3 },
  printMetricValue: { marginTop: 3, color: "#111827", fontSize: 15, fontWeight: 900 },
  printSection: { marginTop: 18, breakInside: "avoid" },
  printSectionTitle: { margin: "0 0 8px", color: "#111827", fontSize: 14, fontWeight: 900 },
  printTable: { width: "100%", borderCollapse: "collapse", border: "1px solid #cbd5e1", fontSize: 9 },
  printTh: { textAlign: "left", padding: "6px 5px", border: "1px solid #cbd5e1", background: "#f1f5f9", color: "#111827", fontSize: 8, textTransform: "uppercase" },
  printTd: { padding: "5px", border: "1px solid #e2e8f0", color: "#111827", verticalAlign: "top", fontSize: 8, lineHeight: 1.25 },
  printReviewGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 },
};
