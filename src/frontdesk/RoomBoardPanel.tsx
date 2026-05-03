import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  FINANCIAL_LEDGER_CHANGED_EVENT,
  loadLedgerEntries,
  type CanonicalLedgerEntry,
} from "../finance/financialLedger";
import {
  generateFrontDeskInsights,
  generateFrontDeskRecommendedActions,
  type FrontDeskInsightAlert,
  type FrontDeskRecommendedAction,
} from "../finance/frontDeskInsights";
import {
  BOOKINGS_CHANGED_EVENT,
  getAllBookings,
  normalizeRoomStatusForBookingStatus,
  roomStatusColor,
  updateBooking,
  type BookingFolioActivity,
  type BookingRecord,
  type BookingStatus,
  type RoomStatus,
} from "./bookingsStorage";

type RoomBoardStatus =
  | "available"
  | "occupied"
  | "reserved"
  | "dirty"
  | "out_of_service";
type RoomBoardView = "all" | RoomBoardStatus;

type RoomCard = {
  roomNo: string;
  roomType: string;
  status: RoomBoardStatus;
  guestName?: string;
  bookingId?: string;
  bookingCode?: string;
  bookingStatus?: BookingStatus;
  checkInDate?: string;
  checkOutDate?: string;
  paymentStatus?: string;
  totalAmount?: number;
  amountPaid?: number;
  balance?: number;
};

type RoomFinancialInsight = {
  revenue: number;
  paid: number;
  balance: number;
  paymentCount: number;
};

type FocusedFrontDeskView = {
  type: "room" | "booking" | "payment";
  roomNo?: string;
  bookingId?: string;
};

const DEFAULT_ROOMS: Array<{ roomNo: string; roomType: string }> = [
  { roomNo: "101", roomType: "Deluxe" },
  { roomNo: "102", roomType: "Deluxe" },
  { roomNo: "103", roomType: "Deluxe" },
  { roomNo: "104", roomType: "Deluxe" },
  { roomNo: "201", roomType: "Standard" },
  { roomNo: "202", roomType: "Standard" },
  { roomNo: "203", roomType: "Standard" },
  { roomNo: "204", roomType: "Standard" },
  { roomNo: "301", roomType: "Executive" },
  { roomNo: "302", roomType: "Executive" },
  { roomNo: "303", roomType: "Suite" },
  { roomNo: "304", roomType: "Suite" },
];

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function formatDateTime(value?: number) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function money(n?: number) {
  return Number.isFinite(Number(n)) ? Number(n).toFixed(2) : "0.00";
}

function getRoomBoardViewTitle(view: RoomBoardView | null) {
  if (view === "all") return "All Rooms";
  if (view === "available") return "Available Rooms";
  if (view === "occupied") return "Occupied Rooms";
  if (view === "reserved") return "Reserved Rooms";
  if (view === "dirty") return "Dirty Rooms";
  if (view === "out_of_service") return "Out of Service Rooms";
  return "Room Board";
}

function sumLedgerAmount(
  entries: CanonicalLedgerEntry[],
  field: "revenueAmount" | "collectionAmount"
) {
  return entries.reduce((sum, entry) => sum + (Number(entry[field]) || 0), 0);
}

function normalizeStatus(value: string): RoomBoardStatus {
  const v = String(value || "").toLowerCase();
  if (
    v === "available" ||
    v === "occupied" ||
    v === "reserved" ||
    v === "dirty" ||
    v === "out_of_service"
  ) {
    return v;
  }
  return "available";
}

function getRoomBackground(status: RoomBoardStatus) {
  switch (status) {
    case "occupied":
      return "rgba(37,99,235,0.08)";
    case "reserved":
      return "rgba(124,58,237,0.08)";
    case "dirty":
      return "rgba(217,119,6,0.08)";
    case "out_of_service":
      return "rgba(220,38,38,0.08)";
    default:
      return "rgba(16,185,129,0.08)";
  }
}

function canShowGuest(status: RoomBoardStatus) {
  return status === "occupied" || status === "reserved";
}

function bookingSortTime(booking: BookingRecord) {
  return Number(booking.updatedAt || booking.createdAt || 0);
}

function isPostStayStatus(status: RoomBoardStatus) {
  return status === "dirty" || status === "available";
}

function pickRoomBooking(
  current: BookingRecord | undefined,
  next: BookingRecord
) {
  if (!current) return next;

  const currentStatus = normalizeStatus(current.roomStatus);
  const nextStatus = normalizeStatus(next.roomStatus);
  const currentTime = bookingSortTime(current);
  const nextTime = bookingSortTime(next);

  if (nextTime !== currentTime) return nextTime > currentTime ? next : current;
  if (isPostStayStatus(nextStatus) !== isPostStayStatus(currentStatus)) {
    return isPostStayStatus(nextStatus) ? next : current;
  }

  return next.createdAt > current.createdAt ? next : current;
}

function buildRoomBoard(bookings: BookingRecord[]): RoomCard[] {
  const map = new Map<string, RoomCard>();
  const latestByRoom = new Map<string, BookingRecord>();

  DEFAULT_ROOMS.forEach((room) => {
    map.set(room.roomNo, {
      roomNo: room.roomNo,
      roomType: room.roomType,
      status: "available",
    });
  });

  bookings.forEach((b) => {
    const roomNo = String(b.roomNo || "").trim();
    if (!roomNo) return;
    latestByRoom.set(roomNo, pickRoomBooking(latestByRoom.get(roomNo), b));
  });

  latestByRoom.forEach((b, roomNo) => {

    const status = normalizeStatus(b.roomStatus);

    map.set(roomNo, {
      roomNo,
      roomType: b.roomType || map.get(roomNo)?.roomType || "Standard",
      status,
      guestName: canShowGuest(status) ? b.guestName : undefined,
      bookingId: b.id,
      bookingCode: canShowGuest(status) ? b.bookingCode : undefined,
      bookingStatus: b.bookingStatus,
      checkInDate: canShowGuest(status) ? b.checkInDate : undefined,
      checkOutDate: canShowGuest(status) ? b.checkOutDate : undefined,
      paymentStatus: canShowGuest(status) ? b.paymentStatus : undefined,
      totalAmount: b.totalAmount,
      amountPaid: b.amountPaid,
      balance: b.balance,
    });
  });

  return Array.from(map.values()).sort((a, b) => a.roomNo.localeCompare(b.roomNo));
}

export default function RoomBoardPanel() {
  const detailRef = useRef<HTMLDivElement | null>(null);
  const roomBoardRef = useRef<HTMLDivElement | null>(null);
  const [version, setVersion] = useState(0);
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const [selectedRoomNo, setSelectedRoomNo] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | RoomBoardStatus>("all");
  const [activeRoomBoardView, setActiveRoomBoardView] = useState<RoomBoardView | null>(null);
  const [focusedFrontDeskView, setFocusedFrontDeskView] = useState<FocusedFrontDeskView | null>(null);
  const [boardHighlighted, setBoardHighlighted] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const bookings = useMemo(() => {
    void version;
    return getAllBookings();
  }, [version]);

  const ledgerEntries = useMemo(() => {
    void ledgerVersion;
    return loadLedgerEntries();
  }, [ledgerVersion]);

  const frontDeskInsights = useMemo(
    () => generateFrontDeskInsights(ledgerEntries),
    [ledgerEntries]
  );

  const totalUnpaidBalance = useMemo(
    () =>
      frontDeskInsights.unpaidBookings.reduce(
        (sum, booking) => sum + booking.outstanding,
        0
      ),
    [frontDeskInsights]
  );

  useEffect(() => {
    const refreshBookings = () => setVersion((v) => v + 1);
    window.addEventListener(BOOKINGS_CHANGED_EVENT, refreshBookings);
    return () => window.removeEventListener(BOOKINGS_CHANGED_EVENT, refreshBookings);
  }, []);

  useEffect(() => {
    const refreshLedger = () => setLedgerVersion((v) => v + 1);
    window.addEventListener(FINANCIAL_LEDGER_CHANGED_EVENT, refreshLedger);
    window.addEventListener("storage", refreshLedger);
    return () => {
      window.removeEventListener(FINANCIAL_LEDGER_CHANGED_EVENT, refreshLedger);
      window.removeEventListener("storage", refreshLedger);
    };
  }, []);

  const rooms = useMemo(() => buildRoomBoard(bookings), [bookings]);

  const frontDeskActions = useMemo(
    () => generateFrontDeskRecommendedActions(ledgerEntries, rooms),
    [ledgerEntries, rooms]
  );

  const filteredRooms = useMemo(() => {
    if (filter === "all") return rooms;
    return rooms.filter((room) => room.status === filter);
  }, [rooms, filter]);

  const selectedRoom = useMemo(() => {
    if (!selectedRoomNo) return null;
    return filteredRooms.find((room) => room.roomNo === selectedRoomNo) || null;
  }, [filteredRooms, selectedRoomNo]);

  const selectedBooking = useMemo(() => {
    if (!selectedRoom?.bookingId) return null;
    return bookings.find((booking) => booking.id === selectedRoom.bookingId) || null;
  }, [bookings, selectedRoom]);

  const selectedFolioActivity = useMemo<BookingFolioActivity[]>(() => {
    return (selectedBooking?.folioActivity || []).filter(
      (activity) => activity.type === "charge" || activity.type === "payment"
    );
  }, [selectedBooking]);

  const selectedRoomInsight = useMemo<RoomFinancialInsight | null>(() => {
    if (!selectedRoom) return null;
    const roomEntries = ledgerEntries.filter((entry) => {
      const sameRoom = String(entry.roomNo || "").trim() === selectedRoom.roomNo;
      const sameBooking =
        selectedRoom.bookingId && entry.bookingId === selectedRoom.bookingId;
      return sameRoom || sameBooking;
    });

    if (roomEntries.length === 0) return null;

    const revenue = sumLedgerAmount(roomEntries, "revenueAmount");
    const paid = sumLedgerAmount(roomEntries, "collectionAmount");

    return {
      revenue,
      paid,
      balance: revenue - paid,
      paymentCount: roomEntries.filter((entry) => entry.collectionAmount > 0).length,
    };
  }, [ledgerEntries, selectedRoom]);

  const stats = useMemo(() => {
    return {
      available: rooms.filter((r) => r.status === "available").length,
      occupied: rooms.filter((r) => r.status === "occupied").length,
      reserved: rooms.filter((r) => r.status === "reserved").length,
      dirty: rooms.filter((r) => r.status === "dirty").length,
      out_of_service: rooms.filter((r) => r.status === "out_of_service").length,
    };
  }, [rooms]);

  useEffect(() => {
    if (filteredRooms.length === 0) {
      setSelectedRoomNo(null);
      return;
    }

    const stillExists = selectedRoomNo
      ? filteredRooms.some((room) => room.roomNo === selectedRoomNo)
      : false;

    if (!stillExists) {
      setSelectedRoomNo(filteredRooms[0].roomNo);
    }
  }, [filteredRooms, selectedRoomNo]);

  function refreshBoard(message?: string) {
    setVersion((v) => v + 1);
    if (message) setMsg(message);
  }

  function focusRoomBoard() {
    window.setTimeout(() => {
      roomBoardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      roomBoardRef.current?.focus();
    }, 0);
  }

  function handleFilterClick(nextFilter: RoomBoardView) {
    const nextRooms =
      nextFilter === "all"
        ? rooms
        : rooms.filter((room) => room.status === nextFilter);

    if (nextRooms.length > 0) {
      setSelectedRoomNo(nextRooms[0].roomNo);
    }

    setFilter(nextFilter);
    setActiveRoomBoardView(nextFilter);
    setBoardHighlighted(true);
    focusRoomBoard();
    window.setTimeout(() => setBoardHighlighted(false), 900);
  }

  function handleBackToOverview() {
    setFocusedFrontDeskView(null);
    setActiveRoomBoardView(null);
    setFilter("all");
    if (rooms.length > 0) setSelectedRoomNo(rooms[0].roomNo);
    focusRoomBoard();
  }

  function selectRoomContext(input: { bookingId?: string; roomNo?: string }) {
    const booking = input.bookingId
      ? bookings.find((item) => item.id === input.bookingId)
      : null;
    const roomNo = String(input.roomNo || booking?.roomNo || "").trim();

    if (!roomNo || !rooms.some((room) => room.roomNo === roomNo)) {
      setMsg("Booking record not found in current room board.");
      return null;
    }

    setFilter("all");
    setActiveRoomBoardView(null);
    setSelectedRoomNo(roomNo);
    setMsg(null);
    return { booking, roomNo };
  }

  function openFocusedFrontDeskView(
    view: FocusedFrontDeskView["type"],
    input: { bookingId?: string; roomNo?: string }
  ) {
    const context = selectRoomContext(input);
    if (!context) return;

    setFocusedFrontDeskView({
      type: view,
      roomNo: context.roomNo,
      bookingId: input.bookingId || context.booking?.id,
    });
  }

  function handleInsightAction(
    alert: FrontDeskInsightAlert,
    action: "collect" | "booking" | "room"
  ) {
    if (action === "collect") {
      openFocusedFrontDeskView("payment", alert);
      setMsg("Room selected. Use the existing booking/payment controls to collect payment.");
      return;
    }

    if (action === "booking") {
      openFocusedFrontDeskView("booking", alert);
      return;
    }

    openFocusedFrontDeskView("room", alert);
  }

  function selectActionRoom(action: FrontDeskRecommendedAction) {
    const booking = action.bookingId
      ? bookings.find((item) => item.id === action.bookingId)
      : null;
    const roomNo = String(action.roomNo || booking?.roomNo || "").trim();

    if (!roomNo) {
      setMsg("Booking record not found in current room board.");
      return null;
    }

    const room = rooms.find((item) => item.roomNo === roomNo) || null;
    if (!room) {
      setMsg("Booking record not found in current room board.");
      return null;
    }

    setFilter("all");
    setSelectedRoomNo(room.roomNo);
    setMsg(null);
    return room;
  }

  function handleRecommendedAction(
    action: FrontDeskRecommendedAction,
    command: "view_room" | "view_booking" | "collect_payment" | "mark_dirty" | "mark_available"
  ) {
    const room = selectActionRoom(action);
    if (!room) return;

    if (command === "view_room") {
      setFocusedFrontDeskView({
        type: "room",
        roomNo: room.roomNo,
        bookingId: action.bookingId,
      });
      return;
    }

    if (command === "view_booking" || command === "collect_payment") {
      if (command === "collect_payment") {
        setMsg("Room selected. Use the existing booking/payment controls to collect payment.");
      }
      setFocusedFrontDeskView({
        type: command === "collect_payment" ? "payment" : "booking",
        roomNo: room.roomNo,
        bookingId: action.bookingId,
      });
      return;
    }

    handleRoomStatusOnly(room, command === "mark_dirty" ? "dirty" : "available");
  }

  function handleRoomStatusOnly(room: RoomCard | null, status: RoomStatus) {
    if (!room?.bookingId) {
      setMsg("This room has no linked booking record to update.");
      return;
    }

    if (status === "available") {
      if (
        room.bookingStatus === "checked_in" ||
        room.status === "occupied"
      ) {
        setMsg("Check out the guest before marking the room available.");
        return;
      }

      if (room.bookingStatus === "reserved") {
        setMsg("This room has an active reservation. Update the reservation before marking it available.");
        return;
      }
    }

    if (status === "dirty") {
      if (
        room.bookingStatus === "checked_in" ||
        room.status === "occupied"
      ) {
        updateBooking(room.bookingId, {
          bookingStatus: "checked_out",
          roomStatus: normalizeRoomStatusForBookingStatus("checked_out"),
        });
        refreshBoard(`Guest checked out and room ${room.roomNo} marked dirty.`);
        return;
      }
    }

    updateBooking(room.bookingId, { roomStatus: status });
    refreshBoard(`Room ${room.roomNo} updated to ${status.replace(/_/g, " ")}.`);
  }

  function handleStatusOnly(status: RoomStatus) {
    handleRoomStatusOnly(selectedRoom, status);
  }

  function handleCheckIn() {
    if (!selectedRoom?.bookingId) {
      setMsg("This room has no reservation to check in.");
      return;
    }

    if (
      selectedRoom.bookingStatus !== "reserved" &&
      selectedRoom.status !== "reserved"
    ) {
      setMsg("Only reserved rooms can be checked in from the room board.");
      return;
    }

    updateBooking(selectedRoom.bookingId, {
      bookingStatus: "checked_in",
      roomStatus: normalizeRoomStatusForBookingStatus("checked_in"),
    });

    refreshBoard(`Guest checked in to room ${selectedRoom.roomNo}.`);
  }

  function handleCheckOut() {
    if (!selectedRoom?.bookingId) {
      setMsg("This room has no active booking to check out.");
      return;
    }

    if (
      selectedRoom.bookingStatus !== "checked_in" &&
      selectedRoom.status !== "occupied"
    ) {
      setMsg("Only occupied rooms can be checked out from the room board.");
      return;
    }

    updateBooking(selectedRoom.bookingId, {
      bookingStatus: "checked_out",
      roomStatus: normalizeRoomStatusForBookingStatus("checked_out"),
    });

    refreshBoard(`Guest checked out from room ${selectedRoom.roomNo}.`);
  }

  return (
    <div style={styles.wrap}>
      {msg ? <div style={styles.message}>{msg}</div> : null}

      {focusedFrontDeskView ? (
        <div style={styles.focusedDetailCard}>
          <button type="button" style={styles.backBtn} onClick={handleBackToOverview}>
            ← Back to Room Board Overview
          </button>
          <div style={styles.focusTitle}>
            {focusedFrontDeskView.type === "payment"
              ? "Collect Payment"
              : focusedFrontDeskView.type === "booking"
              ? "Booking Detail"
              : "Room Detail"}
          </div>

          {!selectedRoom ? (
            <div style={styles.emptyState}>Booking record not found in current room board.</div>
          ) : (
            <div style={styles.focusedGrid}>
              <div style={styles.detailBlock}>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Room</span>
                  <span style={styles.detailValue}>{selectedRoom.roomNo}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Status</span>
                  <span style={styles.detailValue}>{selectedRoom.status.replace(/_/g, " ")}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Guest</span>
                  <span style={styles.detailValue}>{selectedRoom.guestName || "—"}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Booking Code</span>
                  <span style={styles.detailValue}>{selectedRoom.bookingCode || "—"}</span>
                </div>
              </div>

              <div style={styles.detailBlock}>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Booking Revenue</span>
                  <span style={styles.detailValue}>
                    {money(selectedRoomInsight?.revenue ?? selectedRoom.totalAmount)}
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Amount Paid</span>
                  <span style={styles.detailValue}>
                    {money(selectedRoomInsight?.paid ?? selectedRoom.amountPaid)}
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Balance</span>
                  <span style={styles.detailValue}>
                    {money(selectedRoomInsight?.balance ?? selectedRoom.balance)}
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Payment Activity</span>
                  <span style={styles.detailValue}>
                    {selectedRoomInsight?.paymentCount ?? selectedFolioActivity.filter((item) => item.type === "payment").length} payment(s)
                  </span>
                </div>
              </div>
            </div>
          )}

          {focusedFrontDeskView.type === "payment" ? (
            <div style={styles.focusHint}>
              Use the existing booking/payment workflow for this selected room. No new payment system has been created.
            </div>
          ) : null}
        </div>
      ) : null}

      {!activeRoomBoardView ? (
        <>
          <div style={styles.topStats}>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Available</div>
              <div style={styles.statValue}>{stats.available}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Occupied</div>
              <div style={styles.statValue}>{stats.occupied}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Reserved</div>
              <div style={styles.statValue}>{stats.reserved}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Dirty</div>
              <div style={styles.statValue}>{stats.dirty}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Out of Service</div>
              <div style={styles.statValue}>{stats.out_of_service}</div>
            </div>
          </div>

          <div style={styles.filterRow}>
            <button
              type="button"
              style={filter === "all" ? styles.filterBtnActive : styles.filterBtn}
              onClick={() => handleFilterClick("all")}
            >
              All Rooms
            </button>
            <button
              type="button"
              style={filter === "available" ? styles.filterBtnActive : styles.filterBtn}
              onClick={() => handleFilterClick("available")}
            >
              Available
            </button>
            <button
              type="button"
              style={filter === "occupied" ? styles.filterBtnActive : styles.filterBtn}
              onClick={() => handleFilterClick("occupied")}
            >
              Occupied
            </button>
            <button
              type="button"
              style={filter === "reserved" ? styles.filterBtnActive : styles.filterBtn}
              onClick={() => handleFilterClick("reserved")}
            >
              Reserved
            </button>
            <button
              type="button"
              style={filter === "dirty" ? styles.filterBtnActive : styles.filterBtn}
              onClick={() => handleFilterClick("dirty")}
            >
              Dirty
            </button>
            <button
              type="button"
              style={filter === "out_of_service" ? styles.filterBtnActive : styles.filterBtn}
              onClick={() => handleFilterClick("out_of_service")}
            >
              Out of Service
            </button>
          </div>

          <div style={styles.insightsCard}>
            <div style={styles.sectionTitle}>Front Desk Insights</div>
            <div style={styles.insightGrid}>
              <div style={styles.insightItem}>
                <div style={styles.statLabel}>Unpaid bookings</div>
                <div style={styles.statValue}>{frontDeskInsights.unpaidBookings.length}</div>
              </div>
              <div style={styles.insightItem}>
                <div style={styles.statLabel}>Total unpaid balance</div>
                <div style={styles.statValue}>{money(totalUnpaidBalance)}</div>
              </div>
              <div style={styles.insightItem}>
                <div style={styles.statLabel}>Top revenue room</div>
                <div style={styles.statValue}>
                  {frontDeskInsights.topRooms[0]?.roomNo || "-"}
                </div>
                <div style={styles.insightMeta}>
                  {frontDeskInsights.topRooms[0]
                    ? money(frontDeskInsights.topRooms[0].revenue)
                    : "No room revenue"}
                </div>
              </div>
              <div style={styles.insightItem}>
                <div style={styles.statLabel}>Partial payments</div>
                <div style={styles.statValue}>{frontDeskInsights.partialPayments.length}</div>
              </div>
            </div>

            {frontDeskInsights.alerts.length > 0 ? (
              <div style={styles.alertList}>
            {frontDeskInsights.alerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                style={{
                  ...styles.alertItem,
                  ...(alert.type === "unpaid_booking_balance" ? styles.clickableAlertItem : {}),
                }}
                onClick={() => {
                  if (alert.type === "unpaid_booking_balance") {
                    openFocusedFrontDeskView("booking", alert);
                  }
                }}
              >
                <div>{alert.message}</div>
                {alert.type === "unpaid_booking_balance" ? (
                  <div style={styles.alertActionRow}>
                    <button
                      type="button"
                      style={styles.alertActionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInsightAction(alert, "collect");
                      }}
                    >
                      Collect Payment
                    </button>
                    <button
                      type="button"
                      style={styles.alertActionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInsightAction(alert, "booking");
                      }}
                    >
                      View Booking
                    </button>
                    <button
                      type="button"
                      style={styles.alertActionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInsightAction(alert, "room");
                      }}
                    >
                      View Room
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyState}>No front desk financial alerts right now.</div>
            )}
          </div>

          <div style={styles.insightsCard}>
            <div style={styles.sectionTitle}>Front Desk Recommended Actions</div>
            {frontDeskActions.length === 0 ? (
              <div style={styles.emptyState}>No front desk recommendations right now.</div>
            ) : (
              <div style={styles.recommendationList}>
                {frontDeskActions.map((action) => (
                  <div
                    key={action.id}
                    style={{
                      ...styles.recommendationItem,
                      ...(action.severity === "danger"
                        ? styles.recommendationDanger
                        : action.severity === "warning"
                        ? styles.recommendationWarning
                        : action.severity === "success"
                        ? styles.recommendationSuccess
                        : styles.recommendationInfo),
                    }}
                  >
                    <div style={styles.recommendationTop}>
                      <div>
                        <div style={styles.recommendationTitle}>{action.title}</div>
                        <div style={styles.recommendationMessage}>{action.message}</div>
                      </div>
                      <span style={styles.recommendationBadge}>{action.severity}</span>
                    </div>
                    <div style={styles.recommendationAction}>{action.recommendedAction}</div>
                    <div style={styles.alertActionRow}>
                      {action.roomNo ? (
                        <button
                          type="button"
                          style={styles.alertActionBtn}
                          onClick={() => handleRecommendedAction(action, "view_room")}
                        >
                          View Room
                        </button>
                      ) : null}
                      {action.bookingId ? (
                        <button
                          type="button"
                          style={styles.alertActionBtn}
                          onClick={() => handleRecommendedAction(action, "view_booking")}
                        >
                          View Booking
                        </button>
                      ) : null}
                      {action.actionType === "collect_payment" ||
                      action.actionType === "follow_up_before_checkout" ? (
                        <button
                          type="button"
                          style={styles.alertActionBtn}
                          onClick={() => handleRecommendedAction(action, "collect_payment")}
                        >
                          Collect Payment
                        </button>
                      ) : null}
                      {action.actionType === "send_housekeeping" ? (
                        <button
                          type="button"
                          style={styles.alertActionBtn}
                          onClick={() => handleRecommendedAction(action, "mark_available")}
                        >
                          Mark Available
                        </button>
                      ) : null}
                      {action.actionType === "follow_up_before_checkout" ? (
                        <button
                          type="button"
                          style={styles.alertActionBtn}
                          onClick={() => handleRecommendedAction(action, "mark_dirty")}
                        >
                          Mark Dirty
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={styles.focusHeader}>
          <button type="button" style={styles.backBtn} onClick={handleBackToOverview}>
            ← Back to Room Board Overview
          </button>
          <div style={styles.focusTitle}>{getRoomBoardViewTitle(activeRoomBoardView)}</div>
        </div>
      )}

      <div style={styles.layout}>
        <div
          ref={roomBoardRef}
          tabIndex={-1}
          style={{
            ...styles.boardCard,
            ...(boardHighlighted ? styles.boardCardHighlight : {}),
          }}
        >
          <div style={styles.sectionTitle}>{getRoomBoardViewTitle(activeRoomBoardView)}</div>

          {filteredRooms.length === 0 ? (
            <div style={styles.emptyBoard}>No rooms found in this status.</div>
          ) : (
            <div style={styles.roomGrid}>
              {filteredRooms.map((room) => {
                const color = roomStatusColor(room.status);
                const active = selectedRoomNo === room.roomNo;

                return (
                  <button
                    key={room.roomNo}
                    type="button"
                    onClick={() => setSelectedRoomNo(room.roomNo)}
                    style={{
                      ...styles.roomCard,
                      borderColor: active ? color : "rgba(11,42,58,0.10)",
                      background: getRoomBackground(room.status),
                      boxShadow: active ? `0 0 0 2px ${color}22` : "none",
                    }}
                  >
                    <div style={styles.roomTop}>
                      <div style={styles.roomNo}>{room.roomNo}</div>
                      <span
                        style={{
                          ...styles.statusBadge,
                          color,
                          borderColor: `${color}33`,
                          background: `${color}15`,
                        }}
                      >
                        {room.status.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div style={styles.roomType}>{room.roomType}</div>
                    <div style={styles.roomGuest}>{room.guestName || "No guest assigned"}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div ref={detailRef} tabIndex={-1} style={styles.detailCard}>
          <div style={styles.sectionTitle}>Room Detail</div>

          {!selectedRoom ? (
            <div style={styles.emptyState}>
              Select a room to view details and actions.
            </div>
          ) : (
            <>
              <div style={styles.detailBlock}>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Room</span>
                  <span style={styles.detailValue}>{selectedRoom.roomNo}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Type</span>
                  <span style={styles.detailValue}>{selectedRoom.roomType}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Guest</span>
                  <span style={styles.detailValue}>{selectedRoom.guestName || "—"}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Booking Code</span>
                  <span style={styles.detailValue}>{selectedRoom.bookingCode || "—"}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Check-In</span>
                  <span style={styles.detailValue}>{formatDate(selectedRoom.checkInDate)}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Check-Out</span>
                  <span style={styles.detailValue}>{formatDate(selectedRoom.checkOutDate)}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Payment</span>
                  <span style={styles.detailValue}>{selectedRoom.paymentStatus || "—"}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Total</span>
                  <span style={styles.detailValue}>{money(selectedRoom.totalAmount)}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Paid</span>
                  <span style={styles.detailValue}>{money(selectedRoom.amountPaid)}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Balance</span>
                  <span style={styles.detailValue}>{money(selectedRoom.balance)}</span>
                </div>
              </div>

              {selectedRoomInsight ? (
                <div style={styles.activityBlock}>
                  <div style={styles.activityTitle}>Room Financial Insight</div>
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Booking Revenue</span>
                    <span style={styles.detailValue}>{money(selectedRoomInsight.revenue)}</span>
                  </div>
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Amount Paid</span>
                    <span style={styles.detailValue}>{money(selectedRoomInsight.paid)}</span>
                  </div>
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Balance</span>
                    <span style={styles.detailValue}>{money(selectedRoomInsight.balance)}</span>
                  </div>
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Payment Activity</span>
                    <span style={styles.detailValue}>
                      {selectedRoomInsight.paymentCount} payment(s)
                    </span>
                  </div>
                </div>
              ) : null}

              {selectedFolioActivity.length > 0 ? (
                <div style={styles.activityBlock}>
                  <div style={styles.activityTitle}>Booking Activity</div>
                  {selectedFolioActivity.map((activity) => (
                    <div key={activity.id} style={styles.activityItem}>
                      <div style={styles.activityTop}>
                        <span>{activity.title}</span>
                        <b>{money(activity.amount)}</b>
                      </div>
                      <div style={styles.activityMeta}>
                        {formatDateTime(activity.createdAt)}
                        {activity.paymentMethod ? ` - ${activity.paymentMethod}` : ""}
                        {activity.transactionSource ? ` - ${activity.transactionSource}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div style={styles.actionGroup}>
                <button type="button" style={styles.primaryBtn} onClick={handleCheckIn}>
                  Check In
                </button>
                <button type="button" style={styles.primaryBtn} onClick={handleCheckOut}>
                  Check Out
                </button>
              </div>

              <div style={styles.actionGroup}>
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  onClick={() => handleStatusOnly("available")}
                >
                  Mark Available
                </button>
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  onClick={() => handleStatusOnly("dirty")}
                >
                  Mark Dirty
                </button>
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  onClick={() => handleStatusOnly("out_of_service")}
                >
                  Out of Service
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: "grid",
    gap: 12,
    marginTop: 12,
  },
  message: {
    padding: "12px 14px",
    borderRadius: 8,
    background: "rgba(18,94,60,0.10)",
    border: "1px solid rgba(18,94,60,0.18)",
    color: "#125e3c",
    fontWeight: 800,
  },
  topStats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  },
  statCard: {
    padding: "12px 14px",
    borderRadius: 8,
    background: "#ffffff",
    border: "1px solid rgba(11,42,58,0.08)",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "#64748b",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 900,
    color: "#0b2a3a",
  },
  insightsCard: {
    padding: 14,
    borderRadius: 8,
    background: "#ffffff",
    border: "1px solid rgba(11,42,58,0.10)",
  },
  insightGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  },
  insightItem: {
    padding: "12px 14px",
    borderRadius: 8,
    background: "rgba(248,250,252,0.92)",
    border: "1px solid rgba(11,42,58,0.08)",
  },
  insightMeta: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
  },
  alertList: {
    display: "grid",
    gap: 8,
    marginTop: 12,
  },
  alertItem: {
    padding: 10,
    borderRadius: 8,
    background: "rgba(245,158,11,0.10)",
    border: "1px solid rgba(245,158,11,0.22)",
    color: "#78350f",
    fontWeight: 800,
  },
  clickableAlertItem: {
    cursor: "pointer",
  },
  alertActionRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 10,
  },
  alertActionBtn: {
    border: "1px solid rgba(120,53,15,0.22)",
    background: "#ffffff",
    color: "#78350f",
    borderRadius: 8,
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
  recommendationList: {
    display: "grid",
    gap: 10,
  },
  recommendationItem: {
    padding: 12,
    borderRadius: 8,
    border: "1px solid rgba(11,42,58,0.10)",
  },
  recommendationDanger: {
    background: "rgba(220,38,38,0.08)",
    borderColor: "rgba(220,38,38,0.20)",
  },
  recommendationWarning: {
    background: "rgba(245,158,11,0.10)",
    borderColor: "rgba(245,158,11,0.22)",
  },
  recommendationInfo: {
    background: "rgba(37,99,235,0.08)",
    borderColor: "rgba(37,99,235,0.18)",
  },
  recommendationSuccess: {
    background: "rgba(16,185,129,0.08)",
    borderColor: "rgba(16,185,129,0.18)",
  },
  recommendationTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  recommendationTitle: {
    color: "#0b2a3a",
    fontWeight: 900,
  },
  recommendationMessage: {
    marginTop: 4,
    color: "#334155",
    fontWeight: 800,
    lineHeight: 1.4,
  },
  recommendationAction: {
    marginTop: 8,
    color: "#0b2a3a",
    fontSize: 13,
    fontWeight: 900,
  },
  recommendationBadge: {
    borderRadius: 999,
    padding: "4px 8px",
    background: "#ffffff",
    color: "#0b2a3a",
    border: "1px solid rgba(11,42,58,0.12)",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  focusHeader: {
    padding: 14,
    borderRadius: 8,
    background: "#ffffff",
    border: "1px solid rgba(11,42,58,0.10)",
  },
  backBtn: {
    border: "1px solid rgba(11,42,58,0.18)",
    background: "#ffffff",
    color: "#0b2a3a",
    borderRadius: 8,
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: 900,
    marginBottom: 12,
  },
  focusTitle: {
    color: "#0b2a3a",
    fontSize: 22,
    fontWeight: 900,
  },
  focusedDetailCard: {
    padding: 14,
    borderRadius: 8,
    background: "#ffffff",
    border: "1px solid rgba(11,42,58,0.10)",
  },
  focusedGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
    marginTop: 12,
  },
  focusHint: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    background: "rgba(37,99,235,0.08)",
    border: "1px solid rgba(37,99,235,0.18)",
    color: "#1e3a8a",
    fontWeight: 800,
  },
  filterRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    borderBottom: "1px solid rgba(11,42,58,0.12)",
    position: "sticky",
    top: 0,
    zIndex: 5,
    background: "#ffffff",
  },
  filterBtn: {
    border: "none",
    borderBottom: "2px solid transparent",
    background: "transparent",
    color: "#334155",
    padding: "10px 0 9px",
    borderRadius: 0,
    fontWeight: 800,
    cursor: "pointer",
  },
  filterBtnActive: {
    border: "none",
    borderBottom: "2px solid #0b2a3a",
    background: "transparent",
    color: "#0b2a3a",
    padding: "10px 0 9px",
    borderRadius: 0,
    fontWeight: 900,
    cursor: "pointer",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "1.5fr 0.9fr",
    gap: 12,
    alignItems: "start",
  },
  boardCard: {
    padding: 14,
    borderRadius: 8,
    background: "#ffffff",
    border: "1px solid rgba(11,42,58,0.10)",
    minHeight: 360,
    transition: "box-shadow 180ms ease, border-color 180ms ease",
  },
  boardCardHighlight: {
    borderColor: "rgba(209,168,75,0.75)",
    boxShadow: "0 0 0 3px rgba(209,168,75,0.18), 0 10px 28px rgba(15,23,42,0.10)",
  },
  detailCard: {
    padding: 14,
    borderRadius: 8,
    background: "#ffffff",
    border: "1px solid rgba(11,42,58,0.10)",
    position: "sticky",
    top: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0b2a3a",
    marginBottom: 14,
  },
  roomGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  roomCard: {
    border: "1px solid rgba(11,42,58,0.10)",
    borderRadius: 8,
    padding: 12,
    cursor: "pointer",
    textAlign: "left",
  },
  roomTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },
  roomNo: {
    fontSize: 24,
    fontWeight: 900,
    color: "#0b2a3a",
  },
  roomType: {
    marginTop: 8,
    color: "#64748b",
    fontWeight: 800,
  },
  roomGuest: {
    marginTop: 10,
    color: "#0b2a3a",
    fontWeight: 800,
    lineHeight: 1.4,
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
    border: "1px solid transparent",
    textTransform: "capitalize",
  },
  detailBlock: {
    display: "grid",
    gap: 10,
    marginBottom: 18,
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 8,
    borderBottom: "1px solid rgba(11,42,58,0.08)",
  },
  detailLabel: {
    color: "#64748b",
    fontWeight: 800,
  },
  detailValue: {
    color: "#0b2a3a",
    fontWeight: 900,
    textAlign: "right",
  },
  activityBlock: {
    display: "grid",
    gap: 8,
    marginBottom: 18,
  },
  activityTitle: {
    color: "#0b2a3a",
    fontWeight: 900,
  },
  activityItem: {
    padding: 10,
    borderRadius: 8,
    background: "rgba(248,250,252,0.92)",
    border: "1px solid rgba(11,42,58,0.08)",
  },
  activityTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    color: "#0b2a3a",
    fontWeight: 900,
  },
  activityMeta: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
  },
  actionGroup: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 12,
  },
  primaryBtn: {
    border: "none",
    cursor: "pointer",
    padding: "11px 16px",
    borderRadius: 8,
    background: "#0b2a3a",
    color: "white",
    fontWeight: 900,
  },
  secondaryBtn: {
    border: "1px solid rgba(11,42,58,0.18)",
    cursor: "pointer",
    padding: "11px 16px",
    borderRadius: 8,
    background: "white",
    color: "#0b2a3a",
    fontWeight: 900,
  },
  emptyState: {
    color: "#64748b",
    fontWeight: 800,
    lineHeight: 1.6,
  },
  emptyBoard: {
    minHeight: 200,
    borderRadius: 8,
    border: "1px dashed rgba(11,42,58,0.14)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#64748b",
    fontWeight: 800,
    background: "rgba(248,250,252,0.72)",
  },
};
