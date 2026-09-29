import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

// localStorage de mentira (en Node no existe)
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

const support = await import('./support')

// Llaves de prueba creadas con el MISMO script que usa quien da soporte (en una carpeta temporal)
const dir = mkdtempSync(join(tmpdir(), 'mm-soporte-'))
const keyFile = join(dir, 'llave.json')
const env = { ...process.env, MM_SOPORTE_LLAVE: keyFile }
const script = (...args: string[]) => {
  const r = spawnSync(process.execPath, ['scripts/soporte.mjs', ...args, '--sin-env', '--sin-copiar'], { env, encoding: 'utf8' })
  expect(r.status, r.stderr).toBe(0)
  return r.stdout
}
script('llaves')
const publicKey = (JSON.parse(readFileSync(keyFile, 'utf8')) as { publica: string }).publica

afterAll(() => rmSync(dir, { recursive: true, force: true }))
beforeEach(() => store.clear())

describe('ayuda por WhatsApp (código de soporte)', () => {
  it('el link que crea el script permite crear una clave nueva, una sola vez', async () => {
    const { code } = support.startHelpRequest()
    const out = script(support.formatHelpCode(code)) // como lo escribiría el desarrollador: "4821 9375"
    expect(out).toContain(`#/soporte?r=${code}.`)
    expect(await support.redeemSupportToken(out, { publicKey })).toBe('ok')
    expect(await support.redeemSupportToken(out, { publicKey })).toBe('sin-pedido')
  })

  it('reutiliza el mismo código mientras no pase 1 hora', () => {
    const t = Date.now()
    const a = support.startHelpRequest(t)
    expect(support.startHelpRequest(t + 30 * 60_000).code).toBe(a.code)
    expect(support.startHelpRequest(t + support.HELP_VALID_MS).createdAt).toBe(t + support.HELP_VALID_MS)
  })

  it('rechaza links vencidos, de otro código o firmados con otra llave', async () => {
    const t = Date.now()
    const { code } = support.startHelpRequest(t)
    const out = script(code)
    expect(await support.redeemSupportToken(out, { publicKey, now: t + support.HELP_VALID_MS + 1 })).toBe('vencido')

    const old = support.startHelpRequest(t)
    const oldLink = script(old.code)
    support.cancelHelpRequest()
    const fresh = support.startHelpRequest(t)
    if (fresh.code !== old.code) expect(await support.redeemSupportToken(oldLink, { publicKey, now: t })).toBe('otro-pedido')

    // Firma de otra llave (alguien que no es el soporte)
    const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const fake = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, other.privateKey, new TextEncoder().encode(support.SUPPORT_PREFIX + fresh.code))
    const fakeLink = `#/soporte?r=${fresh.code}.${Buffer.from(fake).toString('base64url')}`
    expect(await support.redeemSupportToken(fakeLink, { publicKey, now: t })).toBe('no-valido')

    // La firma de un código no sirve para otro
    const sigOfOld = support.extractSupportToken(oldLink)!.sig
    expect(await support.redeemSupportToken(`${fresh.code}.${sigOfOld}`, { publicKey, now: t })).toBe('no-valido')

    // El pedido sigue vigente: el link correcto todavía funciona
    expect(await support.redeemSupportToken(script(fresh.code), { publicKey, now: t })).toBe('ok')
  })

  it('encuentra el link dentro del mensaje completo de WhatsApp', () => {
    const sig = 'A'.repeat(86)
    expect(support.extractSupportToken(`Hola, toca este link:\nhttps://x.cl/#/soporte?r=12345678.${sig} gracias`)).toEqual({ code: '12345678', sig })
    expect(support.extractSupportToken('hola')).toBeNull()
    expect(support.helpMessage('48219375', 'Bazar Rosita')).toContain('4821 9375')
  })
})
