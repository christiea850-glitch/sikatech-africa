import type { User } from "../auth/AuthContext";

export type Role = User["role"];

export type ActivityActor = {
  employeeId: string;
  role: Role;
};

/**
 * All actions that can be logged in the system
 * (kept explicit for audit integrity)
 */
export type ActivityAction =
  // ---- Department lifecycle ----
  | "DEPARTMENT_CREATED"
  | "DEPARTMENT_UPDATED"
  | "DEPARTMENT_DELETED"
  | "DEPARTMENT_ENABLED"
  | "DEPARTMENT_DISABLED"

  // ---- Records (sales, inventory, logs, etc.) ----
  | "RECORD_CREATED"
  | "RECORD_UPDATED"
  | "RECORD_DELETED"
  | "RECORD_VOIDED"
  | "RECORD_REFUNDED"

  // ---- Page & navigation tracking ----
  | "PAGE_VIEWED"

  // ---- Access & security ----
  | "ACCESS_GRANTED"
  | "ACCESS_DENIED"

  // ---- Approval workflow (future-proof) ----
  | "EDIT_REQUESTED"
  | "EDIT_APPROVED"
  | "EDIT_REJECTED";

/**
 * A single immutable audit event
 */
export type ActivityEvent = {
  id: string;

  /** Always store epoch ms */
  timestamp: number;

  actor: ActivityActor;

  /** Logical area of the system */
  moduleKey: string;     // e.g. "front-desk", "bar", "accounting"
  moduleLabel: string;   // e.g. "Front Desk", "Bar", "Accounting"

  action: ActivityAction;

  /** Human-readable description */
  summary: string;

  /**
   * Optional structured metadata
   * (safe for DB, analytics, forensics)
   */
  meta?: {
    recordId?: string;
    previousValue?: unknown;
    newValue?: unknown;
    reason?: string;
    path?: string;
    sessionId?: string;
    [key: string]: unknown;
  };
};

/**
 * Input used by log() before persistence
 */
export type LogActivityInput = Omit<ActivityEvent, "id" | "timestamp"> & {
  timestamp?: number;
};
