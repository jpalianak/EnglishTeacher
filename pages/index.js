import { useState, useRef, useEffect, useCallback } from 'react'

const LEVEL_GUIDES = {
  A1: 'Use only the most basic 100-200 common words. Very short sentences. Extremely simple.',
  A2: 'Use simple vocabulary and short sentences. Avoid idioms. Explain new words.',
  B1: 'Use everyday vocabulary. Occasional idioms are OK. Clear sentences.',
  B2: 'Use rich vocabulary, idioms, and phrasal verbs naturally. Encourage expanded answers.',
  C1: 'Use sophisticated vocabulary, complex grammar, nuanced expressions. Challenge the student.',
  C2: 'Speak as you would to a native speaker. Use all registers and cultural references.',
}

const TOPIC_GUIDES = {
  free: 'Have a natural free conversation on any topic.',
  vocab: 'Focus on building vocabulary. Introduce one useful new word per exchange naturally.',
  grammar: 'After replying naturally, gently note one grammar error the student made and correct it.',
  pronunciation: 'Give pronunciation tips when relevant. Use simple phonetic hints like /θ/ or "sounds like...".',
  interview: 'Simulate a professional job interview. Ask and answer typical interview questions.',
  travel: 'Role-play travel situations: airports, hotels, restaurants, asking for directions.',
}

function buildSystemPrompt(level, topic, spanishOn, detail) {
  let spanishInstructions = ''
  if (spanishOn) {
    if (detail === 'brief') {
      spanishInstructions = `
After your English response, add a section starting with the exact marker "---ES---" on its own line.
In Spanish, write 1-2 sentences clarifying a key word or expression you used. If nothing needs clarification, write "Sin novedades esta vez."`
    } else {
      spanishInstructions = `
After your English response, add a section starting with the exact marker "---ES---" on its own line.
In Spanish: 1) briefly translate or paraphrase what you said. 2) If you used an interesting word, idiom, or grammar point, explain it simply in Spanish. Keep it concise.`
    }
  }

  return `You are a warm, encouraging English teacher. The student's level is ${level}. ${LEVEL_GUIDES[level]}

Mode: ${TOPIC_GUIDES[topic]}

Keep your English responses conversational and concise (2-4 sentences). Always start your reply in English.
${spanishInstructions}

The "---ES---" section is for reading only — do not read it aloud. Your English part should feel complete on its own.`
}

function parseReply(raw) {
  const idx = raw.indexOf('---ES---')
  if (idx === -1) return { en: raw.trim(), es: null }
  return { en: raw.slice(0, idx).trim(), es: raw.slice(idx + 8).trim() }
}

export default function Home() {
  const [level, setLevel] = useState('B1')
  const [topic, setTopic] = useState('free')
  const [spanishOn, setSpanishOn] = useState(true)
  const [detail, setDetail] = useState('full')
  const [messages, setMessages] = useState([])
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState('Listo')
  const [liveText, setLiveText] = useState('Presioná el micrófono y hablá en inglés...')
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [typeText, setTypeText] = useState('')
  const chatRef = useRef(null)
  const recognitionRef = useRef(null)
  const synthRef = useRef(null)
  const historyRef = useRef([])

  useEffect(() => {
    synthRef.current = window.speechSynthesis
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SR) {
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
        if (final) {
          rec.stop()
          sendToTeacher(final.trim())
          setLiveText('Presioná el micrófono y hablá en inglés...')
        }
      }
      rec.onerror = (e) => {
        setListening(false)
        setStatus(e.error === 'not-allowed' ? 'Permiso de micrófono denegado' : 'Error: ' + e.error)
        setLiveText('Presioná el micrófono y hablá en inglés...')
      }
      rec.onend = () => { setListening(false); setStatus('Listo') }
      recognitionRef.current = rec
    }
  }, [])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages])

  const startConversation = useCallback((lvl, tpc, spOn, det) => {
    historyRef.current = []
    setHistory([])
    setMessages([{ type: 'system', text: 'Conversación iniciada.' }])
    sendToTeacherDirect(
      'Hello, I am ready to start. Please greet me briefly and ask an opening question appropriate for my level.',
      [], lvl, tpc, spOn, det
    )
  }, [])

  useEffect(() => {
    const t = setTimeout(() => startConversation(level, topic, spanishOn, detail), 300)
    return () => clearTimeout(t)
  }, [])

  async function sendToTeacherDirect(userText, hist, lvl, tpc, spOn, det) {
    const newHist = [...hist, { role: 'user', content: userText }]
    historyRef.current = newHist
    setHistory(newHist)
    if (userText !== 'Hello, I am ready to start. Please greet me briefly and ask an opening question appropriate for my level.') {
      setMessages(m => [...m, { type: 'student', text: userText }])
    }
    setStatus('El profesor está pensando...')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: buildSystemPrompt(lvl, tpc, spOn, det),
          messages: newHist,
        }),
      })
      const data = await res.json()
      const raw = data.content?.[0]?.text || 'Sorry, I had trouble responding.'
      const updatedHist = [...newHist, { role: 'assistant', content: raw }]
      historyRef.current = updatedHist
      setHistory(updatedHist)
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
    await sendToTeacherDirect(userText, historyRef.current, level, topic, spanishOn, detail)
  }

  function speakText(text) {
    const synth = synthRef.current
    if (!synth) return
    synth.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'en-US'
    utt.rate = 0.92
    const voices = synth.getVoices()
    const preferred = voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) || voices.find(v => v.lang === 'en-US')
    if (preferred) utt.voice = preferred
    utt.onstart = () => setSpeaking(true)
    utt.onend = () => setSpeaking(false)
    synth.speak(utt)
  }

  function handleMic() {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
    } else {
      if (synthRef.current) synthRef.current.cancel()
      setSpeaking(false)
      setListening(true)
      setStatus('Escuchando...')
      setLiveText('...')
      rec.start()
    }
  }

  function handleSend() {
    const t = typeText.trim()
    if (t) { setTypeText(''); sendToTeacher(t) }
  }

  function handleLevelChange(val) {
    setLevel(val)
    startConversation(val, topic, spanishOn, detail)
  }

  function handleTopicChange(val) {
    setTopic(val)
    startConversation(level, val, spanishOn, detail)
  }

  function handleSpanishToggle(val) {
    setSpanishOn(val)
    startConversation(level, topic, val, detail)
  }

  function handleDetailChange(val) {
    setDetail(val)
    startConversation(level, topic, spanishOn, val)
  }

  return (
    <div className="app">
      <h1>English Voice Teacher</h1>
      <p className="subtitle">Hablá con tu profesor de IA. Se adapta a tu nivel.</p>

      <div className="controls">
        <div className="ctrl">
          <label>Tu nivel</label>
          <select value={level} onChange={e => handleLevelChange(e.target.value)}>
            <option value="A1">A1 — Principiante</option>
            <option value="A2">A2 — Elemental</option>
            <option value="B1">B1 — Intermedio</option>
            <option value="B2">B2 — Intermedio alto</option>
            <option value="C1">C1 — Avanzado</option>
            <option value="C2">C2 — Casi nativo</option>
          </select>
        </div>
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
      </div>

      <div className="controls-row2">
        <div className="ctrl">
          <label>Aclaraciones en español</label>
          <div className="toggle-row">
            <label className="toggle">
              <input type="checkbox" checked={spanishOn} onChange={e => handleSpanishToggle(e.target.checked)} />
              <span className="slider"></span>
            </label>
            <span className="toggle-text">
              {spanishOn ? <>Activadas <span className="badge">ES</span></> : 'Desactivadas'}
            </span>
          </div>
        </div>
        <div className="ctrl">
          <label>Nivel de detalle</label>
          <select value={detail} onChange={e => handleDetailChange(e.target.value)}>
            <option value="brief">Breve (solo lo esencial)</option>
            <option value="full">Completo (traducción + explicación)</option>
          </select>
        </div>
      </div>

      <div className="voice-indicator">
        {speaking && <><span className="dot" />Profesor hablando...</>}
      </div>

      <div className="chat-box" ref={chatRef}>
        {messages.map((msg, i) => {
          if (msg.type === 'system') return <div key={i} className="msg system">{msg.text}</div>
          if (msg.type === 'student') return <div key={i} className="msg student">{msg.text}</div>
          return (
            <div key={i} className="msg teacher">
              <div className="en-part">{msg.en}</div>
              {msg.es && (
                <div className="es-part">
                  <div className="es-label">🇦🇷 En español:</div>
                  <div>{msg.es}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mic-row">
        <button className={`mic-btn${listening ? ' listening' : ''}`} onClick={handleMic} title="Clic para hablar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0014 0M12 19v3M8 22h8" />
          </svg>
        </button>
        <div className="transcript">
          <div className="live-text">{liveText}</div>
          <div className="status">{status}</div>
        </div>
      </div>

      <div className="type-row">
        <input
          type="text"
          value={typeText}
          onChange={e => setTypeText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="O escribí aquí en inglés..."
        />
        <button onClick={handleSend}>Enviar →</button>
      </div>
    </div>
  )
}
