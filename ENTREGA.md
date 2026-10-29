# Lista para entregar la caja

Pasos cortos, en orden. El detalle técnico está en el [README](README.md).

## A. Una sola vez, antes del primer cliente

- [ ] *(Opcional)* **Netlify** (link gratis `caja-minimarket.netlify.app`): en la terminal, `npx -y netlify-cli login`,
      entrar con GitHub y tocar *Authorize*. Después Claude crea el sitio y lo publica. Mientras tanto el link
      oficial es el de GitHub Pages (el soporte y Supabase ya apuntan a ese). No cambiar de link con clientes ya
      instalados: sus datos del navegador no se pasan solos de un link al otro.
- [x] **Supabase** (cuentas y respaldo en línea): proyecto `caja-minimarket`, ya conectado.
- [x] **Supabase → Authentication → URL Configuration** (hecho el 2026-10-26): *Site URL* = GitHub Pages;
      *Redirect URLs* exactas: GitHub Pages y `http://localhost:5173/`. Si se publica en Netlify, agregar ese link.
- [x] **Contraseña mínima de 8** (hecho el 2026-10-26). *Leaked password protection* es solo del plan Pro: no se usa.
- [ ] **Correo propio en Supabase** (SMTP con Gmail y una contraseña de aplicación). **Obligatorio antes del
      primer cliente:** el correo gratis de Supabase solo llega a los correos del equipo del proyecto (el tuyo), así
      que al cliente NO le llegaría el correo para confirmar su cuenta (y sin confirmar no puede entrar) ni el de
      recuperar la contraseña.
- [ ] **Respaldo de tus llaves:** copia a un pendrive `C:\Users\Mati\.caja-minimarket\` y el archivo `.env`
      del proyecto. Sin la llave no puedes ayudar a recuperar claves.
- [ ] **Prueba con equipos de verdad:** un lector de códigos USB, un celular Android y, si puedes, un iPhone.

## B. Con cada cliente nuevo (la visita de instalación)

- [ ] Abrir el link oficial en su computador o celular.
- [ ] Que **él** cree su cuenta (su correo y su contraseña) y la anote en su cuaderno. Tú no guardes sus contraseñas.
- [ ] Que **él** cree la clave de la caja.
- [ ] Si el computador lo usan empleados o queda a la vista de clientes: que Windows tenga **usuario con
      contraseña** y se bloquee solo (Inicio → Configuración → Cuentas → Opciones de inicio de sesión).
      La clave de la caja tapa la pantalla, pero alguien que sepa de computación podría saltársela
      desde las herramientas del navegador si el equipo queda abierto.
- [ ] Al crear la cuenta, que abra el link de confirmación del correo **en ese mismo equipo** si puede.
      (Si lo abre en el celular igual queda activa: después entra con correo y contraseña en la caja.)
- [ ] Cargar sus productos: desde su Excel (Más → Excel y respaldo) o uno por uno.
- [ ] Instalar el ícono en su celular: menú del navegador → *Agregar a pantalla de inicio*.
- [ ] Practicar juntos: vender, "Llegó mercadería", "Anotar un gasto" y "Contar el cajón".
- [ ] Mostrarle **¿Olvidaste tu clave? → Pedir ayuda por WhatsApp** y **Más → Cómo se usa**.
- [ ] Dejar claro que **la caja no da boletas**: la boleta la sigue dando como siempre.

## C. Cuando un cliente te escribe

- **Olvidó la clave:** en la carpeta del proyecto, `npm run soporte -- 1234 5678` (su código).
  Confirma que te escribe desde su número de siempre y pega el mensaje que queda copiado.
- **Tiene una duda:** casi todo está en *Más → Cómo se usa*.

## D. Cuando cambias algo en la caja

`npm test` → `npm run test:e2e:build` (prueba la caja entera en Edge, como un cliente) →
`npm run deploy:netlify` (los clientes) y `npm run deploy` (tu demo en GitHub Pages).
Si cambiaste `supabase/schema.sql`, pídele a Claude que lo aplique en el proyecto `caja-minimarket`.
Los viernes, la rutina *"Salud de la Caja Minimarket"* deja en Obsidian cómo van las cuentas y si hay errores.
Los clientes ven el aviso *"Hay una versión nueva · Actualizar"*; nunca se recarga sola a mitad de una venta.
