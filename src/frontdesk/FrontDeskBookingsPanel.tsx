import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../auth/AuthContext";
import { useShift } from "../shifts/ShiftContext";
import {
  bookingStatusColor,
  BOOKINGS_CHANGED_EVENT,
  createBooking,
  getAllBookings,
  getBookingById,
  isFuture,
  isToday,
  normalizeRoomStatusForBookingStatus,
  paymentStatusColor,
  recordPaymentToBooking,
  roomStatusColor,
  type BookingFolioActivity,
  type BookingRecord,
  type FolioPaymentMethod,
  type BookingSource,
  type BookingStatus,
  type PaymentStatus,
  type RoomStatus,
} from "./bookingsStorage";

function money(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function formatDateTime(value?: number) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
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

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.formSection}>
      <div style={styles.formSectionTitle}>{title}</div>
      <div style={styles.formGrid}>{children}</div>
    </div>
  );
}

export default function FrontDeskBookingsPanel() {
  const { user } = useAuth();
  const { activeShift } = useShift() as any;
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
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [folioPaymentAmount, setFolioPaymentAmount] = useState(0);
  const [folioPaymentMethod, setFolioPaymentMethod] =
    useState<FolioPaymentMethod>("cash");
  const [folioPaymentNote, setFolioPaymentNote] = useState("");

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

  const selectedBooking = useMemo<BookingRecord | null>(() => {
    if (!selectedBookingId) return null;
    return (
      bookings.find((booking: BookingRecord) => booking.id === selectedBookingId) ||
      null
    );
  }, [bookings, selectedBookingId]);

  const selectedCharges = useMemo<BookingFolioActivity[]>(() => {
    return (selectedBooking?.folioActivity || []).filter(
      (item) => item.type === "charge"
    );
  }, [selectedBooking]);

  const selectedPayments = useMemo<BookingFolioActivity[]>(() => {
    return (selectedBooking?.folioActivity || []).filter(
      (item) => item.type === "payment"
    );
  }, [selectedBooking]);

  const selectedAmounts = useMemo(() => {
    const total = Math.max(0, Number(selectedBooking?.totalAmount ?? 0) || 0);
    const paid = Math.min(total, Math.max(0, Number(selectedBooking?.amountPaid ?? 0) || 0));
    return {
      totalAmount: total,
      amountPaid: paid,
      balance: Math.max(0, total - paid),
    };
  }, [selectedBooking]);

  useEffect(() => {
    const refreshBookings = () => setVersion((v) => v + 1);
    window.addEventListener(BOOKINGS_CHANGED_EVENT, refreshBookings);
    return () => window.removeEventListener(BOOKINGS_CHANGED_EVENT, refreshBookings);
  }, []);

  function resetFolioPaymentForm() {
    setFolioPaymentAmount(0);
    setFolioPaymentMethod("cash");
    setFolioPaymentNote("");
  }

  function selectBooking(id: string | null) {
    resetFolioPaymentForm();
    setSelectedBookingId(id);
  }

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
      roomStatus: normalizeRoomStatusForBookingStatus(bookingStatus, roomStatus),
      totalAmount,
      amountPaid,
      notes: notes.trim() || undefined,
      createdBy: { employeeId: "frontdesk01", role: "staff" },
    });

    setMsg(`Reservation created successfully: ${booking.bookingCode}`);
    resetForm();
    setVersion((v) => v + 1);
  }

  function handleRecordPayment() {
    if (!selectedBookingId) return;

    const latestBooking = getBookingById(selectedBookingId);
    if (!latestBooking) {
      setMsg("Booking was not found.");
      return;
    }

    const total = roundMoney(Math.max(0, Number(latestBooking.totalAmount) || 0));
    const paid = roundMoney(Math.min(total, Math.max(0, Number(latestBooking.amountPaid) || 0)));
    const balance = roundMoney(Math.max(0, total - paid));
    const amount = roundMoney(Math.max(0, Number(folioPaymentAmount) || 0));

    if (balance <= 0.01) {
      setMsg("This booking has no unpaid balance.");
      return;
    }

    if (amount <= 0) {
      setMsg("Enter a payment amount greater than 0.");
      return;
    }

    if (amount > balance + 0.01) {
      setMsg("Payment cannot be greater than the unpaid balance.");
      return;
    }

    try {
      const submittedBy =
        user?.employeeId || (user as any)?.username || (user as any)?.name || user?.role;
      const updated = recordPaymentToBooking(latestBooking.id, {
        amount,
        paymentMethod: folioPaymentMethod,
        source: "front-desk",
        note: folioPaymentNote.trim() || undefined,
        shiftId: activeShift?.id ? String(activeShift.id) : undefined,
        shiftStatus: activeShift?.id ? "open" : "unclosed",
        submittedAt: new Date().toISOString(),
        submittedBy,
        submissionMode: "manual",
      });
      const remainingBalance = roundMoney(
        Math.max(0, Number(updated?.balance ?? balance - amount) || 0)
      );

      setMsg(`Payment recorded. Remaining balance: ${money(remainingBalance)}.`);
      setFolioPaymentAmount(0);
      setFolioPaymentNote("");
      setVersion((v) => v + 1);
    } catch (error: unknown) {
      setMsg(
        error instanceof Error && error.message
          ? error.message
          : "Unable to record payment."
      );
    }
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
        <div style={styles.cardHeader}>
          <div>
            <div style={styles.sectionTitle}>New Reservation</div>
            <div style={styles.sectionSubtitle}>Capture the booking details in a few focused groups.</div>
          </div>
        </div>

        <div style={styles.reservationForm}>
          <FormSection title="Guest">
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
          </FormSection>

          <FormSection title="Stay">
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
          </FormSection>

          <FormSection title="Status">
            <div style={styles.field}>
              <label style={styles.label}>Booking Status</label>
              <select
                style={styles.input}
                value={bookingStatus}
                onChange={(e) => {
                  const next = e.target.value as BookingStatus;
                  setBookingStatus(next);
                  setRoomStatus((prev) =>
                    normalizeRoomStatusForBookingStatus(next, prev)
                  );
                }}
              >
                <option value="reserved">Reserved</option>
                <option value="checked_in">Checked In</option>
                <option value="checked_out">Checked Out</option>
                <option value="cancelled">Cancelled</option>
                <option value="no_show">No Show</option>
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
          </FormSection>

          <FormSection title="Payment">
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
          </FormSection>

          <FormSection title="Notes">
            <div style={{ ...styles.field, gridColumn: "1 / -1" }}>
              <label style={styles.label}>Notes</label>
              <input
                style={styles.input}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special request, arrival notes, etc."
              />
            </div>
          </FormSection>
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
                <tr
                  key={b.id}
                  onClick={() => selectBooking(b.id)}
                  style={{
                    ...styles.clickableRow,
                    ...(selectedBookingId === b.id ? styles.selectedRow : {}),
                  }}
                >
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

        {selectedBooking ? (
          <div style={styles.detailPanel}>
            <div style={styles.detailHeader}>
              <div>
                <div style={styles.detailTitle}>{selectedBooking.guestName}</div>
                <div style={styles.subMeta}>
                  Room {selectedBooking.roomNo} • {selectedBooking.bookingCode}
                </div>
              </div>
              <button
                type="button"
                style={styles.secondaryBtn}
                onClick={() => selectBooking(null)}
              >
                Close
              </button>
            </div>

            <div style={styles.detailGrid}>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Check-In</span>
                <b>{formatDate(selectedBooking.checkInDate)}</b>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Check-Out</span>
                <b>{formatDate(selectedBooking.checkOutDate)}</b>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Booking Status</span>
                <b>{selectedBooking.bookingStatus}</b>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Payment Status</span>
                <b>{selectedBooking.paymentStatus}</b>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Total Amount</span>
                <b>{money(selectedAmounts.totalAmount)}</b>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Amount Paid</span>
                <b>{money(selectedAmounts.amountPaid)}</b>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Unpaid Balance</span>
                <b>{money(selectedAmounts.balance)}</b>
              </div>
            </div>

            <div style={styles.activityGrid}>
              <div style={styles.activitySection}>
                <div style={styles.activityTitle}>Room / Folio Charges</div>
                {selectedCharges.length === 0 ? (
                  <div style={styles.empty}>No room charges posted.</div>
                ) : (
                  selectedCharges.map((charge) => (
                    <div key={charge.id} style={styles.activityItem}>
                      <div style={styles.activityTop}>
                        <b>{charge.title}</b>
                        <b>{money(charge.amount)}</b>
                      </div>
                      <div style={styles.subMeta}>
                        {formatDateTime(charge.createdAt)}
                        {charge.transactionId ? ` • ${charge.transactionId}` : ""}
                      </div>
                      {charge.items && charge.items.length > 0 ? (
                        <div style={styles.chargeLines}>
                          {charge.items.map((line, index) => (
                            <div key={`${charge.id}-${index}`} style={styles.chargeLine}>
                              <span>
                                {line.name} × {line.qty}
                              </span>
                              <span>{money(line.total)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              <div style={styles.activitySection}>
                <div style={styles.activityTitle}>Payments</div>
                <div style={styles.paymentForm}>
                  <div style={styles.field}>
                    <label style={styles.label}>Amount</label>
                    <input
                      type="number"
                      min={0}
                      max={selectedAmounts.balance}
                      style={styles.input}
                      value={folioPaymentAmount}
                      onChange={(e) =>
                        setFolioPaymentAmount(
                          Math.max(0, Number(e.target.value) || 0)
                        )
                      }
                      disabled={selectedAmounts.balance <= 0}
                    />
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Method</label>
                    <select
                      style={styles.input}
                      value={folioPaymentMethod}
                      onChange={(e) =>
                        setFolioPaymentMethod(e.target.value as FolioPaymentMethod)
                      }
                      disabled={selectedAmounts.balance <= 0}
                    >
                      <option value="cash">Cash</option>
                      <option value="momo">MoMo</option>
                      <option value="card">Card</option>
                      <option value="transfer">Transfer</option>
                    </select>
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Note</label>
                    <input
                      style={styles.input}
                      value={folioPaymentNote}
                      onChange={(e) => setFolioPaymentNote(e.target.value)}
                      placeholder="Optional"
                      disabled={selectedAmounts.balance <= 0}
                    />
                  </div>

                  <button
                    type="button"
                    style={
                      folioPaymentAmount <= 0
                        ? styles.disabledBtn
                        : styles.primaryBtn
                    }
                    onClick={handleRecordPayment}
                    disabled={folioPaymentAmount <= 0}
                  >
                    Record Payment
                  </button>
                </div>

                {selectedAmounts.amountPaid > 0 ? (
                  <div style={styles.activityItem}>
                    <div style={styles.activityTop}>
                      <b>Booking payment</b>
                      <b>{money(selectedAmounts.amountPaid)}</b>
                    </div>
                    <div style={styles.subMeta}>{selectedBooking.paymentStatus}</div>
                  </div>
                ) : null}
                {selectedPayments.map((payment) => (
                  <div key={payment.id} style={styles.activityItem}>
                    <div style={styles.activityTop}>
                      <b>{payment.title}</b>
                      <b>{money(payment.amount)}</b>
                    </div>
                    <div style={styles.subMeta}>
                      {formatDateTime(payment.createdAt)}
                      {payment.paymentMethod ? ` • ${payment.paymentMethod}` : ""}
                    </div>
                    {payment.note ? (
                      <div style={styles.subMeta}>{payment.note}</div>
                    ) : null}
                  </div>
                ))}
                {selectedAmounts.amountPaid <= 0 && selectedPayments.length === 0 ? (
                  <div style={styles.empty}>No payments recorded.</div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: "grid",
    gap: 16,
    marginTop: 16,
  },
  message: {
    padding: "12px 14px",
    borderRadius: 8,
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
    padding: 20,
    borderRadius: 14,
    background: "linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)",
    border: "1px solid rgba(15,23,42,0.08)",
    boxShadow: "0 12px 30px rgba(15,23,42,0.05)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: "#111827",
  },
  sectionSubtitle: {
    marginTop: 5,
    color: "#64748b",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.5,
  },
  reservationForm: {
    display: "grid",
    gap: 18,
  },
  formSection: {
    paddingTop: 18,
    borderTop: "1px solid rgba(15,23,42,0.08)",
  },
  formSectionTitle: {
    marginBottom: 12,
    color: "#111827",
    fontSize: 13,
    fontWeight: 850,
    letterSpacing: 0.2,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(180px, 1fr))",
    gap: 16,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 750,
    color: "#334155",
  },
  input: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 8,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "#ffffff",
    fontSize: 14,
    color: "#111827",
  },
  actionRow: {
    display: "flex",
    gap: 8,
    marginTop: 20,
    flexWrap: "wrap",
    paddingTop: 18,
    borderTop: "1px solid rgba(15,23,42,0.08)",
  },
  primaryBtn: {
    border: "none",
    cursor: "pointer",
    padding: "11px 16px",
    borderRadius: 8,
    background: "#111827",
    color: "white",
    fontWeight: 800,
    boxShadow: "0 8px 18px rgba(17,24,39,0.16)",
  },
  secondaryBtn: {
    border: "1px solid rgba(11,42,58,0.18)",
    cursor: "pointer",
    padding: "11px 16px",
    borderRadius: 8,
    background: "white",
    color: "#111827",
    fontWeight: 800,
  },
  disabledBtn: {
    border: "none",
    cursor: "not-allowed",
    padding: "11px 16px",
    borderRadius: 8,
    background: "rgba(15,23,42,0.08)",
    color: "rgba(15,23,42,0.38)",
    fontWeight: 800,
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
  clickableRow: {
    cursor: "pointer",
  },
  selectedRow: {
    background: "rgba(15,23,42,0.04)",
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
  detailPanel: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    background: "#ffffff",
    border: "1px solid rgba(15,23,42,0.10)",
  },
  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 14,
  },
  detailTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: 900,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
  },
  detailItem: {
    display: "grid",
    gap: 4,
    padding: 10,
    borderRadius: 8,
    background: "rgba(248,250,252,0.9)",
    color: "#111827",
    fontWeight: 800,
  },
  detailLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
  },
  activityGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginTop: 14,
  },
  activitySection: {
    display: "grid",
    gap: 10,
  },
  paymentForm: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    padding: 10,
    borderRadius: 8,
    background: "rgba(248,250,252,0.9)",
    border: "1px solid rgba(15,23,42,0.08)",
  },
  activityTitle: {
    color: "#111827",
    fontWeight: 900,
  },
  activityItem: {
    padding: 10,
    borderRadius: 8,
    background: "rgba(248,250,252,0.9)",
    border: "1px solid rgba(15,23,42,0.08)",
  },
  activityTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#111827",
  },
  chargeLines: {
    display: "grid",
    gap: 4,
    marginTop: 8,
  },
  chargeLine: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#334155",
    fontSize: 13,
    fontWeight: 700,
  },
  kpiCard: {
    padding: "16px 18px",
    borderRadius: 12,
    background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
    border: "1px solid rgba(15,23,42,0.08)",
    boxShadow: "0 10px 24px rgba(15,23,42,0.055)",
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: 900,
    color: "#111827",
  },
};
