import puppeteer, { type Browser, type ConsoleMessage, type Page } from 'puppeteer-core'

const APP_TITLE = 'Paulus Orchestrator'
const DEBUG_URL = 'http://localhost:9222'
const DEFAULT_SCREENSHOT_PATH = '/tmp/paulus-app.png'

type InspectorLogEntry = {
  timestamp: string
  level: string
  text: string
}

type SnapshotEntry = {
  tag: string
  text: string
  role: string | null
  id: string | null
  name: string | null
  placeholder: string | null
}

declare global {
  interface Window {
    __PAULUS_INSPECTOR__?: {
      clearLogs: () => void
      getLogs: () => InspectorLogEntry[]
      getSnapshot: () => SnapshotEntry[]
    }
  }
}

async function main() {
  const action = process.argv[2] || 'help'

  if (action === 'help') {
    printHelp()
    return
  }

  const browser = await puppeteer.connect({
    browserURL: DEBUG_URL,
  })

  if (action === 'pages') {
    const pages = await browser.pages()
    const data = await Promise.all(
      pages.map(async (page) => ({
        title: await safeTitle(page),
        url: page.url(),
      })),
    )
    console.log(JSON.stringify(data, null, 2))
    browser.disconnect()
    return
  }

  const appPage = await getAppPage(browser)

  switch (action) {
    case 'screenshot': {
      const outputPath = process.argv[3] || DEFAULT_SCREENSHOT_PATH
      await appPage.screenshot({ path: outputPath, fullPage: true })
      console.log(`Screenshot saved to ${outputPath}`)
      break
    }
    case 'eval': {
      const code = process.argv[3]
      if (!code) {
        throw new Error('Usage: bun scripts/inspect-app.ts eval "expression"')
      }
      const result = await appPage.evaluate((source) => globalThis.eval(source), code)
      console.log(JSON.stringify(result, null, 2))
      break
    }
    case 'click': {
      const selector = process.argv[3]
      if (!selector) {
        throw new Error('Usage: bun scripts/inspect-app.ts click "selector"')
      }
      await appPage.waitForSelector(selector)
      await appPage.click(selector)
      console.log(`Clicked: ${selector}`)
      break
    }
    case 'click-text': {
      const text = process.argv[3]
      if (!text) {
        throw new Error('Usage: bun scripts/inspect-app.ts click-text "button text"')
      }
      await clickByText(appPage, text)
      console.log(`Clicked button-like element: ${text}`)
      break
    }
    case 'type': {
      const selector = process.argv[3]
      const text = process.argv[4]
      if (!selector || text === undefined) {
        throw new Error('Usage: bun scripts/inspect-app.ts type "selector" "text"')
      }
      await appPage.waitForSelector(selector)
      await appPage.evaluate((targetSelector) => {
        const element = document.querySelector(targetSelector)
        if (!element) {
          throw new Error(`Could not find element: ${targetSelector}`)
        }

        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          element.value = ''
          element.dispatchEvent(new Event('input', { bubbles: true }))
          return
        }

        if (element instanceof HTMLElement && element.isContentEditable) {
          element.textContent = ''
          element.dispatchEvent(new InputEvent('input', { bubbles: true }))
          return
        }

        throw new Error(`Element is not editable: ${targetSelector}`)
      }, selector)
      await appPage.type(selector, text)
      console.log(`Typed into ${selector}`)
      break
    }
    case 'press': {
      const key = process.argv[3]
      if (!key) {
        throw new Error('Usage: bun scripts/inspect-app.ts press "Enter"')
      }
      await appPage.keyboard.press(key)
      console.log(`Pressed: ${key}`)
      break
    }
    case 'wait-text': {
      const text = process.argv[3]
      if (!text) {
        throw new Error('Usage: bun scripts/inspect-app.ts wait-text "text"')
      }
      await appPage.waitForFunction((needle) => document.body.innerText.includes(needle), {}, text)
      console.log(`Found text: ${text}`)
      break
    }
    case 'html': {
      const html = await appPage.content()
      console.log(html)
      break
    }
    case 'snapshot': {
      await waitForInspector(appPage)
      const snapshot = await appPage.evaluate(
        () => window.__PAULUS_INSPECTOR__?.getSnapshot() ?? [],
      )
      console.log(JSON.stringify(snapshot, null, 2))
      break
    }
    case 'logs': {
      await waitForInspector(appPage)
      const follow = process.argv.includes('--follow')
      const clear = process.argv.includes('--clear')
      const logs = await appPage.evaluate(() => window.__PAULUS_INSPECTOR__?.getLogs() ?? [])
      printLogs(logs)
      if (clear) {
        await appPage.evaluate(() => window.__PAULUS_INSPECTOR__?.clearLogs())
      }
      if (follow) {
        appPage.on('console', (message) => {
          process.stdout.write(formatConsoleMessage(message))
        })
        appPage.on('pageerror', (error) => {
          process.stdout.write(
            `${new Date().toISOString()} [pageerror] ${error.stack ?? error.message}\n`,
          )
        })
        await new Promise(() => {})
      }
      break
    }
    default:
      throw new Error(`Unknown action: ${action}`)
  }

  browser.disconnect()
}

async function getAppPage(browser: Browser): Promise<Page> {
  const pages = await browser.pages()
  for (const page of pages) {
    if ((await safeTitle(page)) === APP_TITLE) {
      return page
    }
  }

  const availablePages = await Promise.all(
    pages.map(async (page) => `- ${await safeTitle(page)} (${page.url()})`),
  )
  throw new Error(
    `Could not find ${APP_TITLE} page on ${DEBUG_URL}. Available pages:\n${availablePages.join('\n')}`,
  )
}

async function safeTitle(page: Page): Promise<string> {
  try {
    return await page.title()
  } catch {
    return '(unavailable title)'
  }
}

async function waitForInspector(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__PAULUS_INSPECTOR__))
}

async function clickByText(page: Page, text: string): Promise<void> {
  const clicked = await page.evaluate((needle) => {
    const candidates = [
      ...document.querySelectorAll<HTMLElement>(
        'button, [role="button"], a, input[type="button"], input[type="submit"]',
      ),
    ]

    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
    const target = candidates.find((element) => {
      const elementText =
        element.textContent ||
        ('value' in element ? String((element as HTMLInputElement).value || '') : '')
      return normalize(elementText) === normalize(needle)
    })

    if (!target) {
      return false
    }

    target.click()
    return true
  }, text)

  if (!clicked) {
    throw new Error(`Could not find button-like element with text: ${text}`)
  }
}

function printHelp() {
  console.log(`Usage: bun scripts/inspect-app.ts <command>

Commands:
  help
  pages
  screenshot [path]
  html
  snapshot
  eval "expression"
  click "selector"
  click-text "visible text"
  type "selector" "text"
  press "Enter"
  wait-text "text"
  logs [--follow] [--clear]`)
}

function printLogs(logs: InspectorLogEntry[]) {
  for (const log of logs) {
    process.stdout.write(`${log.timestamp} [${log.level}] ${log.text}\n`)
  }
}

function formatConsoleMessage(message: ConsoleMessage): string {
  const location = message.location()
  const suffix =
    location.url && location.lineNumber !== undefined
      ? ` (${location.url}:${location.lineNumber + 1})`
      : ''
  return `${new Date().toISOString()} [console:${message.type()}] ${message.text()}${suffix}\n`
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})

export {}
