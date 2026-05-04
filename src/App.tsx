// src/App.tsx
import { Routes, Route, Navigate, useParams } from "react-router-dom";

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
import LedgerDebugPage from "./pages/LedgerDebugPage";
import FrontDeskEntry from "./sales/FrontDeskEntry";

function DepartmentRoute() {
  const { deptKey } = useParams<{ deptKey: string }>();

  return (
    <ProtectedRoute capability="departmentView" departmentKey={deptKey}>
      <DepartmentPage />
    </ProtectedRoute>
  );
}

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

        <Route
          path="sales"
          element={
            <ProtectedRoute capability="operateSales" moduleKey="sales">
              <SalesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="frontdesk"
          element={
            <ProtectedRoute capability="operateFrontDesk" moduleKey="sales">
              <FrontDeskEntry />
            </ProtectedRoute>
          }
        />
        <Route
          path="sales-dashboard"
          element={
            <ProtectedRoute capability="reviewFinancials" moduleKey="sales-summary">
              <SalesDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="accounting-workbench"
          element={
            <ProtectedRoute capability="reviewFinancials" moduleKey="accounting-workbench">
              <AccountingWorkbenchPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="ledger-debug"
          element={
            <ProtectedRoute capability="reviewFinancials" moduleKey="ledger-debug">
              <LedgerDebugPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="expenses"
          element={
            <ProtectedRoute capability="accessExpenses">
              <ExpensePage />
            </ProtectedRoute>
          }
        />

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
            <ProtectedRoute capability="reviewFinancials" moduleKey="reconcile">
              <ReconcilePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="cash-desk-closings"
          element={
            <ProtectedRoute capability="approveOrReviewClosings" moduleKey="cash-desk-closings">
              <CashDeskClosingsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="notifications"
          element={
            <ProtectedRoute capability="all" moduleKey="notifications">
              <NotificationsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="departments/manage"
          element={
            <ProtectedRoute capability="manageSetup" moduleKey="manage-departments">
              <DepartmentsPage />
            </ProtectedRoute>
          }
        />
        <Route path="departments/:deptKey" element={<DepartmentRoute />} />

        <Route
          path="manage-modules"
          element={
            <ProtectedRoute capability="manageSetup" moduleKey="manage-modules">
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
