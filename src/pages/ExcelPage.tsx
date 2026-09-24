import { useMemo, useRef, useState, type DragEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  FileSpreadsheet,
  FileUp,
  Info,
  Loader2,
  Search,
  Table2,
  Upload,
  XCircle,
} from 'lucide-react'
import { Modal } from '../components/ui/Modal'
import { Badge, Button, Card, CardHeader, EmptyState, Input } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { allCategories } from '../lib/categories'
import {
  applyImport,
  buildSheets,
  INVENTORY_COLUMNS,
  parseInventoryRows,
  type Cell,
  type ColumnFormat,
  type ImportMode,
  type ParsedImport,
} from '../lib/excel-model'
import { cn, formatCLP, formatInt, formatPct, normalizeText } from '../lib/utils'
import { useActions, useData } from '../store/AppStore'

const COLUMN_HELP: { col: string; desc: string; example: string; required?: boolean }[] = [
  { col: 'CodigoBarras', desc: 'Código EAN del producto. Vacío para productos a granel.', example: '7801234500013' },
  { col: 'Nombre', desc: 'Nombre como lo buscará el cajero.', example: 'Coca-Cola 1.5L', required: true },
  { col: 'Categoria', desc: 'Si se deja vacía, se asigna sola según el nombre.', example: 'Bebidas' },
  { col: 'PrecioCosto', desc: 'Lo que te cuesta a ti (sin puntos o con $1.290).', example: '1290' },
  { col: 'PrecioVenta', desc: 'Precio al público.', example: '1990', required: true },
  { col: 'Stock', desc: 'Unidades (o kilos) disponibles hoy.', example: '24' },
  { col: 'Rotacion', desc: 'Alta, Media o Baja. Define cuándo alertar stock crítico.', example: 'Alta' },
  { col: 'Unidad', desc: 'Opcional: "un" (por unidad) o "kg" (a granel).', example: 'un' },
  { col: 'StockMinimo', desc: 'Opcional: umbral de alerta propio para ese producto.', example: '5' },
]

export default function ExcelPage() {
  const data = useData()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [parsed, setParsed] = useState<{ fileName: string; sheetName: string; result: ParsedImport } | null>(null)

  const readFile = async (file: File) => {
    if (!/\.(xlsx|xlsm|xls|csv|ods)$/i.test(file.name)) {
      toast.error('El archivo debe ser Excel (.xlsx, .xls) o .csv')
      return
    }
    setLoading(true)
    try {
      const { readWorkbookFile } = await import('../lib/excel-io')
      const wb = await readWorkbookFile(file)
      const result = parseInventoryRows(wb.aoa, allCategories(data.products.map((p) => p.category)))
      setParsed({ fileName: file.name, sheetName: wb.sheetName, result })
    } catch (err) {
      console.error(err)
      toast.error('No se pudo leer el archivo. ¿Está dañado o protegido con contraseña?')
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void readFile(f)
  }

  const exportAll = async () => {
    setExporting(true)
    try {
      const { exportWorkbook } = await import('../lib/excel-io')
      const name = exportWorkbook(data)
      toast.success(`Descargado: ${name}`)
    } catch (err) {
      console.error(err)
      toast.error('No se pudo generar el Excel')
    } finally {
      setExporting(false)
    }
  }

  const template = async () => {
    const { downloadTemplate } = await import('../lib/excel-io')
    downloadTemplate()
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        {/* Importar */}
        <Card>
          <CardHeader icon={<FileUp />} title="Importar inventario" subtitle="Sube tu planilla y revisa antes de aplicar" />
          <div className="p-4 sm:p-5">
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-9 text-center transition-colors',
                dragging ? 'border-brand bg-brand-soft' : 'border-line-strong hover:border-brand hover:bg-surface-2/60',
              )}
            >
              {loading ? <Loader2 className="size-9 animate-spin text-brand-ink" /> : <Upload className="size-9 text-subtle" />}
              <p className="mt-3 font-semibold">{loading ? 'Leyendo archivo…' : 'Arrastra tu Excel aquí o toca para elegirlo'}</p>
              <p className="mt-1 text-sm text-subtle">.xlsx, .xls o .csv · se usa la hoja “Inventario” o la primera</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv,.ods"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void readFile(f)
                }}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-1">
              <Button variant="ghost" size="sm" onClick={template}>
                <FileDown /> Plantilla vacía
              </Button>
              <a
                href={`${import.meta.env.BASE_URL}ejemplo-inventario.xlsx`}
                download
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg"
              >
                <FileSpreadsheet className="size-4" /> Excel de ejemplo (68 productos)
              </a>
            </div>
          </div>
        </Card>

        {/* Exportar */}
        <Card className="flex flex-col">
          <CardHeader icon={<FileDown />} title="Exportar a Excel" subtitle="Respaldo completo en un clic" />
          <div className="flex flex-1 flex-col p-4 sm:p-5">
            <ul className="space-y-2 text-sm">
              {[
                ['Inventario', `${formatInt(data.products.length)} productos con márgenes y estado de stock`],
                ['Ventas', `${formatInt(data.sales.length)} ventas, detalle por producto`],
                ['Gastos', `${formatInt(data.expenses.length)} gastos registrados`],
                ['Resumen diario', 'Ventas, costo, gastos y ganancia por día'],
              ].map(([t, d]) => (
                <li key={t} className="flex items-start gap-2.5">
                  <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-ok-ink" />
                  <span>
                    <strong>{t}:</strong> <span className="text-muted">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-5">
              <Button variant="primary" size="lg" className="w-full" onClick={exportAll} disabled={exporting}>
                {exporting ? <Loader2 className="animate-spin" /> : <Download />} Descargar Excel actualizado
              </Button>
              <p className="mt-2 text-center text-xs text-subtle">
                Tip: el archivo exportado se puede volver a importar (sirve como respaldo).
              </p>
            </div>
          </div>
        </Card>
      </div>

      <SheetViewer />

      {/* Estructura esperada */}
      <Card>
        <CardHeader icon={<Info />} title="Formato del Excel de inventario" subtitle="Los nombres de columna no distinguen mayúsculas ni tildes (también acepta “Código”, “Precio”, “Cantidad”…)" />
        <div className="scrollbar-thin overflow-x-auto p-4 sm:p-5">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs font-semibold text-subtle uppercase">
              <tr>
                <th className="py-2 pr-3">Columna</th>
                <th className="py-2 pr-3">Qué va</th>
                <th className="py-2">Ejemplo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {COLUMN_HELP.map((c) => (
                <tr key={c.col}>
                  <td className="py-2 pr-3 font-mono font-semibold">
                    {c.col} {c.required && <Badge tone="brand">obligatoria</Badge>}
                  </td>
                  <td className="py-2 pr-3 text-muted">{c.desc}</td>
                  <td className="py-2 font-mono text-xs">{c.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {parsed && <ImportPreview {...parsed} onClose={() => setParsed(null)} />}
    </div>
  )
}

// ---------- Vista previa de importación ----------

function ImportPreview({ fileName, sheetName, result, onClose }: { fileName: string; sheetName: string; result: ParsedImport; onClose: () => void }) {
  const { products, isDemo } = useData()
  const actions = useActions()
  const toast = useToast()
  const [mode, setMode] = useState<ImportMode>(isDemo ? 'replace' : 'merge')
  const [clearDemo, setClearDemo] = useState(true)
  const [show, setShow] = useState<'todas' | 'problemas'>('todas')

  const valid = result.rows.filter((r) => r.draft)
  const withErrors = result.rows.filter((r) => r.errors.length)
  const withWarnings = result.rows.filter((r) => r.draft && r.warnings.length)
  const visible = (show === 'todas' ? result.rows : result.rows.filter((r) => r.errors.length || r.warnings.length)).slice(0, 300)

  const apply = () => {
    const outcome = applyImport(
      products,
      valid.map((r) => r.draft!),
      mode,
    )
    if (isDemo && clearDemo) actions.endDemo(false)
    // "Reemplazar" manda el inventario completo; "actualizar" solo lo que venía en el Excel
    // (así no se borra un producto que otro dispositivo acaba de crear)
    if (mode === 'replace' || (isDemo && clearDemo)) actions.setProducts(outcome.products)
    else actions.upsertProducts(outcome.changed)
    toast.success(
      mode === 'replace'
        ? `Inventario reemplazado: ${outcome.added} productos`
        : `${outcome.added} productos nuevos y ${outcome.updated} actualizados`,
    )
    onClose()
  }

  if (result.missingColumns.length) {
    return (
      <Modal open onClose={onClose} size="md" title="No pudimos leer el inventario" footer={<Button onClick={onClose}>Entendido</Button>}>
        <div className="flex gap-3 rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">
          <XCircle className="size-5 shrink-0" />
          <div>
            <p className="font-semibold">Faltan columnas obligatorias: {result.missingColumns.join(', ')}</p>
            <p className="mt-1">
              Revisa que la primera fila de la hoja tenga los títulos de las columnas. Las columnas esperadas son:{' '}
              <span className="font-mono">{INVENTORY_COLUMNS.join(', ')}</span>.
            </p>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      persistent
      size="xl"
      title="Revisar importación"
      description={`${fileName} · hoja “${sheetName}” · encabezados en la fila ${result.headerRow}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={apply} disabled={!valid.length}>
            <CheckCircle2 /> Importar {valid.length} productos
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryBox tone="ok" icon={<CheckCircle2 />} value={valid.length} label="listos para importar" />
        <SummaryBox tone="warn" icon={<AlertTriangle />} value={withWarnings.length} label="con advertencias (se importan)" />
        <SummaryBox tone="danger" icon={<XCircle />} value={withErrors.length} label="con errores (se omiten)" />
      </div>

      <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-muted">¿Qué hacer con el inventario actual ({products.length} productos)?</legend>
        {(
          [
            ['merge', 'Actualizar y agregar', 'Actualiza los productos que ya existen (por código) y agrega los nuevos. No borra nada.'],
            ['replace', 'Reemplazar todo', 'El inventario queda exactamente igual al Excel. Los productos que no estén se eliminan.'],
          ] as const
        ).map(([value, title, desc]) => (
          <label
            key={value}
            className={cn(
              'flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors',
              mode === value ? 'border-brand bg-brand-soft' : 'border-line-strong hover:bg-surface-2',
            )}
          >
            <input type="radio" name="mode" className="mt-1 size-4 accent-[var(--brand)]" checked={mode === value} onChange={() => setMode(value)} />
            <span>
              <span className="block font-semibold">{title}</span>
              <span className="block text-sm text-muted">{desc}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {isDemo && (
        <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-xl bg-info-soft p-3 text-sm text-info-ink">
          <input type="checkbox" checked={clearDemo} onChange={(e) => setClearDemo(e.target.checked)} className="size-5 accent-[var(--brand)]" />
          Borrar también las ventas y gastos de demostración (recomendado)
        </label>
      )}

      <div className="mt-4 mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-muted">Vista previa</h3>
        <div className="flex gap-1">
          <Button size="sm" variant={show === 'todas' ? 'secondary' : 'ghost'} onClick={() => setShow('todas')}>
            Todas ({result.rows.length})
          </Button>
          <Button size="sm" variant={show === 'problemas' ? 'secondary' : 'ghost'} onClick={() => setShow('problemas')}>
            Con observaciones ({withErrors.length + withWarnings.length})
          </Button>
        </div>
      </div>
      <div className="scrollbar-thin max-h-[45dvh] overflow-auto rounded-xl border border-line">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs font-semibold text-subtle uppercase">
            <tr>
              <th className="px-3 py-2">Fila</th>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2 text-right">Costo</th>
              <th className="px-3 py-2 text-right">Venta</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="px-3 py-2">Rotación</th>
              <th className="px-3 py-2">Observaciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((r) => (
              <tr key={r.excelRow} className={cn(r.errors.length > 0 && 'bg-danger-soft/60')}>
                <td className="tabular px-3 py-1.5 text-subtle">{r.excelRow}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.preview.barcode || '—'}</td>
                <td className="max-w-56 truncate px-3 py-1.5 font-medium">{r.preview.name || <span className="text-danger-ink">(vacío)</span>}</td>
                <td className="px-3 py-1.5">{r.draft?.category ?? '—'}</td>
                <td className="tabular px-3 py-1.5 text-right">{r.draft ? formatCLP(r.draft.cost) : '—'}</td>
                <td className="tabular px-3 py-1.5 text-right">{r.draft ? formatCLP(r.draft.price) : '—'}</td>
                <td className="tabular px-3 py-1.5 text-right">{r.draft ? `${r.draft.stock}${r.draft.unit === 'kg' ? ' kg' : ''}` : '—'}</td>
                <td className="px-3 py-1.5">{r.draft?.rotation ?? '—'}</td>
                <td className="px-3 py-1.5 text-xs">
                  {r.errors.map((e) => (
                    <span key={e} className="flex items-center gap-1 font-semibold text-danger-ink">
                      <XCircle className="size-3.5 shrink-0" /> {e}
                    </span>
                  ))}
                  {r.warnings.map((w) => (
                    <span key={w} className="flex items-center gap-1 text-warn-ink">
                      <AlertTriangle className="size-3.5 shrink-0" /> {w}
                    </span>
                  ))}
                  {!r.errors.length && !r.warnings.length && <span className="text-ok-ink">OK</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.rows.length > visible.length && show === 'todas' && (
        <p className="mt-2 text-xs text-subtle">Mostrando las primeras {visible.length} filas; se importarán todas las válidas.</p>
      )}
    </Modal>
  )
}

function SummaryBox({ tone, icon, value, label }: { tone: 'ok' | 'warn' | 'danger'; icon: React.ReactNode; value: number; label: string }) {
  const styles = { ok: 'bg-ok-soft text-ok-ink', warn: 'bg-warn-soft text-warn-ink', danger: 'bg-danger-soft text-danger-ink' }
  return (
    <div className={cn('flex items-center gap-3 rounded-xl p-3 [&_svg]:size-6', styles[tone])}>
      {icon}
      <div>
        <p className="tabular text-2xl font-extrabold leading-none">{value}</p>
        <p className="text-xs font-medium">{label}</p>
      </div>
    </div>
  )
}

// ---------- Visor tipo hoja de cálculo ----------

const ROWS_PER_PAGE = 100

function colLetter(i: number): string {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function formatCell(v: Cell, f: ColumnFormat): string {
  if (typeof v !== 'number') return v
  if (f === 'money') return formatCLP(v)
  if (f === 'pct') return formatPct(v)
  if (f === 'qty') return v.toLocaleString('es-CL', { maximumFractionDigits: 3 })
  return String(v)
}

function SheetViewer() {
  const data = useData()
  const sheets = useMemo(() => buildSheets(data), [data])
  const [active, setActive] = useState(0)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const sheet = sheets[active]

  const rows = useMemo(() => {
    const q = normalizeText(query)
    if (!q) return sheet.rows
    return sheet.rows.filter((r) => r.some((c) => normalizeText(String(c)).includes(q)))
  }, [sheet, query])
  const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE))
  const current = Math.min(page, pages - 1)
  const slice = rows.slice(current * ROWS_PER_PAGE, (current + 1) * ROWS_PER_PAGE)

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<Table2 />}
        title="Visor de la planilla"
        subtitle="Así se ve el Excel que se descarga, con los datos de este momento"
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(0)
              }}
              placeholder="Buscar en la hoja…"
              className="h-9 pl-9 text-sm"
              aria-label="Buscar en la hoja"
            />
          </div>
        }
      />

      <div className="mt-4 border-y border-line bg-[#f8faf9] dark:bg-[#0f151c]">
        {rows.length === 0 ? (
          <EmptyState icon={<Table2 />} title={query ? 'Sin coincidencias' : 'Hoja vacía'} />
        ) : (
          <div className="scrollbar-thin max-h-[60dvh] overflow-auto">
            <table className="border-separate border-spacing-0 font-mono text-[0.8rem]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="sticky left-0 z-20 w-12 border-r border-b border-line bg-surface-2" />
                  {sheet.columns.map((_, i) => (
                    <th key={i} className="border-r border-b border-line bg-surface-2 px-2 py-1 text-center font-sans text-xs font-semibold text-subtle">
                      {colLetter(i)}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="sticky left-0 z-20 border-r border-b border-line bg-surface-2 px-2 py-1.5 text-right font-sans text-xs font-semibold text-subtle">
                    1
                  </th>
                  {sheet.columns.map((c) => (
                    <th
                      key={c.header}
                      className="border-r border-b border-line bg-brand-soft px-2 py-1.5 text-left font-sans text-xs font-bold whitespace-nowrap text-brand-ink"
                    >
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((r, ri) => (
                  <tr key={ri} className="hover:[&>td]:bg-info-soft/60">
                    <td className="tabular sticky left-0 border-r border-b border-line bg-surface-2 px-2 py-1 text-right font-sans text-xs text-subtle">
                      {current * ROWS_PER_PAGE + ri + 2}
                    </td>
                    {r.map((cell, ci) => {
                      const f = sheet.columns[ci].format
                      return (
                        <td
                          key={ci}
                          className={cn(
                            'max-w-72 truncate border-r border-b border-line bg-surface px-2 py-1 whitespace-nowrap',
                            typeof cell === 'number' && 'tabular text-right',
                            cell === 'Crítico' && 'text-warn-ink font-semibold',
                            (cell === 'Agotado' || cell === 'Anulada') && 'text-danger-ink font-semibold',
                          )}
                          title={String(cell)}
                        >
                          {formatCell(cell, f)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        {/* Pestañas de hojas, como en Excel */}
        <div className="no-scrollbar flex gap-1 overflow-x-auto" role="tablist" aria-label="Hojas">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              role="tab"
              aria-selected={active === i}
              type="button"
              onClick={() => {
                setActive(i)
                setPage(0)
              }}
              className={cn(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors',
                active === i ? 'bg-brand-soft text-brand-ink' : 'text-muted hover:bg-surface-2',
              )}
            >
              {s.name}
              <span className="tabular text-xs opacity-70">{formatInt(s.rows.length)}</span>
            </button>
          ))}
        </div>
        {pages > 1 && (
          <div className="flex items-center gap-1 text-sm text-subtle">
            <Button size="icon-sm" variant="ghost" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Página anterior">
              <ChevronLeft />
            </Button>
            <span className="tabular">
              {current + 1} / {pages}
            </span>
            <Button size="icon-sm" variant="ghost" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Página siguiente">
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
