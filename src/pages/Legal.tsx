import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import termsText from '../../docs/legal/terms-and-conditions.md?raw'
import privacyText from '../../docs/legal/privacy-policy.md?raw'
import refundText from '../../docs/legal/refund-and-cancellation-policy.md?raw'

type PolicyKind = 'terms' | 'privacy' | 'refund'

const policies: Record<PolicyKind, { title: string; description: string; text: string }> = {
  terms: {
    title: 'Terms and Conditions',
    description: 'Terms for participation in the Radix Minds 75-Day Board Preparation Bootcamp.',
    text: termsText,
  },
  privacy: {
    title: 'Privacy Policy',
    description: 'How Radix Minds may handle student, enquiry and enrolment information.',
    text: privacyText,
  },
  refund: {
    title: 'Refund and Cancellation Policy',
    description: 'The Radix Minds policy for cancellation, withdrawal, failed payments and refund requests.',
    text: refundText,
  },
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return <>{parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : part)}</>
}

function renderMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.replace(/\r/g, '').split('\n')
  if (lines[0]?.trim() === '# RADIX MINDS') lines.shift()
  if (lines[0]?.trim().startsWith('# ')) lines.shift()
  const blocks: ReactNode[] = []
  let index = 0
  let key = 0
  const isTableRow = (line: string) => line.trim().startsWith('|') && line.trim().endsWith('|')
  const isRule = (line: string) => /^\s*---+\s*$/.test(line)
  const isBullet = (line: string) => /^\s*-\s+/.test(line)
  const isNumbered = (line: string) => /^\s*\d+\.\s+/.test(line)

  while (index < lines.length) {
    const line = lines[index].trim()
    if (!line) { index += 1; continue }
    if (isRule(line)) { blocks.push(<hr key={key++} />); index += 1; continue }
    if (line.startsWith('# ')) { blocks.push(<h2 key={key++}><InlineMarkdown text={line.slice(2)} /></h2>); index += 1; continue }
    if (line.startsWith('## ')) { blocks.push(<h2 key={key++}><InlineMarkdown text={line.slice(3)} /></h2>); index += 1; continue }
    if (line.startsWith('### ')) { blocks.push(<h3 key={key++}><InlineMarkdown text={line.slice(4)} /></h3>); index += 1; continue }
    if (isTableRow(line)) {
      const rows: string[][] = []
      while (index < lines.length && isTableRow(lines[index])) {
        const cells = lines[index].trim().slice(1, -1).split('|').map(cell => cell.trim())
        if (!cells.every(cell => /^:?-{3,}:?$/.test(cell))) rows.push(cells)
        index += 1
      }
      const [headers = [], ...body] = rows
      blocks.push(<div className="legal-table-wrap" key={key++}><table><thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}><InlineMarkdown text={cell} /></th>)}</tr></thead><tbody>{body.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><InlineMarkdown text={cell} /></td>)}</tr>)}</tbody></table></div>)
      continue
    }
    if (isBullet(line) || isNumbered(line)) {
      const ordered = isNumbered(line)
      const items: ReactNode[] = []
      while (index < lines.length && (ordered ? isNumbered(lines[index]) : isBullet(lines[index]))) {
        const item = lines[index].trim().replace(ordered ? /^\d+\.\s+/ : /^-\s+/, '')
        items.push(<li key={items.length}><InlineMarkdown text={item} /></li>)
        index += 1
      }
      blocks.push(ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>)
      continue
    }
    const paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !lines[index].trim().startsWith('#') && !isRule(lines[index]) && !isBullet(lines[index]) && !isNumbered(lines[index]) && !isTableRow(lines[index])) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push(<p key={key++}><InlineMarkdown text={paragraph.join(' ')} /></p>)
  }
  return blocks
}

export function LegalPage({ kind }: { kind: PolicyKind }) {
  const policy = policies[kind]

  useEffect(() => {
    document.title = `${policy.title} | Radix Minds 75-Day Board Bootcamp`
    const description = document.head.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (description) description.content = policy.description
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical) }
    canonical.href = `https://bootcamp.radixminds.in${window.location.pathname}`
  }, [policy])

  return <section className="legal-page page-wrap">
    <article className="legal-card legal-document">
      <h1>{policy.title}</h1>
      <div className="legal-document-content">{renderMarkdown(policy.text)}</div>
      <nav className="legal-policy-nav" aria-label="Other legal policies">
        <Link to="/">Radix Minds home</Link>
        <Link to="/terms-and-conditions">Terms and Conditions</Link>
        <Link to="/privacy-policy">Privacy Policy</Link>
        <Link to="/refund-policy">Refund and Cancellation</Link>
      </nav>
      <Link className="button button-outline-light legal-back" to="/enrol">Return to enrolment</Link>
    </article>
  </section>
}
