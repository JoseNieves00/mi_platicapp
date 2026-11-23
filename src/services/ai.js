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
 * Diagnóstico financiero dinámico local (100% basado en datos reales del usuario, sin mockups)
 */
export function generateLocalFinancialDiagnosis({ pockets = [], history = [], question = '', profile = 'personal', profileName = 'Personal' }) {
  const total = pockets.reduce((acc, p) => acc + Number(p.saldo_actual || 0), 0);
  const freePocket = pockets.find(p => p.tipo === 'libre') || pockets.find(p => p.nombre.toLowerCase().includes('libre'));
  const freeBalance = freePocket ? Number(freePocket.saldo_actual || 0) : 0;
  const committedBalance = total - freeBalance;

  const now = new Date();
  const currentDay = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // Compromisos próximos
  const upcomingCommitments = pockets.filter(p => p.tipo === 'compromiso_fijo' && p.dia_vencimiento && !p.pagado_este_ciclo).map(p => {
    const dueDay = Number(p.dia_vencimiento);
    const daysLeft = dueDay >= currentDay ? dueDay - currentDay : (daysInMonth - currentDay) + dueDay;
    const falta = Math.max(0, Number(p.meta_monto || 0) - Number(p.saldo_actual || 0));
    return { ...p, daysLeft, falta };
  }).sort((a, b) => a.daysLeft - b.daysLeft);

  const nearest = upcomingCommitments[0];
  const urgentCount = upcomingCommitments.filter(c => c.daysLeft <= 7).length;

  let estado = 'Saludable';
  if (urgentCount > 1 || (nearest && nearest.daysLeft <= 3 && nearest.falta > 0)) {
    estado = 'Requiere atención';
  } else if (urgentCount === 1 || (freeBalance < total * 0.1 && total > 0)) {
    estado = 'Estable';
  }

  const isBusiness = profile === 'business';
  let resumen = '';
  if (pockets.length === 0) {
    resumen = `Tu espacio de ${profileName} está en blanco. Crea tus primeros bolsillos para comenzar a planificar.`;
  } else if (isBusiness) {
    resumen = `En tu contabilidad de ${profileName}, cuentas con $${total.toLocaleString('es-CO')} en total, de los cuales $${freeBalance.toLocaleString('es-CO')} corresponden a liquidez operativa y $${committedBalance.toLocaleString('es-CO')} a reservas/impuestos.`;
  } else {
    resumen = `Tienes $${freeBalance.toLocaleString('es-CO')} disponibles en tu bolsillo Libre para tus gastos diarios sin tocar los $${committedBalance.toLocaleString('es-CO')} resguardados en tus demás bolsillos.`;
  }

  const tips = [];
  if (nearest && nearest.falta > 0) {
    tips.push(`Prioridad inmediata: "${nearest.nombre}" vence en ${nearest.daysLeft} días y faltan $${nearest.falta.toLocaleString('es-CO')} para completarlo.`);
  } else if (nearest && nearest.falta === 0) {
    tips.push(`"${nearest.nombre}" ya tiene la meta cubierta para su vencimiento en ${nearest.daysLeft} días.`);
  }

  if (freeBalance > total * 0.4 && total > 0) {
    tips.push(`Tienes un 40%+ de tus recursos en Libre. Considera asignar una parte a ahorro o reservas para emergencias.`);
  } else if (freeBalance === 0 && total > 0) {
    tips.push(`No tienes saldo en tu bolsillo Libre. Recuerda asignar un porcentaje en tu próximo ingreso para imprevistos.`);
  } else {
    tips.push(`Mantén la regla de separar tus ingresos en porcentajes apenas ingresen a tus cuentas bancarias.`);
  }

  if (isBusiness) {
    tips.push(`Separa un bolsillo exclusivo para provisiones de impuestos (DIAN / IVA) para evitar sorpresas al cierre de mes.`);
  } else {
    tips.push(`Verifica que los saldos de tus bolsillos coincidan con el dinero en tus cuentas (Nequi, Bancolombia, etc.).`);
  }

  let respuesta_copiloto = '';
  if (question) {
    respuesta_copiloto = `Analizando tu estado actual de ${profileName}: Tienes ${pockets.length} bolsillos con un saldo total de $${total.toLocaleString('es-CO')}. Respecto a "${question}", tu prioridad debería ser mantener los compromisos de esta semana cubiertos y proteger tu liquidez en Libre.`;
  }

  return {
    diagnostico_estado: estado,
    resumen_ejecutivo: resumen,
    tips: tips.slice(0, 3),
    respuesta_copiloto
  };
}

/**
 * Función para que el Copiloto analice la salud financiera y movimientos recientes
 */
export async function analyzeFinancesWithAI({ pockets = [], history = [], question = '', profile = 'personal', profileName = 'Personal' }) {
  const config = getStoredConfig();
  const status = getAIStatus();

  if (!status.isConfigured) {
    return generateLocalFinancialDiagnosis({ pockets, history, question, profile, profileName });
  }

  const total = pockets.reduce((acc, p) => acc + Number(p.saldo_actual || 0), 0);
  const freePocket = pockets.find(p => p.tipo === 'libre') || pockets.find(p => p.nombre.toLowerCase().includes('libre'));
  const freeBalance = freePocket ? Number(freePocket.saldo_actual || 0) : 0;

  const prompt = `
Eres el Copiloto Financiero de "MI Platicapp" para el perfil "${profileName}" (${profile === 'business' ? 'Empresa / Negocio' : 'Finanzas Personales'}).
Tu trabajo es analizar la situación REAL del usuario, felicitar logros, advertir riesgos y darle consejos prácticos y humanos sin rodeos.

ESTADÍSTICAS GLOBALES:
- Total acumulado: $${total.toLocaleString('es-CO')} COP
- Saldo en bolsillo Libre (disponible para gastar): $${freeBalance.toLocaleString('es-CO')} COP
- Total resguardado en bolsillos específicos: $${(total - freeBalance).toLocaleString('es-CO')} COP

ESTADO REAL DE SUS BOLSILLOS:
${pockets.length === 0 ? 'Sin bolsillos creados todavía.' : pockets.map(p => `- [${p.nombre}]: Saldo $${Number(p.saldo_actual || 0).toLocaleString('es-CO')} | Tipo: ${p.tipo} (${p.periodicidad || 'mensual'}) | Meta: ${p.meta_monto ? `$${Number(p.meta_monto).toLocaleString('es-CO')}` : 'Sin meta'} | Vencimiento: ${p.dia_vencimiento ? `Día ${p.dia_vencimiento}` : 'Sin día'} | Estado: ${p.pagado_este_ciclo ? 'PAGADO ESTE CICLO' : 'Pendiente'}`).join('\n')}

ÚLTIMOS MOVIMIENTOS REALES:
${history.length === 0 ? 'Sin movimientos registrados.' : history.slice(0, 10).map(h => `- ${h.tipo === 'ingreso' ? `+ Ingreso $${Number(h.monto || 0).toLocaleString('es-CO')}` : `- Gasto $${Number(h.monto || 0).toLocaleString('es-CO')} en ${h.pocketNombre || 'Bolsillo'}`}: ${h.nota || h.fuente || ''} (Fecha: ${h.fecha ? new Date(h.fecha).toLocaleDateString() : 'reciente'})`).join('\n')}

${question ? `PREGUNTA ESPECÍFICA DEL USUARIO: "${question}"` : 'Realiza un diagnóstico financiero completo y genera tips.'}

REGLAS ESTRICTAS:
1. No inventes nombres de servicios que el usuario no tenga. Habla ÚNICAMENTE de los bolsillos y números reales mostrados arriba.
2. Si es perfil Empresa, adapta el tono a rentabilidad, flujo de caja, nómina, impuestos y reservas.
3. Si es perfil Personal, enfócate en tranquilidad financiera, cuotas semanales y colchón libre.

RESPONDE ÚNICAMENTE CON UN JSON VÁLIDO CON ESTA ESTRUCTURA:
{
  "diagnostico_estado": "Saludable | Estable | Requiere atención",
  "resumen_ejecutivo": "Frase de 2 líneas sobre su estado general actual con números precisos.",
  "tips": [
    "Tip 1 concreto y accionable basado en sus bolsillos reales",
    "Tip 2 sobre optimización semanal o vencimientos",
    "Tip 3 para su liquidez o metas"
  ],
  "respuesta_copiloto": "Respuesta detallada y amigable en caso de que haya hecho una pregunta."
}
`;

  try {
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
            { role: 'system', content: 'Asesor financiero experto, empático y directo. Responde estrictamente en JSON sin markdown.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3
        })
      });

      if (!response.ok) {
        return generateLocalFinancialDiagnosis({ pockets, history, question, profile, profileName });
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
        return generateLocalFinancialDiagnosis({ pockets, history, question, profile, profileName });
      }
      const data = await response.json();
      return JSON.parse(data.candidates[0].content.parts[0].text);
    }
  } catch {
    return generateLocalFinancialDiagnosis({ pockets, history, question, profile, profileName });
  }
}
