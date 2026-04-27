// src/pages/dashboards/StaffDashboard.tsx
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

export default function StaffDashboard() {
  const { user } = useAuth();

  return (
    <div style={{ padding: 16 }}>
      <h1>Staff Dashboard</h1>
      <p>Welcome to SikaTech Africa – Restaurant Module</p>

      {user?.departmentKey ? (
        <p>
          Your Department: <b>{user.departmentKey}</b>
        </p>
      ) : (
        <p style={{ opacity: 0.8 }}>
          Department not set. Ask admin to assign your department.
        </p>
      )}

      <div style={{ marginTop: 12 }}>
        <Link to="/app/sales">Go to Sales Entry</Link>
      </div>

      <div style={{ marginTop: 8 }}>
        <Link to="/app/notifications">Notifications</Link>
      </div>
    </div>
  );
}
