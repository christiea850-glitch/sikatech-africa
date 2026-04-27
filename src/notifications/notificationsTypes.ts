// src/notifications/notificationsTypes.ts

export type Role =
  | "admin"
  | "manager"
  | "assistant_manager"
  | "accounting"
  | "staff"
  | "auditor";

export type NotificationLevel = "info" | "success" | "warning" | "error";

export type SikaNotification = {
  id: string;
  createdAt: number;

  title: string;
  message: string;

  level?: NotificationLevel;

  /** ✅ Who should see it (RBAC) */
  toRoles?: Role[];

  /** ✅ Which department(s) should see it */
  toDeptKeys?: string[];

  /** ✅ Track who read it */
  readBy?: string[];

  /** ✅ Anything extra you want to attach */
  meta?: Record<string, any>;
};

