type Props = { eyebrow: string; title: string; intro?: string; light?: boolean; align?: 'left' | 'center'; titleId?: string }

export function SectionHeading({ eyebrow, title, intro, light = false, align = 'left', titleId }: Props) {
  return <div className={`section-heading ${light ? 'heading-light' : ''} ${align === 'center' ? 'heading-center' : ''}`}>
    <span className="eyebrow"><span />{eyebrow}</span>
    <h2 id={titleId}>{title}</h2>
    {intro && <p>{intro}</p>}
  </div>
}
