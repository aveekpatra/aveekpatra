// Builds an animated contribution heatmap (dark and light SVG) from the GitHub API.
import { mkdirSync, writeFileSync } from 'node:fs'

const login = process.env.GH_LOGIN
const token = process.env.GH_TOKEN
const out = process.env.OUT_DIR || 'dist'

const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel weekday } }
      }
    }
  }
}`

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, variables: { login } }),
})
const json = await res.json()
if (!json.data?.user) throw new Error(JSON.stringify(json.errors || json))
const cal = json.data.user.contributionsCollection.contributionCalendar

const levels = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 }
const themes = {
  dark: { cells: ['#161b22', '#1f2b4d', '#2e4a8f', '#4f74d1', '#7aa2f7'], text: '#8b949e', strong: '#e6edf3' },
  light: { cells: ['#ebedf0', '#c9d8fb', '#9db8f5', '#6f93ec', '#3f6ad8'], text: '#57606a', strong: '#1f2328' },
}

const cell = 11, gap = 3, step = cell + gap
const left = 34, top = 44
const weeks = cal.weeks
const width = left + weeks.length * step + 24
const height = top + 7 * step + 34
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const font = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`

const fmtDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const plural = (n) => (n === 1 ? 'contribution' : 'contributions')

function render(theme) {
  const t = themes[theme]
  const parts = []
  // month labels at the first week of each month; skip one that would crowd the next
  const starts = []
  let lastMonth = -1
  weeks.forEach((w, i) => {
    const m = new Date(`${w.contributionDays[0].date}T00:00:00Z`).getUTCMonth()
    if (m !== lastMonth) starts.push([i, m]), (lastMonth = m)
  })
  starts.forEach(([i, m], k) => {
    const next = starts[k + 1]
    if ((next && next[0] - i < 3) || i > weeks.length - 3) return
    parts.push(`<text x="${left + i * step}" y="${top - 8}" class="label">${months[m]}</text>`)
  })
  ;[['Mon', 1], ['Wed', 3], ['Fri', 5]].forEach(([d, row]) =>
    parts.push(`<text x="0" y="${top + row * step + cell - 2}" class="label">${d}</text>`),
  )
  weeks.forEach((w, i) => {
    w.contributionDays.forEach((day) => {
      const lvl = levels[day.contributionLevel] ?? 0
      const x = left + i * step, y = top + day.weekday * step
      const delay = (i * 0.022 + day.weekday * 0.01).toFixed(3)
      parts.push(
        `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2.5" fill="${t.cells[lvl]}" class="c" style="animation-delay:${delay}s"><title>${day.contributionCount} ${plural(day.contributionCount)} on ${fmtDate(day.date)}</title></rect>`,
      )
    })
  })
  // legend
  const ly = top + 7 * step + 14
  const lx = width - 24 - 5 * step - 58
  parts.push(`<text x="${lx}" y="${ly + cell - 2}" class="label">Less</text>`)
  t.cells.forEach((c, i) => parts.push(`<rect x="${lx + 28 + i * step}" y="${ly}" width="${cell}" height="${cell}" rx="2.5" fill="${c}"/>`))
  parts.push(`<text x="${lx + 28 + 5 * step + 4}" y="${ly + cell - 2}" class="label">More</text>`)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${cal.totalContributions} contributions in the last year">
<style>
  .label { font: 10px ${font}; fill: ${t.text}; }
  .title { font: 600 14px ${font}; fill: ${t.strong}; }
  .c { transform-box: fill-box; transform-origin: center; opacity: 0; animation: in 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
  @keyframes in { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) { .c { animation: none; opacity: 1; } }
</style>
<text x="${left}" y="16" class="title">${cal.totalContributions.toLocaleString('en-US')} contributions in the last year</text>
${parts.join('\n')}
</svg>
`
}

mkdirSync(out, { recursive: true })
writeFileSync(`${out}/heatmap.svg`, render('dark'))
writeFileSync(`${out}/heatmap-light.svg`, render('light'))
console.log(`${cal.totalContributions} contributions, ${weeks.length} weeks`)
