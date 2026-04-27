// src/activity/RouteActivityLogger.tsx
import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useModuleConfig } from "../setup/ModuleConfigContext";
import { useDepartments } from "../departments/DepartmentsContext";
import { useActivity } from "./ActivityContext";
import { getSessionId } from "./sessionId";

function inferKey(pathname: string) {
  if (pathname === "/app" || pathname === "/app/") return "dashboard";
  if (!pathname.startsWith("/app/")) return "unknown";

  const after = pathname.slice("/app/".length);
  const [first, second] = after.split("/");

  if (!first) return "dashboard";
  if (first === "departments") return second ? `departments/${second}` : "departments";
  return first;
}

export default function RouteActivityLogger() {
  const { user } = useAuth();
  const { modules } = useModuleConfig();
  const { departments } = useDepartments();
  const { log } = useActivity();
  const { pathname } = useLocation();

  const sid = useMemo(() => getSessionId(), []);
  const key = useMemo(() => inferKey(pathname), [pathname]);

  const label = useMemo(() => {
    if (key.startsWith("departments/")) {
      const deptKey = key.split("/")[1] || "";
      const dept = departments.find((d: any) => d.key === deptKey);
      return dept?.name ?? `Department: ${deptKey}`;
    }
    const mod = modules.find((m: any) => m.key === key);
    return mod?.label ?? key.replace(/[-_]/g, " ");
  }, [key, modules, departments]);

  const lastPathRef = useRef<string>("");

  useEffect(() => {
    if (!user) return;

    // skip shell route (redirects immediately)
    if (pathname === "/app" || pathname === "/app/") return;

    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;

    if (pathname === "/app/not-authorized") return;
    if (typeof log !== "function") return;

    try {
      log({
        actor: { employeeId: user.employeeId, role: user.role },
        moduleKey: key,
        moduleLabel: label,
        action: "PAGE_VIEWED",
        summary: `[VIEW] ${label} | path=${pathname} | sid=${sid}`,
        meta: { path: pathname, sessionId: sid },
      });
    } catch {
      // never crash UI because logging failed
    }
  }, [user, pathname, key, label, sid, log]);

  return null;
}



