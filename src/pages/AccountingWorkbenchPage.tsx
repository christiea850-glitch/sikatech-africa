import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../auth/AuthContext";
import { useSales } from "../sales/SalesContext";
import { useExpenses } from "../expenses/ExpenseContext";
import { useBusinessSetup } from "../setup/BusinessSetupContext";
import { BOOKINGS_CHANGED_EVENT, getAllBookings } from "../frontdesk/bookingsStorage";
import { formatDepartmentLabel, normalizeDepartmentKey } from "../lib/departments";
import { useShift } from "../shifts/ShiftContext";
import { formatShiftStatus, recordShiftSubmission, resolveShiftTrace, SHIFT_TRACE_CHANGED_EVENT, type ShiftTraceStatus } from "../lib/shiftTrace";
import {
  loadShiftClosings,
  reviewShiftClosing,
  SHIFT_CLOSINGS_CHANGED_EVENT,
  syncShiftClosingsFromShifts,
  type ShiftClosingRecord,
} from "../shifts/shiftClosingStore";
import {
  loadAccountingWorkbenchReviews,
  upsertAccountingWorkbenchReview,
  type AccountingReviewStatus,
} from "../accounting/accountingWorkbenchStorage";
import {
  ACCOUNTING_DATE_RANGE_CHANGED_EVENT,
  loadAccountingDateRange,
  saveAccountingDateRange,
} from "../accounting/accountingDateRangeStorage";

type SourceType =
  | "room_booking_revenue"
  | "room_folio_charge"
  | "food_service_sale"
  | "department_pos_sale"
  | "guest_payment"
  | "cash_desk_closing"
  | "expense";
type GroupBy = "department" | "paymentMethod" | "staff" | "date" | "source";
type DetailTab = "overview" | "transaction" | "shift" | "review";
type WorkbenchTab = "overview" | "unclosed" | "closings" | "records" | "review";
type ClosingReviewAction = "approved" | "rejected";
type PaymentState = "unpaid" | "partial" | "paid";
type UnclosedShiftPriority = "high" | "medium" | "low";
type UnclosedShiftAction = "review" | "reconcile" | "close";
type UnclosedShiftAlert = {
  key: string;
  shiftId?: string;
  staffName: string;
  department: string;
  shiftDate: string;
  transactionCount: number;
  totalCollected: number;
  status: ShiftTraceStatus;
  priority: UnclosedShiftPriority;
};

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
  paymentState?: PaymentState;
  transactionTime: string;
  shiftId?: string;
  shiftStatus: ShiftTraceStatus;
  submittedAt?: string;
  submittedBy?: string;
  submissionMode?: string;
  closingStatus?: string;
  closingCashExpected?: number;
  closingCashCounted?: number;
  closingCardTotal?: number;
  closingMomoTotal?: number;
  closingTransferTotal?: number;
  closingExpensesTotal?: number;
  closingAccountingStatus?: string;
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
  const e = end ? new Date(`${end}T23:59:59.999`) : null;
  if (s && d < s) return false;
  if (e && d > e) return false;
  return true;
}

function sourceLabel(source: SourceType) {
  if (source === "room_booking_revenue") return "Room Booking Revenue";
  if (source === "room_folio_charge") return "Room Folio Charges";
  if (source === "food_service_sale") return "Food & Service Sales";
  if (source === "department_pos_sale") return "Department POS Sales";
  if (source === "guest_payment") return "Guest Payments / Collections";
  if (source === "cash_desk_closing") return "Cash Desk Closing";
  return "Expense";
}

function directSaleSource(departmentKey: string): SourceType {
  return normalizeDepartmentKey(departmentKey) === "front-desk"
    ? "food_service_sale"
    : "department_pos_sale";
}

function roomBookingBaseRevenue(booking: any) {
  const folioCharges = (booking.folioActivity || [])
    .filter((activity: any) => activity.type === "charge")
    .reduce((sum: number, activity: any) => sum + (Number(activity.amount) || 0), 0);

  return Math.max(0, (Number(booking.totalAmount) || 0) - folioCharges);
}

function normalizePaymentState(value: unknown): PaymentState | undefined {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "paid") return "paid";
  if (raw === "partial" || raw === "partially_paid" || raw === "partially-paid") return "partial";
  if (raw === "unpaid") return "unpaid";
  return undefined;
}

function paymentStateLabel(value?: PaymentState) {
  if (value === "partial") return "Partially Paid";
  if (value === "paid") return "Paid";
  return "Unpaid";
}

function closingStatusLabel(value?: string) {
  const raw = String(value || "").trim();
  if (!raw) return "Pending";

  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function shiftStatusFromClosing(status: string): ShiftTraceStatus {
  if (status === "auto_submitted") return "auto_submitted";
  if (status === "pending") return "submitted";
  return "reviewed";
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

const RESOLVED_UNCLOSED_ALERTS_KEY = "sikatech_resolved_unclosed_shift_alerts_v1";

function loadResolvedUnclosedAlerts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESOLVED_UNCLOSED_ALERTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function saveResolvedUnclosedAlerts(keys: string[]) {
  try {
    localStorage.setItem(RESOLVED_UNCLOSED_ALERTS_KEY, JSON.stringify(keys));
  } catch {
    // Alert resolution should never block accounting review.
  }
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

function formatDateHeader(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "Unknown date";
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "2-digit" });
}

function resolveUnclosedPriority(alert: Pick<UnclosedShiftAlert, "shiftDate" | "totalCollected" | "transactionCount" | "status">): UnclosedShiftPriority {
  const date = new Date(`${alert.shiftDate}T00:00:00`).getTime();
  const ageDays = Number.isFinite(date) ? Math.floor((Date.now() - date) / 86_400_000) : 0;
  if (alert.totalCollected > 0 && (alert.status === "unclosed" || alert.status === "auto_submitted")) return "high";
  if (ageDays > 5 || alert.transactionCount === 0) return "low";
  return "medium";
}

function priorityLabel(priority: UnclosedShiftPriority) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export default function AccountingWorkbenchPage() {
  const { user } = useAuth();
  const { businessName: setupBusinessName } = useBusinessSetup();
  const { records: salesRecords } = useSales();
  const { records: expenseRecords } = useExpenses();
  const { shifts } = useShift();

  const [reviewVersion, setReviewVersion] = useState(0);
  const [traceVersion, setTraceVersion] = useState(0);
  const [bookingVersion, setBookingVersion] = useState(0);
  const [closingVersion, setClosingVersion] = useState(0);
  const [resolvedUnclosedAlerts, setResolvedUnclosedAlerts] = useState<string[]>(() => loadResolvedUnclosedAlerts());
  const [dateRange, setDateRange] = useState(() => loadAccountingDateRange());
  const [department, setDepartment] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [source, setSource] = useState("all");
  const [staff, setStaff] = useState("all");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [shiftStatusFilter, setShiftStatusFilter] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("department");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [closingNoteDrafts, setClosingNoteDrafts] = useState<Record<string, string>>({});
  const [statementGeneratedAt, setStatementGeneratedAt] = useState(() => new Date());
  const [selectedRecord, setSelectedRecord] = useState<AccountingRow | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("overview");
  const [hoveredRecordId, setHoveredRecordId] = useState<string | null>(null);
  const [showOlderUnclosedShifts, setShowOlderUnclosedShifts] = useState(false);
  const [collapsedUnclosedDates, setCollapsedUnclosedDates] = useState<Record<string, boolean>>({});

  const role = String(user?.role || "").toLowerCase();
  const allowed =
    role === "accounting" ||
    role === "admin" ||
    role === "manager" ||
    role === "assistant_manager" ||
    role === "auditor";
  const canEditReviewLayer = role === "accounting";
  const businessName = resolveBusinessName(user, setupBusinessName);
  const startDate = dateRange.startDate;
  const endDate = dateRange.endDate;

  const reviews = useMemo(() => {
    void reviewVersion;
    return loadAccountingWorkbenchReviews();
  }, [reviewVersion]);

  const reviewMap = useMemo(() => {
    return new Map(reviews.map((item) => [item.recordId, item]));
  }, [reviews]);

  useEffect(() => {
    const refreshBookings = () => setBookingVersion((v) => v + 1);
    window.addEventListener(BOOKINGS_CHANGED_EVENT, refreshBookings);
    return () => window.removeEventListener(BOOKINGS_CHANGED_EVENT, refreshBookings);
  }, []);

  useEffect(() => {
    const refreshClosings = () => setClosingVersion((v) => v + 1);
    window.addEventListener(SHIFT_CLOSINGS_CHANGED_EVENT, refreshClosings);
    return () => window.removeEventListener(SHIFT_CLOSINGS_CHANGED_EVENT, refreshClosings);
  }, []);

  useEffect(() => {
    const refreshTrace = () => setTraceVersion((v) => v + 1);
    window.addEventListener(SHIFT_TRACE_CHANGED_EVENT, refreshTrace);
    return () => window.removeEventListener(SHIFT_TRACE_CHANGED_EVENT, refreshTrace);
  }, []);

  useEffect(() => {
    const syncDateRange = () => {
      const next = loadAccountingDateRange();
      setDateRange((prev) =>
        prev.startDate === next.startDate && prev.endDate === next.endDate ? prev : next
      );
    };
    window.addEventListener(ACCOUNTING_DATE_RANGE_CHANGED_EVENT, syncDateRange);
    return () =>
      window.removeEventListener(ACCOUNTING_DATE_RANGE_CHANGED_EVENT, syncDateRange);
  }, []);

  useEffect(() => {
    const changed = syncShiftClosingsFromShifts(shifts as any[], {
      businessId: (user as any)?.businessId,
      branchId: (user as any)?.branchId,
      submittedBy: (user as any)?.employeeId || (user as any)?.username || user?.role,
    });
    if (changed) setClosingVersion((v) => v + 1);
  }, [shifts, user]);

  const rows = useMemo<AccountingRow[]>(() => {
    void traceVersion;
    void bookingVersion;
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
          source: directSaleSource(sale.deptKey),
          department: normalizeDepartmentKey(sale.deptKey),
          paymentMethod: sale.paymentMethod || "other",
          staff: sale.staffName || sale.staffId || "unknown",
          description: sale.productName || "Sale",
          revenue: Number(sale.total) || 0,
          expense: 0,
          collection: Number(sale.total) || 0,
          roomFolioReceivable: 0,
          guestPayment: 0,
          paymentState: "paid",
          transactionTime: sale.createdAt,
          shiftId: trace.shiftId,
          shiftStatus: trace.shiftStatus,
          submittedAt: trace.submittedAt,
          submittedBy: trace.submittedBy,
          submissionMode: trace.submissionMode,
        };
      });

    const roomBookingRows: AccountingRow[] = getAllBookings()
      .flatMap((booking) => {
        const amount = roomBookingBaseRevenue(booking);
        if (amount <= 0) return [];

        const bookingDate = new Date(booking.createdAt || booking.updatedAt || Date.now()).toISOString();
        const trace = resolveShiftTrace(
          {
            ...booking,
            createdAt: bookingDate,
            deptKey: "front-desk",
            department: "front-desk",
          },
          shifts
        );

        const row: AccountingRow = {
          id: `booking:${booking.id}`,
          date: bookingDate,
          source: "room_booking_revenue",
          department: normalizeDepartmentKey("front-desk"),
          paymentMethod: "room_booking",
          staff: booking.createdBy?.employeeId || "Front Desk",
          description: `Room booking ${booking.bookingCode || booking.roomNo || ""}`.trim(),
          revenue: amount,
          expense: 0,
          collection: 0,
          roomFolioReceivable: 0,
          guestPayment: 0,
          bookingCode: booking.bookingCode,
          roomNo: booking.roomNo,
          paymentState: normalizePaymentState(booking.paymentStatus) || "unpaid",
          transactionTime: bookingDate,
          shiftId: trace.shiftId,
          shiftStatus: trace.shiftStatus,
          submittedAt: trace.submittedAt,
          submittedBy: trace.submittedBy,
          submissionMode: trace.submissionMode,
        };

        return [row];
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
            paymentState: isPayment ? "paid" : normalizePaymentState(booking.paymentStatus) || "unpaid",
            transactionTime: activityDate,
            shiftId: trace.shiftId,
            shiftStatus: trace.shiftStatus,
            submittedAt: trace.submittedAt,
            submittedBy: trace.submittedBy,
            submissionMode: trace.submissionMode,
          };
        })
    );

    const closingRows: AccountingRow[] = loadShiftClosings().map((closing) => {
      const submittedAt =
        closing.submitted_at || closing.created_at || closing.updated_at || new Date().toISOString();
      const shiftStatus = closing.shift_status || shiftStatusFromClosing(String(closing.status || "pending"));
      const cashExpected = Number(closing.cash_expected) || 0;
      const cashCounted = Number(closing.cash_counted) || 0;
      const cardTotal = Number(closing.card_total) || 0;
      const momoTotal = Number(closing.momo_total) || 0;
      const transferTotal = Number(closing.transfer_total) || 0;
      const expensesTotal = Number(closing.expenses_total) || 0;
      const collectedTotal = cashCounted + cardTotal + momoTotal + transferTotal;

      return {
        id: `closing:${closing.id}`,
        date: submittedAt,
        source: "cash_desk_closing",
        department: normalizeDepartmentKey(closing.department_key || "front-desk"),
        paymentMethod: "closing",
        staff: String(closing.submitted_by_user_id || "Front Desk"),
        description: `Shift closing ${closing.shift_id || closing.id} (${closingStatusLabel(closing.status)})`,
        revenue: 0,
        expense: 0,
        collection: 0,
        roomFolioReceivable: 0,
        guestPayment: 0,
        transactionTime: submittedAt,
        shiftId: closing.shift_id ? String(closing.shift_id) : undefined,
        shiftStatus,
        submittedAt,
        submittedBy: closing.submitted_by_user_id
          ? String(closing.submitted_by_user_id)
          : undefined,
        submissionMode: closing.submission_mode,
        closingStatus: closing.status,
        closingCashExpected: cashExpected,
        closingCashCounted: cashCounted,
        closingCardTotal: cardTotal,
        closingMomoTotal: momoTotal,
        closingTransferTotal: transferTotal,
        closingExpensesTotal: expensesTotal,
        closingAccountingStatus: closing.accounting_review_status || "pending",
        note: closing.notes,
        closingTotal: collectedTotal,
      } as AccountingRow;
    });

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

    return [...roomBookingRows, ...directSales, ...folioRows, ...closingRows, ...expenses].sort(
      (a, b) => new Date(b.transactionTime).getTime() - new Date(a.transactionTime).getTime()
    );
  }, [salesRecords, expenseRecords, shifts, traceVersion, bookingVersion, closingVersion]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const review = reviewMap.get(row.id);
      const status = review?.status || "unreviewed";
      if (!inRange(row.transactionTime, startDate, endDate)) return false;
      if (department !== "all" && row.department !== normalizeDepartmentKey(department)) return false;
      if (paymentMethod !== "all" && row.paymentMethod !== paymentMethod) return false;
      if (source !== "all" && row.source !== source) return false;
      if (staff !== "all" && row.staff !== staff) return false;
      if (reviewStatus !== "all" && status !== reviewStatus) return false;
      if (shiftStatusFilter !== "all" && row.shiftStatus !== shiftStatusFilter) return false;
      return true;
    });
  }, [rows, reviewMap, startDate, endDate, department, paymentMethod, source, staff, reviewStatus, shiftStatusFilter]);

  useEffect(() => {
    if (!selectedRecord) return;
    if (!filtered.some((row) => row.id === selectedRecord.id)) {
      setSelectedRecord(null);
    }
  }, [filtered, selectedRecord]);

  const summary = useMemo(() => {
    const totals = filtered.reduce(
      (acc, row) => {
        acc.revenue += row.revenue;
        acc.expenses += row.expense;
        acc.collections += row.collection;
        acc.roomFolioReceivables += row.roomFolioReceivable;
        acc.guestPayments += row.guestPayment;
        if (row.source === "room_booking_revenue") acc.roomBookingRevenue += row.revenue;
        if (row.source === "room_folio_charge") acc.roomFolioCharges += row.revenue;
        if (row.source === "food_service_sale") acc.foodServiceSales += row.revenue;
        if (row.source === "department_pos_sale") acc.departmentPosSales += row.revenue;
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
        roomBookingRevenue: 0,
        roomFolioCharges: 0,
        foodServiceSales: 0,
        departmentPosSales: 0,
      }
    );

    return {
      ...totals,
      netProfit: totals.revenue - totals.expenses,
      outstandingBalance: totals.revenue - totals.collections,
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
          ? dateOnly(row.transactionTime)
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

  const unclosedShiftAlerts = useMemo<UnclosedShiftAlert[]>(() => {
    const resolved = new Set(resolvedUnclosedAlerts);
    const map = new Map<string, UnclosedShiftAlert>();

    filtered.forEach((row) => {
      if (row.shiftStatus !== "unclosed" && row.shiftStatus !== "auto_submitted") return;

      const shiftDate = dateOnly(row.transactionTime) || dateOnly(row.date) || "unknown";
      const key = row.shiftId
        ? `shift:${row.shiftId}`
        : `unassigned:${row.department}:${shiftDate}:${row.staff}`;
      if (resolved.has(key)) return;

      const current = map.get(key) || {
        key,
        shiftId: row.shiftId,
        staffName: row.staff || "unknown",
        department: row.department,
        shiftDate,
        transactionCount: 0,
        totalCollected: 0,
        status: row.shiftStatus,
        priority: "medium",
      };

      current.transactionCount += 1;
      current.totalCollected += row.collection;
      if (row.shiftStatus === "auto_submitted") current.status = "auto_submitted";
      current.priority = resolveUnclosedPriority(current);
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => b.shiftDate.localeCompare(a.shiftDate));
  }, [filtered, resolvedUnclosedAlerts]);

  const unclosedShiftDateGroups = useMemo(() => {
    const map = new Map<string, UnclosedShiftAlert[]>();
    unclosedShiftAlerts.forEach((alert) => {
      const current = map.get(alert.shiftDate) || [];
      current.push(alert);
      map.set(alert.shiftDate, current);
    });

    return Array.from(map.entries())
      .map(([date, alerts]) => ({
        date,
        label: formatDateHeader(date),
        count: alerts.length,
        alerts: alerts.sort((a, b) => {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority] || b.totalCollected - a.totalCollected;
        }),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [unclosedShiftAlerts]);

  const visibleUnclosedShiftDateGroups = showOlderUnclosedShifts
    ? unclosedShiftDateGroups
    : unclosedShiftDateGroups.slice(0, 5);

  const departments = Array.from(new Set(rows.map((row) => row.department))).sort();
  const paymentMethods = Array.from(new Set(rows.map((row) => row.paymentMethod))).sort();
  const staffOptions = Array.from(new Set(rows.map((row) => row.staff))).sort();
  const closingRecords = useMemo(() => {
    void closingVersion;
    return loadShiftClosings();
  }, [closingVersion]);
  const filteredClosingRecords = useMemo(() => {
    const ids = new Set(
      filtered
        .filter((row) => row.source === "cash_desk_closing")
        .map((row) => row.id.replace(/^closing:/, ""))
    );
    return closingRecords.filter((closing) => ids.has(String(closing.id)));
  }, [closingRecords, filtered]);

  function updateDateRange(patch: Partial<typeof dateRange>) {
    setDateRange((prev) => saveAccountingDateRange({ ...prev, ...patch }));
  }

  function updateReview(row: AccountingRow, status: AccountingReviewStatus) {
    if (!canEditReviewLayer) return;
    upsertAccountingWorkbenchReview({
      recordId: row.id,
      status,
      note: noteDrafts[row.id] ?? reviewMap.get(row.id)?.note,
    });
    setReviewVersion((v) => v + 1);
  }

  function saveNote(row: AccountingRow) {
    if (!canEditReviewLayer) return;
    upsertAccountingWorkbenchReview({
      recordId: row.id,
      status: reviewMap.get(row.id)?.status || "unreviewed",
      note: noteDrafts[row.id] ?? "",
    });
    setReviewVersion((v) => v + 1);
  }

  function updateClosingReview(closing: ShiftClosingRecord, action?: ClosingReviewAction) {
    if (!canEditReviewLayer) return;

    const note =
      closingNoteDrafts[String(closing.id)] ??
      closing.accounting_note ??
      closing.notes ??
      "";
    const reviewedBy =
      (user as any)?.employeeId || (user as any)?.username || user?.role || "accounting";
    const updated = reviewShiftClosing({
      id: closing.id,
      reviewStatus: action,
      note,
      reviewedBy,
    });

    if (action === "approved" && updated.shift_id) {
      recordShiftSubmission({
        shiftId: updated.shift_id,
        status: "reviewed",
        submittedAt: updated.accounting_reviewed_at || new Date().toISOString(),
        submittedBy: String(reviewedBy),
        submissionMode: "manual",
        notes: note,
      });
    }

    setClosingVersion((v) => v + 1);
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
      "Collections",
      "Payment Status",
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
        row.paymentState ? paymentStateLabel(row.paymentState) : "",
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

  function openRecordDetails(row: AccountingRow) {
    setSelectedRecord(row);
    setDetailTab("overview");
  }

  function handleUnclosedShiftAction(alert: UnclosedShiftAlert, action: UnclosedShiftAction) {
    const status: ShiftTraceStatus = action === "close" ? "submitted" : "reviewed";
    if (alert.shiftId) {
      recordShiftSubmission({
        shiftId: alert.shiftId,
        status,
        submittedAt: new Date().toISOString(),
        submittedBy: (user as any)?.employeeId || (user as any)?.username || user?.role || "accounting",
        submissionMode: "manual",
      });
    }

    const next = Array.from(new Set([...resolvedUnclosedAlerts, alert.key]));
    setResolvedUnclosedAlerts(next);
    saveResolvedUnclosedAlerts(next);
    setTraceVersion((v) => v + 1);
  }

  function toggleUnclosedDate(date: string) {
    setCollapsedUnclosedDates((prev) => ({ ...prev, [date]: !prev[date] }));
  }

  const reviewedCount = filtered.filter((r) => reviewMap.get(r.id)?.status === "reviewed").length;
  const flaggedCount = filtered.filter((r) => reviewMap.get(r.id)?.status === "issue").length;
  const dateRangeLabel = formatDateRange(startDate, endDate);
  const departmentFilterLabel = department === "all" ? "All departments" : department;
  const generatedAtLabel = formatDateTime(statementGeneratedAt);
  const groupByLabel = groupBy === "paymentMethod" ? "Payment Method" : groupBy.charAt(0).toUpperCase() + groupBy.slice(1);

  if (!allowed) {
    return <div style={styles.notice}>Accounting Workbench is available to accounting, manager, admin, and auditor users only.</div>;
  }

  return (
    <div style={styles.page} className="accounting-workbench-page">
      <div className="accounting-screen" style={styles.screenContent}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>Accounting</div>
          <h1 style={styles.title}>Reconciliation Workbench</h1>
          <p style={styles.subtitle}>Review sales, room folios, guest payments, cash desk closings, and expenses without changing source records.</p>
        </div>
        <div style={styles.actions}>
          <button style={styles.secondaryBtn} onClick={exportCsv}>Export CSV</button>
          <button style={styles.primaryBtn} onClick={exportStatement}>Export Statement</button>
          <button style={styles.primaryBtn} onClick={printStatement}>Print Statement</button>
        </div>
      </div>

      <div style={styles.workbenchTabs}>
        <WorkbenchTabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>Overview</WorkbenchTabButton>
        <WorkbenchTabButton active={activeTab === "unclosed"} onClick={() => setActiveTab("unclosed")}>Unclosed Shifts</WorkbenchTabButton>
        <WorkbenchTabButton active={activeTab === "closings"} onClick={() => setActiveTab("closings")}>Cash Desk Closings</WorkbenchTabButton>
        <WorkbenchTabButton active={activeTab === "records"} onClick={() => setActiveTab("records")}>Financial Records</WorkbenchTabButton>
        <WorkbenchTabButton active={activeTab === "review"} onClick={() => setActiveTab("review")}>Review Status</WorkbenchTabButton>
      </div>

      {activeTab === "overview" && (
      <>
      <div style={styles.summaryGrid}>
        <Metric label="Revenue (Earned)" value={money(summary.revenue)} />
        <Metric label="Total Expenses" value={money(summary.expenses)} />
        <Metric label="Net Profit" value={money(summary.netProfit)} />
        <Metric label="Outstanding Balance" value={money(summary.outstandingBalance)} />
        <Metric label="Total Cash" value={money(summary.cash)} />
        <Metric label="Total MoMo" value={money(summary.momo)} />
        <Metric label="Total Card" value={money(summary.card)} />
        <Metric label="Total Transfer" value={money(summary.transfer)} />
        <Metric label="Room Booking Revenue" value={money(summary.roomBookingRevenue)} />
        <Metric label="Room Folio Charges" value={money(summary.roomFolioCharges)} />
        <Metric label="Food & Service Sales" value={money(summary.foodServiceSales)} />
        <Metric label="Department POS Sales" value={money(summary.departmentPosSales)} />
        <Metric label="Room Folio Receivables" value={money(summary.roomFolioReceivables)} />
        <Metric label="Cash Collected" value={money(summary.collections)} />
      </div>

      <div style={styles.panel}>
        <div style={styles.filterGrid}>
          <Field label="Start Date"><input type="date" style={styles.input} value={startDate} onChange={(e) => updateDateRange({ startDate: e.target.value })} /></Field>
          <Field label="End Date"><input type="date" style={styles.input} value={endDate} onChange={(e) => updateDateRange({ endDate: e.target.value })} /></Field>
          <Field label="Department"><Select value={department} onChange={setDepartment} options={["all", ...departments]} labeler={(v) => v === "all" ? "All" : formatDepartmentLabel(v)} /></Field>
          <Field label="Payment Method"><Select value={paymentMethod} onChange={setPaymentMethod} options={["all", ...paymentMethods]} /></Field>
          <Field label="Source / Type"><Select value={source} onChange={setSource} options={["all", "room_booking_revenue", "room_folio_charge", "food_service_sale", "department_pos_sale", "guest_payment", "cash_desk_closing", "expense"]} labeler={(v) => v === "all" ? "All" : sourceLabel(v as SourceType)} /></Field>
          <Field label="Staff"><Select value={staff} onChange={setStaff} options={["all", ...staffOptions]} /></Field>
          <Field label="Review Status"><Select value={reviewStatus} onChange={setReviewStatus} options={["all", "unreviewed", "reviewed", "issue"]} /></Field>
          <Field label="Shift Status"><Select value={shiftStatusFilter} onChange={setShiftStatusFilter} options={["all", "open", "unclosed", "submitted", "reviewed", "auto_submitted"]} labeler={(v) => v === "all" ? "All" : formatShiftStatus(v)} /></Field>
          <Field label="Group By"><Select value={groupBy} onChange={(v) => setGroupBy(v as GroupBy)} options={["department", "paymentMethod", "staff", "date", "source"]} /></Field>
        </div>
      </div>

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
      </>
      )}

      {activeTab === "unclosed" && (
        <div style={styles.unclosedPanel}>
          <div style={styles.unclosedHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Unclosed shift detected</h2>
              <p style={styles.unclosedText}>Transactions remain visible. Accounting can review and resolve shifts that were not manually closed.</p>
            </div>
            <div style={styles.unclosedHeaderActions}>
              <span style={styles.badgeWarn}>{unclosedShiftAlerts.length} shifts</span>
              {unclosedShiftDateGroups.length > 5 && (
                <button style={styles.smallBtn} onClick={() => setShowOlderUnclosedShifts((v) => !v)}>
                  {showOlderUnclosedShifts ? "Hide older shifts" : "View older shifts"}
                </button>
              )}
            </div>
          </div>
          {unclosedShiftAlerts.length === 0 ? (
            <div style={styles.emptyState}>No unclosed shifts detected for the current data.</div>
          ) : (
            <div style={styles.unclosedList}>
              {visibleUnclosedShiftDateGroups.map((group) => {
                const collapsed = !!collapsedUnclosedDates[group.date];
                return (
                  <div key={group.date} style={styles.unclosedDateGroup}>
                    <button style={styles.unclosedDateHeader} onClick={() => toggleUnclosedDate(group.date)}>
                      <span>{collapsed ? "+" : "-"} {group.label}</span>
                      <span style={styles.badgeMuted}>{group.count} shifts</span>
                    </button>
                    {!collapsed && (
                      <div style={styles.unclosedDateBody}>
                        {group.alerts.map((alert) => (
                          <div key={alert.key} style={styles.unclosedItem}>
                            <div style={styles.unclosedMeta}>
                              <span style={alert.priority === "high" ? styles.priorityHigh : alert.priority === "medium" ? styles.priorityMedium : styles.priorityLow}>
                                {priorityLabel(alert.priority)}
                              </span>
                              <span><strong>Staff:</strong> {alert.staffName}</span>
                              <span><strong>Department:</strong> {formatDepartmentLabel(alert.department)}</span>
                              <span><strong>Transactions:</strong> {alert.transactionCount}</span>
                              <span><strong>Total collected:</strong> {money(alert.totalCollected)}</span>
                              <span><strong>Status:</strong> {formatShiftStatus(alert.status)}</span>
                            </div>
                            <div style={styles.unclosedActions}>
                              <button style={styles.smallBtn} onClick={() => handleUnclosedShiftAction(alert, "review")}>Review</button>
                              <button style={styles.smallBtn} onClick={() => handleUnclosedShiftAction(alert, "reconcile")}>Reconcile</button>
                              <button style={styles.warnBtn} onClick={() => handleUnclosedShiftAction(alert, "close")}>Close Shift</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {!showOlderUnclosedShifts && unclosedShiftDateGroups.length > 5 && (
                <div style={styles.unclosedOlderNote}>
                  Showing latest 5 days. {unclosedShiftDateGroups.length - 5} older date groups hidden.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "closings" && (
        <div style={styles.panel}>
          <h2 style={styles.sectionTitle}>Cash Desk Closings</h2>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <Th>Submitted</Th>
                  <Th>Shift</Th>
                  <Th>Dept</Th>
                  <Th>Cash Expected</Th>
                  <Th>Cash Counted</Th>
                  <Th>Card</Th>
                  <Th>MoMo</Th>
                  <Th>Transfer</Th>
                  <Th>Expenses</Th>
                  <Th>Status</Th>
                  <Th>Accounting</Th>
                  <Th>Note</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filteredClosingRecords.map((closing) => {
                  const reviewStatus = closing.accounting_review_status || "pending";
                  const noteValue =
                    closingNoteDrafts[String(closing.id)] ??
                    closing.accounting_note ??
                    closing.notes ??
                    "";

                  return (
                    <tr key={String(closing.id)}>
                      <Td>{closing.submitted_at ? formatDateTime(new Date(closing.submitted_at)) : "-"}</Td>
                      <Td>{closing.shift_id ? String(closing.shift_id) : String(closing.id)}</Td>
                      <Td>{formatDepartmentLabel(closing.department_key || "front-desk")}</Td>
                      <Td>{money(Number(closing.cash_expected) || 0)}</Td>
                      <Td>{money(Number(closing.cash_counted) || 0)}</Td>
                      <Td>{money(Number(closing.card_total) || 0)}</Td>
                      <Td>{money(Number(closing.momo_total) || 0)}</Td>
                      <Td>{money(Number(closing.transfer_total) || 0)}</Td>
                      <Td>{money(Number(closing.expenses_total) || 0)}</Td>
                      <Td>
                        <span style={closing.status === "rejected" ? styles.badgeDanger : closing.status === "approved" ? styles.badgeGood : styles.badgeWarn}>
                          {closingStatusLabel(closing.status)}
                        </span>
                      </Td>
                      <Td>
                        <span style={reviewStatus === "approved" ? styles.badgeGood : reviewStatus === "rejected" ? styles.badgeDanger : styles.badgeMuted}>
                          {closingStatusLabel(reviewStatus)}
                        </span>
                        {closing.accounting_reviewed_at ? (
                          <div style={styles.detailLabel}>
                            {formatDateTime(new Date(closing.accounting_reviewed_at))}
                          </div>
                        ) : null}
                      </Td>
                      <Td>
                        <input
                          style={styles.noteInput}
                          value={noteValue}
                          onChange={(e) =>
                            setClosingNoteDrafts((prev) => ({
                              ...prev,
                              [String(closing.id)]: e.target.value,
                            }))
                          }
                          placeholder="Accounting note"
                          disabled={!canEditReviewLayer}
                        />
                      </Td>
                      <Td>
                        {canEditReviewLayer ? (
                          <div style={styles.rowActions}>
                            <button style={styles.smallBtn} onClick={() => updateClosingReview(closing)}>Save Note</button>
                            <button style={styles.smallBtn} onClick={() => updateClosingReview(closing, "approved")}>Approve</button>
                            <button style={styles.warnBtn} onClick={() => updateClosingReview(closing, "rejected")}>Reject</button>
                          </div>
                        ) : (
                          <span style={styles.badgeMuted}>View only</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredClosingRecords.length === 0 ? (
            <div style={styles.emptyState}>No cash desk closings have been captured yet.</div>
          ) : null}
        </div>
      )}

      {activeTab === "review" && (
        <div style={styles.panel}>
          <h2 style={styles.sectionTitle}>Review Status</h2>
          <div style={styles.reviewStats}>
            <Metric label="Filtered Records" value={String(filtered.length)} />
            <Metric label="Reviewed" value={String(reviewedCount)} />
            <Metric label="Flagged" value={String(flaggedCount)} />
          </div>
        </div>
      )}

      {activeTab === "records" && (
      <div style={styles.panel}>
        <h2 style={styles.sectionTitle}>Financial Records</h2>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <Th>Transaction Time</Th><Th>Source</Th><Th>Dept</Th><Th>Method</Th><Th>Staff</Th><Th>Description</Th><Th>Revenue</Th><Th>Expense</Th><Th>Collections</Th><Th>Payment</Th><Th>Shift</Th><Th>Review</Th><Th>Note</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const review = reviewMap.get(row.id);
                const status = review?.status || "unreviewed";
                return (
                  <tr
                    key={row.id}
                    style={{
                      ...styles.clickableRow,
                      ...(hoveredRecordId === row.id ? styles.clickableRowHover : {}),
                    }}
                    tabIndex={0}
                    role="button"
                    onClick={() => openRecordDetails(row)}
                    onMouseEnter={() => setHoveredRecordId(row.id)}
                    onMouseLeave={() => setHoveredRecordId(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openRecordDetails(row);
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
                    <Td>{row.paymentState ? <PaymentBadge state={row.paymentState} /> : "-"}</Td>
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
                        disabled={!canEditReviewLayer}
                      />
                    </Td>
                    <Td>
                      <div
                        style={styles.rowActions}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <button style={styles.smallBtn} onClick={() => openRecordDetails(row)}>View details</button>
                        {canEditReviewLayer ? (
                          <>
                            <button style={styles.smallBtn} onClick={() => updateReview(row, "reviewed")}>Reviewed</button>
                            <button style={styles.warnBtn} onClick={() => updateReview(row, "issue")}>Flag</button>
                            <button style={styles.smallBtn} onClick={() => saveNote(row)}>Save Note</button>
                          </>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
      </div>

      {selectedRecord && (
        <div style={styles.drawerOverlay} onClick={() => setSelectedRecord(null)}>
          <aside style={styles.drawer} onClick={(e) => e.stopPropagation()} aria-label="Financial record details">
            <div style={styles.drawerHeader}>
              <div>
                <h2 style={styles.detailTitle}>Financial Record Details</h2>
                <div style={styles.detailSubtitle}>{sourceLabel(selectedRecord.source)} | {selectedRecord.id}</div>
              </div>
              <button style={styles.secondaryBtn} onClick={() => setSelectedRecord(null)}>Close</button>
            </div>

            <div style={styles.drawerTabs}>
              <DetailTabButton active={detailTab === "overview"} onClick={() => setDetailTab("overview")}>Overview</DetailTabButton>
              <DetailTabButton active={detailTab === "transaction"} onClick={() => setDetailTab("transaction")}>Transaction</DetailTabButton>
              <DetailTabButton active={detailTab === "shift"} onClick={() => setDetailTab("shift")}>Shift</DetailTabButton>
              <DetailTabButton active={detailTab === "review"} onClick={() => setDetailTab("review")}>Review / Notes</DetailTabButton>
            </div>

            <div style={styles.drawerBody}>
              {detailTab === "overview" && (
                <div style={styles.detailGrid}>
                  <DetailItem label="Source / Type" value={sourceLabel(selectedRecord.source)} />
                  <DetailItem label="Department" value={formatDepartmentLabel(selectedRecord.department)} />
                  <DetailItem label="Staff" value={selectedRecord.staff} />
                  <DetailItem label="Description" value={selectedRecord.description} wide />
                  <DetailItem label="Revenue" value={money(selectedRecord.revenue)} />
                  <DetailItem label="Expense" value={money(selectedRecord.expense)} />
                  <DetailItem label="Collections" value={money(selectedRecord.collection)} />
                  <div style={styles.detailItem}>
                    <div style={styles.detailLabel}>Payment Status</div>
                    <div style={styles.detailValue}>{selectedRecord.paymentState ? <PaymentBadge state={selectedRecord.paymentState} /> : "-"}</div>
                  </div>
                  <DetailItem label="Booking Code" value={selectedRecord.bookingCode || "-"} />
                  <DetailItem label="Room Number" value={selectedRecord.roomNo || "-"} />
                </div>
              )}

              {detailTab === "transaction" && (
                <div style={styles.detailGrid}>
                  <DetailItem label="Date" value={formatDateTime(new Date(selectedRecord.date))} />
                  <DetailItem label="Transaction Time" value={formatDateTime(new Date(selectedRecord.transactionTime))} />
                  <DetailItem label="Payment Method" value={selectedRecord.paymentMethod} />
                  <DetailItem label="Record ID" value={selectedRecord.id} wide />
                </div>
              )}

              {detailTab === "shift" && (
                <div style={styles.detailGrid}>
                  <DetailItem label="Shift ID" value={selectedRecord.shiftId || "-"} />
                  <DetailItem label="Shift Status" value={formatShiftStatus(selectedRecord.shiftStatus)} />
                  <DetailItem label="Submitted At" value={selectedRecord.submittedAt ? formatDateTime(new Date(selectedRecord.submittedAt)) : "-"} />
                  <DetailItem label="Submitted By" value={selectedRecord.submittedBy || "-"} />
                  <DetailItem label="Submission Mode" value={selectedRecord.submissionMode || "-"} />
                </div>
              )}

              {detailTab === "review" && (
                <div style={styles.detailGrid}>
                  <DetailItem label="Review Status" value={reviewMap.get(selectedRecord.id)?.status || "unreviewed"} />
                  <label style={{ ...styles.field, ...styles.detailItemWide }}>
                    <span style={styles.detailLabel}>Accounting Note</span>
                    <input
                      style={styles.noteInputFull}
                      value={noteDrafts[selectedRecord.id] ?? reviewMap.get(selectedRecord.id)?.note ?? ""}
                      onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [selectedRecord.id]: e.target.value }))}
                      placeholder="Accounting note"
                      disabled={!canEditReviewLayer}
                    />
                  </label>
                  <div style={{ ...styles.rowActions, ...styles.detailItemWide }}>
                    {canEditReviewLayer ? (
                      <>
                        <button style={styles.smallBtn} onClick={() => updateReview(selectedRecord, "reviewed")}>Reviewed</button>
                        <button style={styles.warnBtn} onClick={() => updateReview(selectedRecord, "issue")}>Flag</button>
                        <button style={styles.smallBtn} onClick={() => saveNote(selectedRecord)}>Save Note</button>
                      </>
                    ) : (
                      <span style={styles.badgeMuted}>View only</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

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
          <PrintMetric label="Revenue (Earned)" value={money(summary.revenue)} />
          <PrintMetric label="Total Expenses" value={money(summary.expenses)} />
          <PrintMetric label="Net Profit" value={money(summary.netProfit)} />
          <PrintMetric label="Outstanding Balance" value={money(summary.outstandingBalance)} />
          <PrintMetric label="Total Cash" value={money(summary.cash)} />
          <PrintMetric label="MoMo Collected" value={money(summary.momo)} />
          <PrintMetric label="Card Collected" value={money(summary.card)} />
          <PrintMetric label="Transfer Collected" value={money(summary.transfer)} />
          <PrintMetric label="Room Booking Revenue" value={money(summary.roomBookingRevenue)} />
          <PrintMetric label="Room Folio Charges" value={money(summary.roomFolioCharges)} />
          <PrintMetric label="Food & Service Sales" value={money(summary.foodServiceSales)} />
          <PrintMetric label="Department POS Sales" value={money(summary.departmentPosSales)} />
          <PrintMetric label="Room Folio Receivables" value={money(summary.roomFolioReceivables)} />
          <PrintMetric label="Cash Collected" value={money(summary.collections)} />
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
                <PrintTh>Transaction Time</PrintTh><PrintTh>Source / Type</PrintTh><PrintTh>Department</PrintTh><PrintTh>Payment Method</PrintTh><PrintTh>Staff</PrintTh><PrintTh>Description</PrintTh><PrintTh>Revenue</PrintTh><PrintTh>Expense</PrintTh><PrintTh>Collections</PrintTh><PrintTh>Payment</PrintTh><PrintTh>Shift Status</PrintTh><PrintTh>Review Status</PrintTh><PrintTh>Note</PrintTh>
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
                    <PrintTd>{row.paymentState ? paymentStateLabel(row.paymentState) : ""}</PrintTd>
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

function PaymentBadge({ state }: { state: PaymentState }) {
  const style =
    state === "paid" ? styles.badgeGood : state === "partial" ? styles.badgeWarn : styles.badgeMuted;

  return <span style={style}>{paymentStateLabel(state)}</span>;
}

function WorkbenchTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button style={active ? styles.workbenchTabActive : styles.workbenchTab} onClick={onClick}>
      {children}
    </button>
  );
}

function DetailTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button style={active ? styles.drawerTabActive : styles.drawerTab} onClick={onClick}>
      {children}
    </button>
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
  workbenchTabs: { display: "flex", gap: 8, flexWrap: "wrap", padding: 4, border: "1px solid rgba(15,23,42,0.08)", borderRadius: 999, background: "#fff", width: "fit-content" },
  workbenchTab: { border: "1px solid transparent", background: "#fff", color: "#334155", borderRadius: 999, padding: "9px 13px", fontWeight: 900, cursor: "pointer", fontSize: 13 },
  workbenchTabActive: { border: "1px solid #111827", background: "#111827", color: "#fff", borderRadius: 999, padding: "9px 13px", fontWeight: 900, cursor: "pointer", fontSize: 13 },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 },
  metric: { padding: 14, border: "1px solid rgba(15,23,42,0.08)", borderRadius: 10, background: "#fff", boxShadow: "0 8px 20px rgba(15,23,42,0.04)" },
  metricLabel: { color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 },
  metricValue: { marginTop: 8, color: "#111827", fontSize: 22, fontWeight: 900 },
  panel: { padding: 16, border: "1px solid rgba(15,23,42,0.08)", borderRadius: 10, background: "#fff" },
  unclosedPanel: { padding: 16, border: "1px solid rgba(217,119,6,0.24)", borderRadius: 10, background: "rgba(255,251,235,0.9)" },
  unclosedHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 },
  unclosedHeaderActions: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" },
  unclosedText: { margin: "4px 0 0", color: "#92400e", fontSize: 13, fontWeight: 700 },
  unclosedList: { display: "grid", gap: 8 },
  unclosedDateGroup: { border: "1px solid rgba(217,119,6,0.18)", borderRadius: 8, background: "#fff", overflow: "hidden" },
  unclosedDateHeader: { width: "100%", border: "none", background: "#fff7ed", color: "#111827", padding: "10px 12px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", fontWeight: 900, cursor: "pointer", textAlign: "left" },
  unclosedDateBody: { display: "grid", gap: 8, padding: 10 },
  unclosedItem: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: 10, border: "1px solid rgba(15,23,42,0.08)", borderRadius: 8, background: "#fff" },
  unclosedMeta: { display: "flex", gap: 12, flexWrap: "wrap", color: "#111827", fontSize: 13 },
  unclosedActions: { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" },
  unclosedOlderNote: { color: "#92400e", fontSize: 12, fontWeight: 800, padding: "2px 4px" },
  emptyState: { padding: 14, border: "1px solid rgba(15,23,42,0.08)", borderRadius: 8, background: "#fff", color: "#64748b", fontWeight: 800 },
  priorityHigh: { color: "#b91c1c", background: "rgba(185,28,28,0.10)", borderRadius: 999, padding: "3px 8px", fontWeight: 900 },
  priorityMedium: { color: "#92400e", background: "rgba(217,119,6,0.12)", borderRadius: 999, padding: "3px 8px", fontWeight: 900 },
  priorityLow: { color: "#475569", background: "rgba(71,85,105,0.10)", borderRadius: 999, padding: "3px 8px", fontWeight: 900 },
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
  clickableRow: { cursor: "pointer", transition: "background 0.15s ease, box-shadow 0.15s ease" },
  clickableRowHover: { background: "#f8fafc", boxShadow: "inset 3px 0 0 #111827" },
  reviewStats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 },
  noteInput: { minWidth: 180, padding: "8px 9px", borderRadius: 8, border: "1px solid rgba(15,23,42,0.14)" },
  noteInputFull: { width: "100%", padding: "10px 11px", borderRadius: 8, border: "1px solid rgba(15,23,42,0.14)" },
  rowActions: { display: "flex", gap: 6, flexWrap: "wrap" },
  smallBtn: { border: "1px solid rgba(15,23,42,0.14)", background: "#fff", color: "#111827", borderRadius: 7, padding: "7px 9px", fontWeight: 800, cursor: "pointer" },
  warnBtn: { border: "1px solid rgba(180,38,38,0.18)", background: "rgba(180,38,38,0.08)", color: "#991b1b", borderRadius: 7, padding: "7px 9px", fontWeight: 800, cursor: "pointer" },
  badgeGood: { color: "#047857", background: "rgba(4,120,87,0.10)", borderRadius: 999, padding: "4px 8px", fontWeight: 900 },
  badgeWarn: { color: "#92400e", background: "rgba(217,119,6,0.12)", borderRadius: 999, padding: "4px 8px", fontWeight: 900 },
  badgeDanger: { color: "#b91c1c", background: "rgba(185,28,28,0.10)", borderRadius: 999, padding: "4px 8px", fontWeight: 900 },
  badgeMuted: { color: "#475569", background: "rgba(71,85,105,0.10)", borderRadius: 999, padding: "4px 8px", fontWeight: 900 },
  notice: { padding: 16, borderRadius: 10, background: "rgba(185,28,28,0.08)", color: "#991b1b", fontWeight: 900 },
  drawerOverlay: { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.28)", display: "flex", justifyContent: "flex-end" },
  drawer: { width: "min(560px, 100vw)", height: "100vh", background: "#fff", boxShadow: "-18px 0 36px rgba(15,23,42,0.18)", padding: 18, display: "flex", flexDirection: "column", gap: 14, overflow: "hidden" },
  drawerHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", paddingBottom: 12, borderBottom: "1px solid rgba(15,23,42,0.08)" },
  drawerTabs: { display: "flex", gap: 8, flexWrap: "wrap" },
  drawerTab: { border: "1px solid rgba(15,23,42,0.14)", background: "#fff", color: "#334155", borderRadius: 999, padding: "8px 12px", fontWeight: 900, cursor: "pointer", fontSize: 12 },
  drawerTabActive: { border: "1px solid #111827", background: "#111827", color: "#fff", borderRadius: 999, padding: "8px 12px", fontWeight: 900, cursor: "pointer", fontSize: 12 },
  drawerBody: { overflowY: "auto", paddingRight: 4 },
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
