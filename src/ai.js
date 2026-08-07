const SYSTEM_PROMPT = `Ты — карьерный консультант и опытный рекрутер. Тебе дают текст резюме кандидата и текст вакансии.
Твоя задача — вернуть ТОЛЬКО валидный JSON (без markdown, без пояснений, без обратных кавычек) со следующими полями:

{
  "match_score": число от 0 до 100 — насколько резюме подходит вакансии,
  "cover_message": короткий персонализированный отклик на вакансию (3-5 предложений, живой человеческий тон, без канцелярита, на русском языке),
  "cover_letter": более развёрнутое сопроводительное письмо (6-10 предложений),
  "resume_edits": массив из 3-5 строк — конкретные правки резюме под эту вакансию,
  "strong_points": массив ровно из 3 строк — сильные тезисы резюме, которые стоит оставить/усилить,
  "weak_points": массив ровно из 3 строк — слабые места, которые стоит убрать или переформулировать,
  "recruiter_message": короткое сообщение (2-3 предложения) для отправки рекрутеру в личку,
  "followup_message": короткое сообщение-фоллоуап для отправки через 2-3 дня, если нет ответа
}

Пиши конкретно, по делу, без воды и без общих фраз вроде "командный игрок с горящими глазами". Используй факты из резюме и требования из вакансии.`;

async function generateMatch(resumeText, vacancyText) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `РЕЗЮМЕ:\n${resumeText}\n\nВАКАНСИЯ:\n${vacancyText}\n\nВерни только JSON, как описано в системном промпте.`
        }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content.find((c) => c.type === 'text');
  if (!textBlock) throw new Error('AI не вернул текстовый ответ');

  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error('Не удалось разобрать ответ AI как JSON: ' + cleaned.slice(0, 300));
  }
}

module.exports = { generateMatch };
