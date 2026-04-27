import { Navigate, Outlet } from "react-router-dom";
import { useBusinessSetup } from "./BusinessSetupContext";

export default function RequireBusinessSetup() {
  const { isSetupComplete } = useBusinessSetup();

  if (!isSetupComplete) {
    return <Navigate to="/setup/business-type" replace />;
  }

  return <Outlet />;
}
