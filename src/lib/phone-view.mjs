import { phoneExpiry } from "../../electron/services/phone-numbers.mjs";

/** @typedef {"all" | "attention" | "expired" | "active" | "unknown"} PhoneFilter */
/**
 * @template {{number: string, label: string, provider: string, notes: string, expiresAt: string}} T
 * @param {T[]} records
 * @param {string} query
 * @param {PhoneFilter} filter
 * @param {Date} [now]
 * @returns {T[]}
 */
export function visiblePhoneNumbers(records, query, filter, now = new Date()) {
  const needle = query.trim().toLocaleLowerCase();
  const numberNeedle = needle.replace(/[\s()+.-]/g, "");
  return records
    .filter((record) => {
      const status = phoneExpiry(record.expiresAt, now).status;
      const matchesFilter =
        filter === "all" ||
        (filter === "attention"
          ? ["expired", "today", "soon"].includes(status)
          : status === filter);
      const text = [record.number, record.label, record.provider, record.notes]
        .join(" ")
        .toLocaleLowerCase();
      const matchesQuery =
        !needle ||
        text.includes(needle) ||
        (numberNeedle && record.number.replace(/[\s()+.-]/g, "").includes(numberNeedle));
      return matchesFilter && Boolean(matchesQuery);
    })
    .sort((a, b) => {
      const first = phoneExpiry(a.expiresAt, now).status === "unknown" ? "9999-99-99" : a.expiresAt;
      const second =
        phoneExpiry(b.expiresAt, now).status === "unknown" ? "9999-99-99" : b.expiresAt;
      return (
        first.localeCompare(second) ||
        a.label.localeCompare(b.label) ||
        a.number.localeCompare(b.number)
      );
    });
}
