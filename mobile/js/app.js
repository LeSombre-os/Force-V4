let appData = null
let currentScreen = 'today'
let historyMonth = 0
let historyYear = 0
let historyFilter = ''
let wakeLock = null
let logExerciseIndex = 0

const SESSION_COLORS = ['blue','orange','green','purple','pink','teal','red','yellow']

function getSessionColorClass(data, sessionId) {
  const allSess = []
  for (const p of getActivePrograms(data)) {
    for (const s of p.sessions) {
      if (!allSess.find(x => x.id === s.id)) allSess.push(s)
    }
  }
  const idx = allSess.findIndex(s => s.id === sessionId)
  return 'badge-session-' + (idx >= 0 ? idx % SESSION_COLORS.length : 0)
}

function init() {
  appData = loadData()
  const now = new Date()
  historyMonth = now.getMonth()
  historyYear = now.getFullYear()
  const draft = loadDraft()
  if (draft) {
    const session = getSessionById(appData, draft.sessionId)
    if (session) {
      currentDraft = draft
      restoreDraftExercises(session)
      logExerciseIndex = 0
    }
  }
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.screen))
  })
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideModal()
  })
  document.getElementById('app').addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      document.getElementById('kb-dismiss').classList.add('active')
    }
  })
  document.getElementById('app').addEventListener('focusout', (e) => {
    if (!e.relatedTarget || !e.relatedTarget.closest) return
    if (!e.relatedTarget.closest('#app')) {
      document.getElementById('kb-dismiss').classList.remove('active')
    }
  })
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      appData = loadData()
      renderTodayScreen()
      if (currentScreen === 'history') renderHistoryScreen()
      if (currentScreen === 'program') renderProgramScreen()
      if (currentScreen === 'settings') renderSettingsScreen()
    }
  })
  renderTodayScreen()
  navigateTo('today')
  showOnboarding()
}

function restoreDraftExercises(session) {
  const draft = getDraft()
  if (!draft) return
  const existingIds = new Set(draft.exercises.map(e => e.exerciseId))
  for (const ex of session.exercises) {
    if (!existingIds.has(ex.id)) {
      draft.exercises.push({ exerciseId: ex.id, sets: [], rpe: 0, restUsed: ex.restSec, notes: '' })
    }
  }
}

function navigateTo(screenId) {
  const prevScreen = currentScreen
  currentScreen = screenId
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.getElementById(`screen-${screenId}`).classList.add('active')
  document.querySelector(`[data-screen="${screenId}"]`).classList.add('active')
  switch (screenId) {
    case 'today': renderTodayScreen(); break
    case 'log': renderLogScreen(); break
    case 'history': renderHistoryScreen(); break
    case 'program': renderProgramScreen(); break
    case 'settings': renderSettingsScreen(); break
  }
  if (prevScreen === 'log' && screenId !== 'log' && getDraft()) {
    pauseDraft()
    releaseWakeLock()
    stopChrono()
  }
}

let lastFocused = null

function showModal(html) {
  lastFocused = document.activeElement
  const content = document.getElementById('modal-content')
  content.innerHTML = html
  document.getElementById('modal').classList.add('active')
  const firstBtn = content.querySelector('button')
  if (firstBtn) setTimeout(() => firstBtn.focus(), 50)
}

function hideModal() {
  document.getElementById('modal').classList.remove('active')
  if (lastFocused && lastFocused.focus) setTimeout(() => lastFocused.focus(), 50)
  lastFocused = null
}

function showToast(msg, type) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = 'toast'
  if (type) el.classList.add(type)
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 2500)
}

async function requestWakeLock() {
  if (wakeLock) return
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener('release', () => { wakeLock = null })
    }
  } catch {}
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {})
    wakeLock = null
  }
}

// ── TODAY SCREEN ──

function renderTodayScreen() {
  const screen = document.getElementById('screen-today')
  const session = getTodaySession(appData)
  const lastWorkout = appData.workouts.length > 0 ? appData.workouts[appData.workouts.length - 1] : null
  const draft = getDraft()

  let html = `<div class="screen-header"><h1 class="screen-title">Aujourd'hui</h1></div>`

  if (draft) {
    html += `<div class="card-glass" style="border-color:var(--accent)">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <span style="font-size:24px">⏳</span>
        <div><div style="font-weight:600">Séance en cours</div>
        <div class="text-2" style="font-size:13px">${draft.exercises.filter(e => e.sets.length > 0).length}/${draft.exercises.length} exercices faits</div></div>
      </div>
      <button class="btn btn-primary btn-block" onclick="navigateTo('log')">Continuer la séance</button>
    </div>`
  }

  if (!appData.program.sessions.length) {
    html += `<div class="empty-state"><p>Aucun programme configuré</p>
      <button class="btn btn-secondary mt-16" onclick="navigateTo('program')">Configurer le programme</button></div>`
  } else {
    html += `<div class="card-glass">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span class="badge ${session ? getSessionColorClass(appData, session.id) : ''}">${session ? 'Séance ' + session.id : 'Repos'}</span>
      </div>
      <div style="font-weight:700;font-size:20px;margin:4px 0 8px">${session ? esc(session.name) : 'Aucune séance aujourd\'hui'}</div>
      ${session ? `<div style="font-size:13px;color:var(--text-2);margin-bottom:12px">${session.exercises.length} exercices</div>
      <button class="btn btn-primary btn-block" onclick="startNewSession('${session.id}')">Commencer la séance</button>` : ''}
    </div>`

    if (lastWorkout) {
      html += `<div class="card">
        <div class="card-title">Dernière séance</div>
        <div style="font-weight:600">Séance ${lastWorkout.sessionId}</div>
        <div class="text-2" style="font-size:13px">${formatDate(lastWorkout.date)}</div>
        <div style="margin-top:8px;font-size:13px;color:var(--text-2)">
          ${lastWorkout.exercises.length} exercices · Volume: ${calculateVolume(lastWorkout)} kg
        </div>
      </div>`
    }

    if (appData.workouts.length > 0) {
      const streak = calculateStreak(appData)
      html += `<div class="card" style="display:flex;align-items:center;gap:12px">
        <span style="font-size:28px">${getStreakEmoji(streak)}</span>
        <div><div style="font-weight:700;font-size:18px">${streak}</div>
        <div class="text-2" style="font-size:13px">séances consécutives</div></div>
      </div>`
    }
  }

  screen.innerHTML = html
}

function calculateVolume(workout) {
  return workout.exercises.reduce((total, ex) => {
    return total + ex.sets.reduce((s, set) => s + (set.reps || 0) * (set.weight || 0), 0)
  }, 0)
}

function calculateStreak(data) {
  if (!data.workouts.length) return 0
  const sorted = [...data.workouts].sort((a, b) => parseLocalDate(b.date) - parseLocalDate(a.date))
  const sched = data.program.schedule
  const maxGap = sched.type === 'weekly' && sched.daysOfWeek.length
    ? Math.max(...sched.daysOfWeek.map((d, i, a) => {
        if (i === 0) return Math.min(d + 7 - a[a.length - 1], d)
        return d - a[i - 1]
      }))
    : sched.order.length > 1 ? sched.order.length : 4
  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseLocalDate(sorted[i - 1].date)
    const curr = parseLocalDate(sorted[i].date)
    const diff = (prev - curr) / (1000 * 60 * 60 * 24)
    if (diff <= maxGap) streak++
    else break
  }
  return streak
}

function getStreakEmoji(streak) {
  if (streak === 0) return '❌'
  if (streak >= 10) return '💪'
  if (streak >= 5) return '🔥'
  return '✅'
}

function startNewSession(sessionId) {
  if (!sessionId) { showToast('Aucune séance programmée aujourd\'hui', 'error'); return }
  startSession(appData, sessionId)
  logExerciseIndex = 0
  requestWakeLock()
  navigateTo('log')
}

// ── LOG SCREEN ──

function renderLogScreen() {
  resumeDraftTiming()
  const screen = document.getElementById('screen-log')
  const draft = getDraft()
  if (!draft) {
    screen.innerHTML = `<div class="empty-state"><p>Aucune séance en cours</p>
      <button class="btn btn-primary mt-16" onclick="navigateTo('today')">Voir le programme</button></div>`
    return
  }

  const session = getSessionById(appData, draft.sessionId)
  if (!session) { screen.innerHTML = ''; return }

  const totalEx = draft.exercises.length
  const completedEx = draft.exercises.filter(e => e.sets.length > 0).length

  if (logExerciseIndex >= totalEx) {
    renderLogSummary(screen, draft, session)
    return
  }

  const ex = draft.exercises[logExerciseIndex]
  const exDef = session.exercises.find(e => e.id === ex.exerciseId)
  const lastEx = getLastWorkoutForExercise(appData, ex.exerciseId)

  const lastSets = lastEx ? lastEx.sets : []
  const lastRpe = lastEx ? lastEx.rpe : 0

  let html = `<div class="screen-header">
    <button class="btn-ghost" onclick="confirmExitLog()">✕</button>
    <h1 class="screen-title">Saisir</h1>
    <span class="text-2" style="font-size:14px">${logExerciseIndex + 1}/${totalEx}</span>
  </div>`

  html += `<div id="progress-dots" style="display:flex;gap:4px;margin-bottom:16px">`
  for (let i = 0; i < totalEx; i++) {
    const done = draft.exercises[i].sets.length > 0
    html += `<div style="flex:1;height:3px;border-radius:2px;background:${i === logExerciseIndex ? 'var(--accent)' : done ? 'var(--success)' : 'var(--surface-2)'}"></div>`
  }
  html += `</div>`

  html += `<div class="card-glass animate-in">
    <div style="font-weight:700;font-size:18px;margin-bottom:4px">${exDef ? esc(exDef.name) : esc(ex.exerciseId)}</div>
    ${exDef ? `<div class="text-2" style="font-size:14px;margin-bottom:16px">Objectif: ${exDef.targetSets}×${esc(exDef.targetReps)} @ ${displayWeight(exDef.targetWeight, exDef.targetWeight === 0)}</div>` : ''}
    ${exDef && exDef.notes ? `<div class="text-3" style="font-size:13px;margin-bottom:12px;font-style:italic">${esc(exDef.notes)}</div>` : ''}

    ${lastEx ? `<div class="text-3" style="font-size:13px;margin-bottom:8px">Dernière fois: ${lastSets.map(s => `${s.reps}×${s.weight}kg`).join(', ')} · RPE ${lastEx.rpe || '-'}</div>
      <button class="btn btn-sm btn-ghost" onclick="fillFromLast()" style="margin-bottom:12px;font-size:13px">📋 Reprendre mêmes charges</button>` : ''}

    <div class="section-title" style="margin-bottom:8px">Séries</div>
    <div id="set-list">`

  for (let i = 0; i < ex.sets.length; i++) {
    html += renderSetRow(i, ex.sets[i].reps, ex.sets[i].weight, exDef ? exDef.targetWeight : 0)
  }
  if (ex.sets.length === 0) {
    html += `<div class="text-3" style="font-size:14px;text-align:center;padding:12px 0">Aucune série saisie</div>`
  }

  html += `<button class="set-add" onclick="addLogSet()">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    Ajouter une série
  </button>
  </div>`

  html += `<div class="section-title mt-16" id="rpe-title" style="margin-bottom:8px">RPE (${ex.rpe || '-'}/10)</div>
    <div class="rpe-selector">`
  for (let i = 1; i <= 10; i++) {
    html += `<button class="rpe-btn${ex.rpe === i ? ' selected' : ''}" onclick="setLogRpe(${i})">${i}</button>`
  }
  html += `</div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);margin-top:4px;padding:0 4px">
      <span>Facile</span><span>Modéré</span><span>Dur</span><span>Max</span>
    </div>`

  html += `<div class="section-title mt-16" style="margin-bottom:8px">Note</div>
    <textarea class="input-field" id="log-notes" placeholder="Optionnelle (ressenti, difficultés...)" oninput="setLogNotes(this.value)">${esc(ex.notes) || ''}</textarea>`

  html += `<div class="chrono-card card mt-16">
    <div id="chrono-display" style="display:none">Repos</div>
    <div class="chrono-controls">
      <button class="chrono-btn" id="chrono-toggle" onclick="toggleChrono()">▶</button>
      <button class="chrono-btn" onclick="resetChrono(${exDef ? exDef.restSec : 180})">↺</button>
    </div>
    <div class="chrono-progress-bar"><div class="chrono-progress-fill" id="chrono-progress" data-total="${exDef ? exDef.restSec : 180}"></div></div>
  </div>`

  html += `<button class="btn btn-primary btn-block mt-16" onclick="nextLogExercise()" ${ex.sets.length === 0 ? 'disabled style="opacity:0.4"' : ''}>
    ${logExerciseIndex < totalEx - 1 ? 'Valider et suivant →' : 'Terminer la séance'}
  </button>`

  screen.innerHTML = html
}

function renderSetRow(index, reps, weight, targetWeight) {
  const isWarmup = targetWeight > 0 && weight > 0 && weight < targetWeight
  return `<div class="set-row${isWarmup ? ' set-warmup' : ''}" id="set-${index}">
    ${isWarmup ? '<span class="warmup-badge">Échauff.</span>' : ''}
    <span class="set-number">${index + 1}</span>
    <input class="set-input" type="number" min="0" inputmode="numeric" placeholder="Reps" value="${reps || ''}" oninput="updateLogSet(${index}, 'reps', this.value)">
    <span class="text-3" style="font-size:13px">×</span>
    <input class="set-input" type="number" min="0" step="0.25" inputmode="decimal" placeholder="Kg" value="${weight || ''}" oninput="updateLogSet(${index}, 'weight', this.value)">
    <button class="set-remove" onclick="removeLogSet(${index})">✕</button>
  </div>`
}

function addLogSet() {
  const draft = getDraft()
  if (!draft) return
  const ex = draft.exercises[logExerciseIndex]
  const lastVal = ex.sets.length > 0 ? ex.sets[ex.sets.length - 1] : { reps: '', weight: '' }
  addSet(logExerciseIndex, lastVal.reps, lastVal.weight)

  const setList = document.getElementById('set-list')
  if (!setList) return

  const emptyMsg = setList.querySelector('.text-3')
  if (emptyMsg) emptyMsg.remove()

  const idx = ex.sets.length - 1
  const row = document.createElement('div')
  row.className = 'set-row'
  row.id = `set-${idx}`
  row.innerHTML = `<span class="set-number">${idx + 1}</span>
    <input class="set-input" type="number" min="0" inputmode="numeric" placeholder="Reps" value="${lastVal.reps || ''}" oninput="updateLogSet(${idx}, 'reps', this.value)">
    <span class="text-3" style="font-size:13px">×</span>
    <input class="set-input" type="number" min="0" step="0.25" inputmode="decimal" placeholder="Kg" value="${lastVal.weight || ''}" oninput="updateLogSet(${idx}, 'weight', this.value)">
    <button class="set-remove" onclick="removeLogSet(${idx})">✕</button>`
  setList.appendChild(row)

  const validateBtn = document.querySelector('.btn-primary.btn-block.mt-16')
  if (validateBtn) {
    validateBtn.disabled = false
    validateBtn.style.opacity = '1'
  }

  updateLogProgress()
}

function updateLogSet(index, field, value) {
  const draft = getDraft()
  const ex = draft.exercises[logExerciseIndex]
  const numVal = value === '' ? 0 : parseFloat(value)
  const current = ex.sets[index] || { reps: 0, weight: 0 }
  if (field === 'reps') updateSet(logExerciseIndex, index, numVal, current.weight)
  else updateSet(logExerciseIndex, index, current.reps, numVal)
}

function removeLogSet(index) {
  const draft = getDraft()
  if (!draft) return
  removeSet(logExerciseIndex, index)

  const row = document.getElementById(`set-${index}`)
  if (row) row.remove()

  const setList = document.getElementById('set-list')
  if (!setList) return

  const rows = setList.querySelectorAll('.set-row')
  rows.forEach((r, i) => {
    r.id = `set-${i}`
    r.querySelector('.set-number').textContent = i + 1
    const inputs = r.querySelectorAll('.set-input')
    inputs[0].oninput = function () { updateLogSet(i, 'reps', this.value) }
    inputs[1].oninput = function () { updateLogSet(i, 'weight', this.value) }
    r.querySelector('.set-remove').onclick = function () { removeLogSet(i) }
  })

  if (rows.length === 0) {
    const emptyMsg = document.createElement('div')
    emptyMsg.className = 'text-3'
    emptyMsg.style.cssText = 'font-size:14px;text-align:center;padding:12px 0'
    emptyMsg.textContent = 'Aucune série saisie'
    setList.appendChild(emptyMsg)

    const validateBtn = document.querySelector('.btn-primary.btn-block.mt-16')
    if (validateBtn) {
      validateBtn.disabled = true
      validateBtn.style.opacity = '0.4'
    }
  }

  updateLogProgress()
}

function setLogRpe(value) {
  const draft = getDraft()
  if (!draft) return
  setRpe(logExerciseIndex, value)

  const rpeTitle = document.getElementById('rpe-title')
  if (rpeTitle) rpeTitle.textContent = `RPE (${value}/10)`

  const rpeBtns = document.querySelectorAll('.rpe-btn')
  rpeBtns.forEach((btn, i) => {
    btn.classList.toggle('selected', i + 1 === value)
  })
}

function updateLogProgress() {
  const draft = getDraft()
  if (!draft) return
  const dotsContainer = document.getElementById('progress-dots')
  if (!dotsContainer) return
  const dots = dotsContainer.querySelectorAll('div')
  dots.forEach((dot, i) => {
    if (i >= draft.exercises.length) return
    const done = draft.exercises[i].sets.length > 0
    dot.style.background = i === logExerciseIndex ? 'var(--accent)' : done ? 'var(--success)' : 'var(--surface-2)'
  })
}

function setLogNotes(value) {
  setNotes(logExerciseIndex, value)
}

function nextLogExercise() {
  const draft = getDraft()
  if (!draft) return
  stopChrono()
  logExerciseIndex++
  if (logExerciseIndex >= draft.exercises.length) {
    releaseWakeLock()
  } else {
    const session = getSessionById(appData, draft.sessionId)
    const exDef = session ? session.exercises.find(e => e.id === draft.exercises[logExerciseIndex].exerciseId) : null
    if (exDef) setChronoReady(exDef.restSec)
  }
  renderLogScreen()
}

function fillFromLast() {
  const draft = getDraft()
  if (!draft) return
  const ex = draft.exercises[logExerciseIndex]
  const lastEx = getLastWorkoutForExercise(appData, ex.exerciseId)
  if (!lastEx || !lastEx.sets.length) { showToast('Aucune séance précédente', 'error'); return }
  const session = getSessionById(appData, draft.sessionId)
  const exDef = session ? session.exercises.find(e => e.id === ex.exerciseId) : null
  ex.sets = lastEx.sets.map(s => ({ reps: s.reps, weight: s.weight }))
  if (lastEx.rpe) ex.rpe = lastEx.rpe
  saveDraft(draft)

  const setList = document.getElementById('set-list')
  if (setList) {
    setList.innerHTML = ex.sets.length
      ? ex.sets.map((s, i) => renderSetRow(i, s.reps, s.weight, exDef ? exDef.targetWeight : 0)).join('')
      : '<div class="text-3" style="font-size:14px;text-align:center;padding:12px 0">Aucune série saisie</div>'
    updateLogProgress()
  }
  const rpeTitle = document.getElementById('rpe-title')
  if (rpeTitle) rpeTitle.textContent = `RPE (${ex.rpe || '-'}/10)`
  const rpeBtns = document.querySelectorAll('.rpe-btn')
  rpeBtns.forEach((btn, i) => btn.classList.toggle('selected', i + 1 === ex.rpe))
  const validateBtn = document.querySelector('.btn-primary.btn-block.mt-16')
  if (validateBtn) { validateBtn.disabled = false; validateBtn.style.opacity = '1' }
}

function confirmExitLog() {
  showModal(`<div class="modal-title">Quitter la séance ?</div>
    <p class="text-2">Ta progression est sauvegardée, tu pourras reprendre plus tard.</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">Annuler</button>
      <button class="btn btn-danger" onclick="exitLog()">Quitter</button>
    </div>`)
}

function exitLog() {
  hideModal()
  stopChrono()
  releaseWakeLock()
  navigateTo('today')
}

function toggleChrono() {
  if (isChronoRunning()) pauseChrono()
  else {
    const draft = getDraft()
    const session = getSessionById(appData, draft.sessionId)
    const exDef = session.exercises.find(e => e.id === draft.exercises[logExerciseIndex].exerciseId)
    const restTime = exDef ? exDef.restSec : 180
    resumeChrono(() => {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
    })
  }
}

function resetChrono(seconds) {
  stopChrono()
  startChrono(seconds, () => {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200])
  })
}

// ── LOG SUMMARY ──

function renderLogSummary(screen, draft, session) {
  let html = `<div class="screen-header"><h1 class="screen-title">Récapitulatif</h1></div>
    <div class="card-glass animate-in" style="text-align:center;padding:32px">
      <span style="font-size:48px">✅</span>
      <div style="font-weight:700;font-size:20px;margin-top:8px">Séance terminée !</div>
      <div class="text-2" style="font-size:14px">Séance ${draft.sessionId} · ${formatDate(draft.date)}</div>
    </div>`

  for (let i = 0; i < draft.exercises.length; i++) {
    const ex = draft.exercises[i]
    const exDef = session.exercises.find(e => e.id === ex.exerciseId)
    if (ex.sets.length === 0) continue
    html += `<div class="card">
      <div style="font-weight:600;margin-bottom:4px">${exDef ? esc(exDef.name) : esc(ex.exerciseId)}</div>
      <div style="font-size:13px;color:var(--text-2);margin-bottom:4px">
        ${ex.sets.map(s => `${s.reps}×${displayWeight(s.weight, exDef ? exDef.targetWeight === 0 : false)}`).join(' · ')}
      </div>
      <div style="display:flex;gap:8px;font-size:13px">
        ${ex.rpe > 0 ? `<span class="badge" style="background:var(--accent-bg);color:var(--accent)">RPE ${ex.rpe}</span>` : ''}
        ${ex.notes ? `<span class="text-3">📝 ${esc(ex.notes)}</span>` : ''}
      </div>
    </div>`
  }

  html += `<button class="btn btn-success btn-block mt-16" onclick="finishAndSave()">Sauvegarder</button>
    <button class="btn btn-secondary btn-block mt-8" onclick="logExerciseIndex = 0; renderLogScreen()">Modifier</button>`

  screen.innerHTML = html
}

function finishAndSave() {
  const finished = finishSession(appData)
  if (finished) {
    showToast('Séance enregistrée !', 'success')
    releaseWakeLock()
    navigateTo('today')
  }
}

// ── HISTORY SCREEN ──

function renderHistoryScreen() {
  const screen = document.getElementById('screen-history')
  let workouts = getWorkoutsByMonth(appData, historyYear, historyMonth)

  let html = `<div class="screen-header">
    <h1 class="screen-title">Historique</h1>
    <span class="text-2" style="font-size:14px">${appData.workouts.length} séances</span>
  </div>`

  html += `<div class="month-picker">
    <button onclick="changeMonth(-1)">‹</button>
    <span>${new Date(historyYear, historyMonth).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
    <button onclick="changeMonth(1)">›</button>
  </div>`

  html += `<input class="input-field mb-8" type="text" placeholder="🔍 Filtrer par exercice..." value="${esc(historyFilter)}" oninput="setHistoryFilter(this.value)" style="font-size:14px">`

  if (historyFilter) {
    const q = historyFilter.toLowerCase()
    workouts = workouts.filter(w => {
      const session = getSessionById(appData, w.sessionId)
      return w.exercises.some(e => {
        const def = session ? session.exercises.find(x => x.id === e.exerciseId) : null
        const name = def ? def.name : e.exerciseId
        return name.toLowerCase().includes(q)
      })
    })
  }

  if (!workouts.length) {
    html += `<div class="empty-state"><p>Aucune séance trouvée</p></div>`
  } else {
    for (const w of workouts.slice().reverse()) {
      const session = getSessionById(appData, w.sessionId)
      const vol = calculateVolume(w)
      const totalReps = w.exercises.reduce((t, ex) => t + ex.sets.reduce((s, set) => s + (set.reps || 0), 0), 0)
      html += `<div class="history-item" onclick="viewWorkoutDetail('${w.id}')" style="cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <span class="badge ${session ? getSessionColorClass(appData, w.sessionId) : ''}">Séance ${w.sessionId}</span>
            <span class="history-date" style="margin-left:8px">${formatDate(w.date)}</span>
          </div>
          <span style="color:var(--text-3);font-size:12px">${w.duration ? formatDuration(w.duration) : '-'}</span>
        </div>
        <div class="history-exercise mt-8">
          ${w.exercises.filter(e => e.sets.length > 0).map(e => {
            const def = session ? session.exercises.find(x => x.id === e.exerciseId) : null
            return def ? esc(def.name) : esc(e.exerciseId)
          }).join(' · ') || '—'}
        </div>
        <div style="font-size:12px;color:var(--text-3);margin-top:4px">Volume: ${vol} kg · ${totalReps} reps</div>
      </div>`
    }
  }

  screen.innerHTML = html
}

function changeMonth(delta) {
  historyMonth += delta
  if (historyMonth < 0) { historyMonth = 11; historyYear-- }
  if (historyMonth > 11) { historyMonth = 0; historyYear++ }
  renderHistoryScreen()
}

function setHistoryFilter(val) {
  historyFilter = val
  renderHistoryScreen()
}

function viewWorkoutDetail(workoutId) {
  const w = getWorkoutById(appData, workoutId)
  if (!w) return
  const session = getSessionById(appData, w.sessionId)
  let html = `<div class="modal-title">Séance ${w.sessionId} · ${formatDate(w.date)}</div>`
  if (w.duration) html += `<div class="text-2" style="font-size:13px;margin-bottom:16px">Durée: ${formatDuration(w.duration)}</div>`
  for (const ex of w.exercises) {
    const def = session ? session.exercises.find(e => e.id === ex.exerciseId) : null
    if (ex.sets.length === 0) continue
    html += `<div style="margin-bottom:12px">
      <div style="font-weight:600;font-size:14px">${def ? esc(def.name) : esc(ex.exerciseId)}</div>
      <div style="font-size:13px;color:var(--text-2);font-family:var(--font-mono)">
        ${ex.sets.map(s => `${s.reps}×${displayWeight(s.weight, def ? def.targetWeight === 0 : false)}`).join(' · ')}
      </div>
      ${ex.rpe > 0 ? `<span style="font-size:12px;color:var(--accent)">RPE ${ex.rpe}</span>` : ''}
      ${ex.notes ? `<div style="font-size:12px;color:var(--text-3);font-style:italic">${esc(ex.notes)}</div>` : ''}
      ${def ? `<button class="btn btn-sm btn-ghost mt-8" style="font-size:12px" onclick="showExerciseProgress('${w.sessionId}','${def.id}')">📈 Progression</button>` : ''}
    </div>`
  }
  html += `<div class="modal-actions">
    <button class="btn btn-secondary" onclick="editWorkout('${w.id}')">Modifier</button>
    <button class="btn btn-secondary" onclick="hideModal()">Fermer</button>
  </div>`
  showModal(html)
}

function editWorkout(workoutId) {
  const w = getWorkoutById(appData, workoutId)
  if (!w) return
  const session = getSessionById(appData, w.sessionId)
  if (!session) return
  hideModal()
  startSession(appData, w.sessionId, w)
  logExerciseIndex = 0
  requestWakeLock()
  navigateTo('log')
}

function showExerciseProgress(sessionId, exerciseId) {
  const session = getSessionById(appData, sessionId)
  const exDef = session ? session.exercises.find(e => e.id === exerciseId) : null
  if (!exDef) return
  const workouts = getWorkoutsBySession(appData, sessionId).filter(w => {
    return w.exercises.some(e => e.exerciseId === exerciseId && e.sets.length > 0)
  })
  let html = `<div class="modal-title">${esc(exDef.name)} · Progression</div>`
  if (!workouts.length) {
    html += `<p class="text-3">Aucune séance avec cet exercice</p>`
  } else {
    html += `<div style="font-size:13px;max-height:300px;overflow-y:auto">`
    for (const w of workouts.slice().reverse()) {
      const ex = w.exercises.find(e => e.exerciseId === exerciseId)
      if (!ex || !ex.sets.length) continue
      html += `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-weight:500;font-size:13px">${formatDate(w.date)}</div>
        <div style="font-family:var(--font-mono);font-size:13px;color:var(--text-2)">
          ${ex.sets.map(s => `${s.reps}×${displayWeight(s.weight, exDef.targetWeight === 0)}`).join(' · ')}
          ${ex.rpe > 0 ? `<span style="color:var(--accent)"> RPE ${ex.rpe}</span>` : ''}
        </div>
      </div>`
    }
    html += `</div>`
  }
  html += `<div class="modal-actions"><button class="btn btn-secondary" onclick="hideModal()">Fermer</button></div>`
  showModal(html)
}

// ── PROGRAM SCREEN ──

function renderProgramScreen() {
  const screen = document.getElementById('screen-program')
  let html = `<div class="screen-header">
<h1 class="screen-title">Programme</h1>
    <button class="btn btn-sm btn-primary" onclick="showAddSession()">+ Séance</button>
  </div>`

  const programs = getActivePrograms(appData)
  html += `<div class="program-tabs">`
  programs.forEach((p, i) => {
    html += `<button class="program-tab${p === appData.program ? ' active' : ''}" onclick="switchProg(${i})">${esc(p.name)}</button>`
  })
  html += `<button class="program-tab-add" onclick="showAddProgram()">+ Nouveau</button>`
  html += `</div>`

  html += renderCalendar()

  // Schedule config + template editor
  html += `<div class="card mb-16">
    <div class="card-title">Planification</div>
    <div class="input-group mb-8">
      <label class="input-label">Type</label>
      <select class="input-field" onchange="updateScheduleType(this.value)">
        <option value="rotation"${appData.program.schedule.type === 'rotation' ? ' selected' : ''}>Rotation</option>
        <option value="weekly"${appData.program.schedule.type === 'weekly' ? ' selected' : ''}>Hebdomadaire</option>
      </select>
    </div>
    <div class="input-group mb-8">
      <label class="input-label">Ordre (IDs séance séparés par virgules)</label>
      <input class="input-field" value="${esc(appData.program.schedule.order.join(','))}" onchange="updateScheduleOrder(this.value)" placeholder="A,B,C">
    </div>
    <div id="schedule-days-config">${renderScheduleDaysConfig()}</div>
    <div class="text-2" style="font-size:12px;margin-top:8px">Calendrier : clique sur un jour pour le personnaliser. Le modèle hebdomadaire sert de base pour les jours sans assignation directe.</div>
  </div>`

  // Template weekly editor
  html += renderTemplateEditor()

  if (programs.length > 1) {
    html += `<button class="btn btn-sm btn-ghost mb-8" style="color:var(--danger);font-size:13px" onclick="deleteCurrentProgram()">Supprimer ce programme</button>`
  }

  if (!appData.program.sessions.length) {
    html += `<div class="empty-state"><p>Aucune séance dans le programme</p>
      <button class="btn btn-primary mt-16" onclick="showAddSession()">Ajouter une séance</button></div>`
  } else {
    html += `<div class="card mb-16">
      <div class="flex justify-between items-center">
        <div><span class="text-3" style="font-size:13px">Nom du programme</span>
        <input class="input-field mt-8" value="${esc(appData.program.name)}" onchange="updateProgramName(this.value)" style="font-size:15px;font-weight:600"></div>
      </div>
    </div>`

    for (const session of appData.program.sessions) {
      html += `<div class="program-session card">
        <div class="session-header">
          <div>
            <span class="badge ${getSessionColorClass(appData, session.id)}">Séance ${session.id}</span>
            <span style="font-weight:600;margin-left:8px">${esc(session.name)}</span>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn-ghost" style="font-size:14px;color:var(--danger)" onclick="deleteSession('${session.id}')">Suppr.</button>
          </div>
        </div>`
      for (const ex of session.exercises) {
        html += `<div class="program-exercise" onclick="showEditExercise('${session.id}', '${ex.id}')">
          <div class="program-exercise-info">
            <div class="program-exercise-name">${esc(ex.name)}</div>
            <div class="program-exercise-targets">${ex.targetSets}×${ex.targetReps} @ ${displayWeight(ex.targetWeight, true)} · Repos ${ex.restSec}s</div>
          </div>
          <button class="btn-ghost" style="font-size:12px;color:var(--danger)" onclick="event.stopPropagation();deleteExercise('${session.id}','${ex.id}')">✕</button>
        </div>`
      }
      html += `<button class="set-add mt-8" onclick="showAddExercise('${session.id}')">+ Ajouter un exercice</button>`
      html += `</div>`
    }
  }

  screen.innerHTML = html
}

function renderCalendar() {
  const today = new Date()
  const todayStr = localDateStr(today)
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  let html = `<div class="card"><div class="card-title">Calendrier</div>
    <div class="calendar-grid">
      <span class="calendar-day-header">Lun</span><span class="calendar-day-header">Mar</span>
      <span class="calendar-day-header">Mer</span><span class="calendar-day-header">Jeu</span>
      <span class="calendar-day-header">Ven</span><span class="calendar-day-header">Sam</span>
      <span class="calendar-day-header">Dim</span>`

  for (let i = 0; i < 14; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dateStr = localDateStr(d)
    const isToday = dateStr === todayStr
    const isPast = d < todayDay
    let dayClass = 'calendar-day'
    if (isToday) dayClass += ' today'
    if (isPast) dayClass += ' past'
    let label = String(d.getDate())
    let badge = ''
    const gridEntry = appData.scheduleGrid ? appData.scheduleGrid[dateStr] : undefined
    const gridObj = gridEntry && typeof gridEntry === 'object' ? gridEntry : null
    const gridSid = gridObj ? gridObj.sessionId : gridEntry
    if (gridEntry === null) {
      dayClass += ' is-rest'
      badge = 'Repos'
    } else if (gridSid) {
      const ses = getSessionById(appData, gridSid)
      if (ses) {
        dayClass += ' has-session'
        badge = ses.id
      }
    }
    // Show template marker if no grid entry
    if (gridEntry === undefined && appData.scheduleTemplate) {
      const dow = d.getDay()
      const tpl = appData.scheduleTemplate[dow]
      if (tpl && tpl.progName && tpl.sessionId) {
        dayClass += ' has-template'
        badge = '●'
      }
    }
    html += `<div class="${dayClass}" onclick="showDayPicker('${dateStr}')">
      <span>${label}</span>
      ${badge ? `<span class="cal-badge">${esc(badge)}</span>` : ''}
    </div>`
  }
  html += `</div></div>`
  return html
}

function showDayPicker(dateStr) {
  const current = appData.scheduleGrid ? appData.scheduleGrid[dateStr] : undefined
  const currentObj = current && typeof current === 'object' ? current : null
  const d = parseLocalDate(dateStr)
  const formatted = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  let html = `<div class="modal-title">${formatted}</div>
    <p class="text-2" style="font-size:13px;margin-bottom:12px">Planifier :</p>`
  let hasSessions = false
  for (const p of getActivePrograms(appData)) {
    if (!p.sessions.length) continue
    hasSessions = true
    if (appData.programs.length > 1) html += `<div class="text-3" style="font-size:12px;margin:8px 0 4px">${esc(p.name)}</div>`
    for (const s of p.sessions) {
      const sel = currentObj && currentObj.progName === p.name && currentObj.sessionId === s.id
      html += `<button class="btn btn-block btn-secondary mb-8" onclick="setDayPick('${dateStr}','${esc(p.name)}','${s.id}')" style="${sel ? 'border-color:var(--accent)' : ''}">${esc(s.name)} (Séance ${s.id})</button>`
    }
  }
  if (!hasSessions) html += `<p class="text-3" style="font-size:14px">Ajoute d'abord des séances.</p>`
  html += `<button class="btn btn-block ${current === null ? 'btn-danger' : 'btn-secondary'} mb-8" onclick="setDayPick('${dateStr}','',null)">${current === null ? '✓ Repos' : 'Repos'}</button>`
  if (current !== undefined) {
    html += `<button class="btn btn-block btn-ghost mb-8" onclick="clearDayPick('${dateStr}')" style="color:var(--text-3)">Effacer</button>`
  }
  html += `<div class="modal-actions"><button class="btn btn-secondary" onclick="hideModal()">Fermer</button></div>`
  showModal(html)
}

function setDayPick(dateStr, progName, sessionId) {
  if (!appData.scheduleGrid) appData.scheduleGrid = {}
  if (sessionId === null) {
    appData.scheduleGrid[dateStr] = null
  } else {
    appData.scheduleGrid[dateStr] = { progName, sessionId }
  }
  saveData(appData)
  hideModal()
  renderProgramScreen()
}

function clearDayPick(dateStr) {
  if (appData.scheduleGrid) delete appData.scheduleGrid[dateStr]
  saveData(appData)
  hideModal()
  renderProgramScreen()
}

function switchProg(idx) {
  switchProgram(appData, idx)
  saveData(appData)
  renderProgramScreen()
}

function showAddProgram() {
  showModal(`<div class="modal-title">Nouveau programme</div>
    <div class="input-group mb-16">
      <label class="input-label">Nom</label>
      <input class="input-field" id="new-prog-name" placeholder="Mon programme" value="Programme ${appData.programs.length + 1}">
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">Annuler</button>
      <button class="btn btn-primary" onclick="addNewProgram()">Créer</button>
    </div>`)
}

function addNewProgram() {
  const name = document.getElementById('new-prog-name').value.trim() || 'Nouveau programme'
  addProgram(appData, name)
  saveData(appData)
  hideModal()
  renderProgramScreen()
}

function deleteCurrentProgram() {
  const idx = getActiveProgramIndex(appData)
  if (idx < 0) return
  showModal(`<div class="modal-title">Supprimer ce programme ?</div>
    <p class="text-2" style="font-size:14px;margin-bottom:16px">Les séances et exercices de ce programme seront supprimés. Les entraînements déjà faits restent.</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">Annuler</button>
      <button class="btn btn-danger" onclick="confirmDeleteProgram()">Supprimer</button>
    </div>`)
}

function confirmDeleteProgram() {
  const idx = getActiveProgramIndex(appData)
  if (idx < 0) { hideModal(); return }
  removeProgram(appData, idx)
  saveData(appData)
  hideModal()
  renderProgramScreen()
}

function updateProgramName(name) {
  appData.program.name = name || 'Mon Programme'
  saveData(appData)
}

function updateScheduleType(val) {
  appData.program.schedule.type = val
  saveData(appData)
  renderProgramScreen()
}

function updateScheduleOrder(val) {
  appData.program.schedule.order = val.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  saveData(appData)
  renderProgramScreen()
}

function renderScheduleDaysConfig() {
  const sched = appData.program.schedule
  if (sched.type !== 'weekly') return `<div class="text-3" style="font-size:12px;margin-top:4px">Mode rotation : l'ordre détermine la séance suivante.</div>`
  const dayNames = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
  let html = `<label class="input-label">Jours d'entraînement</label><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">`
  for (let i = 0; i < 7; i++) {
    const active = sched.daysOfWeek.includes(i)
    html += `<button class="btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}" onclick="${active ? `removeSchedDay(${i})` : `addSchedDay(${i})`}" style="flex:1;min-width:40px">${dayNames[i]}</button>`
  }
  html += `</div>`
  return html
}

function addSchedDay(day) {
  if (!appData.program.schedule.daysOfWeek.includes(day)) appData.program.schedule.daysOfWeek.push(day)
  appData.program.schedule.daysOfWeek.sort((a,b)=>a-b)
  saveData(appData)
  renderProgramScreen()
}

function removeSchedDay(day) {
  appData.program.schedule.daysOfWeek = appData.program.schedule.daysOfWeek.filter(d => d !== day)
  saveData(appData)
  renderProgramScreen()
}

function renderTemplateEditor() {
  const dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
  let html = `<div class="card"><div class="card-title">Modèle hebdomadaire</div>
    <div class="text-3" style="font-size:12px;margin-bottom:8px">Définit la séance par défaut pour chaque jour de la semaine.</div>`
  for (let i = 0; i < 7; i++) {
    const tpl = appData.scheduleTemplate ? appData.scheduleTemplate[i] : null
    const label = tpl ? (appData.programs.length>1 ? `${tpl.progName} · Séance ${tpl.sessionId}` : `Séance ${tpl.sessionId}`) : '—'
    html += `<div class="template-day-row" style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:14px;font-weight:500">${dayNames[i]}</span>
      <span style="font-size:13px;color:var(--text-2);cursor:pointer" onclick="showTemplateDayPicker(${i})">${label}</span>
    </div>`
  }
  html += `</div>`
  return html
}

function showTemplateDayPicker(dayIdx) {
  const dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
  const current = appData.scheduleTemplate ? appData.scheduleTemplate[dayIdx] : null
  let html = `<div class="modal-title">${dayNames[dayIdx]}</div>
    <p class="text-2" style="font-size:13px;margin-bottom:12px">Séance par défaut :</p>`
  let hasSessions = false
  for (const p of getActivePrograms(appData)) {
    if (!p.sessions.length) continue
    hasSessions = true
    if (appData.programs.length > 1) html += `<div class="text-3" style="font-size:12px;margin:8px 0 4px">${esc(p.name)}</div>`
    for (const s of p.sessions) {
      const sel = current && current.progName === p.name && current.sessionId === s.id
      html += `<button class="btn btn-block btn-secondary mb-8" onclick="setTemplateDay(${dayIdx},'${esc(p.name)}','${s.id}')" style="${sel ? 'border-color:var(--accent)' : ''}">${esc(s.name)} (Séance ${s.id})</button>`
    }
  }
  if (!hasSessions) html += `<p class="text-3" style="font-size:14px">Ajoute d'abord des séances.</p>`
  html += `<button class="btn btn-block btn-ghost mb-8" onclick="clearTemplateDay(${dayIdx})" style="color:var(--text-3)">Effacer</button>`
  html += `<div class="modal-actions"><button class="btn btn-secondary" onclick="hideModal()">Fermer</button></div>`
  showModal(html)
}

function setTemplateDay(dayIdx, progName, sessionId) {
  if (!appData.scheduleTemplate) appData.scheduleTemplate = {}
  appData.scheduleTemplate[dayIdx] = { progName, sessionId }
  saveData(appData)
  hideModal()
  renderProgramScreen()
}

function clearTemplateDay(dayIdx) {
  if (appData.scheduleTemplate) delete appData.scheduleTemplate[dayIdx]
  saveData(appData)
  hideModal()
  renderProgramScreen()
}

function showAddSession() {
  const raw = prompt('ID de la séance (ex: A, B, Push):')
  if (!raw) return
  const id = raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
  if (!id) { showToast('ID invalide', 'error'); return }
  const name = prompt('Nom de la séance (ex: Tirage, Poussée):') || id
  appData.program.sessions.push({ id, name, exercises: [] })
  if (!appData.program.schedule.order.includes(id)) {
    appData.program.schedule.order.push(id)
  }
  saveData(appData)
  renderProgramScreen()
}

function deleteSession(id) {
  if (!confirm(`Supprimer la séance ${id} ?`)) return
  appData.program.sessions = appData.program.sessions.filter(s => s.id !== id)
  appData.program.schedule.order = appData.program.schedule.order.filter(o => o !== id)
  saveData(appData)
  renderProgramScreen()
}

function showAddExercise(sessionId) {
  const lib = appData.exerciseLibrary || []
  let datalistOpts = ''
  for (const ex of lib) datalistOpts += `<option value="${esc(ex.name)}">`
  let html = `<div class="modal-title">Ajouter un exercice</div>
    <div class="input-group mb-16">
      <label class="input-label">Nom</label>
      <input class="input-field" id="ex-name" placeholder="Tractions lestées" list="ex-lib-list">
      <datalist id="ex-lib-list">${datalistOpts}</datalist>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <div class="input-group flex-1">
        <label class="input-label">Séries</label>
        <input class="input-field" id="ex-sets" type="number" min="1" value="4">
      </div>
      <div class="input-group flex-1">
        <label class="input-label">Reps</label>
        <input class="input-field" id="ex-reps" placeholder="5 ou 6-8">
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <div class="input-group flex-1">
        <label class="input-label">Charge (kg)</label>
        <input class="input-field" id="ex-weight" type="number" min="0" step="0.25" value="0">
      </div>
      <div class="input-group flex-1">
        <label class="input-label">Repos (sec)</label>
        <input class="input-field" id="ex-rest" type="number" min="0" step="15" value="180">
      </div>
    </div>
    <div class="input-group mb-16">
      <label class="input-label">Note technique</label>
      <textarea class="input-field" id="ex-notes" placeholder="Optionnelle"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">Annuler</button>
      <button class="btn btn-primary" onclick="addExercise('${sessionId}')">Ajouter</button>
    </div>`
  showModal(html)
}

function addExercise(sessionId) {
  const name = document.getElementById('ex-name').value.trim()
  if (!name) { showToast('Le nom est requis', 'error'); return }
  const session = appData.program.sessions.find(s => s.id === sessionId)
  if (!session) return
  // Check exercise library for existing entry
  let libId = null
  for (const lib of (appData.exerciseLibrary || [])) {
    if (lib.name.toLowerCase() === name.toLowerCase()) { libId = lib.id; break }
  }
  if (!libId) {
    libId = generateId()
    if (!appData.exerciseLibrary) appData.exerciseLibrary = []
    appData.exerciseLibrary.push({ id: libId, name })
  }
  const exId = generateId()
  session.exercises.push({
    id: exId,
    name: name,
    targetSets: parseInt(document.getElementById('ex-sets').value) || 4,
    targetReps: document.getElementById('ex-reps').value.trim() || '10',
    targetWeight: parseFloat(document.getElementById('ex-weight').value) || 0,
    restSec: parseInt(document.getElementById('ex-rest').value) || 180,
    notes: document.getElementById('ex-notes').value.trim()
  })
  saveData(appData)
  hideModal()
  renderProgramScreen()
}

function showEditExercise(sessionId, exerciseId) {
  const session = appData.program.sessions.find(s => s.id === sessionId)
  if (!session) return
  const ex = session.exercises.find(e => e.id === exerciseId)
  if (!ex) return
  let html = `<div class="modal-title">Modifier l'exercice</div>
    <div class="input-group mb-16">
      <label class="input-label">Nom</label>
<input class="input-field" id="ex-name" value="${esc(ex.name)}">
     </div>
     <div style="display:flex;gap:8px;margin-bottom:16px">
       <div class="input-group flex-1">
         <label class="input-label">Séries</label>
         <input class="input-field" id="ex-sets" type="number" min="1" value="${ex.targetSets}">
       </div>
       <div class="input-group flex-1">
         <label class="input-label">Reps</label>
         <input class="input-field" id="ex-reps" value="${esc(ex.targetReps)}">
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <div class="input-group flex-1">
        <label class="input-label">Charge (kg)</label>
        <input class="input-field" id="ex-weight" type="number" min="0" step="0.25" value="${ex.targetWeight}">
      </div>
      <div class="input-group flex-1">
        <label class="input-label">Repos (sec)</label>
        <input class="input-field" id="ex-rest" type="number" min="0" step="15" value="${ex.restSec}">
      </div>
    </div>
    <div class="input-group mb-16">
      <label class="input-label">Note technique</label>
      <textarea class="input-field" id="ex-notes">${esc(ex.notes) || ''}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveEditExercise('${sessionId}','${exerciseId}')">Sauvegarder</button>
    </div>`
  showModal(html)
}

function saveEditExercise(sessionId, exerciseId) {
  const session = appData.program.sessions.find(s => s.id === sessionId)
  if (!session) return
  const ex = session.exercises.find(e => e.id === exerciseId)
  if (!ex) return
  ex.name = document.getElementById('ex-name').value.trim() || ex.name
  ex.targetSets = parseInt(document.getElementById('ex-sets').value) || ex.targetSets
  ex.targetReps = document.getElementById('ex-reps').value.trim() || ex.targetReps
  ex.targetWeight = parseFloat(document.getElementById('ex-weight').value) || 0
  ex.restSec = parseInt(document.getElementById('ex-rest').value) || ex.restSec
  ex.notes = document.getElementById('ex-notes').value.trim()
  saveData(appData)
  hideModal()
  renderProgramScreen()
}

function deleteExercise(sessionId, exerciseId) {
  if (!confirm('Supprimer cet exercice ?')) return
  const session = appData.program.sessions.find(s => s.id === sessionId)
  if (!session) return
  session.exercises = session.exercises.filter(e => e.id !== exerciseId)
  saveData(appData)
  renderProgramScreen()
}

// ── SETTINGS SCREEN ──

function renderSettingsScreen() {
  const screen = document.getElementById('screen-settings')
  const dataSize = new Blob([JSON.stringify(appData)]).size
  const sizeStr = dataSize > 1024 ? `${(dataSize / 1024).toFixed(1)} ko` : `${dataSize} o`

  let html = `<div class="screen-header"><h1 class="screen-title">Réglages</h1></div>`

  html += `<div class="card">
    <div class="card-title">Statistiques</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">
      <div><div style="font-weight:700;font-size:24px">📊 ${appData.workouts.length}</div>
      <div class="text-3" style="font-size:12px">Séances</div></div>
      <div><div style="font-weight:700;font-size:24px">🏋️ ${appData.program.sessions.length}</div>
      <div class="text-3" style="font-size:12px">Types de séance</div></div>
      <div><div style="font-weight:700;font-size:24px">📁 ${getActivePrograms(appData).length}</div>
      <div class="text-3" style="font-size:12px">Programmes</div></div>
    </div>
  </div>`

  html += `<div class="card">
    <div class="card-title">Données</div>
    <div class="text-3" style="font-size:13px;margin-bottom:12px">${sizeStr} dans le navigateur</div>
    <button class="btn btn-secondary btn-block mb-8" onclick="showExport()">📤 Exporter par code</button>
    <button class="btn btn-secondary btn-block mb-8" onclick="showImport()">📥 Importer un code</button>
    <button class="btn btn-secondary btn-block mb-8" onclick="downloadCsvMobile()">📊 Export CSV</button>
    <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="confirmReset()">Tout effacer</button>
  </div>`

  html += `<div class="card">
    <div style="font-size:13px;color:var(--text-3)">
      <div>Force V4</div>
      <div style="margin-top:4px">${appData.workouts.length} séances enregistrées</div>
    </div>
  </div>`

  screen.innerHTML = html
}

function showExport() {
  const code = exportToCode(appData)
  if (!code) { showToast('Erreur d\'export', 'error'); return }
  let html = `<div class="modal-title">Code d'export</div>
    <p class="text-2" style="font-size:13px;margin-bottom:8px">Copie ce code et colle-le dans l'autre app.</p>
    <textarea class="code-area" readonly style="min-height:120px" onclick="this.select()">${code}</textarea>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="copyCode('${code}')">Copier</button>
      <button class="btn btn-secondary" onclick="hideModal()">Fermer</button>
    </div>`
  showModal(html)
}

function copyCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast('Code copié !', 'success')
  }).catch(() => {
    showToast('Copie manuelle nécessaire', 'error')
  })
}

function downloadCsvMobile() {
  try {
    const csv = exportToCsv(appData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'force-v4-export.csv'
    a.click()
    URL.revokeObjectURL(url)
    showToast('CSV exporté', 'success')
  } catch (e) {
    showToast("Erreur d'export CSV", 'error')
  }
}

function showImport() {
  let html = `<div class="modal-title">Importer un code</div>
    <p class="text-2" style="font-size:13px;margin-bottom:8px">Colle le code exporté depuis l'autre app.</p>
    <textarea class="code-area" id="import-code" placeholder="Colle le code ici..." style="min-height:100px"></textarea>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">Annuler</button>
      <button class="btn btn-primary" onclick="doImport()">Importer</button>
    </div>`
  showModal(html)
}

function doImport() {
  const code = document.getElementById('import-code').value.trim()
  if (!code) { showToast('Colle d\'abord un code', 'error'); return }
  try {
    const imported = importFromCode(code)
    const result = mergeProgramAndWorkouts(appData, imported)
    appData = result.data
    saveData(appData)
    hideModal()
    showToast(`${result.added} séance(s) importée(s) !`, 'success')
    renderSettingsScreen()
  } catch (e) {
    showToast(e.message, 'error')
  }
}

function confirmReset() {
  showModal(`<div class="modal-title">Tout effacer ?</div>
    <p class="text-2" style="font-size:14px">Toutes tes données seront supprimées. Cette action est irréversible.</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">Annuler</button>
      <button class="btn btn-danger" onclick="doReset()">Effacer</button>
    </div>`)
}

function doReset() {
  resetData()
  appData = deepClone(DEFAULT_DATA)
  syncProgramFromPrograms(appData)
  saveData(appData)
  hideModal()
  showToast('Données effacées', 'success')
  navigateTo('today')
}

function showOnboarding() {
  if (localStorage.getItem('force_v4_onboarding')) return
  if (!appData.workouts.length && !appData.program.sessions.length) {
    localStorage.setItem('force_v4_onboarding', '1')
    showModal(`<div class="modal-title">Bienvenue sur Force 🏋️</div>
      <div style="font-size:14px;color:var(--text-2);line-height:1.6">
        <p style="margin-bottom:12px">Carnet d'entraînement simple et rapide.</p>
        <ol style="padding-left:20px;margin-bottom:12px">
          <li>Crée tes séances dans <strong>Programme</strong></li>
          <li>Entraîne-toi dans <strong>Saisir</strong></li>
          <li>Suis ta progression dans <strong>Historique</strong></li>
        </ol>
        <p>Les données sont stockées dans ton navigateur.</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="hideModal()">C'est parti !</button>
      </div>`)
  }
}

document.addEventListener('DOMContentLoaded', init)
