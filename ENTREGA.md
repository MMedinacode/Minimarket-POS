# Lista para entregar la caja

Pasos cortos, en orden. El detalle técnico está en el [README](README.md).

## A. Una sola vez, antes del primer cliente

- [ ] **Netlify** (link gratis `caja-minimarket.netlify.app`): en la terminal, `npx -y netlify-cli login`,
      entrar con GitHub y tocar *Authorize*. Después Claude crea el sitio y lo publica.
- [ ] **Supabase** (cuentas y respaldo en línea): crear la cuenta y el proyecto (README, sección 3)
      y pasarle a Claude la *Project URL* y la *Publishable key*. **Nunca la secret key.**
- [ ] **Correo propio en Supabase** (SMTP con Gmail y una contraseña de aplicación). Sin esto, a los
      clientes no les llega el correo para recuperar la contraseña de su cuenta.
- [ ] **Respaldo de tus llaves:** copia a un pendrive `C:\Users\Mati\.caja-minimarket\` y el archivo `.env`
      del proyecto. Sin la llave no puedes ayudar a recuperar claves.
- [ ] **Prueba con equipos de verdad:** un lector de códigos USB, un celular Android y, si puedes, un iPhone.

## B. Con cada cliente nuevo (la visita de instalación)

- [ ] Abrir el link oficial en su computador o celular.
- [ ] Que **él** cree su cuenta (su correo y su contraseña) y la anote en su cuaderno. Tú no guardes sus contraseñas.
- [ ] Que **él** cree la clave de la caja.
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

`npm test` → `npm run deploy:netlify` (los clientes) y `npm run deploy` (tu demo en GitHub Pages).
Los clientes ven el aviso *"Hay una versión nueva · Actualizar"*; nunca se recarga sola a mitad de una venta.
