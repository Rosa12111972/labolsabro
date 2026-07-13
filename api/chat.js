export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { mensaje, region } = req.body || {};
  if (!mensaje) return res.status(400).json({ error: 'Sin mensaje' });

  const regionPrompts = {
    andaluz: `Hablas en andaluz, con expresiones como "illo", "macho", "tío", sin la d final en palabras como "comprao", "vendío". Eres cercano y gracioso.`,
    catalan: `Mezclas expresiones catalanas como "ostres", "nano", "flipar" con castellano. Eres directo y práctico.`,
    gallego: `Usas expresiones gallegas como "home", "rapaz", "caramba" mezcladas con castellano. Eres cálido y tranquilo.`,
    castellano: `Hablas en castellano con lenguaje joven: "tío", "mola", "no renta", "brutal", "crack".`,
  };

  const regionTxt = regionPrompts[region] || regionPrompts['castellano'];

  const prompt = `Eres Mosca 🪰, el asistente de laBolsabro, una app de educación financiera para gente joven. ${regionTxt} Explicas las cosas como si se las explicaras a tu abuela. Usas ejemplos del día a día (pisos, el sueldo, el supermercado). Nunca das consejos de inversión directos. Eres breve, máximo 3-4 frases. Ahora responde esto: ${mensaje}`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.8 },
        }),
      }
    );

    const data = await r.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) {
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(500).json({ error: 'Sin respuesta de Gemini', detalle: JSON.stringify(data) });
    }
    return res.json({ respuesta: texto });
  } catch (e) {
    console.error('Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
