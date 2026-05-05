// src/styles/ui.ts

export const UI = {
  colors: {
    bg: "#f7efd9",
    surface: "#fffdf7",
    border: "rgba(92, 64, 18, 0.14)",
    text: "#173234",
    subtext: "#66736b",
    primary: "#0b3a3f",
    accent: "#d6a51f",
  },

  layout: {
    page: {
      background: "#f7efd9",
      padding: 20,
      minHeight: "100vh",
    },

    container: {
      maxWidth: 1200,
      margin: "0 auto",
    },
  },

  card: {
    background: "#fffdf7",
    border: "1px solid rgba(92,64,18,0.14)",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 4px 10px rgba(69,49,17,0.05)",
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#0b3a3f",
  },

  sectionSub: {
    color: "#66736b",
    fontSize: 14,
  },

  // 🔥 CLEAN TABS (like HHC)
  tabs: {
    container: {
      display: "flex",
      gap: 12,
      borderBottom: "1px solid rgba(92,64,18,0.14)",
      paddingBottom: 6,
      marginTop: 10,
    },

    tab: {
      background: "transparent",
      border: "none",
      padding: "8px 12px",
      fontWeight: 600,
      color: "#66736b",
      cursor: "pointer",
    },

    active: {
      color: "#0b3a3f",
      borderBottom: "2px solid #d6a51f",
    },
  },

  button: {
    primary: {
      background: "#0b3a3f",
      color: "#fff",
      borderRadius: 10,
      padding: "10px 14px",
      border: "none",
      cursor: "pointer",
    },

    light: {
      background: "#fffdf7",
      border: "1px solid rgba(92,64,18,0.14)",
      borderRadius: 10,
      padding: "10px 14px",
      cursor: "pointer",
    },
  },
};
