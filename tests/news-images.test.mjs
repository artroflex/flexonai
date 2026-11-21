import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { generateImageBatch, NEWS_IMAGE_MODEL } from '../lib/automation/imageBatch.ts'

const png = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#ffedd5' } }).png().toBuffer()
const subjects = Array.from({ length: 5 }, (_, i) => ({ label: `구간 ${i}`, context: `확인된 소식 ${i}` }))
test('five distinct prompts yield five ordered PNGs with at most two concurrent requests', async () => {
  let active = 0, maxActive = 0
  const prompts = [], stored = [], removed = []
  const images = await generateImageBatch('fixture-key-not-a-secret', subjects, {
    request: async (url, init) => {
      active++; maxActive = Math.max(active, maxActive)
      assert.equal(url, 'https://api.openai.com/v1/images/generations')
      const body = JSON.parse(init.body)
      assert.equal(body.model, NEWS_IMAGE_MODEL); assert.equal(body.n, 1); assert.equal(body.output_format, 'png')
      prompts.push(body.prompt)
      await new Promise(resolve => setTimeout(resolve, 5))
      active--
      return Response.json({ data: [{ b64_json: png.toString('base64') }] })
    },
    store: async (index, bytes) => { assert.equal((await sharp(bytes).metadata()).format, 'png'); stored.push(index); return { path: `fixture-${index}`, url: `https://example.invalid/${index}.png` } },
    remove: async paths => { removed.push(...paths) },
  })
  assert.equal(maxActive, 2)
  assert.equal(new Set(prompts).size, 5)
  assert.deepEqual(images, subjects.map((_, i) => `https://example.invalid/${i}.png`))
  assert.equal(stored.length, 5); assert.deepEqual(removed, [])
})
test('image failure cleans successful partial uploads and never retries or starts the last batch', async () => {
  let calls = 0
  const stored = [], removed = []
  await assert.rejects(generateImageBatch('fixture-key-not-a-secret', subjects, {
    request: async () => { const call = calls++; return call === 2 ? Response.json({ error: {} }, { status: 403 }) : Response.json({ data: [{ b64_json: png.toString('base64') }] }) },
    store: async index => { stored.push(`fixture-${index}`); return { path: `fixture-${index}`, url: `https://example.invalid/${index}.png` } },
    remove: async paths => { removed.push(...paths) },
  }), /이용 권한/)
  assert.equal(calls, 4)
  assert.deepEqual(removed.sort(), stored.sort())
  assert.ok(!stored.includes('fixture-4'))
})
