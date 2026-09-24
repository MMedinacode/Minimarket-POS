// Publica la carpeta dist/ en la rama gh-pages (GitHub Pages).
// Uso: npm run deploy   (compila y sube; tarda ~1 minuto en verse online)
import { execSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts })
const remote = execSync('git remote get-url origin').toString().trim()

run('npm run build')
if (!existsSync('dist/index.html')) throw new Error('No se generó dist/index.html')
// .nojekyll: GitHub Pages sirve los archivos tal cual, sin procesarlos
writeFileSync('dist/.nojekyll', '')

const git = (args) => run(`git ${args}`, { cwd: 'dist' })
git('init -q -b gh-pages')
git('add -A')
git('-c user.name="deploy" -c user.email="deploy@local" commit -q -m "Deploy"')
git(`push -f ${remote} gh-pages`)
console.log('\nListo: GitHub Pages se actualiza en 1-2 minutos.')
