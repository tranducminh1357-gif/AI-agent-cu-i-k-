// Vercel Serverless Function: /api/chat
// Hỗ trợ biến môi trường GEMINI_API_KEY hoặc OPENAI_API_KEY trên server
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { provider, systemPrompt, userPrompt } = req.body || {};
    if (!userPrompt) {
      return res.status(400).json({ error: 'Thiếu nội dung câu hỏi (userPrompt).' });
    }

    const useOpenAI = provider === 'openai' || (!process.env.GEMINI_API_KEY && process.env.OPENAI_API_KEY);

    if (useOpenAI) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'Chưa cấu hình biến môi trường OPENAI_API_KEY trên server.' });
      }
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemPrompt || 'Bạn là chuyên gia phân tích tài chính doanh nghiệp.' },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        return res.status(resp.status).json({ error: data.error?.message || 'Lỗi OpenAI API' });
      }
      return res.status(200).json({ reply: data.choices?.[0]?.message?.content || '' });
    }

    // Mặc định dùng Google Gemini API (tự động fallback nếu model bận 503/429 hoặc 404)
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.status(400).json({ error: 'Chưa cấu hình biến môi trường GEMINI_API_KEY trên server.' });
    }
    const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.0-flash'];
    let lastErr = 'Lỗi Gemini API';
    let lastStatus = 500;
    for (const modelName of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(geminiKey)}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt || 'Bạn là chuyên gia phân tích tài chính doanh nghiệp.' }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.3 }
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return res.status(200).json({ reply: text });
      }
      lastErr = data.error?.message || `HTTP ${resp.status}`;
      lastStatus = resp.status;
      if (![404, 429, 500, 503].includes(resp.status)) break;
    }
    return res.status(lastStatus).json({ error: lastErr });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Lỗi server nội bộ' });
  }
}

