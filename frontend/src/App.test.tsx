import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithQueryClient } from './test/renderWithQueryClient'
import App from './App'

vi.mock('./api', () => ({
  api: {
    leads: {
      getMany: vi.fn().mockResolvedValue([]),
    },
  },
}))

describe('App', () => {
  it('renders the header and the leads list', async () => {
    renderWithQueryClient(<App />)

    expect(screen.getByText('TinyEnginy')).toBeInTheDocument()
    expect(await screen.findByText('No leads found')).toBeInTheDocument()
  })
})
