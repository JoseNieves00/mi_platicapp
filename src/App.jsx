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
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { suggestAllocationWithAI, isGeminiConfigured } from './services/gemini';

// Bolsillos iniciales de demostración
const INITIAL_POCKETS = [
  { id: '1', nombre: 'Arriendo / Vivienda', color: '#EF4444', tipo: 'compromiso_fijo', saldo_actual: 450000, meta_monto: 1200000, dia_vencimiento: 30 },
  { id: '2', nombre: 'Servicios Públicos', color: '#F59E0B', tipo: 'compromiso_fijo', saldo_actual: 180000, meta_monto: 250000, dia_vencimiento: 15 },
  { id: '3', nombre: 'Mercado & Comida', color: '#10B981', tipo: 'gasto_corriente', saldo_actual: 220000, meta_monto: 600000, dia_vencimiento: null },
  { id: '4', nombre: 'Colchón de Reserva', color: '#3B82F6', tipo: 'reserva', saldo_actual: 850000, meta_monto: 2000000, dia_vencimiento: null },
  { id: '5', nombre: 'Libre / Ocio', color: '#8B5CF6', tipo: 'libre', saldo_actual: 140000, meta_monto: null, dia_vencimiento: null }
];

export default function App() {
  const [pockets, setPockets] = useState(INITIAL_POCKETS);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'income' | 'history'
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Estados para el flujo de "Entró Plata"
  const [incomingAmount, setIncomingAmount] = useState(800000);
  const [incomeSource, setIncomeSource] = useState('Pago Cliente / Proyecto');
  const [percentages, setPercentages] = useState({});
  const [aiReasonings, setAiReasonings] = useState({});
  const [aiGeneralAdvice, setAiGeneralAdvice] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Inicializar porcentajes equitativos o proporcionales
  useEffect(() => {
    resetPercentages();
  }, [pockets]);

  const resetPercentages = () => {
    // Reparto base inteligente sin IA: 35% fijos, 30% comida, 20% reserva, 15% libre
    const initial = {
      '1': 35,
      '2': 15,
      '3': 25,
      '4': 15,
      '5': 10
    };
    setPercentages(initial);
  };

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

  // Botón para auto-equilibrar el sobrante en el bolsillo "Libre"
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

  // Llamar a Gemini para que sugiera los porcentajes
  const handleAskAI = async () => {
    if (!incomingAmount || incomingAmount <= 0) return;
    setIsAiLoading(true);
    setAiError('');

    try {
      if (!isGeminiConfigured) {
        // Simulación inteligente para cuando aún no hayan puesto la API Key
        await new Promise(r => setTimeout(r, 800));
        setPercentages({
          '1': 40, // Más a arriendo porque vence pronto
          '2': 10,
          '3': 25,
          '4': 15,
          '5': 10
        });
        setAiReasonings({
          '1': 'Arriendo vence en pocos días y le falta para la meta mensual.',
          '2': 'Servicios está casi cubierto, un aporte moderado.',
          '3': 'Gasto constante para las siguientes semanas.',
          '4': 'Aporte al fondo de tranquilidad.',
          '5': 'Margen libre para gastos diarios sin culpa.'
        });
        setAiGeneralAdvice('Reparto simulado: Priorizamos el arriendo que está próximo y balanceamos reserva y ocio.');
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
      setAiError(err.message || 'No se pudo generar la sugerencia con IA');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Confirmar el reparto
  const handleConfirmAllocation = () => {
    if (!isPercentageValid) return;

    // Actualizar saldos locales de los bolsillos
    const updated = pockets.map(p => {
      const pct = percentages[p.id] || 0;
      const addedMoney = Math.round((pct / 100) * incomingAmount);
      return {
        ...p,
        saldo_actual: Number(p.saldo_actual) + addedMoney
      };
    });

    setPockets(updated);
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });

    setActiveTab('dashboard');
  };

  return (
    <div className="max-w-md mx-auto min-h-screen pb-24 px-4 pt-6 flex flex-col">
      {/* HEADER */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span className="text-emerald-400">MI</span> Platicapp
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              v1.0
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Finanzas por bolsillos y porcentajes</p>
        </div>

        <button 
          onClick={() => setShowConfigModal(true)}
          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition"
          title="Configuración de credenciales"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      {/* STATUS BADGES DE CREDENCIALES */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 text-xs">
        <div className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 whitespace-nowrap ${
          isSupabaseConfigured 
            ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' 
            : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${isSupabaseConfigured ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
          <span>Supabase: {isSupabaseConfigured ? 'Conectado' : 'Pendiente .env'}</span>
        </div>

        <div className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 whitespace-nowrap ${
          isGeminiConfigured 
            ? 'bg-blue-950/40 border-blue-800/60 text-blue-300' 
            : 'bg-slate-900 border-slate-800 text-slate-400'
        }`}>
          <Sparkles className="w-3 h-3 text-blue-400" />
          <span>Gemini: {isGeminiConfigured ? 'Activo' : 'Clave pendiente'}</span>
        </div>
      </div>

      {/* VISTA 1: DASHBOARD DE BOLSILLOS */}
      {activeTab === 'dashboard' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Card Total */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Total en Bolsillos</span>
            <div className="text-3xl font-black text-white mt-1 tracking-tight">
              ${totalBalance.toLocaleString('es-CO')} <span className="text-xs font-normal text-slate-400">COP</span>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>{pockets.length} Bolsillos activos</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> 100% Trazable
              </span>
            </div>
          </div>

          {/* BOTÓN PRINCIPAL DE ACCIÓN: ENTRÓ PLATA */}
          <button
            onClick={() => setActiveTab('income')}
            className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-base shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2.5 transition active:scale-[0.99]"
          >
            <PlusCircle className="w-5 h-5 text-slate-950" />
            <span>ENTRÓ DINERO (REPARTIR EN %)</span>
          </button>

          {/* LISTA DE BOLSILLOS */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
              <span>Tus Bolsillos</span>
              <span>Saldo Actual</span>
            </div>

            {pockets.map(pocket => {
              const hasTarget = pocket.meta_monto > 0;
              const progress = hasTarget ? Math.min(100, Math.round((pocket.saldo_actual / pocket.meta_monto) * 100)) : null;

              return (
                <div 
                  key={pocket.id}
                  className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 rounded-2xl p-4 transition shadow-sm"
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
                          <span className="capitalize">{pocket.tipo.replace('_', ' ')}</span>
                          {pocket.dia_vencimiento && (
                            <span className="text-amber-400/90 flex items-center gap-0.5">
                              • Vence día {pocket.dia_vencimiento}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-bold text-sm text-white">
                        ${Number(pocket.saldo_actual).toLocaleString('es-CO')}
                      </span>
                      {hasTarget && (
                        <div className="text-[10px] text-slate-400">
                          Meta: ${Number(pocket.meta_monto).toLocaleString('es-CO')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Barra de progreso de la meta */}
                  {hasTarget && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                        <span>Progreso de meta</span>
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
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VISTA 2: REPARTIR INGRESO POR PORCENTAJES (EL CORE DEL MODELO) */}
      {activeTab === 'income' && (
        <div className="space-y-5 animate-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-white">Reparto por Porcentajes</h2>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
          </div>

          {/* Entrada de Monto */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-400">¿Cuánto dinero ingresó?</label>
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
              <label className="text-xs font-semibold text-slate-400">Fuente / Nota</label>
              <input
                type="text"
                value={incomeSource}
                onChange={(e) => setIncomeSource(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-emerald-500 mt-1"
                placeholder="ej. Pago freelance, nómina, venta..."
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
                  <span>Gemini calculando porcentajes óptimos...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-blue-200" />
                  <span>SUGERIR PORCENTAJES CON IA (GEMINI)</span>
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

          {/* BADGE SUMA DE PORCENTAJES (STICKY INDICATOR) */}
          <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-bold transition ${
            isPercentageValid 
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' 
              : currentTotalPercentage > 100 
                ? 'bg-rose-950/40 border-rose-800 text-rose-300' 
                : 'bg-amber-950/40 border-amber-800 text-amber-300'
          }`}>
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4" />
              <span>Suma total: {currentTotalPercentage.toFixed(1)}% / 100%</span>
            </div>

            {!isPercentageValid && (
              <button
                onClick={balanceToFreePocket}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white text-[11px] font-semibold transition"
              >
                Auto-equilibrar
              </button>
            )}
          </div>

          {/* SLIDERS DE CADA BOLSILLO */}
          <div className="space-y-3">
            {pockets.map(pocket => {
              const pct = percentages[pocket.id] || 0;
              const allocatedMoney = Math.round((pct / 100) * incomingAmount);
              const reasoning = aiReasonings[pocket.id];

              return (
                <div 
                  key={pocket.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: pocket.color }}
                      />
                      <span className="font-bold text-sm text-white">{pocket.nombre}</span>
                    </div>

                    <div className="text-right">
                      <span className="text-emerald-400 font-bold text-sm">
                        ${allocatedMoney.toLocaleString('es-CO')}
                      </span>
                      <span className="text-xs font-black text-slate-300 ml-1.5">
                        ({pct}%)
                      </span>
                    </div>
                  </div>

                  {/* SLIDER INTERACTIVO */}
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
                      className="w-14 bg-slate-950 border border-slate-800 rounded-lg py-1 px-1.5 text-center text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {reasoning && (
                    <p className="text-[11px] text-slate-400 italic bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
                      💡 {reasoning}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* BOTÓN CONFIRMAR REPARTO */}
          <button
            onClick={handleConfirmAllocation}
            disabled={!isPercentageValid || incomingAmount <= 0}
            className="w-full py-4 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-base shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>CONFIRMAR REPARTO A BOLSILLOS</span>
          </button>
        </div>
      )}

      {/* MODAL DE CONFIGURACIÓN DE CREDENCIALES */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                Credenciales del Proyecto
              </h3>
              <button 
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-3">
              <p>
                Para conectar tu app a tu base de datos y a Gemini, abre el archivo <code className="text-emerald-400 bg-slate-950 px-1.5 py-0.5 rounded font-mono">.env</code> en la raíz del proyecto y pega tus claves:
              </p>

              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2 font-mono text-[11px]">
                <div>
                  <span className="text-slate-500"># Supabase:</span>
                  <div className="text-emerald-400 truncate">VITE_SUPABASE_URL=...</div>
                  <div className="text-emerald-400 truncate">VITE_SUPABASE_ANON_KEY=...</div>
                </div>
                <div className="pt-1 border-t border-slate-900">
                  <span className="text-slate-500"># Gemini API:</span>
                  <div className="text-blue-400 truncate">VITE_GEMINI_API_KEY=...</div>
                </div>
              </div>

              <div className="space-y-1.5 text-[11px] text-slate-400">
                <p>1. Ejecuta el archivo <code className="text-slate-200">supabase/schema.sql</code> en el editor SQL de Supabase.</p>
                <p>2. Reinicia el servidor con <code className="text-slate-200">npm run dev</code> después de guardar el <code className="text-slate-200">.env</code>.</p>
              </div>
            </div>

            <button
              onClick={() => setShowConfigModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
