import { normalizeText } from './utils'

export const DEFAULT_CATEGORIES = [
  'Abarrotes',
  'Bebidas',
  'Lácteos',
  'Snacks',
  'Panadería',
  'Fiambrería',
  'Frutas y Verduras',
  'Congelados',
  'Limpieza',
  'Higiene Personal',
  'Otros',
] as const

export const FALLBACK_CATEGORY = 'Otros'

/**
 * Palabras clave por categoría (en minúsculas y sin tildes).
 * - Se aceptan plurales automáticamente ("galleta" también encuentra "galletas").
 * - Terminar en "!" desactiva el plural ("papa!" no encuentra "papas", que son snacks).
 * - Las frases de varias palabras pesan más porque son más específicas.
 */
const KEYWORDS: Record<string, string[]> = {
  Bebidas: [
    'bebida', 'coca cola', 'coca', 'cola', 'pepsi', 'fanta', 'sprite', 'bilz', 'pap', 'kem', 'limon soda',
    'canada dry', 'ginger ale', 'agua', 'agua mineral', 'cachantun', 'benedictino', 'vital', 'jugo', 'nectar',
    'watts', 'andina', 'del valle', 'cerveza', 'cristal', 'escudo', 'becker', 'corona', 'vino', 'pisco',
    'ron', 'energetica', 'red bull', 'monster', 'score', 'te helado', 'gatorade', 'powerade', 'refresco',
  ],
  'Lácteos': [
    'leche', 'yogurt', 'yoghurt', 'yogur', 'mantequilla', 'margarina', 'crema', 'manjar', 'quesillo', 'queso',
    'queso crema', 'colun', 'soprole', 'loncoleche', 'surlat', 'nestle', 'leche cultivada', 'postre', 'flan',
  ],
  Snacks: [
    'snack', 'papas', 'papas fritas', 'lays', 'marco polo', 'ramitas', 'evercrisp', 'doritos', 'cheetos',
    'chips', 'galleta', 'triton', 'oreo', 'mckay', 'costa', 'chocolate', 'sahne nuss', 'super 8', 'sufle',
    'mani', 'golosina', 'caramelo', 'chicle', 'beldent', 'barra de cereal', 'gomita', 'alfajor', 'palomita',
    'cabritas', 'obleas', 'kuky', 'frac',
  ],
  'Panadería': [
    'pan', 'hallulla', 'marraqueta', 'dobladita', 'amasado', 'pan de molde', 'ideal', 'queque', 'kuchen',
    'empanada', 'pan integral', 'pan frica', 'colisa', 'berlin', 'croissant', 'tostada',
  ],
  'Fiambrería': [
    'jamon', 'salame', 'mortadela', 'laminado', 'vienesa', 'salchicha', 'longaniza', 'chorizo', 'pate',
    'queso gauda', 'gauda', 'queso mantecoso', 'mantecoso', 'pechuga de pavo', 'san jorge', 'llanquihue',
    'cecina', 'arrollado', 'prieta',
  ],
  'Frutas y Verduras': [
    'fruta', 'verdura', 'papa!', 'tomate', 'palta', 'hass', 'cebolla', 'limon', 'platano', 'manzana',
    'naranja', 'lechuga', 'zanahoria', 'zapallo', 'pepino', 'ajo', 'cilantro', 'perejil', 'choclo',
    'pimenton', 'uva', 'pera', 'frutilla', 'mandarina', 'kiwi', 'durazno', 'repollo', 'betarraga',
  ],
  Congelados: [
    'congelado', 'congelada', 'helado', 'savory', 'hamburguesa', 'nugget', 'prefritas', 'pizza', 'hielo', 'empanada congelada',
    'mariscos', 'pescado congelado', 'trululu', 'chomp',
  ],
  Abarrotes: [
    'arroz', 'tucapel', 'fideo', 'spaghetti', 'tallarin', 'carozzi', 'lucchetti', 'azucar', 'iansa', 'sal!',
    'lobos', 'aceite', 'harina', 'lenteja', 'poroto', 'garbanzo', 'arveja', 'atun', 'lomitos', 'van camps',
    'jurel', 'sardina', 'salsa de tomate', 'pomarola', 'salsa', 'mayonesa', 'hellmanns', 'ketchup', 'mostaza',
    'cafe', 'nescafe', 'te', 'supremo', 'hierbas', 'avena', 'quaker', 'sopa', 'maggi', 'caldo', 'levadura',
    'vinagre', 'conserva', 'mermelada', 'huevo', 'cereal', 'polvo de hornear', 'ramen', 'pure', 'condimento',
    'oregano', 'comino', 'merken', 'aji', 'chancaca', 'miel',
  ],
  Limpieza: [
    'detergente', 'omo', 'ariel', 'popeye', 'cloro', 'clorinda', 'lavaloza', 'quix', 'virginia', 'limpiador',
    'cif', 'poett', 'lysoform', 'desinfectante', 'suavizante', 'esponja', 'virutex', 'papel higienico',
    'confort', 'noble', 'elite', 'toalla de papel', 'nova', 'servilleta', 'bolsa de basura', 'lavalozas',
    'escoba', 'trapero', 'guante', 'insecticida', 'raid', 'cera',
  ],
  'Higiene Personal': [
    'shampoo', 'champu', 'acondicionador', 'sedal', 'jabon', 'protex', 'dove', 'pasta dental', 'colgate',
    'cepillo de dientes', 'cepillo dental', 'desodorante', 'rexona', 'axe', 'toalla higienica', 'panal',
    'afeitar', 'gillette', 'crema dental', 'algodon', 'cotonito', 'alcohol gel', 'preservativo',
  ],
}

interface CompiledKeyword {
  category: string
  weight: number
  re: RegExp
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Se compilan una sola vez al cargar el módulo
const COMPILED: CompiledKeyword[] = Object.entries(KEYWORDS).flatMap(([category, words]) =>
  words.map((raw) => {
    const exact = raw.endsWith('!')
    const kw = exact ? raw.slice(0, -1) : raw
    const plural = exact ? '' : '(?:s|es)?'
    return {
      category,
      weight: kw.split(' ').length,
      re: new RegExp(`(?:^| )${escapeRe(kw)}${plural}(?= |$)`),
    }
  }),
)

/** Deja solo letras/números separados por un espacio: "Coca-Cola 1.5L" → "coca cola 1 5l" */
function tokenize(name: string): string {
  return normalizeText(name).replace(/[^a-z0-9ñ]+/g, ' ').trim()
}

export interface CategoryGuess {
  category: string
  /** 0 = sin coincidencias (cae en "Otros") */
  score: number
}

/**
 * Adivina la categoría de un producto según palabras clave de su nombre.
 * Gana la categoría con más puntaje; si empatan, la que aparece primero en el
 * nombre (en español el sustantivo principal va al inicio: "Helado de chocolate").
 */
export function inferCategory(name: string): CategoryGuess {
  const text = tokenize(name)
  if (!text) return { category: FALLBACK_CATEGORY, score: 0 }

  const scores = new Map<string, { score: number; firstPos: number }>()
  for (const { category, weight, re } of COMPILED) {
    const m = re.exec(text)
    if (!m) continue
    const pos = m.index
    const prev = scores.get(category)
    if (prev) {
      prev.score += weight
      prev.firstPos = Math.min(prev.firstPos, pos)
    } else {
      scores.set(category, { score: weight, firstPos: pos })
    }
  }

  let best: CategoryGuess = { category: FALLBACK_CATEGORY, score: 0 }
  let bestPos = Infinity
  for (const [category, { score, firstPos }] of scores) {
    if (score > best.score || (score === best.score && firstPos < bestPos)) {
      best = { category, score }
      bestPos = firstPos
    }
  }
  return best
}

/**
 * Normaliza una categoría escrita a mano ("lacteos", "BEBIDAS") para que
 * coincida con una existente ("Lácteos", "Bebidas"). Si no existe, la deja
 * con la primera letra en mayúscula.
 */
export function matchCategory(input: string, known: readonly string[]): string {
  const clean = input.trim().replace(/\s+/g, ' ')
  if (!clean) return ''
  const key = normalizeText(clean)
  const found = known.find((c) => normalizeText(c) === key)
  if (found) return found
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

/** Categorías por defecto + las que el usuario haya creado */
export function allCategories(productCategories: Iterable<string>): string[] {
  const set = new Set<string>(DEFAULT_CATEGORIES)
  for (const c of productCategories) if (c) set.add(c)
  const list = [...set].filter((c) => c !== FALLBACK_CATEGORY).sort((a, b) => a.localeCompare(b, 'es'))
  return [...list, FALLBACK_CATEGORY]
}
