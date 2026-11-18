const adStart = /^#EXT-X-(?:CUE-OUT(?=[:\s]|$)|SCTE35-OUT(?=[:\s]|$))/i
const adEnd = /^#EXT-X-(?:CUE-IN(?=[:\s]|$)|SCTE35-IN(?=[:\s]|$))/i
const adMarker = /^#EXT-X-(?:CUE-(?:OUT(?:-CONT)?|IN)|SCTE35-(?:OUT|IN))(?=[:\s]|$)/i

function attributes(line) {
  return Object.fromEntries([...line.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi)].map(
    ([, name, value]) => [name.toUpperCase(), value.replace(/^"|"$/g, '')],
  ))
}

export function filterAds(playlist) {
  const lines = playlist.split(/\r?\n/)
  if (!lines.includes('#EXT-X-ENDLIST') || !lines.some(line => line.startsWith('#EXTINF:'))) {
    return playlist
  }

  const ranges = lines.flatMap(line => {
    if (!line.startsWith('#EXT-X-DATERANGE:')) return []
    const a = attributes(line)
    if (!a['SCTE35-OUT'] && !/^(?:ad|ads|advertisement|interstitial|com\.apple\.hls\.interstitial)$/i.test(a.CLASS || '')) return []
    const start = Date.parse(a['START-DATE'])
    const duration = Number(a.DURATION)
    const end = a['END-DATE'] ? Date.parse(a['END-DATE']) : start + duration * 1000
    return [{ line, start, end, interstitial: Boolean(a['X-ASSET-URI'] || a['X-ASSET-LIST']) }]
  })
  const removedRanges = new Set(ranges.filter(range => range.interstitial).map(range => range.line))

  const segments = []
  let pending = []
  let cueStart = null
  let cueTime = 0
  let cueDuration = NaN
  let duration = 0
  let clock = NaN

  for (const line of lines) {
    if (adStart.test(line)) {
      cueStart = segments.length
      cueTime = 0
      const value = line.split(':')[1] || ''
      cueDuration = Number(attributes(value).DURATION || value)
    }
    if (adEnd.test(line) && cueStart !== null) {
      for (const segment of segments.slice(cueStart)) segment.ad = true
      cueStart = null
    }
    if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) clock = Date.parse(line.slice(25))
    if (line.startsWith('#EXTINF:')) duration = Number.parseFloat(line.slice(8))
    if (!line || line.startsWith('#') || !duration) {
      pending.push(line)
      continue
    }
    const end = clock + duration * 1000
    const ad = ranges.some(range => !range.interstitial && clock >= range.start - 20 && end <= range.end + 20)
    segments.push({ tags: pending, uri: line, ad: ad || (
      cueStart !== null && cueDuration > 0 && cueTime + duration <= cueDuration + 0.02
    ) })
    if (cueStart !== null) cueTime += duration
    pending = []
    clock = end
    duration = 0
  }

  const removed = segments.filter(segment => segment.ad).length
  if (!removed && !removedRanges.size) return playlist
  if (removed === segments.length && segments.length) return playlist

  // Preserve media sequence numbers and implicit offsets on encrypted or range-based playlists.
  const preserveSequence = lines.some(line => /^#EXT-X-(?:KEY|BYTERANGE|PART)(?=:)/.test(line))
  const output = []
  for (const { tags, uri, ad } of segments) {
    for (const line of tags) {
      if (adMarker.test(line) || removedRanges.has(line)) continue
      if (ad && !preserveSequence && /^(?:#EXTINF:|#EXT-X-(?:PROGRAM-DATE-TIME:|GAP$))/.test(line)) continue
      if (line === '#EXT-X-DISCONTINUITY' && output.at(-1) === line) continue
      output.push(line)
    }
    if (!ad || preserveSequence) {
      if (ad && !tags.includes('#EXT-X-GAP')) output.push('#EXT-X-GAP')
      output.push(uri)
    }
  }
  output.push(...pending.filter(line => !adMarker.test(line) && !removedRanges.has(line)))
  return output.join('\n')
}
