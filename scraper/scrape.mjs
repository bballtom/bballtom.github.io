import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  diffFixtures,
  groupTeams,
  londonStamp,
  readFixtures,
  readLeagues,
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

function flatten(data) {
  if (!data?.teams) return []
  return data.teams.flatMap((team) => team.fixtures.map((fixture) => ({
    ...fixture,
    team: team.name,
    teamId: team.id,
  })))
}

async function main() {
  const sources = JSON.parse(await readFile(path.join(root, 'sources.json'), 'utf8'))
  const fixturesPath = path.join(root, 'fixtures.json')
  let previous = { teams: [] }
  try {
    previous = JSON.parse(await readFile(fixturesPath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const scraped = []
  for (const source of sources.sources) {
    console.log(`Reading ${source.name}`)
    const indexHtml = await fetchHtml(source.url)
    const leagues = readLeagues(indexHtml)
    if (leagues.length === 0) {
      throw new Error(`No leagues found at ${source.url}. Left the saved fixtures untouched.`)
    }
    for (const league of leagues) {
      await sleep(DELAY_MS)
      const sourceUrl = new URL(`?id=${league.id}`, source.url).href
      const html = await fetchHtml(sourceUrl)
      const rows = readFixtures(html, {
        leagueId: league.id,
        leagueLabel: league.label,
        sourceUrl,
        defaultHall: sources.defaultHall,
        teamPattern: sources.teamPattern,
      })
      if (rows.length) console.log(`  ${league.label}: ${rows.length}`)
      scraped.push(...rows)
    }
  }

  const nowStamp = londonStamp()
  const previousRows = flatten(previous)
  const merged = diffFixtures(previousRows, scraped, nowStamp)
  const teams = groupTeams(merged)
  const next = {
    checkedAt: nowStamp,
    changedAt: previous.changedAt ?? nowStamp,
    timezone: 'Europe/London',
    defaultHall: sources.defaultHall,
    teams,
  }

  const snapshot = (data) => JSON.stringify(data.teams ?? [])
  if (previous.teams && snapshot(previous) === snapshot(next)) {
    console.log('No fixture changes.')
    return
  }

  next.changedAt = nowStamp
  await writeFile(fixturesPath, `${JSON.stringify(next, null, 2)}\n`)
  const gameCount = teams.reduce((sum, team) => sum + team.fixtures.length, 0)
  console.log(`Saved ${teams.length} teams, ${gameCount} fixtures.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
