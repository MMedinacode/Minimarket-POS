# CLAUDE.md — Caja Minimarket

Caja (POS) e inventario web para minimarkets, bazares y almacenes de barrio en Chile.
Demo: https://mmedinacode.github.io/Minimarket-POS/ · repo: MMedinacode/Minimarket-POS (público).

## Para quién es (manda sobre cualquier decisión de diseño)

Dueños de negocio de 50–60+ años, sin experiencia técnica y sin alguien que les explique
todos los días. Por eso:

- **Simple primero.** 5 secciones fijas: Inicio, Vender, Productos, Caja, Más. Lo avanzado
  (reportes, Excel, etiquetas, ajustes raros) va dentro de "Más" o en `<details>` "Más opciones".
- **Botones con texto**, nunca solo íconos. Botones grandes (≥ 44 px). Una acción principal por pantalla.
- **Lenguaje cotidiano, sin jerga:** "Se está acabando" (no "stock crítico"), "Ganas $500 por cada uno"
  (no "margen"), "Se vende mucho/normal/poco" (no "rotación alta/media/baja"), "Tarjeta" (no débito/crédito).
- Preguntas en vez de etiquetas en formularios ("¿A cuánto lo vendes?", "¿Cuántos tienes?").
- Toda acción peligrosa pide confirmación; borrar todo exige escribir BORRAR.
- Debe verse bien a **375 px** y con **letra grande** (`html.text-grande`, Más → Cómo se ve).

## Comandos

```bash
npm run dev       # http://localhost:5173
npm test          # 49 tests (incluye SQL real en PGlite, sin Docker)
npm run build     # tsc -b + vite build (+ service worker PWA)
npm run deploy    # build + publica dist/ en la rama gh-pages
```

Flujo al terminar cambios: `npx tsc -b` → `npm test` → probar en el navegador (celular 375 px y
computador) → commit → `git push` → `npm run deploy` → abrir el link público y verificar.

## Arquitectura

React 19 + Vite 8 + TypeScript 7 (estricto) + Tailwind v4 (tokens de color en `src/index.css`,
modo oscuro con clase `.dark`). Navegación por hash (`src/hooks/useHashRoute.ts`), pantallas en
`src/pages/` cargadas con `React.lazy`. Sin backend propio: todo corre en el navegador.

- `src/store/reducer.ts` — **única** forma de cambiar datos. Cada acción describe lo que PASÓ
  (`registerSale`, `adjustStock`…), nunca el resultado. Es idempotente (aplicar dos veces no descuenta doble).
- `src/store/AppStore.tsx` — dos modos: **local** (IndexedDB, `src/lib/storage.ts`) o **cuenta**
  (Supabase vía el motor de sync). Las pantallas usan `useData / useActions / useCloud` y no saben en qué modo están.
- `src/lib/sync/engine.ts` — "primero local": `pantalla = base del servidor + cola pendiente`.
  Las acciones se guardan en una cola en IndexedDB y se envían a `apply_ops`; luego `pull_changes`.
- `supabase/schema.sql` — tablas con RLS por `owner_id = auth.uid()`, `apply_ops` (idempotente por `opId`,
  una op con error no bloquea la cola) y `pull_changes` (incremental por `updated_at`, borrado suave).
- `src/lib/auth.ts` — clave de la caja por dispositivo: PBKDF2-SHA256 (210k iteraciones, sal aleatoria),
  sin clave por defecto (asistente `pages/Setup.tsx`), bloqueo creciente 30 s / 2 min / 10 min.

## Reglas que no se deben romper

1. **Nunca enviar el stock como número absoluto** entre dispositivos. Solo operaciones ("se vendieron 2").
   La única excepción es cuando el usuario escribe la cantidad a mano (`adjustStock` modo `set`, o
   `updateProduct` con `stock` SOLO si el campo cambió — ver `ProductForm`).
2. **El reducer y `apply_ops` deben hacer lo mismo** (mismos redondeos: unidades enteras, kg a 3 decimales;
   mismo tope en 0 salvo `allowNegativeStock`). Si cambias uno, cambia el otro y agrega un test en
   `src/lib/sync/sync.test.ts` (corre el SQL real).
3. Toda acción nueva que modifique datos: agregarla al tipo `Action` del reducer, a `apply_ops` y a los tests.
4. En Supabase va solo la **publishable key** (`VITE_SUPABASE_PUBLISHABLE_KEY`); la seguridad la da RLS.
   Jamás la secret key en el front.
5. Crear/restablecer la clave de la caja con una cuenta abierta exige re-ingresar la contraseña de la cuenta
   (si no, cualquiera con el equipo podría entrar a los datos de la nube). "Borrar todo" cierra la cuenta en el equipo.
6. Todo el texto de la UI y los comentarios van en español de Chile, en palabras simples.

## Tests (`npm test`)

- `src/lib/logic.test.ts` — categorías automáticas, stock crítico, reducer, caja, importación Excel.
- `src/lib/excel-io.test.ts` — archivos reales con SheetJS (CSV UTF-8 y Windows-1252 con `;`, xlsx ida y vuelta).
- `src/lib/sync/sync.test.ts` — motor de sync contra PostgreSQL real (PGlite) con el mismo `schema.sql`.
- `src/lib/ean13.test.ts` — códigos de barra comparados con JsBarcode (solo dev).
- `src/lib/auth.test.ts` — clave, migración de la huella antigua y bloqueo.

## Detalles que ya costaron tiempo

- Tailwind v4: hijos de `.grid` tienen `min-width: 0` global (si no, tablas/gráficos estiran la página en celular).
- `max-width` no funciona en celdas `<td>`: limitar un `<div>` interno.
- En el panel del navegador, medir el ancho recargando cada ruta (el viewport emulado no se achica al navegar)
  y las capturas a veces salen a medio pintar: confirmar con `getComputedStyle`.
- CSV de Excel en Chile: leer como texto (UTF-8 o Windows-1252) con `raw: true`, o "1.350" se lee como 1,35.
- GitHub Pages sin Actions (el token de `gh` no tiene scope `workflow`): se publica con `npm run deploy`.
