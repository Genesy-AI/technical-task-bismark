import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { renderWithQueryClient } from '../test/renderWithQueryClient'
import { CsvImportModal } from './CsvImportModal'
import { api } from '../api'

vi.mock('../api', () => ({
  api: {
    leads: {
      bulkImport: vi.fn(),
    },
  },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const validCsv = 'firstName,lastName,email\nJohn,Doe,john@example.com'

function makeFile(content: string, name = 'leads.csv') {
  return new File([content], name, { type: 'text/csv' })
}

async function selectFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await waitFor(() => fireEvent.change(input, { target: { files: [file] } }))
}

describe('CsvImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when closed', () => {
    renderWithQueryClient(<CsvImportModal isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByText('Import Leads from CSV')).not.toBeInTheDocument()
  })

  it('rejects non-csv files', async () => {
    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={vi.fn()} />)

    await selectFile(new File(['not a csv'], 'leads.txt', { type: 'text/plain' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Please select a CSV file')
    })
  })

  it('parses a valid CSV and shows the import summary', async () => {
    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={vi.fn()} />)

    await selectFile(makeFile(validCsv))

    expect(await screen.findByText('Import Summary')).toBeInTheDocument()
    expect(screen.getByText('Import 1 Valid Leads')).toBeInTheDocument()
  })

  it('shows a toast error when the CSV cannot be parsed', async () => {
    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={vi.fn()} />)

    await selectFile(makeFile(''))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('CSV content cannot be empty')
    })
  })

  it('imports valid leads and shows a success toast', async () => {
    const onClose = vi.fn()
    vi.mocked(api.leads.bulkImport).mockResolvedValue({
      success: true,
      importedCount: 1,
      duplicatesSkipped: 0,
      invalidLeads: 0,
      errors: [],
    })

    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={onClose} />)
    await selectFile(makeFile(validCsv))
    await screen.findByText('Import Summary')

    fireEvent.click(screen.getByText('Import 1 Valid Leads'))

    await waitFor(() => {
      expect(api.leads.bulkImport).toHaveBeenCalledWith({
        leads: [
          {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            jobTitle: undefined,
            countryCode: undefined,
            companyName: undefined,
          },
        ],
      })
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Successfully imported 1 leads!')
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('includes duplicate and invalid counts in the success message', async () => {
    vi.mocked(api.leads.bulkImport).mockResolvedValue({
      success: true,
      importedCount: 1,
      duplicatesSkipped: 2,
      invalidLeads: 3,
      errors: [],
    })

    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={vi.fn()} />)
    await selectFile(makeFile(validCsv))
    await screen.findByText('Import Summary')
    fireEvent.click(screen.getByText('Import 1 Valid Leads'))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Successfully imported 1 leads! (2 duplicates skipped) (3 invalid leads excluded)'
      )
    })
  })

  it('shows an error toast when the import request fails', async () => {
    vi.mocked(api.leads.bulkImport).mockRejectedValue(new Error('network error'))

    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={vi.fn()} />)
    await selectFile(makeFile(validCsv))
    await screen.findByText('Import Summary')
    fireEvent.click(screen.getByText('Import 1 Valid Leads'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error importing leads. Please try again.')
    })
  })

  it('disables the import button when there are no valid leads', async () => {
    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={vi.fn()} />)

    await selectFile(makeFile('firstName,lastName,email\nJohn,,'))
    await screen.findByText('Import Summary')

    expect(screen.getByText('Import 0 Valid Leads')).toBeDisabled()
    expect(api.leads.bulkImport).not.toHaveBeenCalled()
  })

  it('clears parsed data when clicking Clear Data', async () => {
    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={vi.fn()} />)

    await selectFile(makeFile(validCsv))
    await screen.findByText('Import Summary')

    fireEvent.click(screen.getByText('Clear Data'))

    expect(screen.queryByText('Import Summary')).not.toBeInTheDocument()
  })

  it('closes when clicking Cancel', async () => {
    const onClose = vi.fn()
    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={onClose} />)

    await selectFile(makeFile(validCsv))
    await screen.findByText('Import Summary')

    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows a toast when the file cannot be read', async () => {
    class FailingFileReader {
      onerror: (() => void) | null = null
      onload: (() => void) | null = null
      readAsText() {
        this.onerror?.()
      }
    }
    const OriginalFileReader = global.FileReader
    // @ts-expect-error minimal stub covering only what the component uses
    global.FileReader = FailingFileReader

    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={vi.fn()} />)
    await selectFile(makeFile(validCsv))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error reading file')
    })

    global.FileReader = OriginalFileReader
  })

  it('closes when pressing Escape', async () => {
    const onClose = vi.fn()
    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when clicking the backdrop', async () => {
    const onClose = vi.fn()
    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={onClose} />)

    const backdrop = screen.getByText('Import Leads from CSV').closest('.fixed') as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('toggles the dragging state on drag events', () => {
    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={vi.fn()} />)

    const dropzone = screen.getByText(/Drop your CSV file here/).closest('div')!.parentElement as HTMLElement
    fireEvent.dragOver(dropzone)
    fireEvent.dragLeave(dropzone)
  })

  it('parses a CSV file dropped onto the dropzone', async () => {
    renderWithQueryClient(<CsvImportModal isOpen={true} onClose={vi.fn()} />)

    const dropzone = screen.getByText(/Drop your CSV file here/).closest('div')!.parentElement as HTMLElement
    fireEvent.drop(dropzone, { dataTransfer: { files: [makeFile(validCsv)] } })

    expect(await screen.findByText('Import Summary')).toBeInTheDocument()
  })
})
