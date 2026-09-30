export function isValidCountryCode(countryCode: string): boolean {
  return /^[A-Za-z]{2}$/.test(countryCode)
}
