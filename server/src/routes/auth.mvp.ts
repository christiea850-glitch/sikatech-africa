import { Router } from "express";

const router = Router();

/**
 * MVP Auth (NO DB)
 * Accepts employeeId + password (+ optional role) and returns a user payload
 */
router.post("/login", (req, res) => {
  const { employeeId, password, role } = req.body ?? {};

  const emp = String(employeeId ?? "").trim();
  const pwd = String(password ?? "");
  const r = String(role ?? "staff").trim();

  if (!emp || !pwd) {
    return res.status(400).json({ ok: false, error: "Employee ID and password are required." });
  }

  const defaultPwd = process.env.DEV_DEFAULT_PASSWORD || "1234";
  if (pwd !== defaultPwd) {
    return res.status(401).json({ ok: false, error: "Invalid credentials." });
  }

  // Allow only known roles
  const allowed = ["admin", "manager", "assistant_manager", "accounting", "auditor", "staff"];
  const safeRole = allowed.includes(r) ? r : "staff";

  return res.json({
    ok: true,
    user: {
      employeeId: emp,
      role: safeRole,
      // token not needed for MVP; headers are used after login
      token: undefined,
    },
  });
});

router.get("/me", (_req, res) => {
  // MVP: frontend can manage session locally; keep this simple
  res.json({ ok: true });
});

export default router;
