// server/src/mvp/guards.ts
import type { ApprovalRequest, Role, Shift, User } from "./store.js";

/** Small helper types for consistent responses */
type Ok = { ok: true };
type Fail = { ok: false; error: string };
type Result = Ok | Fail;

export function isPrivileged(role: Role): boolean {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "assistant_manager" ||
    role === "accounting" ||
    role === "auditor"
  );
}

export function canApprove(role: Role): boolean {
  // MVP policy: manager/admin can approve
  return role === "admin" || role === "manager";
}

export function canAccountingReview(role: Role): boolean {
  return role === "accounting" || role === "admin" || role === "manager";
}

// Scope check (MVP):
// - All records have businessId + branchId + departmentKey
// - Staff can only act within their department (if provided).
export function assertScope(
  user: User,
  record: { businessId: string; branchId: string; departmentKey: string }
): Result {
  if (user.businessId !== record.businessId) {
    return { ok: false, error: "Business scope mismatch." };
  }
  if (user.branchId !== record.branchId) {
    return { ok: false, error: "Branch scope mismatch." };
  }

  // If staff and has departmentKey assigned, enforce
  if (
    user.role === "staff" &&
    user.departmentKey &&
    user.departmentKey !== record.departmentKey
  ) {
    return { ok: false, error: "Department mismatch for staff." };
  }

  return { ok: true };
}

// Lock rule: after closing_submitted, staff cannot edit/void directly
export function isShiftLockedForDirectEdits(shift: Shift): boolean {
  return shift.status !== "open";
}

export function denyIfSelfApprove(user: User, req: ApprovalRequest): Result {
  if (user.employeeId === req.requestedBy.employeeId) {
    return {
      ok: false,
      error: "Separation of duties: requester cannot approve their own request.",
    };
  }
  return { ok: true };
}

export function denyIfSameCloseAndApprove(user: User, shift: Shift): Result {
  // Optional strong policy
  if (
    shift.closingSubmittedBy?.employeeId &&
    user.employeeId === shift.closingSubmittedBy.employeeId
  ) {
    return {
      ok: false,
      error: "Separation rule: submitter cannot approve close (recommended ON).",
    };
  }
  return { ok: true };
}

export function canCreateTxn(user: User, shift: Shift): Result {
  // Must be open shift
  if (shift.status !== "open") {
    return { ok: false, error: "Shift is not open. Transactions are locked." };
  }

  // Staff must match shift dept if staff has dept set
  if (
    user.role === "staff" &&
    user.departmentKey &&
    user.departmentKey !== shift.departmentKey
  ) {
    return {
      ok: false,
      error: "Staff can only create transactions in their own department shift.",
    };
  }

  return { ok: true };
}

export function canEditTxnDirect(user: User, shift: Shift): Result {
  // Only open shift can be edited directly
  if (isShiftLockedForDirectEdits(shift)) {
    return {
      ok: false,
      error: "Shift is locked. Create an approval request instead.",
    };
  }

  // Staff must match dept
  if (
    user.role === "staff" &&
    user.departmentKey &&
    user.departmentKey !== shift.departmentKey
  ) {
    return { ok: false, error: "Staff can only edit within their department." };
  }

  return { ok: true };
}

export function canVoidTxnDirect(user: User, shift: Shift): Result {
  return canEditTxnDirect(user, shift);
}

export function canViewDeptData(role: Role): boolean {
  // MVP: privileged roles can view; staff can view their own dept via scope
  return isPrivileged(role) || role === "staff";
}

export function canViewCentralSales(role: Role): boolean {
  return isPrivileged(role);
}
