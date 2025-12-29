import { Report, ReportSummary } from '../types'

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

async function request<T>(path: string): Promise<T> {
  const headers: Record<string,string> = { 'Accept': 'application/json' }
  const res = await fetch(`${BASE}${path}`, { headers })
  if (!res.ok) throw new Error(`API Error: ${res.status}`)
  return res.json()
}

export async function searchReports(imo: string): Promise<{ total:number; results: ReportSummary[] }> {
  const q = new URLSearchParams({ imo })
  return request(`/reports?${q.toString()}`)
}

export async function getReport(reportId: string): Promise<Report> {
  return request(`/reports/${reportId}`)
}

export async function saveReport(reportId: string, payload: any): Promise<{ success: boolean; filename?: string }> {
  const res = await fetch(`${BASE}/reports/${encodeURIComponent(reportId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`API Error: ${res.status}`)
  return res.json()
}

// Fetch vessel details from proxied server endpoint and map to our internal Report shape
export async function fetchVesselByImo(imo: string): Promise<Report> {
  // The user requested the browser perform a GET to the external VMS endpoint.
  // Try direct fetch first (this will fail with CORS/network in many environments),
  // and fall back to the server-side proxy `/vessel/:imo` if needed.
  interface VesselPayload {
    imo: string
    vessel_name: string
    inspector_name?: string
    date: string
    category?: string
    inspections?: Array<{
      subsection: string
      details?: string
      action?: string
      rating?: string | number
      due_after_weeks?: string | number
      images?: string[]
      updated_at?: string
    }>
  }

  async function mapToReport(data: VesselPayload): Promise<Report> {
    const reportId = `vms-${data.imo}-${data.date}`

    // Support two external shapes:
    // 1) old: { category: 'HULL', inspections: [...] }
    // 2) new: { categories: [{ category: 'HULL', inspections: [...] }, ...] }
    const categories = (data as any).categories && Array.isArray((data as any).categories)
      ? (data as any).categories.map((cat: any, cidx: number) => ({
          categoryId: `cat-${cat.category}-${cidx}`,
          name: cat.category,
          subsections: (cat.inspections || []).map((ins: any, idx: number) => ({
            subsectionId: `${reportId}-cat-${cidx}-sub-${idx}`,
            name: ins.subsection,
            details: ins.details || `${ins.action ? ins.action + '\n' : ''}`,
            action: ins.action,
            due_after_weeks: ins.due_after_weeks,
            updated_at: ins.updated_at,
            rating: (() => {
              const r = typeof ins.rating === 'string' ? Number(ins.rating) : ins.rating
              return (typeof r === 'number' && !Number.isNaN(r)) ? r : undefined
            })(),
            images: (ins.images || []).map((u: string) => ({ url: u }))
          }))
        }))
      : (data.category ? [{
          categoryId: `cat-${data.category}`,
          name: data.category,
          subsections: (data.inspections || []).map((ins: any, idx: number) => ({
            subsectionId: `${reportId}-sub-${idx}`,
            name: ins.subsection,
            details: ins.details || `${ins.action ? ins.action + '\n' : ''}`,
            action: ins.action,
            due_after_weeks: ins.due_after_weeks,
            updated_at: ins.updated_at,
            rating: (() => {
              const r = typeof ins.rating === 'string' ? Number(ins.rating) : ins.rating
              return (typeof r === 'number' && !Number.isNaN(r)) ? r : undefined
            })(),
            images: (ins.images || []).map((u: string) => ({ url: u }))
          }))
        }] : [])

    const report: Report = {
      reportId,
      imo: data.imo,
      vesselName: data.vessel_name,
      inspector: data.inspector_name,
      inspectionDate: data.date,
      categories,
    }

    return report
  }

  // Use the local proxy only (previous working behavior). This avoids CORS and ensures consistent responses.
  const proxyUrl = `/vessel/${encodeURIComponent(imo)}`

  // 1) Try proxy first (Vite proxy or local server)
  try {
    console.debug('fetch proxy URL', proxyUrl)
    const pres = await fetch(proxyUrl, { headers: { Accept: 'application/json' } })
    console.debug('proxy response status', pres.status)
    if (pres.ok) {
      try {
        const payload = await pres.json()
        if (payload && payload.status === 'NOT_FOUND') throw new Error(`NO_DATA:${payload.message || 'No inspection found'}`)
        console.debug('Proxy payload', payload)
        return mapToReport(payload)
      } catch (parseErr: any) {
        console.warn('Proxy returned non-JSON payload', parseErr)
        // fallthrough to try direct fetch
        throw parseErr
      }
    } else {
      let bodyText = ''
      try { bodyText = JSON.stringify(await pres.json()) } catch (_) { bodyText = await pres.text().catch(() => '') }
      console.warn('Proxy returned non-OK status', pres.status, bodyText)
      // fallthrough to try direct fetch
      throw new Error(`PROXY_ERROR:${pres.status}:${bodyText}`)
    }
  } catch (proxyErr: any) {
    console.warn('Proxy attempt failed, trying direct external fetch:', proxyErr?.message || proxyErr)

    // 2) Attempt direct fetch to external URL as a fallback
    const externalUrl = `https://vms-data-processing-jgjm9r.5sc6y6-4.usa-e2.cloudhub.io/api/vessel/${encodeURIComponent(imo)}`
    try {
      const res = await fetch(externalUrl, { headers: { Accept: 'application/json' } })
      if (!res.ok) {
        let maybe = ''
        try { maybe = JSON.stringify(await res.json()) } catch (_) { maybe = await res.text().catch(() => '') }
        throw new Error(`EXTERNAL_ERROR:${res.status}:${maybe}`)
      }
      const data = await res.json()
      if (data && data.status === 'NOT_FOUND') throw new Error(`NO_DATA:${data.message || 'No inspection found'}`)
      return mapToReport(data)
    } catch (extErr: any) {
      // both attempts failed — surface combined message
      const pmsg = proxyErr?.message || String(proxyErr)
      const emsg = extErr?.message || String(extErr)
      throw new Error(`Failed to retrieve vessel data. Proxy error: ${pmsg}. External error: ${emsg}`)
    }
  }
}
