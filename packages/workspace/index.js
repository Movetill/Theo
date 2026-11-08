import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, link, mkdir, open, readdir, rmdir, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { CoreError, parseDesign } from '../core/dist/index.js'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const revisionFile = /^rev-([1-9][0-9]*)\.json$/
const designLimit = 1024 ** 2
const runLimit = 9 * 1024 ** 2
const traceSemantics = 'two-state-synchronous-rising-edge-v1'

function isId(id, prefix) {
  return typeof id === 'string' && id.startsWith(prefix) && uuid.test(id.slice(prefix.length))
}

function checkId(id, field) {
  const prefix = field === 'designId' ? 'd_' : 'r_'
  if (!isId(id, prefix)) throw new CoreError('INVALID_SCHEMA', 'Expected a generated Theo ID', `$.${field}`)
}

function checkRevision(revision, field = 'revision') {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new CoreError('INVALID_SCHEMA', 'Expected a positive safe integer revision', `$.${field}`)
  }
}

function conflict(expected, actual) {
  return new CoreError('REVISION_CONFLICT', `Expected revision ${expected}; current revision is ${actual}`, '$.expectedRevision')
}

async function directory(path, create = false) {
  try {
    if (create) {
      try { await mkdir(path, { mode: 0o700 }) }
      catch (error) { if (error.code !== 'EEXIST') throw error }
    }
    if (!(await lstat(path)).isDirectory()) {
      throw new CoreError('UNSAFE_WORKSPACE_PATH', 'Workspace directory must be a real directory', '$.workspace')
    }
  } catch (error) {
    if (error.code === 'ENOENT') throw new CoreError('NOT_FOUND', 'Workspace directory does not exist', '$.workspace')
    throw error
  }
  return path
}

async function readRecord(path, maxBytes, field) {
  try {
    const entry = await lstat(path)
    if (!entry.isFile()) throw new CoreError('UNSAFE_WORKSPACE_PATH', 'Workspace record must be a regular file', field)
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.dev !== entry.dev || stat.ino !== entry.ino) {
        throw new CoreError('UNSAFE_WORKSPACE_PATH', 'Workspace record changed during open', field)
      }
      if (stat.size > maxBytes) throw new CoreError('RESOURCE_LIMIT', 'Workspace record exceeds size limit', field)
      const buffer = Buffer.alloc(stat.size + 1)
      let offset = 0
      while (offset < buffer.length) {
        const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset)
        if (!bytesRead) break
        offset += bytesRead
      }
      if (offset !== stat.size) throw new CoreError('WORKSPACE_CORRUPT', 'Workspace record changed while reading', field)
      try { return JSON.parse(buffer.toString('utf8', 0, offset)) }
      catch { throw new CoreError('WORKSPACE_CORRUPT', 'Workspace record is not valid JSON', field) }
    } finally {
      await file.close()
    }
  } catch (error) {
    if (error.code === 'ENOENT') throw new CoreError('NOT_FOUND', 'Workspace record does not exist', field)
    if (error.code === 'ELOOP') throw new CoreError('UNSAFE_WORKSPACE_PATH', 'Workspace record may not be a symlink', field)
    throw error
  }
}

// Publish a complete immutable record only if its destination name is still free.
async function publish(dir, name, value, maxBytes) {
  const data = JSON.stringify(value)
  if (Buffer.byteLength(data) > maxBytes) throw new CoreError('RESOURCE_LIMIT', 'Workspace record exceeds size limit', '$.workspace')
  const temp = join(dir, `.${randomUUID()}.tmp`)
  const file = await open(temp, 'wx', 0o600)
  try {
    try {
      await file.writeFile(data, 'utf8')
      await file.sync()
    } finally {
      await file.close()
    }
    await link(temp, join(dir, name))
  } finally {
    await unlink(temp).catch(() => {})
  }
}

async function latestRevision(dir) {
  let latest = 0
  for (const name of await readdir(dir)) {
    const revision = Number(revisionFile.exec(name)?.[1])
    if (Number.isSafeInteger(revision) && revision > latest) latest = revision
  }
  return latest
}

export class DesignStore {
  #root

  constructor(root) {
    this.#root = resolve(root)
  }

  async #collection(name, create = false) {
    if (create) await mkdir(dirname(this.#root), { recursive: true, mode: 0o700 })
    await directory(this.#root, create)
    return directory(join(this.#root, name), create)
  }

  async create(candidate) {
    const design = parseDesign(candidate)
    const id = 'd_' + randomUUID()
    const designs = await this.#collection('designs', true)
    const dir = join(designs, id)
    await mkdir(dir, { mode: 0o700 })
    try {
      await publish(dir, 'rev-1.json', { ...design, id, revision: 1 }, designLimit)
    } catch (error) {
      await rmdir(dir).catch(() => {})
      throw error
    }
    return { id, revision: 1 }
  }

  async get(id, revision) {
    checkId(id, 'designId')
    if (revision !== undefined) checkRevision(revision)
    const dir = await directory(join(await this.#collection('designs'), id))
    const selected = revision ?? await latestRevision(dir)
    if (!selected) throw new CoreError('NOT_FOUND', 'Design has no saved revision', '$.designId')
    const design = parseDesign(await readRecord(join(dir, `rev-${selected}.json`), designLimit, '$.designId'))
    if (design.id !== id || design.revision !== selected) {
      throw new CoreError('WORKSPACE_CORRUPT', 'Stored design identity does not match its revision file', '$.designId')
    }
    return design
  }

  async update(id, expectedRevision, candidate) {
    checkId(id, 'designId')
    checkRevision(expectedRevision, 'expectedRevision')
    const dir = await directory(join(await this.#collection('designs'), id))
    const current = await this.get(id)
    if (current.revision !== expectedRevision) throw conflict(expectedRevision, current.revision)
    const design = parseDesign(candidate)
    if (design.id !== id || design.revision !== expectedRevision) {
      throw new CoreError('INVALID_SCHEMA', 'Design must carry its original ID and expected revision', '$.design')
    }
    const revision = expectedRevision + 1
    checkRevision(revision)
    try {
      await publish(dir, `rev-${revision}.json`, { ...design, revision }, designLimit)
    } catch (error) {
      if (error.code === 'EEXIST') throw conflict(expectedRevision, await latestRevision(dir))
      throw error
    }
    return { revision }
  }

  async list() {
    let designs
    try { designs = await this.#collection('designs') }
    catch (error) {
      if (error.code === 'NOT_FOUND') return []
      throw error
    }
    const result = []
    for (const id of (await readdir(designs)).sort()) {
      if (!isId(id, 'd_')) continue
      try {
        const { name, revision } = await this.get(id)
        result.push({ id, name, revision })
      } catch (error) {
        if (error.code !== 'NOT_FOUND') throw error
      }
    }
    return result
  }

  async saveRun(trace) {
    const runId = 'r_' + randomUUID()
    const runs = await this.#collection('runs', true)
    await publish(runs, `${runId}.json`, { runId, trace }, runLimit)
    return runId
  }

  async getRun(runId) {
    checkId(runId, 'runId')
    const runs = await this.#collection('runs')
    const record = await readRecord(join(runs, `${runId}.json`), runLimit, '$.runId')
    const trace = record?.trace
    if (record?.runId !== runId || trace?.semantics !== traceSemantics || !isId(trace.designId, 'd_')
      || !Number.isSafeInteger(trace.designRevision) || trace.designRevision < 1
      || !Array.isArray(trace.steps) || trace.steps.length < 1 || trace.steps.length > 10_000
      || !trace.steps.every((step, index) => step?.cycle === index)) {
      throw new CoreError('WORKSPACE_CORRUPT', 'Invalid stored simulation trace', '$.runId')
    }
    return trace
  }
}
