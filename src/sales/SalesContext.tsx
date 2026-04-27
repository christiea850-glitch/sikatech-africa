import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type PaymentMethod =
  | "cash"
  | "momo"
  | "card"
  | "bank_transfer"
  | "room_folio"
  | "credit"
  | "other";

export type SaleRecord = {
  id: string;
  createdAt: string;

  deptKey: string;

  productName: string;
  qty: number;
  unitPrice: number;
  discount: number;

  paymentMethod: PaymentMethod;

  customerName?: string;
  customerPhone?: string;

  staffId: string;
  staffName?: string;

  subtotal: number;
  total: number;

  transactionId?: string;
  bookingId?: string;
  bookingCode?: string;
  roomNo?: string;
  paymentMode?: "pay_now" | "post_to_room";
  shiftId?: string;
  shiftStatus?: string;
  submittedAt?: string;
  submittedBy?: string;
  submissionMode?: "manual" | "automatic";
};

export type AddSaleInput = {
  deptKey: string;
  productName: string;
  qty: number;
  unitPrice: number;
  discount?: number;
  paymentMethod: PaymentMethod;

  customerName?: string;
  customerPhone?: string;

  staffId: string;
  staffName?: string;

  transactionId?: string;
  bookingId?: string;
  bookingCode?: string;
  roomNo?: string;
  paymentMode?: "pay_now" | "post_to_room";
  shiftId?: string;
  shiftStatus?: string;
  submittedAt?: string;
  submittedBy?: string;
  submissionMode?: "manual" | "automatic";
};

type SalesContextType = {
  records: SaleRecord[];
  addSale: (input: AddSaleInput) => void;
  deleteSale: (id: string) => void;
  clearAll: () => void;
};

const SalesContext = createContext<SalesContextType | undefined>(undefined);

const LS_KEY = "sikatech_sales_records_v3";

function uid() {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

function load(): SaleRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SaleRecord[]) : [];
  } catch {
    return [];
  }
}

function save(list: SaleRecord[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export function SalesProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<SaleRecord[]>(() => load());

  useEffect(() => {
    save(records);
  }, [records]);

  const api = useMemo<SalesContextType>(() => {
    const addSale: SalesContextType["addSale"] = (input) => {
      const qty = Number(input.qty);
      const unitPrice = Number(input.unitPrice);
      const discount = Number(input.discount ?? 0);

      const safeQty = Math.max(0, qty);
      const safeUnitPrice = Math.max(0, unitPrice);
      const safeDiscount = Math.max(0, discount);

      const subtotal = safeQty * safeUnitPrice;
      const total = Math.max(0, subtotal - safeDiscount);

      const next: SaleRecord = {
        id: uid(),
        createdAt: new Date().toISOString(),
        deptKey: String(input.deptKey).trim(),
        productName: String(input.productName ?? "").trim(),
        qty: safeQty,
        unitPrice: safeUnitPrice,
        discount: safeDiscount,
        paymentMethod: input.paymentMethod,
        customerName: input.customerName?.trim() || undefined,
        customerPhone: input.customerPhone?.trim() || undefined,
        staffId: String(input.staffId ?? "").trim(),
        staffName: input.staffName?.trim() || undefined,
        subtotal,
        total,
        transactionId: input.transactionId?.trim() || undefined,
        bookingId: input.bookingId?.trim() || undefined,
        bookingCode: input.bookingCode?.trim() || undefined,
        roomNo: input.roomNo?.trim() || undefined,
        paymentMode: input.paymentMode,
        shiftId: input.shiftId?.trim() || undefined,
        shiftStatus: input.shiftStatus?.trim() || undefined,
        submittedAt: input.submittedAt?.trim() || undefined,
        submittedBy: input.submittedBy?.trim() || undefined,
        submissionMode: input.submissionMode,
      };

      setRecords((prev) => [next, ...prev]);
    };

    const deleteSale: SalesContextType["deleteSale"] = (id) => {
      setRecords((prev) => prev.filter((r) => r.id !== id));
    };

    const clearAll: SalesContextType["clearAll"] = () => {
      setRecords([]);
    };

    return { records, addSale, deleteSale, clearAll };
  }, [records]);

  return <SalesContext.Provider value={api}>{children}</SalesContext.Provider>;
}

export function useSales() {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error("useSales must be used inside SalesProvider");
  return ctx;
}

export function money(n: number) {
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
