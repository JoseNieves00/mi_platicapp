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
 * Calcula la repartición híbrida automática para un ingreso entrante
 */
export function calculatePredefinedAllocation(incomingAmount, pockets = []) {
  if (!incomingAmount || incomingAmount <= 0 || !pockets || pockets.length === 0) {
    return { percentages: {}, amounts: {}, remainingPercentage: 100, remainingAmount: incomingAmount || 0 };
  }

  const resultPcts = {};
  const resultAmounts = {};
  let totalPctAssigned = 0;

  const freePocket = pockets.find(p => p.tipo === 'libre' || p.nombre.toLowerCase().includes('libre'));

  // 1. Asignar los que tienen porcentaje_objetivo explícito
  pockets.forEach(p => {
    if (p.id === freePocket?.id) return;
    if (p.porcentaje_objetivo !== undefined && p.porcentaje_objetivo !== null && Number(p.porcentaje_objetivo) > 0) {
      const pct = Math.min(100 - totalPctAssigned, Number(p.porcentaje_objetivo));
      resultPcts[p.id] = pct;
      resultAmounts[p.id] = Math.round((pct / 100) * incomingAmount);
      totalPctAssigned += pct;
    }
  });

  // 2. Si sobra porcentaje o si no tenían fijos, distribuir según faltante semanal o al libre
  const remainingPct = Math.max(0, 100 - totalPctAssigned);

  pockets.forEach(p => {
    if (resultPcts[p.id] === undefined) {
      if (p.id === freePocket?.id) {
        resultPcts[p.id] = Number(remainingPct.toFixed(1));
        resultAmounts[p.id] = Math.round((remainingPct / 100) * incomingAmount);
      } else {
        resultPcts[p.id] = 0;
        resultAmounts[p.id] = 0;
      }
    }
  });

  // Si no hay bolsillo libre, compensar al primer bolsillo
  if (!freePocket && remainingPct > 0 && pockets[0]) {
    const firstId = pockets[0].id;
    resultPcts[firstId] = Number(((resultPcts[firstId] || 0) + remainingPct).toFixed(1));
    resultAmounts[firstId] = Math.round((resultPcts[firstId] / 100) * incomingAmount);
  }

  return {
    percentages: resultPcts,
    amounts: resultAmounts
  };
}

/**
 * Sugerencia por cuotas semanales pendientes: distribuye priorizando completar cuotas de esta semana
 */
export function calculateWeeklyTargetAllocation(incomingAmount, pockets = []) {
  if (!incomingAmount || incomingAmount <= 0 || !pockets || pockets.length === 0) {
    return { percentages: {}, amounts: {} };
  }

  const freePocket = pockets.find(p => p.tipo === 'libre' || p.nombre.toLowerCase().includes('libre'));
  const commitments = pockets.filter(p => p.id !== freePocket?.id);

  let neededMoneyTotal = 0;
  const neededPerPocket = {};

  commitments.forEach(p => {
    const metrics = getPocketWeeklyMetrics(p);
    const needed = Math.max(0, metrics.faltanteSemanal > 0 ? metrics.faltanteSemanal : (p.pagado_este_ciclo ? 0 : metrics.faltanteTotal));
    neededPerPocket[p.id] = needed;
    neededMoneyTotal += needed;
  });

  const resultAmounts = {};
  const resultPcts = {};
  let moneyAssigned = 0;

  if (neededMoneyTotal > 0 && neededMoneyTotal <= incomingAmount) {
    // Alcanza para cubrir todas las cuotas semanales pendientes
    commitments.forEach(p => {
      const amt = neededPerPocket[p.id];
      resultAmounts[p.id] = amt;
      const pct = Number(((amt / incomingAmount) * 100).toFixed(1));
      resultPcts[p.id] = pct;
      moneyAssigned += amt;
    });

    const leftoverMoney = incomingAmount - moneyAssigned;
    if (freePocket) {
      resultAmounts[freePocket.id] = leftoverMoney;
      resultPcts[freePocket.id] = Number(((leftoverMoney / incomingAmount) * 100).toFixed(1));
    }
  } else if (neededMoneyTotal > incomingAmount) {
    // Repartir proporcionalmente a lo que cada uno necesita
    commitments.forEach(p => {
      const proportion = neededMoneyTotal > 0 ? (neededPerPocket[p.id] / neededMoneyTotal) : 0;
      const amt = Math.round(incomingAmount * proportion);
      resultAmounts[p.id] = amt;
      resultPcts[p.id] = Number(((amt / incomingAmount) * 100).toFixed(1));
      moneyAssigned += amt;
    });

    if (freePocket) {
      resultAmounts[freePocket.id] = 0;
      resultPcts[freePocket.id] = 0;
    }
  } else {
    // No había compromisos con cuota pendiente: repartir por igual o todo a Libre
    if (freePocket) {
      resultAmounts[freePocket.id] = incomingAmount;
      resultPcts[freePocket.id] = 100;
      commitments.forEach(p => {
        resultAmounts[p.id] = 0;
        resultPcts[p.id] = 0;
      });
    } else {
      const count = pockets.length;
      const baseAmt = Math.floor(incomingAmount / count);
      pockets.forEach((p, idx) => {
        const amt = idx === 0 ? incomingAmount - (baseAmt * (count - 1)) : baseAmt;
        resultAmounts[p.id] = amt;
        resultPcts[p.id] = Number(((amt / incomingAmount) * 100).toFixed(1));
      });
    }
  }

  // Ajustar redondeo de porcentajes para que sume exactamente 100%
  const currentSum = Object.values(resultPcts).reduce((a, b) => a + b, 0);
  const targetPocketId = freePocket ? freePocket.id : pockets[0]?.id;
  if (targetPocketId && Math.abs(currentSum - 100) > 0.01) {
    resultPcts[targetPocketId] = Number(((resultPcts[targetPocketId] || 0) + (100 - currentSum)).toFixed(1));
  }

  return {
    percentages: resultPcts,
    amounts: resultAmounts
  };
}
