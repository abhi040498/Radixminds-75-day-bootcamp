type Props = { eyebrow: string; title: string; intro?: string; light?: boolean; align?: 'left' | 'center' }

export function SectionHeading({ eyebrow, title, intro, light = false, align = 'left' }: Props) {
  return <div className={`section-heading ${light ? 'heading-light' : ''} ${align === 'center' ? 'heading-center' : ''}`}>
    <span className="eyebrow"><span />{eyebrow}</span>
    <h2>{title}</h2>
    {intro && <p>{intro}</p>}
  </div>
}
