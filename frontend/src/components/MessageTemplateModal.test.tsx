import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { renderWithQueryClient } from '../test/renderWithQueryClient'
import { MessageTemplateModal } from './MessageTemplateModal'
import { api } from '../api'

vi.mock('../api', () => ({
  api: {
    leads: {
      generateMessages: vi.fn(),
    },
  },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

function renderModal(props: Partial<React.ComponentProps<typeof MessageTemplateModal>> = {}) {
  const onClose = vi.fn()
  renderWithQueryClient(
    <MessageTemplateModal
      isOpen={true}
      onClose={onClose}
      selectedLeadIds={[1, 2]}
      selectedLeadsCount={2}
      {...props}
    />
  )
  return { onClose }
}

describe('MessageTemplateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when closed', () => {
    renderWithQueryClient(
      <MessageTemplateModal isOpen={false} onClose={vi.fn()} selectedLeadIds={[]} selectedLeadsCount={0} />
    )
    expect(screen.queryByText(/Generate Messages for/)).not.toBeInTheDocument()
  })

  it('shows the selected leads count and disables submit until a template is entered', () => {
    renderModal()

    expect(screen.getByText('Generate Messages for 2 Leads')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate Messages' })).toBeDisabled()
  })

  it('uses singular wording for a single selected lead', () => {
    renderModal({ selectedLeadIds: [1], selectedLeadsCount: 1 })
    expect(screen.getByText('Generate Messages for 1 Lead')).toBeInTheDocument()
  })

  it('inserts a field placeholder into the template', () => {
    renderModal()

    fireEvent.click(screen.getByText('{firstName}'))

    const textarea = screen.getByLabelText('Message Template') as HTMLTextAreaElement
    expect(textarea.value).toBe('{firstName}')
    expect(screen.getByRole('button', { name: 'Generate Messages' })).toBeEnabled()
  })

  it('groups insertable fields by category, including the new phone/years/linkedin fields', () => {
    renderModal()

    expect(screen.getByText('Basic Info')).toBeInTheDocument()
    expect(screen.getByText('Professional')).toBeInTheDocument()
    expect(screen.getByText('Contact')).toBeInTheDocument()

    fireEvent.click(screen.getByText('{phoneNumber}'))
    fireEvent.click(screen.getByText('{yearsInRole}'))
    fireEvent.click(screen.getByText('{linkedinUrl}'))

    const textarea = screen.getByLabelText('Message Template') as HTMLTextAreaElement
    expect(textarea.value).toBe('{phoneNumber}{yearsInRole}{linkedinUrl}')
  })

  it('submits the trimmed template with the selected lead ids', async () => {
    vi.mocked(api.leads.generateMessages).mockResolvedValue({
      success: true,
      generatedCount: 2,
      errors: [],
    })
    const { onClose } = renderModal()

    const textarea = screen.getByLabelText('Message Template')
    fireEvent.change(textarea, { target: { value: '  Hi {firstName}  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate Messages' }))

    await waitFor(() => {
      expect(api.leads.generateMessages).toHaveBeenCalledWith({
        leadIds: [1, 2],
        template: 'Hi {firstName}',
      })
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Successfully generated messages for 2 leads')
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('shows generated count and errors on partial success without closing', async () => {
    vi.mocked(api.leads.generateMessages).mockResolvedValue({
      success: true,
      generatedCount: 1,
      errors: [{ leadId: 2, leadName: 'Jane Roe', error: 'Missing required field: companyName' }],
    })
    const { onClose } = renderModal()

    fireEvent.change(screen.getByLabelText('Message Template'), {
      target: { value: 'Hi {firstName} from {companyName}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate Messages' }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Generated message for 1 lead, but 1 lead had errors. Check details below.'
      )
    })
    expect(await screen.findByText(/Failed to generate messages for 1 lead/)).toBeInTheDocument()
    expect(screen.getByText('Jane Roe')).toBeInTheDocument()
    expect(screen.getByText(/Missing required field: companyName/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
  })

  it('uses plural wording for partial success with several leads', async () => {
    vi.mocked(api.leads.generateMessages).mockResolvedValue({
      success: true,
      generatedCount: 2,
      errors: [
        { leadId: 3, leadName: 'Bob Fox', error: 'Missing required field: companyName' },
        { leadId: 4, leadName: 'Amy Lane', error: 'Missing required field: companyName' },
      ],
    })
    renderModal()

    fireEvent.change(screen.getByLabelText('Message Template'), {
      target: { value: 'Hi {firstName} from {companyName}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate Messages' }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Generated messages for 2 leads, but 2 leads had errors. Check details below.'
      )
    })
  })

  it('shows an error toast when the request fails', async () => {
    vi.mocked(api.leads.generateMessages).mockRejectedValue(new Error('network error'))
    renderModal()

    fireEvent.change(screen.getByLabelText('Message Template'), { target: { value: 'Hi {firstName}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate Messages' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to generate messages. Please try again.')
    })
  })

  it('disables close actions while the mutation is pending', async () => {
    let resolveMutation: (value: Awaited<ReturnType<typeof api.leads.generateMessages>>) => void = () => {}
    vi.mocked(api.leads.generateMessages).mockImplementation(
      () => new Promise((resolve) => (resolveMutation = resolve))
    )
    const { onClose } = renderModal()

    fireEvent.change(screen.getByLabelText('Message Template'), { target: { value: 'Hi {firstName}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate Messages' }))

    expect(await screen.findByText('Generating...')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).not.toHaveBeenCalled()

    resolveMutation({ success: true, generatedCount: 1, errors: [] })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('closes when pressing Escape', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when clicking the backdrop', () => {
    const { onClose } = renderModal()
    const backdrop = screen.getByText(/Generate Messages for/).closest('.fixed') as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when clicking Cancel', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
