import type { CanonicalLedgerEntry } from "./financialLedger";

export type FrontDeskUnpaidBookingInsight = {
  bookingId: string;
  bookingCode?: string;
  roomNo?: string;
  customerName?: string;
  revenue: number;
  collections: number;
  outstanding: number;
};

export type FrontDeskTopRoomInsight = {
  roomNo: string;
  revenue: number;
  bookingCount: number;
};

export type FrontDeskPartialPaymentInsight = FrontDeskUnpaidBookingInsight & {
  paymentCount: number;
};

export type FrontDeskInsightAlert = {
  id: string;
  type:
    | "unpaid_booking_balance"
    | "high_value_room"
    | "frequent_partial_payments"
    | "late_settlement";
  title: string;
  message: string;
  bookingId?: string;
  roomNo?: string;
  amount?: number;
};

export type FrontDeskInsights = {
  unpaidBookings: FrontDeskUnpaidBookingInsight[];
  topRooms: FrontDeskTopRoomInsight[];
  partialPayments: FrontDeskPartialPaymentInsight[];
  alerts: FrontDeskInsightAlert[];
};

type BookingAccumulator = {
  bookingId: string;
  bookingCode?: string;
  roomNo?: string;
  customerName?: string;
  revenue: number;
  collections: number;
  paymentCount: number;
  firstRevenueAt?: string;
  lastPaymentAt?: string;
};

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function hoursBetween(startIso: string, endMs: number) {
  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs)) return 0;
  return (endMs - startMs) / 3_600_000;
}

export function generateFrontDeskInsights(
  entries: CanonicalLedgerEntry[]
): FrontDeskInsights {
  const bookingMap = new Map<string, BookingAccumulator>();
  const roomMap = new Map<string, { revenue: number; bookingIds: Set<string> }>();
  const alerts: FrontDeskInsightAlert[] = [];
  const now = Date.now();
  const lateSettlementHours = 24;

  for (const entry of entries) {
    const bookingId = String(entry.bookingId || "").trim();
    const revenue = Number(entry.revenueAmount) || 0;
    const collections = Number(entry.collectionAmount) || 0;

    if (bookingId) {
      const current =
        bookingMap.get(bookingId) || {
          bookingId,
          bookingCode: entry.bookingCode,
          roomNo: entry.roomNo,
          customerName: entry.customerName,
          revenue: 0,
          collections: 0,
          paymentCount: 0,
        };

      current.bookingCode ||= entry.bookingCode;
      current.roomNo ||= entry.roomNo;
      current.customerName ||= entry.customerName;
      current.revenue += revenue;
      current.collections += collections;

      if (revenue > 0 && (!current.firstRevenueAt || entry.occurredAt < current.firstRevenueAt)) {
        current.firstRevenueAt = entry.occurredAt;
      }

      if (collections > 0) {
        current.paymentCount += 1;
        if (!current.lastPaymentAt || entry.occurredAt > current.lastPaymentAt) {
          current.lastPaymentAt = entry.occurredAt;
        }
      }

      bookingMap.set(bookingId, current);
    }

    if (entry.roomNo && revenue > 0) {
      const room = roomMap.get(entry.roomNo) || {
        revenue: 0,
        bookingIds: new Set<string>(),
      };
      room.revenue += revenue;
      if (bookingId) room.bookingIds.add(bookingId);
      roomMap.set(entry.roomNo, room);
    }
  }

  const unpaidBookings = Array.from(bookingMap.values())
    .map((booking) => ({
      bookingId: booking.bookingId,
      bookingCode: booking.bookingCode,
      roomNo: booking.roomNo,
      customerName: booking.customerName,
      revenue: roundMoney(booking.revenue),
      collections: roundMoney(booking.collections),
      outstanding: roundMoney(booking.revenue - booking.collections),
    }))
    .filter((booking) => booking.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  const topRooms = Array.from(roomMap.entries())
    .map(([roomNo, room]) => ({
      roomNo,
      revenue: roundMoney(room.revenue),
      bookingCount: room.bookingIds.size,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const partialPayments = Array.from(bookingMap.values())
    .filter((booking) => booking.paymentCount > 1 && booking.revenue > booking.collections)
    .map((booking) => ({
      bookingId: booking.bookingId,
      bookingCode: booking.bookingCode,
      roomNo: booking.roomNo,
      customerName: booking.customerName,
      revenue: roundMoney(booking.revenue),
      collections: roundMoney(booking.collections),
      outstanding: roundMoney(booking.revenue - booking.collections),
      paymentCount: booking.paymentCount,
    }))
    .sort((a, b) => b.paymentCount - a.paymentCount || b.outstanding - a.outstanding);

  unpaidBookings.slice(0, 5).forEach((booking) => {
    alerts.push({
      id: `unpaid_booking_balance:${booking.bookingId}`,
      type: "unpaid_booking_balance",
      title: "Unpaid booking balance",
      message: `${booking.bookingCode || booking.bookingId} has ${booking.outstanding.toFixed(
        2
      )} outstanding.`,
      bookingId: booking.bookingId,
      roomNo: booking.roomNo,
      amount: booking.outstanding,
    });
  });

  topRooms.slice(0, 3).forEach((room) => {
    alerts.push({
      id: `high_value_room:${room.roomNo}`,
      type: "high_value_room",
      title: "High-value room",
      message: `Room ${room.roomNo} has generated ${room.revenue.toFixed(2)} in revenue.`,
      roomNo: room.roomNo,
      amount: room.revenue,
    });
  });

  partialPayments.slice(0, 5).forEach((booking) => {
    alerts.push({
      id: `frequent_partial_payments:${booking.bookingId}`,
      type: "frequent_partial_payments",
      title: "Frequent partial payments",
      message: `${booking.bookingCode || booking.bookingId} has ${
        booking.paymentCount
      } payment entries and remains unsettled.`,
      bookingId: booking.bookingId,
      roomNo: booking.roomNo,
      amount: booking.outstanding,
    });
  });

  for (const booking of bookingMap.values()) {
    const outstanding = booking.revenue - booking.collections;
    if (
      booking.revenue > 0 &&
      outstanding > 0 &&
      booking.firstRevenueAt &&
      !booking.lastPaymentAt &&
      hoursBetween(booking.firstRevenueAt, now) >= lateSettlementHours
    ) {
      alerts.push({
        id: `late_settlement:${booking.bookingId}`,
        type: "late_settlement",
        title: "Late settlement",
        message: `${booking.bookingCode || booking.bookingId} has revenue but no payment after ${lateSettlementHours} hours.`,
        bookingId: booking.bookingId,
        roomNo: booking.roomNo,
        amount: roundMoney(outstanding),
      });
    }
  }

  return {
    unpaidBookings,
    topRooms,
    partialPayments,
    alerts,
  };
}
