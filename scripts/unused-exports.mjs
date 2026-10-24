/** Production importers only; stdout is a sorted, reusable file:name list. */
import { readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packages = join(root, 'packages')
const files = readdirSync(packages, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => ts.sys.readDirectory(
    join(packages, entry.name, 'src'),
    ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
  ))
  .sort()
if (!files.length) throw new Error('No package sources found')

// Use the same source aliases as the typecheck, never workspace symlinks
// that might point at another checkout. No compilation or output is needed.
const config = ts.readConfigFile(join(root, 'tsconfig.base.json'), ts.sys.readFile)
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
if (parsed.errors.length) {
  throw new Error(parsed.errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, '\n')).join('\n'))
}
const options = { ...parsed.options, allowJs: true, noEmit: true, jsx: ts.JsxEmit.ReactJSX }
const program = ts.createProgram(files, options)
const checker = program.getTypeChecker()
const sources = files.map((file) => program.getSourceFile(file))
const exportsByFile = new Map(sources.map((source) => {
  const symbol = checker.getSymbolAtLocation(source)
  const names = symbol ? checker.getExportsOfModule(symbol).map((s) => s.name) : []
  return [resolve(source.fileName), new Set(names.filter((name) => name !== 'default' && name !== 'export='))]
}))
const used = new Map(files.map((file) => [resolve(file), new Set()]))

function consume(source, specifier, names) {
  if (!specifier || !ts.isStringLiteralLike(specifier)) return
  const target = ts.resolveModuleName(specifier.text, source.fileName, options, ts.sys).resolvedModule
  if (!target) return // Third-party packages are outside this inventory.
  const file = resolve(target.resolvedFileName)
  if (file === resolve(source.fileName) || !exportsByFile.has(file)) return
  for (const name of names ?? exportsByFile.get(file)) used.get(file).add(name)
}

for (const source of sources) {
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const bindings = node.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        consume(source, node.moduleSpecifier, bindings.elements.map((e) => (e.propertyName ?? e.name).text))
      } else if (bindings) {
        // A namespace imports the whole surface, including computed accesses.
        consume(source, node.moduleSpecifier)
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const names = node.exportClause && ts.isNamedExports(node.exportClause)
        ? node.exportClause.elements.map((e) => (e.propertyName ?? e.name).text)
        : undefined
      consume(source, node.moduleSpecifier, names)
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      let name = node.qualifier
      while (name && ts.isQualifiedName(name)) name = name.left
      consume(source, node.argument.literal, name ? [name.text] : undefined)
    } else if (ts.isCallExpression(node) && (
      node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require')
    )) {
      // Literal dynamic imports / requires can hand their namespace elsewhere.
      consume(source, node.arguments[0])
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      consume(source, node.moduleReference.expression)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

const unused = []
for (const [file, names] of exportsByFile) {
  const path = relative(root, file).replaceAll('\\', '/')
  if (path.startsWith('packages/web/')) continue
  for (const name of names) {
    if (!used.get(file).has(name)) unused.push(`${path}:${name}`)
  }
}
unused.sort()
for (const entry of unused) console.log(entry)
console.error(`${unused.length} named exports without another production importer`)
