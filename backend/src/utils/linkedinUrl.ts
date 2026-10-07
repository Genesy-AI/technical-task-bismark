export function isValidLinkedinUrl(url: string): boolean {
  return /^(https?:\/\/)?([\w-]+\.)?linkedin\.com\/.+$/i.test(url)
}
