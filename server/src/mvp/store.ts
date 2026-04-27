// server/src/mvp/store.ts
// server/src/mvp/store.ts
export type Role =
  | "admin"
  | "manager"
  | "assistant_manager"
  | "accounting"
  | "auditor"
  | "front_desk"
  | "staff";


export type User = {
  employeeId: string;
  role: Role;
  businessId: string;
  branchId: string; // MVP: default "main"
  departmentKey?: string; // for staff scope (optional)
};

export type ShiftStatus =
  | "open"
  | "closing_submitted"
  | "accounting_reviewed"
  | "closed";

export type Shift = {
  id: string;
  businessId: string;
  branchId: string;
  departmentKey: string;

  openedBy: { employeeId: string; role: Role };
  openedAt: number;

  status: ShiftStatus;

  closingSubmittedBy?: { employeeId: string; role: Role };
  closingSubmittedAt?: number;

  accountingReviewedBy?: { employeeId: string; role: Role };
  accountingReviewedAt?: number;
  accountingNote?: string;

  approvedClosedBy?: { employeeId: string; role: Role };
  approvedClosedAt?: number;
};

export type TxStatus = "OPEN" | "PAID" | "POSTED_TO_ROOM" | "VOID";

export type LineItem = {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
};

export type Transaction = {
  id: string;
  businessId: string;
  branchId: string;
  departmentKey: string;
  shiftId: string;

  sourceDeptLabel?: string; // friendly label if you want

  items: LineItem[];
  subtotal: number;
  discountTotal: number;
  total: number;

  status: TxStatus;

  createdAt: number;
  createdBy: { employeeId: string; role: Role };

  updatedAt?: number;
  updatedBy?: { employeeId: string; role: Role };
  voidReason?: string;
};

export type ApprovalAction = "EDIT" | "VOID";

export type ApprovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type ApprovalRequest = {
  id: string;
  businessId: string;
  branchId: string;
  departmentKey: string;

  targetType: "transaction";
  targetId: string; // txnId
  shiftId: string;

  action: ApprovalAction;
  proposedPatch?: Partial<Pick<Transaction, "items" | "subtotal" | "discountTotal" | "total" | "status">>;
  reason: string;

  requestedBy: { employeeId: string; role: Role };
  requestedAt: number;

  status: ApprovalRequestStatus;

  decidedBy?: { employeeId: string; role: Role };
  decidedAt?: number;
  decisionNote?: string;
};

// In-memory DB (MVP)
export const db = {
  shifts: new Map<string, Shift>(),
  transactions: new Map<string, Transaction>(),
  approvalRequests: new Map<string, ApprovalRequest>(),
};

// Simple id
export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}
