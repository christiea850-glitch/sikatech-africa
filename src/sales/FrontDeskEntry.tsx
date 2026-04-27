import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../auth/AuthContext";
import { useShift } from "../shifts/ShiftContext";
import { submitShiftClosing } from "../api/shiftClosingApi";
import { useSales, type PaymentMethod } from "./SalesContext";
import FrontDeskBookingsPanel from "../frontdesk/FrontDeskBookingsPanel";
import RoomBoardPanel from "../frontdesk/RoomBoardPanel";
import {
  getAllBookings,
  postRoomChargeToBooking,
  type BookingRecord,
} from "../frontdesk/bookingsStorage";

type ItemRow = {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
};

type TabKey =
  | "overview"
  | "bookings"
  | "roomboard"
  | "room"
  | "fnb"
  | "entry";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function transactionUid() {
  return `fd_tx_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function money(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function resolveBusinessId(raw: unknown): number {
  const value = String(raw ?? "").trim();
  if (value === "biz_main") return 1;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 1;
}

function toPaymentMethod(value: string): PaymentMethod {
  switch (String(value).toLowerCase()) {
    case "cash":
      return "cash";
    case "momo":
      return "momo";
    case "card":
      return "card";
    case "transfer":
      return "bank_transfer";
    case "bank_transfer":
      return "bank_transfer";
    case "post to room":
    case "room folio":
    case "room_folio":
      return "room_folio";
    case "credit":
      return "credit";
    default:
      return "other";
  }
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? styles.tabBtnActive : styles.tabBtn}
    >
      {children}
    </button>
  );
}

function getEntryMode(transactionType: string) {
  const value = transactionType.toLowerCase();
  if (
    value.includes("room") ||
    value.includes("laundry") ||
    value.includes("deposit") ||
    value.includes("extra bed")
  ) {
    return "ROOM";
  }
  return "FNB";
}

function findPostableRoomBooking(roomNo: string): BookingRecord | null {
  const target = String(roomNo || "").trim().toLowerCase();
  if (!target) return null;

  return (
    getAllBookings()
      .filter((booking) => String(booking.roomNo || "").trim().toLowerCase() === target)
      .filter(
        (booking) =>
          (booking.bookingStatus === "checked_in" ||
            booking.bookingStatus === "reserved") &&
          (booking.roomStatus === "occupied" || booking.roomStatus === "reserved")
      )
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))[0] ||
    null
  );
}

export default function FrontDeskEntry() {
  const { user } = useAuth();
  const { activeShift, refreshActiveShift } = useShift() as any;
  const { addSale } = useSales();

  const [tab, setTab] = useState<TabKey>("overview");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submittedLocal, setSubmittedLocal] = useState(false);

  const [transactionType, setTransactionType] = useState("Food & Drinks");
  const [customerType, setCustomerType] = useState("Walk-in");
  const [orderType, setOrderType] = useState("Dine-in");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [postToRoom, setPostToRoom] = useState(false);
  const [roomNo, setRoomNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");

  const [items, setItems] = useState<ItemRow[]>([
    { id: uid(), name: "", qty: 1, unitPrice: 0, discount: 0 },
  ]);

  const businessId = resolveBusinessId((user as any)?.businessId);
  const shiftStatus = String(activeShift?.status || "").toLowerCase();

  const isReadOnly =
    submittedLocal ||
    shiftStatus === "closing_submitted" ||
    shiftStatus === "accounting_reviewed" ||
    shiftStatus === "manager_approved" ||
    shiftStatus === "closed";

  useEffect(() => {
    async function syncShiftState() {
      if (
        shiftStatus === "closing_submitted" ||
        shiftStatus === "accounting_reviewed" ||
        shiftStatus === "manager_approved" ||
        shiftStatus === "closed"
      ) {
        setSubmittedLocal(true);

        if (typeof refreshActiveShift === "function") {
          try {
            await refreshActiveShift();
          } catch {
            //
          }
        }
      } else if (shiftStatus === "open" || !shiftStatus) {
        setSubmittedLocal(false);
      }
    }

    syncShiftState();
  }, [shiftStatus, activeShift?.id, refreshActiveShift]);

  useEffect(() => {
    if (postToRoom && paymentMethod !== "Room Folio") {
      setPaymentMethod("Room Folio");
    }

    if (!postToRoom && paymentMethod === "Room Folio") {
      setPaymentMethod("Cash");
    }
  }, [postToRoom, paymentMethod]);

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const line = item.qty * item.unitPrice - item.discount;
      return sum + Math.max(0, line);
    }, 0);
  }, [items]);

  const cashExpected = useMemo(() => {
    return paymentMethod === "Cash" ? subtotal : 0;
  }, [paymentMethod, subtotal]);

  const cashCounted = useMemo(() => {
    return paymentMethod === "Cash" ? subtotal : 0;
  }, [paymentMethod, subtotal]);

  const cardTotal = useMemo(() => {
    return paymentMethod === "Card" ? subtotal : 0;
  }, [paymentMethod, subtotal]);

  const momoTotal = useMemo(() => {
    return paymentMethod === "MoMo" ? subtotal : 0;
  }, [paymentMethod, subtotal]);

  const expensesTotal = 0;
  const entryMode = getEntryMode(transactionType);

  const stats = useMemo(() => {
    const activeItems = items.filter((x) => x.name.trim()).length;

    return {
      roomRelated: entryMode === "ROOM" ? activeItems : postToRoom ? activeItems : 0,
      fnbRelated: entryMode === "FNB" ? activeItems : 0,
      postedToRoom: postToRoom ? activeItems : 0,
      activeItems,
      screenTotal: subtotal,
      entryState: isReadOnly ? "Read Only" : "Active",
    };
  }, [entryMode, items, postToRoom, subtotal, isReadOnly]);

  function updateItem(id: string, patch: Partial<ItemRow>) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function addItem() {
    if (isReadOnly) return;
    setItems((prev) => [
      ...prev,
      { id: uid(), name: "", qty: 1, unitPrice: 0, discount: 0 },
    ]);
  }

  function removeItem(id: string) {
    if (isReadOnly) return;
    setItems((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((item) => item.id !== id);
    });
  }

  function resetForm() {
    setTransactionType("Food & Drinks");
    setCustomerType("Walk-in");
    setOrderType("Dine-in");
    setPaymentMethod("Cash");
    setPostToRoom(false);
    setRoomNo("");
    setCustomerName("");
    setCustomerPhone("");
    setNote("");
    setItems([{ id: uid(), name: "", qty: 1, unitPrice: 0, discount: 0 }]);
  }

  function activateRoomChargeMode() {
    if (isReadOnly) return;
    setTransactionType("Room Charge");
    setCustomerType("Guest");
    setPostToRoom(true);
    setTab("entry");
    setMsg("Room Charge mode activated. Continue in New Entry.");
  }

  function togglePostingStatus() {
    if (isReadOnly) return;
    setPostToRoom((prev) => !prev);
  }

  async function onSubmitClose() {
    if (!activeShift?.id) {
      setMsg("No active shift found.");
      return;
    }

    if (subtotal > 0) {
      const continueClose = window.confirm(
        "There is still a sale amount on the screen. Submit shift closing anyway?"
      );
      if (!continueClose) return;
    }

    const ok = window.confirm("Submit this shift for closing?");
    if (!ok) return;

    setBusy(true);
    setMsg(null);

    try {
      const res = await submitShiftClosing({
        businessId,
        cashExpected,
        cashCounted,
        cardTotal,
        momoTotal,
        expensesTotal,
        notes: note?.trim()
          ? note.trim()
          : `Submitted from FrontDeskEntry for shift ${activeShift.id}`,
      });

      setSubmittedLocal(true);
      setMsg(`Shift submitted for closing successfully. Closing ID: ${res.id}`);

      if (typeof refreshActiveShift === "function") {
        try {
          await refreshActiveShift();
        } catch {
          //
        }
      }
    } catch (e: any) {
      setMsg(e?.message || "Failed to submit shift closing.");
    } finally {
      setBusy(false);
    }
  }

  async function onRefresh() {
    setMsg(null);
    if (typeof refreshActiveShift === "function") {
      try {
        await refreshActiveShift();
      } catch {
        setMsg("Unable to refresh shift right now.");
      }
    }
  }

  async function handleSaveSale() {
    if (isReadOnly) return;

    const validItems = items.filter(
      (item) =>
        item.name.trim() &&
        Number(item.qty) > 0 &&
        Number(item.unitPrice) >= 0
    );

    if (validItems.length === 0) {
      setMsg("Please add at least one valid item before saving.");
      return;
    }

    if (postToRoom && !roomNo.trim()) {
      setMsg("Enter a room number before posting a charge to room.");
      return;
    }

    const roomBooking = postToRoom ? findPostableRoomBooking(roomNo) : null;

    if (postToRoom && !roomBooking) {
      setMsg("Room posting requires an occupied or reserved room with an active booking.");
      return;
    }

    setBusy(true);
    setMsg(null);

    try {
      const staffId = String(user?.employeeId || "staff");
      const staffName =
        String((user as any)?.name || (user as any)?.fullName || "").trim() ||
        undefined;
      const transactionId = transactionUid();
      const effectivePaymentMethod = postToRoom ? "Room Folio" : paymentMethod;
      const transactionItems = validItems.map((item) => ({
        id: item.id,
        name: item.name.trim(),
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount || 0),
      }));

      validItems.forEach((item) => {
        addSale({
          deptKey: "front-desk",
          productName: item.name.trim(),
          qty: Number(item.qty),
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount || 0),
          paymentMethod: toPaymentMethod(effectivePaymentMethod),
          customerName:
            customerName.trim() || (postToRoom ? roomBooking?.guestName : undefined),
          customerPhone: customerPhone.trim() || undefined,
          staffId,
          staffName,
          transactionId,
          bookingId: roomBooking?.id,
          bookingCode: roomBooking?.bookingCode,
          roomNo: postToRoom ? roomNo.trim() : undefined,
          paymentMode: postToRoom ? "post_to_room" : "pay_now",
        });
      });

      if (postToRoom && roomBooking) {
        postRoomChargeToBooking(roomBooking.id, {
          transactionId,
          title: transactionType || "Room folio charge",
          amount: subtotal,
          source: "front-desk",
          note: note.trim() || undefined,
          items: transactionItems.map((item) => ({
            name: item.name.trim(),
            qty: Number(item.qty),
            unitPrice: Number(item.unitPrice),
            discount: Number(item.discount || 0),
            total: Math.max(
              0,
              Number(item.qty) * Number(item.unitPrice) - Number(item.discount || 0)
            ),
          })),
        });
      }

      const itemCount = validItems.length;
      const extraNotes: string[] = [];

      if (postToRoom && roomNo.trim()) {
        extraNotes.push(`Posted to room ${roomNo.trim()} folio`);
      }
      if (transactionType) {
        extraNotes.push(`Type: ${transactionType}`);
      }
      if (customerType) {
        extraNotes.push(`Customer: ${customerType}`);
      }
      if (orderType) {
        extraNotes.push(`Order: ${orderType}`);
      }
      if (note.trim()) {
        extraNotes.push(note.trim());
      }

      const extraText = extraNotes.length ? ` ${extraNotes.join(" • ")}.` : "";

      setMsg(
        `Front desk entry saved successfully. ${itemCount} item${
          itemCount > 1 ? "s" : ""
        } recorded. Total: ${money(subtotal)}.${extraText}`
      );

      resetForm();
      setTab(entryMode === "ROOM" ? "room" : "fnb");
    } catch (e: any) {
      setMsg(e?.message || "Failed to save entry.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div style={styles.wrap}>
      <div style={styles.pageHeader}>
        <div style={styles.headerMain}>
          <div style={styles.eyebrow}>Front Desk Intelligence</div>
          <div style={styles.departmentTitle}>Front Desk</div>
          <div style={styles.subtitle}>
            Separate room folio operations from food and service charges.
          </div>

          {activeShift?.id ? (
            <div style={styles.shiftText}>
              Open shift: <b>{activeShift.id}</b> • Dept: <b>front-desk</b>{" "}
              <span style={styles.muted}>
                (status:{" "}
                {submittedLocal
                  ? "closing_submitted"
                  : activeShift?.status || "open"}
                )
              </span>
            </div>
          ) : (
            <div style={styles.shiftText}>No open shift</div>
          )}

          {msg ? <div style={styles.errorText}>{msg}</div> : null}

          {isReadOnly ? (
            <div style={styles.notice}>
              Shift submitted for closing. Front desk entry is now read-only.
            </div>
          ) : null}
        </div>

        <div style={styles.headerActions}>
          <button style={styles.btnLight} onClick={onRefresh} disabled={busy}>
            Refresh
          </button>

          <button style={styles.btnDisabled} disabled>
            Open Shift
          </button>

          <button
            style={isReadOnly ? styles.btnDisabled : styles.btnPrimary}
            onClick={onSubmitClose}
            disabled={busy || isReadOnly || !activeShift?.id}
          >
            {busy ? "Submitting..." : "Submit Close"}
          </button>
        </div>
      </div>

      <div style={styles.kpiGrid}>
        <KpiCard label="Room Related" value={stats.roomRelated} />
        <KpiCard label="Food & Service" value={stats.fnbRelated} />
        <KpiCard label="Posted to Room" value={stats.postedToRoom} />
        <KpiCard label="Active Items" value={stats.activeItems} />
        <KpiCard label="Screen Total" value={money(stats.screenTotal)} />
        <KpiCard label="Entry State" value={stats.entryState} />
      </div>

      <div style={styles.tabRow}>
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
          Overview
        </TabButton>
        <TabButton active={tab === "bookings"} onClick={() => setTab("bookings")}>
          Bookings
        </TabButton>
        <TabButton active={tab === "room"} onClick={() => setTab("room")}>
          Room Charges
        </TabButton>
        <TabButton active={tab === "roomboard"} onClick={() => setTab("roomboard")}>
          Room Board
        </TabButton>
        <TabButton active={tab === "fnb"} onClick={() => setTab("fnb")}>
          Food & Service
        </TabButton>
        <TabButton active={tab === "entry"} onClick={() => setTab("entry")}>
          New Entry
        </TabButton>
      </div>

      {tab === "overview" && (
        <div style={styles.overviewGrid}>
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Room / Folio Summary</div>
            <div style={styles.overviewText}>
              Use this for room-linked charges, guest folio postings, deposits, laundry,
              extensions, and any charge that belongs to a guest room.
            </div>

            <div style={styles.infoList}>
              <div style={styles.infoCard}>
                <div style={styles.infoLabel}>Post to Room</div>
                <div style={styles.infoValue}>{postToRoom ? "Enabled" : "Disabled"}</div>
              </div>
              <div style={styles.infoCard}>
                <div style={styles.infoLabel}>Room No</div>
                <div style={styles.infoValue}>{roomNo || "—"}</div>
              </div>
              <div style={styles.infoCard}>
                <div style={styles.infoLabel}>Customer Type</div>
                <div style={styles.infoValue}>{customerType}</div>
              </div>
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Food / Service Summary</div>
            <div style={styles.overviewText}>
              Use this for walk-in orders, in-house food service, beverages, snacks,
              and guest room service billed through front desk.
            </div>

            <div style={styles.infoList}>
              <div style={styles.infoCard}>
                <div style={styles.infoLabel}>Transaction Type</div>
                <div style={styles.infoValue}>{transactionType}</div>
              </div>
              <div style={styles.infoCard}>
                <div style={styles.infoLabel}>Order Type</div>
                <div style={styles.infoValue}>{orderType}</div>
              </div>
              <div style={styles.infoCard}>
                <div style={styles.infoLabel}>Payment Method</div>
                <div style={styles.infoValue}>{paymentMethod}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "bookings" && <FrontDeskBookingsPanel />}

      {tab === "roomboard" && <RoomBoardPanel />}

      {tab === "room" && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Room Charges Mode</div>
          <div style={styles.overviewText}>
            Use this section to prepare a room-linked charge before moving into entry.
          </div>

          <div style={styles.clickableGrid}>
            <button
              type="button"
              style={styles.clickCard}
              onClick={activateRoomChargeMode}
              disabled={isReadOnly}
            >
              <div style={styles.infoLabel}>Suggested Type</div>
              <div style={styles.clickCardValue}>Room Charge</div>
              <div style={styles.clickHint}>Click to switch to room charge mode</div>
            </button>

            <div style={styles.infoCard}>
              <div style={styles.infoLabel}>Current Room No</div>
              <input
                value={roomNo}
                onChange={(e) => setRoomNo(e.target.value)}
                placeholder="Enter room no"
                style={styles.input}
                disabled={isReadOnly}
              />
            </div>

            <button
              type="button"
              style={styles.clickCard}
              onClick={togglePostingStatus}
              disabled={isReadOnly}
            >
              <div style={styles.infoLabel}>Posting Status</div>
              <div style={styles.clickCardValue}>
                {postToRoom ? "Linked to Room" : "Not Linked"}
              </div>
              <div style={styles.clickHint}>
                Click to {postToRoom ? "unlink" : "link"} room posting
              </div>
            </button>
          </div>

          <div style={styles.roomChargeActions}>
            <button
              type="button"
              style={styles.btnPrimary}
              onClick={() => {
                activateRoomChargeMode();
              }}
              disabled={isReadOnly}
            >
              Open in New Entry
            </button>

            <button
              type="button"
              style={styles.btnLight}
              onClick={() => {
                if (isReadOnly) return;
                setRoomNo("");
                setPostToRoom(false);
                setMsg("Room charge helper reset.");
              }}
              disabled={isReadOnly}
            >
              Reset Room Charge Helper
            </button>
          </div>
        </div>
      )}

      {tab === "fnb" && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Food & Service Mode</div>
          <div style={styles.overviewText}>
            This mode is for quick sales, beverages, snacks, takeaway, dine-in, and guest room service.
          </div>

          <div style={styles.infoList}>
            <div style={styles.infoCard}>
              <div style={styles.infoLabel}>Current Type</div>
              <div style={styles.infoValue}>{transactionType}</div>
            </div>
            <div style={styles.infoCard}>
              <div style={styles.infoLabel}>Order Flow</div>
              <div style={styles.infoValue}>{orderType}</div>
            </div>
            <div style={styles.infoCard}>
              <div style={styles.infoLabel}>Current Total</div>
              <div style={styles.infoValue}>{money(subtotal)}</div>
            </div>
          </div>
        </div>
      )}

      {tab === "entry" && (
        <>
          <div style={styles.section}>
            <div style={styles.itemsTop}>
              <div style={styles.sectionTitle}>New Front Desk Entry</div>
              <div style={styles.typeToggleRow}>
                <button
                  type="button"
                  style={entryMode === "ROOM" ? styles.typeBtnActive : styles.typeBtn}
                  onClick={() => {
                    setTransactionType("Room Charge");
                    setCustomerType("Guest");
                    setPostToRoom(true);
                  }}
                  disabled={isReadOnly}
                >
                  Room / Folio
                </button>
                <button
                  type="button"
                  style={entryMode === "FNB" ? styles.typeBtnActive : styles.typeBtn}
                  onClick={() => {
                    setTransactionType("Food & Drinks");
                    setPostToRoom(false);
                  }}
                  disabled={isReadOnly}
                >
                  Food & Service
                </button>
              </div>
            </div>

            <div style={styles.row3}>
              <div style={styles.field}>
                <label htmlFor="transactionType" style={styles.label}>
                  Transaction Type
                </label>
                <select
                  id="transactionType"
                  name="transactionType"
                  style={styles.input}
                  value={transactionType}
                  onChange={(e) => setTransactionType(e.target.value)}
                  disabled={isReadOnly}
                >
                  <option>Food & Drinks</option>
                  <option>Drinks Only</option>
                  <option>Food Only</option>
                  <option>Service</option>
                  <option>Room Charge</option>
                  <option>Laundry</option>
                  <option>Deposit</option>
                  <option>Extra Bed</option>
                </select>
              </div>

              <div style={styles.field}>
                <label htmlFor="customerType" style={styles.label}>
                  Customer Type
                </label>
                <select
                  id="customerType"
                  name="customerType"
                  style={styles.input}
                  value={customerType}
                  onChange={(e) => setCustomerType(e.target.value)}
                  disabled={isReadOnly}
                >
                  <option>Walk-in</option>
                  <option>Guest</option>
                  <option>Corporate</option>
                </select>
              </div>

              <div style={styles.field}>
                <label htmlFor="orderType" style={styles.label}>
                  Order Type
                </label>
                <select
                  id="orderType"
                  name="orderType"
                  style={styles.input}
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                  disabled={isReadOnly}
                >
                  <option>Dine-in</option>
                  <option>Takeaway</option>
                  <option>Room Service</option>
                </select>
              </div>
            </div>

            <div style={styles.checkboxRow}>
              <input
                id="postToRoom"
                name="postToRoom"
                type="checkbox"
                checked={postToRoom}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setPostToRoom(checked);
                  setPaymentMethod(checked ? "Room Folio" : "Cash");
                }}
                disabled={isReadOnly}
              />
              <label htmlFor="postToRoom" style={styles.labelInline}>
                Post/Attach to Room
              </label>
            </div>

            <div style={styles.helpText}>
              Use this only when the guest wants it added to their room bill.
            </div>

            <div style={styles.row3}>
              <div style={styles.field}>
                <label htmlFor="roomNo" style={styles.label}>
                  Room No
                </label>
                <input
                  id="roomNo"
                  name="roomNo"
                  style={styles.input}
                  placeholder={postToRoom ? "Required" : "Optional"}
                  value={roomNo}
                  onChange={(e) => setRoomNo(e.target.value)}
                  disabled={isReadOnly || !postToRoom}
                />
              </div>

              <div style={styles.field}>
                <label htmlFor="customerName" style={styles.label}>
                  Customer Name
                </label>
                <input
                  id="customerName"
                  name="customerName"
                  style={styles.input}
                  placeholder="Optional"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  disabled={isReadOnly}
                />
              </div>

              <div style={styles.field}>
                <label htmlFor="customerPhone" style={styles.label}>
                  Customer Number
                </label>
                <input
                  id="customerPhone"
                  name="customerPhone"
                  style={styles.input}
                  placeholder="Optional"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  disabled={isReadOnly}
                />
              </div>
            </div>

            <div style={styles.field}>
              <label htmlFor="note" style={styles.label}>
                Note
              </label>
              <input
                id="note"
                name="note"
                style={styles.input}
                placeholder="Optional (e.g., table 2, guest request...)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={isReadOnly}
              />
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.itemsTop}>
              <div style={styles.sectionTitle}>Items</div>
              <button
                style={isReadOnly ? styles.btnDisabled : styles.btnLight}
                onClick={addItem}
                disabled={isReadOnly}
              >
                + Add Item
              </button>
            </div>

            <div style={styles.tableHead}>
              <div>Product / Service</div>
              <div>Qty</div>
              <div>Unit Price</div>
              <div>Discount</div>
              <div>Line Total</div>
              <div />
            </div>

            {items.map((item) => {
              const lineTotal = Math.max(0, item.qty * item.unitPrice - item.discount);

              return (
                <div key={item.id} style={styles.tableRow}>
                  <input
                    id={`item-name-${item.id}`}
                    name={`item-name-${item.id}`}
                    style={styles.input}
                    placeholder={
                      entryMode === "ROOM"
                        ? "e.g., Room charge, Laundry, Deposit"
                        : "e.g., Jollof, Coke, Club Beer"
                    }
                    value={item.name}
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    disabled={isReadOnly}
                  />

                  <input
                    id={`item-qty-${item.id}`}
                    name={`item-qty-${item.id}`}
                    type="number"
                    style={styles.input}
                    value={item.qty}
                    min={1}
                    onChange={(e) =>
                      updateItem(item.id, {
                        qty: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    disabled={isReadOnly}
                  />

                  <input
                    id={`item-price-${item.id}`}
                    name={`item-price-${item.id}`}
                    type="number"
                    style={styles.input}
                    value={item.unitPrice}
                    min={0}
                    onChange={(e) =>
                      updateItem(item.id, {
                        unitPrice: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    disabled={isReadOnly}
                  />

                  <input
                    id={`item-discount-${item.id}`}
                    name={`item-discount-${item.id}`}
                    type="number"
                    style={styles.input}
                    value={item.discount}
                    min={0}
                    onChange={(e) =>
                      updateItem(item.id, {
                        discount: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    disabled={isReadOnly}
                  />

                  <div style={styles.lineTotal}>{money(lineTotal)}</div>

                  <button
                    style={isReadOnly ? styles.btnDisabled : styles.btnDanger}
                    onClick={() => removeItem(item.id)}
                    disabled={isReadOnly}
                  >
                    Remove
                  </button>
                </div>
              );
            })}

            <div style={styles.subtotalBox}>
              <span>Subtotal</span>
              <b>{money(subtotal)}</b>
            </div>

            <div style={styles.summaryRow}>
              <div style={styles.summaryChip}>
                Cash Expected: <b>{money(cashExpected)}</b>
              </div>
              <div style={styles.summaryChip}>
                Cash Counted: <b>{money(cashCounted)}</b>
              </div>
              <div style={styles.summaryChip}>
                Card Total: <b>{money(cardTotal)}</b>
              </div>
              <div style={styles.summaryChip}>
                MoMo Total: <b>{money(momoTotal)}</b>
              </div>
            </div>

            <div style={styles.bottomActions}>
              <div style={styles.fieldSmall}>
                <label htmlFor="paymentMethod" style={styles.label}>
                  Payment Method
                </label>
                <select
                  id="paymentMethod"
                  name="paymentMethod"
                  style={styles.input}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={isReadOnly || postToRoom}
                >
                  {postToRoom ? <option>Room Folio</option> : null}
                  <option>Cash</option>
                  <option>Card</option>
                  <option>MoMo</option>
                  <option>Transfer</option>
                </select>
              </div>

              <div style={styles.saveBox}>
                <div style={styles.totalLabel}>Total</div>
                <div style={styles.totalValue}>{money(subtotal)}</div>

                <button
                  style={isReadOnly ? styles.btnDisabled : styles.btnPrimary}
                  onClick={handleSaveSale}
                  disabled={isReadOnly || busy}
                >
                  Save Sale
                </button>
              </div>
            </div>

            <div style={styles.readOnlyInfo}>
              {isReadOnly
                ? "This front desk screen is read-only because the shift has already been submitted."
                : "Front desk sales are active on this shift."}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    padding: 20,
    maxWidth: 1240,
    margin: "0 auto",
  },
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 24,
    flexWrap: "wrap",
    padding: "22px 24px",
    borderRadius: 14,
    background: "linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)",
    border: "1px solid rgba(15,23,42,0.08)",
    boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
    alignItems: "flex-start",
  },
  headerMain: {
    minWidth: 280,
    flex: "1 1 560px",
  },
  shiftText: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: 700,
    color: "#475569",
  },
  muted: {
    color: "rgba(48,74,89,0.7)",
    fontWeight: 700,
  },
  errorText: {
    marginTop: 8,
    fontWeight: 900,
    color: "#992727",
  },
  notice: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    background: "rgba(18,94,60,0.10)",
    border: "1px solid rgba(18,94,60,0.18)",
    color: "#125e3c",
    fontWeight: 800,
  },
  headerActions: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    flex: "0 1 390px",
  },
  btnPrimary: {
    border: "none",
    cursor: "pointer",
    padding: "10px 13px",
    borderRadius: 8,
    background: "#111827",
    color: "white",
    fontWeight: 800,
    boxShadow: "0 8px 18px rgba(17,24,39,0.16)",
  },
  btnLight: {
    border: "1px solid rgba(15,23,42,0.10)",
    cursor: "pointer",
    padding: "10px 13px",
    borderRadius: 8,
    background: "#ffffff",
    color: "#111827",
    fontWeight: 800,
  },
  btnDisabled: {
    border: "none",
    cursor: "not-allowed",
    padding: "10px 13px",
    borderRadius: 8,
    background: "rgba(15,23,42,0.06)",
    color: "rgba(15,23,42,0.34)",
    fontWeight: 800,
  },
  btnDanger: {
    border: "none",
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 8,
    background: "rgba(180,38,38,0.12)",
    color: "#992727",
    fontWeight: 900,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#64748b",
    marginBottom: 8,
  },
  departmentTitle: {
    fontSize: 30,
    fontWeight: 900,
    color: "#111827",
  },
  subtitle: {
    marginTop: 6,
    color: "#64748b",
    fontWeight: 600,
    lineHeight: 1.5,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    marginTop: 18,
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
  tabRow: {
    display: "flex",
    gap: 18,
    flexWrap: "wrap",
    marginTop: 18,
    borderBottom: "1px solid rgba(11,42,58,0.12)",
  },
  tabBtn: {
    border: "none",
    borderBottom: "2px solid transparent",
    background: "transparent",
    color: "#334155",
    padding: "10px 0 9px",
    borderRadius: 0,
    fontWeight: 800,
    cursor: "pointer",
  },
  tabBtnActive: {
    border: "none",
    borderBottom: "2px solid #0b2a3a",
    background: "transparent",
    color: "#0b2a3a",
    padding: "10px 0 9px",
    borderRadius: 0,
    fontWeight: 900,
    cursor: "pointer",
  },
  overviewGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginTop: 14,
  },
  section: {
    marginTop: 12,
    padding: 14,
    borderRadius: 8,
    background: "#ffffff",
    border: "1px solid rgba(11,42,58,0.10)",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0b2a3a",
  },
  overviewText: {
    marginTop: 10,
    color: "#425968",
    fontWeight: 700,
    lineHeight: 1.5,
  },
  infoList: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  clickableGrid: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  infoCard: {
    padding: 12,
    borderRadius: 8,
    background: "rgba(248,250,252,0.92)",
    border: "1px solid rgba(11,42,58,0.08)",
  },
  clickCard: {
    padding: 12,
    borderRadius: 8,
    background: "rgba(248,250,252,0.92)",
    border: "1px solid rgba(11,42,58,0.08)",
    textAlign: "left",
    cursor: "pointer",
  },
  clickCardValue: {
    fontWeight: 900,
    color: "#0b2a3a",
    fontSize: 24,
    marginTop: 6,
  },
  clickHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748b",
    fontWeight: 700,
  },
  roomChargeActions: {
    marginTop: 14,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "#64748b",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  infoValue: {
    fontWeight: 900,
    color: "#0b2a3a",
  },
  itemsTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  typeToggleRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  typeBtn: {
    border: "1px solid rgba(11,42,58,0.12)",
    background: "#fff",
    color: "#334155",
    padding: "10px 14px",
    borderRadius: 8,
    fontWeight: 900,
    cursor: "pointer",
  },
  typeBtnActive: {
    border: "1px solid #0b2a3a",
    background: "#0b2a3a",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: 8,
    fontWeight: 900,
    cursor: "pointer",
  },
  row3: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  fieldSmall: {
    minWidth: 260,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontWeight: 900,
    color: "#0b2a3a",
  },
  labelInline: {
    fontWeight: 900,
    color: "#0b2a3a",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid rgba(11,42,58,0.14)",
    background: "white",
    fontSize: 15,
  },
  checkboxRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    marginTop: 14,
  },
  helpText: {
    marginTop: 8,
    color: "#566d7b",
    fontSize: 13,
    fontWeight: 700,
  },
  tableHead: {
    display: "grid",
    gridTemplateColumns: "2fr 0.7fr 0.8fr 0.8fr 0.8fr 0.7fr",
    gap: 12,
    fontWeight: 900,
    color: "#435a69",
    padding: "0 4px 8px",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "2fr 0.7fr 0.8fr 0.8fr 0.8fr 0.7fr",
    gap: 12,
    alignItems: "center",
    padding: "10px 0",
    borderTop: "1px solid rgba(11,42,58,0.08)",
  },
  lineTotal: {
    fontWeight: 900,
    color: "#0b2a3a",
    textAlign: "center",
  },
  subtotalBox: {
    marginTop: 16,
    marginLeft: "auto",
    width: 300,
    maxWidth: "100%",
    padding: 14,
    borderRadius: 8,
    background: "rgba(255,255,255,0.78)",
    border: "1px solid rgba(11,42,58,0.12)",
    display: "flex",
    justifyContent: "space-between",
    fontWeight: 900,
    color: "#0b2a3a",
  },
  summaryRow: {
    marginTop: 12,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  summaryChip: {
    padding: "8px 12px",
    borderRadius: 8,
    background: "rgba(11,42,58,0.06)",
    color: "#0b2a3a",
    fontWeight: 800,
  },
  bottomActions: {
    marginTop: 18,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    alignItems: "flex-end",
  },
  saveBox: {
    minWidth: 260,
    marginLeft: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    alignItems: "stretch",
  },
  totalLabel: {
    fontWeight: 800,
    color: "#425968",
  },
  totalValue: {
    fontSize: 22,
    fontWeight: 900,
    color: "#0b2a3a",
  },
  readOnlyInfo: {
    marginTop: 12,
    color: "#546b79",
    fontWeight: 700,
  },
};
