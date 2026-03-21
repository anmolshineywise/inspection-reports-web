import React from 'react'

export default function DemoDownloadPage() {
  const downloadHref = `${import.meta.env.BASE_URL}shipsurvey_print6Aug2020.pdf`

  return (
    <section>
      <h2>Inspection Report Download</h2>
      <p>Demo report for IMO 9200671 is ready.</p>
      <a href={downloadHref} download="shipsurvey_print6Aug2020.pdf">
        <button type="button">click here to download report</button>
      </a>
    </section>
  )
}
