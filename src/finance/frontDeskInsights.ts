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

export type FrontDeskRoomState = {
  roomNo: string;
  status: string;
  bookingId?: string;
  bookingCode?: string;
  balance?: number;
  totalAmount?: number;
  amountPaid?: number;
};

export type FrontDeskRecommendedAction = {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "danger" | "success";
  roomNo?: string;
  bookingCode?: string;
  bookingId?: string;
  recommendedAction: string;
  actionType:
    | "collect_payment"
    | "follow_up_before_checkout"
    | "ready_for_sale"
    | "send_housekeeping"
    | "review_maintenance"
    | "protect_premium_room";
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

export function generateFrontDeskRecommendedActions(
  entries: CanonicalLedgerEntry[],
  rooms: FrontDeskRoomState[]
): FrontDeskRecommendedAction[] {
  const insights = generateFrontDeskInsights(entries);
  const actions: FrontDeskRecommendedAction[] = [];
  const activeRoomRevenue = new Map<string, number>();

  entries.forEach((entry) => {
    const roomNo = String(entry.roomNo || "").trim();
    if (!roomNo) return;
    activeRoomRevenue.set(
      roomNo,
      (activeRoomRevenue.get(roomNo) || 0) + (Number(entry.revenueAmount) || 0)
    );
  });

  insights.unpaidBookings.slice(0, 5).forEach((booking) => {
    actions.push({
      id: `collect_payment:${booking.bookingId}`,
      title: "Collect payment",
      message: `${booking.bookingCode || booking.bookingId} has ${booking.outstanding.toFixed(
        2
      )} outstanding.`,
      severity: "danger",
      roomNo: booking.roomNo,
      bookingCode: booking.bookingCode,
      bookingId: booking.bookingId,
      recommendedAction: "Collect payment before checkout or settlement.",
      actionType: "collect_payment",
    });
  });

  rooms
    .filter((room) => room.status === "occupied" && (Number(room.balance) || 0) > 0)
    .slice(0, 5)
    .forEach((room) => {
      actions.push({
        id: `follow_up_before_checkout:${room.roomNo}:${room.bookingId || ""}`,
        title: "Follow up before checkout",
        message: `Room ${room.roomNo} is occupied with ${roundMoney(
          Number(room.balance) || 0
        ).toFixed(2)} still unpaid.`,
        severity: "warning",
        roomNo: room.roomNo,
        bookingCode: room.bookingCode,
        bookingId: room.bookingId,
        recommendedAction: "Confirm settlement with the guest before checkout.",
        actionType: "follow_up_before_checkout",
      });
    });

  rooms
    .filter((room) => room.status === "available" && !activeRoomRevenue.has(room.roomNo))
    .slice(0, 5)
    .forEach((room) => {
      actions.push({
        id: `ready_for_sale:${room.roomNo}`,
        title: "Ready for sale",
        message: `Room ${room.roomNo} is available and has no current ledger activity.`,
        severity: "success",
        roomNo: room.roomNo,
        recommendedAction: "Offer this room to the next suitable guest.",
        actionType: "ready_for_sale",
      });
    });

  rooms
    .filter((room) => room.status === "dirty")
    .slice(0, 5)
    .forEach((room) => {
      actions.push({
        id: `send_housekeeping:${room.roomNo}`,
        title: "Send to housekeeping",
        message: `Room ${room.roomNo} is marked dirty.`,
        severity: "info",
        roomNo: room.roomNo,
        bookingCode: room.bookingCode,
        bookingId: room.bookingId,
        recommendedAction: "Clean and inspect the room, then mark available when safe.",
        actionType: "send_housekeeping",
      });
    });

  rooms
    .filter((room) => room.status === "out_of_service")
    .slice(0, 5)
    .forEach((room) => {
      actions.push({
        id: `review_maintenance:${room.roomNo}`,
        title: "Review maintenance status",
        message: `Room ${room.roomNo} is out of service.`,
        severity: "warning",
        roomNo: room.roomNo,
        bookingCode: room.bookingCode,
        bookingId: room.bookingId,
        recommendedAction: "Confirm maintenance notes before returning the room to sale.",
        actionType: "review_maintenance",
      });
    });

  insights.topRooms.slice(0, 3).forEach((room) => {
    actions.push({
      id: `protect_premium_room:${room.roomNo}`,
      title: "Protect as premium room",
      message: `Room ${room.roomNo} is a top revenue room with ${room.revenue.toFixed(
        2
      )} posted.`,
      severity: "success",
      roomNo: room.roomNo,
      recommendedAction: "Prioritize upkeep, pricing discipline, and availability for this room.",
      actionType: "protect_premium_room",
    });
  });

  const severityRank: Record<FrontDeskRecommendedAction["severity"], number> = {
    danger: 0,
    warning: 1,
    info: 2,
    success: 3,
  };

  return actions
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, 10);
}
