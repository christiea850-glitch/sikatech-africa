import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  getAllBookings,
  roomStatusColor,
  updateBooking,
  type BookingRecord,
  type RoomStatus,
} from "./bookingsStorage";

type RoomBoardStatus =
  | "available"
  | "occupied"
  | "reserved"
  | "dirty"
  | "out_of_service";

type RoomCard = {
  roomNo: string;
  roomType: string;
  status: RoomBoardStatus;
  guestName?: string;
  bookingId?: string;
  bookingCode?: string;
  checkInDate?: string;
  checkOutDate?: string;
  paymentStatus?: string;
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

function buildRoomBoard(bookings: BookingRecord[]): RoomCard[] {
  const map = new Map<string, RoomCard>();

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

    const status = normalizeStatus(b.roomStatus);

    map.set(roomNo, {
      roomNo,
      roomType: b.roomType || map.get(roomNo)?.roomType || "Standard",
      status,
      guestName: canShowGuest(status) ? b.guestName : undefined,
      bookingId: b.id,
      bookingCode: canShowGuest(status) ? b.bookingCode : undefined,
      checkInDate: canShowGuest(status) ? b.checkInDate : undefined,
      checkOutDate: canShowGuest(status) ? b.checkOutDate : undefined,
      paymentStatus: canShowGuest(status) ? b.paymentStatus : undefined,
    });
  });

  return Array.from(map.values()).sort((a, b) => a.roomNo.localeCompare(b.roomNo));
}

export default function RoomBoardPanel() {
  const [version, setVersion] = useState(0);
  const [selectedRoomNo, setSelectedRoomNo] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | RoomBoardStatus>("all");
  const [msg, setMsg] = useState<string | null>(null);

  const bookings = useMemo(() => {
    void version;
    return getAllBookings();
  }, [version]);

  const rooms = useMemo(() => buildRoomBoard(bookings), [bookings]);

  const filteredRooms = useMemo(() => {
    if (filter === "all") return rooms;
    return rooms.filter((room) => room.status === filter);
  }, [rooms, filter]);

  const selectedRoom = useMemo(() => {
    if (!selectedRoomNo) return null;
    return filteredRooms.find((room) => room.roomNo === selectedRoomNo) || null;
  }, [filteredRooms, selectedRoomNo]);

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

  function handleStatusOnly(status: RoomStatus) {
    if (!selectedRoom?.bookingId) {
      setMsg("This room has no linked booking record to update.");
      return;
    }

    updateBooking(selectedRoom.bookingId, { roomStatus: status });
    refreshBoard(`Room ${selectedRoom.roomNo} updated to ${status.replace(/_/g, " ")}.`);
  }

  function handleCheckIn() {
    if (!selectedRoom?.bookingId) {
      setMsg("This room has no reservation to check in.");
      return;
    }

    updateBooking(selectedRoom.bookingId, {
      bookingStatus: "checked_in",
      roomStatus: "occupied",
    });

    refreshBoard(`Guest checked in to room ${selectedRoom.roomNo}.`);
  }

  function handleCheckOut() {
    if (!selectedRoom?.bookingId) {
      setMsg("This room has no active booking to check out.");
      return;
    }

    updateBooking(selectedRoom.bookingId, {
      bookingStatus: "checked_out",
      roomStatus: "dirty",
    });

    refreshBoard(`Guest checked out from room ${selectedRoom.roomNo}.`);
  }

  return (
    <div style={styles.wrap}>
      {msg ? <div style={styles.message}>{msg}</div> : null}

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
          onClick={() => setFilter("all")}
        >
          All Rooms
        </button>
        <button
          type="button"
          style={filter === "available" ? styles.filterBtnActive : styles.filterBtn}
          onClick={() => setFilter("available")}
        >
          Available
        </button>
        <button
          type="button"
          style={filter === "occupied" ? styles.filterBtnActive : styles.filterBtn}
          onClick={() => setFilter("occupied")}
        >
          Occupied
        </button>
        <button
          type="button"
          style={filter === "reserved" ? styles.filterBtnActive : styles.filterBtn}
          onClick={() => setFilter("reserved")}
        >
          Reserved
        </button>
        <button
          type="button"
          style={filter === "dirty" ? styles.filterBtnActive : styles.filterBtn}
          onClick={() => setFilter("dirty")}
        >
          Dirty
        </button>
        <button
          type="button"
          style={filter === "out_of_service" ? styles.filterBtnActive : styles.filterBtn}
          onClick={() => setFilter("out_of_service")}
        >
          Out of Service
        </button>
      </div>

      <div style={styles.layout}>
        <div style={styles.boardCard}>
          <div style={styles.sectionTitle}>Room Board</div>

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

        <div style={styles.detailCard}>
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
              </div>

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
    gap: 16,
    marginTop: 14,
  },
  message: {
    padding: "12px 14px",
    borderRadius: 12,
    background: "rgba(18,94,60,0.10)",
    border: "1px solid rgba(18,94,60,0.18)",
    color: "#125e3c",
    fontWeight: 800,
  },
  topStats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 14,
  },
  statCard: {
    padding: 16,
    borderRadius: 18,
    background: "#ffffff",
    border: "1px solid rgba(11,42,58,0.08)",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
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
    fontSize: 28,
    fontWeight: 900,
    color: "#0b2a3a",
  },
  filterRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  filterBtn: {
    border: "1px solid rgba(11,42,58,0.12)",
    background: "#fff",
    color: "#334155",
    padding: "10px 14px",
    borderRadius: 999,
    fontWeight: 900,
    cursor: "pointer",
  },
  filterBtnActive: {
    border: "1px solid #0b2a3a",
    background: "#0b2a3a",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: 999,
    fontWeight: 900,
    cursor: "pointer",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "1.5fr 0.9fr",
    gap: 16,
    alignItems: "start",
  },
  boardCard: {
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(11,42,58,0.08)",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
    minHeight: 360,
  },
  detailCard: {
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(11,42,58,0.08)",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
    position: "sticky",
    top: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 900,
    color: "#0b2a3a",
    marginBottom: 14,
  },
  roomGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  roomCard: {
    border: "1px solid rgba(11,42,58,0.10)",
    borderRadius: 18,
    padding: 14,
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
    borderRadius: 12,
    background: "#0b2a3a",
    color: "white",
    fontWeight: 900,
  },
  secondaryBtn: {
    border: "1px solid rgba(11,42,58,0.18)",
    cursor: "pointer",
    padding: "11px 16px",
    borderRadius: 12,
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
    borderRadius: 16,
    border: "1px dashed rgba(11,42,58,0.14)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#64748b",
    fontWeight: 800,
    background: "rgba(248,250,252,0.72)",
  },
};