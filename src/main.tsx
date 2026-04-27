import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";

import { AuthProvider } from "./auth/AuthContext";
import { BusinessSetupProvider } from "./setup/BusinessSetupContext";
import { ModuleConfigProvider } from "./setup/ModuleConfigContext";
import { DepartmentsProvider } from "./departments/DepartmentsContext";
import { ActivityProvider } from "./activity/ActivityContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { ShiftProvider } from "./shifts/ShiftContext";
import { SalesProvider } from "./sales/SalesContext";
import { ExpenseProvider } from "./expenses/ExpenseContext";

console.log("✅ main.tsx mounted");

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found in index.html");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense
        fallback={
          <div style={{ padding: 24, fontFamily: "system-ui" }}>
            Loading...
          </div>
        }
      >
        <BrowserRouter>
          <AuthProvider>
            <BusinessSetupProvider>
              <ModuleConfigProvider>
                <DepartmentsProvider>
                  <ActivityProvider>
                    <ShiftProvider>
                      <SalesProvider>
                        <ExpenseProvider>
                          <App />
                        </ExpenseProvider>
                      </SalesProvider>
                    </ShiftProvider>
                  </ActivityProvider>
                </DepartmentsProvider>
              </ModuleConfigProvider>
            </BusinessSetupProvider>
          </AuthProvider>
        </BrowserRouter>
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);