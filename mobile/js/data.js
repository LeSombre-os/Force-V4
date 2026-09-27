const STORAGE_KEY = 'force_v4'
const DRAFT_KEY = 'force_v4_draft'
const QUOTA_WARN_BYTES = 4.5 * 1024 * 1024

const DEFAULT_DATA = {
  version: 3,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  program: {
    name: 'Mon Programme',
    sessions: [],
    schedule: { type: 'rotation', order: [], daysOfWeek: [] }
  },
  programs: [],
  scheduleGrid: {},
  scheduleTemplate: {},
  exerciseLibrary: [],
  workouts: []
}

function logError(context, err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.warn(`[Force] ${context}: ${msg}`)
}

const CURRENT_VERSION = 3

function migrateData(data) {
  if (!data || typeof data !== 'object') return deepClone(DEFAULT_DATA)
  if (!data.version || data.version < 2) {
    if (!data.program) data.program = deepClone(DEFAULT_DATA.program)
    if (!Array.isArray(data.programs) || data.programs.length === 0) {
      data.programs = [deepClone(data.program)]
    }
    if (!data.scheduleGrid || typeof data.scheduleGrid !== 'object') {
      data.scheduleGrid = {}
    }
    if (!Array.isArray(data.exerciseLibrary)) {
      const lib = []
      const seen = new Set()
      for (const s of data.program.sessions) {
        for (const e of s.exercises) {
          if (!seen.has(e.id)) { seen.add(e.id); lib.push({ id: e.id, name: e.name }) }
        }
      }
      data.exerciseLibrary = lib
    }
    data.version = 2
  }
  // v3: scheduleTemplate
  if (data.version < 3) {
    if (!data.scheduleTemplate || typeof data.scheduleTemplate !== 'object') {
      data.scheduleTemplate = {}
    }
    data.version = 3
  }
  syncProgramFromPrograms(data)
  if (!data.program.schedule) data.program.schedule = { type: 'rotation', order: [], daysOfWeek: [] }
  if (!Array.isArray(data.program.sessions)) data.program.sessions = []
  if (!Array.isArray(data.workouts)) data.workouts = []
  data.program.sessions.forEach(s => {
    if (!Array.isArray(s.exercises)) s.exercises = []
    s.exercises.forEach(e => { if (!e.id) e.id = generateId() })
  })
  data.workouts.forEach(w => {
    if (!Array.isArray(w.exercises)) w.exercises = []
    if (!w.id) w.id = generateId()
  })
  return data
}

function syncProgramFromPrograms(data) {
  if (Array.isArray(data.programs) && data.programs.length > 0) {
    data.program = data.programs[0]
  } else if (data.program) {
    data.programs = [data.program]
  } else {
    data.programs = [deepClone(DEFAULT_DATA.program)]
    data.program = data.programs[0]
  }
}

function getActivePrograms(data) {
  return Array.isArray(data.programs) ? data.programs : [data.program]
}

function switchProgram(data, idx) {
  if (!Array.isArray(data.programs) || idx < 0 || idx >= data.programs.length) return
  data.program = data.programs[idx]
}

function getActiveProgramIndex(data) {
  return Array.isArray(data.programs) ? data.programs.indexOf(data.program) : 0
}

function addProgram(data, name, sessions, schedule) {
  if (!Array.isArray(data.programs)) data.programs = []
  const p = {
    name: name || 'Nouveau programme',
    sessions: sessions || [],
    schedule: schedule || { type: 'rotation', order: [], daysOfWeek: [] }
  }
  data.programs.push(p)
  data.program = p
}

function removeProgram(data, idx) {
  if (!Array.isArray(data.programs) || data.programs.length <= 1) return
  if (idx < 0 || idx >= data.programs.length) return
  const removed = data.programs[idx]
  data.programs.splice(idx, 1)
  data.program = data.programs[Math.min(idx, data.programs.length - 1)]
  // Clean orphaned schedule entries
  if (removed && removed.name) {
    for (const key of Object.keys(data.scheduleGrid || {})) {
      const val = data.scheduleGrid[key]
      const progName = typeof val === 'object' ? val.progName : null
      if (progName === removed.name) delete data.scheduleGrid[key]
    }
    for (const key of Object.keys(data.scheduleTemplate || {})) {
      const val = data.scheduleTemplate[key]
      if (val && val.progName === removed.name) delete data.scheduleTemplate[key]
    }
  }
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      return migrateData(data)
    }
  } catch (e) {
    logError('LOAD_FAILED', e)
  }
  return deepClone(DEFAULT_DATA)
}

function checkQuota(json) {
  const bytes = new Blob([json]).size
  if (bytes > QUOTA_WARN_BYTES) {
    console.warn('Storage near limit:', (bytes / 1024 / 1024).toFixed(1), 'MB')
    return { ok: false, msg: 'Stockage presque plein (' + (bytes / 1024 / 1024).toFixed(1) + ' Mo). Exporte et réinitialise.' }
  }
  return { ok: true }
}

function saveData(data) {
  data.updatedAt = new Date().toISOString()
  try {
    const json = JSON.stringify(data)
    const q = checkQuota(json)
    localStorage.setItem(STORAGE_KEY, json)
    if (!q.ok) {
      logError('QUOTA_WARN', q.msg)
      if (typeof showToast === 'function') showToast(q.msg, 'error')
    }
  } catch (e) {
    logError('SAVE_FAILED', e)
  }
}

function resetData() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(DRAFT_KEY)
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function saveDraft(draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch (e) {
    logError('DRAFT_SAVE_FAILED', e)
  }
}

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY)
}

function getNextSessionId(data) {
  const sched = data.program.schedule
  if (!sched.order.length) return null
  if (!data.workouts.length) return sched.order[0]
  const last = data.workouts[data.workouts.length - 1]
  const idx = sched.order.indexOf(last.sessionId)
  if (idx === -1) return sched.order[0]
  return sched.order[(idx + 1) % sched.order.length]
}

function getSessionById(data, id) {
  for (const p of getActivePrograms(data)) {
    const s = p.sessions.find(s => s.id === id)
    if (s) return s
  }
  return null
}

function getLastWorkoutForExercise(data, exerciseId) {
  for (let i = data.workouts.length - 1; i >= 0; i--) {
    const ex = data.workouts[i].exercises.find(e => e.exerciseId === exerciseId)
    if (ex) return ex
  }
  return null
}

function localDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
}

function getTodaySession(data) {
  const today = new Date()
  const dateStr = localDateStr(today)
  if (data.scheduleGrid && data.scheduleGrid[dateStr] !== undefined) {
    const sid = data.scheduleGrid[dateStr]
    if (sid === null) return null
    const sessionId = typeof sid === 'object' ? sid.sessionId : sid
    return getSessionById(data, sessionId)
  }
  // Check scheduleTemplate
  if (data.scheduleTemplate) {
    const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ...
    const template = data.scheduleTemplate[dayOfWeek]
    if (template && template.progName && template.sessionId) {
      const prog = data.programs.find(p => p.name === template.progName)
      if (prog) return prog.sessions.find(s => s.id === template.sessionId) || null
    }
  }
  if (!data.program.sessions.length) return null
  const dayOfWeek = today.getDay()
  const sched = data.program.schedule
  if (sched.type === 'rotation') {
    const sid = getNextSessionId(data)
    return sid ? getSessionById(data, sid) : null
  }
  if (sched.type === 'weekly' && sched.daysOfWeek.length) {
    const dayIdx = sched.daysOfWeek.indexOf(dayOfWeek)
    if (dayIdx === -1) return null
    const sidIdx = dayIdx % sched.order.length
    return getSessionById(data, sched.order[sidIdx])
  }
  return null
}

function getWorkoutById(data, id) {
  return data.workouts.find(w => w.id === id)
}

function parseLocalDate(str) {
  if (!str) return new Date()
  const parts = str.split('-')
  if (parts.length === 3) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  return new Date(str)
}

function getWorkoutsByMonth(data, year, month) {
  return data.workouts.filter(w => {
    const d = parseLocalDate(w.date)
    return d.getFullYear() === year && d.getMonth() === month
  })
}

function getWorkoutsBySession(data, sessionId) {
  return data.workouts.filter(w => w.sessionId === sessionId)
}

function formatDate(dateStr) {
  const d = parseLocalDate(dateStr)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function displayWeight(weight, isBodyweight) {
  if (weight > 0) return weight + ' kg'
  if (isBodyweight) return 'PDC'
  return '0 kg'
}
