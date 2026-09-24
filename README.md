# Caja Minimarket — Punto de venta e inventario

Sistema web de **caja (POS) e inventario** para minimarkets y almacenes de barrio.
Funciona en computador, tablet y celular, sin servidor ni base de datos externa:
todo se guarda en el navegador del dispositivo y se respalda con Excel.

🔗 **Demo en línea:** <https://mmedinacode.github.io/Minimarket-POS/> — contraseña `1234`

**Qué incluye**

| Módulo | Qué hace |
|---|---|
| 🔐 Acceso | Contraseña máster (sin registro de usuarios), bloqueo de 30 s tras 5 intentos fallidos, modo claro/oscuro |
| 📊 Inicio | Ventas y ganancia neta del día, transacciones, stock crítico, ventas por hora, top 5 productos, menor rotación, análisis de márgenes |
| 🛒 Vender | Lector tipo pistola (USB/Bluetooth) siempre activo, cámara del celular, búsqueda, productos a granel (kg), vuelto, 4 medios de pago |
| 📦 Productos | Tabla/tarjetas, filtros, categorías automáticas, stock crítico diferenciado por rotación y velocidad de venta, ajustes de stock |
| 💰 Caja y gastos | Registro de gastos, balance **Ventas − Gastos = Caja neta**, efectivo esperado en el cajón, anular ventas |
| 📗 Excel | Importar con vista previa y validación, exportar libro completo, plantilla, visor tipo hoja de cálculo |

---

## 1. Ejecutar en tu computador

Requisitos: [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm run dev
```

Abre <http://localhost:5173> y entra con la contraseña **`1234`**.

La primera vez se cargan **datos de demostración** (68 productos y 14 días de ventas
simuladas) para que veas el sistema funcionando. Desde el aviso azul del Inicio puedes
borrarlos cuando quieras empezar de verdad.

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo (también muestra una IP para abrirlo desde otro equipo de la red) |
| `npm run build` | Compila la versión de producción en `dist/` (revisa TypeScript antes) |
| `npm run preview` | Sirve localmente lo compilado en `dist/` |
| `npm test` | Pruebas automáticas (categorías, stock crítico, caja, Excel) |
| `npm run ejemplo` | Regenera `public/ejemplo-inventario.xlsx` |
| `npm run deploy` | Compila y publica en GitHub Pages (rama `gh-pages`) |

### Configuración opcional (`.env`)

Copia `.env.example` como `.env`:

```bash
VITE_MASTER_PASSWORD=1234              # contraseña inicial
VITE_BUSINESS_NAME=Minimarket Don Pepe # nombre en el login y la barra
```

La contraseña y el nombre también se cambian desde **Ajustes** dentro de la app.

---

## 2. Formato del Excel

La app lee la hoja llamada **`Inventario`** (o la primera hoja si no existe).
Acepta `.xlsx`, `.xls` y `.csv` (incluido el CSV con `;` que genera Excel en Chile).

| Columna | Obligatoria | Ejemplo | Notas |
|---|---|---|---|
| `CodigoBarras` | no | `7801234500017` | Vacío para productos a granel. Formatea la columna como **Texto** en Excel para no perder ceros a la izquierda |
| `Nombre` | **sí** | `Coca-Cola 1.5L` | |
| `Categoria` | no | `Bebidas` | Si está vacía, se asigna sola según el nombre |
| `PrecioCosto` | no | `1290` o `$1.290` | Si falta, queda en $0 (con aviso) |
| `PrecioVenta` | **sí** | `1990` o `$1.990` | Debe ser mayor a 0 |
| `Stock` | no | `24` o `2,5` | Unidades, o kilos si la unidad es `kg` |
| `Rotacion` | no | `Alta` / `Media` / `Baja` | También acepta `A`, `M`, `B`. Si falta: `Media` |
| `Unidad` | no | `un` o `kg` | `kg` = se vende a granel por peso |
| `StockMinimo` | no | `5` | Umbral de alerta propio (si no, se calcula solo) |

- Los títulos no distinguen mayúsculas ni tildes, y se aceptan sinónimos
  (`Código`, `Producto`, `Precio`, `Cantidad`, `Costo`…). Puede haber una fila de título arriba.
- Antes de aplicar, la app muestra una **vista previa** con las filas válidas, las
  advertencias y los errores (nombre vacío, precio inválido, código repetido).
- Modos: **Actualizar y agregar** (por código de barras; no borra nada) o **Reemplazar todo**.
- Hay un ejemplo real en [`public/ejemplo-inventario.xlsx`](public/ejemplo-inventario.xlsx),
  descargable también desde la pantalla Excel.

**Exportar** descarga un libro con 4 hojas: `Inventario` (mismo formato de arriba, más
margen y estado del stock), `Ventas` (una fila por producto vendido), `Gastos` y
`Resumen diario`. El archivo exportado **se puede volver a importar**, así que sirve de respaldo.

---

## 3. Publicar

### GitHub Pages (así está publicada la demo)

Después de hacer cambios y subirlos (`git push`), ejecuta:

```bash
npm run deploy
```

Compila el proyecto y sube la carpeta `dist` a la rama `gh-pages`. En 1–2 minutos
se actualiza <https://mmedinacode.github.io/Minimarket-POS/>.

### Netlify (menos de 3 minutos)

El proyecto ya trae `netlify.toml` (comando de build, carpeta `dist`, cabeceras de
seguridad y permiso de cámara).

**Opción A — Arrastrar y soltar (sin cuenta de GitHub)**

1. `npm run build`
2. Entra a <https://app.netlify.com/drop> e inicia sesión.
3. Arrastra la carpeta **`dist`** a la página. Listo: te entrega una URL `https://….netlify.app`.

**Opción B — Desde GitHub (se actualiza solo con cada push)**

1. Sube el proyecto a un repositorio de GitHub.
2. En Netlify: **Add new site → Import an existing project** → elige el repositorio.
3. Netlify lee `netlify.toml` solo (build `npm run build`, publica `dist`). Pulsa **Deploy**.
4. Opcional: en **Site configuration → Environment variables** agrega `VITE_MASTER_PASSWORD`
   y `VITE_BUSINESS_NAME`, y vuelve a desplegar.

**Opción C — Línea de comandos**

```bash
npx netlify-cli deploy --build --prod
```

> La cámara del celular **solo funciona con HTTPS** (Netlify lo da gratis) o en `localhost`.
> Si abres la app por IP local (`http://192.168…`) la cámara no enciende, pero la pistola
> lectora y el resto funcionan igual.

---

## 4. Manual rápido para el dueño del minimarket

### Primer día
1. Entra con la contraseña `1234` y cámbiala en **Ajustes → Contraseña máster**.
2. En **Inicio**, en el aviso azul, elige **Importar mi Excel** (si ya tienes tu lista de
   productos) o **Empezar desde cero** (y agrega productos en **Productos → Nuevo producto**).
3. Revisa en **Ajustes → Stock crítico** cuándo quieres que te avise cada tipo de producto.

### Vender
- **Con pistola lectora:** solo escanea. No hace falta hacer clic en ningún lado: la app
  reconoce la pistola porque escribe mucho más rápido que una persona.
- **Con la cámara:** botón **Cámara** (cambia entre trasera y frontal con el ícono de flechas).
- **Sin código:** escribe el nombre en el buscador y presiona Enter, o toca el producto en la grilla.
- **Productos a granel (pan, fiambre, verduras):** al tocarlos pide el peso (hay atajos de 250 g, 500 g…).
- **Cobrar:** elige el medio de pago. En efectivo, toca el billete con que te pagan
  (o escribe el monto) y la app muestra el **vuelto**. Botón **Cobrar** o tecla **F9**.
- Si escaneas un código que no existe, aparece **Crear producto** con el código ya puesto.
- Atajos de teclado: **F2** buscar · **F9** cobrar · **Esc** limpiar búsqueda.

### Productos e inventario
- **Llegó mercadería:** botón de caja con "+" en la fila del producto → *Sumar*.
- **Conteo físico:** mismo botón → *Contar* (fija el número real).
- **Stock crítico:** cada producto avisa según su rotación
  (por defecto: Alta bajo 10, Media bajo 5, Baja bajo 2). Si algo se vende más rápido de lo
  normal, el sistema sube el aviso solo para que alcance para 2 días de venta.
- **Auto-clasificar:** revisa los nombres y propone categorías; tú eliges cuáles aplicar.
  La categoría también se puede cambiar directo en la tabla.
- Escanear con la pistola en esta pantalla abre el producto para editarlo (o crearlo).

### Caja y gastos
- Registra cada gasto (proveedor, luz, bolsas…) y marca si se pagó con plata del cajón.
- **Caja neta** = ventas del día − gastos del día.
- **Efectivo esperado en caja** = ventas en efectivo − gastos pagados con efectivo
  (compáralo con lo que cuentas en el cajón al cerrar, sin contar el sencillo inicial).
- Para **anular una venta**, ábrela en la lista de ventas del día: el stock se devuelve solo.
- Con las flechas de arriba puedes revisar días anteriores.

### Respaldo (importante)
Los datos viven **en el navegador de ese dispositivo**. No se comparten entre
el computador y el celular, y se pierden si se borran los datos del navegador.
👉 **Descarga el Excel al cerrar cada día** (pantalla Excel → *Descargar Excel actualizado*).

---

## 5. Cómo está hecho

- **React 19 + Vite + TypeScript** (estricto), **Tailwind CSS v4** con tokens de color para modo claro/oscuro.
- **Recharts** (gráficos), **SheetJS** (Excel), **html5-qrcode** (cámara), **Lucide** (íconos).
- Persistencia en **IndexedDB** (con respaldo en localStorage) y sincronización entre pestañas abiertas.
- Cada módulo se descarga solo al abrirlo, así la primera carga es liviana.

```
src/
├── App.tsx                 # login + navegación entre módulos
├── types.ts                # Producto, Venta, Gasto, Ajustes
├── data/mockData.ts        # datos de demostración (minimarket chileno)
├── store/
│   ├── reducer.ts          # todos los cambios de datos (venta, anulación, stock…)
│   └── AppStore.tsx        # estado global + guardado automático
├── lib/
│   ├── categories.ts       # clasificación automática por palabras clave
│   ├── stock.ts            # stock crítico por rotación y velocidad de venta
│   ├── analytics.ts        # cálculos del dashboard y de la caja
│   ├── excel-model.ts      # validación de filas importadas y hojas exportadas
│   ├── excel-io.ts         # lectura/escritura de archivos con SheetJS
│   ├── storage.ts          # IndexedDB / localStorage
│   └── auth.ts             # contraseña máster y sesión
├── hooks/useBarcodeScanner.ts  # detector de pistola lectora
├── components/             # layout, escáner de cámara, formularios, UI base
└── pages/                  # Dashboard, POS, Inventory, Cash, ExcelPage, Settings
```

### Límites conocidos

- **La contraseña protege el acceso en ese dispositivo, no es seguridad de servidor.**
  Quien tenga acceso al navegador y conocimientos técnicos puede leer los datos, y la
  contraseña inicial de `.env` queda incluida en el código publicado. Sirve para que un
  cliente o empleado no entre al panel, no para proteger información sensible.
- Un solo dispositivo por negocio (no hay sincronización en la nube).
- No emite boletas electrónicas del SII: el comprobante es interno.
