import { Router } from "express";
import type { Role, User } from "../mvp/store.js";

const router = Router();

/**
 * -----------------------------------
 * DEV USERS (DEVELOPMENT ONLY)
 * Passwords are plain text for now
 * -----------------------------------
 */
const DEMO_USERS: Record<
  string,
  {
    password: string;
    role: Role;
    departmentKey?: string;
    businessId?: string;
    branchId?: string;
  }
> = {
  // Admin / Management
  admin01: { password: "1234", role: "admin" },
  mgr01: { password: "1234", role: "manager" },
  acc01: { password: "1234", role: "accounting" },
  aud01: { password: "1234", role: "auditor" },

  // Staff by department
  bar01: { password: "1234", role: "staff", departmentKey: "bar" },
  kitchen01: { password: "1234", role: "staff", departmentKey: "kitchen" },
  frontdesk01: { password: "1234", role: "staff", departmentKey: "front_desk" },
  gym01: { password: "1234", role: "staff", departmentKey: "gym" },
  laundry01: { password: "1234", role: "staff", departmentKey: "laundry_cleaning" },
};

const DEFAULT_BUSINESS_ID = "biz_main";
const DEFAULT_BRANCH_ID = "main";

/**
 * -----------------------------------
 * AUTH PING (health check)
 * -----------------------------------
 */
router.get("/ping", (_req, res) => {
  res.json({ ok: true, route: "/api/auth/ping" });
});

/**
 * -----------------------------------
 * LOGIN
 * -----------------------------------
 */
router.post("/login", (req, res) => {
  const employeeId = String(req.body?.employeeId ?? "").trim();
  const password = String(req.body?.password ?? "").trim();

  if (!employeeId || !password) {
    return res.status(400).json({
      ok: false,
      error: "employeeId and password are required",
    });
  }

  const found = DEMO_USERS[employeeId];

  if (!found || found.password !== password) {
    return res.status(401).json({
      ok: false,
      error: "Invalid credentials",
    });
  }

  const user: User = {
    employeeId,
    role: found.role,
    businessId: found.businessId ?? DEFAULT_BUSINESS_ID,
    branchId: found.branchId ?? DEFAULT_BRANCH_ID,
    departmentKey: found.departmentKey,
  };

  // DEV MODE: No JWT yet — frontend stores user and sends headers
  return res.json({ ok: true, user });
});

export default router;


