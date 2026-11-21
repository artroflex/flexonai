import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = path.join(root, 'public', 'downloads')
fs.mkdirSync(directory, { recursive: true })
await new Promise((resolve, reject) => {
  const output = fs.createWriteStream(path.join(directory, 'artroblog-connector.zip'))
  const archive = archiver('zip', { zlib: { level: 9 } })
  output.on('close', resolve); output.on('error', reject); archive.on('error', reject)
  archive.pipe(output); archive.directory(path.join(root, 'connector'), false); archive.finalize()
})
console.log('Created artroblog-connector.zip')
