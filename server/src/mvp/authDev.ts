// server/src/mvp/authDev.ts
import type { Request, Response, NextFunction } from "express";

/**
 * DEV auth middleware:
 * Allows requests using headers:
 *  - x-user-id
 *  - x-role
 *
 * This matches your frontend dev client that sets headers.
 */
export function requireAuthDev(req: Request, res: Response, next: NextFunction) {
  const userId = String(req.header("x-user-id") || "").trim();
  const role = String(req.header("x-role") || "").trim();

  if (!userId || !role) {
    return res.status(401).json({
      ok: false,
      error: "Missing dev auth headers: x-user-id and x-role",
    });
  }

  // Attach to request for later middleware/routes
  (req as any).user = { id: userId, role };
  next();
}

/**
 * ✅ Backward-compatible alias.
 * Some routes import { requireUser } but the middleware is really requireAuthDev.
 */
export const requireUser = requireAuthDev;
