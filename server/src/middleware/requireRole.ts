import type { Request, Response, NextFunction } from "express";

type Role = "admin" | "manager" | "assistant_manager" | "accounting" | "auditor" | "staff";

export function requireRole(allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as { id: string; role: Role } | undefined;
    if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
    if (!allowed.includes(user.role)) return res.status(403).json({ ok: false, error: "Forbidden" });
    next();
  };
}
