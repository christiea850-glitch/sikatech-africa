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
            <div style={styles.contentCard}>
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
    background: "#f6f8fa",
  },

  right: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    background: "#f6f8fa",
  },

  main: {
    flex: 1,
    padding: 20,
    background: "#f6f8fa",
  },

  contentWrap: {
    width: "100%",
    maxWidth: 1440,
    margin: "0 auto",
  },

  contentCard: {
    minHeight: "calc(100vh - 96px)",
    background: "#ffffff",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 2px 8px rgba(15, 23, 32, 0.05)",
    border: "1px solid rgba(15, 23, 32, 0.08)",
  },
};