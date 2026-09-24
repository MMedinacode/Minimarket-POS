// Pitidos cortos al escanear (como en el supermercado) usando Web Audio.
let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, ms: number, type: OscillatorType = 'square', when = 0) {
  const ac = audio()
  if (!ac) return
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t0 = ac.currentTime + when
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + ms / 1000 + 0.02)
}

export function beepOk() {
  tone(1760, 90)
  try {
    navigator.vibrate?.(40)
  } catch {
    /* sin vibración */
  }
}

export function beepError() {
  tone(220, 140, 'sawtooth')
  tone(180, 180, 'sawtooth', 0.15)
  try {
    navigator.vibrate?.([60, 40, 60])
  } catch {
    /* sin vibración */
  }
}

export function chaChing() {
  tone(1318, 80, 'triangle')
  tone(1760, 160, 'triangle', 0.09)
}
