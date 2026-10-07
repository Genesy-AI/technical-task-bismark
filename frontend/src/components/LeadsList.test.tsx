import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { renderWithQueryClient } from '../test/renderWithQueryClient'
import { LeadsList } from './LeadsList'
import { api } from '../api'

vi.mock('../api', () => ({
  api: {
    leads: {
      getMany: vi.fn(),
      deleteMany: vi.fn(),
      verifyEmails: vi.fn(),
      enrichPhone: vi.fn(),
    },
  },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('./CsvImportModal', () => ({
  CsvImportModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>csv-import-modal</div> : null),
}))

vi.mock('./MessageTemplateModal', () => ({
  MessageTemplateModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>message-template-modal</div> : null,
}))

const baseLead = {
  id: 1,
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  jobTitle: 'Developer',
  companyName: 'Acme',
  countryCode: 'US',
  message: 'Hello John',
  emailVerified: null as boolean | null,
  phoneNumber: '+1-555-0100',
  yearsInRole: 3,
  linkedinUrl: 'https://www.linkedin.com/in/john-doe',
  phoneEnriched: null as boolean | null,
  createdAt: '2024-01-15T12:00:00.000Z',
  updatedAt: '2024-01-15T12:00:00.000Z',
}

describe('LeadsList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an empty state when there are no leads', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([])

    renderWithQueryClient(<LeadsList />)

    expect(await screen.findByText('No leads found')).toBeInTheDocument()
  })

  it('shows an error state when the query fails', async () => {
    vi.mocked(api.leads.getMany).mockRejectedValue(new Error('Network down'))

    renderWithQueryClient(<LeadsList />)

    expect(await screen.findByText('Error loading leads')).toBeInTheDocument()
    expect(screen.getByText('Network down')).toBeInTheDocument()
  })

  it('renders lead rows with their fields and email verification status', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([
      { ...baseLead, id: 1, emailVerified: null },
      {
        ...baseLead,
        id: 2,
        firstName: 'Jane',
        lastName: 'Roe',
        email: 'jane@example.com',
        emailVerified: true,
      },
      {
        ...baseLead,
        id: 3,
        firstName: 'Bob',
        lastName: 'Fox',
        email: 'bob@example.com',
        emailVerified: false,
      },
    ])

    renderWithQueryClient(<LeadsList />)

    expect(await screen.findByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('Jane Roe')).toBeInTheDocument()
    expect(screen.getByText('Bob Fox')).toBeInTheDocument()
    expect(screen.getAllByText('Developer')).toHaveLength(3)
    expect(screen.getAllByText('Acme')).toHaveLength(3)
    expect(screen.getAllByText('US')).toHaveLength(3)
    expect(screen.getAllByText('Hello John')).toHaveLength(3)
    expect(screen.getAllByText('Jan 15, 2024')).toHaveLength(3)
    expect(screen.getAllByText('+1-555-0100')).toHaveLength(3)
    expect(screen.getAllByText('3')).toHaveLength(3)
    expect(screen.getAllByRole('link', { name: 'View profile' })).toHaveLength(3)
    expect(screen.getAllByRole('link', { name: 'View profile' })[0]).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/john-doe'
    )

    expect(screen.getByText(/❓/)).toBeInTheDocument()
    expect(screen.getByText(/✅/)).toBeInTheDocument()
    expect(screen.getByText(/❌/)).toBeInTheDocument()
  })

  it('renders placeholders for missing optional fields', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([
      {
        ...baseLead,
        jobTitle: null,
        companyName: null,
        countryCode: null,
        message: null,
        phoneNumber: null,
        yearsInRole: null,
        linkedinUrl: null,
      },
    ])

    renderWithQueryClient(<LeadsList />)

    await screen.findByText('John Doe')
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThanOrEqual(7)
  })

  it('renders leads with a missing last name and email', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, lastName: null, email: null }])

    renderWithQueryClient(<LeadsList />)

    expect(await screen.findByText('John')).toBeInTheDocument()
    expect(screen.getByText(/^-/)).toBeInTheDocument()
  })

  it('falls back to a generic message when the error has none', async () => {
    vi.mocked(api.leads.getMany).mockRejectedValue(new Error())

    renderWithQueryClient(<LeadsList />)

    expect(await screen.findByText('An unexpected error occurred')).toBeInTheDocument()
  })

  it('selects all leads and enables bulk actions', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([
      { ...baseLead, id: 1 },
      { ...baseLead, id: 2, firstName: 'Jane', lastName: 'Roe', email: 'jane@example.com' },
    ])

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    const selectAllCheckbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement
    fireEvent.click(selectAllCheckbox)

    expect(screen.getByText('2 selected')).toBeInTheDocument()
    expect(selectAllCheckbox.checked).toBe(true)

    const rowCheckboxes = screen.getAllByRole('checkbox').slice(1) as HTMLInputElement[]
    fireEvent.click(rowCheckboxes[0])
    expect(selectAllCheckbox.indeterminate).toBe(true)
  })

  it('deletes selected leads and shows a success toast', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])
    vi.mocked(api.leads.deleteMany).mockResolvedValue({ deletedCount: 1 })

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    const rowCheckbox = screen.getAllByRole('checkbox')[1]
    fireEvent.click(rowCheckbox)

    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    await waitFor(() => {
      expect(api.leads.deleteMany).toHaveBeenCalledWith({ ids: [1] })
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Successfully deleted 1 lead')
    })
  })

  it('uses plural wording when deleting more than one lead', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([
      { ...baseLead, id: 1 },
      { ...baseLead, id: 2, firstName: 'Jane', lastName: 'Roe', email: 'jane@example.com' },
    ])
    vi.mocked(api.leads.deleteMany).mockResolvedValue({ deletedCount: 2 })

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Successfully deleted 2 leads')
    })
  })

  it('shows an error toast when deleting fails', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])
    vi.mocked(api.leads.deleteMany).mockRejectedValue(new Error('boom'))

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to delete leads. Please try again.')
    })
  })

  it('verifies emails for selected leads via the enrich dropdown', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])
    vi.mocked(api.leads.verifyEmails).mockResolvedValue({
      success: true,
      verifiedCount: 1,
      results: [],
      errors: [],
    })

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: /enrich/i }))
    fireEvent.click(screen.getByText('Verify Email'))

    await waitFor(() => {
      expect(api.leads.verifyEmails).toHaveBeenCalledWith({ leadIds: [1] })
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Verified 1 email')
    })
  })

  it('uses plural wording when verifying more than one email', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([
      { ...baseLead, id: 1 },
      { ...baseLead, id: 2, firstName: 'Jane', lastName: 'Roe', email: 'jane@example.com' },
    ])
    vi.mocked(api.leads.verifyEmails).mockResolvedValue({
      success: true,
      verifiedCount: 2,
      results: [],
      errors: [],
    })

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: /enrich/i }))
    fireEvent.click(screen.getByText('Verify Email'))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Verified 2 emails')
    })
  })

  it('shows an error toast when verifying emails fails', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])
    vi.mocked(api.leads.verifyEmails).mockRejectedValue(new Error('boom'))

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: /enrich/i }))
    fireEvent.click(screen.getByText('Verify Email'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to verify emails. Please try again.')
    })
  })

  it('shows pending feedback (spinner + disabled button) while emails are being verified', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])
    let resolveVerify: (value: {
      success: boolean
      verifiedCount: number
      results: never[]
      errors: never[]
    }) => void = () => {}
    vi.mocked(api.leads.verifyEmails).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVerify = resolve
        })
    )

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: /enrich/i }))
    fireEvent.click(screen.getByText('Verify Email'))

    const pendingButton = await screen.findByRole('button', { name: /verifying/i })
    expect(pendingButton).toBeDisabled()

    resolveVerify({ success: true, verifiedCount: 1, results: [], errors: [] })

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Verified 1 email')
    })
  })

  it('enriches phone numbers for selected leads via the enrich dropdown', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])
    vi.mocked(api.leads.enrichPhone).mockResolvedValue({
      success: true,
      enrichedCount: 1,
      noDataCount: 0,
      skippedCount: 0,
      results: [],
      errors: [],
    })

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: /enrich/i }))
    fireEvent.click(screen.getByText('Enrich Phone'))

    await waitFor(() => {
      expect(api.leads.enrichPhone).toHaveBeenCalledWith({ leadIds: [1] })
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Found 1 phone')
    })
  })

  it('mentions no-data and skipped counts in the enrich-phone success toast', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])
    vi.mocked(api.leads.enrichPhone).mockResolvedValue({
      success: true,
      enrichedCount: 0,
      noDataCount: 1,
      skippedCount: 2,
      results: [],
      errors: [],
    })

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: /enrich/i }))
    fireEvent.click(screen.getByText('Enrich Phone'))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Found 0 phones (1 with no data found) (2 already had a phone, skipped)'
      )
    })
  })

  it('shows an error toast when enriching phone numbers fails', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])
    vi.mocked(api.leads.enrichPhone).mockRejectedValue(new Error('boom'))

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: /enrich/i }))
    fireEvent.click(screen.getByText('Enrich Phone'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to enrich phone numbers. Please try again.')
    })
  })

  it('shows pending feedback (spinner + disabled button) while phone numbers are being enriched', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])
    let resolveEnrich: (value: {
      success: boolean
      enrichedCount: number
      noDataCount: number
      skippedCount: number
      results: never[]
      errors: never[]
    }) => void = () => {}
    vi.mocked(api.leads.enrichPhone).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEnrich = resolve
        })
    )

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: /enrich/i }))
    fireEvent.click(screen.getByText('Enrich Phone'))

    const pendingButton = await screen.findByRole('button', { name: /enriching/i })
    expect(pendingButton).toBeDisabled()

    resolveEnrich({
      success: true,
      enrichedCount: 1,
      noDataCount: 0,
      skippedCount: 0,
      results: [],
      errors: [],
    })

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Found 1 phone')
    })
  })

  it('shows "No data found" for a lead whose enrichment found nothing', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([
      { ...baseLead, id: 1, phoneNumber: null, phoneEnriched: false },
    ])

    renderWithQueryClient(<LeadsList />)

    expect(await screen.findByText('No data found')).toBeInTheDocument()
  })

  it('shows a dash for a lead whose phone was never enriched', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([
      { ...baseLead, id: 1, phoneNumber: null, phoneEnriched: null },
    ])

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    expect(screen.queryByText('No data found')).not.toBeInTheDocument()
  })

  it('shows a not-implemented toast for the gender guessing action', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: /enrich/i }))
    fireEvent.click(screen.getByText('Guess Gender'))

    expect(toast.error).toHaveBeenCalledWith('Gender guessing feature is not yet implemented')
  })

  it('opens the CSV import modal', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([])

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('No leads found')

    fireEvent.click(screen.getByRole('button', { name: /import csv/i }))

    expect(screen.getByText('csv-import-modal')).toBeInTheDocument()
  })

  it('opens the message template modal from the enrich dropdown', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: /enrich/i }))
    fireEvent.click(screen.getByText('Generate Messages'))

    expect(screen.getByText('message-template-modal')).toBeInTheDocument()
  })

  it('disables bulk action buttons when nothing is selected', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    expect(screen.getByRole('button', { name: /enrich/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled()
  })

  it('deselects all leads when unchecking select all', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    const selectAllCheckbox = screen.getAllByRole('checkbox')[0]
    fireEvent.click(selectAllCheckbox)
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    fireEvent.click(selectAllCheckbox)
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
  })

  it('deselects an individual lead by unchecking its row', async () => {
    vi.mocked(api.leads.getMany).mockResolvedValue([{ ...baseLead, id: 1 }])

    renderWithQueryClient(<LeadsList />)
    await screen.findByText('John Doe')

    const rowCheckbox = screen.getAllByRole('checkbox')[1]
    fireEvent.click(rowCheckbox)
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    fireEvent.click(rowCheckbox)
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
  })
})
