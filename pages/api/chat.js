export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' })
  }

  try {
    const { system, messages, max_tokens } = req.body

    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }))

    const geminiBody = {
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { maxOutputTokens: max_tokens || 1000 },
      contents,
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('Gemini error:', response.status, JSON.stringify(data))
      return res.status(response.status).json(data)
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return res.status(200).json({ content: [{ text }] })
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
