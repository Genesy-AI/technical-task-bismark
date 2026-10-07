import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Providers } from './Providers'

describe('Providers', () => {
  it('renders its children', () => {
    render(
      <Providers>
        <div>child content</div>
      </Providers>
    )

    expect(screen.getByText('child content')).toBeInTheDocument()
  })
})
