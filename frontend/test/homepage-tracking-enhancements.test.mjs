import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { categoryPhotos } from '../src/pages/cinematicCatalogue.js'
import { tickerAnnouncements, tickerDrafts, safeAnnouncementLink, isLegacyHomepagePromotion } from '../src/utils/homepageAnnouncements.js'
import { createCinematicAudio } from '../src/utils/cinematicAudio.js'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('category images prefer own photography and only explicitly associated active product photos', () => {
  const category = { id: 8, name: 'Oils', image_url: '/category.jpg' }
  const products = [{ id: 1, name: 'Palm Oil', category_name: ' oils ', image_url: '/palm.png' },
    { id: 2, name: 'Rice', category: 'Rice', image_url: '/rice.png' },
    { id: 3, name: 'Old oil', category: 'Oils', is_active: false, image_url: '/old.png' },
    { id: 4, name: 'Oil by ID', category_id: 8, image_url: '/id.webp' }]
  assert.deepEqual(categoryPhotos(category, products), ['/category.jpg', '/palm.png', '/id.webp'])
  assert.deepEqual(categoryPhotos({ id: 9, name: 'Oil' }, products), [])
  assert.deepEqual(categoryPhotos({ name: 'Unknown', image_url: '/placeholder.png' }, []), [])
})

test('category images advance on failure and use approved logo fallback without hiding names or changing routes', () => {
  const photo = source('components/CategoryPhoto.jsx'), page = source('pages/CinematicHomePage.jsx')
  assert.match(photo, /onLoad=.*setLoaded\(true\)/)
  assert.match(photo, /setIndex\(\(value\) => value \+ 1\)/)
  assert.match(photo, /BrandLogo decorative/)
  assert.doesNotMatch(photo, /visibility|padStart|placeholder.png/)
  assert.match(page, /products\?category=\$\{encodeURIComponent\(category.name\)\}/)
})

test('ticker schedules, priority and active state use CMS data; draft text is never auto-published', () => {
  const now = Date.parse('2026-11-20T12:00:00Z')
  const rows = [{ id:1, message:'First', display_type:'top_bar', priority:1 },
    { id:2, message:'Priority', display_type:'top_bar', priority:5 },
    { id:3, message:'Disabled', display_type:'top_bar', is_active:false },
    { id:4, message:'Expired', display_type:'top_bar', end_date:'2026-11-20T11:00:00' },
    { id:5, message:'Future', display_type:'top_bar', start_date:'2026-11-20T13:00:00Z' },
    { id:6, message:'Hero', display_type:'hero_banner' },
    { id:7, message:'Malformed date', display_type:'top_bar', start_date:'bad' }]
  assert.deepEqual(tickerAnnouncements(rows, now).map((x) => x.id), [2,1])
  assert.equal(tickerDrafts.length, 4)
  assert.match(source('pages/AdminExpansion.jsx'), /message: event.target.value, is_active: false/)
  assert.match(source('components/HomepageTicker.jsx'), /data.ticker_enabled !== false/)
  assert.match(source('components/HomepageTicker.css'), /prefers-reduced-motion:reduce/)
  assert.match(source('components/HomepageTicker.css'), /focus-within/)
})

test('ticker links reject executable, credential-bearing and protocol-relative URLs', () => {
  for (const url of ['javascript:alert(1)', '//evil.test', 'https://user:pass@example.test', '/\\evil.test', 'data:text/html,x']) assert.equal(safeAnnouncementLink(url), '')
  assert.equal(safeAnnouncementLink('/products?category=Rice'), '/products?category=Rice')
  assert.equal(safeAnnouncementLink('https://www.foodnova.com.ng/products'), 'https://www.foodnova.com.ng/products')
})

test('only audited mobile-mockup campaign is suppressed; assets and other campaigns are retained', () => {
  assert.equal(isLegacyHomepagePromotion({ image_url: '/uploads/announcement-78637d94fa75434594d783495a18d2c9.png' }), true)
  assert.equal(isLegacyHomepagePromotion({ id:2, image_url:'/other-campaign.png' }), false)
  assert.equal(isLegacyHomepagePromotion({ image_url:'/products/rice.png' }), false)
})

function audioFixture() {
  const calls = { contexts:0, tones:0, stopped:0, suspended:0, closed:0, music:0 }
  class Context {
    constructor() { calls.contexts++; this.currentTime=0; this.state='running' }
    createGain() { return { gain:{ value:0, setTargetAtTime(){}, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){}, disconnect(){} } }
    createOscillator() { calls.tones++; return { frequency:{value:0}, connect(){}, disconnect(){}, start(){}, stop(){ calls.stopped++ } } }
    async resume() { this.state='running' }
    async suspend() { calls.suspended++; this.state='suspended' }
    async close() { calls.closed++ }
  }
  class AudioElement { constructor(){ calls.music++; this.volume=0 } async play(){} pause(){} removeAttribute(){} load(){} }
  return { calls, Context, AudioElement }
}

test('audio starts off, needs opt-in, shares one context, throttles feedback, pauses and cleans up', async () => {
  assert.equal(await createCinematicAudio({ Context:null }).setEnabled(true), false)
  const { calls, Context, AudioElement } = audioFixture()
  let clock=0
  const audio = createCinematicAudio({ Context, AudioElement, now:()=>clock })
  audio.feedback('cart'); assert.equal(calls.contexts,0)
  assert.equal(await audio.toggleMusic(),false)
  await audio.setEnabled(true); await audio.setEnabled(true)
  audio.feedback('cart'); audio.feedback('scene')
  assert.equal(calls.contexts,1); assert.equal(calls.tones,1)
  clock=1000; audio.feedback('cta'); assert.equal(calls.tones,2)
  audio.pause(); clock=2000; audio.feedback(); assert.equal(calls.tones,2)
  await audio.setEnabled(true); audio.feedback(); assert.equal(calls.tones,3)
  audio.dispose(); await audio.setEnabled(true); assert.equal(calls.contexts,1)
  assert.equal(calls.closed,1); assert.equal(calls.music,0)
})

test('music remains unavailable without approved asset and an opted-in configured controller fades safely', async () => {
  const { calls, Context, AudioElement } = audioFixture()
  const timers = new Map(); let seq=0
  const audio = createCinematicAudio({ Context, AudioElement, musicUrl:'/approved-test.ogg', schedule:(fn)=>{timers.set(++seq,fn);return seq}, cancel:(id)=>timers.delete(id) })
  assert.equal(await audio.toggleMusic(),false); assert.equal(calls.music,0)
  await audio.setEnabled(true); assert.equal(await audio.toggleMusic(),true)
  for(let i=0;i<20;i++) for(const fn of [...timers.values()]) fn()
  assert.equal(calls.music,1)
  await audio.setEnabled(false)
  for(let i=0;i<20;i++) for(const fn of [...timers.values()]) fn()
  assert.equal(timers.size,0)
  audio.dispose()
  assert.match(source('components/CinematicAudio.jsx'), /disabled aria-describedby="cinema-music-note"/)
})

test('public tracking uses a number-only POST with no auth, keeps authenticated and capability APIs separate', () => {
  const api = source('services/api.js'), ui = source('components/OrderTracking.jsx')
  assert.match(api, /publicProgress:[^\n]+\/tracking\/public[^\n]+skipAuth: true/)
  assert.match(api, /config.skipAuth/)
  assert.match(ui, /kind: 'public'/)
  assert.match(ui, /privateResult.*status === 'authorized'/)
  assert.doesNotMatch(ui, /full-tracking-email|setEmail|lookup\(code, email\)/)
  assert.match(source('pages/TrackOrderPage.jsx'), /No|Track Your FoodNova Order/)
  assert.match(source('components/Footer.jsx'), /to="\/track-order">Track Order/)
  assert.match(ui, /interval: data.kind === 'public' \? 60000/)
})


test('a missing or rejected future music asset cannot break the homepage audio controller', async () => {
  const { calls, Context, AudioElement } = audioFixture()
  class MissingAsset extends AudioElement { async play() { throw new Error('Synthetic missing recording') } }
  const audio=createCinematicAudio({Context,AudioElement:MissingAsset,musicUrl:'/missing-approved-recording.ogg'})
  await audio.setEnabled(true)
  assert.equal(await audio.toggleMusic(),false)
  assert.doesNotThrow(()=>audio.feedback('cart'))
  audio.dispose()
  assert.equal(calls.closed,1)
})
