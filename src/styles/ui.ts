// src/styles/ui.ts

export const UI = {
  colors: {
    bg: "#f5f7fa",
    surface: "#ffffff",
    border: "rgba(15, 23, 42, 0.08)",
    text: "#0f2f3f",
    subtext: "#64748b",
    primary: "#0f2f3f", // your navy
    accent: "#1597b8",  // HHC-style blue
  },

  layout: {
    page: {
      background: "#f5f7fa",
      padding: 20,
      minHeight: "100vh",
    },

    container: {
      maxWidth: 1200,
      margin: "0 auto",
    },
  },

  card: {
    background: "#ffffff",
    border: "1px solid rgba(15,23,42,0.08)",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 4px 10px rgba(0,0,0,0.03)", // lighter
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#0f2f3f",
  },

  sectionSub: {
    color: "#64748b",
    fontSize: 14,
  },

  // 🔥 CLEAN TABS (like HHC)
  tabs: {
    container: {
      display: "flex",
      gap: 12,
      borderBottom: "1px solid rgba(15,23,42,0.08)",
      paddingBottom: 6,
      marginTop: 10,
    },

    tab: {
      background: "transparent",
      border: "none",
      padding: "8px 12px",
      fontWeight: 600,
      color: "#64748b",
      cursor: "pointer",
    },

    active: {
      color: "#0f2f3f",
      borderBottom: "2px solid #1597b8",
    },
  },

  button: {
    primary: {
      background: "#0f2f3f",
      color: "#fff",
      borderRadius: 10,
      padding: "10px 14px",
      border: "none",
      cursor: "pointer",
    },

    light: {
      background: "#fff",
      border: "1px solid rgba(15,23,42,0.08)",
      borderRadius: 10,
      padding: "10px 14px",
      cursor: "pointer",
    },
  },
};