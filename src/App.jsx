import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  PlusCircle, 
  MinusCircle, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Sliders, 
  ArrowRight,
  TrendingUp,
  Settings,
  HelpCircle,
  RefreshCw,
  PieChart,
  Calendar,
  Lock,
  Plus,
  Trash2,
  Edit2,
  Layers,
  History,
  Clock,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { suggestAllocationWithAI, isAIConfigured, activeAIProvider } from './services/ai';
import { fetchPockets, savePocket, deletePocket, updatePocketBalance } from './services/pockets';

const COLOR_PALETTE = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', 
  '#8B5CF6', '#EC4899', '#06B6D4', '#14B8A6'
];

export default function App() {
  const [pockets, setPockets] = useState([]);
  const [isLoadingPockets, setIsLoadingPockets] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'income' | 'manage' | 'history'
  
  // Modales
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [pocketModalOpen, setPocketModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [selectedPocketForExpense, setSelectedPocketForExpense] = useState(null);

  // Formulario para Crear / Editar Bolsillo
  const [editingPocket, setEditingPocket] = useState({
    id: null,
    nombre: '',
    color: '#10B981',
    tipo: 'compromiso_fijo',
    periodicidad: 'mensual', // 'mensual' | 'quincenal' | 'semanal' | 'libre'
    meta_monto: '',
    dia_vencimiento: '',
    dia_vencimiento_2: '',
    saldo_actual: 0
  });

  // Formulario de Gasto Rápido
  const [expenseForm, setExpenseForm] = useState({
    pocketId: '',
    monto: '',
    nota: ''
  });

  // Historial de movimientos
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('platicapp_history') || '[]');
    } catch {
      return [];
    }
  });

  // Estados para el flujo de "Entró Plata" (Reparto en %)
  const [incomingAmount, setIncomingAmount] = useState(800000);
  const [incomeSource, setIncomeSource] = useState('Pago Cliente / Nómina');
  const [percentages, setPercentages] = useState({});
  const [aiReasonings, setAiReasonings] = useState({});
  const [aiGeneralAdvice, setAiGeneralAdvice] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // 1. Cargar bolsillos iniciales
  useEffect(() => {
    loadPockets();
  }, []);

  const loadPockets = async () => {
    setIsLoadingPockets(true);
    try {
      const data = await fetchPockets();
      setPockets(data);
      initializePercentages(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingPockets(false);
    }
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

  // Cálculos globales
  const totalBalance = pockets.reduce((acc, p) => acc + Number(p.saldo_actual || 0), 0);
  const currentTotalPercentage = Object.values(percentages).reduce((acc, val) => acc + Number(val || 0), 0);
  const isPercentageValid = Math.abs(currentTotalPercentage - 100) < 0.01;

  // Manejar cambio en un slider
  const handleSliderChange = (pocketId, val) => {
    const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
    setPercentages(prev => ({
      ...prev,
      [pocketId]: num
    }));
  };

  // Auto-equilibrar porcentaje sobrante en el bolsillo Libre o Reserva
  const balanceToFreePocket = () => {
    const freePocket = pockets.find(p => p.tipo === 'libre') || pockets[pockets.length - 1];
    if (!freePocket) return;

    const otherSum = Object.entries(percentages)
      .filter(([id]) => id !== freePocket.id)
      .reduce((acc, [, val]) => acc + Number(val || 0), 0);

    const needed = Math.max(0, 100 - otherSum);
    setPercentages(prev => ({
      ...prev,
      [freePocket.id]: Number(needed.toFixed(2))
    }));
  };

  // Llamada a IA (Groq o Gemini)
  const handleAskAI = async () => {
    if (!incomingAmount || incomingAmount <= 0) return;
    setIsAiLoading(true);
    setAiError('');

    try {
      if (!isAIConfigured) {
        // Simulación inteligente si no hay clave aún
        await new Promise(r => setTimeout(r, 600));
        const simPcts = {};
        const count = pockets.length;
        pockets.forEach((p) => {
          if (p.tipo === 'compromiso_fijo') simPcts[p.id] = 35;
          else if (p.tipo === 'gasto_corriente') simPcts[p.id] = 25;
          else if (p.tipo === 'reserva') simPcts[p.id] = 20;
          else simPcts[p.id] = Math.max(5, Math.floor(20 / (count - 3 || 1)));
        });
        
        // Ajustar al 100%
        const curSum = Object.values(simPcts).reduce((a, b) => a + b, 0);
        if (pockets[0]) simPcts[pockets[0].id] += (100 - curSum);

        setPercentages(simPcts);
        setAiGeneralAdvice('Reparto simulado: Priorizando compromisos quincenales/mensuales y fortaleciendo reserva.');
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
      setAiGeneralAdvice(result.consejo_general || 'Reparto calculado con éxito.');
    } catch (err) {
      console.error(err);
      setAiError(err.message || 'Error al consultar la IA');
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
      return {
        ...p,
        saldo_actual: Number(p.saldo_actual || 0) + addedMoney
      };
    });

    setPockets(updated);
    localStorage.setItem('platicapp_pockets_v1', JSON.stringify(updated));

    // Registrar en Historial
    const newHistoryEntry = {
      id: `mov-${Date.now()}`,
      tipo: 'ingreso_reparto',
      monto: incomingAmount,
      fuente: incomeSource,
      fecha: new Date().toISOString(),
      detalles: allocationsSummary
    };
    const updatedHistory = [newHistoryEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('platicapp_history', JSON.stringify(updatedHistory));

    confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
    setActiveTab('dashboard');
  };

  // Registrar un gasto rápido
  const handleRegisterExpense = async (e) => {
    e.preventDefault();
    const pocket = pockets.find(p => p.id === expenseForm.pocketId);
    const amount = parseFloat(expenseForm.monto);

    if (!pocket || !amount || amount <= 0) return;

    const updated = pockets.map(p => {
      if (p.id === pocket.id) {
        return {
          ...p,
          saldo_actual: Math.max(0, Number(p.saldo_actual || 0) - amount)
        };
      }
      return p;
    });

    setPockets(updated);
    localStorage.setItem('platicapp_pockets_v1', JSON.stringify(updated));

    // Historial
    const newHistoryEntry = {
      id: `exp-${Date.now()}`,
      tipo: 'gasto',
      pocketNombre: pocket.nombre,
      monto: amount,
      nota: expenseForm.nota || 'Gasto registrado',
      fecha: new Date().toISOString()
    };
    const updatedHistory = [newHistoryEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('platicapp_history', JSON.stringify(updatedHistory));

    setExpenseModalOpen(false);
    setExpenseForm({ pocketId: '', monto: '', nota: '' });
  };

  // Guardar bolsillo (Crear o Editar)
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
  };

  // Borrar bolsillo
  const handleDeletePocket = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este bolsillo?')) return;
    const updated = await deletePocket(id);
    setPockets(updated);
    initializePercentages(updated);
  };

  return (
    <div className="max-w-md mx-auto min-h-screen pb-24 px-4 pt-5 flex flex-col font-sans">
      
      {/* HEADER SUPERIOR */}
      <header className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
              <span className="text-emerald-400">MI</span> Platicapp
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {activeAIProvider ? activeAIProvider.split(' ')[0] : 'Offline'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Presupuesto por porcentajes y eventos</p>
        </div>

        <button 
          onClick={() => setShowConfigModal(true)}
          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition"
          title="Configuración de credenciales"
        >
          <Settings className="w-4 h-4" />
        </button>
      </header>

      {/* TABS DE NAVEGACIÓN SUPERIOR / RESUMEN */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900/90 border border-slate-800/80 rounded-xl mb-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`py-2 rounded-lg flex flex-col items-center gap-1 transition ${
            activeTab === 'dashboard' ? 'bg-emerald-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span className="text-[10px]">Bolsillos</span>
        </button>

        <button
          onClick={() => setActiveTab('income')}
          className={`py-2 rounded-lg flex flex-col items-center gap-1 transition ${
            activeTab === 'income' ? 'bg-emerald-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span className="text-[10px]">Entró Plata</span>
        </button>

        <button
          onClick={() => setActiveTab('manage')}
          className={`py-2 rounded-lg flex flex-col items-center gap-1 transition ${
            activeTab === 'manage' ? 'bg-emerald-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span className="text-[10px]">Gestionar</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`py-2 rounded-lg flex flex-col items-center gap-1 transition ${
            activeTab === 'history' ? 'bg-emerald-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          <span className="text-[10px]">Historial</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* VISTA 1: DASHBOARD DE BOLSILLOS */}
      {/* ======================================================== */}
      {activeTab === 'dashboard' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Card Resumen Total */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Total en Bolsillos</span>
            <div className="text-3xl font-black text-white mt-0.5 tracking-tight">
              ${totalBalance.toLocaleString('es-CO')} <span className="text-xs font-normal text-slate-400">COP</span>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>{pockets.length} Bolsillos activos</span>
              <button
                onClick={() => {
                  setExpenseForm({ pocketId: pockets[0]?.id || '', monto: '', nota: '' });
                  setExpenseModalOpen(true);
                }}
                className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 bg-rose-950/40 border border-rose-900/50 px-2.5 py-1 rounded-lg transition"
              >
                <MinusCircle className="w-3.5 h-3.5" /> Registrar Gasto
              </button>
            </div>
          </div>

          {/* BOTÓN RÁPIDO PARA REPARTIR */}
          <button
            onClick={() => setActiveTab('income')}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition active:scale-[0.99]"
          >
            <PlusCircle className="w-5 h-5 text-slate-950" />
            <span>LLEGÓ DINERO: REPARTIR EN %</span>
          </button>

          {/* LISTA DE BOLSILLOS */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 px-1 pt-1">
              <span>Bolsillo & Periodicidad</span>
              <span>Saldo</span>
            </div>

            {pockets.map(pocket => {
              const hasTarget = pocket.meta_monto > 0;
              const progress = hasTarget ? Math.min(100, Math.round((pocket.saldo_actual / pocket.meta_monto) * 100)) : null;

              return (
                <div 
                  key={pocket.id}
                  className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 rounded-2xl p-4 transition shadow-sm space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: pocket.color }}
                      />
                      <div>
                        <h3 className="font-bold text-sm text-white">{pocket.nombre}</h3>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                          <span className="capitalize px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                            {pocket.periodicidad || 'Mensual'}
                          </span>
                          {pocket.dia_vencimiento && (
                            <span className="text-amber-400/90 flex items-center gap-0.5">
                              • Vence día {pocket.dia_vencimiento}
                              {pocket.dia_vencimiento_2 && ` y ${pocket.dia_vencimiento_2}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-bold text-sm text-white">
                        ${Number(pocket.saldo_actual || 0).toLocaleString('es-CO')}
                      </span>
                      {hasTarget && (
                        <div className="text-[10px] text-slate-400">
                          Meta: ${Number(pocket.meta_monto).toLocaleString('es-CO')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Barra de meta */}
                  {hasTarget && (
                    <div className="pt-1">
                      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                        <span>Meta alcanzada</span>
                        <span className="font-semibold text-slate-300">{progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ 
                            width: `${progress}%`,
                            backgroundColor: pocket.color 
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-end gap-2 text-[11px]">
                    <button
                      onClick={() => {
                        setExpenseForm({ pocketId: pocket.id, monto: '', nota: '' });
                        setExpenseModalOpen(true);
                      }}
                      className="text-slate-400 hover:text-rose-400 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 transition"
                    >
                      <MinusCircle className="w-3 h-3 text-rose-400" /> Sacar plata
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VISTA 2: REPARTIR POR PORCENTAJES (EL CORE CON IA) */}
      {/* ======================================================== */}
      {activeTab === 'income' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-white">Reparto por Porcentajes (%)</h2>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="text-xs text-slate-400 hover:text-white"
            >
              Volver
            </button>
          </div>

          {/* Formulario de Entrada */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-400">Monto ingresado ($ COP)</label>
              <div className="relative mt-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  value={incomingAmount}
                  onChange={(e) => setIncomingAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl py-2.5 pl-8 pr-4 text-white font-bold text-lg focus:outline-none focus:border-emerald-500"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400">Fuente / Concepto</label>
              <input
                type="text"
                value={incomeSource}
                onChange={(e) => setIncomeSource(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-emerald-500 mt-1"
                placeholder="ej. Pago Cliente, Quincena, Extra..."
              />
            </div>

            {/* Botón de la IA */}
            <button
              onClick={handleAskAI}
              disabled={isAiLoading || incomingAmount <= 0}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition disabled:opacity-50"
            >
              {isAiLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Calculando con {activeAIProvider || 'IA'}...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-blue-200" />
                  <span>SUGERIR REPARTO CON {activeAIProvider ? activeAIProvider.toUpperCase() : 'IA'}</span>
                </>
              )}
            </button>

            {aiError && (
              <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 p-2.5 rounded-xl">
                {aiError}
              </div>
            )}

            {aiGeneralAdvice && (
              <div className="text-xs text-blue-300 bg-blue-950/40 border border-blue-900/60 p-2.5 rounded-xl flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <span>{aiGeneralAdvice}</span>
              </div>
            )}
          </div>

          {/* INDICADOR DE TOTAL % */}
          <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold transition ${
            isPercentageValid 
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' 
              : currentTotalPercentage > 100 
                ? 'bg-rose-950/40 border-rose-800 text-rose-300' 
                : 'bg-amber-950/40 border-amber-800 text-amber-300'
          }`}>
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4" />
              <span>Total: {currentTotalPercentage.toFixed(1)}% / 100%</span>
            </div>

            {!isPercentageValid && (
              <button
                onClick={balanceToFreePocket}
                className="px-2 py-1 rounded bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white text-[10px] font-semibold transition"
              >
                Auto-equilibrar
              </button>
            )}
          </div>

          {/* SLIDERS DE PORCENTAJES */}
          <div className="space-y-2.5">
            {pockets.map(pocket => {
              const pct = percentages[pocket.id] || 0;
              const allocatedMoney = Math.round((pct / 100) * incomingAmount);
              const reasoning = aiReasonings[pocket.id];

              return (
                <div 
                  key={pocket.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: pocket.color }}
                      />
                      <span className="font-bold text-xs text-white">{pocket.nombre}</span>
                      <span className="text-[10px] text-slate-500 uppercase">{pocket.periodicidad}</span>
                    </div>

                    <div className="text-right">
                      <span className="text-emerald-400 font-bold text-xs">
                        ${allocatedMoney.toLocaleString('es-CO')}
                      </span>
                      <span className="text-xs font-black text-slate-300 ml-1.5">
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
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={pct}
                      onChange={(e) => handleSliderChange(pocket.id, e.target.value)}
                      className="w-12 bg-slate-950 border border-slate-800 rounded-lg py-1 px-1 text-center text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {reasoning && (
                    <p className="text-[10px] text-slate-400 italic bg-slate-950/60 p-2 rounded-lg border border-slate-800/50">
                      💡 {reasoning}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleConfirmAllocation}
            disabled={!isPercentageValid || incomingAmount <= 0}
            className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>CONFIRMAR REPARTO EN BOLSILOS</span>
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* VISTA 3: GESTIONAR BOLSILLOS (CREAR, EDITAR, PERIODICIDAD) */}
      {/* ======================================================== */}
      {activeTab === 'manage' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-white">Gestionar Bolsillos</h2>
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
              className="py-1.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Bolsillo</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {pockets.map(p => (
              <div 
                key={p.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <div>
                    <h4 className="font-bold text-xs text-white">{p.nombre}</h4>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <span className="capitalize">{p.periodicidad || 'Mensual'}</span>
                      {p.meta_monto > 0 && <span>• Meta: ${Number(p.meta_monto).toLocaleString('es-CO')}</span>}
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
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeletePocket(p.id)}
                    className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VISTA 4: HISTORIAL DE MOVIMIENTOS */}
      {/* ======================================================== */}
      {activeTab === 'history' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-white">Historial de Movimientos</h2>
            <span className="text-xs text-slate-500">{history.length} registros</span>
          </div>

          {history.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              Aún no hay movimientos registrados. Reparte tu primer ingreso o registra un gasto.
            </div>
          ) : (
            <div className="space-y-2.5">
              {history.map(item => (
                <div 
                  key={item.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {item.tipo === 'ingreso_reparto' ? (
                        <ArrowDownRight className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-rose-400" />
                      )}
                      <span className="font-bold text-xs text-white">
                        {item.tipo === 'ingreso_reparto' ? `Ingreso Repartido (${item.fuente})` : item.pocketNombre}
                      </span>
                    </div>

                    <span className={`font-bold text-xs ${item.tipo === 'ingreso_reparto' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {item.tipo === 'ingreso_reparto' ? '+' : '-'}${Number(item.monto).toLocaleString('es-CO')}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-500">
                    {new Date(item.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>

                  {item.detalles && (
                    <div className="pt-2 border-t border-slate-800/60 grid grid-cols-2 gap-1 text-[10px] text-slate-400">
                      {item.detalles.map((d, i) => (
                        <div key={i} className="truncate">
                          • {d.pocketNombre}: <span className="text-slate-300 font-semibold">{d.porcentaje}%</span> (${d.monto.toLocaleString('es-CO')})
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
      {/* MODAL: REGISTRAR GASTO */}
      {/* ======================================================== */}
      {expenseModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <MinusCircle className="w-4 h-4 text-rose-400" /> Registrar Gasto
              </h3>
              <button 
                onClick={() => setExpenseModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >✕</button>
            </div>

            <form onSubmit={handleRegisterExpense} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-400">Bolsillo</label>
                <select
                  value={expenseForm.pocketId}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, pocketId: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-emerald-500 mt-1"
                  required
                >
                  <option value="">Selecciona un bolsillo...</option>
                  {pockets.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} (Saldo: ${Number(p.saldo_actual).toLocaleString('es-CO')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Monto gastado ($ COP)</label>
                <input
                  type="number"
                  value={expenseForm.monto}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, monto: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white font-bold focus:outline-none focus:border-emerald-500 mt-1"
                  placeholder="ej. 35000"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Nota / Comercio</label>
                <input
                  type="text"
                  value={expenseForm.nota}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, nota: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-emerald-500 mt-1"
                  placeholder="ej. Almuerzo, Uber, Factura..."
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs transition mt-2"
              >
                Guardar Gasto
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">
                {editingPocket.id ? 'Editar Bolsillo' : 'Nuevo Bolsillo'}
              </h3>
              <button 
                onClick={() => setPocketModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >✕</button>
            </div>

            <form onSubmit={handleSavePocket} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-400">Nombre del Bolsillo</label>
                <input
                  type="text"
                  value={editingPocket.nombre}
                  onChange={(e) => setEditingPocket(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-emerald-500 mt-1"
                  placeholder="ej. Arriendo, Comida, Moto..."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-400">Tipo</label>
                  <select
                    value={editingPocket.tipo}
                    onChange={(e) => setEditingPocket(prev => ({ ...prev, tipo: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-2 text-xs text-white mt-1"
                  >
                    <option value="compromiso_fijo">Compromiso Fijo</option>
                    <option value="gasto_corriente">Gasto Diario</option>
                    <option value="ahorro">Ahorro</option>
                    <option value="reserva">Reserva</option>
                    <option value="libre">Libre</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400">Periodicidad</label>
                  <select
                    value={editingPocket.periodicidad}
                    onChange={(e) => setEditingPocket(prev => ({ ...prev, periodicidad: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-2 text-xs text-white mt-1"
                  >
                    <option value="mensual">Mensual</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="semanal">Semanal</option>
                    <option value="libre">Sin ciclo fijo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-400">Día Vencimiento 1</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={editingPocket.dia_vencimiento}
                    onChange={(e) => setEditingPocket(prev => ({ ...prev, dia_vencimiento: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-2 text-xs text-white mt-1"
                    placeholder="ej. 15"
                  />
                </div>

                {editingPocket.periodicidad === 'quincenal' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Día Vencimiento 2</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={editingPocket.dia_vencimiento_2}
                      onChange={(e) => setEditingPocket(prev => ({ ...prev, dia_vencimiento_2: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-2 text-xs text-white mt-1"
                      placeholder="ej. 30"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Meta en pesos (Opcional)</label>
                <input
                  type="number"
                  value={editingPocket.meta_monto}
                  onChange={(e) => setEditingPocket(prev => ({ ...prev, meta_monto: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white mt-1"
                  placeholder="ej. 1200000"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Saldo Actual ($)</label>
                <input
                  type="number"
                  value={editingPocket.saldo_actual}
                  onChange={(e) => setEditingPocket(prev => ({ ...prev, saldo_actual: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white mt-1"
                  placeholder="0"
                />
              </div>

              {/* Selector de Color */}
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Color</label>
                <div className="flex gap-2">
                  {COLOR_PALETTE.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditingPocket(prev => ({ ...prev, color: c }))}
                      className={`w-6 h-6 rounded-full transition ${editingPocket.color === c ? 'scale-125 ring-2 ring-white' : 'opacity-70 hover:opacity-100'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition mt-2"
              >
                {editingPocket.id ? 'Actualizar Bolsillo' : 'Crear Bolsillo'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CONFIGURACIÓN DE CREDENCIALES */}
      {/* ======================================================== */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                Credenciales (.env)
              </h3>
              <button 
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >✕</button>
            </div>

            <div className="text-xs text-slate-300 space-y-3">
              <p>Pega tus claves en el archivo <code className="text-emerald-400 bg-slate-950 px-1.5 py-0.5 rounded font-mono">.env</code>:</p>

              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2 font-mono text-[11px]">
                <div>
                  <span className="text-slate-500"># Supabase:</span>
                  <div className="text-emerald-400 truncate">VITE_SUPABASE_URL=...</div>
                  <div className="text-emerald-400 truncate">VITE_SUPABASE_ANON_KEY=...</div>
                </div>
                <div className="pt-1 border-t border-slate-900 space-y-1">
                  <span className="text-slate-500"># IA (Usa Groq gratis o Gemini):</span>
                  <div className="text-blue-400 truncate">VITE_GROQ_API_KEY=gsk_...</div>
                  <div className="text-slate-500 truncate text-[10px]"># O Gemini:</div>
                  <div className="text-blue-300/70 truncate">VITE_GEMINI_API_KEY=...</div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Los datos se guardan en tu navegador localmente y se sincronizan a Supabase automáticamente cuando esté conectado.
              </p>
            </div>

            <button
              onClick={() => setShowConfigModal(false)}
              className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
