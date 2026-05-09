import type { ComponentType, CSSProperties } from "react";

type DetailMetricProps = { label: string; value: string };

type Props = {
  styles: Record<string, CSSProperties>;
  rangeLabel: string;
  operationsReadinessRows: any[];
  maxOperationsValue: number;
  pendingClosingsLength: number;
  openShiftsLength: number;
  unpaidBookingsLength: number;
  activeDepartmentPercent: number;
  activeDepartments: number;
  quietDepartments: number;
  DetailMetric: ComponentType<DetailMetricProps>;
  labelize: (value: string) => string;
};

export default function OperationsAnalytics({
  styles,
  rangeLabel,
  operationsReadinessRows,
  maxOperationsValue,
  pendingClosingsLength,
  openShiftsLength,
  unpaidBookingsLength,
  activeDepartmentPercent,
  activeDepartments,
  quietDepartments,
  DetailMetric,
  labelize,
}: Props) {
  return (
    <section style={styles.analyticsPanel}>
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>Operations Drilldown Analytics</h2>
          <p style={styles.sectionSubtitle}>
            Readiness indicators for shifts, closings, front desk, and departments.
          </p>
        </div>
        <span style={styles.sectionMeta}>{rangeLabel}</span>
      </div>
      <div style={styles.analyticsGrid}>
        <article className="manager-analytics-card" style={styles.visualCard}>
          <h3 style={styles.visualTitle}>Operational Readiness</h3>
          <div style={styles.visualBarStack}>
            {operationsReadinessRows.map((row) => (
              <div key={row.label} style={styles.visualBarRow}>
                <div style={styles.visualBarLabel}>{row.label}</div>
                <div style={styles.visualBarTrack}>
                  <div
                    style={{
                      ...styles.visualBarFill,
                      ...styles[`visualBar${labelize(row.tone)}`],
                      width: `${row.value === 0 ? 8 : Math.max(12, (row.value / maxOperationsValue) * 100)}%`,
                    }}
                  />
                </div>
                <div style={styles.visualBarValue}>{row.helper}</div>
              </div>
            ))}
          </div>
        </article>
        <article className="manager-analytics-card" style={styles.visualCard}>
          <h3 style={styles.visualTitle}>Closing Readiness</h3>
          <div style={styles.drilldownMetricGrid}>
            <DetailMetric label="Pending Closings" value={String(pendingClosingsLength)} />
            <DetailMetric label="Open Shifts" value={String(openShiftsLength)} />
            <DetailMetric label="Cash Desk Signal" value={pendingClosingsLength ? "Review" : "Ready"} />
          </div>
        </article>
        <article className="manager-analytics-card" style={styles.visualCard}>
          <h3 style={styles.visualTitle}>Front Desk State</h3>
          <div style={styles.drilldownFocusValue}>
            {unpaidBookingsLength ? `${unpaidBookingsLength} unpaid balance${unpaidBookingsLength === 1 ? "" : "s"}` : "Settled"}
          </div>
          <p style={styles.visualSub}>
            Room balance signal is based on existing front desk booking data for this range.
          </p>
        </article>
        <article className="manager-analytics-card" style={styles.visualCard}>
          <h3 style={styles.visualTitle}>Department Health</h3>
          <div style={styles.collectionTrack}>
            <div style={{ ...styles.collectionFill, width: `${Math.max(4, activeDepartmentPercent)}%` }} />
          </div>
          <div style={styles.visualSplit}>
            <span>Active: {activeDepartments}</span>
            <span>Quiet: {quietDepartments}</span>
            <strong>{activeDepartmentPercent.toFixed(0)}%</strong>
          </div>
        </article>
      </div>
    </section>
  );
}
