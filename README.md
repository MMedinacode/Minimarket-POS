# Caja Minimarket — Punto de venta e inventario

Sistema web de **caja (POS) e inventario** para minimarkets, bazares y negocios de barrio.
Funciona en computador, tablet y celular, **también sin internet**. Con una cuenta
(opcional), los datos se sincronizan entre todos los dispositivos y quedan respaldados en línea.

🔗 **Demo en línea:** <https://mmedinacode.github.io/Minimarket-POS/> — la primera vez te pide crear tu propia clave

**Qué incluye**

| Módulo | Qué hace |
|---|---|
| 🔐 Acceso | Asistente de primera vez, clave propia guardada cifrada (PBKDF2), bloqueo creciente, cuenta opcional |
| 🏠 Inicio | Vendiste hoy, ganaste hoy, qué se está acabando y botones grandes para cada tarea |
| 🛒 Vender | Pistola lectora (USB/Bluetooth) siempre activa, cámara del celular, búsqueda, granel (kg), **monto libre**, vuelto |
| 📦 Productos | Categorías automáticas, stock crítico por rotación y velocidad, **recibir mercadería escaneando**, **etiquetas con código de barras** |
| 💰 Caja | Vendiste − gastaste = te queda, cuánto debería haber en el cajón, anotar gastos, anular ventas |
| ☰ Más | Reportes y gráficos, Excel, etiquetas, cuenta, ajustes, ayuda paso a paso, tema claro/oscuro y **letra grande** |
| ☁️ Cuenta | Mismos datos en PC y celular al instante, respaldo en línea, funciona sin internet y sube los cambios después |

---

> **¿Vas a instalarla en un negocio?** Sigue la lista corta de [`ENTREGA.md`](ENTREGA.md).

## 1. Ejecutar en tu computador

Requisitos: [Node.js](https://nodejs.org) 22 o superior.

```bash
npm install
npm run dev
```

Abre <http://localhost:5173>. La primera vez un asistente te pide **crear tu clave**, el nombre
del negocio y si quieres **probar con ejemplos** (68 productos y 14 días de ventas) o empezar vacío.

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo (muestra también una IP para abrirlo desde otro equipo de la red) |
| `npm run build` | Compila la versión de producción en `dist/` (revisa TypeScript antes) |
| `npm test` | 60 pruebas automáticas, incluida la sincronización contra PostgreSQL real (PGlite) |
| `npm run deploy` | Compila y publica en GitHub Pages (rama `gh-pages`) |
| `npm run deploy:netlify` | Compila y publica en Netlify (`caja-minimarket.netlify.app`, sección 5) |
| `npm run iconos` | Regenera los íconos PNG para celular desde el dibujo del logo |
| `npm run ejemplo` | Regenera `public/ejemplo-inventario.xlsx` |
| `npm run soporte -- 4821 9375` | Crea el link para que un cliente que olvidó la clave cree una nueva (sección 6) |

### Configuración (`.env`)

Copia `.env.example` como `.env`. Todo es opcional:

```bash
VITE_BUSINESS_NAME=Minimarket Don Pepe    # nombre por defecto
VITE_SUPABASE_URL=https://xxxx.supabase.co           # sincronización (ver sección 3)
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
VITE_SUPPORT_WHATSAPP=569XXXXXXXX                    # ayuda por WhatsApp (ver sección 6)
VITE_SUPPORT_PUBLIC_KEY=...                          # la escribe sola "npm run soporte -- llaves"
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

**Correo (obligatorio antes de entregar a clientes):** el correo que trae Supabase por defecto
**solo envía a los miembros de tu equipo en Supabase** y tiene un límite bajo por hora, así que a un
cliente no le llegaría el link de "olvidé mi contraseña". Configura un SMTP propio en
**Authentication → Emails → SMTP** (por ejemplo Gmail con una contraseña de aplicación, igual que
en el proyecto de barberías).

**Plan gratis — a tener en cuenta:** 500 MB de base de datos (años de ventas de un negocio chico);
el proyecto se *pausa* si pasa 7 días sin uso (se reactiva desde el panel); no incluye respaldos
descargables (por eso la app trae el respaldo en Excel). Un solo proyecto sirve para todos tus
clientes: cada cuenta ve solo lo suyo.

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

**Netlify** (gratis, dirección `https://caja-minimarket.netlify.app`, con las cabeceras de
seguridad de `netlify.toml`). Se compila en tu computador con tu `.env`, así el número y la llave
de soporte nunca pasan por GitHub ni por la configuración de Netlify.

1. Primera vez: `npx -y netlify-cli login` (abre el navegador; entras o creas la cuenta gratis y
   tocas *Authorize*). Luego `npx -y netlify-cli sites:create --name caja-minimarket`.
2. Cada vez que publiques: `npm run deploy:netlify`.

Ojo: GitHub Pages y Netlify son direcciones distintas y cada una guarda sus propios datos en el
navegador. Usa **una sola** como la oficial para tus clientes.

> La cámara solo funciona con HTTPS (GitHub Pages y Netlify lo dan) o en `localhost`.

---

## 6. Soporte por WhatsApp (para quien da soporte)

Si un cliente olvida la clave, puede pedir ayuda sin perder nada y sin usar el correo:

1. En la caja toca **¿Olvidaste tu clave? → Pedir ayuda por WhatsApp**. Aparece un código de 8
   números (ej: `4821 9375`) y un botón que abre WhatsApp con el mensaje listo para tu número.
2. Tú, en la carpeta del proyecto: `npm run soporte -- 4821 9375`. Te muestra el mensaje con un
   link y lo deja **copiado**. Pégalo en el WhatsApp del cliente.
   **Antes de mandarlo, confirma que te escribe el dueño desde su número de siempre** (no un empleado).
3. El cliente toca el link **en el mismo equipo** y crea su clave nueva. Si el link no abre la caja
   (iPhone con la caja instalada como app), pega el mensaje en **¿El link no abre la caja?**.

**Por qué es seguro:** el link lleva una firma hecha con tu **llave privada**, que vive solo en tu
computador (`%USERPROFILE%\.caja-minimarket\llave-soporte-privada.json`, fuera del proyecto y de
GitHub). La app solo trae la llave **pública**, que sirve para comprobar firmas pero no para
crearlas: nadie más puede fabricar esos links. Cada link sirve una sola vez, solo en el equipo que
pidió ayuda, y vence en 1 hora.

**Primera vez / en otro computador:**
- `npm run soporte -- llaves` crea las llaves y escribe la pública en `.env`. Luego `npm run deploy`.
- Respalda el archivo de la llave privada en un pendrive. Si la pierdes:
  `npm run soporte -- llaves --nueva` y `npm run deploy` (los links viejos dejan de servir).
- `npm run soporte -- 4821 9375 --local` crea el link para `http://localhost:5173` (pruebas).
- Tu número va en `.env` (`VITE_SUPPORT_WHATSAPP`), que no se sube a GitHub. `npm run deploy`
  avisa si falta: sin él, la app se publica sin el botón de ayuda.

---

## 7. Manual rápido para el dueño del negocio

La app tiene 5 secciones abajo (en el celular) o a la izquierda (en el computador):
**Inicio · Vender · Productos · Caja · Más**. Dentro de **Más → Cómo se usa** está esta misma
ayuda, paso a paso y en palabras simples.

### Primer día
1. Abre el link. Un asistente te pide **crear tu clave** (mínimo 6 números o letras, que no sea
   fácil como 123456), el nombre del negocio y si quieres **probar con ejemplos** o empezar vacío.
2. Carga tus productos: **Productos → Agregar producto**, o todos juntos desde **Más → Excel y respaldo**.
3. ¿Letra muy chica? **Más → Cómo se ve → Letra grande**.

### El día a día (desde Inicio)
- **Vender:** escanea con la pistola (sin tocar nada antes) o con la cámara, busca por nombre, o
  toca **Otro monto** para algo que no está en la lista. Elige *Efectivo, Tarjeta o Transferencia*;
  en efectivo toca el billete y la caja muestra el vuelto.
- **Llegó mercadería:** escanea cada producto que llegó; cada escaneo suma 1.
- **Anotar un gasto:** eliges en qué (proveedor, luz, bolsas…) y cuánto.
- **Agregar un producto:** nombre, a cuánto lo vendes y cuántos tienes. Lo demás es opcional.
- **Pedido al proveedor:** lista de lo que se está acabando con cantidades sugeridas, lista para WhatsApp.

### Caja
Muestra **cuánto vendiste, cuánto gastaste, cuánto te queda** y **cuánta plata debería haber en el
cajón**. Al cerrar, **Contar el cajón** dice si está justo, si sobra o si falta plata. Si te equivocaste en una venta: *Ventas de hoy → tocar la venta → Anular venta*.

### Productos
Lista simple con "Quedan 8 · Queda poco". Filtros: *Todos · Se están acabando · Agotados*.
En **Más opciones**: **subir precios** en un % (todos o una categoría, con vista previa y
*Deshacer*), imprimir etiquetas con código de barras (para lo que no trae código),
ordenar categorías automáticamente y Excel.

### Instalar en el celular
Abre el link en Chrome (Android) o Safari (iPhone) → menú → **Agregar a pantalla de inicio**.
Queda como una app y abre aunque no haya señal.

### Respaldo
- **Con cuenta:** se respalda solo, en línea.
- **Sin cuenta:** una vez por semana Inicio muestra **Guarda un respaldo de tu caja**. Toca
  **Descargar respaldo** y mándate el Excel por WhatsApp o correo. Con ese archivo recuperas todo.

### Si olvidas la clave
- **Por WhatsApp:** "¿Olvidaste tu clave?" → **Pedir ayuda por WhatsApp** → mandas el mensaje → te
  responden con un link → lo tocas y creas una clave nueva. No se pierde nada.
- **Con cuenta:** "¿Olvidaste tu clave?" → **Entrar con mi cuenta** → correo y contraseña → clave nueva.
- **Si nada de eso sirve:** la única forma es borrar los datos de ese equipo (por eso conviene
  tener cuenta o descargar el Excel seguido).

---

## 8. Seguridad

- **Sin clave por defecto:** cada dueño crea la suya en el primer inicio. Se rechazan claves
  fáciles (123456, 111111, 121212, "password"…).
- **La clave nunca se guarda:** solo su huella PBKDF2-SHA256 con sal aleatoria y 210.000
  repeticiones. Las claves de la versión anterior se convierten solas al formato seguro al entrar.
- **Bloqueo creciente:** 5 fallos → 30 s, 8 → 2 min, 10 o más → 10 min.
- **Cuenta en la nube:** contraseña de mínimo 8 caracteres (Supabase la guarda con bcrypt), reglas
  RLS para que cada cuenta vea solo lo suyo, y solo la *publishable key* en el navegador.
- Crear una clave nueva con una cuenta abierta en el equipo exige confirmar la contraseña de la
  cuenta o un link de soporte firmado (sección 6); "Borrar todo" también cierra la cuenta en ese equipo.
- **Link de soporte:** firma ECDSA P-256; la llave privada nunca sale del computador de quien da
  soporte. Un solo uso, atado al código de ese equipo, vence en 1 hora.
- Límite honesto: la clave protege la pantalla (que un cliente o empleado no vea las ganancias);
  quien tenga el equipo y conocimientos técnicos podría leer los datos guardados en el navegador.
  Para más protección: usar cuenta y bloquear la caja al alejarse (**Más → Bloquear caja**).

---

## 9. Cómo está hecho

- **React 19 + Vite + TypeScript** estricto, **Tailwind CSS v4** (modo claro/oscuro con tokens).
- **Supabase** (PostgreSQL + cuentas + tiempo real) para la sincronización, opcional.
- **vite-plugin-pwa** (funciona sin internet; íconos PNG para Android/iPhone generados con `npm run iconos`), **Recharts**, **SheetJS**, **html5-qrcode**, **Lucide**.
- Pruebas con **Vitest**; el SQL del servidor se prueba en **PGlite** (PostgreSQL en WebAssembly, sin Docker).
- `CLAUDE.md` resume la arquitectura y las reglas del proyecto para seguir trabajándolo con Claude Code.

```
supabase/schema.sql          # tablas, seguridad RLS, apply_ops y pull_changes
scripts/soporte.mjs          # llaves de soporte y links para crear una clave nueva
src/
├── App.tsx                  # primera vez → clave → las 5 secciones
├── store/
│   ├── reducer.ts           # todas las operaciones (venta, anulación, stock…)
│   └── AppStore.tsx         # modo local o modo cuenta, guardado automático
├── lib/
│   ├── sync/                # motor de sincronización (cola, envío, descarga)
│   ├── auth.ts              # clave de la caja (PBKDF2, bloqueo)
│   ├── support.ts           # ayuda por WhatsApp y revisión del link de soporte
│   ├── backup.ts            # aviso semanal de respaldo (solo sin cuenta)
│   ├── ean13.ts             # códigos de barra internos y dibujo EAN-13
│   ├── stock.ts             # "se está acabando" y pedido sugerido
│   ├── categories.ts        # categorías automáticas
│   ├── analytics.ts         # números de Inicio, Caja y Reportes
│   ├── excel-model.ts / excel-io.ts
│   └── storage.ts
├── hooks/useBarcodeScanner.ts   # detector de pistola lectora
├── components/              # formularios, modales, cámara, etiquetas, pedido, UI base
└── pages/                   # Setup, Login, SupportLink, Home, POS, Inventory, Cash, More,
                             # Reports, ExcelPage, Settings, Account, Help
```

### Límites conocidos

- Una cuenta = un negocio. Todavía no hay usuarios separados por empleado con permisos distintos.
- Si dos equipos venden el último producto estando ambos sin internet, al sincronizar el stock
  queda en 0 (no negativo) salvo que actives "Dejar vender aunque la caja diga que no hay".
- Es un sistema de caja e inventario interno: no emite boletas del SII.
