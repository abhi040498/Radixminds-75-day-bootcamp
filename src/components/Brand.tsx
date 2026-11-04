import { Link } from 'react-router-dom'

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Radix Minds home">
      <img className="brand-image" src="/assets/radix-minds-brand.png" alt="Radix Minds — Learn, Practice, Excel" />
    </Link>
  )
}
