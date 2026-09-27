function esc(str) {
  if (typeof str !== 'string') return str
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
}

function escCsv(str) {
  if (str == null) return ''
  const s = String(str)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function exportToCode(data) {
  try {
    const json = JSON.stringify(data)
    const encoded = btoa(unescape(encodeURIComponent(json)))
    return encoded
  } catch (e) {
    logError('EXPORT_FAILED', e)
    return null
  }
}

function importFromCode(code) {
  try {
    const decoded = decodeURIComponent(escape(atob(code)))
    const data = JSON.parse(decoded)
    validateData(data)
    return data
  } catch (e) {
    if (e.message && e.message.startsWith('Format')) throw e
    throw new Error('Code invalide ou corrompu')
  }
}

function validateData(data) {
  if (!data || typeof data !== 'object') throw new Error('Format invalide : données non trouvées')
  if (!data.version || typeof data.version !== 'number') throw new Error('Format invalide : version manquante')
  if (Array.isArray(data.programs) && data.programs.length > 0) {
    for (const p of data.programs) {
      if (!Array.isArray(p.sessions)) throw new Error('Format invalide : sessions doit être un tableau')
      for (const s of p.sessions) {
        if (!s.id || typeof s.id !== 'string') throw new Error('Format invalide : session sans ID')
        if (!Array.isArray(s.exercises)) throw new Error('Format invalide : exercices doit être un tableau')
        for (const e of s.exercises) {
          if (!e.id || !e.name) throw new Error('Format invalide : exercice sans ID ou nom')
        }
      }
    }
  } else {
    if (!data.program || typeof data.program !== 'object') throw new Error('Format invalide : programme manquant')
    if (!Array.isArray(data.program.sessions)) throw new Error('Format invalide : sessions doit être un tableau')
    for (const s of data.program.sessions) {
      if (!s.id || typeof s.id !== 'string') throw new Error('Format invalide : session sans ID')
      if (!Array.isArray(s.exercises)) throw new Error('Format invalide : exercices doit être un tableau')
      for (const e of s.exercises) {
        if (!e.id || !e.name) throw new Error('Format invalide : exercice sans ID ou nom')
      }
    }
  }
  if (!Array.isArray(data.workouts)) throw new Error('Format invalide : workouts doit être un tableau')
  for (const w of data.workouts) {
    if (!w.id) throw new Error('Format invalide : workout sans ID')
    if (!Array.isArray(w.exercises)) throw new Error('Format invalide : workout sans exercices')
  }
}

function mergeWorkouts(existing, imported) {
  const existingIds = new Set(existing.workouts.map(w => w.id))
  let added = 0
  let skipped = 0
  for (const w of imported.workouts) {
    if (!w.id) { skipped++; continue }
    if (!existingIds.has(w.id)) {
      existing.workouts.push(w)
      existingIds.add(w.id)
      added++
    } else {
      skipped++
    }
  }
  existing.updatedAt = new Date().toISOString()
  return { data: existing, added, skipped }
}

function mergeProgramAndWorkouts(existing, imported) {
  const result = mergeWorkouts(existing, imported)
  const src = imported.programs && imported.programs.length > 0 ? imported.programs[0] : imported.program
  if (src && src.sessions && src.sessions.length > 0) {
    existing.programs[0] = JSON.parse(JSON.stringify(src))
    syncProgramFromPrograms(existing)
  }
  return result
}

function exportOnlyProgram(data) {
  const p = data.programs && data.programs.length > 0 ? data.programs[0] : data.program
  return {
    version: data.version,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    programs: [JSON.parse(JSON.stringify(p))],
    program: JSON.parse(JSON.stringify(p)),
    scheduleGrid: JSON.parse(JSON.stringify(data.scheduleGrid || {})),
    scheduleTemplate: JSON.parse(JSON.stringify(data.scheduleTemplate || {})),
    exerciseLibrary: JSON.parse(JSON.stringify(data.exerciseLibrary || [])),
    workouts: []
  }
}

function getExerciseName(data, exerciseId) {
  const lib = data.exerciseLibrary || []
  const entry = lib.find(e => e.id === exerciseId)
  if (entry) return entry.name
  for (const p of getActivePrograms(data)) {
    for (const s of p.sessions) {
      const ex = s.exercises.find(e => e.id === exerciseId)
      if (ex) return ex.name
    }
  }
  return exerciseId
}

function exportToCsv(data) {
  const rows = [['Date', 'Session', 'Exercice', 'Serie', 'Reps', 'Charge', 'RPE', 'Notes']]
  for (const w of data.workouts) {
    const session = getSessionById(data, w.sessionId)
    for (const ex of w.exercises) {
      const name = getExerciseName(data, ex.exerciseId)
      for (let i = 0; i < ex.sets.length; i++) {
        const s = ex.sets[i]
        rows.push([
          escCsv(w.date),
          escCsv(w.sessionId),
          escCsv(name),
          escCsv(i + 1),
          escCsv(s.reps),
          escCsv(s.weight),
          escCsv(ex.rpe || ''),
          escCsv(ex.notes || '')
        ])
      }
    }
  }
  return rows.map(r => r.join(',')).join('\n')
}
