import { coverUrl, sourceApi } from './source.js?v=4'

const $ = id => document.getElementById(id)
const app = document.querySelector('.app')
const playbackSurface = document.querySelector('.screen')
const video = $('video')
const fullscreenButton = $('toggle-fullscreen')
const cleanButton = $('toggle-clean')
const skipForwardButton = $('skip-forward')
const categoryPicker = $('library-categories')
const streamPicker = $('stream')
const nativeHls = Boolean(video.canPlayType('application/vnd.apple.mpegurl'))
const originalId = new URL(location.href).searchParams.get('id')
const preference = new URL(location.href).searchParams.get('episode')
const feed = { source: 'rank:recommend', items: [], index: -1, next: null, run: 0 }
let consent = sessionStorage.getItem('source-consent') === '1'
let current, detail, episode, streams = [], hls, pending, playing, retry, focusBefore
let viewRun = 0
let sheetRun = 0
let sheetMode = ''
let searchPage = null
let searchQuery = ''
let libraryCategory = 'all'
let libraryItems = []
let categoryRequest
let toastTimer
let posterRequest
let posterBlob
let swipe
let wheelTime = -Infinity
let cleanMode = false
let fullscreenMode = ''

function readSaved() {
  try {
    const list = JSON.parse(localStorage.getItem('huangguo-saved') || '[]')
    return Array.isArray(list) ? list.filter(item => item?.id && item?.title) : []
  } catch {
    return []
  }
}
let saved = readSaved()

function api(path, params, signal) {
  if (!consent) throw new Error('请先确认访问此内容源。')
  return sourceApi(path, params, signal)
}

function message(text, action, callback) {
  $('status').hidden = false
  $('status-text').textContent = text
  $('status-action').hidden = !action
  $('status-action').textContent = action || ''
  retry = callback
}

function toast(text) {
  clearTimeout(toastTimer)
  $('toast').textContent = text
  $('toast').hidden = false
  toastTimer = setTimeout(() => { $('toast').hidden = true }, 2000)
}

async function poster(ref) {
  posterRequest?.abort()
  if (posterBlob) URL.revokeObjectURL(posterBlob)
  posterBlob = null
  const image = $('poster')
  image.hidden = true
  image.removeAttribute('src')
  if (!ref) return
  const request = posterRequest = new AbortController()
  try {
    const src = await coverUrl(ref, request.signal)
    if (request.signal.aborted) {
      if (src.startsWith('blob:')) URL.revokeObjectURL(src)
      return
    }
    if (src.startsWith('blob:')) posterBlob = src
    image.src = src
    image.hidden = false
  } catch {
    // Keep the default artwork when a cover is unavailable.
  }
}
$('poster').addEventListener('error', () => { $('poster').hidden = true })

function resetVideo() {
  playing = null
  video.hidden = true
  hls?.destroy()
  hls = null
  video.pause()
  video.removeAttribute('src')
  video.load()
  $('play-mark').hidden = true
  $('progress').hidden = true
  $('progress').value = 0
  updateViewMode()
}

function updateViewMode() {
  const fullscreen = Boolean(fullscreenMode)
  app.classList.toggle('is-cinema', cleanMode || fullscreen)
  app.classList.toggle('is-fullscreen', fullscreen)
  app.classList.toggle('is-immersive', fullscreenMode === 'immersive')
  playbackSurface.classList.toggle('has-progress', Boolean(playing))
  $('view-tools').hidden = !playing && !cleanMode && !fullscreen
  cleanButton.setAttribute('aria-pressed', String(cleanMode))
  cleanButton.textContent = cleanMode ? '恢复界面' : '清屏'
  cleanButton.title = cleanMode ? '恢复标题和操作栏' : '隐藏标题和操作栏'
  fullscreenButton.disabled = !playing && !fullscreen
  fullscreenButton.setAttribute('aria-pressed', String(fullscreen))
  fullscreenButton.textContent = fullscreen ? '退出全屏' : '全屏'
  updateSeekControls()
}

function canSeek() {
  return Boolean(playing) && Number.isFinite(video.duration) && video.duration > 0
}

function updateSeekControls() {
  skipForwardButton.disabled = !canSeek()
}

function seekTo(position) {
  if (!canSeek()) return
  video.currentTime = Math.max(0, Math.min(position, video.duration))
}

function setFullscreen(mode) {
  fullscreenMode = mode
  updateViewMode()
}

function syncDocumentFullscreen() {
  if ((document.fullscreenElement || document.webkitFullscreenElement) === app) setFullscreen('browser')
  else if (fullscreenMode === 'browser') setFullscreen('')
}

function openNativeFullscreen() {
  if (!video.webkitSupportsFullscreen || typeof video.webkitEnterFullscreen !== 'function') return false
  try {
    video.webkitEnterFullscreen()
    setFullscreen('native')
    return true
  } catch {
    return false
  }
}

async function toggleFullscreen() {
  if (fullscreenMode === 'immersive') return setFullscreen('')
  if (fullscreenMode === 'native') {
    video.webkitExitFullscreen?.()
    return
  }
  if (fullscreenMode === 'browser') {
    const exit = document.exitFullscreen || document.webkitExitFullscreen
    try {
      await exit?.call(document)
    } catch {
      // The browser can close fullscreen before the requested exit is handled.
    }
    return
  }
  if (!playing) return

  const request = app.requestFullscreen || app.webkitRequestFullscreen
  // iPhone uses the native <video> fullscreen controller when element fullscreen is unavailable.
  if (!app.requestFullscreen && openNativeFullscreen()) return
  if (request) {
    try {
      await request.call(app)
      syncDocumentFullscreen()
      return
    } catch {
      // Web views may reject fullscreen, so try the native video player next.
    }
  }
  if (!openNativeFullscreen()) setFullscreen('immersive')
}

async function play() {
  const target = playing
  try {
    await video.play()
  } catch (error) {
    if (target === playing && error.name === 'NotAllowedError') $('play-mark').hidden = false
  }
}

function playbackFailed(target) {
  if (target !== playing) return
  resetVideo()
  message('这条线路暂时无法播放。可重试，或在选集中切换线路。', '重试播放', () => selectEpisode(episode.id))
}

function startStream(stream) {
  resetVideo()
  $('status').hidden = true
  if (!stream) return message('该分集暂未提供线路。', '重试播放', () => selectEpisode(episode.id))
  const target = playing = stream
  if (stream.format === 'hls' && !nativeHls) {
    const Hls = globalThis.Hls
    if (!Hls?.isSupported()) {
      resetVideo()
      return message('当前浏览器无法加载 HLS。', '重试播放', () => selectEpisode(episode.id))
    }
    video.disableRemotePlayback = true
    hls = new Hls()
    hls.on(Hls.Events.ERROR, (_, error) => {
      if (error.fatal) playbackFailed(target)
    })
    hls.loadSource(stream.url)
    hls.attachMedia(video)
  } else {
    video.disableRemotePlayback = false
    video.src = stream.url
  }
  video.hidden = false
  $('progress').hidden = false
  $('play-mark').hidden = false
  updateViewMode()
  play()
}

function refreshFavorite() {
  $('favorite').setAttribute('aria-pressed', String(saved.some(item => item.id === current?.id)))
}

function showInfo(item) {
  current = item
  $('title').textContent = item.title
  $('summary').textContent = (item.description || '').replace(/<[^>]*>/g, '').slice(0, 200)
  for (const id of ['actions', 'info', 'episode-bar', 'toggle-play']) $(id).hidden = false
  $('episode-label').textContent = item.title + (item.episodes?.length ? ' · 共 ' + item.episodes.length + ' 集' : '')
  refreshFavorite()
  poster(item.cover)
}

async function selectEpisode(id) {
  if (!detail) return
  const next = detail.episodes.find(item => item.id === id && !item.locked)
  if (!next) return
  const titleId = detail.id
  pending?.abort()
  const request = pending = new AbortController()
  episode = next
  streams = []
  $('episode-label').textContent = detail.title + ' · 第 ' + episode.label + ' 集'
  resetVideo()
  message('正在加载第 ' + episode.label + ' 集…')
  try {
    const result = await api('play', { id: titleId, episode: id }, request.signal)
    if (request.signal.aborted) return
    streams = result
    streamPicker.replaceChildren(...streams.map((stream, i) => new Option(stream.label, i)))
    if (sheetMode === 'episodes') showEpisodes()
    startStream(streams[0])
  } catch (error) {
    if (!request.signal.aborted) message(error.message, '重试播放', () => selectEpisode(id))
  }
}

async function openTitle(item, preferredEpisode) {
  const run = ++viewRun
  pending?.abort()
  const request = pending = new AbortController()
  detail = episode = null
  streams = []
  resetVideo()
  showInfo(item)
  message('正在加载作品…')
  try {
    const result = await api('detail', { id: item.id }, request.signal)
    if (run !== viewRun || request.signal.aborted) return
    detail = result
    showInfo(result)
    const first = result.episodes.find(item => item.id === preferredEpisode && !item.locked) ||
      result.episodes.find(item => !item.locked)
    if (first) await selectEpisode(first.id)
    else message('这部作品暂无可播放分集。')
  } catch (error) {
    if (!request.signal.aborted) message(error.message, '重试加载', () => openTitle(item, preferredEpisode))
  }
}

function updateTabs() {
  for (const tab of $('sources').querySelectorAll('button')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.source === feed.source))
  }
}

async function loadFeed(source) {
  pending?.abort()
  const request = pending = new AbortController()
  const run = ++feed.run
  const view = ++viewRun
  feed.source = source
  feed.items = []
  feed.index = -1
  feed.next = null
  current = detail = episode = null
  updateTabs()
  resetVideo()
  poster(null)
  for (const id of ['actions', 'info', 'episode-bar', 'toggle-play']) $(id).hidden = true
  message('正在载入短剧…')
  const isCurrent = () => !request.signal.aborted && run === feed.run && view === viewRun
  try {
    let data
    try {
      data = await api('list', { category: source === 'latest' ? 'all' : source, sort: 'latest', page: 1 }, request.signal)
    } catch (error) {
      if (!isCurrent()) return
      if (!source.startsWith('rank:') || error.code === 'OFFLINE') throw error
      message('榜单暂时无法载入，正在尝试上新…')
      data = await api('list', { category: 'all', sort: 'latest', page: 1 }, request.signal)
      if (!isCurrent()) return
      feed.source = 'latest'
      updateTabs()
    }
    if (!isCurrent()) return
    feed.items = data.items
    feed.next = data.next
    if (data.items.length) {
      feed.index = 0
      openTitle(data.items[0])
    } else message('此栏目暂无短剧。', '重试加载', () => loadFeed(source))
  } catch (error) {
    if (isCurrent()) message(error.message, '重试加载', () => loadFeed(source))
  }
}

async function move(step) {
  if (!consent || !$('overlay').hidden) return
  const target = feed.index + step
  if (target < 0) return
  if (target >= feed.items.length && feed.next) {
    const run = feed.run
    const index = feed.index
    const page = feed.next
    feed.next = null
    try {
      const data = await api('list', { category: feed.source === 'latest' ? 'all' : feed.source, sort: 'latest', page })
      if (run !== feed.run) return
      feed.items.push(...data.items)
      feed.next = data.next
      if (index !== feed.index) return
    } catch (error) {
      if (run !== feed.run) return
      feed.next = page
      return toast(error.message)
    }
  }
  if (!feed.items[target]) return toast('已到片单末尾')
  feed.index = target
  openTitle(feed.items[target])
}

function sheet(title, mode) {
  if (!consent) return
  sheetRun++
  sheetMode = mode
  focusBefore = document.activeElement
  $('overlay').hidden = false
  $('sheet-title').textContent = title
  $('search-form').hidden = mode !== 'library'
  categoryPicker.hidden = mode !== 'library'
  $('stream-label').hidden = true
  $('more').hidden = true
  $('results').replaceChildren()
  $('close').focus()
}

function closeSheet() {
  sheetRun++
  sheetMode = ''
  $('overlay').hidden = true
  focusBefore?.focus()
}

function resultMessage(text) {
  const line = document.createElement('p')
  line.textContent = text
  $('results').replaceChildren(line)
}

function itemButton(name, action) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'result'
  button.textContent = name
  button.addEventListener('click', action)
  return button
}

function showEpisodes() {
  if (sheetMode !== 'episodes') sheet('分集与设置', 'episodes')
  $('stream-label').hidden = streams.length < 2
  if (!detail) return resultMessage('正在载入分集…')
  if (!detail.episodes.length) return resultMessage('暂无分集。')
  $('results').replaceChildren(...detail.episodes.map(item => {
    const button = itemButton('第 ' + item.label + ' 集', () => {
      closeSheet()
      selectEpisode(item.id)
    })
    button.disabled = Boolean(item.locked)
    if (item.id === episode?.id) button.setAttribute('aria-current', 'true')
    return button
  }))
}

async function findTitles(query, append = false) {
  const run = ++sheetRun
  const page = append ? searchPage : 1
  searchQuery = query
  if (!append) {
    libraryItems = []
    searchPage = null
    resultMessage(query ? '正在搜索…' : '正在载入短剧…')
  }
  $('more').hidden = true
  try {
    const data = await api('list', { q: query, category: libraryCategory, page })
    if (run !== sheetRun) return
    libraryItems.push(...data.items)
    searchPage = data.next
    if (!append) $('results').replaceChildren()
    if (!data.items.length && !append) resultMessage(query ? '没有找到短剧。' : '这个分类暂无短剧。')
    else $('results').append(...data.items.map(item => itemButton(item.title, () => openLibraryTitle(item))))
    $('more').hidden = !searchPage
  } catch (error) {
    if (run !== sheetRun) return
    if (append) {
      toast(error.message)
      $('more').hidden = false
    } else resultMessage(error.message)
  }
}

function openLibraryTitle(item) {
  closeSheet()
  if (!searchQuery) {
    feed.run++
    feed.source = libraryCategory
    feed.items = libraryItems.slice()
    feed.index = feed.items.findIndex(title => title.id === item.id)
    feed.next = searchPage
    updateTabs()
  }
  openTitle(item)
}

function updateLibraryCategory(id) {
  libraryCategory = id
  for (const button of categoryPicker.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.category === id))
  }
}

function loadLibraryCategories() {
  if (categoryRequest) return
  categoryRequest = api('categories', {}).then(categories => {
    categoryPicker.replaceChildren(...categories.map(({ id, label }) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.category = id
      button.textContent = label
      return button
    }))
    updateLibraryCategory(libraryCategory)
  }).catch(() => { categoryRequest = null })
}

function library(focusSearch) {
  if (!consent) return
  sheet('分类片库', 'library')
  $('search').value = ''
  loadLibraryCategories()
  if (focusSearch) updateLibraryCategory('all')
  findTitles('')
  if (focusSearch) $('search').focus()
}

function savedTitles() {
  if (!consent) return
  sheet('我的收藏', 'saved')
  if (!saved.length) return resultMessage('收藏的作品会显示在这里。')
  $('results').append(...saved.map(item => itemButton(item.title, () => {
    closeSheet()
    openTitle(item)
  })))
}

function enter() {
  if (originalId && /^\d{1,12}$/.test(originalId)) {
    openTitle({ id: originalId, title: '正在打开短剧' }, preference)
  } else loadFeed('rank:recommend')
}

video.muted = true
$('status-action').onclick = () => {
  if (consent) return retry?.()
  consent = true
  sessionStorage.setItem('source-consent', '1')
  enter()
}
$('sources').onclick = event => {
  const source = event.target.closest('[data-source]')?.dataset.source
  if (consent && source) loadFeed(source)
}
$('search-button').onclick = () => library(true)
$('library-button').onclick = () => library(false)
$('saved-button').onclick = savedTitles
$('feed-button').onclick = () => {
  if (!consent) return
  if (!$('overlay').hidden) closeSheet()
  else if (feed.items[feed.index]?.id !== current?.id) loadFeed(feed.source)
}
$('close').onclick = closeSheet
$('overlay').onclick = event => { if (event.target === $('overlay')) closeSheet() }
$('search-form').onsubmit = event => {
  event.preventDefault()
  const query = $('search').value.trim()
  if (query) updateLibraryCategory('all')
  findTitles(query)
}
categoryPicker.onclick = event => {
  const id = event.target.closest('button[data-category]')?.dataset.category
  if (!id || (id === libraryCategory && !searchQuery)) return
  $('search').value = ''
  updateLibraryCategory(id)
  findTitles('')
}
$('more').onclick = () => searchPage && findTitles(searchQuery, true)
$('episodes').onclick = $('episode-bar').onclick = showEpisodes
$('stream').onchange = () => startStream(streams[Number(streamPicker.value)])
$('favorite').onclick = () => {
  if (!current) return
  const id = current.id
  if (saved.some(item => item.id === id)) saved = saved.filter(item => item.id !== id)
  else saved = [{ id, title: current.title }, ...saved].slice(0, 200)
  localStorage.setItem('huangguo-saved', JSON.stringify(saved))
  refreshFavorite()
}
$('share').onclick = async () => {
  if (!current) return
  const url = new URL('./', location.href)
  url.searchParams.set('id', current.id)
  if (episode) url.searchParams.set('episode', episode.id)
  try {
    if (navigator.share) await navigator.share({ title: current.title, url: url.href })
    else {
      await navigator.clipboard.writeText(url.href)
      toast('链接已复制')
    }
  } catch (error) {
    if (error.name !== 'AbortError') toast('分享暂时不可用')
  }
}
$('mute').onclick = () => {
  video.muted = !video.muted
  $('mute').setAttribute('aria-pressed', String(video.muted))
  $('mute').querySelector('b').textContent = video.muted ? '静音' : '有声'
}
$('toggle-play').onclick = () => {
  if (!playing || performance.now() - wheelTime < 320) return
  if (video.paused) play()
  else video.pause()
}
cleanButton.onclick = () => { cleanMode = !cleanMode; updateViewMode() }
fullscreenButton.onclick = toggleFullscreen
skipForwardButton.onclick = () => seekTo(video.currentTime + 10)
document.addEventListener('fullscreenchange', syncDocumentFullscreen)
document.addEventListener('webkitfullscreenchange', syncDocumentFullscreen)
video.addEventListener('webkitbeginfullscreen', () => setFullscreen('native'))
video.addEventListener('webkitendfullscreen', () => { if (fullscreenMode === 'native') setFullscreen('') })
video.addEventListener('playing', () => { $('play-mark').hidden = true })
video.addEventListener('pause', () => { if (playing) $('play-mark').hidden = false })
video.addEventListener('error', () => { if (playing) playbackFailed(playing) })
video.addEventListener('timeupdate', () => {
  if (Number.isFinite(video.duration) && video.duration > 0) $('progress').value = String(1000 * video.currentTime / video.duration)
})
video.addEventListener('loadedmetadata', updateSeekControls)
video.addEventListener('durationchange', updateSeekControls)
$('progress').oninput = () => seekTo(Number($('progress').value) * video.duration / 1000)
video.addEventListener('ended', () => {
  const index = detail?.episodes.findIndex(item => item.id === episode?.id) ?? -1
  const next = index < 0 ? null : detail.episodes.slice(index + 1).find(item => !item.locked)
  if (next) selectEpisode(next.id)
})
playbackSurface.addEventListener('touchstart', event => {
  if (event.touches.length !== 1 || event.target.closest('input,aside,header,.episode-bar,.status')) return
  const point = event.touches[0]
  swipe = { x: point.clientX, y: point.clientY }
}, { passive: true })
playbackSurface.addEventListener('touchcancel', () => { swipe = null }, { passive: true })
playbackSurface.addEventListener('touchend', event => {
  if (!swipe) return
  const point = event.changedTouches[0]
  const dy = point.clientY - swipe.y
  const dx = point.clientX - swipe.x
  swipe = null
  if (Math.abs(dy) > 55 && Math.abs(dy) > Math.abs(dx) * 1.3) {
    wheelTime = performance.now()
    move(dy < 0 ? 1 : -1)
  }
}, { passive: true })
playbackSurface.addEventListener('wheel', event => {
  if (Math.abs(event.deltaY) < 8 || performance.now() - wheelTime < 500) return
  wheelTime = performance.now()
  move(event.deltaY > 0 ? 1 : -1)
}, { passive: true })
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!$('overlay').hidden) closeSheet()
    else if (fullscreenMode === 'immersive') setFullscreen('')
    else if (!fullscreenMode && cleanMode) { cleanMode = false; updateViewMode() }
    return
  }
  if (event.target.closest?.('input,select,button') || !$('overlay').hidden) return
  if (event.key === 'ArrowDown') move(1)
  if (event.key === 'ArrowUp') move(-1)
  if (event.key === 'ArrowRight' && canSeek()) seekTo(video.currentTime + 10)
})
if (consent) enter()
