// src/components/Layout.tsx
import { Outlet } from "react-router-dom";
import type { CSSProperties } from "react";

import Sidebar from "./Sidebar";
import Header from "./Header";
// import RouteActivityLogger from "../activity/RouteActivityLogger";

export default function Layout() {
  return (
    <div style={styles.shell}>
      {/* <RouteActivityLogger /> */}

      <Sidebar />

      <div style={styles.right}>
        <Header />

        <main style={styles.main}>
          <div style={styles.contentWrap}>
            <div style={styles.contentCard} className="sk-content-card">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    minHeight: "100vh",
    background: "linear-gradient(180deg, var(--sk-bg-warm) 0%, var(--sk-bg) 100%)",
  },

  right: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    background: "linear-gradient(180deg, var(--sk-bg-warm) 0%, var(--sk-bg) 100%)",
  },

  main: {
    flex: 1,
    padding: 24,
    background: "transparent",
  },

  contentWrap: {
    width: "100%",
    maxWidth: 1440,
    margin: "0 auto",
  },

  contentCard: {
    minHeight: "calc(100vh - 126px)",
    background: "var(--sk-card)",
    borderRadius: 20,
    padding: 24,
    boxShadow: "var(--sk-shadow-md)",
    border: "1px solid var(--sk-border-strong)",
  },
};
