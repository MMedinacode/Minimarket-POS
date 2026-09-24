# Caja Minimarket — Punto de venta e inventario

Sistema web de **caja (POS) e inventario** para minimarkets, bazares y negocios de barrio.
Funciona en computador, tablet y celular, **también sin internet**. Con una cuenta
(opcional), los datos se sincronizan entre todos los dispositivos y quedan respaldados en línea.

🔗 **Demo en línea:** <https://mmedinacode.github.io/Minimarket-POS/> — contraseña `1234`

**Qué incluye**

| Módulo | Qué hace |
|---|---|
| 🔐 Acceso | Contraseña de la caja (bloqueo tras 5 intentos) + cuenta opcional para sincronizar, modo claro/oscuro |
| 📊 Inicio | Ventas y ganancia neta del día, ventas por hora, top 5, menor rotación, márgenes, **armar pedido al proveedor** |
| 🛒 Vender | Pistola lectora (USB/Bluetooth) siempre activa, cámara del celular, búsqueda, granel (kg), **monto libre**, vuelto |
| 📦 Productos | Categorías automáticas, stock crítico por rotación y velocidad, **recibir mercadería escaneando**, **etiquetas con código de barras** |
| 💰 Caja y gastos | Gastos, **Ventas − Gastos = Caja neta**, efectivo esperado en el cajón, anular ventas |
| 📗 Excel | Importar con vista previa y validación, exportar libro completo, visor tipo hoja de cálculo |
| ☁️ Cuenta | Mismos datos en PC y celular al instante, respaldo en línea, funciona sin internet y sube los cambios después |

---

## 1. Ejecutar en tu computador

Requisitos: [Node.js](https://nodejs.org) 22 o superior.

```bash
npm install
npm run dev
```

Abre <http://localhost:5173> y entra con la contraseña **`1234`**. La primera vez se cargan
**datos de demostración** (68 productos y 14 días de ventas); desde el aviso azul del Inicio
se borran cuando quieras empezar de verdad.

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo (muestra también una IP para abrirlo desde otro equipo de la red) |
| `npm run build` | Compila la versión de producción en `dist/` (revisa TypeScript antes) |
| `npm test` | Pruebas automáticas, incluida la sincronización contra PostgreSQL real (PGlite) |
| `npm run deploy` | Compila y publica en GitHub Pages (rama `gh-pages`) |
| `npm run ejemplo` | Regenera `public/ejemplo-inventario.xlsx` |

### Configuración (`.env`)

Copia `.env.example` como `.env`. Todo es opcional:

```bash
VITE_MASTER_PASSWORD=1234                 # contraseña inicial de la caja
VITE_BUSINESS_NAME=Minimarket Don Pepe    # nombre por defecto
VITE_SUPABASE_URL=https://xxxx.supabase.co           # sincronización (ver sección 3)
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
```

---

## 2. Cómo funciona la sincronización (y por qué el stock no se descuadra)

Sin cuenta, los datos viven solo en el navegador de ese dispositivo. Con cuenta:

```
  PC: vende 2 Coca-Cola  ─┐                        ┌─► PC ve stock 15
                          ├─► Servidor: 20 − 2 − 3 ─┤
  Celular: vende 3       ─┘      = 15               └─► Celular ve stock 15
```

- Los dispositivos **no envían "quedan 18"**, envían lo que pasó: **"se vendieron 2"**.
  El servidor lo resta del stock real. Así dos cajas vendiendo el mismo producto al mismo
  tiempo nunca se pisan.
- **Primero local:** cada venta se guarda al instante en el dispositivo (en una *cola*), la
  pantalla se actualiza de inmediato y la cola se sube cuando hay internet. Sin conexión se
  sigue vendiendo; arriba aparece "Sin internet · N por subir".
- Cada operación lleva un **id único**: si se corta internet justo al enviarla y se reintenta,
  el servidor la reconoce y no la aplica dos veces.
- Apenas un dispositivo sube algo, los demás reciben un aviso **en tiempo real** y descargan
  solo lo que cambió.
- La app queda **instalada en el dispositivo** (service worker): abre aunque no haya señal.

El código está en `src/lib/sync/` (motor) y `supabase/schema.sql` (base de datos, seguridad y
las funciones `apply_ops` / `pull_changes`). Las pruebas de `src/lib/sync/sync.test.ts` corren
ese mismo SQL en PostgreSQL real e incluyen el caso "dos cajas venden sin internet".

---

## 3. Activar las cuentas (Supabase, gratis, ~5 minutos)

1. Crea una cuenta en <https://supabase.com> y un **New project** (región: *South America (São Paulo)*).
   Guarda la contraseña de la base de datos que te pide.
2. En el proyecto: **SQL Editor → New query**, pega **todo** `supabase/schema.sql` y pulsa **Run**.
   Debe decir *Success*.
3. **Authentication → URL Configuration**:
   - *Site URL*: `https://mmedinacode.github.io/Minimarket-POS/`
   - *Redirect URLs*: agrega también `http://localhost:5173/`
   (ahí vuelven los links de "confirmar correo" y "olvidé mi contraseña").
4. **Project Settings → API Keys**: copia la *Project URL* y la **Publishable key**
   (`sb_publishable_…`) a tu `.env` como `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
   Esa clave es pública por diseño; lo que protege los datos son las reglas RLS del paso 2
   (cada cuenta solo ve lo suyo). **Nunca** pongas la *secret key* en el `.env` de la app.
5. `npm run deploy`. En la app aparecerá **Entrar con mi cuenta** en el login y en Ajustes.

**Plan gratis — a tener en cuenta:** 500 MB de base de datos (años de ventas de un negocio chico);
el proyecto se *pausa* si pasa 7 días sin uso (se reactiva desde el panel); y el correo de
confirmación que manda Supabase tiene un límite bajo por hora. Para uso real con varios
clientes conviene configurar un SMTP propio en **Authentication → Emails → SMTP**
(por ejemplo Gmail, igual que en el proyecto de barberías).

---

## 4. Formato del Excel

Lee la hoja **`Inventario`** (o la primera). Acepta `.xlsx`, `.xls` y `.csv` (también el CSV
con `;` y tildes de Excel en Chile).

| Columna | Obligatoria | Ejemplo | Notas |
|---|---|---|---|
| `CodigoBarras` | no | `7801234500013` | Vacío si no tiene (se puede generar uno interno después) |
| `Nombre` | **sí** | `Coca-Cola 1.5L` | |
| `Categoria` | no | `Bebidas` | Si está vacía, se asigna sola según el nombre |
| `PrecioCosto` | no | `1290` o `$1.290` | |
| `PrecioVenta` | **sí** | `1990` o `$1.990` | Debe ser mayor a 0 |
| `Stock` | no | `24` o `2,5` | Unidades, o kilos si la unidad es `kg` |
| `Rotacion` | no | `Alta` / `Media` / `Baja` | Si falta: `Media` |
| `Unidad` | no | `un` o `kg` | `kg` = a granel por peso |
| `StockMinimo` | no | `5` | Umbral de alerta propio |

Los títulos no distinguen mayúsculas ni tildes y aceptan sinónimos (`Código`, `Producto`,
`Precio`, `Cantidad`…). Antes de aplicar se muestra una **vista previa** con errores y
advertencias. Modos: **Actualizar y agregar** (no borra nada) o **Reemplazar todo**.
Ejemplo real: [`public/ejemplo-inventario.xlsx`](public/ejemplo-inventario.xlsx).
El Excel **exportado** (4 hojas: Inventario, Ventas, Gastos, Resumen diario) se puede volver a importar.

---

## 5. Publicar

**GitHub Pages** (así está la demo): después de `git push`, ejecuta `npm run deploy`.
En 1–2 minutos se actualiza el sitio; quien ya lo tenga abierto verá el aviso
*"Hay una versión nueva · Actualizar"* (nunca se recarga solo a mitad de una venta).

**Netlify:** el proyecto trae `netlify.toml`. Lo más rápido: `npm run build` y arrastrar la
carpeta `dist` a <https://app.netlify.com/drop>. Las variables del `.env` se agregan en
*Site configuration → Environment variables*.

> La cámara solo funciona con HTTPS (GitHub Pages y Netlify lo dan) o en `localhost`.

---

## 6. Manual rápido para el dueño del negocio

### Primer día
1. Entra con `1234` y cámbiala en **Ajustes → Contraseña máster**.
2. Si vas a usar la caja en más de un equipo: **Ajustes → Crear cuenta**. En el otro equipo,
   abre el mismo link y pulsa **Entrar con mi cuenta** con el mismo correo.
3. Carga tus productos: **Excel → Importar**, o **Productos → Nuevo**.

### Instalar en el celular
Abre el link en Chrome (Android) o Safari (iPhone) → menú → **Agregar a pantalla de inicio**.
Queda como una app y abre aunque no haya señal.

### Vender
- **Pistola lectora:** solo escanea, sin hacer clic en nada.
- **Cámara:** botón 📷 (cambia entre cámara trasera y frontal).
- **Sin código:** busca por nombre y Enter, o toca el producto.
- **Monto libre (F4):** para cobrar algo que no está en el inventario ("lápiz $500").
- **Granel:** al tocar pan, fiambre o verduras pide el peso.
- **Cobrar (F9):** elige medio de pago; en efectivo toca el billete y aparece el vuelto.

### Productos
- **Recibir mercadería:** activa el modo y escanea cada unidad que llegó: suma 1 al stock
  (con "Deshacer último" por si escaneaste de más).
- **Etiquetas:** para lo que no trae código (muy común en bazares): elige los productos,
  **Generar códigos** y **Imprimir** (hoja A4 de 21 etiquetas, tipo Avery L7160, o papel
  normal y se recortan). Desde ahí se venden escaneando.
- **Stock crítico:** alerta según rotación (Alta < 10, Media < 5, Baja < 2) y sube solo si algo
  se vende más rápido de lo normal.
- **Auto-clasificar:** propone categorías según el nombre.

### Pedir al proveedor
En **Inicio → Productos por reponer → Armar pedido**: la app sugiere cuánto pedir de cada
producto crítico (para ~1 semana de venta), puedes ajustar las cantidades y lo mandas por
**WhatsApp** o lo copias.

### Caja
- Registra los gastos y marca si salieron del cajón.
- **Efectivo esperado** = ventas en efectivo − gastos pagados en efectivo.
- Para **anular una venta**, ábrela en "Ventas del día": el stock se devuelve solo.

### Respaldo
Con cuenta, todo queda respaldado en línea automáticamente. Sin cuenta, los datos están solo
en ese navegador: descarga el Excel seguido (**Excel → Descargar Excel actualizado**).

---

## 7. Cómo está hecho

- **React 19 + Vite + TypeScript** estricto, **Tailwind CSS v4** (modo claro/oscuro con tokens).
- **Supabase** (PostgreSQL + cuentas + tiempo real) para la sincronización, opcional.
- **vite-plugin-pwa** (funciona sin internet), **Recharts**, **SheetJS**, **html5-qrcode**, **Lucide**.
- Pruebas con **Vitest**; el SQL del servidor se prueba en **PGlite** (PostgreSQL en WebAssembly, sin Docker).

```
supabase/schema.sql          # tablas, seguridad RLS, apply_ops y pull_changes
src/
├── store/
│   ├── reducer.ts           # todas las operaciones (venta, anulación, stock…)
│   └── AppStore.tsx         # modo local o modo cuenta, guardado automático
├── lib/
│   ├── sync/                # motor de sincronización (cola, envío, descarga)
│   ├── ean13.ts             # códigos de barra internos y dibujo EAN-13
│   ├── stock.ts             # stock crítico y pedido sugerido
│   ├── categories.ts        # clasificación automática
│   ├── analytics.ts         # dashboard y caja
│   ├── excel-model.ts / excel-io.ts
│   └── storage.ts / auth.ts
├── hooks/useBarcodeScanner.ts   # detector de pistola lectora
├── components/              # layout, cámara, etiquetas, pedido, cuenta, UI base
└── pages/                   # Dashboard, POS, Inventory, Cash, ExcelPage, Settings
```

### Límites conocidos

- La **contraseña de la caja** es una barrera local (para que un cliente no entre al panel);
  la seguridad real de los datos en la nube la dan la cuenta y las reglas RLS.
- Una cuenta = un negocio. Todavía no hay usuarios separados por empleado con permisos distintos.
- Si dos dispositivos venden el último producto estando ambos sin internet, al sincronizar el
  stock queda en 0 (no negativo) salvo que actives "Permitir vender sin stock".
- Es un sistema de caja e inventario interno: no emite boletas del SII.
