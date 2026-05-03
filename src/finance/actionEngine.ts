import type { CanonicalLedgerEntry } from "./financialLedger";

export type ActionSuggestion = {
  id: string;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  departmentKey?: string;   // ✅ FIXED
};

export function generateRecommendedActions(entries: CanonicalLedgerEntry[]): ActionSuggestion[] {
  const actions: ActionSuggestion[] = [];

  const revenue = entries.reduce((sum, e) => sum + (e.revenueAmount || 0), 0);
  const expenses = entries.reduce((sum, e) => sum + (e.expenseAmount || 0), 0);

  // 🔴 LOSS DETECTION
  if (expenses > revenue) {
    actions.push({
      id: "loss-warning",
      title: "Business Operating at a Loss",
      description: "Expenses exceed revenue. Reduce costs or increase pricing immediately.",
      severity: "high",
    });
  }

  // 📊 EXPENSE CATEGORY ANALYSIS
  const expenseMap: Record<string, number> = {};

  entries.forEach(e => {
    if (e.expenseAmount) {
      const key = e.sourceType || "unknown";
      expenseMap[key] = (expenseMap[key] || 0) + e.expenseAmount;
    }
  });

  const totalExpenses = Object.values(expenseMap).reduce((a, b) => a + b, 0);

  Object.entries(expenseMap).forEach(([key, value]) => {
    const pct = (value / totalExpenses) * 100;

    if (pct > 50) {
      actions.push({
        id: `expense-${key}`,
        title: "High Expense Concentration",
        description: `${key} accounts for ${pct.toFixed(1)}% of expenses. Consider reducing frequency or negotiating supplier costs.`,
        severity: "medium",
      });
    }
  });

  // 🟢 LOW ACTIVITY
  if (entries.length < 5) {
    actions.push({
      id: "low-activity",
      title: "Low Business Activity",
      description: "Very few transactions detected. Consider promotions or marketing campaigns.",
      severity: "low",
    });
  }

  return actions;
}