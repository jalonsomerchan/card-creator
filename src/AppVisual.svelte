<script lang="ts">
  import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'

  type PageSize = 'a4' | 'letter'
  type Orientation = 'portrait' | 'landscape'
  type CardStyle = 'fantasy' | 'minimal' | 'classic' | 'prototype'
  type ImageMode = 'none' | 'top' | 'full'

  type Stat = { label: string; value: string }
  type Card = {
    id: string
    title: string
    subtitle: string
    description: string
    quantity: number
    imageDataUrl: string
    cornerLabels: string[]
    stats: Stat[]
  }
  type Deck = {
    name: string
    description: string
    layout: {
      cardWidth: number
      cardHeight: number
      pageSize: PageSize
      orientation: Orientation
      margin: number
      gap: number
      showCutLines: boolean
      showCardBacks: boolean
      style: CardStyle
      imageMode: ImageMode
      showCorners: boolean
      showStats: boolean
      showDescription: boolean
      backgroundColor: string
      borderColor: string
      textColor: string
      accentColor: string
    }
    cards: Card[]
  }

  const STORAGE_KEY = 'card-creator-deck-v1'
  const MM_TO_PT = 2.8346456693

  const uid = () => crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const emptyCard = (): Card => ({
    id: uid(),
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

  const starterDeck = (): Deck => ({
    name: 'Mi mazo de juego',
    description: 'Crea cartas, ordénalas visualmente y exporta un PDF listo para imprimir.',
    layout: {
      cardWidth: 63,
      cardHeight: 88,
      pageSize: 'a4',
      orientation: 'portrait',
      margin: 8,
      gap: 3,
      showCutLines: true,
      showCardBacks: false,
      style: 'fantasy',
      imageMode: 'top',
      showCorners: true,
      showStats: true,
      showDescription: true,
      backgroundColor: '#ffffff',
      borderColor: '#1e293b',
      textColor: '#0f172a',
      accentColor: '#2563eb',
    },
    cards: [emptyCard()],
  })

  let deck = starterDeck()
  let selectedCardId = deck.cards[0].id
  let dragIndex: number | null = null
  let overIndex: number | null = null
  let statusMessage = ''
  let pdfUrl = ''
  let isGeneratingPdf = false

  $: selectedCard = deck.cards.find((card) => card.id === selectedCardId) ?? deck.cards[0]
  $: totalCards = deck.cards.reduce((sum, card) => sum + cleanQuantity(card.quantity), 0)
  $: grid = calculateGrid()
  $: pdfPages = Math.max(1, Math.ceil(totalCards / grid.perPage))

  function normalizeDeck(value: Partial<Deck>): Deck {
    const base = starterDeck()
    const cards = Array.isArray(value.cards) && value.cards.length ? value.cards : base.cards

    return {
      ...base,
      ...value,
      layout: { ...base.layout, ...(value.layout ?? {}) },
      cards: cards.map((card) => ({
        ...emptyCard(),
        ...card,
        id: card.id || uid(),
        quantity: cleanQuantity(card.quantity),
        cornerLabels: Array.isArray(card.cornerLabels) ? [...card.cornerLabels, '', '', '', ''].slice(0, 4) : ['', '', '', ''],
        stats: Array.isArray(card.stats) ? card.stats : [],
      })),
    }
  }

  function loadDeck() {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return
    try {
      deck = normalizeDeck(JSON.parse(stored))
      selectedCardId = deck.cards[0]?.id ?? ''
      statusMessage = 'Mazo recuperado del navegador.'
    } catch {
      statusMessage = 'No se pudo recuperar el mazo guardado.'
    }
  }

  function persist(message = 'Mazo guardado en este navegador.') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deck))
    statusMessage = message
  }

  function addCard() {
    const card = emptyCard()
    deck.cards = [...deck.cards, card]
    selectedCardId = card.id
    persist('Carta añadida.')
  }

  function duplicateCard(card: Card) {
    const copy = structuredClone(card)
    copy.id = uid()
    copy.title = `${card.title || 'Carta'} copia`
    deck.cards = [...deck.cards, copy]
    selectedCardId = copy.id
    persist('Carta duplicada.')
  }

  function removeCard(cardId: string) {
    if (deck.cards.length <= 1) {
      statusMessage = 'El mazo debe tener al menos una carta.'
      return
    }
    deck.cards = deck.cards.filter((card) => card.id !== cardId)
    selectedCardId = deck.cards[0]?.id ?? ''
    persist('Carta eliminada.')
  }

  function moveCard(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= deck.cards.length) return
    const cards = [...deck.cards]
    const [moved] = cards.splice(fromIndex, 1)
    cards.splice(toIndex, 0, moved)
    deck.cards = cards
    selectedCardId = moved.id
    persist('Orden del mazo actualizado.')
  }

  function handleDragStart(index: number, event: DragEvent) {
    dragIndex = index
    overIndex = index
    event.dataTransfer?.setData('text/plain', String(index))
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  function handleDrop(index: number, event: DragEvent) {
    event.preventDefault()
    const from = dragIndex ?? Number(event.dataTransfer?.getData('text/plain'))
    if (Number.isFinite(from)) moveCard(from, index)
    dragIndex = null
    overIndex = null
  }

  function addStat(card: Card) {
    card.stats = [...card.stats, { label: 'Nueva', value: '1' }]
    deck.cards = [...deck.cards]
    persist('Estadística añadida.')
  }

  function removeStat(card: Card, index: number) {
    card.stats = card.stats.filter((_, current) => current !== index)
    deck.cards = [...deck.cards]
    persist('Estadística eliminada.')
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
    input.value = ''
    persist('Imagen añadida a la carta.')
  }

  function clearImage(card: Card) {
    card.imageDataUrl = ''
    deck.cards = [...deck.cards]
    persist('Imagen eliminada.')
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
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
      deck = normalizeDeck(JSON.parse(await file.text()))
      selectedCardId = deck.cards[0]?.id ?? ''
      persist('Mazo importado correctamente.')
    } catch {
      statusMessage = 'No se pudo importar el JSON.'
    } finally {
      input.value = ''
    }
  }

  function resetDeck() {
    deck = starterDeck()
    selectedCardId = deck.cards[0].id
    localStorage.removeItem(STORAGE_KEY)
    statusMessage = 'Mazo reiniciado.'
  }

  function getPageSize(): [number, number] {
    const size = deck.layout.pageSize === 'letter' ? [612, 792] : [595.28, 841.89]
    return deck.layout.orientation === 'landscape' ? [size[1], size[0]] : [size[0], size[1]]
  }

  function calculateGrid() {
    const [pageWidth, pageHeight] = getPageSize()
    const cardWidth = deck.layout.cardWidth * MM_TO_PT
    const cardHeight = deck.layout.cardHeight * MM_TO_PT
    const margin = deck.layout.margin * MM_TO_PT
    const gap = deck.layout.gap * MM_TO_PT
    const columns = Math.max(1, Math.floor((pageWidth - margin * 2 + gap) / (cardWidth + gap)))
    const rows = Math.max(1, Math.floor((pageHeight - margin * 2 + gap) / (cardHeight + gap)))
    return { columns, rows, perPage: columns * rows }
  }

  function expandedCards() {
    return deck.cards.flatMap((card) => Array.from({ length: cleanQuantity(card.quantity) }, () => card))
  }

  async function generatePdf() {
    isGeneratingPdf = true
    statusMessage = 'Generando PDF...'
    try {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      const pdfDoc = await PDFDocument.create()
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      const [pageWidth, pageHeight] = getPageSize()
      const cardWidth = deck.layout.cardWidth * MM_TO_PT
      const cardHeight = deck.layout.cardHeight * MM_TO_PT
      const margin = deck.layout.margin * MM_TO_PT
      const gap = deck.layout.gap * MM_TO_PT
      const cards = expandedCards()
      const imageCache = new Map<string, any>()

      for (const card of deck.cards) {
        if (card.imageDataUrl) imageCache.set(card.id, await embedImage(pdfDoc, card.imageDataUrl))
      }

      for (let i = 0; i < cards.length; i += grid.perPage) {
        const page = pdfDoc.addPage([pageWidth, pageHeight])
        const pageCards = cards.slice(i, i + grid.perPage)
        for (const [index, card] of pageCards.entries()) {
          const column = index % grid.columns
          const row = Math.floor(index / grid.columns)
          const x = margin + column * (cardWidth + gap)
          const y = pageHeight - margin - cardHeight - row * (cardHeight + gap)
          drawPdfCard(page, card, x, y, cardWidth, cardHeight, regularFont, boldFont, imageCache.get(card.id))
          if (deck.layout.showCutLines) drawCutLines(page, x, y, cardWidth, cardHeight)
        }
      }

      if (deck.layout.showCardBacks) {
        for (let i = 0; i < cards.length; i += grid.perPage) {
          const page = pdfDoc.addPage([pageWidth, pageHeight])
          cards.slice(i, i + grid.perPage).forEach((_, index) => {
            const column = index % grid.columns
            const row = Math.floor(index / grid.columns)
            const x = margin + column * (cardWidth + gap)
            const y = pageHeight - margin - cardHeight - row * (cardHeight + gap)
            drawPdfBack(page, x, y, cardWidth, cardHeight, boldFont)
          })
        }
      }

      const bytes = await pdfDoc.save()
      const blob = new Blob([bytes], { type: 'application/pdf' })
      pdfUrl = URL.createObjectURL(blob)
      downloadUrl(pdfUrl, `${slugify(deck.name)}.pdf`)
      statusMessage = 'PDF generado y descargado.'
    } catch (error) {
      console.error(error)
      statusMessage = 'No se pudo generar el PDF.'
    } finally {
      isGeneratingPdf = false
    }
  }

  async function embedImage(pdfDoc: PDFDocument, dataUrl: string) {
    const [meta, data] = dataUrl.split(',')
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
    if (meta.includes('image/png')) return pdfDoc.embedPng(bytes)
    return pdfDoc.embedJpg(bytes)
  }

  function drawPdfCard(page: PDFPage, card: Card, x: number, y: number, width: number, height: number, regularFont: any, boldFont: any, image: any) {
    const bg = hexToRgb(deck.layout.backgroundColor)
    const border = hexToRgb(deck.layout.borderColor)
    const text = hexToRgb(deck.layout.textColor)
    const accent = hexToRgb(deck.layout.accentColor)
    const pad = Math.min(width, height) * 0.07
    const imageHeight = deck.layout.imageMode === 'full' ? height - pad * 2 : height * 0.38
    const imageY = y + height - pad - imageHeight

    page.drawRectangle({ x, y, width, height, color: rgb(bg.r, bg.g, bg.b), borderColor: rgb(border.r, border.g, border.b), borderWidth: 1.2 })
    if (deck.layout.style === 'fantasy') page.drawRectangle({ x: x + pad * 0.45, y: y + pad * 0.45, width: width - pad * 0.9, height: height - pad * 0.9, borderColor: rgb(accent.r, accent.g, accent.b), borderWidth: 0.7 })

    if (image && deck.layout.imageMode !== 'none') {
      const dims = fitContain(image.width, image.height, width - pad * 2, imageHeight)
      page.drawImage(image, { x: x + pad + dims.x, y: imageY + dims.y, width: dims.width, height: dims.height, opacity: deck.layout.imageMode === 'full' ? 0.28 : 1 })
    } else if (deck.layout.imageMode !== 'none') {
      page.drawRectangle({ x: x + pad, y: imageY, width: width - pad * 2, height: imageHeight, color: rgb(accent.r, accent.g, accent.b), opacity: 0.08 })
    }

    const titleY = deck.layout.imageMode === 'full' ? y + height * 0.75 : y + height * 0.54
    page.drawText(safeText(card.title, 24), { x: x + pad, y: titleY, size: 11, font: boldFont, color: rgb(text.r, text.g, text.b), maxWidth: width - pad * 2 })
    if (card.subtitle) page.drawText(safeText(card.subtitle, 32), { x: x + pad, y: titleY - 12, size: 7, font: regularFont, color: rgb(accent.r, accent.g, accent.b), maxWidth: width - pad * 2 })

    if (deck.layout.showDescription) {
      wrapText(card.description, 35, 5).forEach((line, index) => page.drawText(line, { x: x + pad, y: y + height * 0.2 - index * 9, size: 7, font: regularFont, color: rgb(text.r, text.g, text.b), maxWidth: width - pad * 2 }))
    }

    if (deck.layout.showStats) {
      card.stats.slice(0, 3).forEach((stat, index) => page.drawText(`${safeText(stat.label, 8)} ${safeText(stat.value, 5)}`, { x: x + pad + index * ((width - pad * 2) / 3), y: y + pad, size: 6.5, font: boldFont, color: rgb(accent.r, accent.g, accent.b), maxWidth: (width - pad * 2) / 3 - 2 }))
    }

    if (deck.layout.showCorners) drawPdfCorners(page, card, x, y, width, height, boldFont, text, accent)
  }

  function drawPdfCorners(page: PDFPage, card: Card, x: number, y: number, width: number, height: number, font: any, text: { r: number; g: number; b: number }, accent: { r: number; g: number; b: number }) {
    const size = Math.min(width, height) * 0.14
    const positions = [[x + 5, y + height - size - 5], [x + width - size - 5, y + height - size - 5], [x + 5, y + 5], [x + width - size - 5, y + 5]]
    card.cornerLabels.forEach((label, index) => {
      if (!label) return
      const [labelX, labelY] = positions[index]
      page.drawRectangle({ x: labelX, y: labelY, width: size, height: size, color: rgb(accent.r, accent.g, accent.b), opacity: 0.12, borderColor: rgb(accent.r, accent.g, accent.b), borderWidth: 0.5 })
      page.drawText(safeText(label, 3), { x: labelX + 3, y: labelY + size * 0.32, size: 8, font, color: rgb(text.r, text.g, text.b), maxWidth: size - 6 })
    })
  }

  function drawPdfBack(page: PDFPage, x: number, y: number, width: number, height: number, font: any) {
    const accent = hexToRgb(deck.layout.accentColor)
    const border = hexToRgb(deck.layout.borderColor)
    page.drawRectangle({ x, y, width, height, color: rgb(accent.r, accent.g, accent.b), opacity: 0.12, borderColor: rgb(border.r, border.g, border.b), borderWidth: 1.2 })
    page.drawText(safeText(deck.name, 24), { x: x + width * 0.12, y: y + height * 0.48, size: 13, font, color: rgb(border.r, border.g, border.b), maxWidth: width * 0.76 })
  }

  function drawCutLines(page: PDFPage, x: number, y: number, width: number, height: number) {
    const color = rgb(0.55, 0.58, 0.64)
    const length = 8
    ;[[x - length, y, x, y], [x, y - length, x, y], [x + width, y, x + width + length, y], [x + width, y - length, x + width, y], [x - length, y + height, x, y + height], [x, y + height, x, y + height + length], [x + width, y + height, x + width + length, y + height], [x + width, y + height, x + width, y + height + length]].forEach(([startX, startY, endX, endY]) => page.drawLine({ start: { x: startX, y: startY }, end: { x: endX, y: endY }, thickness: 0.35, color }))
  }

  function fitContain(imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number) {
    const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight)
    const width = imageWidth * scale
    const height = imageHeight * scale
    return { width, height, x: (boxWidth - width) / 2, y: (boxHeight - height) / 2 }
  }

  function cleanQuantity(value: number) {
    return Math.max(1, Math.min(99, Number(value) || 1))
  }

  function wrapText(text: string, maxChars: number, maxLines: number) {
    const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ')
    const lines: string[] = []
    let current = ''
    words.forEach((word) => {
      const candidate = `${current} ${word}`.trim()
      if (candidate.length > maxChars && current) {
        lines.push(current)
        current = word
      } else current = candidate
    })
    if (current) lines.push(current)
    return lines.slice(0, maxLines)
  }

  function safeText(value: string, maxLength: number) {
    const clean = String(value ?? '').replace(/[\n\r]/g, ' ').trim()
    return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean
  }

  function hexToRgb(hex: string) {
    const value = hex.replace('#', '')
    const number = Number.parseInt(value.length === 3 ? value.split('').map((char) => char + char).join('') : value || '000000', 16)
    return { r: ((number >> 16) & 255) / 255, g: ((number >> 8) & 255) / 255, b: (number & 255) / 255 }
  }

  function downloadUrl(url: string, filename: string) {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
  }

  function slugify(value: string) {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mazo-cartas'
  }

  loadDeck()
</script>

<svelte:head>
  <title>Creador visual de cartas de juego para imprimir en PDF</title>
  <meta name="description" content="Diseña, ordena arrastrando, importa, exporta y genera cartas de juego en PDF directamente desde el navegador." />
</svelte:head>

<a class="skip-link" href="#main">Saltar al contenido</a>

<header class="site-header">
  <nav class="container-wide header-nav" aria-label="Navegación principal">
    <a class="brand" href="./" aria-label="Card Creator inicio"><span class="brand-mark">CC</span><span>Card Creator</span></a>
    <div class="header-actions">
      <span class="badge">{deck.cards.length} diseños · {totalCards} cartas</span>
      <button class="btn btn-secondary" type="button" on:click={() => persist()}>Guardar</button>
      <button class="btn btn-primary" type="button" on:click={generatePdf} disabled={isGeneratingPdf}>{isGeneratingPdf ? 'Generando...' : 'Generar PDF'}</button>
    </div>
  </nav>
</header>

<main id="main">
  <section class="hero-section compact-hero">
    <div class="container-wide hero-grid">
      <div class="hero-copy">
        <span class="eyebrow">Editor visual con arrastrar y ordenar</span>
        <h1>Crea tu mazo como si fuera una mesa de cartas</h1>
        <p>Selecciona, duplica, elimina y reordena cartas visualmente. Cada carta puede repetirse varias veces en el PDF final.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" type="button" on:click={addCard}>Añadir carta</button>
          <button class="btn btn-secondary" type="button" on:click={exportJson}>Exportar JSON</button>
          <label class="btn btn-ghost file-button">Importar JSON<input type="file" accept="application/json,.json" on:change={importJson} /></label>
        </div>
        {#if statusMessage}<p class="status" role="status">{statusMessage}</p>{/if}
      </div>
      <div class="hero-card">
        <strong>{deck.name}</strong>
        <span>{grid.columns} × {grid.rows} cartas por página</span>
        <span>{pdfPages} página(s) de anverso</span>
        <span>{deck.layout.cardWidth} × {deck.layout.cardHeight} mm</span>
      </div>
    </div>
  </section>

  <section class="container-wide visual-workspace" aria-label="Editor de cartas">
    <aside class="panel deck-panel">
      <div class="panel-header"><div><p class="section-kicker">Mazo</p><h2>Configuración</h2></div><button class="btn btn-ghost compact" type="button" on:click={resetDeck}>Reiniciar</button></div>
      <div class="form-grid">
        <label><span class="label">Nombre</span><input class="input" bind:value={deck.name} on:change={() => persist()} /></label>
        <label><span class="label">Descripción</span><textarea class="textarea" rows="3" bind:value={deck.description} on:change={() => persist()}></textarea></label>
      </div>
      <details class="settings-group" open>
        <summary>Tamaño y PDF</summary>
        <div class="form-grid two-cols">
          <label><span class="label">Ancho mm</span><input class="input" type="number" min="30" max="160" bind:value={deck.layout.cardWidth} /></label>
          <label><span class="label">Alto mm</span><input class="input" type="number" min="30" max="220" bind:value={deck.layout.cardHeight} /></label>
          <label><span class="label">Página</span><select class="select" bind:value={deck.layout.pageSize}><option value="a4">A4</option><option value="letter">Letter</option></select></label>
          <label><span class="label">Orientación</span><select class="select" bind:value={deck.layout.orientation}><option value="portrait">Vertical</option><option value="landscape">Horizontal</option></select></label>
          <label><span class="label">Margen mm</span><input class="input" type="number" min="0" max="30" bind:value={deck.layout.margin} /></label>
          <label><span class="label">Separación mm</span><input class="input" type="number" min="0" max="20" bind:value={deck.layout.gap} /></label>
        </div>
        <div class="option-stack">
          <label class="check-row"><input type="checkbox" bind:checked={deck.layout.showCutLines} /> Líneas de corte</label>
          <label class="check-row"><input type="checkbox" bind:checked={deck.layout.showCardBacks} /> Reversos</label>
        </div>
      </details>
      <details class="settings-group" open>
        <summary>Diseño</summary>
        <div class="form-grid two-cols">
          <label><span class="label">Estilo</span><select class="select" bind:value={deck.layout.style}><option value="fantasy">Fantasía</option><option value="minimal">Minimalista</option><option value="classic">Clásico</option><option value="prototype">Prototipo</option></select></label>
          <label><span class="label">Imagen</span><select class="select" bind:value={deck.layout.imageMode}><option value="top">Superior</option><option value="full">Fondo</option><option value="none">Sin imagen</option></select></label>
          <label><span class="label">Fondo</span><input class="input color-input" type="color" bind:value={deck.layout.backgroundColor} /></label>
          <label><span class="label">Texto</span><input class="input color-input" type="color" bind:value={deck.layout.textColor} /></label>
          <label><span class="label">Borde</span><input class="input color-input" type="color" bind:value={deck.layout.borderColor} /></label>
          <label><span class="label">Acento</span><input class="input color-input" type="color" bind:value={deck.layout.accentColor} /></label>
        </div>
        <div class="option-stack">
          <label class="check-row"><input type="checkbox" bind:checked={deck.layout.showCorners} /> Esquinas</label>
          <label class="check-row"><input type="checkbox" bind:checked={deck.layout.showStats} /> Estadísticas</label>
          <label class="check-row"><input type="checkbox" bind:checked={deck.layout.showDescription} /> Descripción</label>
        </div>
      </details>
    </aside>

    <section class="panel visual-panel">
      <div class="panel-header"><div><p class="section-kicker">Mazo visual</p><h2>Arrastra para ordenar</h2></div><button class="btn btn-primary compact" type="button" on:click={addCard}>Añadir carta</button></div>
      <div class="visual-card-grid" aria-label="Cartas del mazo">
        {#each deck.cards as card, index (card.id)}
          <article
            class:selected={selectedCardId === card.id}
            class:drag-over={overIndex === index && dragIndex !== index}
            class="deck-tile"
            draggable="true"
            on:dragstart={(event) => handleDragStart(index, event)}
            on:dragover={(event) => { event.preventDefault(); overIndex = index }}
            on:dragleave={() => (overIndex = null)}
            on:drop={(event) => handleDrop(index, event)}
            on:dragend={() => { dragIndex = null; overIndex = null }}
            on:click={() => (selectedCardId = card.id)}
          >
            <div class="tile-drag" title="Arrastrar para ordenar">⋮⋮</div>
            <div class="tile-thumb" style={`--accent-card:${deck.layout.accentColor}; background:${deck.layout.backgroundColor}; color:${deck.layout.textColor}; border-color:${deck.layout.borderColor}`}>
              {#if card.imageDataUrl && deck.layout.imageMode !== 'none'}<img src={card.imageDataUrl} alt="" />{:else}<span>{card.cornerLabels[0] || '★'}</span>{/if}
              <strong>{card.title || 'Sin título'}</strong>
            </div>
            <div class="tile-info"><strong>{card.title || 'Carta sin título'}</strong><span>{card.subtitle || 'Sin tipo'} · ×{card.quantity}</span></div>
            <div class="tile-actions">
              <button type="button" aria-label="Subir carta" on:click={(event) => { event.stopPropagation(); moveCard(index, index - 1) }}>↑</button>
              <button type="button" aria-label="Bajar carta" on:click={(event) => { event.stopPropagation(); moveCard(index, index + 1) }}>↓</button>
              <button type="button" aria-label="Duplicar carta" on:click={(event) => { event.stopPropagation(); duplicateCard(card) }}>⧉</button>
              <button class="danger-icon" type="button" aria-label="Eliminar carta" on:click={(event) => { event.stopPropagation(); removeCard(card.id) }}>×</button>
            </div>
          </article>
        {/each}
      </div>
    </section>

    <aside class="panel editor-side">
      {#if selectedCard}
        <div class="panel-header"><div><p class="section-kicker">Carta seleccionada</p><h2>{selectedCard.title}</h2></div></div>
        <div class="print-card-wrap">
          <div class:style-fantasy={deck.layout.style === 'fantasy'} class:style-classic={deck.layout.style === 'classic'} class:style-prototype={deck.layout.style === 'prototype'} class="print-card" style={`aspect-ratio:${deck.layout.cardWidth}/${deck.layout.cardHeight}; background:${deck.layout.backgroundColor}; color:${deck.layout.textColor}; border-color:${deck.layout.borderColor}; --accent-card:${deck.layout.accentColor}`}>
            {#if deck.layout.showCorners}<div class="corner corner-tl">{selectedCard.cornerLabels[0]}</div><div class="corner corner-tr">{selectedCard.cornerLabels[1]}</div><div class="corner corner-bl">{selectedCard.cornerLabels[2]}</div><div class="corner corner-br">{selectedCard.cornerLabels[3]}</div>{/if}
            {#if selectedCard.imageDataUrl && deck.layout.imageMode !== 'none'}<div class:full-image={deck.layout.imageMode === 'full'} class="card-image"><img src={selectedCard.imageDataUrl} alt={`Imagen de ${selectedCard.title}`} /></div>{:else if deck.layout.imageMode !== 'none'}<div class="card-image placeholder">Imagen</div>{/if}
            <div class="card-content"><p class="card-subtitle">{selectedCard.subtitle}</p><h3>{selectedCard.title}</h3>{#if deck.layout.showDescription}<p>{selectedCard.description}</p>{/if}</div>
            {#if deck.layout.showStats}<div class="card-stats">{#each selectedCard.stats as stat}<span><strong>{stat.value}</strong> {stat.label}</span>{/each}</div>{/if}
          </div>
        </div>

        <div class="editor-form">
          <div class="form-grid two-cols">
            <label><span class="label">Título</span><input class="input" bind:value={selectedCard.title} on:change={() => persist('Carta actualizada.')} /></label>
            <label><span class="label">Tipo</span><input class="input" bind:value={selectedCard.subtitle} on:change={() => persist('Carta actualizada.')} /></label>
            <label><span class="label">Copias</span><input class="input" type="number" min="1" max="99" bind:value={selectedCard.quantity} on:change={() => persist('Cantidad actualizada.')} /></label>
            <label><span class="label">Imagen</span><input class="input" type="file" accept="image/*" on:change={(event) => handleImageUpload(event, selectedCard)} /></label>
          </div>
          <label><span class="label">Descripción</span><textarea class="textarea" rows="4" bind:value={selectedCard.description} on:change={() => persist('Carta actualizada.')}></textarea></label>
          <div class="corner-grid">{#each selectedCard.cornerLabels as label, index}<label><span class="label">Esquina {index + 1}</span><input class="input" maxlength="4" bind:value={selectedCard.cornerLabels[index]} on:change={() => persist('Esquinas actualizadas.')} /></label>{/each}</div>
          <div class="subsection"><div class="subsection-header"><h3>Estadísticas</h3><button class="btn btn-secondary compact" type="button" on:click={() => addStat(selectedCard)}>Añadir</button></div><div class="stats-editor">{#each selectedCard.stats as stat, index}<div class="stat-row"><input class="input" aria-label="Nombre" bind:value={stat.label} on:change={() => persist('Estadística actualizada.')} /><input class="input" aria-label="Valor" bind:value={stat.value} on:change={() => persist('Estadística actualizada.')} /><button class="btn btn-ghost compact" type="button" on:click={() => removeStat(selectedCard, index)}>Quitar</button></div>{/each}</div></div>
          <div class="editor-actions">{#if selectedCard.imageDataUrl}<button class="btn btn-secondary" type="button" on:click={() => clearImage(selectedCard)}>Quitar imagen</button>{/if}<button class="btn btn-secondary" type="button" on:click={() => duplicateCard(selectedCard)}>Duplicar</button><button class="btn btn-danger" type="button" on:click={() => removeCard(selectedCard.id)}>Eliminar</button></div>
        </div>
      {/if}
    </aside>
  </section>
</main>

<footer class="site-footer"><div class="container-wide footer-inner"><p><strong>Card Creator</strong> · editor visual de cartas imprimibles.</p><p>Arrastra para ordenar, guarda en localStorage y exporta a PDF.</p></div></footer>
