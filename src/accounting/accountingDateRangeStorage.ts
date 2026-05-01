export type AccountingDateRange = {
  startDate: string;
  endDate: string;
};

const STORAGE_KEY = "sikatech_accounting_date_range_v1";
export const ACCOUNTING_DATE_RANGE_CHANGED_EVENT =
  "sikatech_accounting_date_range_changed";

function isDateInputValue(value: unknown) {
  return typeof value === "string" && (/^\d{4}-\d{2}-\d{2}$/.test(value) || value === "");
}

export function loadAccountingDateRange(
  fallback: AccountingDateRange = { startDate: "", endDate: "" }
): AccountingDateRange {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return fallback;

    const startDate = (parsed as Record<string, unknown>).startDate;
    const endDate = (parsed as Record<string, unknown>).endDate;

    return {
      startDate: isDateInputValue(startDate) ? String(startDate) : fallback.startDate,
      endDate: isDateInputValue(endDate) ? String(endDate) : fallback.endDate,
    };
  } catch {
    return fallback;
  }
}

export function hasAccountingDateRange() {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function saveAccountingDateRange(range: AccountingDateRange) {
  const next = {
    startDate: isDateInputValue(range.startDate) ? range.startDate : "",
    endDate: isDateInputValue(range.endDate) ? range.endDate : "",
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  try {
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(ACCOUNTING_DATE_RANGE_CHANGED_EVENT, { detail: next })
      );
    }, 0);
  } catch {
    // Date filters should still save in non-browser test contexts.
  }

  return next;
}
