/**
 * Utilidades matemáticas y lógicas financieras para MI Platicapp
 * Manejo de cuotas semanales, vencimientos, y asignaciones híbridas (% / $)
 */

/**
 * Calcula métricas semanales y días para vencimiento de un bolsillo
 */
export function getPocketWeeklyMetrics(pocket) {
  const meta = Number(pocket?.meta_monto || 0);
  const saldo = Number(pocket?.saldo_actual || 0);
  const now = new Date();
  const currentDay = now.getDate();
  const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  let daysLeft = null;
  let isDueSoon = false;
  let isOverdue = false;

  if (pocket?.dia_vencimiento) {
    const dueDay = Number(pocket.dia_vencimiento);
    if (dueDay >= currentDay) {
      daysLeft = dueDay - currentDay;
    } else {
      // Vence en el ciclo del próximo mes
      daysLeft = (daysInCurrentMonth - currentDay) + dueDay;
    }

    if (daysLeft === 0) {
      isDueSoon = true;
    } else if (daysLeft > 0 && daysLeft <= 7) {
      isDueSoon = true;
    } else if (daysLeft < 0) {
      isOverdue = true;
    }
  }

  // Desglose semanal
  const semanasDelCiclo = pocket?.periodicidad === 'quincenal' ? 2 : (pocket?.periodicidad === 'semanal' ? 1 : 4);
  const cuotaSemanal = meta > 0 ? Math.round(meta / semanasDelCiclo) : 0;

  // En qué semana del mes estamos (1 a 4)
  const weekIndex = Math.min(semanasDelCiclo, Math.max(1, Math.ceil(currentDay / 7)));
  const metaAcumuladaEsperada = Math.min(meta, cuotaSemanal * weekIndex);
  
  const faltanteSemanal = meta > 0 ? Math.max(0, metaAcumuladaEsperada - saldo) : 0;
  const faltanteTotal = meta > 0 ? Math.max(0, meta - saldo) : 0;
  const cuotaSemanalCubierta = meta > 0 ? saldo >= metaAcumuladaEsperada : true;
  const porcentajeProgreso = meta > 0 ? Math.min(100, Math.round((saldo / meta) * 100)) : null;

  return {
    meta,
    saldo,
    daysLeft,
    isDueSoon,
    isOverdue,
    cuotaSemanal,
    faltanteSemanal,
    faltanteTotal,
    cuotaSemanalCubierta,
    porcentajeProgreso,
    semanasDelCiclo,
    weekIndex
  };
}

/**
 * Calcula saldos segmentados: Disponible Libre vs Reservado en Bolsillos vs Total
 */
export function getSegmentedBalances(pockets = []) {
  let freeBalance = 0;
  let committedBalance = 0;
  let totalBalance = 0;

  pockets.forEach(p => {
    const saldo = Number(p.saldo_actual || 0);
    totalBalance += saldo;
    const isFree = p.tipo === 'libre' || p.nombre?.toLowerCase().includes('libre');
    if (isFree) {
      freeBalance += saldo;
    } else {
      committedBalance += saldo;
    }
  });

  return {
    freeBalance,
    committedBalance,
    totalBalance
  };
}

/**
 * Calcula la repartición de porcentajes base definidos por el usuario en cada bolsillo.
 * IMPORTANTE: Los bolsillos con porcentaje_objetivo NUNCA deben inflarse con el sobrante.
 */
export function calculatePredefinedAllocation(incomingAmount, pockets = []) {
  if (!pockets || pockets.length === 0) {
    return { percentages: {}, amounts: {}, remainingPercentage: 100, remainingAmount: incomingAmount || 0 };
  }

  const resultPcts = {};
  const resultAmounts = {};
  let totalPctAssigned = 0;

  const freePocket = pockets.find(p => p.tipo === 'libre' || p.nombre.toLowerCase().includes('libre'));

  // 1. Asignar los que tienen porcentaje_objetivo explícito (estricto)
  pockets.forEach(p => {
    if (p.id === freePocket?.id) return;
    if (p.porcentaje_objetivo !== undefined && p.porcentaje_objetivo !== null && Number(p.porcentaje_objetivo) > 0) {
      const fixedPct = Number(p.porcentaje_objetivo);
      resultPcts[p.id] = fixedPct;
      resultAmounts[p.id] = incomingAmount > 0 ? Math.round((fixedPct / 100) * incomingAmount) : 0;
      totalPctAssigned += fixedPct;
    }
  });

  // 2. Si hay bolsillo Libre, el sobrante va al Libre
  const remainingPct = Math.max(0, Number((100 - totalPctAssigned).toFixed(1)));

  pockets.forEach(p => {
    if (resultPcts[p.id] === undefined) {
      if (p.id === freePocket?.id) {
        resultPcts[p.id] = remainingPct;
        resultAmounts[p.id] = incomingAmount > 0 ? Math.round((remainingPct / 100) * incomingAmount) : 0;
      } else {
        resultPcts[p.id] = 0;
        resultAmounts[p.id] = 0;
      }
    }
  });

  // Si no hay bolsillo libre, los demás quedan en 0 y el remainingPercentage indica cuánto falta asignar al 100%
  return {
    percentages: resultPcts,
    amounts: resultAmounts,
    remainingPercentage: freePocket ? 0 : remainingPct,
    remainingAmount: freePocket ? 0 : (incomingAmount > 0 ? Math.round((remainingPct / 100) * incomingAmount) : 0)
  };
}

/**
 * Sugerencia inteligente de reparto:
 * 1. Respeta estrictamente los porcentajes base (ej. Diezmo 10%).
 * 2. Prioriza compromisos por urgencia de fecha de corte/vencimiento (menor daysLeft).
 * 3. Asigna para cubrir la cuota semanal pendiente (o meta mensual) SIN exceder la meta fijada.
 * 4. Ignora compromisos ya pagados en este ciclo.
 * 5. Cualquier excedente va al bolsillo Libre.
 */
export function calculateWeeklyTargetAllocation(incomingAmount, pockets = []) {
  if (!incomingAmount || incomingAmount <= 0 || !pockets || pockets.length === 0) {
    return { percentages: {}, amounts: {} };
  }

  const freePocket = pockets.find(p => p.tipo === 'libre' || p.nombre.toLowerCase().includes('libre'));
  const resultAmounts = {};
  const resultPcts = {};
  let moneyAssigned = 0;
  let pctAssigned = 0;

  // 1. Reservar primero los porcentajes base inmutables (ej. Diezmo 10%)
  pockets.forEach(p => {
    if (p.id === freePocket?.id) return;
    if (p.porcentaje_objetivo !== undefined && p.porcentaje_objetivo !== null && Number(p.porcentaje_objetivo) > 0) {
      const fixedPct = Number(p.porcentaje_objetivo);
      const amt = Math.round((fixedPct / 100) * incomingAmount);
      resultPcts[p.id] = fixedPct;
      resultAmounts[p.id] = amt;
      moneyAssigned += amt;
      pctAssigned += fixedPct;
    }
  });

  // Dinero y porcentaje restante disponible para compromisos y gastos
  let availableMoney = Math.max(0, incomingAmount - moneyAssigned);

  // 2. Analizar compromisos pendientes (que no tengan porcentaje fijo ya asignado y no sean libre)
  const commitments = pockets
    .filter(p => p.id !== freePocket?.id && resultPcts[p.id] === undefined)
    .map(p => {
      const metrics = getPocketWeeklyMetrics(p);
      const isPaid = Boolean(p.pagado_este_ciclo);
      // Lo que realmente le falta para su cuota semanal o para su meta total
      const neededWeekly = isPaid ? 0 : Math.max(0, metrics.faltanteSemanal);
      const neededTotal = isPaid ? 0 : Math.max(0, metrics.faltanteTotal);
      const targetNeed = neededWeekly > 0 ? neededWeekly : (neededTotal > 0 ? neededTotal : 0);
      const days = metrics.daysLeft !== null ? metrics.daysLeft : 999;
      return { pocket: p, metrics, targetNeed, days, isPaid };
    })
    // Ordenar por urgencia: primero los que vencen más pronto
    .sort((a, b) => a.days - b.days);

  // Asignar fondos a compromisos con urgencia
  commitments.forEach(item => {
    if (item.isPaid || item.targetNeed <= 0 || availableMoney <= 0) {
      resultAmounts[item.pocket.id] = 0;
      resultPcts[item.pocket.id] = 0;
      return;
    }

    // No asignar más de lo que necesita el compromiso ni más de lo disponible
    const allocated = Math.min(availableMoney, item.targetNeed);
    resultAmounts[item.pocket.id] = allocated;
    const pct = Number(((allocated / incomingAmount) * 100).toFixed(1));
    resultPcts[item.pocket.id] = pct;
    availableMoney -= allocated;
    moneyAssigned += allocated;
    pctAssigned += pct;
  });

  // 3. Asignar el remanente al bolsillo Libre para garantizar 100% de asignación
  const remainingPct = Math.max(0, Number((100 - pctAssigned).toFixed(1)));
  const remainingMoney = Math.max(0, incomingAmount - moneyAssigned);

  if (freePocket) {
    resultPcts[freePocket.id] = remainingPct;
    resultAmounts[freePocket.id] = remainingMoney;
  } else {
    // Si no hay bolsillo libre explícito y queda remanente, asignar al primer compromiso pendiente o al primero disponible
    const targetComp = commitments.find(c => !c.isPaid) || commitments[0];
    const targetId = targetComp ? targetComp.pocket.id : pockets[0]?.id;
    if (targetId && remainingPct > 0) {
      // Solo sumamos al primero si NO es un bolsillo con porcentaje base fijo
      const firstPocket = pockets.find(p => p.id === targetId);
      if (!firstPocket?.porcentaje_objetivo) {
        resultPcts[targetId] = Number(((resultPcts[targetId] || 0) + remainingPct).toFixed(1));
        resultAmounts[targetId] = (resultAmounts[targetId] || 0) + remainingMoney;
      }
    }
  }

  // Ajuste fino por redondeo a 100%
  const currentTotal = Object.values(resultPcts).reduce((a, b) => a + b, 0);
  const diff = Number((100 - currentTotal).toFixed(1));
  if (Math.abs(diff) > 0.01 && Math.abs(diff) <= 0.5) {
    const adjustPocket = freePocket || pockets.find(p => !p.porcentaje_objetivo) || pockets[0];
    if (adjustPocket) {
      resultPcts[adjustPocket.id] = Number(((resultPcts[adjustPocket.id] || 0) + diff).toFixed(1));
      resultAmounts[adjustPocket.id] = Math.round((resultPcts[adjustPocket.id] / 100) * incomingAmount);
    }
  }

  return {
    percentages: resultPcts,
    amounts: resultAmounts
  };
}

/**
 * Detecta y reinicia automáticamente compromisos pagados si el mes calendario cambió
 */
export function checkAndResetMonthlyCycle(pocketsList = []) {
  if (!pocketsList || pocketsList.length === 0) return { updated: [], hasChanges: false };
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  let hasChanges = false;

  const updated = pocketsList.map(p => {
    if (p.pagado_este_ciclo && p.ultimo_pago_mes && p.ultimo_pago_mes !== currentMonth) {
      hasChanges = true;
      return {
        ...p,
        pagado_este_ciclo: false
      };
    }
    return p;
  });

  return { updated, hasChanges };
}

