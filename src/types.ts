export interface ReportSummary {
  reportId: string
  imo: string
  vesselName: string
  flag?: string
  inspectionDate?: string
  overallRating?: number
  summary?: string
  thumbnailUrl?: string
}

export interface ImageRef {
  url: string
  caption?: string
}

export interface Subsection {
  subsectionId: string
  name: string
  rating?: number
  details?: string
  images?: ImageRef[]
  // fields mapped from VMS payload
  action?: string
  due_after_weeks?: string | number
  updated_at?: string
}

export interface Category {
  categoryId: string
  name: string
  rating?: number
  subsections?: Subsection[]
}

export interface Report {
  reportId: string
  imo: string
  vesselName?: string
  flag?: string
  owner?: string
  inspectionDate?: string
  inspector?: string
  overallRating?: number
  categories?: Category[]
  documents?: { name: string; url: string }[]
  notes?: string
}
