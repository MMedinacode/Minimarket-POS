import { useState } from 'react'
import { BarChart3, ChevronRight, Cloud, FileSpreadsheet, HelpCircle, Lock, MessageCircle, Moon, Settings, Sun, Tag, Type } from 'lucide-react'
import { LabelsModal } from '../components/LabelsModal'
import { Card, Segmented } from '../components/ui/primitives'
import { navigate } from '../hooks/useHashRoute'
import type { TextSize, Theme } from '../hooks/useTheme'
import { whatsappUrl } from '../lib/support'
import { useCloud, useData } from '../store/AppStore'

interface Props {
  theme: Theme
  onTheme: (t: Theme) => void
  textSize: TextSize
  onTextSize: (s: TextSize) => void
  onLock: () => void
}

/** "Más": todo lo que no es del día a día, en una lista corta y clara */
export default function More({ theme, onTheme, textSize, onTextSize, onLock }: Props) {
  const cloud = useCloud()
  const { settings } = useData()
  const [labelsOpen, setLabelsOpen] = useState(false)

  const accountDesc = !cloud.enabled
    ? 'Usar la caja en varios equipos'
    : cloud.user
      ? `Conectada: ${cloud.user.email}`
      : 'Usar la caja en el computador y el celular'

  const items: { icon: typeof Tag; title: string; desc: string; go: () => void }[] = [
    { icon: BarChart3, title: 'Reportes y gráficos', desc: 'Lo que más se vende, horas con más ventas, ganancias', go: () => navigate('reportes') },
    { icon: FileSpreadsheet, title: 'Excel y respaldo', desc: 'Cargar tus productos o descargar todo', go: () => navigate('excel') },
    { icon: Tag, title: 'Imprimir etiquetas', desc: 'Códigos de barra para lo que no trae código', go: () => setLabelsOpen(true) },
    { icon: Cloud, title: 'Cuenta y respaldo en línea', desc: accountDesc, go: () => navigate('cuenta') },
    { icon: Settings, title: 'Ajustes', desc: 'Nombre del negocio, clave y avisos', go: () => navigate('ajustes') },
    { icon: HelpCircle, title: 'Cómo se usa', desc: 'Ayuda paso a paso', go: () => navigate('ayuda') },
  ]
  const helpUrl = whatsappUrl(`Hola, tengo una duda con la caja de ${settings.businessName}.`)
  if (helpUrl) {
    items.push({ icon: MessageCircle, title: 'Pedir ayuda por WhatsApp', desc: 'Escríbenos si algo no te resulta', go: () => window.open(helpUrl, '_blank', 'noopener') })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-extrabold lg:hidden">Más opciones</h1>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {items.map((it) => (
            <li key={it.title}>
              <button type="button" onClick={it.go} className="flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-surface-2 sm:px-5">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink">
                  <it.icon className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{it.title}</span>
                  <span className="block truncate text-subtle">{it.desc}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-subtle" />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="text-lg font-bold">Cómo se ve</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-medium">
            {theme === 'dark' ? <Moon className="size-5" /> : <Sun className="size-5" />} Colores
          </span>
          <Segmented
            value={theme}
            onChange={onTheme}
            ariaLabel="Colores"
            options={[
              { value: 'light', label: 'Claro', icon: <Sun /> },
              { value: 'dark', label: 'Oscuro', icon: <Moon /> },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-medium">
            <Type className="size-5" /> Tamaño de la letra
          </span>
          <Segmented
            value={textSize}
            onChange={onTextSize}
            ariaLabel="Tamaño de la letra"
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'grande', label: 'Grande' },
            ]}
          />
        </div>
      </Card>

      <button
        type="button"
        onClick={onLock}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line-strong bg-surface py-4 text-lg font-semibold hover:bg-surface-2"
      >
        <Lock className="size-5" /> Bloquear pantalla
      </button>
      <p className="text-center text-sm text-subtle">Tapa la caja hasta que escribas tu clave, por si te alejas del mesón. No cierra el día ni borra nada.</p>

      <LabelsModal open={labelsOpen} onClose={() => setLabelsOpen(false)} />
    </div>
  )
}
