import { formatINR } from '../lib/enrolmentApi'

export type ProgramPriceVariant = 'replica' | 'home-card' | 'course' | 'enrol-option' | 'enrol-aside' | 'enrol-review' | 'receipt'

type ProgramPriceBreakdownProps = {
  originalPaise?: number | null
  discountPercent?: number | null
  finalPaise: number
  finalLabel?: string
  variant?: ProgramPriceVariant
}

export function ProgramPriceBreakdown({
  originalPaise,
  discountPercent,
  finalPaise,
  finalLabel = 'Final price',
  variant = 'home-card',
}: ProgramPriceBreakdownProps) {
  const hasDiscount = Number.isSafeInteger(originalPaise)
    && Number(originalPaise) > finalPaise
    && typeof discountPercent === 'number'
    && Number.isFinite(discountPercent)
    && discountPercent > 0
    && discountPercent <= 100

  return (
    <div className={`program-price-breakdown program-price-breakdown--${variant}`}>
      {hasDiscount && (
        <>
          <div className="program-price-original">
            {variant !== 'replica' && <span>Original price</span>}
            <del>{formatINR(originalPaise!)}</del>
          </div>
          <div className="program-price-discount">
            <strong>{discountPercent}% OFF</strong>
            {variant !== 'replica' && <span>discount</span>}
          </div>
        </>
      )}
      <div className="program-price-final">
        {variant !== 'replica' && <span>{finalLabel}</span>}
        <strong>{formatINR(finalPaise)}</strong>
      </div>
    </div>
  )
}
