export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { mensaje, region } = req.body || {};
  if (!mensaje) return res.status(400).json({ error: 'Sin mensaje' });

  const regionPrompts = {
    andaluz: `Hablas en andaluz, con expresiones como "illo", "macho", "tío", "osea", "no te rayes", y sin la d final en palabras como "comprao", "vendío", "tirao". Eres cercano y gracioso.`,
    catalan: `Mezclas expresiones catalanas como "ostres", "nano", "noia", "flipar", "qué fuerte" con castellano. Eres directo y práctico.`,
    gallego: `Usas expresiones gallegas como "home", "rapaz", "caramba", "mira que" mezcladas con castellano. Eres cálido y tranquilo.`,
    castellano: `Hablas en castellano neutro con lenguaje joven: "tío", "mola", "no renta", "está petando", "brutal", "crack".`,
  };

  const regionTxt = regionPrompts[region] || regionPrompts['castellano'];

  const systemPrompt = `Eres el asistente de laBolsabro, una app de educación financiera para gente joven. Tu nombre es Mosca 🪰.

${regionTxt}

Tu personalidad:
- Explicas las cosas como si se las explicaras a tu abuela o a un amigo que no sabe nada de bolsa
- Usas ejemplos del día a día (pisos de alquiler, el sueldo, el supermercado)
- Nunca das consejos de inversión directos — siempre dices que es educativo y que decida el usuario
- Eres honesto: si algo no renta, lo dices claro
- Usas emojis con moderación
- Eres breve — máximo 3-4 frases por respuesta salvo que pregunten algo complejo
- Si no sabes algo, lo reconoces sin problema

Recuerda: eres educativo, no un asesor financiero. Nunca digas "compra esto" o "vende aquello".`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: mensaje }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.8 },
        }),
      }
    );

    const data = await r.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) throw new Error('Sin respuesta');
    return res.json({ respuesta: texto });
  } catch (e) {
    return res.status(500).json({ error: 'Error al contactar con Gemini' });
  }
}
