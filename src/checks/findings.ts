export type Severity = "error" | "warning";
export interface Where { locale?: string; target?: string; page?: string }
export interface Finding extends Where { rule: string; severity: Severity; message: string }

export const err = (rule: string, message: string, where: Where = {}): Finding => ({ rule, severity: "error", message, ...where });
export const warn = (rule: string, message: string, where: Where = {}): Finding => ({ rule, severity: "warning", message, ...where });

export function formatFinding(f: Finding): string {
  const where = [f.locale, f.target, f.page].filter(Boolean).join("/");
  return `${f.severity === "error" ? "error" : "warn "} ${f.rule}${where ? ` (${where})` : ""}: ${f.message}`;
}
