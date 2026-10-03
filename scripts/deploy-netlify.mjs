// Publica dist/ en Netlify (dirección gratis: https://caja-minimarket.netlify.app).
// Uso: npm run deploy:netlify
// Primera vez en este computador: npx -y netlify-cli login  (abre el navegador para autorizar)
// y luego npx -y netlify-cli sites:create --name caja-minimarket  (crea el sitio y lo enlaza).
// Se compila aquí, con tu .env, para que el número y la llave de soporte nunca pasen por GitHub.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { checkEnvBeforeDeploy } from './revisar-env.mjs'

const run = (cmd) => execSync(cmd, { stdio: 'inherit' })

if (!existsSync('.netlify/state.json')) {
  console.error('\n✗ Este proyecto aún no está enlazado a un sitio de Netlify. Ver instrucciones al inicio de este archivo.\n')
  process.exit(1)
}
checkEnvBeforeDeploy()
run('npm run build')
run('npx -y netlify-cli deploy --prod --dir dist --no-build')
console.log('\nListo: https://caja-minimarket.netlify.app')
