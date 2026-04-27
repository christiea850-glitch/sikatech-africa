import { useAuth } from "../auth/AuthContext";
import FrontDeskEntry from "../sales/FrontDeskEntry";
import SalesEntryPanel from "../sales/SalesEntryPanel";

export default function SalesPage() {
  const { user } = useAuth();

  const deptKey = String(user?.departmentKey || "").toLowerCase();

  if (deptKey === "front-desk" || deptKey === "frontdesk") {
    return <FrontDeskEntry />;
  }

  return <SalesEntryPanel />;
}