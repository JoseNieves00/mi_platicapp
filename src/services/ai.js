/**
 * Servicio Unificado de IA: Soporta Groq (Llama 3.3 70B) y Google Gemini
 * Si configuras VITE_GROQ_API_KEY, usará Groq por defecto por su velocidad y gratuidad.
 */

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

export const isGroqConfigured = Boolean(
  GROQ_API_KEY && 
  GROQ_API_KEY.startsWith('gsk_')
);

export const isGeminiConfigured = Boolean(
  GEMINI_API_KEY && 
  GEMINI_API_KEY.length > 10 && 
  !GEMINI_API_KEY.includes('tu-gemini')
);

export const isAIConfigured = isGroqConfigured || isGeminiConfigured;

export const activeAIProvider = isGroqConfigured 
  ? 'Groq (Llama 3.3 70B)' 
  : isGeminiConfigured 
    ? 'Gemini 2.5 Flash' 
    : null;

function buildPrompt({ incomingAmount, pockets, note }) {
  return `
Eres el motor de asignación presupuestal en porcentajes de "MI Platicapp".
El usuario gestiona sus finanzas asignando un porcentaje (%) de cada ingreso recibido a sus bolsillos.

DATOS DEL INGRESO:
- Monto recibido: $${incomingAmount.toLocaleString('es-CO')} COP
- Fuente o concepto: "${note || 'Ingreso general'}"

ESTADO ACTUAL DE LOS BOLSILLOS:
${pockets.map(p => `
- [ID: "${p.id}"] "${p.nombre}":
  * Tipo: ${p.tipo}
  * Saldo actual: $${Number(p.saldo_actual || 0).toLocaleString('es-CO')}
  * Meta fijada: ${p.meta_monto ? `$${Number(p.meta_monto).toLocaleString('es-CO')}` : 'Sin meta fija'}
  * Día vencimiento: ${p.dia_vencimiento ? `Día ${p.dia_vencimiento}` : 'No aplica'}
`).join('')}

REGLAS MATEMÁTICAS INQUEBRANTABLES:
1. La suma total de los porcentajes ('porcentaje') de TODOS los bolsillos DEBE sumar EXACTAMENTE 100.0%.
2. Cada bolsillo debe tener un porcentaje >= 0.
3. Prioriza bolsillos de tipo 'compromiso_fijo' cuyos vencimientos estén más próximos o tengan mayor déficit.
4. Si los compromisos están cubiertos, fortalece 'reserva' o 'ahorro'.
5. Deja siempre un porcentaje realista en 'libre' para gastos diarios u ocio.
6. El campo 'monto' en pesos para cada bolsillo debe ser Math.round((porcentaje / 100) * ${incomingAmount}).
7. La suma de los montos debe ser exactamente igual a ${incomingAmount}.

RESPONDE ÚNICAMENTE CON UN OBJETO JSON VÁLIDO CON ESTA ESTRUCTURA EXACTA (SIN TEXTO EXTRA):
{
  "total_ingreso": ${incomingAmount},
  "reparto": [
    {
      "pocket_id": "id_del_bolsillo",
      "nombre": "nombre_del_bolsillo",
      "porcentaje": 35.0,
      "monto": 315000,
      "justificacion": "Razón corta y clara"
    }
  ],
  "consejo_general": "Frase resumida explicando la estrategia del reparto."
}
`;
}

function normalizePercentages(result, incomingAmount) {
  if (!result || !Array.isArray(result.reparto) || result.reparto.length === 0) {
    throw new Error('Estructura de respuesta de IA inválida');
  }

  // Asegurar suma de porcentajes exactamente al 100%
  let sumPct = result.reparto.reduce((acc, r) => acc + Number(r.porcentaje || 0), 0);
  if (Math.abs(sumPct - 100) > 0.01) {
    const diff = 100 - sumPct;
    result.reparto[0].porcentaje = Number((Number(result.reparto[0].porcentaje) + diff).toFixed(2));
  }

  // Recalcular montos exactos en pesos
  let currentSumPesos = 0;
  result.reparto.forEach((item, index) => {
    if (index === result.reparto.length - 1) {
      item.monto = incomingAmount - currentSumPesos;
    } else {
      item.monto = Math.round((item.porcentaje / 100) * incomingAmount);
      currentSumPesos += item.monto;
    }
  });

  return result;
}

/**
 * Llamada a Groq Cloud (Llama 3.3 70B Versatile)
 */
async function callGroq(prompt, incomingAmount) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'Eres un asignador financiero estricto. Siempre respondes con JSON válido.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Error de Groq (${response.status}): ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  return normalizePercentages(JSON.parse(rawText), incomingAmount);
}

/**
 * Llamada a Google Gemini (Gemini 2.5 Flash)
 */
async function callGemini(prompt, incomingAmount) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Error de Gemini (${response.status}): ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return normalizePercentages(JSON.parse(rawText), incomingAmount);
}

/**
 * Función principal consumida por la app
 */
export async function suggestAllocationWithAI({ incomingAmount, pockets, note = '' }) {
  if (!isAIConfigured) {
    throw new Error('Debes configurar VITE_GROQ_API_KEY o VITE_GEMINI_API_KEY en tu archivo .env');
  }

  const prompt = buildPrompt({ incomingAmount, pockets, note });

  if (isGroqConfigured) {
    return await callGroq(prompt, incomingAmount);
  } else {
    return await callGemini(prompt, incomingAmount);
  }
}
