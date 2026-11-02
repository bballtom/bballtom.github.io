import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  londonStamp,
  presentSeason,
  readStandings,
  readTableDivisions,
} from './lib.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const USER_AGENT = 'TamesideVikingsFixtures/1.0 (club fixture mirror for parents)'
const DELAY_MS = 250

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) throw new Error(`${response.status} for ${url}`)
  return response.text()
}

async function main() {
  const sources = JSON.parse(await readFile(path.join(root, 'sources.json'), 'utf8'))
  const tablesPath = path.join(root, 'tables.json')
  const fixturesPath = path.join(root, 'fixtures.json')
  let previous = { tables: [] }
  let fixtures = { teams: [] }
  try {
    previous = JSON.parse(await readFile(tablesPath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  try {
    fixtures = JSON.parse(await readFile(fixturesPath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const preferred = presentSeason(fixtures)
  const order = []
  if (preferred) order.push(preferred.kind)
  for (const item of sources.tables ?? []) {
    if (item.season && !order.includes(item.season)) order.push(item.season)
  }

  const teamRe = new RegExp(sources.teamPattern, 'i')
  for (const kind of order) {
    const source = (sources.tables ?? []).find((item) => item.season === kind)
    if (!source) continue
    console.log(`Reading ${source.name} tables`)
    const indexHtml = await fetchHtml(source.url)
    const divisions = readTableDivisions(indexHtml)
    if (divisions.length === 0) {
      console.log(`No leagues at ${source.name}. Skipping it and checking the other season.`)
      continue
    }

    const tables = []
    for (const division of divisions) {
      await sleep(DELAY_MS)
      const sourceUrl = new URL(source.url)
      sourceUrl.searchParams.set('id', division.id)
      const html = await fetchHtml(sourceUrl)
      const rows = readStandings(html)
      if (!rows.some((row) => teamRe.test(row.team))) continue
      console.log(`  ${division.label}: ${rows.length}`)
      tables.push({
        id: division.id,
        leagueId: division.leagueId,
        league: division.league,
        division: division.division,
        sourceUrl: sourceUrl.href,
        rows,
      })
    }

    if (tables.length === 0) {
      console.log(`No Vikings tables at ${source.name}. Checking the other season.`)
      continue
    }

    const next = {
      checkedAt: londonStamp(),
      timezone: 'Europe/London',
      season: preferred?.kind === kind ? preferred.label : source.name,
      tables,
    }
    const snapshot = (data) => JSON.stringify(data.tables ?? [])
    if (previous.season === next.season && snapshot(previous) === snapshot(next)) {
      console.log('No table changes.')
      return
    }

    await writeFile(tablesPath, `${JSON.stringify(next, null, 2)}\n`)
    console.log(`Saved ${tables.length} tables for ${next.season}.`)
    return
  }

  console.log('No leagues on either season. Left the saved tables untouched.')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
