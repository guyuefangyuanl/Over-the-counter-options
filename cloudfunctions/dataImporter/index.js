const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function excelDateToJSDate(serial) {
  if (typeof serial !== 'number') return new Date()
  const utc_days = Math.floor(serial - 25569)
  const utc_value = utc_days * 86400
  return new Date(utc_value * 1000)
}

function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex')
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withConcurrency(items, limit, fn) {
  const results = []
  let index = 0
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (index < items.length) {
      const currentIndex = index++
      results[currentIndex] = await fn(items[currentIndex], currentIndex)
    }
  })
  await Promise.all(workers)
  return results
}

function normalizeString(v) {
  return typeof v === 'string' ? v.trim() : v
}

function normalizeCode(v) {
  const s = normalizeString(v)
  if (s == null) return ''
  const m = String(s).match(/\d{6}/)
  return m ? m[0] : ''
}

function buildDefaultFieldMap(headers) {
  const fieldMap = {
    '代码': 'code',
    '名称': 'name',
    '现价': 'price',
    '最新价': 'price',
    '涨跌幅': 'changePercent',
    '日期': 'date'
  }
  const resolved = {}
  headers.forEach(h => {
    if (!h) return
    const key = String(h).trim()
    resolved[key] = fieldMap[key] || key
  })
  return resolved
}

function parseRowsFromSheet(sheetData, options) {
  const headers = sheetData[0] || []
  const rows = sheetData.slice(1)
  const map = options && options.fieldMap ? options.fieldMap : buildDefaultFieldMap(headers)
  const docs = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue
    const doc = {}
    headers.forEach((header, index) => {
      const rawHeader = header == null ? '' : String(header).trim()
      if (!rawHeader) return
      const dbField = map[rawHeader] || rawHeader
      let value = row[index]
      if (dbField === 'date' && typeof value === 'number') value = excelDateToJSDate(value)
      doc[dbField] = value
    })
    const code = normalizeCode(doc.code)
    if (!code) continue
    doc.code = code
    if (doc.name != null) doc.name = normalizeString(doc.name)
    docs.push(doc)
  }

  return docs
}

async function getExistingIdMapByCodes(codes) {
  const idMap = {}
  const uniqueCodes = Array.from(new Set(codes.filter(Boolean)))
  const chunkSize = 100
  for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
    const chunk = uniqueCodes.slice(i, i + chunkSize)
    const res = await db.collection('quotes').where({ code: _.in(chunk) }).field({ _id: true, code: true }).get()
    res.data.forEach(item => {
      if (item && item.code && item._id) idMap[item.code] = item._id
    })
    await sleep(50)
  }
  return idMap
}

async function upsertQuotes(docs, existingIdMap, options) {
  const now = db.serverDate()
  const writeConcurrency = (options && options.writeConcurrency) || 10
  const staticFieldsOnly = options && options.staticFieldsOnly === true
  const allowedStaticFields = new Set(
    (options && options.allowedStaticFields) || [
      'code',
      'name',
      'group',
      'type',
      'term',
      'structure',
      'dealers',
      'rates',
      'strike',
      'expiry',
      'underlying',
      'underlyingName'
    ]
  )

  const tasks = docs.map(doc => async () => {
    const code = doc.code
    const existingId = existingIdMap[code]
    const payload = { ...doc, updateTime: now }
    if (staticFieldsOnly) {
      Object.keys(payload).forEach(k => {
        if (!allowedStaticFields.has(k) && k !== 'updateTime' && k !== 'code') delete payload[k]
      })
    }
    if (existingId) {
      await db.collection('quotes').doc(existingId).update({ data: payload })
      return { kind: 'update', code }
    }
    await db.collection('quotes').add({ data: { ...payload, _id: code, createTime: now } })
    return { kind: 'add', code }
  })

  const results = await withConcurrency(tasks, writeConcurrency, t => t())
  const summary = { added: 0, updated: 0 }
  results.forEach(r => {
    if (!r) return
    if (r.kind === 'add') summary.added++
    if (r.kind === 'update') summary.updated++
  })
  return summary
}

async function ensureImportJob(job) {
  const now = db.serverDate()
  const options = { staticFieldsOnly: true, ...(job.options || {}) }
  const created = await db.collection('import_jobs').add({
    data: {
      type: job.type || 'quotes_excel',
      fileID: job.fileID,
      fileName: job.fileName || '',
      storagePrefix: job.storagePrefix || 'imports/quotes/',
      status: 'pending',
      createdAt: now,
      meta: job.meta || {},
      options
    }
  })
  return created._id
}

async function claimJob(jobId) {
  return db.runTransaction(async transaction => {
    const ref = db.collection('import_jobs').doc(jobId)
    const snap = await transaction.get(ref)
    const data = snap && snap.data && snap.data[0]
    if (!data) return { ok: false, reason: 'NOT_FOUND' }
    if (data.status !== 'pending') return { ok: false, reason: 'NOT_PENDING' }
    await transaction.update(ref, { data: { status: 'processing', startedAt: db.serverDate() } })
    return { ok: true, job: data }
  })
}

async function finishJob(jobId, patch) {
  await db.collection('import_jobs').doc(jobId).update({ data: { ...patch, finishedAt: db.serverDate() } })
}

async function findDuplicateJobBySha1(fileSha1) {
  if (!fileSha1) return null
  const res = await db.collection('import_jobs').where({ fileSha1 }).field({ _id: true, status: true }).limit(1).get()
  return res.data && res.data[0] ? res.data[0] : null
}

async function importFileToQuotes(params) {
  const { fileID, jobId, options } = params
  
  // P0 Fix: Prevent OOM by checking file size before full load
  // Cloud function memory is limited. 5MB Excel is already dangerous for node-xlsx.
  const MAX_FILE_SIZE = 5 * 1024 * 1024 
  
  // Note: cloud.downloadFile loads content into memory (buffer).
  // If file is huge, downloadFile itself might OOM.
  // But we can check buffer length immediately.
  
  const download = await cloud.downloadFile({ fileID })
  const buffer = download.fileContent
  
  if (buffer.length > MAX_FILE_SIZE) {
    const errorMsg = `File too large (${(buffer.length / 1024 / 1024).toFixed(2)}MB). Max allowed: 5MB.`
    if (jobId) await finishJob(jobId, { status: 'failed', error: errorMsg })
    return { success: false, error: errorMsg }
  }

  const fileSha1 = sha1(buffer)

  if (jobId) {
    const dup = await findDuplicateJobBySha1(fileSha1)
    if (dup && dup._id !== jobId && (dup.status === 'success' || dup.status === 'skipped')) {
      await finishJob(jobId, { status: 'skipped', fileSha1, summary: { reason: 'DUPLICATE_FILE', duplicateJobId: dup._id } })
      return { success: true, skipped: true, fileSha1, duplicateJobId: dup._id }
    }
  }

  const sheets = xlsx.parse(buffer)
  const first = sheets[0]
  const sheetData = first && first.data ? first.data : []
  if (!sheetData || sheetData.length < 2) {
    if (jobId) await finishJob(jobId, { status: 'failed', fileSha1, error: 'EMPTY_SHEET' })
    return { success: false, error: 'EMPTY_SHEET' }
  }

  const docs = parseRowsFromSheet(sheetData, options)
  const codes = docs.map(d => d.code)
  const existingIdMap = await getExistingIdMapByCodes(codes)
  const summary = await upsertQuotes(docs, existingIdMap, options)

  if (jobId) await finishJob(jobId, { status: 'success', fileSha1, totalRows: docs.length, summary })
  return { success: true, fileSha1, totalRows: docs.length, summary }
}

async function processPendingJobs(eventOptions) {
  const effectiveOptions = { staticFieldsOnly: true, ...(eventOptions || {}) }
  const batchSize = effectiveOptions.batchSize || 3
  const res = await db.collection('import_jobs').where({ status: 'pending' }).orderBy('createdAt', 'asc').limit(batchSize).get()
  const jobs = res.data || []
  const results = []
  for (const job of jobs) {
    const claim = await claimJob(job._id)
    if (!claim.ok) continue
    try {
      const r = await importFileToQuotes({ fileID: job.fileID, jobId: job._id, options: job.options || effectiveOptions })
      results.push({ jobId: job._id, ...r })
    } catch (e) {
      const message = e && e.message ? e.message : String(e)
      await finishJob(job._id, { status: 'failed', error: message })
      results.push({ jobId: job._id, success: false, error: message })
    }
    await sleep(100)
  }
  return { success: true, processed: results.length, results }
}

exports.main = async (event, context) => {
  try {
    if (event && event.createJob) {
      const fileID = event.fileID
      if (!fileID) return { success: false, msg: 'No fileID provided' }
      const jobId = await ensureImportJob({
        type: event.type,
        fileID,
        fileName: event.fileName,
        storagePrefix: event.storagePrefix,
        meta: event.meta,
        options: event.options
      })
      if (event.processNow === true) {
        const claim = await claimJob(jobId)
        if (!claim.ok) return { success: false, msg: claim.reason, jobId }
        try {
          const r = await importFileToQuotes({ fileID: claim.job.fileID, jobId, options: claim.job.options })
          return { ...r, jobId }
        } catch (e) {
          const message = e && e.message ? e.message : String(e)
          await finishJob(jobId, { status: 'failed', error: message })
          return { success: false, error: message, jobId }
        }
      }
      return { success: true, jobId }
    }

    const jobId = event && event.jobId ? String(event.jobId) : ''
    if (jobId) {
      const claim = await claimJob(jobId)
      if (!claim.ok) return { success: false, msg: claim.reason }
      try {
        return await importFileToQuotes({ fileID: claim.job.fileID, jobId, options: claim.job.options || (event && event.options) })
      } catch (e) {
        const message = e && e.message ? e.message : String(e)
        await finishJob(jobId, { status: 'failed', error: message })
        return { success: false, error: message }
      }
    }

    const fileID = event && event.fileID ? String(event.fileID) : ''
    if (fileID) return await importFileToQuotes({ fileID, jobId: '', options: event.options })

    return await processPendingJobs(event && event.options ? event.options : event)
  } catch (err) {
    console.error(err)
    return { success: false, error: err && err.message ? err.message : String(err) }
  }
}
