// src/pages/DashboardPage.tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

import AdminDashboard from "./dashboards/AdminDashboard";
import ManagerDashboard from "./dashboards/ManagerDashboard";
import AccountingDashboard from "./dashboards/AccountingDashboard";
import StaffDashboard from "./dashboards/StaffDashboard";

export default function DashboardPage() {
  const { user } = useAuth();

  // ✅ Never return null (blank screen). If not logged in, go to login.
  if (!user) return <Navigate to="/login" replace />;

  switch (user.role) {
    case "admin":
      return <AdminDashboard />;

    case "manager":
    case "assistant_manager":
      return <ManagerDashboard />;

    case "accounting":
      return <AccountingDashboard />;

    case "auditor":
      return <ManagerDashboard />;

    case "staff":
    default:
      return <StaffDashboard />;
  }
}

