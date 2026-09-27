let currentDraft = null
let chronoInterval = null
let chronoTotal = 0
let chronoStartedAt = 0
let onChronoEnd = null

function createDraft(session, existing) {
  const now = Date.now()
  return {
    sessionId: session.id,
    editWorkoutId: existing ? existing.id : null,
    date: existing ? existing.date : new Date().toISOString().slice(0, 10),
    startTime: existing ? existing.startTime : new Date().toISOString(),
    startedAt: now,
    activeMs: existing ? 0 : 0,
    pauseStartedAt: null,
    duration: 0,
    exercises: session.exercises.map(ex => {
      const prev = existing ? existing.exercises.find(e => e.exerciseId === ex.id) : null
      return prev
        ? { exerciseId: ex.id, sets: prev.sets.map(s => ({ reps: s.reps, weight: s.weight })), rpe: prev.rpe || 0, restUsed: ex.restSec, notes: prev.notes || '' }
        : { exerciseId: ex.id, sets: [], rpe: 0, restUsed: ex.restSec, notes: '' }
    })
  }
}

function pauseDraft() {
  if (!currentDraft || currentDraft.pauseStartedAt !== null) return
  currentDraft.pauseStartedAt = Date.now()
  saveDraft(currentDraft)
}

function resumeDraftTiming() {
  if (!currentDraft || currentDraft.pauseStartedAt === null) return
  currentDraft.activeMs += Date.now() - currentDraft.pauseStartedAt
  currentDraft.pauseStartedAt = null
  saveDraft(currentDraft)
}

function startSession(data, sessionId, existing) {
  const session = getSessionById(data, sessionId)
  if (!session) return null
  currentDraft = createDraft(session, existing || null)
  saveDraft(currentDraft)
  return currentDraft
}

function resumeDraft() {
  currentDraft = loadDraft()
  return currentDraft
}

function getDraft() {
  return currentDraft
}

function addSet(exerciseIndex, reps, weight) {
  if (!currentDraft) return
  const ex = currentDraft.exercises[exerciseIndex]
  ex.sets.push({ reps: reps || 0, weight: weight || 0 })
  saveDraft(currentDraft)
}

function removeSet(exerciseIndex, setIndex) {
  if (!currentDraft) return
  currentDraft.exercises[exerciseIndex].sets.splice(setIndex, 1)
  saveDraft(currentDraft)
}

function updateSet(exerciseIndex, setIndex, reps, weight) {
  if (!currentDraft) return
  const ex = currentDraft.exercises[exerciseIndex]
  if (ex.sets[setIndex]) {
    ex.sets[setIndex] = { reps: reps || 0, weight: weight || 0 }
    saveDraft(currentDraft)
  }
}

function setRpe(exerciseIndex, value) {
  if (!currentDraft) return
  currentDraft.exercises[exerciseIndex].rpe = value
  saveDraft(currentDraft)
}

function setNotes(exerciseIndex, text) {
  if (!currentDraft) return
  currentDraft.exercises[exerciseIndex].notes = text
  saveDraft(currentDraft)
}

function finishSession(data) {
  if (!currentDraft) return null
  resumeDraftTiming()
  currentDraft.duration = Math.floor(currentDraft.activeMs / 1000)
  if (currentDraft.editWorkoutId) {
    const idx = data.workouts.findIndex(w => w.id === currentDraft.editWorkoutId)
    if (idx !== -1) {
      currentDraft.id = currentDraft.editWorkoutId
      data.workouts[idx] = Object.assign(data.workouts[idx], currentDraft)
    } else {
      currentDraft.id = generateId()
      data.workouts.push(currentDraft)
    }
  } else {
    currentDraft.id = generateId()
    data.workouts.push(currentDraft)
  }
  delete currentDraft.activeMs
  delete currentDraft.pauseStartedAt
  delete currentDraft.startedAt
  delete currentDraft.editWorkoutId
  saveData(data)
  const finished = currentDraft
  currentDraft = null
  clearDraft()
  return finished
}

function onVisibilityChange() {
  if (document.hidden && isChronoRunning()) {
    pauseChrono()
  } else if (!document.hidden && chronoTotal > 0 && !isChronoRunning()) {
    resumeChrono(() => {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
    })
  }
}
document.addEventListener('visibilitychange', onVisibilityChange)

function startChrono(seconds, onEnd) {
  stopChrono()
  chronoTotal = seconds
  chronoStartedAt = Date.now()
  onChronoEnd = onEnd
  chronoInterval = setInterval(() => {
    const remaining = Math.max(0, chronoTotal - Math.floor((Date.now() - chronoStartedAt) / 1000))
    if (remaining <= 0) {
      stopChrono()
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
      if (onChronoEnd) onChronoEnd()
    }
    renderChrono()
  }, 200)
  renderChrono()
}

function pauseChrono() {
  if (chronoInterval) {
    clearInterval(chronoInterval)
    chronoInterval = null
    const elapsed = Math.floor((Date.now() - chronoStartedAt) / 1000)
    chronoTotal = Math.max(0, chronoTotal - elapsed)
    chronoStartedAt = 0
  }
}

function resumeChrono(onEnd) {
  if (!chronoInterval && chronoTotal > 0) {
    chronoStartedAt = Date.now()
    onChronoEnd = onEnd
    chronoInterval = setInterval(() => {
      const remaining = Math.max(0, chronoTotal - Math.floor((Date.now() - chronoStartedAt) / 1000))
      if (remaining <= 0) {
        stopChrono()
        if (navigator.vibrate) navigator.vibrate([200, 100, 200])
        if (onChronoEnd) onChronoEnd()
      }
      renderChrono()
    }, 200)
    renderChrono()
  }
}

function setChronoReady(seconds) {
  chronoTotal = seconds
  chronoStartedAt = 0
}

function stopChrono() {
  if (chronoInterval) {
    clearInterval(chronoInterval)
    chronoInterval = null
  }
  chronoTotal = 0
  chronoStartedAt = 0
  onChronoEnd = null
}

function getChronoRemaining() {
  if (chronoStartedAt > 0) {
    return Math.max(0, chronoTotal - Math.floor((Date.now() - chronoStartedAt) / 1000))
  }
  return chronoTotal
}

function isChronoRunning() {
  return chronoInterval !== null
}

function formatChrono(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m > 0) return `${m}:${s.toString().padStart(2, '0')}`
  return `${s}`
}

function renderChrono() {
  const el = document.getElementById('chrono-display')
  const btn = document.getElementById('chrono-toggle')
  const prog = document.getElementById('chrono-progress')
  if (!el) return
  const remaining = getChronoRemaining()
  if (remaining > 0) {
    el.textContent = formatChrono(remaining)
    if (remaining <= 10) el.style.color = 'var(--accent)'
    else el.style.color = 'var(--text)'
    if (btn) btn.textContent = isChronoRunning() ? '⏸' : '▶'
    if (prog) {
      const total = chronoTotal > 0 ? chronoTotal : parseInt(prog.dataset.total || '180')
      prog.style.width = `${(remaining / total) * 100}%`
    }
    el.style.display = 'block'
  } else {
    el.textContent = 'Repos'
    el.style.color = 'var(--text-2)'
    if (btn) btn.textContent = '▶'
    if (prog) prog.style.width = '0%'
  }
}
