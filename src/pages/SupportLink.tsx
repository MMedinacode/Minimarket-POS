import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/primitives'
import { redeemSupportToken, SUPPORT_ERROR, type SupportResult } from '../lib/support'

// Cada link se revisa una sola vez (React en modo desarrollo monta dos veces los componentes)
const checks = new Map<string, Promise<SupportResult>>()
function checkOnce(token: string): Promise<SupportResult> {
  let p = checks.get(token)
  if (!p) {
    p = redeemSupportToken(token)
    checks.set(token, p)
  }
  return p
}

/** Se abrió la caja con el link que mandó el soporte: se revisa y, si sirve, se pasa a crear la clave nueva */
export default function SupportLink({ token, onUnlocked, onClose }: { token: string; onUnlocked: () => void; onClose: () => void }) {
  const [result, setResult] = useState<SupportResult | null>(null)

  useEffect(() => {
    let alive = true
    void checkOnce(token).then((r) => {
      if (!alive) return
      if (r === 'ok') onUnlocked()
      else setResult(r)
    })
    return () => {
      alive = false
    }
  }, [token, onUnlocked])

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm animate-pop-in rounded-3xl border border-line bg-surface p-7 text-center shadow-xl">
        {!result || result === 'ok' ? (
          <>
            <Loader2 className="mx-auto size-10 animate-spin text-brand" />
            <p className="mt-4 text-lg font-semibold">Revisando el link…</p>
          </>
        ) : (
          <>
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-warn-soft text-warn-ink">
              <AlertTriangle className="size-7" />
            </span>
            <h1 className="mt-4 text-xl font-bold">Este link no sirvió</h1>
            <p className="mt-2 text-muted">{SUPPORT_ERROR[result]}</p>
            <Button variant="primary" size="lg" className="mt-6 w-full" onClick={onClose}>
              Volver a la caja
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
