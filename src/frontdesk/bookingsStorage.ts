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

  createdAt: number;
  updatedAt: number;

  createdBy?: {
    employeeId?: string;
    role?: string;
  };
};

const BOOKINGS_KEY = "sikatech_frontdesk_bookings_v1";

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

export function money(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
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
}

export function getAllBookings() {
  return loadBookings().sort((a, b) => b.createdAt - a.createdAt);
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
  notes?: string;
  createdBy?: {
    employeeId?: string;
    role?: string;
  };
}) {
  const now = Date.now();

  const nights = computeNights(input.checkInDate, input.checkOutDate);
  const totalAmount = Math.max(0, safeNumber(input.totalAmount, 0));
  const amountPaid = clamp(safeNumber(input.amountPaid, 0), 0, totalAmount);
  const balance = Math.max(0, totalAmount - amountPaid);

  const booking: BookingRecord = {
    id: uid("booking"),
    bookingCode: generateBookingCode(),
    guestName: String(input.guestName || "").trim(),
    guestPhone: String(input.guestPhone || "").trim() || undefined,
    guestEmail: String(input.guestEmail || "").trim() || undefined,

    roomNo: String(input.roomNo || "").trim(),
    roomType: String(input.roomType || "").trim() || "Standard",

    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    nights,
    adults: clamp(safeNumber(input.adults, 1), 1, 20),
    children: clamp(safeNumber(input.children, 0), 0, 20),

    bookingSource: input.bookingSource || "walk_in",
    bookingStatus: input.bookingStatus || "reserved",
    paymentStatus:
      input.paymentStatus || (balance <= 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid"),
    roomStatus: normalizeRoomStatusForBookingStatus(
      input.bookingStatus || "reserved",
      input.roomStatus
    ),

    totalAmount,
    amountPaid,
    balance,

    notes: String(input.notes || "").trim() || undefined,

    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };

  const list = getAllBookings();
  const next = [booking, ...list];
  saveBookings(next);
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
    const amountPaid = clamp(safeNumber(merged.amountPaid, 0), 0, totalAmount);
    const balance = Math.max(0, totalAmount - amountPaid);

    merged.totalAmount = totalAmount;
    merged.amountPaid = amountPaid;
    merged.balance = balance;
    merged.nights = computeNights(merged.checkInDate, merged.checkOutDate);

    if (!patch.paymentStatus) {
      merged.paymentStatus = balance <= 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid";
    }

    if (patch.bookingStatus) {
      merged.roomStatus = normalizeRoomStatusForBookingStatus(
        merged.bookingStatus,
        patch.roomStatus
      );
    }

    return merged;
  });

  saveBookings(next);
  return next.find((x) => x.id === id) || null;
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
