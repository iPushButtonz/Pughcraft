import { useEffect, useState } from 'react'

const query = '(prefers-color-scheme: dark)'

/** The theme actually showing. The main process maps the Theme setting onto this media query. */
export function useResolvedTheme(): 'light' | 'dark' {
  const [dark, setDark] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = (): void => setDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return dark ? 'dark' : 'light'
}
