import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  londonStamp,
  mergeResults,
  readResultLeagues,
  readResults,
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

function stored(row) {
  return {
    season: row.season,
    leagueId: String(row.leagueId),
    league: row.league,
    division: row.division ?? '',
    date: row.date,
    time: row.time ?? '',
    team: row.team,
    teamId: row.teamId,
    opponent: row.opponent,
    teamScore: row.teamScore,
    opponentScore: row.opponentScore,
    outcome: row.outcome,
    sourceUrl: row.sourceUrl,
  }
}

async function main() {
  const sources = JSON.parse(await readFile(path.join(root, 'sources.json'), 'utf8'))
  const resultsPath = path.join(root, 'results.json')
  let previous = { results: [] }
  try {
    previous = JSON.parse(await readFile(resultsPath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const scraped = []
  let sawLeagues = false
  for (const source of sources.results ?? []) {
    console.log(`Reading ${source.name} results`)
    const indexHtml = await fetchHtml(source.url)
    const leagues = readResultLeagues(indexHtml)
    if (leagues.length === 0) {
      console.log(`No leagues at ${source.name}. Skipping it and checking the other season.`)
      continue
    }
    sawLeagues = true
    for (const league of leagues) {
      await sleep(DELAY_MS)
      const sourceUrl = new URL(source.url)
      sourceUrl.searchParams.set('id', league.id)
      if (league.seasonId) sourceUrl.searchParams.set('season', league.seasonId)
      const html = await fetchHtml(sourceUrl)
      const rows = readResults(html, {
        leagueId: league.id,
        leagueLabel: league.label,
        sourceUrl: sourceUrl.href,
        teamPattern: sources.teamPattern,
      })
      if (rows.length) console.log(`  ${league.label}: ${rows.length}`)
      scraped.push(...rows)
    }
  }

  if (!sawLeagues) {
    console.log('No leagues on either season. Left the saved results untouched.')
    return
  }

  const merged = mergeResults(previous.results ?? [], scraped).results.map(stored)
  const before = (previous.results ?? []).map(stored)
  if (JSON.stringify(before) === JSON.stringify(merged)) {
    console.log('No result changes.')
    return
  }

  const next = {
    checkedAt: londonStamp(),
    timezone: 'Europe/London',
    results: merged,
  }
  await writeFile(resultsPath, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`Saved ${merged.length} results.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
