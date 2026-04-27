// src/sales/salesTypes.ts

export type TxType = "FNB" | "ROOM";
export type CustomerType = "GUEST" | "WALKIN";
export type OrderType = "DINE_IN" | "TAKEAWAY" | "ROOM_SERVICE";
export type PaymentMode = "PAY_NOW" | "POST_TO_ROOM";
export type PayMethod = "CASH" | "MOMO" | "CARD" | "TRANSFER";

export type LineItem = {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
};

export type TransactionStatus = "OPEN" | "PAID" | "POSTED_TO_ROOM";

export type Transaction = {
  id: string;
  type: TxType;
  sourceDept: string;
  deptKey?: string;

  customerType: CustomerType;
  orderType?: OrderType;

  attachToRoom: boolean;
  roomNo?: string;

  customerName?: string;
  customerPhone?: string;
  note?: string;

  items: LineItem[];

  subtotal: number;
  discountTotal: number;
  total: number;

  paymentMode: PaymentMode;
  paymentMethod?: PayMethod;
  amountPaid?: number;

  status: TransactionStatus;
  createdAt: number;

  createdBy: {
    employeeId: string;
    role: string;
    name?: string;
    fullName?: string;
  };

  staffId?: string;
  staffName?: string;
  staffLabel?: string;
};

// --- Adjustments / Audit Trail ---
export type DiffEntry = {
  field: string;
  from: unknown;
  to: unknown;
};

export type AdjustmentStatus = "APPLIED";

export type SalesAdjustment = {
  id: string;
  txId: string;
  deptKey: string;

  reason: string;
  diffs: DiffEntry[];

  status: AdjustmentStatus;

  createdAt: number;
  createdBy: { employeeId: string; role: string };
};
