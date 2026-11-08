import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DesignStore } from '../packages/workspace/index.js'

const counter = async () => JSON.parse(await readFile(new URL('../examples/counter4-decoder/design.json', import.meta.url), 'utf8'))
async function workspace(t) {
  const folder = await mkdtemp(join(tmpdir(), 'theo-store-'))
  t.after(() => rm(folder, { recursive: true, force: true }))
  return { folder, root: join(folder, 'workspace') }
}

test('M4 store persists versions and only one concurrent update can publish the next revision', async t => {
  const { root } = await workspace(t)
  const a = new DesignStore(root)
  const b = new DesignStore(root)
  assert.deepEqual(await a.list(), [])
  const candidate = await counter()
  const { id, revision } = await a.create(candidate)
  assert.notEqual(id, candidate.id)
  assert.equal(revision, 1)
  const original = await b.get(id)
  const competing = await Promise.allSettled([
    a.update(id, 1, { ...original, name: 'First edit' }),
    b.update(id, 1, { ...original, name: 'Second edit' }),
  ])
  const winner = competing.findIndex(result => result.status === 'fulfilled')
  assert.ok(winner >= 0)
  assert.deepEqual(competing[winner].value, { revision: 2 })
  assert.equal(competing[1 - winner].reason.code, 'REVISION_CONFLICT')
  const fresh = new DesignStore(root)
  assert.deepEqual(await fresh.get(id, 1), original)
  const latest = await fresh.get(id)
  assert.equal(latest.revision, 2)
  assert.equal(latest.name, winner === 0 ? 'First edit' : 'Second edit')
  assert.deepEqual(await fresh.list(), [{ id, revision: 2, name: latest.name }])
  assert.deepEqual((await readdir(join(root, 'designs', id))).sort(), ['rev-1.json', 'rev-2.json'])
  await assert.rejects(fresh.update(id, 2, { ...latest, ports: [] }), { code: 'UNKNOWN_REFERENCE' })
  assert.deepEqual(await fresh.get(id), latest)
  await assert.rejects(fresh.get(id, 3), { code: 'NOT_FOUND' })
})

test('M4 store rejects traversal, symlinked directories and symlinked revision files', async t => {
  const { root, folder } = await workspace(t)
  const store = new DesignStore(root)
  await assert.rejects(store.get('../outside'), { code: 'INVALID_SCHEMA' })
  await assert.rejects(store.getRun('/tmp/outside'), { code: 'INVALID_SCHEMA' })
  const outside = join(folder, 'outside')
  await mkdir(outside)
  await symlink(outside, root, 'dir')
  await assert.rejects(store.create(await counter()), { code: 'UNSAFE_WORKSPACE_PATH' })
  assert.deepEqual(await readdir(outside), [])
  await rm(root)
  const { id } = await store.create(await counter())
  const record = join(root, 'designs', id, 'rev-1.json')
  const target = join(outside, 'record.json')
  await writeFile(target, JSON.stringify(await store.get(id)))
  await rm(record)
  await symlink(target, record)
  await assert.rejects(store.get(id), { code: 'UNSAFE_WORKSPACE_PATH' })
  await assert.rejects(store.update(id, 1, await counter()), { code: 'UNSAFE_WORKSPACE_PATH' })
})

test('M4 store rejects malformed records and mismatched identities on read', async t => {
  const { root } = await workspace(t)
  const store = new DesignStore(root)
  const { id } = await store.create(await counter())
  const saved = await store.get(id)
  const path = join(root, 'designs', id, 'rev-1.json')
  await writeFile(path, '{')
  await assert.rejects(store.get(id), { code: 'WORKSPACE_CORRUPT' })
  await writeFile(path, JSON.stringify({ ...saved, revision: 2 }))
  await assert.rejects(store.get(id), { code: 'WORKSPACE_CORRUPT' })
})
