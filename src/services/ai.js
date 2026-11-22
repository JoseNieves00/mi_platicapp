/**
 * Servicio Unificado de IA: Soporta Groq (Llama 3.3 70B) y Google Gemini
 * Lee claves de .env o de los Ajustes en UI.
 */
import { getStoredConfig } from './config';

export function getAIStatus() {
  const { groqKey, geminiKey, aiProvider } = getStoredConfig();
  const hasGroq = Boolean(groqKey && groqKey.startsWith('gsk_'));
  const hasGemini = Boolean(geminiKey && geminiKey.length > 10 && !geminiKey.includes('tu-gemini'));

  const activeProvider = aiProvider === 'gemini' && hasGemini 
    ? 'Gemini 2.5 Flash' 
    : hasGroq 
      ? 'Groq (Llama 3.3)' 
      : hasGemini 
        ? 'Gemini 2.5 Flash' 
        : null;

  return {
    isConfigured: Boolean(activeProvider),
    activeProvider,
    hasGroq,
    hasGemini
  };
}

export const isAIConfigured = getAIStatus().isConfigured;
export const activeAIProvider = getAIStatus().activeProvider;

function normalizePercentages(result, incomingAmount) {
  if (!result || !Array.isArray(result.reparto) || result.reparto.length === 0) {
    throw new Error('Estructura de respuesta de IA inválida');
  }

  let sumPct = result.reparto.reduce((acc, r) => acc + Number(r.porcentaje || 0), 0);
  if (Math.abs(sumPct - 100) > 0.01) {
    const diff = 100 - sumPct;
    result.reparto[0].porcentaje = Number((Number(result.reparto[0].porcentaje) + diff).toFixed(2));
  }

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

export async function suggestAllocationWithAI({ incomingAmount, pockets, note = '' }) {
  const config = getStoredConfig();
  const status = getAIStatus();

  if (!status.isConfigured) {
    throw new Error('Configura tu clave de Groq o Gemini en la pestaña de Ajustes');
  }

  const prompt = `
Eres el motor de asignación presupuestal en porcentajes de "MI Platicapp".
El usuario gestiona sus finanzas asignando un porcentaje (%) de cada ingreso recibido a sus bolsillos.

DATOS DEL INGRESO:
- Monto recibido: $${incomingAmount.toLocaleString('es-CO')} COP
- Concepto: "${note || 'Ingreso general'}"

ESTADO ACTUAL DE LOS BOLSILLOS:
${pockets.map(p => `
- [ID: "${p.id}"] "${p.nombre}":
  * Tipo: ${p.tipo} (${p.periodicidad || 'mensual'})
  * Saldo actual: $${Number(p.saldo_actual || 0).toLocaleString('es-CO')}
  * Meta fijada: ${p.meta_monto ? `$${Number(p.meta_monto).toLocaleString('es-CO')}` : 'Sin meta'}
  * Estado: ${p.pagado_este_ciclo ? 'PAGADO ESTE CICLO' : 'Pendiente de pago'}
  * Deuda interna pendiente: ${p.deuda_interna ? `Debe $${p.deuda_interna.monto} a ${p.deuda_interna.lender_nombre}` : 'Ninguna'}
`).join('')}

REGLAS MATEMÁTICAS:
1. La suma total de los porcentajes ('porcentaje') de TODOS los bolsillos DEBE sumar EXACTAMENTE 100.0%.
2. Si un bolsillo ya fue PAGADO ESTE CICLO, reduce sustancialmente su prioridad/porcentaje en este ingreso.
3. Si un bolsillo tiene DEUDA INTERNA, asigna un porcentaje para reponer el préstamo al bolsillo prestamista.
4. Prioriza compromisos pendientes y fortalece 'reserva' o 'ahorro'.
5. Deja un porcentaje en 'libre' para gastos diarios.

RESPONDE ÚNICAMENTE CON UN OBJETO JSON VÁLIDO CON ESTA ESTRUCTURA (SIN TEXTO EXTRA):
{
  "total_ingreso": ${incomingAmount},
  "reparto": [
    {
      "pocket_id": "id_del_bolsillo",
      "nombre": "nombre_del_bolsillo",
      "porcentaje": 35.0,
      "monto": 315000,
      "justificacion": "Razón clara y humana"
    }
  ],
  "consejo_general": "Estrategia breve del reparto."
}
`;

  if (status.activeProvider.includes('Groq')) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Asignador financiero estricto. Siempre respondes con JSON válido.' },
          { role: 'user', content: prompt }
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
    return normalizePercentages(JSON.parse(data.choices[0].message.content), incomingAmount);
  } else {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.geminiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
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
}

/**
 * Función para que el Copiloto analice la salud financiera y movimientos recientes
 */
export async function analyzeFinancesWithAI({ pockets, history, question = '' }) {
  const config = getStoredConfig();
  const status = getAIStatus();

  if (!status.isConfigured) {
    throw new Error('Configura tu clave de Groq o Gemini en Ajustes para activar el Copiloto.');
  }

  const prompt = `
Eres el Copiloto Financiero de "MI Platicapp". Tu trabajo es analizar la situación real del usuario, felicitar logros, advertir riesgos y darle consejos prácticos y humanos sin rodeos.

ESTADO DE SUS BOLSILLOS:
${pockets.map(p => `- ${p.nombre}: $${Number(p.saldo_actual || 0).toLocaleString('es-CO')} (${p.tipo}, ${p.pagado_este_ciclo ? 'Pagado este ciclo' : 'Pendiente'}). Meta: $${p.meta_monto || 'Sin meta'}`).join('\n')}

ÚLTIMOS MOVIMIENTOS:
${history.slice(0, 10).map(h => `- ${h.tipo === 'ingreso' ? `+ Ingreso $${h.monto}` : `- Gasto $${h.monto} en ${h.pocketNombre}`}: ${h.nota || ''}`).join('\n')}

${question ? `PREGUNTA ESPECÍFICA DEL USUARIO: "${question}"` : 'Realiza un diagnóstico financiero completo y genera tips.'}

RESPONDE ÚNICAMENTE CON UN JSON VÁLIDO CON ESTA ESTRUCTURA:
{
  "diagnostico_estado": "Saludable | Estable | Requiere atención",
  "resumen_ejecutivo": "Frase de 2 líneas sobre su estado general actual.",
  "tips": [
    "Tip 1 concreto y accionable basado en sus números",
    "Tip 2 sobre optimización o compromisos",
    "Tip 3 para su colchón de reserva o metas"
  ],
  "respuesta_copiloto": "Respuesta detallada y amigable en caso de que haya hecho una pregunta."
}
`;

  if (status.activeProvider.includes('Groq')) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Asesor financiero experto, empático y directo. Responde estrictamente en JSON.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Error de Groq: ${err.error?.message || response.statusText}`);
    }
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } else {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.geminiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Error de Gemini: ${err.error?.message || response.statusText}`);
    }
    const data = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text);
  }
}
