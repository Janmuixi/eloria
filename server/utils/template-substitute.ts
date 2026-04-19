export type TemplateData = {
  coupleName1: string
  coupleName2: string
  date: string
  venue: string
  venueAddress: string
  wording: string
}

export function substituteTemplate(html: string, data: TemplateData): string {
  return html
    .replace(/\{\{coupleName1\}\}/g, data.coupleName1)
    .replace(/\{\{coupleName2\}\}/g, data.coupleName2)
    .replace(/\{\{date\}\}/g, data.date)
    .replace(/\{\{venue\}\}/g, data.venue)
    .replace(/\{\{venueAddress\}\}/g, data.venueAddress)
    .replace(/\{\{wording\}\}/g, data.wording)
}
