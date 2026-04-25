import { useState, useRef, useEffect, useCallback } from 'react'

// ── Constants ────────────────────────────────────────────────────────────────

const LEVEL_GUIDES = {
  A1: 'Use only the most basic 100-200 common words. Speak in 1 very short sentence. Extremely simple.',
  A2: 'Use simple vocabulary. Speak in 1-2 short sentences. Avoid idioms.',
  B1: 'Use everyday vocabulary. Speak in 2 sentences. Occasional idioms are OK.',
  B2: 'Use rich vocabulary, idioms, and phrasal verbs. Speak in 2-3 sentences.',
  C1: 'Use sophisticated vocabulary and complex grammar. Speak in 3-4 sentences.',
  C2: 'Speak as you would to a native speaker, all registers. Speak in 4-5 sentences.',
}

const TOPIC_GUIDES = {
  free:          'Have a natural free conversation on any topic.',
  vocab:         'Focus on building vocabulary. Introduce one useful new word per exchange naturally.',
  grammar:       'After replying naturally, gently note one grammar error the student made and correct it.',
  pronunciation: 'Give pronunciation tips when relevant. Use simple phonetic hints like /θ/ or "sounds like...".',
  interview:     'Simulate a professional job interview. Ask and answer typical interview questions.',
  travel:        'Role-play travel situations: airports, hotels, restaurants, asking for directions.',
}

const EXERCISE_TOPICS = {
  A1: ['Verb to be', 'Articles (a/an/the)', 'Present simple', 'Colors & numbers', 'Greetings'],
  A2: ['Present continuous', 'Past simple', 'There is/there are', 'Possessive adjectives', 'Question words'],
  B1: ['Present perfect', 'First conditional', 'Phrasal verbs', 'Comparatives', 'Modal verbs'],
  B2: ['Second & third conditional', 'Passive voice', 'Reported speech', 'Advanced phrasal verbs', 'Linking words'],
  C1: ['Subjunctive & wishes', 'Inversion', 'Perfect modals', 'Cleft sentences', 'Formal register'],
  C2: ['Modal nuances', 'Idiomatic expressions', 'Hedging language', 'Rhetorical devices', 'Complex grammar'],
}

const LISTENING_RATES = { A1: 0.72, A2: 0.80, B1: 0.87, B2: 0.92, C1: 0.97, C2: 1.02 }

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildFeedbackPrompt() {
  return `You are a friendly English teacher giving quick feedback. Analyze the student's message for grammar, vocabulary, or phrasing errors.

If there ARE errors:
- Respond in Spanish, conversational tone — like a friend, not a textbook
- Say what was wrong and give the correct version. Wrap every English word or phrase inside [EN]...[/EN] tags.
- Always include the full corrected sentence in English inside [EN]...[/EN].
- Example: "Dijiste [EN]I go yesterday[/EN], lo correcto sería [EN]I went yesterday[/EN]. La frase completa: [EN]I went to the store yesterday[/EN]."
- Max 2-3 sentences. No bullet points, no symbols.

If there are NO errors: respond with exactly: OK

Only analyze language errors. Do not reply to the content.`
}

function buildSystemPrompt(level, topic, spanishOn) {
  const spanish = spanishOn ? `
After your English response, add a section starting with "---ES---" on its own line.
In Spanish: briefly translate what you said and explain any interesting word or grammar point. Keep it concise.` : ''

  return `You are a warm, encouraging English teacher. Student level: ${level}. ${LEVEL_GUIDES[level]}
Mode: ${TOPIC_GUIDES[topic]}
Always respond in English.${spanish}
The "---ES---" section is visual only — NOT read aloud.`
}

function buildExercisePrompt(level, topic) {
  return `You are an English teacher creating an exercise.
Level: ${level}. Topic: ${topic}.

Create ONE exercise. Vary the type each time: fill-in-the-blank, correct-the-error, rewrite-the-sentence, choose-the-right-form, or translate-to-English.

Respond in this exact format (nothing else):
TIPO: [exercise type in English]
EJERCICIO: [the exercise — use ___ for blanks]
PISTA: [optional brief hint in English]

Do not include the answer.`
}

function buildExerciseCorrectionPrompt(level, ejercicio, respuesta) {
  return `You are an English teacher evaluating a student's exercise answer.
Level: ${level}
Exercise: ${ejercicio}
Student answer: ${respuesta}

Respond in this exact format (nothing else):
CORRECTO: Yes / No / Partially
RESPUESTA: [the correct answer]
EXPLICACION: [2-3 sentences in English, warm and encouraging]`
}

function buildListeningPrompt(level) {
  const len = { A1: 45, A2: 70, B1: 100, B2: 130, C1: 160, C2: 200 }
  return `You are an English teacher creating a listening comprehension exercise for level ${level}.

Write a varied, interesting passage (~${len[level]} words) — story, news item, description, dialogue, etc. Make it different every time. Use vocabulary and grammar appropriate for ${level}.

Then write exactly 3 multiple-choice questions IN ENGLISH about the passage.

Use this exact format:

PASAJE:
[passage text]

PREGUNTAS:
1. [question in English]
A) [option]
B) [option]
C) [option]
D) [option]
RESPUESTA: [A/B/C/D]
EXPLICACION: [brief explanation in English]

2. [question in English]
A) [option]
B) [option]
C) [option]
D) [option]
RESPUESTA: [A/B/C/D]
EXPLICACION: [brief explanation in English]

3. [question in English]
A) [option]
B) [option]
C) [option]
D) [option]
RESPUESTA: [A/B/C/D]
EXPLICACION: [brief explanation in English]`
}

// ── Parsers ──────────────────────────────────────────────────────────────────

function parseEnSegments(text) {
  const segments = []
  const re = /\[EN\](.*?)\[\/EN\]/g
  let last = 0, match
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index), en: false })
    segments.push({ text: match[1], en: true })
    last = match.index + match[0].length
  }
  if (last < text.length) segments.push({ text: text.slice(last), en: false })
  return segments
}

function renderFeedbackText(text) {
  return parseEnSegments(text).map((seg, i) =>
    seg.en ? <span key={i} className="feedback-en">{seg.text}</span> : <span key={i}>{seg.text}</span>
  )
}

function parseReply(raw) {
  const idx = raw.indexOf('---ES---')
  if (idx === -1) return { en: raw.trim(), es: null }
  return { en: raw.slice(0, idx).trim(), es: raw.slice(idx + 8).trim() }
}

function parseExercise(raw) {
  return {
    tipo:     (raw.match(/^TIPO:\s*(.+)/im)?.[1] ?? '').trim(),
    ejercicio:(raw.match(/^EJERCICIO:\s*(.+)/im)?.[1] ?? '').trim(),
    pista:    (raw.match(/^PISTA:\s*(.+)/im)?.[1] ?? '').trim(),
  }
}

function parseCorrection(raw) {
  return {
    correcto:   (raw.match(/^CORRECTO:\s*(.+)/im)?.[1] ?? '').trim(),
    respuesta:  (raw.match(/^RESPUESTA:\s*(.+)/im)?.[1] ?? '').trim(),
    explicacion:(raw.match(/^EXPLICACION:\s*(.+)/im)?.[1] ?? '').trim(),
  }
}

function parseListening(raw) {
  const passageMatch = raw.match(/PASAJE:\s*\n([\s\S]*?)(?=\n\s*PREGUNTAS:)/i)
  const passage = passageMatch ? passageMatch[1].trim() : ''
  const qSection = raw.split(/PREGUNTAS:/i)[1] ?? ''
  const blocks = qSection.trim().split(/\n\d+\.\s+/).filter(b => b.trim())

  const questions = blocks.map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l)
    if (!lines.length) return null
    const question = lines[0]
    const options = []
    let correct = -1
    let explanation = ''
    for (const line of lines.slice(1)) {
      const m = line.match(/^([A-D])\)\s*(.+)/)
      if (m) { options.push(m[2]); continue }
      if (/^RESPUESTA:/i.test(line)) correct = ['A','B','C','D'].indexOf(line.replace(/RESPUESTA:\s*/i,'').trim())
      if (/^EXPLICACION:/i.test(line)) explanation = line.replace(/EXPLICACION:\s*/i,'').trim()
    }
    return options.length >= 2 ? { question, options, correct, explanation } : null
  }).filter(Boolean)

  return { passage, questions }
}

function getInitialMessage(topic) {
  return topic === 'free'
    ? 'Hello, I am ready to start. Please greet me warmly and ask what topic I would like to talk about today.'
    : 'Hello, I am ready to start. Please greet me briefly and ask an opening question appropriate for my level.'
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  // Shared
  const [activeTab, setActiveTab] = useState('conversation')
  const [level, setLevel] = useState('B1')

  // Conversation tab
  const [topic, setTopic] = useState('free')
  const [spanishOn, setSpanishOn] = useState(true)
  const [correctionOn, setCorrectionOn] = useState(true)
  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState('Listo')
  const [liveText, setLiveText] = useState('Presioná el micrófono y hablá en inglés...')
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [typeText, setTypeText] = useState('')

  // Exercises tab
  const [exTopic, setExTopic] = useState('')
  const [exCustom, setExCustom] = useState('')
  const [exUseCustom, setExUseCustom] = useState(false)
  const [exercise, setExercise] = useState(null)
  const [exAnswer, setExAnswer] = useState('')
  const [correction, setCorrection] = useState(null)
  const [exLoading, setExLoading] = useState(false)
  const [corrLoading, setCorrLoading] = useState(false)

  // Listening tab
  const [listeningData, setListeningData] = useState(null)
  const [listeningStatus, setListeningStatus] = useState('idle')
  const [selectedAnswers, setSelectedAnswers] = useState([])
  const [showResults, setShowResults] = useState(false)
  const [passageVisible, setPassageVisible] = useState(false)
  const [listeningPlaying, setListeningPlaying] = useState(false)
  const [listeningPaused, setListeningPaused] = useState(false)

  const chatRef = useRef(null)
  const recognitionRef = useRef(null)
  const synthRef = useRef(null)
  const historyRef = useRef([])

  // Speech recognition setup
  useEffect(() => {
    synthRef.current = window.speechSynthesis
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (e) => {
      let interim = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setLiveText(final || interim || '...')
      if (final) { rec.stop(); sendToTeacher(final.trim()); setLiveText('Presioná el micrófono y hablá en inglés...') }
    }
    rec.onerror = (e) => {
      setListening(false)
      setStatus(e.error === 'not-allowed' ? 'Permiso de micrófono denegado' : 'Error: ' + e.error)
      setLiveText('Presioná el micrófono y hablá en inglés...')
    }
    rec.onend = () => { setListening(false); setStatus('Listo') }
    recognitionRef.current = rec
  }, [])

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [messages])

  // ── API helper ──────────────────────────────────────────────────────────────

  async function callAPI(system, msgs, max_tokens = 1000) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_tokens, system, messages: msgs }),
    })
    const data = await res.json()
    return data.content?.[0]?.text || ''
  }

  // ── TTS helper ──────────────────────────────────────────────────────────────

  function speakText(text, rate = 0.92) {
    return new Promise((resolve) => {
      const synth = synthRef.current
      if (!synth) return resolve()
      synth.cancel()
      const utt = new SpeechSynthesisUtterance(text)
      utt.lang = 'en-US'
      utt.rate = rate
      const voices = synth.getVoices()
      utt.voice = voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) || voices.find(v => v.lang === 'en-US') || null
      utt.onstart = () => setSpeaking(true)
      utt.onend = () => { setSpeaking(false); resolve() }
      utt.onerror = () => { setSpeaking(false); resolve() }
      synth.speak(utt)
    })
  }

  // ── Conversation tab ────────────────────────────────────────────────────────

  const startConversation = useCallback((lvl, tpc, spOn, cor) => {
    historyRef.current = []
    setMessages([{ type: 'system', text: 'Conversación iniciada.' }])
    sendToTeacherDirect(getInitialMessage(tpc), [], lvl, tpc, spOn, cor)
  }, [])

  async function sendToTeacherDirect(userText, hist, lvl, tpc, spOn, cor) {
    const newHist = [...hist, { role: 'user', content: userText }]
    historyRef.current = newHist
    const isInitial = userText.startsWith('Hello, I am ready to start.')
    if (!isInitial) setMessages(m => [...m, { type: 'student', text: userText }])

    try {
      if (!isInitial && cor) {
        setStatus('Analizando tu respuesta...')
        const fb = await callAPI(buildFeedbackPrompt(), [{ role: 'user', content: userText }], 300)
        if (fb && fb.trim().toUpperCase() !== 'OK') {
          setMessages(m => [...m, { type: 'feedback', text: fb.trim() }])
        }
      }
      setStatus('El profesor está pensando...')
      const raw = await callAPI(buildSystemPrompt(lvl, tpc, spOn), newHist)
      if (!raw) throw new Error('empty')
      historyRef.current = [...newHist, { role: 'assistant', content: raw }]
      const { en, es } = parseReply(raw)
      setMessages(m => [...m, { type: 'teacher', en, es }])
      setStatus('Listo')
      speakText(en)
    } catch {
      setStatus('Error de conexión')
      setMessages(m => [...m, { type: 'system', text: 'No se pudo conectar con la API.' }])
    }
  }

  async function sendToTeacher(userText) {
    await sendToTeacherDirect(userText, historyRef.current, level, topic, spanishOn, correctionOn)
  }

  function handleMic() {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) { rec.stop(); return }
    if (synthRef.current) synthRef.current.cancel()
    setSpeaking(false)
    setListening(true)
    setStatus('Escuchando...')
    setLiveText('...')
    rec.start()
  }

  function handleSend() {
    const t = typeText.trim()
    if (t) { setTypeText(''); sendToTeacher(t) }
  }

  const conversationActive = messages.length > 0

  function handleLevelChange(val) {
    setLevel(val)
    if (activeTab === 'conversation') { if (conversationActive) startConversation(val, topic, spanishOn, correctionOn) }
    else if (activeTab === 'exercises') { setExercise(null); setCorrection(null); setExAnswer('') }
    else { setListeningData(null); setListeningStatus('idle'); setSelectedAnswers([]); setShowResults(false); setPassageVisible(false) }
  }

  function handleTopicChange(val)      { setTopic(val);       if (conversationActive) startConversation(level, val, spanishOn, correctionOn) }
  function handleSpanishToggle(val)    { setSpanishOn(val);   if (conversationActive) startConversation(level, topic, val, correctionOn) }
  function handleCorrectionToggle(val) { setCorrectionOn(val);if (conversationActive) startConversation(level, topic, spanishOn, val) }

  // ── Exercises tab ───────────────────────────────────────────────────────────

  const activeTopic = exUseCustom ? exCustom.trim() : exTopic

  async function generateExercise() {
    if (!activeTopic) return
    setExLoading(true)
    setExercise(null)
    setCorrection(null)
    setExAnswer('')
    try {
      const raw = await callAPI(buildExercisePrompt(level, activeTopic), [], 400)
      setExercise(parseExercise(raw))
    } finally {
      setExLoading(false)
    }
  }

  async function correctExercise() {
    if (!exAnswer.trim() || !exercise) return
    setCorrLoading(true)
    try {
      const raw = await callAPI(buildExerciseCorrectionPrompt(level, exercise.ejercicio, exAnswer), [], 400)
      setCorrection(parseCorrection(raw))
    } finally {
      setCorrLoading(false)
    }
  }

  function resetExercise() {
    setExercise(null)
    setCorrection(null)
    setExAnswer('')
  }

  // ── Listening tab ───────────────────────────────────────────────────────────

  async function generateListening() {
    synthRef.current?.cancel()
    setListeningPlaying(false)
    setListeningPaused(false)
    setListeningStatus('generating')
    setListeningData(null)
    setSelectedAnswers([])
    setShowResults(false)
    setPassageVisible(false)
    try {
      const raw = await callAPI(buildListeningPrompt(level), [], 1200)
      const data = parseListening(raw)
      setListeningData(data)
      setSelectedAnswers(new Array(data.questions.length).fill(-1))
      setListeningStatus('ready')
    } catch {
      setListeningStatus('idle')
    }
  }

  async function playPassage() {
    if (!listeningData?.passage) return
    const synth = synthRef.current
    if (!synth) return
    if (listeningPlaying && !listeningPaused) {
      synth.pause()
      setListeningPaused(true)
      return
    }
    if (listeningPaused) {
      synth.resume()
      setListeningPaused(false)
      return
    }
    setListeningPlaying(true)
    setListeningPaused(false)
    await speakText(listeningData.passage, LISTENING_RATES[level] ?? 0.9)
    setListeningPlaying(false)
    setListeningPaused(false)
  }

  function selectAnswer(qIdx, aIdx) {
    if (showResults) return
    setSelectedAnswers(prev => prev.map((v, i) => i === qIdx ? aIdx : v))
  }

  function checkAnswers() {
    setShowResults(true)
    setPassageVisible(true)
  }

  const isPlaceholder = liveText === 'Presioná el micrófono y hablá en inglés...'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">English <span>Voice</span> Teacher</h1>
        <p className="app-subtitle">Hablá con tu profesor de IA. Se adapta a tu nivel.</p>
      </header>

      <div className="level-bar">
        <span className="level-label">Nivel</span>
        <select value={level} onChange={e => handleLevelChange(e.target.value)} className="level-select">
          <option value="A1">A1 — Principiante</option>
          <option value="A2">A2 — Elemental</option>
          <option value="B1">B1 — Intermedio</option>
          <option value="B2">B2 — Intermedio alto</option>
          <option value="C1">C1 — Avanzado</option>
          <option value="C2">C2 — Casi nativo</option>
        </select>
      </div>

      <div className="tabs">
        {['conversation','exercises','listening'].map(tab => (
          <button key={tab} className={`tab-btn${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab === 'conversation' ? 'Conversación' : tab === 'exercises' ? 'Ejercicios' : 'Listening'}
          </button>
        ))}
      </div>

      {/* ── Conversation tab ── */}
      {activeTab === 'conversation' && (
        <div className="tab-content">
          <div className="controls-panel">
            <div className="controls-grid">
              <div className="ctrl">
                <label>Modo de práctica</label>
                <select value={topic} onChange={e => handleTopicChange(e.target.value)}>
                  <option value="free">Conversación libre</option>
                  <option value="vocab">Vocabulario</option>
                  <option value="grammar">Corrección de gramática</option>
                  <option value="pronunciation">Pronunciación</option>
                  <option value="interview">Entrevista laboral</option>
                  <option value="travel">Situaciones de viaje</option>
                </select>
              </div>
              <div className="ctrl">
                <label>Aclaraciones en español</label>
                <div className="toggle-row">
                  <label className="toggle">
                    <input type="checkbox" checked={spanishOn} onChange={e => handleSpanishToggle(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                  <span className="toggle-text">{spanishOn ? <>Activadas <span className="badge">ES</span></> : 'Desactivadas'}</span>
                </div>
              </div>
              <div className="ctrl">
                <label>Correcciones</label>
                <div className="toggle-row">
                  <label className="toggle">
                    <input type="checkbox" checked={correctionOn} onChange={e => handleCorrectionToggle(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                  <span className="toggle-text">{correctionOn ? <>Activadas <span className="badge">ES</span></> : 'Desactivadas'}</span>
                </div>
              </div>
            </div>
          </div>

          {!conversationActive ? (
            <div className="empty-state">
              <div className="empty-icon">🎙️</div>
              <p>Elegí un modo y empezá a practicar</p>
              <button className="btn-primary" style={{ marginTop: '1.25rem' }}
                onClick={() => startConversation(level, topic, spanishOn, correctionOn)}>
                Iniciar conversación
              </button>
            </div>
          ) : (
            <>
              <div className="chat-box" ref={chatRef}>
                {messages.map((msg, i) => {
                  if (msg.type === 'system') return <div key={i} className="msg system">{msg.text}</div>
                  if (msg.type === 'student') return <div key={i} className="msg student">{msg.text}</div>
                  if (msg.type === 'feedback') return (
                    <div key={i} className="msg feedback">
                      <div className="feedback-label">Corrección</div>
                      <div>{renderFeedbackText(msg.text)}</div>
                    </div>
                  )
                  return (
                    <div key={i} className="msg teacher">
                      <div className="en-part">{msg.en}</div>
                      {msg.es && <div className="es-part"><div className="es-label">En español</div><div>{msg.es}</div></div>}
                    </div>
                  )
                })}
              </div>

              <div className="voice-section">
                <div className="voice-main">
                  <button className={`mic-btn${listening ? ' listening' : ''}`} onClick={handleMic}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="9" y="2" width="6" height="12" rx="3" />
                      <path d="M5 10a7 7 0 0014 0M12 19v3M8 22h8" />
                    </svg>
                  </button>
                  <div className="voice-info">
                    <div className={`voice-live${isPlaceholder ? ' placeholder' : ''}`}>{liveText}</div>
                    <div className="voice-status">{status}</div>
                  </div>
                </div>
                {speaking && <div className="speaking-bar"><span className="dot" />Profesor hablando...</div>}
              </div>

              <div className="type-row">
                <input type="text" value={typeText} onChange={e => setTypeText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="O escribí aquí en inglés..." />
                <button onClick={handleSend}>Enviar</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Exercises tab ── */}
      {activeTab === 'exercises' && (
        <div className="tab-content">
          <div className="controls-panel">
            <div className="ctrl">
              <label>Tema del ejercicio</label>
              <div className="topic-row">
                <select
                  value={exUseCustom ? '__custom__' : exTopic}
                  onChange={e => {
                    if (e.target.value === '__custom__') { setExUseCustom(true) }
                    else { setExUseCustom(false); setExTopic(e.target.value) }
                  }}
                >
                  <option value="">— Elegí un tema —</option>
                  {(EXERCISE_TOPICS[level] || []).map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="__custom__">✏️ Tema personalizado...</option>
                </select>
                {exUseCustom && (
                  <input className="custom-input" type="text" value={exCustom}
                    onChange={e => setExCustom(e.target.value)}
                    placeholder="Ej: past perfect, prepositions of place..." />
                )}
              </div>
            </div>
          </div>

          {!exercise && !exLoading && (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <p>Elegí un tema y generá tu ejercicio</p>
            </div>
          )}

          {exLoading && <div className="loading-card">Generando ejercicio...</div>}

          {exercise && !exLoading && (
            <div className="exercise-card">
              <div className="exercise-type">{exercise.tipo}</div>
              <div className="exercise-text">{exercise.ejercicio}</div>
              {exercise.pista && <div className="exercise-hint">💡 {exercise.pista}</div>}

              {!correction && (
                <>
                  <input className="answer-input" type="text" value={exAnswer}
                    onChange={e => setExAnswer(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && correctExercise()}
                    placeholder="Tu respuesta..." />
                  <div className="action-row">
                    <button className="btn-primary" onClick={correctExercise} disabled={!exAnswer.trim() || corrLoading}>
                      {corrLoading ? 'Corrigiendo...' : 'Corregir'}
                    </button>
                    <button className="btn-secondary" onClick={resetExercise}>Nuevo ejercicio</button>
                  </div>
                </>
              )}
            </div>
          )}

          {correction && (
            <div className={`correction-card ${correction.correcto.toLowerCase().startsWith('yes') ? 'correct' : 'incorrect'}`}>
              <div className="correction-result">
                {correction.correcto.toLowerCase().startsWith('yes') ? '✓ Correcto' :
                 correction.correcto.toLowerCase().startsWith('partial') ? '◑ Parcialmente correcto' : '✗ Incorrecto'}
              </div>
              <div className="correction-answer"><strong>Respuesta correcta:</strong> {correction.respuesta}</div>
              <div className="correction-explanation">{correction.explicacion}</div>
              <div className="action-row" style={{ marginTop: '1rem' }}>
                <button className="btn-primary" onClick={generateExercise}>Nuevo ejercicio</button>
                <button className="btn-secondary" onClick={resetExercise}>Intentar otro</button>
              </div>
            </div>
          )}

          {!exercise && !exLoading && activeTopic && (
            <div className="action-row" style={{ justifyContent: 'center' }}>
              <button className="btn-primary" onClick={generateExercise}>Generar ejercicio</button>
            </div>
          )}
        </div>
      )}

      {/* ── Listening tab ── */}
      {activeTab === 'listening' && (
        <div className="tab-content">
          {listeningStatus === 'idle' && (
            <div className="empty-state">
              <div className="empty-icon">🎧</div>
              <p>Escuchá un pasaje y respondé preguntas de comprensión</p>
              <button className="btn-primary" style={{ marginTop: '1.25rem' }} onClick={generateListening}>
                Generar ejercicio
              </button>
            </div>
          )}

          {listeningStatus === 'generating' && <div className="loading-card">Generando ejercicio de listening...</div>}

          {(listeningStatus === 'ready' || listeningStatus === 'done') && listeningData && (
            <>
              <div className="passage-card">
                <div className="passage-header">
                  <div className="passage-title">Pasaje de audio</div>
                  <div className="passage-actions">
                    <button className={`btn-play${listeningPlaying && !listeningPaused ? ' playing' : ''}`} onClick={playPassage}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        {listeningPlaying && !listeningPaused
                          ? <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>
                          : <path d="M8 5v14l11-7z"/>}
                      </svg>
                      {!listeningPlaying ? 'Reproducir' : listeningPaused ? 'Reanudar' : 'Pausar'}
                    </button>
                    <button className="btn-ghost" onClick={() => setPassageVisible(v => !v)}>
                      {passageVisible ? 'Ocultar texto' : 'Ver texto'}
                    </button>
                  </div>
                </div>
                {passageVisible && <div className="passage-text">{listeningData.passage}</div>}
              </div>

              <div className="questions-section">
                {listeningData.questions.map((q, qi) => (
                  <div key={qi} className="question-card">
                    <div className="question-text">{qi + 1}. {q.question}</div>
                    {q.options.map((opt, oi) => {
                      let cls = 'option-btn'
                      if (showResults) {
                        if (oi === q.correct) cls += ' correct'
                        else if (selectedAnswers[qi] === oi) cls += ' incorrect'
                      } else if (selectedAnswers[qi] === oi) {
                        cls += ' selected'
                      }
                      return (
                        <button key={oi} className={cls} onClick={() => selectAnswer(qi, oi)}>
                          <span className="option-letter">{['A','B','C','D'][oi]}</span> {opt}
                        </button>
                      )
                    })}
                    {showResults && q.explanation && (
                      <div className="question-explanation">{q.explanation}</div>
                    )}
                  </div>
                ))}
              </div>

              {!showResults ? (
                <div className="action-row" style={{ justifyContent: 'center' }}>
                  <button className="btn-primary"
                    disabled={selectedAnswers.some(a => a === -1)}
                    onClick={checkAnswers}>
                    Ver resultados
                  </button>
                </div>
              ) : (
                <div className="results-bar">
                  <div className="results-score">
                    {selectedAnswers.filter((a, i) => a === listeningData.questions[i]?.correct).length}
                    /{listeningData.questions.length} correctas
                  </div>
                  <button className="btn-primary" onClick={generateListening}>Nuevo ejercicio</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
