import type { ReactNode } from 'react'
import {
  AlertTriangle,
  Ban,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Download,
  HandCoins,
  KeyRound,
  MessageCircle,
  PackagePlus,
  PenLine,
  Plus,
  Receipt,
  Scale,
  ScanBarcode,
  Smartphone,
  Wallet,
  WifiOff,
  XCircle,
} from 'lucide-react'
import { Button, Card } from '../components/ui/primitives'
import { supportUnlockAvailable, whatsappUrl } from '../lib/support'
import { useCloud, useData } from '../store/AppStore'

interface Topic {
  icon: typeof ScanBarcode
  title: string
  body: ReactNode
}

const TOPICS: Topic[] = [
  {
    icon: ScanBarcode,
    title: 'Vender un producto',
    body: (
      <Steps>
        <li>
          Toca <B>Vender</B>.
        </li>
        <li>
          Escanea el código con la pistola (no hace falta tocar nada antes) o toca <B>Escanear con cámara</B>.
        </li>
        <li>El producto se suma a la venta. Si llevan dos, escanéalo otra vez o toca el “+”.</li>
        <li>
          Toca <B>Cobrar</B>.
        </li>
      </Steps>
    ),
  },
  {
    icon: Banknote,
    title: 'Cobrar y dar el vuelto',
    body: (
      <Steps>
        <li>
          Elige cómo paga: <B>Efectivo</B>, <B>Tarjeta</B> o <B>Transferencia</B>.
        </li>
        <li>En efectivo, toca el billete con que te pagan (o escribe el monto). La caja te muestra el vuelto en verde.</li>
        <li>
          Toca <B>Cobrar</B>. El stock se descuenta solo.
        </li>
      </Steps>
    ),
  },
  {
    icon: PenLine,
    title: 'Si el producto no tiene código',
    body: (
      <Steps>
        <li>Escribe su nombre en el buscador, o tócalo en la lista de productos.</li>
        <li>
          Si no está en tu lista (ej: un lápiz suelto), toca <B>Otro monto</B> y escribe cuánto cuesta.
        </li>
        <li>
          Para no tener que buscarlo: en <B>Más → Imprimir etiquetas</B> le creas un código y lo pegas en el producto.
        </li>
      </Steps>
    ),
  },
  {
    icon: Scale,
    title: 'Pan, fiambre y cosas por kilo',
    body: <p>Al tocarlos, la caja te pregunta el peso. Puedes usar los botones de 250 g, 500 g, 750 g o 1 kg, o escribir el peso.</p>,
  },
  {
    icon: Plus,
    title: 'Agregar un producto nuevo',
    body: (
      <Steps>
        <li>
          Ve a <B>Productos → Agregar producto</B>.
        </li>
        <li>Escribe el nombre, a cuánto lo vendes y cuántos tienes. Lo demás es opcional.</li>
        <li>Si trae código de barras, escanéalo mientras tienes el formulario abierto.</li>
      </Steps>
    ),
  },
  {
    icon: PackagePlus,
    title: 'Cuando llega mercadería',
    body: (
      <Steps>
        <li>
          En <B>Inicio</B> toca <B>Llegó mercadería</B>.
        </li>
        <li>Escanea cada producto que llegó: cada escaneo suma 1. Si te equivocas, toca “Deshacer el último”.</li>
        <li>
          Al final toca <B>Terminar</B>.
        </li>
      </Steps>
    ),
  },
  {
    icon: AlertTriangle,
    title: 'Qué significan los colores',
    body: (
      <ul className="space-y-2">
        <li className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-ok-ink" /> <B>Bien</B>: tienes suficiente.
        </li>
        <li className="flex items-center gap-2">
          <AlertTriangle className="size-5 text-warn-ink" /> <B>Queda poco</B>: hay que pedir pronto.
        </li>
        <li className="flex items-center gap-2">
          <XCircle className="size-5 text-danger-ink" /> <B>Agotado</B>: no queda nada.
        </li>
        <li>
          En <B>Inicio → Pedido al proveedor</B> se arma la lista de lo que hay que pedir, lista para mandar por WhatsApp.
        </li>
      </ul>
    ),
  },
  {
    icon: HandCoins,
    title: 'Anotar un gasto',
    body: (
      <p>
        En <B>Inicio</B> o en <B>Caja</B>, toca <B>Anotar un gasto</B>, elige en qué gastaste (proveedor, luz, bolsas…) y escribe cuánto.
      </p>
    ),
  },
  {
    icon: Wallet,
    title: 'Cerrar el día',
    body: (
      <p>
        En <B>Caja</B> ves cuánto vendiste, cuánto gastaste y <B>cuánta plata debería haber en el cajón</B>. Cuenta el efectivo y compáralo.
      </p>
    ),
  },
  {
    icon: Ban,
    title: 'Me equivoqué en una venta',
    body: (
      <p>
        En <B>Caja → Ventas de hoy</B>, toca la venta y luego <B>Anular venta</B>. Los productos vuelven al stock.
      </p>
    ),
  },
  {
    icon: WifiOff,
    title: 'Si se corta internet',
    body: <p>Sigue vendiendo normal. Todo queda guardado en el equipo y, si tienes cuenta, se sube solo cuando vuelve internet.</p>,
  },
  {
    icon: Download,
    title: 'Guardar un respaldo',
    body: (
      <p>
        Si usas la caja con cuenta, se respalda sola. Si no, una vez por semana ve a <B>Más → Excel y respaldo → Descargar Excel
        actualizado</B> y mándate el archivo por WhatsApp o correo. Si pierdes el equipo, cargas ese Excel y recuperas tus productos.
      </p>
    ),
  },
  {
    icon: Receipt,
    title: '¿Esta caja da boletas?',
    body: (
      <p>
        No. Sirve para llevar tus ventas, lo que te queda en bodega y tus ganancias. La boleta la sigues dando como siempre (con la máquina
        de tarjetas o la boleta del SII).
      </p>
    ),
  },
  {
    icon: Smartphone,
    title: 'Tener la caja en el celular',
    body: (
      <p>
        Abre la dirección de la caja en el celular y, en el menú del navegador, toca <B>Agregar a pantalla de inicio</B>. Queda como una
        aplicación más. Para ver los mismos datos que en el computador, entra con tu cuenta.
      </p>
    ),
  },
]

/** Cómo recuperar la clave según lo que tenga esta caja (cuenta y/o ayuda por WhatsApp) */
function forgotTopic(withAccount: boolean, withSupport: boolean): Topic {
  return {
    icon: KeyRound,
    title: 'Si olvidas la clave',
    body:
      withAccount || withSupport ? (
        <Steps>
          <li>
            En la pantalla de la clave, toca <B>¿Olvidaste tu clave?</B>
          </li>
          {withSupport && (
            <li>
              Toca <B>Pedir ayuda por WhatsApp</B> y manda el mensaje. Te respondemos con un link: tócalo y crea tu clave nueva.
            </li>
          )}
          {withAccount && (
            <li>
              {withSupport ? 'O, si tienes cuenta, toca ' : 'Toca '}
              <B>Entrar con mi cuenta</B> y escribe tu correo y contraseña.
            </li>
          )}
          <li>No se borra ningún producto ni venta.</li>
        </Steps>
      ) : (
        <p>
          La clave queda solo en este equipo. Si la olvidas, hay que borrar los datos del equipo y empezar de nuevo. Para no perder nada, crea
          una cuenta en <B>Más → Cuenta y respaldo en línea</B>.
        </p>
      ),
  }
}

/** Ayuda en palabras simples, un tema a la vez */
export default function Help() {
  const cloud = useCloud()
  const { settings } = useData()
  const topics = [...TOPICS, forgotTopic(cloud.enabled, supportUnlockAvailable())]
  const helpUrl = whatsappUrl(`Hola, tengo una duda con la caja de ${settings.businessName}.`)

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <p className="text-muted">Toca un tema para ver cómo se hace.</p>
      {topics.map((t) => (
        <Card key={t.title} className="overflow-hidden">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 sm:px-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink">
                <t.icon className="size-5" />
              </span>
              <span className="flex-1 text-lg font-semibold">{t.title}</span>
              <ChevronDown className="size-5 text-subtle transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-line px-4 py-4 text-base leading-relaxed sm:px-5">{t.body}</div>
          </details>
        </Card>
      ))}
      {helpUrl && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <p className="text-lg font-semibold">¿No encuentras lo que buscas?</p>
          <Button variant="primary" onClick={() => window.open(helpUrl, '_blank', 'noopener')}>
            <MessageCircle /> Escríbenos por WhatsApp
          </Button>
        </Card>
      )}
    </div>
  )
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-2 pl-5 marker:font-bold marker:text-brand-ink">{children}</ol>
}

function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-fg">{children}</strong>
}
