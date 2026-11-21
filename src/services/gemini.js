/**
 * Servicio para conectar con Gemini 2.5 Flash
 * Genera la sugerencia dinámica de porcentaje por bolsillo cada vez que entra un ingreso.
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

export const isGeminiConfigured = Boolean(
  GEMINI_API_KEY && 
  GEMINI_API_KEY.length > 10 && 
  !GEMINI_API_KEY.includes('tu-gemini')
);

export async function suggestAllocationWithAI({ incomingAmount, pockets, note = '' }) {
  if (!isGeminiConfigured) {
    throw new Error('Debes configurar VITE_GEMINI_API_KEY en tu archivo .env');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `
Eres el motor de asignación presupuestal en porcentajes de "MI Platicapp".
El usuario gestiona sus finanzas asignando un porcentaje (%) de cada ingreso recibido a sus bolsillos.

DATOS DEL INGRESO:
- Monto que acaba de ingresar: $${incomingAmount.toLocaleString('es-CO')} COP
- Nota o fuente: "${note || 'Ingreso general'}"

ESTADO ACTUAL DE LOS BOLSILLOS:
${pockets.map(p => `
- [ID: ${p.id}] "${p.nombre}":
  * Tipo: ${p.tipo}
  * Saldo actual: $${Number(p.saldo_actual || 0).toLocaleString('es-CO')}
  * Meta: ${p.meta_monto ? `$${Number(p.meta_monto).toLocaleString('es-CO')}` : 'Sin meta fija'}
  * Día vencimiento: ${p.dia_vencimiento ? `Día ${p.dia_vencimiento}` : 'No aplica'}
`).join('')}

REGLAS DE ASIGNACIÓN:
1. La suma de los porcentajes de todos los bolsillos DEBE ser exactamente 100.0%.
2. Cada bolsillo debe tener un porcentaje >= 0.
3. Prioriza bolsillos de compromiso_fijo cuyos vencimientos estén próximos o tengan déficit de meta.
4. Si los compromisos están razonablemente cubiertos, aumenta el % a 'reserva' y 'ahorro'.
5. Deja siempre un porcentaje realista en 'libre' para gastos diarios u ocio.
6. El monto en pesos de cada bolsillo debe ser: Math.round((porcentaje / 100) * ${incomingAmount}).
7. Ajusta los centavos para que la suma de los montos en pesos dé exactamente ${incomingAmount}.

RESPONDE ÚNICAMENTE CON UN OBJETO JSON VÁLIDO CON ESTA ESTRUCTURA EXACTA:
{
  "total_ingreso": ${incomingAmount},
  "reparto": [
    {
      "pocket_id": "id_del_bolsillo",
      "nombre": "nombre_del_bolsillo",
      "porcentaje": 35.0,
      "monto": 315000,
      "justificacion": "Cubre el arriendo que vence pronto"
    }
  ],
  "consejo_general": "Breve frase explicativa del reparto."
}
`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Error de Gemini (${response.status}): ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!rawText) {
    throw new Error('Gemini no devolvió ninguna respuesta');
  }

  const result = JSON.parse(rawText);

  // Normalización de seguridad: asegurar que sume exactamente 100%
  let sumPct = result.reparto.reduce((acc, r) => acc + Number(r.porcentaje), 0);
  if (Math.abs(sumPct - 100) > 0.1 && result.reparto.length > 0) {
    const diff = 100 - sumPct;
    result.reparto[0].porcentaje = Number((result.reparto[0].porcentaje + diff).toFixed(2));
  }

  return result;
}
