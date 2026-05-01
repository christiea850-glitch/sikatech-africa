import {
  createLedgerEntry,
  roundLedgerMoney,
  upsertLedgerEntries,
  type CanonicalLedgerEntry,
} from "../finance/financialLedger";

export type BookingStatus =
  | "reserved"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export type RoomStatus =
  | "available"
  | "occupied"
  | "reserved"
  | "dirty"
  | "out_of_service";

export type BookingSource =
  | "walk_in"
  | "phone"
  | "online"
  | "corporate"
  | "agent";

export type FolioPaymentMethod = "cash" | "momo" | "card" | "transfer";
export type BookingFolioTransactionSource =
  | "guest_payment"
  | "room_folio_charge"
  | "room_folio_settlement";

export type BookingRecord = {
  id: string;
  bookingCode: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;

  roomNo: string;
  roomType: string;

  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults: number;
  children: number;

  bookingSource: BookingSource;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  roomStatus: RoomStatus;

  totalAmount: number;
  amountPaid: number;
  balance: number;

  notes?: string;
  folioActivity?: BookingFolioActivity[];

  createdAt: number;
  updatedAt: number;

  createdBy?: {
    employeeId?: string;
    role?: string;
  };
};

export type BookingFolioActivityType = "charge" | "payment" | "note";

export type BookingFolioActivity = {
  id: string;
  type: BookingFolioActivityType;
  title: string;
  amount: number;
  createdAt: number;
  bookingId?: string;
  bookingCode?: string;
  roomNo?: string;
  customerName?: string;
  transactionSource?: BookingFolioTransactionSource;
  transactionId?: string;
  source?: string;
  paymentMethod?: FolioPaymentMethod;
  note?: string;
  shiftId?: string;
  shiftStatus?: string;
  submittedAt?: string;
  submittedBy?: string;
  submissionMode?: "manual" | "automatic";
  items?: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    discount: number;
    total: number;
  }>;
};

const BOOKINGS_KEY = "sikatech_frontdesk_bookings_v1";
export const BOOKINGS_CHANGED_EVENT = "sikatech_frontdesk_bookings_changed";

function uid(prefix = "bk") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function money(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function toIso(value: number | string | undefined | null) {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function derivePaymentStatusFromAmounts(totalAmount: number, amountPaid: number): PaymentStatus {
  const total = roundMoney(Math.max(0, safeNumber(totalAmount, 0)));
  const paid = roundMoney(clamp(safeNumber(amountPaid, 0), 0, total));
  const balance = roundMoney(Math.max(0, total - paid));

  if (total <= 0) return "unpaid";
  if (balance <= 0.01) return "paid";
  return paid > 0 ? "partial" : "unpaid";
}

function folioChargeTotal(booking: Pick<BookingRecord, "folioActivity">) {
  return roundMoney(
    (booking.folioActivity || [])
      .filter((activity) => activity.type === "charge")
      .reduce((sum, activity) => sum + safeNumber(activity.amount, 0), 0)
  );
}

function roomBookingRevenueAmount(booking: BookingRecord) {
  return roundMoney(Math.max(0, safeNumber(booking.totalAmount, 0) - folioChargeTotal(booking)));
}

function bookingCreatedBy(booking: BookingRecord): CanonicalLedgerEntry["createdBy"] {
  return booking.createdBy
    ? {
        employeeId: booking.createdBy.employeeId,
        role: booking.createdBy.role,
      }
    : undefined;
}

function bookingRevenueLedgerEntry(booking: BookingRecord) {
  const revenueAmount = roomBookingRevenueAmount(booking);
  if (revenueAmount <= 0) return null;

  return createLedgerEntry({
    id: `room_booking_revenue:${booking.id}`,
    occurredAt: toIso(booking.createdAt || booking.updatedAt),
    departmentKey: "front-desk",
    sourceType: "room_booking_revenue",
    sourceId: booking.id,
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    roomNo: booking.roomNo,
    customerName: booking.guestName,
    paymentMethod: "room_booking",
    revenueAmount,
    collectionAmount: 0,
    receivableAmount: revenueAmount,
    expenseAmount: 0,
    status: "posted",
    createdBy: bookingCreatedBy(booking),
  });
}

function bookingPaymentLedgerEntry(
  booking: BookingRecord,
  activity: BookingFolioActivity
) {
  const amount = roundLedgerMoney(Math.max(0, safeNumber(activity.amount, 0)));
  if (amount <= 0) return null;

  return createLedgerEntry({
    id: `guest_payment_collection:${booking.id}:${activity.id}`,
    occurredAt: toIso(activity.createdAt || booking.updatedAt || booking.createdAt),
    departmentKey: "front-desk",
    shiftId: activity.shiftId,
    sourceType: "guest_payment_collection",
    sourceId: activity.id,
    bookingId: activity.bookingId || booking.id,
    bookingCode: activity.bookingCode || booking.bookingCode,
    roomNo: activity.roomNo || booking.roomNo,
    customerName: activity.customerName || booking.guestName,
    paymentMethod: activity.paymentMethod || "cash",
    revenueAmount: 0,
    collectionAmount: amount,
    receivableAmount: -amount,
    expenseAmount: 0,
    status: "posted",
    createdBy: {
      employeeId: activity.submittedBy,
      role: booking.createdBy?.role,
    },
  });
}

function legacyBookingPaymentLedgerEntry(booking: BookingRecord, amount: number) {
  const paid = roundLedgerMoney(Math.max(0, amount));
  if (paid <= 0) return null;

  return createLedgerEntry({
    id: `guest_payment_collection:${booking.id}:legacy_amount_paid`,
    occurredAt: toIso(booking.createdAt || booking.updatedAt),
    departmentKey: "front-desk",
    sourceType: "guest_payment_collection",
    sourceId: `${booking.id}:legacy_amount_paid`,
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    roomNo: booking.roomNo,
    customerName: booking.guestName,
    paymentMethod: "cash",
    revenueAmount: 0,
    collectionAmount: paid,
    receivableAmount: -paid,
    expenseAmount: 0,
    status: "posted",
    createdBy: bookingCreatedBy(booking),
  });
}

function ledgerEntriesForBooking(booking: BookingRecord) {
  const entries: CanonicalLedgerEntry[] = [];
  const revenueEntry = bookingRevenueLedgerEntry(booking);
  if (revenueEntry) entries.push(revenueEntry);

  const paymentActivities = (booking.folioActivity || []).filter(
    (activity) => activity.type === "payment"
  );
  const paymentActivityTotal = roundMoney(
    paymentActivities.reduce((sum, activity) => sum + safeNumber(activity.amount, 0), 0)
  );

  paymentActivities.forEach((activity) => {
    const entry = bookingPaymentLedgerEntry(booking, activity);
    if (entry) entries.push(entry);
  });

  const missingPaidAmount = roundMoney(
    Math.max(0, safeNumber(booking.amountPaid, 0) - paymentActivityTotal)
  );
  const legacyEntry = legacyBookingPaymentLedgerEntry(booking, missingPaidAmount);
  if (legacyEntry) entries.push(legacyEntry);

  return entries;
}

function syncBookingLedgerEntries(booking: BookingRecord) {
  upsertLedgerEntries(ledgerEntriesForBooking(booking));
}

export function migrateBookingsToLedger(bookings: BookingRecord[] = loadBookings()) {
  const entries = bookings.flatMap((booking) => ledgerEntriesForBooking(booking));
  upsertLedgerEntries(entries);
  return entries.length;
}

export function loadBookings(): BookingRecord[] {
  try {
    const raw = localStorage.getItem(BOOKINGS_KEY);
    if (!raw) return seedBookings();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedBookings();

    return parsed as BookingRecord[];
  } catch {
    return seedBookings();
  }
}

export function saveBookings(list: BookingRecord[]) {
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(list));
  try {
    window.dispatchEvent(new CustomEvent(BOOKINGS_CHANGED_EVENT));
  } catch {
    // Storage writes must still succeed in non-browser test contexts.
  }
}

export function getAllBookings() {
  const bookings = loadBookings().sort((a, b) => b.createdAt - a.createdAt);
  migrateBookingsToLedger(bookings);
  return bookings;
}

export function createBooking(input: {
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  roomNo: string;
  roomType: string;
  checkInDate: string;
  checkOutDate: string;
  adults?: number;
  children?: number;
  bookingSource?: BookingSource;
  bookingStatus?: BookingStatus;
  paymentStatus?: PaymentStatus;
  roomStatus?: RoomStatus;
  totalAmount?: number;
  amountPaid?: number;
  initialPaymentMethod?: FolioPaymentMethod;
  shiftId?: string;
  shiftStatus?: string;
  submittedAt?: string;
  submittedBy?: string;
  submissionMode?: "manual" | "automatic";
  notes?: string;
  createdBy?: {
    employeeId?: string;
    role?: string;
  };
}) {
  const now = Date.now();

  const nights = computeNights(input.checkInDate, input.checkOutDate);
  const totalAmount = Math.max(0, safeNumber(input.totalAmount, 0));
  const amountPaid = roundMoney(clamp(safeNumber(input.amountPaid, 0), 0, totalAmount));
  const balance = roundMoney(Math.max(0, totalAmount - amountPaid));
  const initialPaymentMethod = input.initialPaymentMethod || "cash";
  const bookingId = uid("booking");
  const bookingCode = generateBookingCode();
  const guestName = String(input.guestName || "").trim();
  const roomNo = String(input.roomNo || "").trim();
  const initialPayment =
    amountPaid > 0
      ? ({
          id: uid("payment"),
          type: "payment",
          title: `Initial payment - ${initialPaymentMethod}`,
          amount: amountPaid,
          createdAt: now,
          bookingId,
          bookingCode,
          roomNo,
          customerName: guestName,
          transactionSource: "guest_payment",
          source: "front-desk",
          paymentMethod: initialPaymentMethod,
          note: "Initial booking payment",
          shiftId: input.shiftId,
          shiftStatus: input.shiftStatus,
          submittedAt: input.submittedAt,
          submittedBy: input.submittedBy,
          submissionMode: input.submissionMode,
        } satisfies BookingFolioActivity)
      : null;

  const booking: BookingRecord = {
    id: bookingId,
    bookingCode,
    guestName,
    guestPhone: String(input.guestPhone || "").trim() || undefined,
    guestEmail: String(input.guestEmail || "").trim() || undefined,

    roomNo,
    roomType: String(input.roomType || "").trim() || "Standard",

    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    nights,
    adults: clamp(safeNumber(input.adults, 1), 1, 20),
    children: clamp(safeNumber(input.children, 0), 0, 20),

    bookingSource: input.bookingSource || "walk_in",
    bookingStatus: input.bookingStatus || "reserved",
    paymentStatus: derivePaymentStatusFromAmounts(totalAmount, amountPaid),
    roomStatus: normalizeRoomStatusForBookingStatus(
      input.bookingStatus || "reserved",
      input.roomStatus
    ),

    totalAmount,
    amountPaid,
    balance,

    notes: String(input.notes || "").trim() || undefined,
    folioActivity: initialPayment ? [initialPayment] : undefined,

    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };

  const list = getAllBookings();
  const next = [booking, ...list];
  saveBookings(next);
  syncBookingLedgerEntries(booking);
  return booking;
}

export function updateBooking(id: string, patch: Partial<BookingRecord>) {
  const list = getAllBookings();
  const next = list.map((item) => {
    if (item.id !== id) return item;

    const merged: BookingRecord = {
      ...item,
      ...patch,
      updatedAt: Date.now(),
    };

    const totalAmount = Math.max(0, safeNumber(merged.totalAmount, 0));
    const amountPaid = roundMoney(clamp(safeNumber(merged.amountPaid, 0), 0, totalAmount));
    const balance = roundMoney(Math.max(0, totalAmount - amountPaid));

    merged.totalAmount = totalAmount;
    merged.amountPaid = amountPaid;
    merged.balance = balance;
    merged.nights = computeNights(merged.checkInDate, merged.checkOutDate);

    merged.paymentStatus = derivePaymentStatusFromAmounts(totalAmount, amountPaid);

    if (patch.bookingStatus) {
      merged.roomStatus = normalizeRoomStatusForBookingStatus(
        merged.bookingStatus,
        patch.roomStatus
      );
    }

    return merged;
  });

  const saved = next.find((x) => x.id === id) || null;
  saveBookings(next);
  if (saved) syncBookingLedgerEntries(saved);
  return saved;
}

export function deleteBooking(id: string) {
  const list = getAllBookings();
  const next = list.filter((item) => item.id !== id);
  saveBookings(next);
}

export function getBookingById(id: string) {
  return getAllBookings().find((item) => item.id === id) || null;
}

export function computeNights(checkInDate: string, checkOutDate: string) {
  const start = new Date(checkInDate);
  const end = new Date(checkOutDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;

  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);

  const diff = e.getTime() - s.getTime();
  const nights = Math.round(diff / (1000 * 60 * 60 * 24));

  return Math.max(1, nights);
}

export function isToday(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;

  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

export function isFuture(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const value = new Date(d);
  value.setHours(0, 0, 0, 0);

  return value.getTime() > today.getTime();
}

export function isPast(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const value = new Date(d);
  value.setHours(0, 0, 0, 0);

  return value.getTime() < today.getTime();
}

export function bookingStatusColor(status: BookingStatus) {
  switch (status) {
    case "reserved":
      return "#1d4ed8";
    case "checked_in":
      return "#059669";
    case "checked_out":
      return "#64748b";
    case "cancelled":
      return "#dc2626";
    case "no_show":
      return "#b45309";
    default:
      return "#334155";
  }
}

export function paymentStatusColor(status: PaymentStatus) {
  switch (status) {
    case "paid":
      return "#059669";
    case "partial":
      return "#d97706";
    case "unpaid":
      return "#dc2626";
    default:
      return "#334155";
  }
}

export function roomStatusColor(status: RoomStatus) {
  switch (status) {
    case "available":
      return "#059669";
    case "occupied":
      return "#2563eb";
    case "reserved":
      return "#7c3aed";
    case "dirty":
      return "#d97706";
    case "out_of_service":
      return "#dc2626";
    default:
      return "#334155";
  }
}

export function deriveRoomStatus(status: BookingStatus): RoomStatus {
  switch (status) {
    case "checked_in":
      return "occupied";
    case "reserved":
      return "reserved";
    case "checked_out":
      return "dirty";
    case "cancelled":
      return "available";
    case "no_show":
      return "available";
    default:
      return "available";
  }
}

export function postRoomChargeToBooking(
  id: string,
  input: {
    transactionId: string;
    title: string;
    amount: number;
    source?: string;
    note?: string;
    shiftId?: string;
    shiftStatus?: string;
    submittedAt?: string;
    submittedBy?: string;
    submissionMode?: "manual" | "automatic";
    items?: BookingFolioActivity["items"];
  }
) {
  const amount = Math.max(0, safeNumber(input.amount, 0));
  const list = getAllBookings();
  let updated: BookingRecord | null = null;

  const next = list.map((item) => {
    if (item.id !== id) return item;

    if (item.bookingStatus !== "checked_in" || item.roomStatus !== "occupied") {
      throw new Error("Room charges can only be posted to an occupied booking.");
    }

    const activity: BookingFolioActivity = {
      id: uid("folio"),
      type: "charge",
      title: String(input.title || "Room charge").trim(),
      amount,
      createdAt: Date.now(),
      bookingId: item.id,
      bookingCode: item.bookingCode,
      roomNo: item.roomNo,
      customerName: item.guestName,
      transactionSource: "room_folio_charge",
      transactionId: input.transactionId,
      source: input.source,
      note: String(input.note || "").trim() || undefined,
      shiftId: input.shiftId,
      shiftStatus: input.shiftStatus,
      submittedAt: input.submittedAt,
      submittedBy: input.submittedBy,
      submissionMode: input.submissionMode,
      items: input.items,
    };

    const totalAmount = Math.max(0, safeNumber(item.totalAmount, 0) + amount);
    const amountPaid = clamp(safeNumber(item.amountPaid, 0), 0, totalAmount);
    const balance = Math.max(0, totalAmount - amountPaid);

    updated = {
      ...item,
      totalAmount,
      amountPaid,
      balance,
      paymentStatus: balance <= 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid",
      folioActivity: [activity, ...(item.folioActivity || [])],
      updatedAt: Date.now(),
    };

    return updated;
  });

  saveBookings(next);
  if (updated) syncBookingLedgerEntries(updated);
  return updated;
}

export function recordPaymentToBooking(
  id: string,
  input: {
    amount: number;
    paymentMethod: FolioPaymentMethod;
    transactionSource?: BookingFolioTransactionSource;
    source?: string;
    note?: string;
    shiftId?: string;
    shiftStatus?: string;
    submittedAt?: string;
    submittedBy?: string;
    submissionMode?: "manual" | "automatic";
  }
): BookingRecord {
  const amount = roundMoney(Math.max(0, safeNumber(input.amount, 0)));
  const list = getAllBookings();
  let updated: BookingRecord | null = null;
  let error: string | null = null;

  const next = list.map((item) => {
    if (item.id !== id) return item;

    const totalAmount = roundMoney(Math.max(0, safeNumber(item.totalAmount, 0)));
    const currentAmountPaid = roundMoney(
      clamp(safeNumber(item.amountPaid, 0), 0, totalAmount)
    );
    const currentBalance = roundMoney(Math.max(0, totalAmount - currentAmountPaid));

    if (amount <= 0) {
      error = "Enter a payment amount greater than 0.";
      return item;
    }

    if (currentBalance <= 0.01) {
      error = "This booking has no unpaid balance.";
      return item;
    }

    if (amount > currentBalance + 0.01) {
      error = "Payment cannot be greater than the unpaid balance.";
      return item;
    }

    const appliedAmount = Math.min(amount, currentBalance);
    const nextAmountPaid = roundMoney(
      clamp(currentAmountPaid + appliedAmount, 0, totalAmount)
    );
    const remainingBalance = roundMoney(Math.max(0, totalAmount - nextAmountPaid));
    const balance = remainingBalance <= 0.01 ? 0 : remainingBalance;
    const amountPaid = balance === 0 ? totalAmount : nextAmountPaid;
    const paymentMethod = input.paymentMethod;

    const hasFolioCharges = (item.folioActivity || []).some(
      (activity) => activity.type === "charge"
    );
    const activity: BookingFolioActivity = {
      id: uid("payment"),
      type: "payment",
      title: `Payment - ${paymentMethod}`,
      amount: appliedAmount,
      createdAt: Date.now(),
      bookingId: item.id,
      bookingCode: item.bookingCode,
      roomNo: item.roomNo,
      customerName: item.guestName,
      transactionSource:
        input.transactionSource ||
        (hasFolioCharges ? "room_folio_settlement" : "guest_payment"),
      source: input.source,
      paymentMethod,
      note: String(input.note || "").trim() || undefined,
      shiftId: input.shiftId,
      shiftStatus: input.shiftStatus,
      submittedAt: input.submittedAt,
      submittedBy: input.submittedBy,
      submissionMode: input.submissionMode,
    };

    updated = {
      ...item,
      amountPaid,
      balance,
      paymentStatus: derivePaymentStatusFromAmounts(totalAmount, amountPaid),
      folioActivity: [activity, ...(item.folioActivity || [])],
      updatedAt: Date.now(),
    };

    return updated;
  });

  if (error) {
    throw new Error(error);
  }

  const savedBooking = next.find((item) => item.id === id) || updated;
  if (!savedBooking) {
    throw new Error("Booking was not found.");
  }

  saveBookings(next);
  syncBookingLedgerEntries(savedBooking);
  return savedBooking;
}

export function normalizeRoomStatusForBookingStatus(
  bookingStatus: BookingStatus,
  roomStatus?: RoomStatus
): RoomStatus {
  if (
    bookingStatus === "checked_in" ||
    bookingStatus === "checked_out" ||
    bookingStatus === "cancelled" ||
    bookingStatus === "no_show"
  ) {
    return deriveRoomStatus(bookingStatus);
  }

  return roomStatus || deriveRoomStatus(bookingStatus);
}

function generateBookingCode() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const random = Math.floor(100 + Math.random() * 900);
  return `FD-${yy}${mm}${dd}-${random}`;
}

function seedBookings(): BookingRecord[] {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const dayAfter = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);

  const sample: BookingRecord[] = [
    {
      id: uid("booking"),
      bookingCode: generateBookingCode(),
      guestName: "Ama Boateng",
      guestPhone: "0240000001",
      roomNo: "101",
      roomType: "Deluxe",
      checkInDate: toDateOnly(today),
      checkOutDate: toDateOnly(tomorrow),
      nights: 1,
      adults: 2,
      children: 0,
      bookingSource: "online",
      bookingStatus: "reserved",
      paymentStatus: "partial",
      roomStatus: "reserved",
      totalAmount: 180,
      amountPaid: 100,
      balance: 80,
      notes: "Arrival expected today",
      createdAt: Date.now() - 1000 * 60 * 60,
      updatedAt: Date.now() - 1000 * 60 * 60,
      createdBy: { employeeId: "frontdesk01", role: "staff" },
    },
    {
      id: uid("booking"),
      bookingCode: generateBookingCode(),
      guestName: "Kojo Mensah",
      guestPhone: "0240000002",
      roomNo: "204",
      roomType: "Standard",
      checkInDate: toDateOnly(today),
      checkOutDate: toDateOnly(dayAfter),
      nights: 2,
      adults: 1,
      children: 0,
      bookingSource: "walk_in",
      bookingStatus: "checked_in",
      paymentStatus: "paid",
      roomStatus: "occupied",
      totalAmount: 240,
      amountPaid: 240,
      balance: 0,
      notes: "In-house guest",
      createdAt: Date.now() - 1000 * 60 * 30,
      updatedAt: Date.now() - 1000 * 60 * 30,
      createdBy: { employeeId: "frontdesk01", role: "staff" },
    },
  ];

  saveBookings(sample);
  return sample;
}

function toDateOnly(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
