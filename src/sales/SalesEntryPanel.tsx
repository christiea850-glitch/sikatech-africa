import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../auth/AuthContext";
import { useShift } from "../shifts/ShiftContext";
import { submitShiftClosing } from "../api/shiftClosingApi";
import { useSales, type PaymentMethod } from "./SalesContext";
import { recordShiftSubmission } from "../lib/shiftTrace";

type ItemRow = {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
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
    case "credit":
      return "credit";
    default:
      return "other";
  }
}

function formatDepartmentLabel(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "Bar";

  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function SalesEntryPanel() {
  const { user } = useAuth();
  const { activeShift, refreshActiveShift } = useShift() as any;
  const { addSale } = useSales();

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
  const deptKey = String(
    activeShift?.departmentKey || user?.departmentKey || "bar"
  ).toLowerCase();
  const departmentLabel = formatDepartmentLabel(deptKey);

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
          : `Submitted from SalesEntryPanel for shift ${activeShift.id}`,
      });

      recordShiftSubmission({
        closingId: res.id,
        shiftId: activeShift.id,
        status: "submitted",
        submittedAt: new Date().toISOString(),
        submittedBy: String(user?.employeeId || "staff"),
        submissionMode: "manual",
        businessId,
        departmentKey: deptKey,
        cashExpected,
        cashCounted,
        cardTotal,
        momoTotal,
        expensesTotal,
        notes: note?.trim()
          ? note.trim()
          : `Submitted from SalesEntryPanel for shift ${activeShift.id}`,
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

    setBusy(true);
    setMsg(null);

    try {
      const staffId = String(user?.employeeId || "staff");
      const staffName =
        String((user as any)?.name || (user as any)?.fullName || "").trim() ||
        undefined;

      validItems.forEach((item) => {
        addSale({
          deptKey,
          productName: item.name.trim(),
          qty: Number(item.qty),
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount || 0),
          paymentMethod: toPaymentMethod(paymentMethod),
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          staffId,
          staffName,
          shiftId: activeShift?.id ? String(activeShift.id) : undefined,
          shiftStatus: activeShift?.id ? "open" : "unclosed",
        });
      });

      const itemCount = validItems.length;
      const extraNotes: string[] = [];

      if (postToRoom && roomNo.trim()) {
        extraNotes.push(`Posted to room ${roomNo.trim()}`);
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
        `Sale saved successfully. ${itemCount} item${
          itemCount > 1 ? "s" : ""
        } recorded. Total: ${money(subtotal)}.${extraText}`
      );

      resetForm();
    } catch (e: any) {
      setMsg(e?.message || "Failed to save sale.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div style={styles.wrap}>
      <div style={styles.shiftCard}>
        <div>
          <div style={styles.title}>Shift</div>

          {activeShift?.id ? (
            <div style={styles.shiftText}>
              Open shift: <b>{activeShift.id}</b> • Dept:{" "}
              <b>{activeShift?.departmentKey ?? user.departmentKey ?? "bar"}</b>{" "}
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
              Shift submitted for closing. Sales entry is now read-only.
            </div>
          ) : null}
        </div>

        <div style={styles.actions}>
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

      <div style={styles.headerBlock}>
        <div style={styles.departmentTitle}>{departmentLabel}</div>
        <div style={styles.subtitle}>
          Quick POS entry for sales + optional “Post to Room” charges.
        </div>

        <div style={styles.metaRow}>
          <span style={styles.badge}>Staff: {user.employeeId || "1"}</span>
          <span style={styles.badge}>Role: {user.role || "staff"}</span>
          <span style={styles.badge}>Business: {businessId}</span>
        </div>
      </div>

      <div style={styles.section}>
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
            onChange={(e) => setPostToRoom(e.target.checked)}
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
              placeholder="Optional"
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
          const lineTotal = Math.max(
            0,
            item.qty * item.unitPrice - item.discount
          );

          return (
            <div key={item.id} style={styles.tableRow}>
              <input
                id={`item-name-${item.id}`}
                name={`item-name-${item.id}`}
                style={styles.input}
                placeholder="e.g., Jollof, Coke, Club Beer"
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
              disabled={isReadOnly}
            >
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
            ? "This sale screen is read-only because the shift has already been submitted."
            : "Sales are active on this shift."}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    padding: 18,
    maxWidth: 1180,
    margin: "0 auto",
  },
  shiftCard: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.68)",
    border: "1px solid rgba(11,42,58,0.12)",
  },
  title: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0b2a3a",
  },
  shiftText: {
    marginTop: 6,
    fontWeight: 800,
    color: "#304a59",
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
    borderRadius: 12,
    background: "rgba(18,94,60,0.10)",
    border: "1px solid rgba(18,94,60,0.18)",
    color: "#125e3c",
    fontWeight: 800,
  },
  actions: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  btnPrimary: {
    border: "none",
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 12,
    background: "#0b2a3a",
    color: "white",
    fontWeight: 900,
  },
  btnLight: {
    border: "none",
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 12,
    background: "white",
    color: "#0b2a3a",
    fontWeight: 900,
  },
  btnDisabled: {
    border: "none",
    cursor: "not-allowed",
    padding: "10px 14px",
    borderRadius: 12,
    background: "rgba(0,0,0,0.08)",
    color: "rgba(0,0,0,0.35)",
    fontWeight: 900,
  },
  btnDanger: {
    border: "none",
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 12,
    background: "rgba(180,38,38,0.12)",
    color: "#992727",
    fontWeight: 900,
  },
  headerBlock: {
    marginTop: 14,
    padding: "0 2px",
  },
  departmentTitle: {
    fontSize: 22,
    fontWeight: 900,
    color: "#0b2a3a",
  },
  subtitle: {
    marginTop: 6,
    color: "#425968",
    fontWeight: 700,
  },
  metaRow: {
    display: "flex",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
  },
  badge: {
    padding: "8px 14px",
    borderRadius: 999,
    background: "rgba(209,162,27,0.18)",
    color: "#0b2a3a",
    fontWeight: 900,
  },
  section: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.68)",
    border: "1px solid rgba(11,42,58,0.12)",
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
    borderRadius: 12,
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
  itemsTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0b2a3a",
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
    borderRadius: 14,
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
    borderRadius: 999,
    background: "rgba(11,42,58,0.08)",
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
