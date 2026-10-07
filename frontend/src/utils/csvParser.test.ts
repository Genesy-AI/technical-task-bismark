import { describe, it, expect } from 'vitest'
import {
  parseCsv,
  isValidEmail,
  isValidCountryCode,
  isValidYearsInRole,
  isValidLinkedinUrl,
} from './csvParser'

describe('isValidEmail', () => {
  it('should return true for valid email addresses', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name@domain.co.uk')).toBe(true)
    expect(isValidEmail('first.last+tag@example.org')).toBe(true)
    expect(isValidEmail('123@456.com')).toBe(true)
  })

  it('should return false for invalid email addresses', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('test@')).toBe(false)
    expect(isValidEmail('@example.com')).toBe(false)
    expect(isValidEmail('test.example.com')).toBe(false)
    expect(isValidEmail('test@.com')).toBe(false)
    expect(isValidEmail('test@example')).toBe(false)
  })
})

describe('isValidCountryCode', () => {
  it('should return true for a 2-letter code', () => {
    expect(isValidCountryCode('US')).toBe(true)
    expect(isValidCountryCode('us')).toBe(true)
  })

  it('should return false for anything else', () => {
    expect(isValidCountryCode('XXX')).toBe(false)
    expect(isValidCountryCode('12')).toBe(false)
    expect(isValidCountryCode('')).toBe(false)
  })
})

describe('isValidYearsInRole', () => {
  it('should return true for a non-negative integer', () => {
    expect(isValidYearsInRole('0')).toBe(true)
    expect(isValidYearsInRole('5')).toBe(true)
  })

  it('should return false for negative numbers, decimals, or text', () => {
    expect(isValidYearsInRole('-1')).toBe(false)
    expect(isValidYearsInRole('2.5')).toBe(false)
    expect(isValidYearsInRole('five')).toBe(false)
    expect(isValidYearsInRole('')).toBe(false)
  })
})

describe('isValidLinkedinUrl', () => {
  it('should return true for a linkedin.com URL, with or without protocol/subdomain', () => {
    expect(isValidLinkedinUrl('https://www.linkedin.com/in/jane-doe')).toBe(true)
    expect(isValidLinkedinUrl('linkedin.com/in/jane-doe')).toBe(true)
    expect(isValidLinkedinUrl('https://uk.linkedin.com/in/jane-doe')).toBe(true)
  })

  it('should return false for a non-linkedin URL or empty string', () => {
    expect(isValidLinkedinUrl('https://example.com/in/jane-doe')).toBe(false)
    expect(isValidLinkedinUrl('https://linkedin.com')).toBe(false)
    expect(isValidLinkedinUrl('')).toBe(false)
  })
})

describe('parseCsv', () => {
  it('should throw error for empty content', () => {
    expect(() => parseCsv('')).toThrow('CSV content cannot be empty')
    expect(() => parseCsv('   ')).toThrow('CSV content cannot be empty')
  })

  it('should throw error for CSV with only headers', () => {
    const csv = 'firstName,lastName,email'
    expect(() => parseCsv(csv)).toThrow('CSV file appears to be empty or contains no valid data')
  })

  it('should throw error for malformed CSV content', () => {
    const malformedCsv = `firstName,lastName,email
"John,Doe,john@example.com,extra"field`
    expect(() => parseCsv(malformedCsv)).toThrow('CSV parsing failed')
  })

  it('should throw error for CSV with mismatched field count', () => {
    const mismatchedCsv = `firstName,lastName,email
John,Doe,john@example.com,ExtraField,AnotherExtra
Jane,Smith`
    expect(() => parseCsv(mismatchedCsv)).toThrow('CSV parsing failed')
  })

  it('should throw error for CSV with critical delimiter issues', () => {
    const noDelimiterCsv = `firstName lastName email
John Doe john@example.com`
    expect(() => parseCsv(noDelimiterCsv)).toThrow()
  })

  it('should parse valid CSV with all required fields', () => {
    const csv = `firstName,lastName,email,jobTitle,countryCode,companyName
John,Doe,john.doe@example.com,Developer,US,Tech Corp`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      jobTitle: 'Developer',
      countryCode: 'US',
      companyName: 'Tech Corp',
      isValid: true,
      errors: [],
      warnings: [],
      rowIndex: 2,
    })
  })

  it('should handle missing required fields and mark as invalid', () => {
    const csv = `firstName,lastName,email
,Smith,john@example.com
John,,john@example.com
John,Smith,`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)

    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('First name is required')

    expect(result[1].isValid).toBe(false)
    expect(result[1].errors).toContain('Last name is required')

    expect(result[2].isValid).toBe(false)
    expect(result[2].errors).toContain('Email is required')
  })

  it('should validate email format', () => {
    const csv = `firstName,lastName,email
John,Doe,invalid-email
Jane,Smith,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(2)
    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toContain('Invalid email format')
    expect(result[1].isValid).toBe(true)
  })

  it('should handle CSV with quoted values', () => {
    const csv = `firstName,lastName,email,jobTitle
"John","Doe","john.doe@example.com","Software Engineer"`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john.doe@example.com')
    expect(result[0].jobTitle).toBe('Software Engineer')
  })

  it('should skip empty rows', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
,,
Jane,Smith,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(2)
    expect(result[0].firstName).toBe('John')
    expect(result[1].firstName).toBe('Jane')
  })

  it('should handle case-insensitive headers', () => {
    const csv = `FIRSTNAME,LASTNAME,EMAIL,JOBTITLE,COUNTRYCODE,COMPANYNAME
John,Doe,john@example.com,Developer,US,Tech Corp`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].jobTitle).toBe('Developer')
  })

  it('should handle missing optional fields', () => {
    const csv = `firstName,lastName,email,jobTitle,countryCode
John,Doe,john@example.com,,`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].jobTitle).toBeUndefined()
    expect(result[0].countryCode).toBeUndefined()
    expect(result[0].isValid).toBe(true)
  })

  it('should treat a blank companyName as absent', () => {
    const csv = `firstName,lastName,email,companyName
John,Doe,john@example.com,`

    const result = parseCsv(csv)

    expect(result[0].companyName).toBeUndefined()
  })

  it('should preserve row index correctly', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
Jane,Smith,jane@example.com
Bob,Johnson,bob@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)
    expect(result[0].rowIndex).toBe(2)
    expect(result[1].rowIndex).toBe(3)
    expect(result[2].rowIndex).toBe(4)
  })

  it('should handle multiple validation errors per lead', () => {
    const csv = `firstName,lastName,email
 , ,invalid-email`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].isValid).toBe(false)
    expect(result[0].errors).toHaveLength(3)
    expect(result[0].errors).toContain('First name is required')
    expect(result[0].errors).toContain('Last name is required')
    expect(result[0].errors).toContain('Invalid email format')
  })

  it('should handle extra columns not in header mapping', () => {
    const csv = `firstName,lastName,email,unknownColumn
John,Doe,john@example.com,someValue`

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].isValid).toBe(true)
  })

  it('should handle mixed valid and invalid leads', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com
,Smith,invalid-email
Jane,Johnson,jane@example.com`

    const result = parseCsv(csv)

    expect(result).toHaveLength(3)
    expect(result[0].isValid).toBe(true)
    expect(result[1].isValid).toBe(false)
    expect(result[1].errors).toContain('First name is required')
    expect(result[1].errors).toContain('Invalid email format')
    expect(result[2].isValid).toBe(true)
  })

  it('should clear an invalid countryCode, keep the lead valid, and report a warning', () => {
    const csv = `firstName,lastName,email,countryCode
John,Doe,john@example.com,XXX
Jane,Smith,jane@example.com,12`

    const result = parseCsv(csv)

    expect(result).toHaveLength(2)
    expect(result[0].isValid).toBe(true)
    expect(result[0].countryCode).toBeUndefined()
    expect(result[0].warnings).toEqual(['Invalid country code "XXX" (expected a 2-letter code) — cleared'])
    expect(result[1].isValid).toBe(true)
    expect(result[1].countryCode).toBeUndefined()
    expect(result[1].warnings).toEqual(['Invalid country code "12" (expected a 2-letter code) — cleared'])
  })

  it('should normalize a valid countryCode to uppercase and report no warning', () => {
    const csv = `firstName,lastName,email,countryCode
John,Doe,john@example.com,us`

    const result = parseCsv(csv)

    expect(result[0].countryCode).toBe('US')
    expect(result[0].warnings).toEqual([])
  })

  it('should not warn when countryCode is absent', () => {
    const csv = `firstName,lastName,email,countryCode
John,Doe,john@example.com,`

    const result = parseCsv(csv)

    expect(result[0].countryCode).toBeUndefined()
    expect(result[0].warnings).toEqual([])
  })

  it('should parse valid phoneNumber, yearsInRole, and linkedinUrl with no warnings', () => {
    const csv = `firstName,lastName,email,phoneNumber,yearsInRole,linkedinUrl
John,Doe,john@example.com,+1-555-0100,5,https://www.linkedin.com/in/john-doe`

    const result = parseCsv(csv)

    expect(result[0].phoneNumber).toBe('+1-555-0100')
    expect(result[0].yearsInRole).toBe('5')
    expect(result[0].linkedinUrl).toBe('https://www.linkedin.com/in/john-doe')
    expect(result[0].warnings).toEqual([])
  })

  it('should accept a "LinkedIn" header as an alias for linkedinUrl', () => {
    const csv = `firstName,lastName,email,LinkedIn
John,Doe,john@example.com,https://www.linkedin.com/in/john-doe`

    const result = parseCsv(csv)

    expect(result[0].linkedinUrl).toBe('https://www.linkedin.com/in/john-doe')
  })

  it('should clear an invalid yearsInRole, keep the lead valid, and report a warning', () => {
    const csv = `firstName,lastName,email,yearsInRole
John,Doe,john@example.com,five`

    const result = parseCsv(csv)

    expect(result[0].isValid).toBe(true)
    expect(result[0].yearsInRole).toBeUndefined()
    expect(result[0].warnings).toEqual([
      'Invalid years in role "five" (expected a non-negative whole number) — cleared',
    ])
  })

  it('should clear an invalid linkedinUrl, keep the lead valid, and report a warning', () => {
    const csv = `firstName,lastName,email,linkedinUrl
John,Doe,john@example.com,not-a-url`

    const result = parseCsv(csv)

    expect(result[0].isValid).toBe(true)
    expect(result[0].linkedinUrl).toBeUndefined()
    expect(result[0].warnings).toEqual(['Invalid LinkedIn URL "not-a-url" — cleared'])
  })

  it('should treat blank phoneNumber, yearsInRole, and linkedinUrl values as absent', () => {
    const csv = `firstName,lastName,email,phoneNumber,yearsInRole,linkedinUrl
John,Doe,john@example.com,,,`

    const result = parseCsv(csv)

    expect(result[0].phoneNumber).toBeUndefined()
    expect(result[0].yearsInRole).toBeUndefined()
    expect(result[0].linkedinUrl).toBeUndefined()
    expect(result[0].warnings).toEqual([])
  })

  it('should not warn when yearsInRole and linkedinUrl are absent', () => {
    const csv = `firstName,lastName,email
John,Doe,john@example.com`

    const result = parseCsv(csv)

    expect(result[0].warnings).toEqual([])
  })

  it('should handle whitespace in fields', () => {
    const csv = `firstName,lastName,email
 John , Doe , john@example.com `

    const result = parseCsv(csv)

    expect(result).toHaveLength(1)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
    expect(result[0].isValid).toBe(true)
  })
})
