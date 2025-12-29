import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SearchPage from '../pages/SearchPage'
import * as client from '../api/client'
import { MemoryRouter } from 'react-router-dom'

describe('SearchPage', () => {
  it('renders input and search button', () => {
    render(<MemoryRouter><SearchPage /></MemoryRouter>)
    expect(screen.getByPlaceholderText('e.g., 1234567')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Search/i })).toBeInTheDocument()
  })

  it('calls external vessel API on submit', async () => {
    const mockReport = {
      reportId: 'vms-9200671-23_12_2025',
      imo: '9200671',
      vesselName: 'MV Test Ship'
    }
    const fetchSpy = vi.spyOn(client, 'fetchVesselByImo').mockResolvedValue(mockReport as any)

    render(<MemoryRouter><SearchPage /></MemoryRouter>)
    const input = screen.getByPlaceholderText('e.g., 1234567')
    fireEvent.change(input, { target: { value: '9200671' } })
    const btn = screen.getByRole('button', { name: /Search/i })
    fireEvent.click(btn)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('9200671'))
  })

  it('shows No data found message when API returns NOT_FOUND', async () => {
    const err = new Error('NO_DATA:No inspection found for given IMO')
    vi.spyOn(client, 'fetchVesselByImo').mockRejectedValue(err)

    render(<MemoryRouter><SearchPage /></MemoryRouter>)
    const input = screen.getByPlaceholderText('e.g., 1234567')
    fireEvent.change(input, { target: { value: '9999999' } })
    const btn = screen.getByRole('button', { name: /Search/i })
    fireEvent.click(btn)

    await waitFor(() => expect(screen.getByText(/No data found/i)).toBeInTheDocument())
  })
})
