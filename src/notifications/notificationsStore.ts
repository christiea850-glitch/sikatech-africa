// src/notifications/notificationsStore.ts
import type { SikaNotification, Role } from "./notificationsTypes";

export const NOTIFY_STORAGE_KEY = "sikatech_notify_v1";

type StoredShape = SikaNotification[] | { items: SikaNotification[] };

function uid(prefix = "n") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function normalize(raw: unknown): SikaNotification[] {
  const data = raw as StoredShape;

  if (Array.isArray(data)) return data;

  if (data && typeof data === "object" && Array.isArray((data as any).items)) {
    return (data as any).items as SikaNotification[];
  }

  return [];
}

export function readNotifications(): SikaNotification[] {
  try {
    const txt = localStorage.getItem(NOTIFY_STORAGE_KEY);
    if (!txt) return [];
    return normalize(JSON.parse(txt));
  } catch {
    return [];
  }
}

export function writeNotifications(items: SikaNotification[]) {
  localStorage.setItem(NOTIFY_STORAGE_KEY, JSON.stringify(items));
}

/**
 * Add a new notification to the store.
 * ✅ Accepts partial fields, auto-fills id + createdAt
 * ✅ Works with toRoles, toDeptKeys, readBy, meta if they exist in your type
 */
export function pushNotification(
  input: Partial<SikaNotification> &
    Pick<SikaNotification, "title" | "message">
): SikaNotification {
  const now = Date.now();

  const n: SikaNotification = {
    id: (input as any).id ?? uid("noti"),
    createdAt: (input as any).createdAt ?? now,
    title: input.title,
    message: input.message,

    // optional fields (kept if provided)
    ...(input.level ? { level: input.level } : {}),
    ...(Array.isArray((input as any).toRoles) ? { toRoles: (input as any).toRoles } : {}),
    ...(Array.isArray((input as any).toDeptKeys) ? { toDeptKeys: (input as any).toDeptKeys } : {}),
    ...(Array.isArray((input as any).readBy) ? { readBy: (input as any).readBy } : {}),
    ...((input as any).meta ? { meta: (input as any).meta } : {}),
  } as SikaNotification;

  const items = readNotifications();
  writeNotifications([n, ...items]);
  return n;
}

/** ✅ Backward-compatible alias (if any file uses this name) */
export const pushSystemNotification = pushNotification;

/**
 * Who can see a notification?
 * - If notification has `toRoles`, only those roles can see it
 * - If notification has `toDeptKeys`, staff must match dept key (if provided)
 * - If neither exists, everyone can see it
 */
export function canUserSeeNotification(
  n: SikaNotification,
  role: Role,
  opts?: { deptKey?: string | null }
): boolean {
  const toRoles = (n as any).toRoles as Role[] | undefined;
  if (Array.isArray(toRoles) && toRoles.length > 0 && !toRoles.includes(role)) return false;

  const toDeptKeys = (n as any).toDeptKeys as string[] | undefined;
  const deptKey = (opts?.deptKey ?? null)?.toLowerCase() || null;

  // If notification targets depts, allow:
  // - privileged roles always
  // - staff only if their dept matches
  if (Array.isArray(toDeptKeys) && toDeptKeys.length > 0) {
    if (role === "admin" || role === "manager" || role === "assistant_manager" || role === "accounting" || role === "auditor") {
      return true;
    }
    if (!deptKey) return false;
    return toDeptKeys.map((d) => String(d).toLowerCase()).includes(deptKey);
  }

  return true;
}

/**
 * Mark ONE notification as read for a specific employeeId.
 * Stores `readBy: string[]` on the object.
 */
export function markRead(notificationId: string, employeeId: string) {
  const items = readNotifications();

  const updated = items.map((n) => {
    if ((n as any).id !== notificationId) return n;

    const existing = ((n as any).readBy as string[] | undefined) ?? [];
    const readBy = existing.includes(employeeId) ? existing : [...existing, employeeId];

    return { ...(n as any), readBy } as SikaNotification;
  });

  writeNotifications(updated);
}

/** Mark ALL notifications as read for an employeeId. */
export function markAllReadFor(employeeId: string) {
  const items = readNotifications();

  const updated = items.map((n) => {
    const existing = ((n as any).readBy as string[] | undefined) ?? [];
    const readBy = existing.includes(employeeId) ? existing : [...existing, employeeId];
    return { ...(n as any), readBy } as SikaNotification;
  });

  writeNotifications(updated);
}

/** Clear all notifications (admin utility) */
export function clearAll() {
  writeNotifications([]);
}


