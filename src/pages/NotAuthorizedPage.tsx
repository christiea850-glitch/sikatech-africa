import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function NotAuthorizedPage() {
  const { user } = useAuth();

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 8 }}>Not Authorized</h2>
      <p style={{ marginBottom: 16 }}>
        You are logged in{user?.role ? ` as "${user.role}"` : ""}, but you don’t have access to this page.
      </p>

      <div style={{ display: "flex", gap: 12 }}>
        <Link to="/app/dashboard">Go to Dashboard</Link>
        <Link to="/login">Back to Login</Link>
      </div>
    </div>
  );
}
