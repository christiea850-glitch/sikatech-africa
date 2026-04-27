// src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoute from "./auth/ProtectedRoute";
import Layout from "./components/Layout";

// Pages
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import SalesPage from "./pages/SalesPage";
import SalesDashboardPage from "./pages/SalesDashboardPage";
import NotificationsPage from "./pages/NotificationsPage";
import DepartmentPage from "./pages/DepartmentPage";
import DepartmentsPage from "./pages/DepartmentsPage";
import ManageModulesPage from "./pages/ManageModulesPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import NotAuthorizedPage from "./pages/NotAuthorizedPage";
import ShiftClosingSubmitPage from "./pages/ShiftClosingSubmitPage";
import ReconcilePage from "./pages/ReconcilePage";
import CashDeskClosingsPage from "./pages/CashDeskClosingsPage";
import ExpensePage from "./expenses/ExpensePage";
import AccountingWorkbenchPage from "./pages/AccountingWorkbenchPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />

        <Route path="dashboard" element={<DashboardPage />} />

        <Route path="sales" element={<SalesPage />} />
        <Route path="sales-dashboard" element={<SalesDashboardPage />} />
        <Route
          path="accounting-workbench"
          element={
            <ProtectedRoute moduleKey="accounting-workbench">
              <AccountingWorkbenchPage />
            </ProtectedRoute>
          }
        />
        <Route path="expenses" element={<ExpensePage />} />

        <Route
          path="shift-closing"
          element={
            <ProtectedRoute moduleKey="shift-closing">
              <ShiftClosingSubmitPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="reconcile"
          element={
            <ProtectedRoute moduleKey="reconcile">
              <ReconcilePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="cash-desk-closings"
          element={
            <ProtectedRoute moduleKey="cash-desk-closings">
              <CashDeskClosingsPage />
            </ProtectedRoute>
          }
        />

        <Route path="notifications" element={<NotificationsPage />} />

        <Route
          path="departments/manage"
          element={
            <ProtectedRoute moduleKey="manage-departments">
              <DepartmentsPage />
            </ProtectedRoute>
          }
        />
        <Route path="departments/:deptKey" element={<DepartmentPage />} />

        <Route
          path="manage-modules"
          element={
            <ProtectedRoute moduleKey="manage-modules">
              <ManageModulesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="audit-logs"
          element={
            <ProtectedRoute moduleKey="audit-logs">
              <AuditLogsPage />
            </ProtectedRoute>
          }
        />

        <Route path="not-authorized" element={<NotAuthorizedPage />} />

        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
