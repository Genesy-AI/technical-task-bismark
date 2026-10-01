import Papa from 'papaparse'

export interface CsvLead {
  firstName: string
  lastName: string
  email: string
  jobTitle?: string
  countryCode?: string
  companyName?: string
  phoneNumber?: string
  yearsInRole?: string
  linkedinUrl?: string
  isValid: boolean
  errors: string[]
  warnings: string[]
  rowIndex: number
}

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const isValidCountryCode = (countryCode: string): boolean => {
  return /^[A-Za-z]{2}$/.test(countryCode)
}

export const isValidYearsInRole = (yearsInRole: string): boolean => {
  return /^\d+$/.test(yearsInRole)
}

export const isValidLinkedinUrl = (linkedinUrl: string): boolean => {
  return /^(https?:\/\/)?([\w-]+\.)?linkedin\.com\/.+$/i.test(linkedinUrl)
}

export const parseCsv = (content: string): CsvLead[] => {
  if (!content?.trim()) {
    throw new Error('CSV content cannot be empty')
  }

  const parseResult = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transform: (value) => value.trim(),
    transformHeader: (header) => header.trim().toLowerCase(),
    quoteChar: '"',
  })

  if (parseResult.errors.length > 0) {
    const criticalErrors = parseResult.errors.filter(
      (error) => error.type === 'Delimiter' || error.type === 'Quotes' || error.type === 'FieldMismatch'
    )
    if (criticalErrors.length > 0) {
      throw new Error(`CSV parsing failed: ${criticalErrors[0].message}`)
    }
  }

  if (!parseResult.data || parseResult.data.length === 0) {
    throw new Error('CSV file appears to be empty or contains no valid data')
  }

  const data: CsvLead[] = []

  parseResult.data.forEach((row, index) => {
    if (Object.values(row).every((value) => !value)) return

    const lead: Partial<CsvLead> = { rowIndex: index + 2 }

    Object.entries(row).forEach(([header, value]) => {
      const normalizedHeader = header.toLowerCase().replace(/[^a-z]/g, '')
      const trimmedValue = value?.trim() || ''

      switch (normalizedHeader) {
        case 'firstname':
          lead.firstName = trimmedValue
          break
        case 'lastname':
          lead.lastName = trimmedValue
          break
        case 'email':
          lead.email = trimmedValue
          break
        case 'jobtitle':
          lead.jobTitle = trimmedValue || undefined
          break
        case 'countrycode':
          lead.countryCode = trimmedValue || undefined
          break
        case 'companyname':
          lead.companyName = trimmedValue || undefined
          break
        case 'phonenumber':
          lead.phoneNumber = trimmedValue || undefined
          break
        case 'yearsinrole':
          lead.yearsInRole = trimmedValue || undefined
          break
        case 'linkedinurl':
        case 'linkedin':
          lead.linkedinUrl = trimmedValue || undefined
          break
      }
    })

    const errors: string[] = []
    if (!lead.firstName?.trim()) {
      errors.push('First name is required')
    }
    if (!lead.lastName?.trim()) {
      errors.push('Last name is required')
    }
    if (!lead.email?.trim()) {
      errors.push('Email is required')
    } else if (!isValidEmail(lead.email)) {
      errors.push('Invalid email format')
    }

    const warnings: string[] = []
    if (lead.countryCode && !isValidCountryCode(lead.countryCode)) {
      warnings.push(`Invalid country code "${lead.countryCode}" (expected a 2-letter code) — cleared`)
      lead.countryCode = undefined
    } else if (lead.countryCode) {
      lead.countryCode = lead.countryCode.toUpperCase()
    }

    if (lead.yearsInRole && !isValidYearsInRole(lead.yearsInRole)) {
      warnings.push(
        `Invalid years in role "${lead.yearsInRole}" (expected a non-negative whole number) — cleared`
      )
      lead.yearsInRole = undefined
    }

    if (lead.linkedinUrl && !isValidLinkedinUrl(lead.linkedinUrl)) {
      warnings.push(`Invalid LinkedIn URL "${lead.linkedinUrl}" — cleared`)
      lead.linkedinUrl = undefined
    }

    data.push({
      ...lead,
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      email: lead.email || '',
      isValid: errors.length === 0,
      errors,
      warnings,
    } as CsvLead)
  })

  return data
}
