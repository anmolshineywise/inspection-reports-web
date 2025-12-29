import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReportPage from '../pages/ReportPage'
import * as client from '../api/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.spyOn(client, 'getReport').mockImplementation(async (id: string) => {
  return {
    reportId: 'rep_2025_001',
    imo: '1234567',
    vesselName: 'MV Example',
    inspector: 'Inspector Name',
    inspectionDate: '2025-11-05',
    overallRating: 3.5,
    categories: [
      {
        categoryId: 'cat_01', name: 'Safety', rating: 3, subsections: [
          { subsectionId: 'sub_01_01', name: 'Fire Safety', rating: 2, details: 'Some details', images: [{ url: 'https://via.placeholder.com/400', caption: 'img' }] }
        ]
      }
    ]
  }
})

describe('ReportPage', () => {
  it('renders report and allows expand', async () => {
    render(
      <MemoryRouter initialEntries={["/reports/rep_2025_001"]}>
        <Routes>
          <Route path="/reports/:reportId" element={<ReportPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText(/MV Example/)).toBeInTheDocument())
    expect(screen.getByText('Safety')).toBeInTheDocument()
    // toggle button should show 'Expand' initially
    const toggle = screen.getByRole('button', { name: /Expand/i })
    fireEvent.click(toggle)
    await waitFor(() => expect(screen.getByText('Some details')).toBeInTheDocument())
    // after expanding, button should show 'Collapse'
    expect(screen.getByRole('button', { name: /Collapse/i })).toBeInTheDocument()
    // clicking collapse toggles back to Expand
    fireEvent.click(screen.getByRole('button', { name: /Collapse/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Expand/i })).toBeInTheDocument())
  })

  it('uses report passed in location.state and does not call getReport', async () => {
    const mockReport = {
      reportId: 'vms-9200671-23_12_2025',
      imo: '9200671',
      vesselName: 'MV Test Ship',
      inspector: 'Inspector',
      inspectionDate: '23_12_2025',
      categories: [{ categoryId: 'cat-1', name: 'HULL', subsections: [{ subsectionId: 's1', name: 'Propeller', details: 'best', rating: 1, images: [{ url: 'https://example.com/a.jpg' }] }] }]
    }

    // ensure we can assert calls (use a fresh spy reference)
    const spy = vi.spyOn(client, 'getReport')
    spy.mockClear()

    // supply mockReport via location.state by rendering the route with state
    render(
      <MemoryRouter initialEntries={[{ pathname: `/reports/${mockReport.reportId}`, state: mockReport } as any]}>
        <Routes>
          <Route path="/reports/:reportId" element={<ReportPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText(/MV Test Ship/)).toBeInTheDocument())
    expect(spy).not.toHaveBeenCalled()
  })

  it('shows Due date and Required Action when provided', async () => {
    const mockReport = {
      reportId: 'vms-due-01',
      imo: '9000001',
      vesselName: 'MV Due Test',
      inspector: 'Inspector',
      inspectionDate: '01_01_2025',
      categories: [{ categoryId: 'cat-d', name: 'DECK', subsections: [{ subsectionId: 'sd1', name: 'Lifeboat', details: 'Check', rating: 2, action: 'Replace bracket', due_after_weeks: 4, images: [] }] }]
    }

    // supply mockReport via location.state by rendering the route with state
    render(
      <MemoryRouter initialEntries={[{ pathname: `/reports/${mockReport.reportId}`, state: mockReport } as any]}>
        <Routes>
          <Route path="/reports/:reportId" element={<ReportPage />} />
        </Routes>
      </MemoryRouter>
    )

      await waitFor(() => expect(screen.getByText(/MV Due Test/)).toBeInTheDocument())
    // when collapsed the summary details should not be visible
    expect(screen.queryByText('Replace bracket')).toBeNull()
    // expand the category and verify details become visible
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }))
    await waitFor(() => expect(screen.getByText('Replace bracket')).toBeInTheDocument())
    const dueNodes = screen.getAllByText((content, element) => content !== '-' && /2025/.test(content))
    expect(dueNodes.length).toBeGreaterThan(0)
  })
})
