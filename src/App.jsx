import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  Plus, 
  Minus, 
  Sparkles, 
  Check, 
  Settings, 
  History, 
  Trash2, 
  Edit3, 
  X, 
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Send,
  Eye,
  EyeOff,
  Cloud,
  Cpu,
  RotateCcw,
  Sliders,
  DollarSign
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { isSupabaseConfigured } from './lib/supabase';
import { suggestAllocationWithAI, analyzeFinancesWithAI, getAIStatus } from './services/ai';
import { fetchPockets, savePocket, deletePocket, savePocketsBatch } from './services/pockets';
import { getStoredConfig, saveStoredConfig } from './services/config';

const COLOR_PALETTE = [
  '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', 
  '#F59E0B', '#EF4444', '#06B6D4', '#14B8A6'
];

export default function App() {
  const [pockets, setPockets] = useState([]);
  const [activeTab, setActiveTab] = useState('pockets'); // 'pockets' | 'income' | 'copilot' | 'history' | 'settings'
  
  // Modales
  const [pocketModalOpen, setPocketModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [payCommitmentModalOpen, setPayCommitmentModalOpen] = useState(false);
  const [selectedPocket, setSelectedPocket] = useState(null);

  // Formulario Crear / Editar Bolsillo
  const [editingPocket, setEditingPocket] = useState({
    id: null,
    nombre: '',
    color: '#10B981',
    tipo: 'compromiso_fijo',
    periodicidad: 'mensual',
    meta_monto: '',
    dia_vencimiento: '',
    dia_vencimiento_2: '',
    saldo_actual: 0,
    pagado_este_ciclo: false
  });

  // Formulario Gasto
  const [expenseForm, setExpenseForm] = useState({ pocketId: '', monto: '', nota: '' });

  // Historial
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('platicapp_history_v2') || '[]');
    } catch {
      return [];
    }
  });

  // Estados para "Entrar Dinero"
  const [incomingAmount, setIncomingAmount] = useState(800000);
  const [incomeSource, setIncomeSource] = useState('Ingreso');
  const [percentages, setPercentages] = useState({});
  const [aiReasonings, setAiReasonings] = useState({});
  const [aiGeneralAdvice, setAiGeneralAdvice] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Estados del Copiloto Financiero
  const [copilotAnalysis, setCopilotAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [userQuestion, setUserQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      text: 'Hola, soy tu copiloto financiero. Puedo analizar el estado de tus bolsillos, evaluar tus gastos recientes o darte tips para optimizar tu dinero.'
    }
  ]);
  const [isAnswering, setIsAnswering] = useState(false);

  // Estados de Ajustes (Amigables, cero "dev")
  const [settingsForm, setSettingsForm] = useState(getStoredConfig());
  const [showAiKey, setShowAiKey] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  useEffect(() => {
    loadPockets();
  }, []);

  const loadPockets = async () => {
    const data = await fetchPockets();
    setPockets(data);
    initializePercentages(data);
  };

  const initializePercentages = (pocketList) => {
    if (!pocketList || pocketList.length === 0) return;
    const count = pocketList.length;
    const base = Math.floor(100 / count);
    const remainder = 100 - (base * count);

    const initial = {};
    pocketList.forEach((p, idx) => {
      initial[p.id] = idx === 0 ? base + remainder : base;
    });
    setPercentages(initial);
  };

  // Cálculos globales y ordenamiento por prioridad
  const totalBalance = pockets.reduce((acc, p) => acc + Number(p.saldo_actual || 0), 0);
  const currentTotalPercentage = Object.values(percentages).reduce((acc, val) => acc + Number(val || 0), 0);
  const isPercentageValid = Math.abs(currentTotalPercentage - 100) < 0.01;

  // Los bolsillos pagados bajan automáticamente de prioridad (se van al final)
  const sortedPockets = [...pockets].sort((a, b) => {
    if (a.pagado_este_ciclo && !b.pagado_este_ciclo) return 1;
    if (!a.pagado_este_ciclo && b.pagado_este_ciclo) return -1;
    return 0;
  });

  const handleSliderChange = (pocketId, val) => {
    const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
    setPercentages(prev => ({ ...prev, [pocketId]: num }));
  };

  const balanceToFreePocket = () => {
    const freePocket = pockets.find(p => p.tipo === 'libre') || pockets[pockets.length - 1];
    if (!freePocket) return;

    const otherSum = Object.entries(percentages)
      .filter(([id]) => id !== freePocket.id)
      .reduce((acc, [, val]) => acc + Number(val || 0), 0);

    const needed = Math.max(0, 100 - otherSum);
    setPercentages(prev => ({
      ...prev,
      [freePocket.id]: Number(needed.toFixed(1))
    }));
  };

  // Pedir sugerencia a la IA
  const handleAskAI = async () => {
    if (!incomingAmount || incomingAmount <= 0) return;
    setIsAiLoading(true);
    setAiError('');

    try {
      const aiStatus = getAIStatus();
      if (!aiStatus.isConfigured) {
        // Simulación si no hay clave
        await new Promise(r => setTimeout(r, 400));
        const simPcts = {};
        pockets.forEach(p => {
          if (p.pagado_este_ciclo) simPcts[p.id] = 5; // Menor prioridad a los ya pagados
          else if (p.tipo === 'compromiso_fijo') simPcts[p.id] = 35;
          else if (p.tipo === 'gasto_corriente') simPcts[p.id] = 25;
          else if (p.tipo === 'reserva') simPcts[p.id] = 20;
          else simPcts[p.id] = 15;
        });
        const curSum = Object.values(simPcts).reduce((a, b) => a + b, 0);
        if (pockets[0]) simPcts[pockets[0].id] += (100 - curSum);

        setPercentages(simPcts);
        setAiGeneralAdvice('Reparto sugerido: Damos prioridad a compromisos pendientes y menor asignación a los ya pagados.');
        return;
      }

      const result = await suggestAllocationWithAI({ incomingAmount, pockets, note: incomeSource });
      const newPcts = {};
      const newReasons = {};
      result.reparto.forEach(item => {
        newPcts[item.pocket_id] = item.porcentaje;
        newReasons[item.pocket_id] = item.justificacion;
      });

      setPercentages(newPcts);
      setAiReasonings(newReasons);
      setAiGeneralAdvice(result.consejo_general || '');
    } catch (err) {
      setAiError(err.message || 'Error con la IA');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Confirmar y Guardar Reparto
  const handleConfirmAllocation = async () => {
    if (!isPercentageValid || incomingAmount <= 0) return;

    const allocationsSummary = [];
    const updated = pockets.map(p => {
      const pct = percentages[p.id] || 0;
      const addedMoney = Math.round((pct / 100) * incomingAmount);
      allocationsSummary.push({ pocketNombre: p.nombre, porcentaje: pct, monto: addedMoney });

      return {
        ...p,
        saldo_actual: Number(p.saldo_actual || 0) + addedMoney,
        // Si recibe nuevo dinero, el ciclo se reinicia para estar activo
        pagado_este_ciclo: addedMoney > 0 && p.pagado_este_ciclo ? false : p.pagado_este_ciclo
      };
    });

    setPockets(updated);
    await savePocketsBatch(updated);

    const newHistoryEntry = {
      id: `mov-${Date.now()}`,
      tipo: 'ingreso',
      monto: incomingAmount,
      fuente: incomeSource,
      fecha: new Date().toISOString(),
      detalles: allocationsSummary
    };
    const updatedHistory = [newHistoryEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('platicapp_history_v2', JSON.stringify(updatedHistory));

    confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
    showToast('Ingreso repartido');
    setActiveTab('pockets');
  };

  // PAGAR COMPROMISO: Marca pagado, vacía a $0, baja prioridad
  const handleConfirmPayCommitment = async () => {
    if (!selectedPocket) return;
    const paymentAmount = Number(selectedPocket.saldo_actual || 0);

    const updated = pockets.map(p => {
      if (p.id === selectedPocket.id) {
        return {
          ...p,
          saldo_actual: 0,
          pagado_este_ciclo: true // Marcado como pagado
        };
      }
      return p;
    });

    setPockets(updated);
    await savePocketsBatch(updated);

    const newHistoryEntry = {
      id: `pay-${Date.now()}`,
      tipo: 'pago_compromiso',
      pocketNombre: selectedPocket.nombre,
      monto: paymentAmount,
      nota: 'Compromiso liquidado',
      fecha: new Date().toISOString()
    };
    const updatedHistory = [newHistoryEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('platicapp_history_v2', JSON.stringify(updatedHistory));

    setPayCommitmentModalOpen(false);
    confetti({ particleCount: 30, spread: 50 });
    showToast(`${selectedPocket.nombre} pagado. Pasa a prioridad baja.`);
  };

  // Reiniciar ciclo manualmente
  const handleResetPocketCycle = async (pocketId) => {
    const updated = pockets.map(p => p.id === pocketId ? { ...p, pagado_este_ciclo: false } : p);
    setPockets(updated);
    await savePocketsBatch(updated);
    showToast('Ciclo reiniciado para recibir fondos');
  };

  // REGISTRAR GASTO
  const handleRegisterExpense = async (e) => {
    e.preventDefault();
    const pocket = pockets.find(p => p.id === expenseForm.pocketId);
    const amount = parseFloat(expenseForm.monto);
    if (!pocket || !amount || amount <= 0) return;

    const currentBalance = Number(pocket.saldo_actual || 0);
    let updated;
    let borrowed = null;

    if (amount <= currentBalance) {
      updated = pockets.map(p => p.id === pocket.id ? { ...p, saldo_actual: currentBalance - amount } : p);
    } else {
      const deficit = amount - currentBalance;
      const lender = pockets.find(p => p.tipo === 'libre' && p.id !== pocket.id) || 
                     pockets.find(p => p.tipo === 'reserva' && p.id !== pocket.id);

      if (lender) {
        borrowed = { lender: lender.nombre, deficit };
        updated = pockets.map(p => {
          if (p.id === pocket.id) {
            return {
              ...p,
              saldo_actual: 0,
              deuda_interna: {
                pocket_id: lender.id,
                lender_nombre: lender.nombre,
                monto: (p.deuda_interna?.monto || 0) + deficit
              }
            };
          }
          if (p.id === lender.id) {
            return {
              ...p,
              saldo_actual: Math.max(0, Number(p.saldo_actual || 0) - deficit)
            };
          }
          return p;
        });
      } else {
        updated = pockets.map(p => p.id === pocket.id ? { ...p, saldo_actual: 0 } : p);
      }
    }

    setPockets(updated);
    await savePocketsBatch(updated);

    const newHistoryEntry = {
      id: `exp-${Date.now()}`,
      tipo: 'gasto',
      pocketNombre: pocket.nombre,
      monto: amount,
      nota: expenseForm.nota || 'Gasto registrado',
      prestamo: borrowed,
      fecha: new Date().toISOString()
    };
    const updatedHistory = [newHistoryEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('platicapp_history_v2', JSON.stringify(updatedHistory));

    setExpenseModalOpen(false);
    setExpenseForm({ pocketId: '', monto: '', nota: '' });
    showToast('Gasto registrado');
  };

  // Abrir modal de creación con color aleatorio
  const handleOpenNewPocketModal = () => {
    const randomColor = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
    setEditingPocket({
      id: null,
      nombre: '',
      color: randomColor,
      tipo: 'compromiso_fijo',
      periodicidad: 'mensual',
      meta_monto: '',
      dia_vencimiento: '',
      dia_vencimiento_2: '',
      saldo_actual: 0,
      pagado_este_ciclo: false
    });
    setPocketModalOpen(true);
  };

  // Guardar Bolsillo
  const handleSavePocket = async (e) => {
    e.preventDefault();
    if (!editingPocket.nombre.trim()) return;

    const pocketData = {
      ...editingPocket,
      id: editingPocket.id || `p-${Date.now()}`,
      meta_monto: editingPocket.meta_monto ? parseFloat(editingPocket.meta_monto) : null,
      dia_vencimiento: editingPocket.dia_vencimiento ? parseInt(editingPocket.dia_vencimiento) : null,
      dia_vencimiento_2: editingPocket.dia_vencimiento_2 ? parseInt(editingPocket.dia_vencimiento_2) : null,
      saldo_actual: parseFloat(editingPocket.saldo_actual) || 0
    };

    const updated = await savePocket(pocketData);
    setPockets(updated);
    initializePercentages(updated);
    setPocketModalOpen(false);
    showToast('Bolsillo guardado');
  };

  const handleDeletePocket = async (id) => {
    if (!window.confirm('¿Eliminar este bolsillo?')) return;
    const updated = await deletePocket(id);
    setPockets(updated);
    initializePercentages(updated);
    showToast('Bolsillo eliminado');
  };

  // ANALIZAR FINANZAS CON EL COPILOTO
  const handleRunCopilotAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const aiStatus = getAIStatus();
      if (!aiStatus.isConfigured) {
        await new Promise(r => setTimeout(r, 600));
        setCopilotAnalysis({
          diagnostico_estado: 'Estable',
          resumen_ejecutivo: 'Tus compromisos principales avanzan con buen ritmo, pero tu bolsillo de reserva puede fortalecerse en los próximos ingresos.',
          tips: [
            'Destina al menos el 15% de tu próximo ingreso a la Reserva para imprevistos.',
            'Los bolsillos de Arriendo y Servicios están cubiertos a tiempo este ciclo.',
            'Mantén los gastos libres por debajo del 20% del total para no desbalancear tus metas.'
          ]
        });
        return;
      }

      const res = await analyzeFinancesWithAI({ pockets, history });
      setCopilotAnalysis(res);
    } catch (err) {
      showToast(err.message || 'Error al analizar');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // PREGUNTAR AL COPILOTO
  const handleAskCopilotQuestion = async (e) => {
    e.preventDefault();
    if (!userQuestion.trim() || isAnswering) return;

    const q = userQuestion;
    setUserQuestion('');
    setChatMessages(prev => [...prev, { role: 'user', text: q }]);
    setIsAnswering(true);

    try {
      const aiStatus = getAIStatus();
      if (!aiStatus.isConfigured) {
        await new Promise(r => setTimeout(r, 600));
        setChatMessages(prev => [
          ...prev, 
          { 
            role: 'assistant', 
            text: `Basado en tus bolsillos actuales (Total: $${totalBalance.toLocaleString('es-CO')}), te recomiendo priorizar cubrir los compromisos que vencen en los próximos 10 días antes de compras libres.` 
          }
        ]);
        return;
      }

      const res = await analyzeFinancesWithAI({ pockets, history, question: q });
      setChatMessages(prev => [
        ...prev, 
        { role: 'assistant', text: res.respuesta_copiloto || res.resumen_ejecutivo }
      ]);
    } catch (err) {
      setChatMessages(prev => [
        ...prev, 
        { role: 'assistant', text: 'No pude completar la consulta. Revisa tu clave en Ajustes.' }
      ]);
    } finally {
      setIsAnswering(false);
    }
  };

  // GUARDAR AJUSTES
  const handleSaveSettings = (e) => {
    e.preventDefault();
    saveStoredConfig(settingsForm);
    showToast('Ajustes guardados correctamente');
  };

  return (
    <div className="max-w-md mx-auto min-h-screen pb-28 px-5 pt-8 flex flex-col font-sans text-slate-100 antialiased selection:bg-emerald-500 selection:text-slate-950">
      
      {/* TOAST FLOTANTE */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-slate-700/60 shadow-2xl px-4 py-2 rounded-full text-xs font-medium text-slate-200 animate-in fade-in slide-in-from-top-2 duration-200 backdrop-blur-md">
          {toastMessage}
        </div>
      )}

      {/* HEADER ELEGANTE CON NOMBRE DECORADO */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
            <span className="text-emerald-400">MI</span> Platicapp
          </h1>
          <p className="text-xs text-slate-400">Tus finanzas por bolsillos y porcentajes</p>
        </div>

        <button 
          onClick={handleOpenNewPocketModal}
          className="p-2 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition"
          title="Nuevo bolsillo"
        >
          <Plus className="w-4 h-4" />
        </button>
      </header>

      {/* ======================================================== */}
      {/* SECCIÓN 1: BOLSILLOS (INICIO) */}
      {/* ======================================================== */}
      {activeTab === 'pockets' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          
          {/* Card Resumen de Saldo */}
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-6 relative overflow-hidden backdrop-blur-sm">
            <span className="text-xs uppercase tracking-wider font-medium text-slate-400">Total disponible</span>
            <div className="text-4xl font-extrabold text-white mt-1 tracking-tight">
              ${totalBalance.toLocaleString('es-CO')}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>{pockets.length} bolsillos configurados</span>
              <button
                onClick={() => {
                  setExpenseForm({ pocketId: pockets[0]?.id || '', monto: '', nota: '' });
                  setExpenseModalOpen(true);
                }}
                className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition"
              >
                <Minus className="w-3.5 h-3.5" /> Registrar gasto
              </button>
            </div>
          </div>

          {/* BOTÓN PRINCIPAL: ENTRAR DINERO */}
          <button
            onClick={() => setActiveTab('income')}
            className="w-full py-4 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-all duration-150"
          >
            <Plus className="w-4 h-4" />
            <span>Entrar dinero</span>
          </button>

          {/* LISTA DE BOLSILLOS (ORDENADOS POR PRIORIDAD) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
              <span>Bolsillos</span>
              <span>Saldo actual</span>
            </div>

            {sortedPockets.map(pocket => {
              const hasTarget = pocket.meta_monto > 0;
              const effectiveTarget = pocket.periodicidad === 'quincenal' && hasTarget 
                ? pocket.meta_monto / 2 
                : pocket.meta_monto;

              const progress = hasTarget 
                ? Math.min(100, Math.round((pocket.saldo_actual / effectiveTarget) * 100)) 
                : null;

              const isCommitment = pocket.tipo === 'compromiso_fijo';
              const isPaid = pocket.pagado_este_ciclo;
              const canPay = isCommitment && Number(pocket.saldo_actual) > 0 && !isPaid;

              return (
                <div 
                  key={pocket.id}
                  className={`border rounded-2xl p-4 transition-all duration-200 space-y-3 ${
                    isPaid 
                      ? 'bg-slate-950/40 border-slate-900 opacity-60 hover:opacity-100' 
                      : 'bg-slate-900/60 border-slate-800/70 hover:border-slate-700/80'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div 
                        className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                        style={{ backgroundColor: pocket.color }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm text-white">{pocket.nombre}</h3>
                          {isPaid && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Pagado este ciclo
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-400 mt-0.5 space-x-1.5">
                          <span className="capitalize">{pocket.periodicidad || 'Mensual'}</span>
                          {pocket.dia_vencimiento && (
                            <span>
                              · Vence día {pocket.dia_vencimiento}
                              {pocket.dia_vencimiento_2 && ` y ${pocket.dia_vencimiento_2}`}
                            </span>
                          )}
                        </div>

                        {/* Deuda Interna */}
                        {pocket.deuda_interna && pocket.deuda_interna.monto > 0 && (
                          <div className="mt-1.5 text-[11px] text-amber-400 flex items-center gap-1 font-medium">
                            <AlertCircle className="w-3 h-3" />
                            <span>Debe ${pocket.deuda_interna.monto.toLocaleString('es-CO')} a {pocket.deuda_interna.lender_nombre || 'Libre'}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-semibold text-sm text-white">
                        ${Number(pocket.saldo_actual || 0).toLocaleString('es-CO')}
                      </div>
                      {hasTarget && (
                        <div className="text-[11px] text-slate-400">
                          Meta: ${Number(effectiveTarget).toLocaleString('es-CO')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  {hasTarget && (
                    <div className="w-full h-1 bg-slate-800/80 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-300"
                        style={{ 
                          width: `${progress}%`,
                          backgroundColor: isPaid ? '#10B981' : pocket.color 
                        }}
                      />
                    </div>
                  )}

                  {/* Acciones del Bolsillo */}
                  <div className="pt-2 border-t border-slate-800/50 flex items-center justify-between text-xs">
                    {/* Botón Pagar o Reiniciar */}
                    {canPay ? (
                      <button
                        onClick={() => {
                          setSelectedPocket(pocket);
                          setPayCommitmentModalOpen(true);
                        }}
                        className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Pagar compromiso</span>
                      </button>
                    ) : isPaid ? (
                      <button
                        onClick={() => handleResetPocketCycle(pocket.id)}
                        className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reiniciar ciclo</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        {isCommitment ? 'Sin fondos' : ''}
                      </span>
                    )}

                    <button
                      onClick={() => {
                        setExpenseForm({ pocketId: pocket.id, monto: '', nota: '' });
                        setExpenseModalOpen(true);
                      }}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
                    >
                      <Minus className="w-3 h-3" />
                      <span>Gasto</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECCIÓN 2: ENTRAR DINERO (REPARTO EN %) */}
      {/* ======================================================== */}
      {activeTab === 'income' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div>
            <h2 className="text-xl font-bold text-white">Entrar dinero</h2>
            <p className="text-xs text-slate-400">Distribuye el monto según tus porcentajes ideales</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/70 rounded-2xl p-4 space-y-3">
            <div>
              <label className="text-xs text-slate-400">Monto ingresado ($)</label>
              <div className="relative mt-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                <input
                  type="number"
                  value={incomingAmount}
                  onChange={(e) => setIncomingAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-8 pr-4 text-white font-bold text-xl focus:outline-none focus:border-slate-600 transition"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400">Concepto o fuente</label>
              <input
                type="text"
                value={incomeSource}
                onChange={(e) => setIncomeSource(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-slate-600 transition mt-1"
                placeholder="ej. Nómina, pago freelance, venta..."
              />
            </div>

            <button
              onClick={handleAskAI}
              disabled={isAiLoading || incomingAmount <= 0}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700/80 active:scale-[0.99] text-white text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {isAiLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-slate-300" />
              )}
              <span>{isAiLoading ? 'Calculando porcentajes...' : 'Sugerir reparto con IA'}</span>
            </button>

            {aiError && (
              <div className="text-xs text-rose-400 bg-rose-950/20 border border-rose-900/40 p-2.5 rounded-xl">
                {aiError}
              </div>
            )}

            {aiGeneralAdvice && (
              <div className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800/60 p-2.5 rounded-xl">
                {aiGeneralAdvice}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs font-medium px-1">
            <span className={isPercentageValid ? 'text-slate-300' : 'text-amber-400'}>
              Total asignado: {currentTotalPercentage.toFixed(1)}% de 100%
            </span>

            {!isPercentageValid && (
              <button
                onClick={balanceToFreePocket}
                className="text-xs text-slate-400 hover:text-white underline transition"
              >
                Ajustar restante a Libre
              </button>
            )}
          </div>

          <div className="space-y-3">
            {pockets.map(pocket => {
              const pct = percentages[pocket.id] || 0;
              const allocatedMoney = Math.round((pct / 100) * incomingAmount);
              const reasoning = aiReasonings[pocket.id];

              return (
                <div key={pocket.id} className="bg-slate-900/50 border border-slate-800/70 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pocket.color }} />
                      <span className="font-semibold text-xs text-white">{pocket.nombre}</span>
                      {pocket.pagado_este_ciclo && (
                        <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">Pagado</span>
                      )}
                    </div>

                    <div className="text-right text-xs">
                      <span className="font-semibold text-white">${allocatedMoney.toLocaleString('es-CO')}</span>
                      <span className="text-slate-400 ml-1.5 font-medium">({pct}%)</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={pct}
                      onChange={(e) => handleSliderChange(pocket.id, e.target.value)}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={pct}
                      onChange={(e) => handleSliderChange(pocket.id, e.target.value)}
                      className="w-12 bg-slate-950 border border-slate-800 rounded-lg py-1 px-1 text-center text-xs font-semibold text-white focus:outline-none"
                    />
                  </div>

                  {reasoning && (
                    <p className="text-[11px] text-slate-400 bg-slate-950/40 p-2 rounded-xl">{reasoning}</p>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleConfirmAllocation}
            disabled={!isPercentageValid || incomingAmount <= 0}
            className="w-full py-4 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-40 text-slate-950 font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Confirmar reparto</span>
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECCIÓN 3: COPILOTO FINANCIERO CON IA */}
      {/* ======================================================== */}
      {activeTab === 'copilot' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" /> Copiloto Financiero
            </h2>
            <p className="text-xs text-slate-400">Análisis inteligente de tus movimientos y consejos en tiempo real</p>
          </div>

          {/* Botón de Diagnóstico General */}
          <button
            onClick={handleRunCopilotAnalysis}
            disabled={isAnalyzing}
            className="w-full py-3.5 px-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition"
          >
            {isAnalyzing ? (
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-emerald-400" />
            )}
            <span>{isAnalyzing ? 'Examinando tus datos...' : 'Analizar mis finanzas ahora'}</span>
          </button>

          {/* Resultado del Diagnóstico */}
          {copilotAnalysis && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <span className="text-xs text-slate-400">Diagnóstico actual</span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {copilotAnalysis.diagnostico_estado}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-medium">
                {copilotAnalysis.resumen_ejecutivo}
              </p>

              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Tips para optimizar
                </span>
                {copilotAnalysis.tips?.map((tip, i) => (
                  <div key={i} className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800/60 p-3 rounded-2xl flex items-start gap-2.5">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conversación / Preguntas al Copiloto */}
          <div className="space-y-3 pt-2">
            <span className="text-xs font-semibold text-slate-400 px-1">Preguntas y asesoría</span>
            
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {chatMessages.map((msg, i) => (
                <div 
                  key={i} 
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-emerald-500 text-slate-950 ml-6 font-semibold' 
                      : 'bg-slate-900 border border-slate-800/70 text-slate-300 mr-4'
                  }`}
                >
                  {msg.text}
                </div>
              ))}
              {isAnswering && (
                <div className="p-3 rounded-2xl bg-slate-900 text-slate-400 text-xs italic">
                  Escribiendo respuesta...
                </div>
              )}
            </div>

            <form onSubmit={handleAskCopilotQuestion} className="flex gap-2 pt-2">
              <input
                type="text"
                value={userQuestion}
                onChange={(e) => setUserQuestion(e.target.value)}
                placeholder="Pregúntale algo sobre tu dinero..."
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3 text-xs text-white focus:outline-none focus:border-slate-700"
              />
              <button
                type="submit"
                disabled={!userQuestion.trim() || isAnswering}
                className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECCIÓN 4: MOVIMIENTOS (HISTORIAL) */}
      {/* ======================================================== */}
      {activeTab === 'history' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div>
            <h2 className="text-xl font-bold text-white">Movimientos</h2>
            <p className="text-xs text-slate-400">Trazabilidad de cada peso ingresado o gastado</p>
          </div>

          {history.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-xs">
              No hay movimientos registrados todavía.
            </div>
          ) : (
            <div className="space-y-2.5">
              {history.map(item => (
                <div key={item.id} className="bg-slate-900/60 border border-slate-800/70 rounded-2xl p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-white">
                      {item.tipo === 'ingreso' ? `Ingreso: ${item.fuente}` : item.tipo === 'pago_compromiso' ? `Compromiso Pagado: ${item.pocketNombre}` : item.pocketNombre}
                    </span>
                    <span className={`font-semibold text-xs ${
                      item.tipo === 'ingreso' ? 'text-emerald-400' : 'text-slate-300'
                    }`}>
                      {item.tipo === 'ingreso' ? '+' : '-'}${Number(item.monto).toLocaleString('es-CO')}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500">
                    {new Date(item.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                    {item.nota && ` · ${item.nota}`}
                  </div>

                  {item.detalles && (
                    <div className="pt-2 border-t border-slate-800/50 grid grid-cols-2 gap-1 text-[11px] text-slate-400">
                      {item.detalles.map((d, i) => (
                        <div key={i} className="truncate">
                          {d.pocketNombre}: <span className="text-slate-300 font-medium">{d.porcentaje}%</span> (${d.monto.toLocaleString('es-CO')})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SECCIÓN 5: AJUSTES (AMIGABLE, NO "DEV") */}
      {/* ======================================================== */}
      {activeTab === 'settings' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div>
            <h2 className="text-xl font-bold text-white">Ajustes</h2>
            <p className="text-xs text-slate-400">Personaliza la conexión de tu app y su inteligencia artificial</p>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-5">
            {/* Tarjeta de IA */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-sm text-white">Inteligencia Artificial</h3>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Proveedor de IA</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettingsForm(prev => ({ ...prev, aiProvider: 'groq' }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                      settingsForm.aiProvider === 'groq' 
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400' 
                        : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}
                  >
                    Groq (Gratis / Rápido)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsForm(prev => ({ ...prev, aiProvider: 'gemini' }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                      settingsForm.aiProvider === 'gemini' 
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400' 
                        : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}
                  >
                    Google Gemini
                  </button>
                </div>
              </div>

              {settingsForm.aiProvider === 'groq' ? (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-slate-400">Clave de API de Groq</label>
                    <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-[11px] text-emerald-400 hover:underline">
                      Obtener gratis
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type={showAiKey ? 'text' : 'password'}
                      value={settingsForm.groqKey}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, groqKey: e.target.value }))}
                      placeholder="gsk_..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 pr-10 text-xs text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAiKey(!showAiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showAiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-slate-400">Clave de API de Gemini</label>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[11px] text-emerald-400 hover:underline">
                      Obtener clave
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type={showAiKey ? 'text' : 'password'}
                      value={settingsForm.geminiKey}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, geminiKey: e.target.value }))}
                      placeholder="AIzaSy..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 pr-10 text-xs text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAiKey(!showAiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showAiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tarjeta de Sincronización en la Nube */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <Cloud className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-sm text-white">Sincronización en la Nube (Supabase)</h3>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Opcional. Si deseas que tus datos se guarden en la nube para consultarlos en cualquier dispositivo, ingresa los datos de tu proyecto Supabase:
              </p>

              <div>
                <label className="text-xs text-slate-400">URL de Supabase</label>
                <input
                  type="text"
                  value={settingsForm.supabaseUrl}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, supabaseUrl: e.target.value }))}
                  placeholder="https://xyz.supabase.co"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none mt-1"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Clave pública (Anon Key)</label>
                <input
                  type="password"
                  value={settingsForm.supabaseKey}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, supabaseKey: e.target.value }))}
                  placeholder="eyJhbGciOi..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none mt-1"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
            >
              Guardar Ajustes
            </button>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* MENÚ DE NAVEGACIÓN INFERIOR (APPLE STYLE FIXED TAB BAR) */}
      {/* ======================================================== */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-950/85 backdrop-blur-xl border-t border-slate-800/70 z-40 px-3 py-2 flex items-center justify-around">
        <button
          onClick={() => setActiveTab('pockets')}
          className={`flex flex-col items-center gap-1 py-1 px-3 transition-colors ${
            activeTab === 'pockets' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wallet className="w-5 h-5" />
          <span className="text-[10px]">Bolsillos</span>
        </button>

        <button
          onClick={() => setActiveTab('income')}
          className={`flex flex-col items-center gap-1 py-1 px-3 transition-colors ${
            activeTab === 'income' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <DollarSign className="w-5 h-5" />
          <span className="text-[10px]">Entrar</span>
        </button>

        <button
          onClick={() => setActiveTab('copilot')}
          className={`flex flex-col items-center gap-1 py-1 px-3 transition-colors ${
            activeTab === 'copilot' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-[10px]">Copiloto</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 py-1 px-3 transition-colors ${
            activeTab === 'history' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-5 h-5" />
          <span className="text-[10px]">Movimientos</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 py-1 px-3 transition-colors ${
            activeTab === 'settings' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px]">Ajustes</span>
        </button>
      </nav>

      {/* ======================================================== */}
      {/* MODAL: PAGAR COMPROMISO */}
      {/* ======================================================== */}
      {payCommitmentModalOpen && selectedPocket && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Pagar compromiso</h3>
              <button onClick={() => setPayCommitmentModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                Vas a marcar como pagado el compromiso <span className="font-bold text-white">{selectedPocket.nombre}</span>.
              </p>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl text-center">
                <span className="text-[11px] text-slate-400 block mb-0.5">Monto que sale</span>
                <span className="text-2xl font-black text-white">
                  ${Number(selectedPocket.saldo_actual || 0).toLocaleString('es-CO')}
                </span>
              </div>

              <p className="text-[11px] text-slate-400">
                El bolsillo se vacía a $0, se marca como pagado y baja de prioridad para este ciclo.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayCommitmentModalOpen(false)}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPayCommitment}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
              >
                Confirmar pago
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: REGISTRAR GASTO */}
      {/* ======================================================== */}
      {expenseModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Registrar gasto</h3>
              <button onClick={() => setExpenseModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterExpense} className="space-y-3.5">
              <div>
                <label className="text-xs text-slate-400">Bolsillo</label>
                <select
                  value={expenseForm.pocketId}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, pocketId: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none mt-1"
                  required
                >
                  <option value="">Selecciona un bolsillo...</option>
                  {pockets.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} (${Number(p.saldo_actual).toLocaleString('es-CO')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400">Monto del gasto ($)</label>
                <input
                  type="number"
                  value={expenseForm.monto}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, monto: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-xs text-white font-bold text-base focus:outline-none mt-1"
                  placeholder="0"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Nota</label>
                <input
                  type="text"
                  value={expenseForm.nota}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, nota: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none mt-1"
                  placeholder="ej. Almuerzo, transporte..."
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-slate-100 hover:bg-white text-slate-950 font-bold text-xs transition mt-2"
              >
                Guardar gasto
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CREAR / EDITAR BOLSILLO */}
      {/* ======================================================== */}
      {pocketModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">
                {editingPocket.id ? 'Editar bolsillo' : 'Nuevo bolsillo'}
              </h3>
              <button onClick={() => setPocketModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePocket} className="space-y-3.5">
              <div>
                <label className="text-xs text-slate-400">Nombre</label>
                <input
                  type="text"
                  value={editingPocket.nombre}
                  onChange={(e) => setEditingPocket(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none mt-1"
                  placeholder="ej. Arriendo, Mercado, Moto..."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400">Tipo</label>
                  <select
                    value={editingPocket.tipo}
                    onChange={(e) => setEditingPocket(prev => ({ ...prev, tipo: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-2 text-xs text-white mt-1"
                  >
                    <option value="compromiso_fijo">Compromiso</option>
                    <option value="gasto_corriente">Gasto Diario</option>
                    <option value="ahorro">Ahorro</option>
                    <option value="reserva">Reserva</option>
                    <option value="libre">Libre</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400">Periodicidad</label>
                  <select
                    value={editingPocket.periodicidad}
                    onChange={(e) => setEditingPocket(prev => ({ ...prev, periodicidad: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-2 text-xs text-white mt-1"
                  >
                    <option value="mensual">Mensual</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="semanal">Semanal</option>
                    <option value="libre">Libre</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400">Día vencimiento</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={editingPocket.dia_vencimiento}
                    onChange={(e) => setEditingPocket(prev => ({ ...prev, dia_vencimiento: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-2 text-xs text-white mt-1"
                    placeholder="ej. 15"
                  />
                </div>

                {editingPocket.periodicidad === 'quincenal' && (
                  <div>
                    <label className="text-xs text-slate-400">2do vencimiento</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={editingPocket.dia_vencimiento_2}
                      onChange={(e) => setEditingPocket(prev => ({ ...prev, dia_vencimiento_2: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-2 text-xs text-white mt-1"
                      placeholder="ej. 30"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-400">Meta mensual ($)</label>
                <input
                  type="number"
                  value={editingPocket.meta_monto}
                  onChange={(e) => setEditingPocket(prev => ({ ...prev, meta_monto: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white mt-1"
                  placeholder="ej. 1200000"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Saldo actual ($)</label>
                <input
                  type="number"
                  value={editingPocket.saldo_actual}
                  onChange={(e) => setEditingPocket(prev => ({ ...prev, saldo_actual: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white mt-1"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Color</label>
                <div className="flex gap-2">
                  {COLOR_PALETTE.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditingPocket(prev => ({ ...prev, color: c }))}
                      className={`w-6 h-6 rounded-full transition ${editingPocket.color === c ? 'scale-125 ring-2 ring-white' : 'opacity-60 hover:opacity-100'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                {editingPocket.id && (
                  <button
                    type="button"
                    onClick={() => {
                      handleDeletePocket(editingPocket.id);
                      setPocketModalOpen(false);
                    }}
                    className="p-3 rounded-xl bg-rose-950/40 border border-rose-900/50 text-rose-400 hover:bg-rose-900/40 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
                >
                  {editingPocket.id ? 'Guardar cambios' : 'Crear bolsillo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
