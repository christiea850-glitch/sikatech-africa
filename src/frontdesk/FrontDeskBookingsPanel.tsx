import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  bookingStatusColor,
  createBooking,
  getAllBookings,
  isFuture,
  isToday,
  paymentStatusColor,
  roomStatusColor,
  type BookingRecord,
  type BookingSource,
  type BookingStatus,
  type PaymentStatus,
  type RoomStatus,
} from "./bookingsStorage";

function money(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function tomorrowInputValue() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value}</div>
    </div>
  );
}

function badgeStyle(color: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
    background: `${color}15`,
    color,
    border: `1px solid ${color}22`,
    whiteSpace: "nowrap",
  };
}

export default function FrontDeskBookingsPanel() {
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [roomType, setRoomType] = useState("Standard");
  const [checkInDate, setCheckInDate] = useState(todayInputValue());
  const [checkOutDate, setCheckOutDate] = useState(tomorrowInputValue());
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [bookingSource, setBookingSource] = useState<BookingSource>("walk_in");
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>("reserved");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("unpaid");
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("reserved");
  const [totalAmount, setTotalAmount] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  const bookings = useMemo(() => {
    void version;
    return getAllBookings();
  }, [version]);

  const stats = useMemo(() => {
    const arrivalsToday = bookings.filter((b) => isToday(b.checkInDate)).length;
    const departuresToday = bookings.filter((b) => isToday(b.checkOutDate)).length;
    const occupiedRooms = bookings.filter((b) => b.roomStatus === "occupied").length;
    const availableRooms = Math.max(
      0,
      40 -
        bookings.filter(
          (b) => b.roomStatus === "occupied" || b.roomStatus === "reserved"
        ).length
    );
    const upcomingReservations = bookings.filter(
      (b) => isFuture(b.checkInDate) && b.bookingStatus === "reserved"
    ).length;
    const unpaidBalances = bookings.filter((b) => b.balance > 0).length;

    return {
      arrivalsToday,
      departuresToday,
      occupiedRooms,
      availableRooms,
      upcomingReservations,
      unpaidBalances,
    };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;

    return bookings.filter((b) => {
      return (
        b.bookingCode.toLowerCase().includes(q) ||
        b.guestName.toLowerCase().includes(q) ||
        (b.guestPhone || "").toLowerCase().includes(q) ||
        (b.guestEmail || "").toLowerCase().includes(q) ||
        b.roomNo.toLowerCase().includes(q) ||
        b.roomType.toLowerCase().includes(q) ||
        (b.notes || "").toLowerCase().includes(q)
      );
    });
  }, [bookings, search]);

  function resetForm() {
    setGuestName("");
    setGuestPhone("");
    setGuestEmail("");
    setRoomNo("");
    setRoomType("Standard");
    setCheckInDate(todayInputValue());
    setCheckOutDate(tomorrowInputValue());
    setAdults(1);
    setChildren(0);
    setBookingSource("walk_in");
    setBookingStatus("reserved");
    setPaymentStatus("unpaid");
    setRoomStatus("reserved");
    setTotalAmount(0);
    setAmountPaid(0);
    setNotes("");
  }

  function handleCreateBooking() {
    if (!guestName.trim()) {
      setMsg("Guest name is required.");
      return;
    }

    if (!roomNo.trim()) {
      setMsg("Room number is required.");
      return;
    }

    if (!checkInDate || !checkOutDate) {
      setMsg("Check-in and check-out dates are required.");
      return;
    }

    const booking = createBooking({
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim() || undefined,
      guestEmail: guestEmail.trim() || undefined,
      roomNo: roomNo.trim(),
      roomType,
      checkInDate,
      checkOutDate,
      adults,
      children,
      bookingSource,
      bookingStatus,
      paymentStatus,
      roomStatus,
      totalAmount,
      amountPaid,
      notes: notes.trim() || undefined,
      createdBy: { employeeId: "frontdesk01", role: "staff" },
    });

    setMsg(`Reservation created successfully: ${booking.bookingCode}`);
    resetForm();
    setVersion((v) => v + 1);
  }

  return (
    <div style={styles.wrap}>
      {msg ? <div style={styles.message}>{msg}</div> : null}

      <div style={styles.kpiGrid}>
        <KpiCard label="Today's Arrivals" value={stats.arrivalsToday} />
        <KpiCard label="Today's Departures" value={stats.departuresToday} />
        <KpiCard label="Occupied Rooms" value={stats.occupiedRooms} />
        <KpiCard label="Available Rooms" value={stats.availableRooms} />
        <KpiCard label="Upcoming Reservations" value={stats.upcomingReservations} />
        <KpiCard label="Unpaid Balances" value={stats.unpaidBalances} />
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>New Reservation</div>

        <div style={styles.formGrid}>
          <div style={styles.field}>
            <label style={styles.label}>Guest Name</label>
            <input
              style={styles.input}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Guest full name"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Guest Phone</label>
            <input
              style={styles.input}
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="Phone"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Guest Email</label>
            <input
              style={styles.input}
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="Email"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Room No</label>
            <input
              style={styles.input}
              value={roomNo}
              onChange={(e) => setRoomNo(e.target.value)}
              placeholder="101"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Room Type</label>
            <select
              style={styles.input}
              value={roomType}
              onChange={(e) => setRoomType(e.target.value)}
            >
              <option>Standard</option>
              <option>Deluxe</option>
              <option>Executive</option>
              <option>Suite</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Booking Source</label>
            <select
              style={styles.input}
              value={bookingSource}
              onChange={(e) => setBookingSource(e.target.value as BookingSource)}
            >
              <option value="walk_in">Walk-in</option>
              <option value="phone">Phone</option>
              <option value="online">Online</option>
              <option value="corporate">Corporate</option>
              <option value="agent">Agent</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Check-In Date</label>
            <input
              type="date"
              style={styles.input}
              value={checkInDate}
              onChange={(e) => setCheckInDate(e.target.value)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Check-Out Date</label>
            <input
              type="date"
              style={styles.input}
              value={checkOutDate}
              onChange={(e) => setCheckOutDate(e.target.value)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Adults</label>
            <input
              type="number"
              min={1}
              style={styles.input}
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Children</label>
            <input
              type="number"
              min={0}
              style={styles.input}
              value={children}
              onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Booking Status</label>
            <select
              style={styles.input}
              value={bookingStatus}
              onChange={(e) => setBookingStatus(e.target.value as BookingStatus)}
            >
              <option value="reserved">Reserved</option>
              <option value="checked_in">Checked In</option>
              <option value="checked_out">Checked Out</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Payment Status</label>
            <select
              style={styles.input}
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
            >
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Room Status</label>
            <select
              style={styles.input}
              value={roomStatus}
              onChange={(e) => setRoomStatus(e.target.value as RoomStatus)}
            >
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="reserved">Reserved</option>
              <option value="dirty">Dirty</option>
              <option value="out_of_service">Out of Service</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Total Amount</label>
            <input
              type="number"
              min={0}
              style={styles.input}
              value={totalAmount}
              onChange={(e) => setTotalAmount(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Amount Paid</label>
            <input
              type="number"
              min={0}
              style={styles.input}
              value={amountPaid}
              onChange={(e) => setAmountPaid(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div style={{ ...styles.field, gridColumn: "1 / -1" }}>
            <label style={styles.label}>Notes</label>
            <input
              style={styles.input}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special request, arrival notes, etc."
            />
          </div>
        </div>

        <div style={styles.actionRow}>
          <button type="button" style={styles.primaryBtn} onClick={handleCreateBooking}>
            Save Reservation
          </button>
          <button type="button" style={styles.secondaryBtn} onClick={resetForm}>
            Reset
          </button>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>Reservation Board</div>

        <div style={styles.searchRow}>
          <input
            style={styles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search booking code, guest, room..."
          />
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Booking</th>
                <th style={styles.th}>Guest</th>
                <th style={styles.th}>Room</th>
                <th style={styles.th}>Check-In</th>
                <th style={styles.th}>Check-Out</th>
                <th style={styles.th}>Booking</th>
                <th style={styles.th}>Payment</th>
                <th style={styles.th}>Room</th>
                <th style={styles.th}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((b: BookingRecord) => (
                <tr key={b.id}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 900 }}>{b.bookingCode}</div>
                    <div style={styles.subMeta}>{b.bookingSource}</div>
                  </td>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 800 }}>{b.guestName}</div>
                    <div style={styles.subMeta}>{b.guestPhone || "—"}</div>
                  </td>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 800 }}>{b.roomNo}</div>
                    <div style={styles.subMeta}>{b.roomType}</div>
                  </td>
                  <td style={styles.td}>{formatDate(b.checkInDate)}</td>
                  <td style={styles.td}>{formatDate(b.checkOutDate)}</td>
                  <td style={styles.td}>
                    <span style={badgeStyle(bookingStatusColor(b.bookingStatus))}>
                      {b.bookingStatus}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={badgeStyle(paymentStatusColor(b.paymentStatus))}>
                      {b.paymentStatus}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={badgeStyle(roomStatusColor(b.roomStatus))}>
                      {b.roomStatus}
                    </span>
                  </td>
                  <td style={styles.td}>{money(b.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredBookings.length === 0 ? (
          <div style={styles.empty}>No reservations found.</div>
        ) : null}
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
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 14,
  },
  card: {
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(11,42,58,0.08)",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 900,
    color: "#0b2a3a",
    marginBottom: 14,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontWeight: 800,
    color: "#0b2a3a",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(11,42,58,0.14)",
    background: "white",
    fontSize: 15,
  },
  actionRow: {
    display: "flex",
    gap: 10,
    marginTop: 16,
    flexWrap: "wrap",
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
  searchRow: {
    marginBottom: 12,
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
  },
  th: {
    textAlign: "left",
    padding: "10px 10px",
    borderBottom: "1px solid rgba(11,42,58,0.12)",
    color: "rgba(11,42,58,0.8)",
    fontSize: 12,
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  td: {
    padding: "12px 10px",
    borderBottom: "1px solid rgba(11,42,58,0.08)",
    whiteSpace: "nowrap",
    verticalAlign: "top",
    color: "#0b2a3a",
    fontWeight: 700,
  },
  subMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748b",
    fontWeight: 700,
  },
  empty: {
    marginTop: 12,
    color: "#64748b",
    fontWeight: 800,
  },
  kpiCard: {
    padding: 16,
    borderRadius: 18,
    background: "#ffffff",
    border: "1px solid rgba(11,42,58,0.08)",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "#64748b",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: 900,
    color: "#0b2a3a",
  },
};