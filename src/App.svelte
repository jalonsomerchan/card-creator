<script lang="ts">
  import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'

  type CardStyle = 'fantasy' | 'minimal' | 'classic' | 'prototype'
  type PageSize = 'a4' | 'letter'
  type ImageMode = 'none' | 'top' | 'full'

  type DeckSettings = {
    name: string
    description: string
    layout: {
      cardWidth: number
      cardHeight: number
      pageSize: PageSize
      orientation: 'portrait' | 'landscape'
      margin: number
      gap: number
      bleed: number
      showCutLines: boolean
      showCardBacks: boolean
      style: CardStyle
      imageMode: ImageMode
      showCorners: boolean
      showStats: boolean
      showDescription: boolean
      roundedCorners: number
      backgroundColor: string
      borderColor: string
      textColor: string
      accentColor: string
    }
    cards: Card[]
  }

  type Card = {
    id: string
    title: string
    subtitle: string
    description: string
    quantity: number
    imageDataUrl: string
    cornerLabels: string[]
    stats: { label: string; value: string }[]
  }

  const STORAGE_KEY = 'card-creator-deck-v1'
  const MM_TO_PT = 2.8346456693

  const createId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  const createEmptyCard = (): Card => ({
    id: createId(),
    title: 'Nueva carta',
    subtitle: 'Tipo de carta',
    description: 'Describe aquí el efecto, reglas o historia de la carta.',
    quantity: 1,
    imageDataUrl: '',
    cornerLabels: ['1', '★', '', ''],
    stats: [
      { label: 'Ataque', value: '2' },
      { label: 'Defensa', value: '1' },
    ],
  })

  const defaultDeck: DeckSettings = {
    name: 'Mi mazo de juego',
    description: 'Crea cartas personalizadas, guarda el mazo en tu navegador y expórtalo a PDF para imprimir.',
    layout: {
      cardWidth: 63,
      cardHeight: 88,
      pageSize: 'a4',
      orientation: 'portrait',
      margin: 8,
      gap: 3,
      bleed: 0,
      showCutLines: true,
      showCardBacks: false,
      style: 'fantasy',
      imageMode: 'top',
      showCorners: true,
      showStats: true,
      showDescription: true,
      roundedCorners: 5,
      backgroundColor: '#ffffff',
      borderColor: '#1e293b',
      textColor: '#0f172a',
      accentColor: '#2563eb',
    },
    cards: [createEmptyCard()],
  }

  let deck: DeckSettings = structuredClone(defaultDeck)
  let selectedCardId = deck.cards[0]?.id ?? ''
  let statusMessage = ''
  let isGeneratingPdf = false
  let pdfUrl = ''

  $: selectedCard = deck.cards.find((card) => card.id === selectedCardId) ?? deck.cards[0]
  $: totalCards = deck.cards.reduce((total, card) => total + Math.max(1, Number(card.quantity) || 1), 0)
  $: pdfGrid = calculateGrid(deck)

  function loadSavedDeck() {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return

    try {
      const parsed = JSON.parse(saved) as DeckSettings
      deck = normalizeDeck(parsed)
      selectedCardId = deck.cards[0]?.id ?? ''
      statusMessage = 'Mazo recuperado del navegador.'
    } catch {
      statusMessage = 'No se pudo cargar el mazo guardado. Se ha usado una plantilla nueva.'
    }
  }

  function normalizeDeck(value: Partial<DeckSettings>): DeckSettings {
    const safeCards = Array.isArray(value.cards) && value.cards.length > 0 ? value.cards : [createEmptyCard()]

    return {
      ...structuredClone(defaultDeck),
      ...value,
      layout: {
        ...structuredClone(defaultDeck.layout),
        ...(value.layout ?? {}),
      },
      cards: safeCards.map((card) => ({
        ...createEmptyCard(),
        ...card,
        id: card.id || createId(),
        quantity: Math.max(1, Number(card.quantity) || 1),
        cornerLabels: Array.isArray(card.cornerLabels) ? [...card.cornerLabels, '', '', '', ''].slice(0, 4) : ['', '', '', ''],
        stats: Array.isArray(card.stats) ? card.stats : [],
      })),
    }
  }

  function saveDeck() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deck))
    statusMessage = 'Mazo guardado en este navegador.'
  }

  function resetDeck() {
    deck = structuredClone(defaultDeck)
    selectedCardId = deck.cards[0]?.id ?? ''
    localStorage.removeItem(STORAGE_KEY)
    statusMessage = 'Mazo reiniciado.'
  }

  function addCard() {
    const card = createEmptyCard()
    deck.cards = [...deck.cards, card]
    selectedCardId = card.id
    statusMessage = 'Carta añadida al mazo.'
  }

  function duplicateCard(card: Card) {
    const clone = { ...structuredClone(card), id: createId(), title: `${card.title} copia` }
    deck.cards = [...deck.cards, clone]
    selectedCardId = clone.id
    statusMessage = 'Carta duplicada.'
  }

  function removeCard(cardId: string) {
    if (deck.cards.length === 1) {
      statusMessage = 'El mazo debe tener al menos una carta.'
      return
    }
    deck.cards = deck.cards.filter((card) => card.id !== cardId)
    selectedCardId = deck.cards[0]?.id ?? ''
    statusMessage = 'Carta eliminada.'
  }

  function addStat(card: Card) {
    card.stats = [...card.stats, { label: 'Nueva', value: '1' }]
    deck.cards = [...deck.cards]
  }

  function removeStat(card: Card, index: number) {
    card.stats = card.stats.filter((_, currentIndex) => currentIndex !== index)
    deck.cards = [...deck.cards]
  }

  async function handleImageUpload(event: Event, card: Card) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      statusMessage = 'El archivo elegido no es una imagen.'
      return
    }

    card.imageDataUrl = await readFileAsDataUrl(file)
    deck.cards = [...deck.cards]
    statusMessage = 'Imagen añadida a la carta.'
  }

  function clearImage(card: Card) {
    card.imageDataUrl = ''
    deck.cards = [...deck.cards]
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
      reader.readAsDataURL(file)
    })
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    downloadUrl(url, `${slugify(deck.name)}.json`)
    URL.revokeObjectURL(url)
    statusMessage = 'JSON exportado.'
  }

  async function importJson(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      deck = normalizeDeck(JSON.parse(text))
      selectedCardId = deck.cards[0]?.id ?? ''
      statusMessage = 'Mazo importado correctamente.'
    } catch {
      statusMessage = 'No se pudo importar el JSON. Revisa que sea un archivo válido.'
    } finally {
      input.value = ''
    }
  }

  function calculateGrid(currentDeck: DeckSettings) {
    const [pageWidth, pageHeight] = getPageSize(currentDeck.layout.pageSize, currentDeck.layout.orientation)
    const cardWidth = (currentDeck.layout.cardWidth + currentDeck.layout.bleed * 2) * MM_TO_PT
    const cardHeight = (currentDeck.layout.cardHeight + currentDeck.layout.bleed * 2) * MM_TO_PT
    const margin = currentDeck.layout.margin * MM_TO_PT
    const gap = currentDeck.layout.gap * MM_TO_PT
    const columns = Math.max(1, Math.floor((pageWidth - margin * 2 + gap) / (cardWidth + gap)))
    const rows = Math.max(1, Math.floor((pageHeight - margin * 2 + gap) / (cardHeight + gap)))

    return { columns, rows, perPage: columns * rows }
  }

  function getPageSize(size: PageSize, orientation: 'portrait' | 'landscape') {
    const sizes: Record<PageSize, [number, number]> = {
      a4: [595.28, 841.89],
      letter: [612, 792],
    }
    const [width, height] = sizes[size]
    return orientation === 'landscape' ? [height, width] : [width, height]
  }

  function expandedCards() {
    return deck.cards.flatMap((card) => Array.from({ length: Math.max(1, Number(card.quantity) || 1) }, () => card))
  }

  async function generatePdf() {
    isGeneratingPdf = true
    statusMessage = 'Generando PDF...'

    try {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      const pdfDoc = await PDFDocument.create()
      const [pageWidth, pageHeight] = getPageSize(deck.layout.pageSize, deck.layout.orientation)
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      const cards = expandedCards()
      const cardWidth = deck.layout.cardWidth * MM_TO_PT
      const cardHeight = deck.layout.cardHeight * MM_TO_PT
      const margin = deck.layout.margin * MM_TO_PT
      const gap = deck.layout.gap * MM_TO_PT
      const { columns, rows, perPage } = calculateGrid(deck)

      for (let i = 0; i < cards.length; i += perPage) {
        const page = pdfDoc.addPage([pageWidth, pageHeight])
        const pageCards = cards.slice(i, i + perPage)

        pageCards.forEach((card, index) => {
          const column = index % columns
          const row = Math.floor(index / columns)
          const x = margin + column * (cardWidth + gap)
          const y = pageHeight - margin - cardHeight - row * (cardHeight + gap)
          drawCard(page, card, x, y, cardWidth, cardHeight, regularFont, boldFont)
          if (deck.layout.showCutLines) drawCutLines(page, x, y, cardWidth, cardHeight)
        })
      }

      if (deck.layout.showCardBacks) {
        for (let i = 0; i < cards.length; i += perPage) {
          const page = pdfDoc.addPage([pageWidth, pageHeight])
          cards.slice(i, i + perPage).forEach((_, index) => {
            const column = index % columns
            const row = Math.floor(index / columns)
            const x = margin + column * (cardWidth + gap)
            const y = pageHeight - margin - cardHeight - row * (cardHeight + gap)
            drawCardBack(page, x, y, cardWidth, cardHeight, boldFont)
            if (deck.layout.showCutLines) drawCutLines(page, x, y, cardWidth, cardHeight)
          })
        }
      }

      const bytes = await pdfDoc.save()
      const blob = new Blob([bytes], { type: 'application/pdf' })
      pdfUrl = URL.createObjectURL(blob)
      downloadUrl(pdfUrl, `${slugify(deck.name)}.pdf`)
      statusMessage = 'PDF generado y listo para descargar.'
    } catch (error) {
      console.error(error)
      statusMessage = 'No se pudo generar el PDF. Revisa los datos del mazo.'
    } finally {
      isGeneratingPdf = false
    }
  }

  function drawCard(page: PDFPage, card: Card, x: number, y: number, width: number, height: number, regularFont: any, boldFont: any) {
    const background = hexToRgb(deck.layout.backgroundColor)
    const border = hexToRgb(deck.layout.borderColor)
    const text = hexToRgb(deck.layout.textColor)
    const accent = hexToRgb(deck.layout.accentColor)
    const pad = Math.min(width, height) * 0.07

    page.drawRectangle({ x, y, width, height, color: rgb(background.r, background.g, background.b), borderColor: rgb(border.r, border.g, border.b), borderWidth: 1.3 })

    if (deck.layout.style === 'fantasy') {
      page.drawRectangle({ x: x + pad * 0.45, y: y + pad * 0.45, width: width - pad * 0.9, height: height - pad * 0.9, borderColor: rgb(accent.r, accent.g, accent.b), borderWidth: 0.7 })
    }

    if (card.imageDataUrl && deck.layout.imageMode !== 'none') {
      const imageHeight = deck.layout.imageMode === 'full' ? height - pad * 2 : height * 0.38
      page.drawRectangle({ x: x + pad, y: y + height - pad - imageHeight, width: width - pad * 2, height: imageHeight, color: rgb(accent.r, accent.g, accent.b), opacity: 0.08 })
      page.drawText('Imagen', { x: x + pad * 1.4, y: y + height - pad - imageHeight / 2, size: 8, font: regularFont, color: rgb(accent.r, accent.g, accent.b) })
    }

    const titleY = deck.layout.imageMode === 'full' ? y + height * 0.78 : y + height * 0.55
    page.drawText(safeText(card.title, 24), { x: x + pad, y: titleY, size: 11, font: boldFont, color: rgb(text.r, text.g, text.b), maxWidth: width - pad * 2 })

    if (card.subtitle) {
      page.drawText(safeText(card.subtitle, 32), { x: x + pad, y: titleY - 12, size: 7, font: regularFont, color: rgb(accent.r, accent.g, accent.b), maxWidth: width - pad * 2 })
    }

    if (deck.layout.showDescription && card.description) {
      const lines = wrapText(card.description, 35, 5)
      lines.forEach((line, index) => {
        page.drawText(line, { x: x + pad, y: y + height * 0.2 - index * 9, size: 7, font: regularFont, color: rgb(text.r, text.g, text.b), maxWidth: width - pad * 2 })
      })
    }

    if (deck.layout.showStats && card.stats.length) {
      const statY = y + pad
      const statWidth = (width - pad * 2) / Math.min(card.stats.length, 3)
      card.stats.slice(0, 3).forEach((stat, index) => {
        page.drawText(`${safeText(stat.label, 8)} ${safeText(stat.value, 5)}`, { x: x + pad + statWidth * index, y: statY, size: 6.5, font: boldFont, color: rgb(accent.r, accent.g, accent.b), maxWidth: statWidth - 2 })
      })
    }

    if (deck.layout.showCorners) {
      drawCornerLabels(page, card, x, y, width, height, boldFont, text, accent)
    }
  }

  function drawCornerLabels(page: PDFPage, card: Card, x: number, y: number, width: number, height: number, font: any, text: { r: number; g: number; b: number }, accent: { r: number; g: number; b: number }) {
    const labels = card.cornerLabels.map((label) => safeText(label, 3))
    const size = Math.min(width, height) * 0.14
    const positions = [
      [x + 5, y + height - size - 5],
      [x + width - size - 5, y + height - size - 5],
      [x + 5, y + 5],
      [x + width - size - 5, y + 5],
    ]

    labels.forEach((label, index) => {
      if (!label) return
      const [labelX, labelY] = positions[index]
      page.drawRectangle({ x: labelX, y: labelY, width: size, height: size, color: rgb(accent.r, accent.g, accent.b), opacity: 0.12, borderColor: rgb(accent.r, accent.g, accent.b), borderWidth: 0.5 })
      page.drawText(label, { x: labelX + 3, y: labelY + size * 0.32, size: 8, font, color: rgb(text.r, text.g, text.b), maxWidth: size - 6 })
    })
  }

  function drawCardBack(page: PDFPage, x: number, y: number, width: number, height: number, font: any) {
    const accent = hexToRgb(deck.layout.accentColor)
    const border = hexToRgb(deck.layout.borderColor)
    page.drawRectangle({ x, y, width, height, color: rgb(accent.r, accent.g, accent.b), opacity: 0.12, borderColor: rgb(border.r, border.g, border.b), borderWidth: 1.2 })
    page.drawText(safeText(deck.name, 24), { x: x + width * 0.12, y: y + height * 0.48, size: 13, font, color: rgb(border.r, border.g, border.b), maxWidth: width * 0.76 })
  }

  function drawCutLines(page: PDFPage, x: number, y: number, width: number, height: number) {
    const color = rgb(0.55, 0.58, 0.64)
    const length = 8
    const thickness = 0.35
    const segments = [
      [x - length, y, x, y],
      [x, y - length, x, y],
      [x + width, y, x + width + length, y],
      [x + width, y - length, x + width, y],
      [x - length, y + height, x, y + height],
      [x, y + height, x, y + height + length],
      [x + width, y + height, x + width + length, y + height],
      [x + width, y + height, x + width, y + height + length],
    ]

    segments.forEach(([startX, startY, endX, endY]) => {
      page.drawLine({ start: { x: startX, y: startY }, end: { x: endX, y: endY }, thickness, color })
    })
  }

  function wrapText(text: string, maxChars: number, maxLines: number) {
    const words = text.replace(/\s+/g, ' ').trim().split(' ')
    const lines: string[] = []
    let current = ''

    words.forEach((word) => {
      const candidate = `${current} ${word}`.trim()
      if (candidate.length > maxChars && current) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    })

    if (current) lines.push(current)
    return lines.slice(0, maxLines)
  }

  function safeText(value: string, maxLength: number) {
    const clean = String(value ?? '').replace(/[\n\r]/g, ' ').trim()
    return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean
  }

  function hexToRgb(hex: string) {
    const normalized = hex.replace('#', '')
    const value = normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized
    const number = Number.parseInt(value || '000000', 16)
    return {
      r: ((number >> 16) & 255) / 255,
      g: ((number >> 8) & 255) / 255,
      b: (number & 255) / 255,
    }
  }

  function downloadUrl(url: string, filename: string) {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
  }

  function slugify(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'mazo-cartas'
  }

  loadSavedDeck()
</script>

<svelte:head>
  <title>Creador de cartas de juego para imprimir en PDF</title>
  <meta
    name="description"
    content="Diseña cartas de juego personalizadas, configura el mazo, guarda en localStorage, importa JSON y genera un PDF listo para imprimir."
  />
</svelte:head>

<a class="skip-link" href="#main">Saltar al contenido</a>

<header class="site-header">
  <nav class="container-wide header-nav" aria-label="Navegación principal">
    <a class="brand" href="/" aria-label="Card Creator inicio">
      <span class="brand-mark">CC</span>
      <span>Card Creator</span>
    </a>
    <div class="header-actions">
      <span class="badge">{totalCards} cartas impresas</span>
      <button class="btn btn-secondary" type="button" on:click={saveDeck}>Guardar</button>
      <button class="btn btn-primary" type="button" on:click={generatePdf} disabled={isGeneratingPdf}>
        {isGeneratingPdf ? 'Generando...' : 'Generar PDF'}
      </button>
    </div>
  </nav>
</header>

<main id="main">
  <section class="hero-section">
    <div class="container-wide hero-grid">
      <div class="hero-copy">
        <span class="eyebrow">Creador local para prototipos y juegos de mesa</span>
        <h1>Crea cartas de juego y exporta tu mazo a PDF</h1>
        <p>
          Configura tamaño, estilo, imágenes, esquinas, estadísticas y repeticiones. El mazo se guarda en tu navegador y también puedes moverlo con JSON.
        </p>
        <div class="hero-actions">
          <button class="btn btn-primary" type="button" on:click={addCard}>Añadir carta</button>
          <button class="btn btn-secondary" type="button" on:click={exportJson}>Exportar JSON</button>
          <label class="btn btn-ghost file-button">
            Importar JSON
            <input type="file" accept="application/json,.json" on:change={importJson} />
          </label>
        </div>
        {#if statusMessage}
          <p class="status" role="status">{statusMessage}</p>
        {/if}
      </div>
      <div class="hero-card" aria-label="Resumen del PDF">
        <strong>{deck.name}</strong>
        <span>{deck.layout.cardWidth} × {deck.layout.cardHeight} mm</span>
        <span>{pdfGrid.columns} × {pdfGrid.rows} cartas por página</span>
        <span>{deck.layout.pageSize.toUpperCase()} {deck.layout.orientation === 'portrait' ? 'vertical' : 'horizontal'}</span>
      </div>
    </div>
  </section>

  <section class="container-wide workspace" aria-label="Editor de cartas">
    <aside class="panel deck-panel">
      <div class="panel-header">
        <div>
          <p class="section-kicker">Mazo</p>
          <h2>Configuración</h2>
        </div>
        <button class="btn btn-ghost compact" type="button" on:click={resetDeck}>Reiniciar</button>
      </div>

      <div class="form-grid">
        <label>
          <span class="label">Nombre del mazo</span>
          <input class="input" bind:value={deck.name} />
        </label>
        <label>
          <span class="label">Descripción</span>
          <textarea class="textarea" rows="3" bind:value={deck.description}></textarea>
        </label>
      </div>

      <details class="settings-group" open>
        <summary>Tamaño y PDF</summary>
        <div class="form-grid two-cols">
          <label>
            <span class="label">Ancho carta (mm)</span>
            <input class="input" type="number" min="30" max="160" bind:value={deck.layout.cardWidth} />
          </label>
          <label>
            <span class="label">Alto carta (mm)</span>
            <input class="input" type="number" min="30" max="220" bind:value={deck.layout.cardHeight} />
          </label>
          <label>
            <span class="label">Página</span>
            <select class="select" bind:value={deck.layout.pageSize}>
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
            </select>
          </label>
          <label>
            <span class="label">Orientación</span>
            <select class="select" bind:value={deck.layout.orientation}>
              <option value="portrait">Vertical</option>
              <option value="landscape">Horizontal</option>
            </select>
          </label>
          <label>
            <span class="label">Margen (mm)</span>
            <input class="input" type="number" min="0" max="30" bind:value={deck.layout.margin} />
          </label>
          <label>
            <span class="label">Separación (mm)</span>
            <input class="input" type="number" min="0" max="20" bind:value={deck.layout.gap} />
          </label>
        </div>
        <div class="option-stack">
          <label class="check-row"><input type="checkbox" bind:checked={deck.layout.showCutLines} /> Líneas de corte</label>
          <label class="check-row"><input type="checkbox" bind:checked={deck.layout.showCardBacks} /> Añadir reversos al PDF</label>
        </div>
      </details>

      <details class="settings-group" open>
        <summary>Diseño de carta</summary>
        <div class="form-grid two-cols">
          <label>
            <span class="label">Estilo</span>
            <select class="select" bind:value={deck.layout.style}>
              <option value="fantasy">Fantasía</option>
              <option value="minimal">Minimalista</option>
              <option value="classic">Clásico</option>
              <option value="prototype">Prototipo</option>
            </select>
          </label>
          <label>
            <span class="label">Imagen</span>
            <select class="select" bind:value={deck.layout.imageMode}>
              <option value="top">Zona superior</option>
              <option value="full">Fondo completo</option>
              <option value="none">Sin imagen</option>
            </select>
          </label>
          <label>
            <span class="label">Fondo</span>
            <input class="input color-input" type="color" bind:value={deck.layout.backgroundColor} />
          </label>
          <label>
            <span class="label">Texto</span>
            <input class="input color-input" type="color" bind:value={deck.layout.textColor} />
          </label>
          <label>
            <span class="label">Borde</span>
            <input class="input color-input" type="color" bind:value={deck.layout.borderColor} />
          </label>
          <label>
            <span class="label">Acento</span>
            <input class="input color-input" type="color" bind:value={deck.layout.accentColor} />
          </label>
        </div>
        <div class="option-stack">
          <label class="check-row"><input type="checkbox" bind:checked={deck.layout.showCorners} /> Características en esquinas</label>
          <label class="check-row"><input type="checkbox" bind:checked={deck.layout.showStats} /> Estadísticas inferiores</label>
          <label class="check-row"><input type="checkbox" bind:checked={deck.layout.showDescription} /> Texto descriptivo</label>
        </div>
      </details>
    </aside>

    <section class="panel cards-panel">
      <div class="panel-header">
        <div>
          <p class="section-kicker">Cartas</p>
          <h2>Contenido del mazo</h2>
        </div>
        <button class="btn btn-primary compact" type="button" on:click={addCard}>Añadir carta</button>
      </div>

      <div class="cards-list" aria-label="Listado de cartas">
        {#each deck.cards as card}
          <button
            class:selected={selectedCardId === card.id}
            class="card-list-item"
            type="button"
            on:click={() => (selectedCardId = card.id)}
          >
            <span>{card.title || 'Carta sin título'}</span>
            <small>×{card.quantity}</small>
          </button>
        {/each}
      </div>

      {#if selectedCard}
        <article class="editor-card">
          <div class="form-grid two-cols">
            <label>
              <span class="label">Título</span>
              <input class="input" bind:value={selectedCard.title} />
            </label>
            <label>
              <span class="label">Tipo o subtítulo</span>
              <input class="input" bind:value={selectedCard.subtitle} />
            </label>
            <label>
              <span class="label">Veces en el mazo</span>
              <input class="input" type="number" min="1" max="99" bind:value={selectedCard.quantity} />
            </label>
            <label>
              <span class="label">Imagen</span>
              <input class="input" type="file" accept="image/*" on:change={(event) => handleImageUpload(event, selectedCard)} />
            </label>
          </div>

          <label>
            <span class="label">Descripción / reglas</span>
            <textarea class="textarea" rows="4" bind:value={selectedCard.description}></textarea>
          </label>

          <div class="subsection">
            <div class="subsection-header">
              <h3>Esquinas</h3>
              <span class="help-text">Valores cortos: coste, rareza, puntos, iconos...</span>
            </div>
            <div class="corner-grid">
              {#each selectedCard.cornerLabels as label, index}
                <label>
                  <span class="label">Esquina {index + 1}</span>
                  <input class="input" maxlength="4" bind:value={selectedCard.cornerLabels[index]} />
                </label>
              {/each}
            </div>
          </div>

          <div class="subsection">
            <div class="subsection-header">
              <h3>Estadísticas</h3>
              <button class="btn btn-secondary compact" type="button" on:click={() => addStat(selectedCard)}>Añadir stat</button>
            </div>
            <div class="stats-editor">
              {#each selectedCard.stats as stat, index}
                <div class="stat-row">
                  <input class="input" aria-label="Nombre de estadística" bind:value={stat.label} />
                  <input class="input" aria-label="Valor de estadística" bind:value={stat.value} />
                  <button class="btn btn-ghost compact" type="button" on:click={() => removeStat(selectedCard, index)}>Quitar</button>
                </div>
              {/each}
            </div>
          </div>

          <div class="editor-actions">
            {#if selectedCard.imageDataUrl}
              <button class="btn btn-secondary" type="button" on:click={() => clearImage(selectedCard)}>Quitar imagen</button>
            {/if}
            <button class="btn btn-secondary" type="button" on:click={() => duplicateCard(selectedCard)}>Duplicar carta</button>
            <button class="btn btn-danger" type="button" on:click={() => removeCard(selectedCard.id)}>Eliminar carta</button>
          </div>
        </article>
      {/if}
    </section>

    <aside class="panel preview-panel">
      <div class="panel-header">
        <div>
          <p class="section-kicker">Vista previa</p>
          <h2>Cómo quedará</h2>
        </div>
      </div>

      {#if selectedCard}
        <div class="print-card-wrap">
          <div
            class:style-fantasy={deck.layout.style === 'fantasy'}
            class:style-classic={deck.layout.style === 'classic'}
            class:style-prototype={deck.layout.style === 'prototype'}
            class="print-card"
            style={`aspect-ratio: ${deck.layout.cardWidth} / ${deck.layout.cardHeight}; background: ${deck.layout.backgroundColor}; color: ${deck.layout.textColor}; border-color: ${deck.layout.borderColor}; --accent-card: ${deck.layout.accentColor};`}
          >
            {#if deck.layout.showCorners}
              <div class="corner corner-tl">{selectedCard.cornerLabels[0]}</div>
              <div class="corner corner-tr">{selectedCard.cornerLabels[1]}</div>
              <div class="corner corner-bl">{selectedCard.cornerLabels[2]}</div>
              <div class="corner corner-br">{selectedCard.cornerLabels[3]}</div>
            {/if}

            {#if selectedCard.imageDataUrl && deck.layout.imageMode !== 'none'}
              <div class:full-image={deck.layout.imageMode === 'full'} class="card-image">
                <img src={selectedCard.imageDataUrl} alt={`Imagen de ${selectedCard.title}`} />
              </div>
            {:else if deck.layout.imageMode !== 'none'}
              <div class="card-image placeholder">Imagen</div>
            {/if}

            <div class="card-content">
              <p class="card-subtitle">{selectedCard.subtitle}</p>
              <h3>{selectedCard.title}</h3>
              {#if deck.layout.showDescription}
                <p>{selectedCard.description}</p>
              {/if}
            </div>

            {#if deck.layout.showStats && selectedCard.stats.length}
              <div class="card-stats">
                {#each selectedCard.stats as stat}
                  <span><strong>{stat.value}</strong> {stat.label}</span>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <div class="pdf-summary">
        <h3>Resumen de impresión</h3>
        <ul>
          <li>{totalCards} cartas totales contando repeticiones</li>
          <li>{pdfGrid.perPage} cartas por página ({pdfGrid.columns} columnas × {pdfGrid.rows} filas)</li>
          <li>{Math.ceil(totalCards / pdfGrid.perPage)} página(s) de anverso</li>
          {#if deck.layout.showCardBacks}<li>Se añadirán reversos imprimibles</li>{/if}
        </ul>
        {#if pdfUrl}
          <a class="btn btn-secondary" href={pdfUrl} download={`${slugify(deck.name)}.pdf`}>Descargar último PDF</a>
        {/if}
      </div>
    </aside>
  </section>

  <section class="container-wide info-grid" aria-label="Ayuda de uso">
    <article class="info-card">
      <h2>Cómo crear tu mazo</h2>
      <ol>
        <li>Configura tamaño, estilo y página del PDF.</li>
        <li>Añade cartas y define cuántas copias tendrá cada una.</li>
        <li>Guarda en localStorage o exporta el JSON para continuar después.</li>
        <li>Genera el PDF e imprímelo con líneas de corte.</li>
      </ol>
    </article>
    <article class="info-card">
      <h2>Privacidad y portabilidad</h2>
      <p>Las cartas se editan en el navegador. Las imágenes quedan dentro del JSON exportado y el PDF se genera localmente con pdf-lib.</p>
    </article>
  </section>
</main>

<footer class="site-footer">
  <div class="container-wide footer-inner">
    <p><strong>Card Creator</strong> · creador de cartas imprimibles para juegos de mesa y prototipos.</p>
    <p>Hecho con Svelte, Vite y pdf-lib.</p>
  </div>
</footer>
