/** AD-26: structural guards for the bench, without a browser or a running server. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const paths = execFileSync('git', ['grep', '-l', '-E', 'loadPlaywright|launch|createFakeEngine|engine|scripts', '--', 'bench/*.mjs'], {
  cwd: root, encoding: 'utf8',
}).trim().split('\n').filter(Boolean)
const sources = paths.map((path) => ts.createSourceFile(path, readFileSync(join(root, path), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS))
const walk = (node, visit) => {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}
const definitions = (name, accepts = () => true) => {
  const found = []
  for (const source of sources) walk(source, (node) => {
    const fn = ts.isFunctionDeclaration(node) ? node
      : ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) ? node.initializer : undefined
    if (fn && node.name?.getText(source) === name && accepts(fn)) {
      found.push(`${source.fileName}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`)
    }
  })
  return found
}

test('loadPlaywright has one definition in bench/', () => {
  const found = definitions('loadPlaywright')
  assert.equal(found.length, 1, `loadPlaywright definitions: ${found.join(', ')}`)
})

test('launch(seed) has one definition; scenario launchers keep their own signatures', () => {
  const found = definitions('launch', (fn) => fn.parameters[0] && ts.isIdentifier(fn.parameters[0].name) && fn.parameters[0].name.text === 'seed')
  assert.equal(found.length, 1, `launch(seed) definitions: ${found.join(', ')}`)
})

test('every fake-engine option is supplied by a seed or scenario', () => {
  const engine = sources.find((source) => source.fileName === 'bench/fake-engine.mjs')
  const factory = engine.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'createFakeEngine')
  assert.ok(factory, 'createFakeEngine must exist')
  const binding = factory.parameters[0]?.name
  assert.ok(binding && ts.isObjectBindingPattern(binding), 'createFakeEngine must declare its options')
  const options = binding.elements.map((element) => (element.propertyName ?? element.name).getText(engine))
  const supplied = new Set()
  const properties = (value) => {
    if (value && ts.isObjectLiteralExpression(value)) {
      for (const property of value.properties) if (property.name) supplied.add(property.name.getText().replace(/^['"]|['"]$/g, ''))
    }
  }
  for (const source of sources.filter((source) => /^bench\/(seed|scenarios)\//.test(source.fileName))) {
    for (const statement of source.statements) {
      if (ts.isVariableStatement(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const declaration of statement.declarationList.declarations) {
          if (declaration.name.getText(source) === 'scripts') supplied.add('scripts')
          if (declaration.name.getText(source) === 'engine') properties(declaration.initializer)
        }
      }
    }
    walk(source, (node) => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'createFakeEngine') properties(node.arguments[0])
    })
  }
  assert.deepEqual(options.filter((option) => !supplied.has(option)), [], `fake-engine options without a caller; supplied: ${[...supplied].join(', ')}`)
})
