import type { CSSProperties, ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  returnControl?: ReactNode;
  children: ReactNode;
};

export default function ManagerWorkspaceShell({
  title,
  subtitle,
  meta,
  actions,
  returnControl,
  children,
}: Props) {
  return (
    <section style={styles.shell} aria-label={title}>
      {returnControl ? <div style={styles.returnSlot}>{returnControl}</div> : null}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>{title}</h2>
          {subtitle ? <p style={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {meta || actions ? (
          <div style={styles.side}>
            {meta ? <div>{meta}</div> : null}
            {actions ? <div>{actions}</div> : null}
          </div>
        ) : null}
      </div>
      <div style={styles.content}>{children}</div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    display: "grid",
    gap: 12,
  },
  returnSlot: {
    display: "flex",
    justifyContent: "flex-start",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
  },
  title: {
    margin: 0,
    color: "#17364b",
    fontSize: 18,
    fontWeight: 900,
  },
  subtitle: {
    margin: "4px 0 0",
    color: "#607486",
    fontSize: 13,
    lineHeight: 1.4,
  },
  side: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  content: {
    minWidth: 0,
  },
};
