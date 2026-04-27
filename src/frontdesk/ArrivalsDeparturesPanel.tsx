import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  getAllBookings,
  isToday,
  updateBooking,
  type BookingRecord,
} from "./bookingsStorage";

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function money(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value}</div>
    </div>
  );
}

function statusPill(text: string, kind: "blue" | "green" | "orange" | "red" | "gray") {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    blue: {
      bg: "rgba(37,99,235,0.10)",
      color: "#2563eb",
      border: "rgba(37,99,235,0.18)",
    },
    green: {
      bg: "rgba(5,150,105,0.10)",
      color: "#059669",
      border: "rgba(5,150,105,0.18)",
    },
    orange: {
      bg: "rgba(217,119,6,0.10)",
      color: "#d97706",
      border: "rgba(217,119,6,0.18)",
    },
    red: {
      bg: "rgba(220,38,38,0.10)",
      color: "#dc2626",
      border: "rgba(220,38,38,0.18)",
    },
    gray: {
      bg: "rgba(100,116,139,0.10)",
      color: "#64748b",
      border: "rgba(100,116,139,0.18)",
    },
  };

  const s = map[kind];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontWeight: 800,
        fontSize: 12,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function getArrivalBadge(booking: BookingRecord) {
  if (booking.bookingStatus === "checked_in") return statusPill("Checked In", "green");
  if (booking.bookingStatus === "cancelled") return statusPill("Cancelled", "red");
  if (booking.bookingStatus === "no_show") return statusPill("No Show", "orange");
  return statusPill("Expected", "blue");
}

function getDepartureBadge(booking: BookingRecord) {
  if (booking.bookingStatus === "checked_out") return statusPill("Checked Out", "gray");
  if (booking.bookingStatus === "checked_in") return statusPill("In House", "green");
  if (booking.bookingStatus === "cancelled") return statusPill("Cancelled", "red");
  return statusPill("Due Out", "orange");
}

export default function ArrivalsDeparturesPanel() {
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  const bookings = useMemo(() => {
    void version;
    return getAllBookings();
  }, [version]);

  const arrivalsToday = useMemo(() => {
    return bookings.filter((b) => isToday(b.checkInDate));
  }, [bookings]);

  const departuresToday = useMemo(() => {
    return bookings.filter((b) => isToday(b.checkOutDate));
  }, [bookings]);

  const stats = useMemo(() => {
    const expectedArrivals = arrivalsToday.filter((b) => b.bookingStatus === "reserved").length;
    const checkedInToday = arrivalsToday.filter((b) => b.bookingStatus === "checked_in").length;
    const dueDepartures = departuresToday.filter(
      (b) => b.bookingStatus === "checked_in" || b.bookingStatus === "reserved"
    ).length;
    const checkedOutToday = departuresToday.filter((b) => b.bookingStatus === "checked_out").length;

    return {
      expectedArrivals,
      checkedInToday,
      dueDepartures,
      checkedOutToday,
    };
  }, [arrivalsToday, departuresToday]);

  function refresh(message: string) {
    setMsg(message);
    setVersion((v) => v + 1);
  }

  function handleCheckIn(booking: BookingRecord) {
    updateBooking(booking.id, {
      bookingStatus: "checked_in",
      roomStatus: "occupied",
    });
    refresh(`Guest checked in: ${booking.guestName} (${booking.roomNo})`);
  }

  function handleCheckOut(booking: BookingRecord) {
    updateBooking(booking.id, {
      bookingStatus: "checked_out",
      roomStatus: "dirty",
    });
    refresh(`Guest checked out: ${booking.guestName} (${booking.roomNo})`);
  }

  function handleNoShow(booking: BookingRecord) {
    updateBooking(booking.id, {
      bookingStatus: "no_show",
      roomStatus: "available",
    });
    refresh(`Marked as no-show: ${booking.guestName} (${booking.roomNo})`);
  }

  return (
    <div style={styles.wrap}>
      {msg ? <div style={styles.message}>{msg}</div> : null}

      <div style={styles.kpiGrid}>
        <KpiCard label="Expected Arrivals" value={stats.expectedArrivals} />
        <KpiCard label="Checked In Today" value={stats.checkedInToday} />
        <KpiCard label="Due Departures" value={stats.dueDepartures} />
        <KpiCard label="Checked Out Today" value={stats.checkedOutToday} />
      </div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Today&apos;s Arrivals</div>

          {arrivalsToday.length === 0 ? (
            <div style={styles.empty}>No arrivals scheduled for today.</div>
          ) : (
            <div style={styles.list}>
              {arrivalsToday.map((booking) => (
                <div key={booking.id} style={styles.itemCard}>
                  <div style={styles.itemTop}>
                    <div>
                      <div style={styles.mainTitle}>{booking.guestName}</div>
                      <div style={styles.subText}>
                        {booking.bookingCode} • Room {booking.roomNo} • {booking.roomType}
                      </div>
                    </div>
                    {getArrivalBadge(booking)}
                  </div>

                  <div style={styles.metaGrid}>
                    <div style={styles.metaBox}>
                      <div style={styles.metaLabel}>Check-In</div>
                      <div style={styles.metaValue}>{formatDate(booking.checkInDate)}</div>
                    </div>
                    <div style={styles.metaBox}>
                      <div style={styles.metaLabel}>Check-Out</div>
                      <div style={styles.metaValue}>{formatDate(booking.checkOutDate)}</div>
                    </div>
                    <div style={styles.metaBox}>
                      <div style={styles.metaLabel}>Balance</div>
                      <div style={styles.metaValue}>{money(booking.balance)}</div>
                    </div>
                    <div style={styles.metaBox}>
                      <div style={styles.metaLabel}>Phone</div>
                      <div style={styles.metaValue}>{booking.guestPhone || "—"}</div>
                    </div>
                  </div>

                  <div style={styles.actionRow}>
                    <button
                      type="button"
                      style={styles.primaryBtn}
                      onClick={() => handleCheckIn(booking)}
                      disabled={booking.bookingStatus === "checked_in"}
                    >
                      Check In
                    </button>

                    <button
                      type="button"
                      style={styles.secondaryBtn}
                      onClick={() => handleNoShow(booking)}
                      disabled={
                        booking.bookingStatus === "checked_in" ||
                        booking.bookingStatus === "checked_out" ||
                        booking.bookingStatus === "cancelled" ||
                        booking.bookingStatus === "no_show"
                      }
                    >
                      Mark No Show
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.card}>
          <div style={styles.sectionTitle}>Today&apos;s Departures</div>

          {departuresToday.length === 0 ? (
            <div style={styles.empty}>No departures scheduled for today.</div>
          ) : (
            <div style={styles.list}>
              {departuresToday.map((booking) => (
                <div key={booking.id} style={styles.itemCard}>
                  <div style={styles.itemTop}>
                    <div>
                      <div style={styles.mainTitle}>{booking.guestName}</div>
                      <div style={styles.subText}>
                        {booking.bookingCode} • Room {booking.roomNo} • {booking.roomType}
                      </div>
                    </div>
                    {getDepartureBadge(booking)}
                  </div>

                  <div style={styles.metaGrid}>
                    <div style={styles.metaBox}>
                      <div style={styles.metaLabel}>Check-In</div>
                      <div style={styles.metaValue}>{formatDate(booking.checkInDate)}</div>
                    </div>
                    <div style={styles.metaBox}>
                      <div style={styles.metaLabel}>Check-Out</div>
                      <div style={styles.metaValue}>{formatDate(booking.checkOutDate)}</div>
                    </div>
                    <div style={styles.metaBox}>
                      <div style={styles.metaLabel}>Balance</div>
                      <div style={styles.metaValue}>{money(booking.balance)}</div>
                    </div>
                    <div style={styles.metaBox}>
                      <div style={styles.metaLabel}>Payment</div>
                      <div style={styles.metaValue}>{booking.paymentStatus}</div>
                    </div>
                  </div>

                  <div style={styles.actionRow}>
                    <button
                      type="button"
                      style={styles.primaryBtn}
                      onClick={() => handleCheckOut(booking)}
                      disabled={booking.bookingStatus === "checked_out"}
                    >
                      Check Out
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
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
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    alignItems: "start",
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
  list: {
    display: "grid",
    gap: 12,
  },
  itemCard: {
    borderRadius: 16,
    border: "1px solid rgba(11,42,58,0.08)",
    background: "rgba(248,250,252,0.9)",
    padding: 14,
  },
  itemTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  mainTitle: {
    fontSize: 20,
    fontWeight: 900,
    color: "#0b2a3a",
  },
  subText: {
    marginTop: 4,
    color: "#64748b",
    fontWeight: 700,
  },
  metaGrid: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  metaBox: {
    padding: 12,
    borderRadius: 12,
    background: "#fff",
    border: "1px solid rgba(11,42,58,0.08)",
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  metaValue: {
    fontWeight: 900,
    color: "#0b2a3a",
  },
  actionRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 14,
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
  empty: {
    color: "#64748b",
    fontWeight: 800,
    lineHeight: 1.6,
  },
};