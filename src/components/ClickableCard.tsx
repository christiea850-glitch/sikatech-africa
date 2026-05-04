import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type ClickableCardProps = {
  children: ReactNode;
  onClick: () => void;
  style?: CSSProperties;
  active?: boolean;
  activeStyle?: CSSProperties;
  hint?: string;
  ariaLabel?: string;
};

export default function ClickableCard({
  children,
  onClick,
  style,
  active,
  activeStyle,
  hint = "View details",
  ariaLabel,
}: ClickableCardProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        ...styles.card,
        ...style,
        ...(active ? activeStyle : {}),
        ...(hovered ? styles.hovered : {}),
        ...(pressed ? styles.pressed : {}),
      }}
    >
      {children}
      {hint ? <span style={styles.hint}>{hint}</span> : null}
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
    transition: "transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease",
  },
  hovered: {
    transform: "translateY(-2px)",
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.10)",
  },
  pressed: {
    transform: "translateY(0)",
    boxShadow: "0 6px 16px rgba(15, 23, 42, 0.08)",
  },
  hint: {
    display: "block",
    marginTop: 10,
    fontSize: 12,
    fontWeight: 800,
    color: "#64748B",
  },
};
