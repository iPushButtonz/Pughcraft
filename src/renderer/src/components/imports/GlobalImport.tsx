import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { create } from 'zustand'
import { ImportDialog } from '@/components/imports/ImportDialog'
import { api } from '@/lib/api'
import { t } from '@/strings'

interface ImportUi {
  open: boolean
  path: string | null
  show(path?: string | null): void
  setOpen(open: boolean): void
}

/** One Import dialog for the whole app: the Import button and dropping files both open it. */
export const useImportUi = create<ImportUi>((set) => ({
  open: false,
  path: null,
  show: (path = null) => set({ open: true, path }),
  setOpen: (open) => set(open ? { open } : { open, path: null })
}))

// Development builds only: lets test scripts open the import screen with a path,
// since real file drops can't be simulated.
if (import.meta.env.DEV) {
  ;(window as unknown as { __pughcraftImport?: (p: string) => void }).__pughcraftImport = (p) =>
    useImportUi.getState().show(p)
}

/** Dropping a file or folder anywhere on the window starts an import. */
export function GlobalImport() {
  const { open, path, setOpen, show } = useImportUi()
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const enter = (e: DragEvent): void => {
      if (!hasFiles(e) || useImportUi.getState().open) return
      depth++
      setDragging(true)
    }
    const leave = (): void => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (e: DragEvent): void => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent): void => {
      depth = 0
      setDragging(false)
      if (!hasFiles(e) || useImportUi.getState().open) return
      e.preventDefault()
      const file = e.dataTransfer?.files[0]
      if (file) show(api.imports.pathForFile(file))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [show])

  return (
    <>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-card px-12 py-10">
            <Upload className="size-10 text-primary" />
            <p className="text-lg font-semibold">{t.imports.dropOverlay}</p>
          </div>
        </div>
      )}
      <ImportDialog open={open} onOpenChange={setOpen} initialPath={path} />
    </>
  )
}
