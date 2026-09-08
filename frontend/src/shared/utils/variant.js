const normalizeVariantPart = (value) => String(value || "").trim().toLowerCase();
const normalizeAxisName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

export const getVariantSignature = (variant = {}) =>
  Object.entries(variant || {})
    .map(([axis, value]) => [normalizeAxisName(axis), normalizeVariantPart(value)])
    .filter(([axis, value]) => axis && value)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([axis, value]) => `${axis}=${value}`)
    .join("|");

export const formatVariantLabel = (variant = {}) => {
  const entries = Object.entries(variant || {})
    .map(([axis, value]) => [String(axis || "").trim(), String(value || "").trim()])
    .filter(([axis, value]) => axis && value);
  if (!entries.length) return "";
  return entries
    .map(([axis, value]) => {
      const axisLabel = axis
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return `${axisLabel.charAt(0).toUpperCase()}${axisLabel.slice(1)}: ${value}`;
    })
    .join(" | ");
};
