export interface Lead {
  firstName: string
  lastName?: string | null
  email?: string | null
  jobTitle?: string | null
  companyName?: string | null
  countryCode?: string | null
  phoneNumber?: string | null
  yearsInRole?: number | null
  linkedinUrl?: string | null
}

// Add new templatable lead fields here only — generateMessageFromTemplate derives
// `availableFields` from this single list, so nothing else needs to change.
const TEMPLATE_FIELD_KEYS = [
  'firstName',
  'lastName',
  'email',
  'jobTitle',
  'companyName',
  'countryCode',
  'phoneNumber',
  'yearsInRole',
  'linkedinUrl',
] as const satisfies readonly (keyof Lead)[]

export function generateMessageFromTemplate(template: string, lead: Lead): string {
  let message = template

  const availableFields: Record<(typeof TEMPLATE_FIELD_KEYS)[number], Lead[keyof Lead]> = Object.fromEntries(
    TEMPLATE_FIELD_KEYS.map((key) => [key, lead[key]])
  ) as Record<(typeof TEMPLATE_FIELD_KEYS)[number], Lead[keyof Lead]>

  const templateVariables = template.match(/\{(\w+)\}/g) || []

  for (const variable of templateVariables) {
    const fieldName = variable.slice(1, -1)

    if (fieldName in availableFields) {
      const fieldValue = availableFields[fieldName as keyof typeof availableFields]

      if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
        throw new Error(`Missing required field: ${fieldName}`)
      }

      message = message.replace(new RegExp(`\\{${fieldName}\\}`, 'g'), String(fieldValue))
    } else {
      throw new Error(`Unknown field in template: ${fieldName}`)
    }
  }

  return message
}
