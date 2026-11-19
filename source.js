import createPlugin from './huangguo.js'

const origin = 'https://huangguoai.com'
const idPattern = /^\d{1,12}$/
const imageLimit = 8 * 1024 * 1024
const retryableStatus = new Set([408, 500, 502, 503, 504])

class SourceError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const plugin = createPlugin({
  PluginError: SourceError,
  codec: { base64Encode: value => globalThis.btoa(value) },
  http: {
    async fetch(request) {
      const url = new URL(request.url)
      if (url.origin !== origin) throw new Error('播放源地址无效')
      for (const [name, value] of Object.entries(request.query || {})) url.searchParams.set(name, value)

      const attempts = request.method === 'GET' ? 2 : 1
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const controller = new AbortController()
        const abort = () => controller.abort()
        if (request.signal?.aborted) abort()
        request.signal?.addEventListener('abort', abort, { once: true })
        const timeout = setTimeout(abort, request.timeoutMs / attempts)
        try {
          const response = await fetch(url.href, {
            method: request.method,
            // The source accepts an empty form as the empty playback payload.
            body: request.method === 'POST' ? new URLSearchParams() : undefined,
            cache: attempt === 1 ? 'default' : 'reload',
            credentials: 'omit',
            redirect: 'error',
            signal: controller.signal,
          })
          if (attempt < attempts && retryableStatus.has(response.status)) {
            await response.body?.cancel()
            continue
          }
          const data = await response.json().catch(error => {
            if (controller.signal.aborted) throw error
            return null
          })
          return { ok: response.ok, status: response.status, data }
        } catch (error) {
          if (request.signal?.aborted) throw error
          if (globalThis.navigator?.onLine === false) throw new SourceError('OFFLINE', '当前设备未联网。连接网络后请重试。')
          if (attempt < attempts) continue
          if (controller.signal.aborted) throw new SourceError('TIMEOUT', '黄果播放源响应超时。请稍后重试。')
          throw new SourceError('UPSTREAM_ERROR', '当前网络无法连接黄果播放源。请换一个网络后重试。')
        } finally {
          clearTimeout(timeout)
          request.signal?.removeEventListener('abort', abort)
        }
      }
    },
  },
})

function httpsUrl(value) {
  const url = new URL(value, origin)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('媒体地址无效')
  return url.href
}

export async function sourceApi(path, params, signal) {
  const ctx = { signal }
  if (path === 'categories') {
    const categories = await plugin.catalog.getCategories({}, ctx)
    return categories.filter(({ id }) => id === 'all' || idPattern.test(id)).map(({ id, label }) => ({ id, label }))
  }
  if (path === 'list') {
    const query = String(params.q || '').slice(0, 100).trim()
    const cursor = String(params.page || '1')
    const data = query
      ? await plugin.search.search({ query, cursor, limit: 18 }, ctx)
      : await plugin.catalog.list({ categoryId: params.category || 'all', sort: params.sort || 'latest', cursor, limit: 18 }, ctx)
    return {
      next: data.next,
      items: data.items.filter(item => idPattern.test(item.id)).map(({ id, title, cover, episodeCount }) => ({ id, title, cover, episodeCount })),
    }
  }
  if (!idPattern.test(params.id)) throw new Error('作品 ID 无效')
  if (path === 'detail') {
    const { id, title, description, cover, playlists } = await plugin.media.getDetail({ id: params.id }, ctx)
    return { id, title, description, cover, episodes: playlists[0]?.episodes || [] }
  }
  if (path === 'play') {
    if (!idPattern.test(params.episode) || Number(params.episode) < 1) throw new Error('分集无效')
    const { streams } = await plugin.media.resolvePlayback({ mediaId: params.id, episodeId: params.episode }, ctx)
    return streams.map(({ url, label, format }) => ({ url: httpsUrl(url), label, format }))
  }
  throw new Error('未知播放操作')
}

const fromBase64 = value => Uint8Array.from(globalThis.atob(value), char => char.charCodeAt(0))

function imageType(data) {
  const header = String.fromCharCode(...data.slice(0, 12))
  if (header.startsWith('\xFF\xD8\xFF')) return 'image/jpeg'
  if (header.startsWith('\x89PNG\r\n\x1A\n')) return 'image/png'
  if (header.startsWith('RIFF') && header.slice(8) === 'WEBP') return 'image/webp'
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return 'image/gif'
}

export async function coverUrl(ref, signal) {
  if (typeof ref === 'string') return httpsUrl(ref)
  const url = httpsUrl(ref.url)
  const transform = ref.transform
  if (transform?.type !== 'aes-cbc') return url

  const response = await fetch(url, { credentials: 'omit', signal })
  if (!response.ok || Number(response.headers.get('content-length')) > imageLimit) throw new Error('封面暂不可用')
  let data = new Uint8Array(await response.arrayBuffer())
  if (data.length > imageLimit) throw new Error('封面暂不可用')

  if (!imageType(data)) {
    if (data.length < 16 || data.length % 16 !== 0) throw new Error('封面格式无效')
    const key = await crypto.subtle.importKey('raw', fromBase64(transform.key), 'AES-CBC', false, ['encrypt', 'decrypt'])
    // Web Crypto expects PKCS#7 padding, so append one encrypted padding block.
    const pad = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: data.slice(-16) }, key, new Uint8Array(0))
    const padded = new Uint8Array(data.length + 16)
    padded.set(data)
    padded.set(new Uint8Array(pad), data.length)
    data = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: fromBase64(transform.iv) }, key, padded))
  }
  const type = imageType(data)
  if (!type || signal?.aborted) throw new Error('封面暂不可用')
  return URL.createObjectURL(new Blob([data], { type }))
}
