/** Mounts a plugin's view into a jsdom page and hands back the page. */
import { JSDOM } from 'jsdom'

const later = () => new Promise((done) => setTimeout(done, 0))
export const settle = async () => { for (let i = 0; i < 10; i += 1) await later() }

export async function mount(viewModule, api, hash) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `https://instance.test/${hash}`,
  })
  global.window = dom.window
  global.document = dom.window.document
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true })
  global.location = dom.window.location
  global.IS_REACT_ACT_ENVIRONMENT = false
  const [{ createRoot }, { createElement }] = await Promise.all([
    import('react-dom/client'),
    import('react'),
  ])
  const contribution = viewModule(api)
  const root = createRoot(dom.window.document.getElementById('root'))
  root.render(createElement(contribution.component))
  await settle()
  return { dom, document: dom.window.document, root, contribution }
}
