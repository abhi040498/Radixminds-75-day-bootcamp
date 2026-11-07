import { useCallback, useEffect, useState } from 'react'
import { api, type PublicProgram } from './enrolmentApi'

type ProgramCatalogState = {
  programs: PublicProgram[]
  loading: boolean
  error: string
}

export function useProgramCatalog(): ProgramCatalogState & { retry: () => void } {
  const [state, setState] = useState<ProgramCatalogState>({ programs: [], loading: true, error: '' })
  const [requestKey, setRequestKey] = useState(0)

  const retry = useCallback(() => {
    setState(current => ({ ...current, loading: true, error: '' }))
    setRequestKey(key => key + 1)
  }, [])

  useEffect(() => {
    let active = true
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const load = async (attempt = 0) => {
      try {
        const result = await api<{ programs: PublicProgram[] }>('/programs')
        if (active) setState({ programs: result.programs, loading: false, error: '' })
      } catch (error) {
        if (!active) return
        if (attempt < 2) {
          retryTimer = setTimeout(() => { void load(attempt + 1) }, 500 * (attempt + 1))
          return
        }
        setState({ programs: [], loading: false, error: error instanceof Error ? error.message : 'Program details are unavailable right now.' })
      }
    }
    void load()
    return () => { active = false; if (retryTimer) clearTimeout(retryTimer) }
  }, [requestKey])

  return { ...state, retry }
}
