export async function verifyEmail(email: string): Promise<boolean> {
  if (email.includes('john.doe')) {
    return false
  }

  if (email.includes('jane.smith')) {
    await new Promise((resolve) => setTimeout(resolve, 20000))
  }

  if (/\+/.test(email)) {
    return false
  }

  return true
}
