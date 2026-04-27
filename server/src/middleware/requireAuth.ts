import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

type JwtUser = {
  id: number;
  role: string;
  businessId?: number;
};

function isDevBypassEnabled() {
  const isProd = process.env.NODE_ENV === "production";
  const flag = String(process.env.DEV_AUTH_BYPASS || "").toLowerCase() === "true";
  return !isProd && flag;
}

/**
 * requireAuth:
 * - Normal mode: expects "Authorization: Bearer <JWT>"
 * - Dev mode (optional): allow bypass using headers if DEV_AUTH_BYPASS=true
 *
 * Dev bypass headers:
 *   x-user-id: 1
 *   x-role: admin | manager | assistant_manager | accounting | auditor | staff
 *   x-business-id: 1   (optional)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // ✅ 1) DEV bypass (only when enabled)
    if (isDevBypassEnabled()) {
      const devId = req.header("x-user-id");
      const devRole = req.header("x-role");
      const devBiz = req.header("x-business-id");

      if (devId && devRole) {
        req.user = {
          id: Number(devId),
          role: String(devRole),
          businessId: devBiz ? Number(devBiz) : undefined,
        };
        return next();
      }
    }

    // ✅ 2) Normal JWT mode
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing token" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ ok: false, error: "JWT_SECRET not set" });
    }

    const decoded = jwt.verify(token, secret) as JwtUser;

    req.user = {
      id: Number(decoded.id),
      role: String(decoded.role),
      businessId: decoded.businessId ? Number(decoded.businessId) : undefined,
    };

    return next();
  } catch (_err) {
    return res.status(401).json({ ok: false, error: "Invalid/expired token" });
  }
}
