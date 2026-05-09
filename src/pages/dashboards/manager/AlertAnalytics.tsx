import type { CSSProperties } from "react";

type Props = {
  styles: Record<string, CSSProperties>;
  alerts: any[];
  alertSeverityRows: any[];
  maxAlertSeverityCount: number;
  alertHotspots: any[];
  maxAlertHotspotCount: number;
  labelize: (value: string) => string;
};

export default function AlertAnalytics({
  styles,
  alerts,
  alertSeverityRows,
  maxAlertSeverityCount,
  alertHotspots,
  maxAlertHotspotCount,
  labelize,
}: Props) {
  return (
    <section style={styles.analyticsPanel}>
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>Alert Drilldown Analytics</h2>
          <p style={styles.sectionSubtitle}>
            Severity distribution, risk concentration, and unresolved alert emphasis.
          </p>
        </div>
        <span style={styles.sectionMeta}>{alerts.length} alert{alerts.length === 1 ? "" : "s"}</span>
      </div>
      {alerts.length === 0 ? (
        <div style={styles.emptyState}>No chartable activity for this range yet.</div>
      ) : (
        <div style={styles.analyticsGrid}>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Severity Distribution</h3>
            <div style={styles.visualBarStack}>
              {alertSeverityRows.map((row) => (
                <div key={row.label} style={styles.visualBarRow}>
                  <div style={styles.visualBarLabel}>{row.label}</div>
                  <div style={styles.visualBarTrack}>
                    <div
                      style={{
                        ...styles.visualBarFill,
                        ...styles[`visualBar${labelize(row.tone)}`],
                        width: `${row.count === 0 ? 0 : Math.max(8, (row.count / maxAlertSeverityCount) * 100)}%`,
                      }}
                    />
                  </div>
                  <div style={styles.visualBarValue}>{row.count}</div>
                </div>
              ))}
            </div>
          </article>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Risk Hotspots</h3>
            {alertHotspots.length === 0 ? (
              <div style={styles.visualEmpty}>No chartable activity for this range yet.</div>
            ) : (
              <div style={styles.visualBarStack}>
                {alertHotspots.map((row) => (
                  <div key={row.label} style={styles.visualBarRow}>
                    <div style={styles.visualBarLabel}>{row.label}</div>
                    <div style={styles.visualBarTrack}>
                      <div
                        style={{
                          ...styles.visualBarFill,
                          ...styles.visualBarLoss,
                          width: `${Math.max(8, (row.count / maxAlertHotspotCount) * 100)}%`,
                        }}
                      />
                    </div>
                    <div style={styles.visualBarValue}>{row.count}</div>
                  </div>
                ))}
              </div>
            )}
          </article>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Unresolved Emphasis</h3>
            <div style={styles.drilldownFocusValue}>{alerts.length}</div>
            <p style={styles.visualSub}>
              Current manager alerts remain active until the underlying operating signal changes.
            </p>
          </article>
          <article className="manager-analytics-card" style={styles.visualCard}>
            <h3 style={styles.visualTitle}>Alert Concentration</h3>
            <div style={styles.drilldownList}>
              {alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} style={styles.drilldownListRow}>
                  <span>{alert.title}</span>
                  <strong>{labelize(alert.type)}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
