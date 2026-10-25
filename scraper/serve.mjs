import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT) || 4173
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
}

function fileFor(urlPath) {
  const requestPath = decodeURIComponent(urlPath.split('?')[0])
  const rel = requestPath === '/' ? '/index.html' : requestPath
  const full = path.resolve(root, `.${rel}`)
  const fromRoot = path.relative(root, full)
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) return null
  return full
}

const server = createServer(async (request, response) => {
  const full = fileFor(request.url ?? '/')
  if (!full) {
    response.writeHead(400)
    response.end('Bad path')
    return
  }
  try {
    const body = await readFile(full)
    const ext = path.extname(full)
    response.writeHead(200, {
      'Content-Type': types[ext] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    response.end(body)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  }
})

server.listen(port, () => {
  console.log(`Fixtures board at http://localhost:${port}`)
})
