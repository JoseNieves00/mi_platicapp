import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  Plus, 
  Minus, 
  Sparkles, 
  Check, 
  Settings, 
  PieChart, 
  Layers, 
  History, 
  Trash2, 
  Edit3, 
  X, 
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  CheckCircle,
  CreditCard
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { suggestAllocationWithAI, isAIConfigured, activeAIProvider } from './services/ai';
import { fetchPockets, savePocket, deletePocket, savePocketsBatch } from './services/pockets';

const COLOR_PALETTE = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', 
  '#8B5CF6', '#EC4899', '#06B6D4', '#14B8A6'
];

export default function App() {
  const [pockets, setPockets] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'income' | 'manage' | 'history'
  
  // Modales
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [pocketModalOpen, setPocketModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [payCommitmentModalOpen, setPayCommitmentModalOpen] = useState(false);
  const [selectedPocket, setSelectedPocket] = useState(null);

  // Formulario para Crear / Editar Bolsillo
  const [editingPocket, setEditingPocket] = useState({
    id: null,
    nombre: '',
    color: '#10B981',
    tipo: 'compromiso_fijo',
    periodicidad: 'mensual',
    meta_monto: '',
    dia_vencimiento: '',
    dia_vencimiento_2: '',
    saldo_actual: 0
  });

  // Formulario de Gasto
  const [expenseForm, setExpenseForm] = useState({
    pocketId: '',
    monto: '',
    nota: ''
  });

  // Historial de movimientos
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('platicapp_history_v2') || '[]');
    } catch {
      return [];
    }
  });

  // Estados para "Entrar dinero"
  const [incomingAmount, setIncomingAmount] = useState(800000);
  const [incomeSource, setIncomeSource] = useState('Ingreso');
  const [percentages, setPercentages] = useState({});
  const [aiReasonings, setAiReasonings] = useState({});
  const [aiGeneralAdvice, setAiGeneralAdvice] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Notificación tipo toast sutil
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

  const totalBalance = pockets.reduce((acc, p) => acc + Number(p.saldo_actual || 0), 0);
  const currentTotalPercentage = Object.values(percentages).reduce((acc, val) => acc + Number(val || 0), 0);
  const isPercentageValid = Math.abs(currentTotalPercentage - 100) < 0.01;

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
      if (!isAIConfigured) {
        await new Promise(r => setTimeout(r, 450));
        const simPcts = {};
        pockets.forEach(p => {
          if (p.deuda_interna) simPcts[p.id] = 40;
          else if (p.tipo === 'compromiso_fijo') simPcts[p.id] = 30;
          else if (p.tipo === 'gasto_corriente') simPcts[p.id] = 20;
          else simPcts[p.id] = 10;
        });
        const curSum = Object.values(simPcts).reduce((a, b) => a + b, 0);
        if (pockets[0]) simPcts[pockets[0].id] += (100 - curSum);

        setPercentages(simPcts);
        setAiGeneralAdvice('Reparto balanceado según compromisos y metas.');
        return;
      }

      const result = await suggestAllocationWithAI({
        incomingAmount,
        pockets,
        note: incomeSource
      });

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
      setAiError(err.message || 'Error al conectar con la IA');
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
      allocationsSummary.push({
        pocketNombre: p.nombre,
        porcentaje: pct,
        monto: addedMoney
      });

      let newBalance = Number(p.saldo_actual || 0) + addedMoney;
      let newDeuda = p.deuda_interna;

      // Si tenía deuda interna y recibió suficiente, saldarla
      if (newDeuda && addedMoney >= newDeuda.monto) {
        newDeuda = null;
      } else if (newDeuda && addedMoney > 0) {
        newDeuda = { ...newDeuda, monto: newDeuda.monto - addedMoney };
      }

      return {
        ...p,
        saldo_actual: newBalance,
        deuda_interna: newDeuda
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

    confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
    showToast('Ingreso repartido con éxito');
    setActiveTab('dashboard');
  };

  // PAGAR COMPROMISO (Vacía el bolsillo y reinicia el ciclo)
  const handleConfirmPayCommitment = async () => {
    if (!selectedPocket) return;

    const paymentAmount = Number(selectedPocket.saldo_actual || 0);
    if (paymentAmount <= 0) {
      setPayCommitmentModalOpen(false);
      return;
    }

    const updated = pockets.map(p => {
      if (p.id === selectedPocket.id) {
        return {
          ...p,
          saldo_actual: 0 // Se vacía el bolsillo para el nuevo ciclo
        };
      }
      return p;
    });

    setPockets(updated);
    await savePocketsBatch(updated);

    // Registrar en Historial como Pago de Compromiso
    const newHistoryEntry = {
      id: `pay-${Date.now()}`,
      tipo: 'pago_compromiso',
      pocketNombre: selectedPocket.nombre,
      monto: paymentAmount,
      nota: `Compromiso pagado y ciclo reiniciado`,
      fecha: new Date().toISOString()
    };
    const updatedHistory = [newHistoryEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('platicapp_history_v2', JSON.stringify(updatedHistory));

    setPayCommitmentModalOpen(false);
    showToast(`${selectedPocket.nombre} pagado. Bolsillo listo para el nuevo ciclo.`);
  };

  // REGISTRAR GASTO (Con ajuste y préstamo de bolsillo no urgente si excede)
  const handleRegisterExpense = async (e) => {
    e.preventDefault();
    const pocket = pockets.find(p => p.id === expenseForm.pocketId);
    const amount = parseFloat(expenseForm.monto);

    if (!pocket || !amount || amount <= 0) return;

    const currentBalance = Number(pocket.saldo_actual || 0);
    let updated;
    let borrowedInfo = null;

    if (amount <= currentBalance) {
      // Gasto normal
      updated = pockets.map(p => p.id === pocket.id ? { ...p, saldo_actual: currentBalance - amount } : p);
    } else {
      // Excede saldo: toma prestado del bolsillo Libre o Reserva
      const deficit = amount - currentBalance;
      const lenderPocket = pockets.find(p => p.tipo === 'libre' && p.id !== pocket.id) || 
                           pockets.find(p => p.tipo === 'reserva' && p.id !== pocket.id);

      if (lenderPocket) {
        borrowedInfo = { lender: lenderPocket.nombre, deficit };
        updated = pockets.map(p => {
          if (p.id === pocket.id) {
            return {
              ...p,
              saldo_actual: 0,
              deuda_interna: {
                pocket_id: lenderPocket.id,
                lender_nombre: lenderPocket.nombre,
                monto: (p.deuda_interna?.monto || 0) + deficit
              }
            };
          }
          if (p.id === lenderPocket.id) {
            return {
              ...p,
              saldo_actual: Math.max(0, Number(p.saldo_actual || 0) - deficit)
            };
          }
          return p;
        });
      } else {
        // No hay de donde prestar, se descuenta a 0
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
      prestamo: borrowedInfo,
      fecha: new Date().toISOString()
    };
    const updatedHistory = [newHistoryEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('platicapp_history_v2', JSON.stringify(updatedHistory));

    setExpenseModalOpen(false);
    setExpenseForm({ pocketId: '', monto: '', nota: '' });
    showToast(borrowedInfo ? `Gasto registrado. Se tomaron $${borrowedInfo.deficit.toLocaleString('es-CO')} de ${borrowedInfo.lender}.` : 'Gasto registrado');
  };

  // Guardar bolsillo (Crear / Editar)
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

  return (
    <div className="max-w-md mx-auto min-h-screen pb-20 px-5 pt-8 flex flex-col font-sans text-slate-100 antialiased selection:bg-emerald-500 selection:text-slate-950">
      
      {/* TOAST FLOTANTE SUTIL */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-slate-700/60 shadow-2xl px-4 py-2 rounded-full text-xs font-medium text-slate-200 animate-in fade-in slide-in-from-top-2 duration-200 backdrop-blur-md">
          {toastMessage}
        </div>
      )}

      {/* HEADER LIMPIO (ESTILO APPLE) */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Platicapp</h1>
          <p className="text-xs text-slate-400">Finanzas por bolsillos</p>
        </div>

        <button 
          onClick={() => setShowConfigModal(true)}
          className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
          title="Ajustes"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      {/* NAVEGACIÓN SEGMENTADA ELEGANTE */}
      <nav className="flex p-1 bg-slate-900/80 rounded-2xl mb-6 border border-slate-800/60 backdrop-blur-md text-xs font-medium">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeTab === 'dashboard' ? 'bg-slate-800 text-white shadow-sm font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Bolsillos
        </button>
        <button
          onClick={() => setActiveTab('income')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeTab === 'income' ? 'bg-slate-800 text-white shadow-sm font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Entrar dinero
        </button>
        <button
          onClick={() => setActiveTab('manage')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeTab === 'manage' ? 'bg-slate-800 text-white shadow-sm font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Gestionar
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeTab === 'history' ? 'bg-slate-800 text-white shadow-sm font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Historial
        </button>
      </nav>

      {/* ======================================================== */}
      {/* VISTA 1: DASHBOARD DE BOLSILLOS */}
      {/* ======================================================== */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Card Resumen de Saldo */}
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-6 relative overflow-hidden backdrop-blur-sm">
            <span className="text-xs uppercase tracking-wider font-medium text-slate-400">Total disponible</span>
            <div className="text-4xl font-extrabold text-white mt-1 tracking-tight">
              ${totalBalance.toLocaleString('es-CO')}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>{pockets.length} bolsillos</span>
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

          {/* BOTÓN PRINCIPAL DE ACCIÓN: ENTRAR DINERO */}
          <button
            onClick={() => setActiveTab('income')}
            className="w-full py-4 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-all duration-150"
          >
            <Plus className="w-4 h-4" />
            <span>Entrar dinero</span>
          </button>

          {/* LISTA DE BOLSILLOS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
              <span>Tus bolsillos</span>
              <span>Saldo</span>
            </div>

            {pockets.map(pocket => {
              const hasTarget = pocket.meta_monto > 0;
              // Para quincenal, la meta periódica es la mitad del mes
              const effectiveTarget = pocket.periodicidad === 'quincenal' && hasTarget 
                ? pocket.meta_monto / 2 
                : pocket.meta_monto;

              const progress = hasTarget 
                ? Math.min(100, Math.round((pocket.saldo_actual / effectiveTarget) * 100)) 
                : null;

              const isCommitment = pocket.tipo === 'compromiso_fijo';
              const canPay = isCommitment && Number(pocket.saldo_actual) > 0;

              return (
                <div 
                  key={pocket.id}
                  className="bg-slate-900/60 border border-slate-800/70 rounded-2xl p-4 transition-all hover:border-slate-700/80 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div 
                        className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                        style={{ backgroundColor: pocket.color }}
                      />
                      <div>
                        <h3 className="font-semibold text-sm text-white">{pocket.nombre}</h3>
                        <div className="text-xs text-slate-400 mt-0.5 space-x-1.5">
                          <span className="capitalize">{pocket.periodicidad || 'Mensual'}</span>
                          {pocket.dia_vencimiento && (
                            <span className="text-slate-400">
                              · Vence día {pocket.dia_vencimiento}
                              {pocket.dia_vencimiento_2 && ` y ${pocket.dia_vencimiento_2}`}
                            </span>
                          )}
                        </div>

                        {/* Indicador de Deuda Interna */}
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

                  {/* Barra de progreso sutil */}
                  {hasTarget && (
                    <div className="space-y-1">
                      <div className="w-full h-1 bg-slate-800/80 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-300"
                          style={{ 
                            width: `${progress}%`,
                            backgroundColor: pocket.color 
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Acciones del Bolsillo */}
                  <div className="pt-2 border-t border-slate-800/50 flex items-center justify-between text-xs">
                    {/* Botón Pagar Compromiso */}
                    {canPay ? (
                      <button
                        onClick={() => {
                          setSelectedPocket(pocket);
                          setPayCommitmentModalOpen(true);
                        }}
                        className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Pagar compromiso</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        {isCommitment ? 'Sin fondos para pagar' : ''}
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
      {/* VISTA 2: ENTRAR DINERO (REPARTO EN %) */}
      {/* ======================================================== */}
      {activeTab === 'income' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Entrar dinero</h2>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cerrar
            </button>
          </div>

          {/* Formulario de Ingreso */}
          <div className="bg-slate-900/60 border border-slate-800/70 rounded-2xl p-4 space-y-3">
            <div>
              <label className="text-xs text-slate-400">Monto ingresado</label>
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
                placeholder="ej. Pago de cliente, nómina..."
              />
            </div>

            {/* Botón Sugerir con IA */}
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
              <span>{isAiLoading ? 'Calculando propuesta...' : 'Sugerir reparto con IA'}</span>
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

          {/* Suma de Porcentajes */}
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

          {/* Sliders de cada Bolsillo */}
          <div className="space-y-3">
            {pockets.map(pocket => {
              const pct = percentages[pocket.id] || 0;
              const allocatedMoney = Math.round((pct / 100) * incomingAmount);
              const reasoning = aiReasonings[pocket.id];

              return (
                <div 
                  key={pocket.id}
                  className="bg-slate-900/50 border border-slate-800/70 rounded-2xl p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div 
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: pocket.color }}
                      />
                      <span className="font-semibold text-xs text-white">{pocket.nombre}</span>
                    </div>

                    <div className="text-right text-xs">
                      <span className="font-semibold text-white">
                        ${allocatedMoney.toLocaleString('es-CO')}
                      </span>
                      <span className="text-slate-400 ml-1.5 font-medium">
                        ({pct}%)
                      </span>
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
                      className="w-12 bg-slate-950 border border-slate-800 rounded-lg py-1 px-1 text-center text-xs font-semibold text-white focus:outline-none focus:border-slate-600"
                    />
                  </div>

                  {reasoning && (
                    <p className="text-[11px] text-slate-400 bg-slate-950/40 p-2 rounded-xl">
                      {reasoning}
                    </p>
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
      {/* VISTA 3: GESTIONAR BOLSILLOS */}
      {/* ======================================================== */}
      {activeTab === 'manage' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Gestionar bolsillos</h2>
            <button
              onClick={() => {
                setEditingPocket({
                  id: null,
                  nombre: '',
                  color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)],
                  tipo: 'compromiso_fijo',
                  periodicidad: 'mensual',
                  meta_monto: '',
                  dia_vencimiento: '',
                  dia_vencimiento_2: '',
                  saldo_actual: 0
                });
                setPocketModalOpen(true);
              }}
              className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo</span>
            </button>
          </div>

          <div className="space-y-2">
            {pockets.map(p => (
              <div 
                key={p.id}
                className="bg-slate-900/60 border border-slate-800/70 rounded-2xl p-3.5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <div>
                    <h4 className="font-semibold text-xs text-white">{p.nombre}</h4>
                    <div className="text-[11px] text-slate-400 space-x-1 mt-0.5">
                      <span className="capitalize">{p.periodicidad || 'Mensual'}</span>
                      {p.meta_monto > 0 && <span>· Meta: ${Number(p.meta_monto).toLocaleString('es-CO')}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingPocket({
                        id: p.id,
                        nombre: p.nombre,
                        color: p.color,
                        tipo: p.tipo,
                        periodicidad: p.periodicidad || 'mensual',
                        meta_monto: p.meta_monto || '',
                        dia_vencimiento: p.dia_vencimiento || '',
                        dia_vencimiento_2: p.dia_vencimiento_2 || '',
                        saldo_actual: p.saldo_actual || 0
                      });
                      setPocketModalOpen(true);
                    }}
                    className="p-2 text-slate-400 hover:text-white rounded-lg transition"
                    title="Editar"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeletePocket(p.id)}
                    className="p-2 text-slate-400 hover:text-rose-400 rounded-lg transition"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VISTA 4: HISTORIAL */}
      {/* ======================================================== */}
      {activeTab === 'history' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Historial</h2>
            <span className="text-xs text-slate-400">{history.length} movimientos</span>
          </div>

          {history.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No hay movimientos todavía.
            </div>
          ) : (
            <div className="space-y-2.5">
              {history.map(item => (
                <div 
                  key={item.id}
                  className="bg-slate-900/60 border border-slate-800/70 rounded-2xl p-4 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-white">
                      {item.tipo === 'ingreso' ? `Ingreso: ${item.fuente}` : item.pocketNombre}
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
      {/* MODAL: PAGAR COMPROMISO (Vaciado y reinicio de ciclo) */}
      {/* ======================================================== */}
      {payCommitmentModalOpen && selectedPocket && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Pagar compromiso</h3>
              <button 
                onClick={() => setPayCommitmentModalOpen(false)}
                className="text-slate-400 hover:text-white"
              ><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                Vas a marcar como pagado el compromiso <span className="font-bold text-white">{selectedPocket.nombre}</span>.
              </p>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl text-center">
                <span className="text-[11px] text-slate-400 block mb-0.5">Monto del pago</span>
                <span className="text-2xl font-black text-white">
                  ${Number(selectedPocket.saldo_actual || 0).toLocaleString('es-CO')}
                </span>
              </div>

              <p className="text-[11px] text-slate-400">
                Al confirmar, el dinero se registra como gasto pagado, el saldo del bolsillo se vacía a $0 y queda listo para comenzar a llenarse nuevamente para el próximo ciclo.
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
              <button 
                onClick={() => setExpenseModalOpen(false)}
                className="text-slate-400 hover:text-white"
              ><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleRegisterExpense} className="space-y-3.5">
              <div>
                <label className="text-xs text-slate-400">Bolsillo</label>
                <select
                  value={expenseForm.pocketId}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, pocketId: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-slate-600 mt-1"
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
                <label className="text-xs text-slate-400">Monto del gasto</label>
                <input
                  type="number"
                  value={expenseForm.monto}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, monto: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-xs text-white font-bold text-base focus:outline-none focus:border-slate-600 mt-1"
                  placeholder="0"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Nota o concepto</label>
                <input
                  type="text"
                  value={expenseForm.nota}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, nota: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-slate-600 mt-1"
                  placeholder="ej. Café, transporte, factura..."
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
              <button 
                onClick={() => setPocketModalOpen(false)}
                className="text-slate-400 hover:text-white"
              ><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSavePocket} className="space-y-3.5">
              <div>
                <label className="text-xs text-slate-400">Nombre</label>
                <input
                  type="text"
                  value={editingPocket.nombre}
                  onChange={(e) => setEditingPocket(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-slate-600 mt-1"
                  placeholder="ej. Arriendo, Mercado..."
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

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition mt-2"
              >
                {editingPocket.id ? 'Guardar cambios' : 'Crear bolsillo'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: AJUSTES Y CREDENCIALES (DISCRETO) */}
      {/* ======================================================== */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Ajustes del sistema</h3>
              <button 
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white"
              ><X className="w-5 h-5" /></button>
            </div>

            <div className="text-xs text-slate-300 space-y-3">
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Base de datos:</span>
                  <span className={`font-semibold ${isSupabaseConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isSupabaseConfigured ? 'Supabase conectado' : 'Modo local (offline)'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Motor de IA:</span>
                  <span className="font-semibold text-slate-200">
                    {activeAIProvider || 'Simulación local'}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Para sincronizar en la nube o activar Groq / Gemini en vivo, edita las claves en el archivo <code className="text-slate-200">.env</code> del proyecto.
              </p>
            </div>

            <button
              onClick={() => setShowConfigModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
