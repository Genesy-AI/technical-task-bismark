export function parseYearsInRole(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null
  }
  return Number(value)
}
