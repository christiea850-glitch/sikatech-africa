import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  FINANCIAL_LEDGER_CHANGED_EVENT,
  LEDGER_SOURCE_TYPES,
  loadLedgerEntries,
  selectLedgerTotals,
  type CanonicalLedgerEntry,
} from "../finance/financialLedger";

const ALL = "all";

function money(value: number) {
  return (Number.isFinite(value) ? value : 0).toFixed(2);
}

function safeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safeText(value);
  return date.toLocaleString();
}

function uniqueDepartments(entries: CanonicalLedgerEntry[]) {
  return Array.from(
    new Set(
      entries
        .map((entry) => entry.departmentKey)
        .map((departmentKey) => String(departmentKey || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

export default function LedgerDebugPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [sourceType, setSourceType] = useState(ALL);
  const [departmentKey, setDepartmentKey] = useState(ALL);

  useEffect(() => {
    const refresh = () => setRefreshKey((key) => key + 1);
    window.addEventListener(FINANCIAL_LEDGER_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(FINANCIAL_LEDGER_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const entries = useMemo(() => loadLedgerEntries(), [refreshKey]);
  const departmentOptions = useMemo(() => uniqueDepartments(entries), [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const sourceMatches = sourceType === ALL || entry.sourceType === sourceType;
      const departmentMatches =
        departmentKey === ALL || entry.departmentKey === departmentKey;
      return sourceMatches && departmentMatches;
    });
  }, [entries, sourceType, departmentKey]);

  const totals = useMemo(() => selectLedgerTotals(filteredEntries), [filteredEntries]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Ledger Debug</h1>
          <p style={styles.subtitle}>
            Internal view of canonical ledger entries. Existing dashboard calculations are not
            changed here.
          </p>
        </div>
      </div>

      <div style={styles.totalsGrid}>
        <TotalCard label="Total revenue" value={totals.revenue} />
        <TotalCard label="Total collections" value={totals.collections} />
        <TotalCard label="Total receivables" value={totals.receivables} />
        <TotalCard label="Total expenses" value={totals.expenses} />
      </div>

      <div style={styles.filters}>
        <label style={styles.filterLabel}>
          Source type
          <select
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value)}
            style={styles.select}
          >
            <option value={ALL}>All source types</option>
            {LEDGER_SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.filterLabel}>
          Department
          <select
            value={departmentKey}
            onChange={(event) => setDepartmentKey(event.target.value)}
            style={styles.select}
          >
            <option value={ALL}>All departments</option>
            {departmentOptions.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </label>

        <div style={styles.entryCount}>
          Showing {filteredEntries.length} of {entries.length} ledger entries
        </div>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <Th>occurredAt</Th>
              <Th>sourceType</Th>
              <Th>sourceId</Th>
              <Th>departmentKey</Th>
              <Th>bookingCode</Th>
              <Th>roomNo</Th>
              <Th>customerName</Th>
              <Th>paymentMethod</Th>
              <Th align="right">revenueAmount</Th>
              <Th align="right">collectionAmount</Th>
              <Th align="right">receivableAmount</Th>
              <Th align="right">expenseAmount</Th>
              <Th>status</Th>
              <Th>shiftId</Th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={14} style={styles.emptyCell}>
                  No canonical ledger entries found.
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <Td>{dateTime(entry.occurredAt)}</Td>
                  <Td>{entry.sourceType}</Td>
                  <Td>{safeText(entry.sourceId)}</Td>
                  <Td>{safeText(entry.departmentKey)}</Td>
                  <Td>{safeText(entry.bookingCode)}</Td>
                  <Td>{safeText(entry.roomNo)}</Td>
                  <Td>{safeText(entry.customerName)}</Td>
                  <Td>{entry.paymentMethod}</Td>
                  <Td align="right">{money(entry.revenueAmount)}</Td>
                  <Td align="right">{money(entry.collectionAmount)}</Td>
                  <Td align="right">{money(entry.receivableAmount)}</Td>
                  <Td align="right">{money(entry.expenseAmount)}</Td>
                  <Td>{entry.status}</Td>
                  <Td>{safeText(entry.shiftId)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TotalCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.totalCard}>
      <div style={styles.totalLabel}>{label}</div>
      <div style={styles.totalValue}>{money(value)}</div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: CSSProperties["textAlign"];
}) {
  return <th style={{ ...styles.th, textAlign: align }}>{children}</th>;
}

function Td({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: CSSProperties["textAlign"];
}) {
  return <td style={{ ...styles.td, textAlign: align }}>{children}</td>;
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  title: {
    margin: 0,
    color: "var(--sk-navy)",
    fontSize: 28,
    lineHeight: 1.1,
  },
  subtitle: {
    margin: "8px 0 0",
    color: "var(--sk-muted)",
    maxWidth: 760,
    lineHeight: 1.5,
  },
  totalsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  totalCard: {
    border: "1px solid var(--sk-border)",
    borderRadius: 14,
    padding: 16,
    background: "#ffffff",
  },
  totalLabel: {
    color: "var(--sk-muted)",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  totalValue: {
    marginTop: 8,
    color: "var(--sk-navy)",
    fontSize: 24,
    fontWeight: 900,
  },
  filters: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-end",
    padding: 14,
    border: "1px solid var(--sk-border)",
    borderRadius: 14,
    background: "#ffffff",
  },
  filterLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    color: "var(--sk-navy)",
    fontSize: 13,
    fontWeight: 800,
  },
  select: {
    minWidth: 220,
    padding: "10px 12px",
    border: "1px solid var(--sk-border)",
    borderRadius: 10,
    color: "var(--sk-navy)",
    background: "#ffffff",
    fontWeight: 700,
  },
  entryCount: {
    marginLeft: "auto",
    color: "var(--sk-muted)",
    fontSize: 13,
    fontWeight: 700,
    paddingBottom: 10,
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid var(--sk-border)",
    borderRadius: 14,
    background: "#ffffff",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1500,
  },
  th: {
    padding: "12px 10px",
    borderBottom: "1px solid var(--sk-border)",
    background: "#f8fafc",
    color: "var(--sk-navy)",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "11px 10px",
    borderBottom: "1px solid var(--sk-border)",
    color: "#1f2937",
    fontSize: 13,
    whiteSpace: "nowrap",
    verticalAlign: "top",
  },
  emptyCell: {
    padding: 24,
    color: "var(--sk-muted)",
    textAlign: "center",
    fontWeight: 700,
  },
};
