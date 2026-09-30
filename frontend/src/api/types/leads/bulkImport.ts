export interface LeadsBulkImportInput {
  leads: {
    firstName: string
    lastName: string
    email: string
    jobTitle?: string
    countryCode?: string
    companyName?: string
  }[]
}

export interface LeadsBulkImportOutput {
  success: boolean
  importedCount: number
  duplicatesSkipped: number
  invalidLeads: number
  errors: Array<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lead payload shape varies per row
    lead: any
    error: string
  }>
  warnings: Array<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lead payload shape varies per row
    lead: any
    warning: string
  }>
}
