import React, { useState, useEffect, useMemo } from 'react';
import { 
  Home, 
  Plus, 
  Minus, 
  Sparkles, 
  Check, 
  Settings as SettingsIcon, 
  History, 
  Trash2, 
  Edit3, 
  X, 
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Send,
  RotateCcw,
  Download,
  Upload,
  Search,
  Building2,
  CreditCard,
  ArrowRightLeft,
  CheckSquare,
  Square
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { suggestAllocationWithAI, analyzeFinancesWithAI } from './services/ai';
import { fetchPockets, savePocket, deletePocket, savePocketsBatch } from './services/pockets';
import { getStoredConfig, saveStoredConfig } from './services/config';

const COLOR_PALETTE = [
  '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', 
  '#F59E0B', '#EF4444', '#06B6D4', '#14B8A6'
];

const COMMON_ACCOUNTS = [
  'Bancolombia', 'Nequi', 'Daviplata', 'Tarjeta Virtual', 'Efectivo', 'Nu / Nubank', 'Lulo Bank'
];

export default function App() {
  const [pockets, setPockets] = useState([]);
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'copilot' | 'history' | 'settings'
  const [balanceViewMode, setBalanceViewMode] = useState('categories'); // 'categories' | 'accounts'
  
  // Sheet de Detalle del Bolsillo
  const [selectedPocketDetail, setSelectedPocketDetail] = useState(null);

  // Modales
  const [incomeModalOpen, setIncomeModalOpen] = useState(false);
  const [transfersSheetOpen, setTransfersSheetOpen] = useState(false);
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [completedTransferIds, setCompletedTransferIds] = useState({});

  const [pocketModalOpen, setPocketModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);

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
    cuenta_destino: 'Nequi',
    saldo_actual: 0,
    pagado_este_ciclo: false,
    es_compartido: false
  });

  // Formulario Gasto
  const [expenseForm, setExpenseForm] = useState({ pocketId: '', monto: '', nota: '' });

  // Historial
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('platicapp_history_v3') || '[]');
    } catch {
      return [];
    }
  });

  // Filtros de Movimientos
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');

  // Tip Inteligente en Inicio
  const [homeTip, setHomeTip] = useState(() => {
    return localStorage.getItem('platicapp_home_tip') || 'Al repartir ingresos, dispersa tu dinero en las cuentas correspondientes (Nequi, Bancolombia, etc.) para evitar gastos accidentales.';
  });
  const [isRefreshingTip, setIsRefreshingTip] = useState(false);

  // Estados para "Entrar Dinero"
  const [incomingAmount, setIncomingAmount] = useState(800000);
  const [incomeSource, setIncomeSource] = useState('Ingreso Nómina');
  const [incomeOriginAccount, setIncomeOriginAccount] = useState('Bancolombia');
  const [percentages, setPercentages] = useState({});
  const [aiReasonings, setAiReasonings] = useState({});
  const [aiGeneralAdvice, setAiGeneralAdvice] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Copiloto Financiero
  const [copilotAnalysis, setCopilotAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [userQuestion, setUserQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      text: 'Hola, soy tu copiloto. Te ayudo a analizar tus bolsillos, los saldos en tus diferentes cuentas bancarias y sugerirte optimizaciones.'
    }
  ]);
  const [isAnswering, setIsAnswering] = useState(false);

  // Ajustes Simplificados
  const [settings, setSettings] = useState(() => {
    const stored = getStoredConfig();
    return {
      apiKey: stored.groqKey || stored.geminiKey || '',
      currency: localStorage.getItem('platicapp_currency') || 'COP',
      cloudUrl: stored.supabaseUrl || '',
      cloudKey: stored.supabaseKey || ''
    };
  });

  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
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

  // Distribución del dinero por Categoría
  const distributionByCategory = useMemo(() => {
    if (totalBalance <= 0) return { compromisos: 0, diario: 0, reserva: 0, libre: 0 };
    let comp = 0, diario = 0, res = 0, lib = 0;
    pockets.forEach(p => {
      const b = Number(p.saldo_actual || 0);
      if (p.tipo === 'compromiso_fijo') comp += b;
      else if (p.tipo === 'gasto_corriente') diario += b;
      else if (p.tipo === 'reserva' || p.tipo === 'ahorro') res += b;
      else lib += b;
    });
    return {
      compromisos: Math.round((comp / totalBalance) * 100),
      diario: Math.round((diario / totalBalance) * 100),
      reserva: Math.round((res / totalBalance) * 100),
      libre: Math.round((lib / totalBalance) * 100)
    };
  }, [pockets, totalBalance]);

  // Arqueo: Saldo agrupado por Cuenta Bancaria Física
  const balancesByAccount = useMemo(() => {
    const accounts = {};
    pockets.forEach(p => {
      const accName = p.cuenta_destino || 'Principal';
      accounts[accName] = (accounts[accName] || 0) + Number(p.saldo_actual || 0);
    });
    return Object.entries(accounts).map(([name, amount]) => ({
      name,
      amount,
      percentage: totalBalance > 0 ? Math.round((amount / totalBalance) * 100) : 0
    })).sort((a, b) => b.amount - a.amount);
  }, [pockets, totalBalance]);

  // Bolsillos ordenados: los pagados bajan al final automáticamente
  const sortedPockets = useMemo(() => {
    return [...pockets].sort((a, b) => {
      if (a.pagado_este_ciclo && !b.pagado_este_ciclo) return 1;
      if (!a.pagado_este_ciclo && b.pagado_este_ciclo) return -1;
      return 0;
    });
  }, [pockets]);

  // Movimientos filtrados
  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      const matchesType = historyFilter === 'all' || item.tipo === historyFilter;
      const q = historySearch.toLowerCase().trim();
      const matchesSearch = !q || 
        (item.fuente && item.fuente.toLowerCase().includes(q)) ||
        (item.pocketNombre && item.pocketNombre.toLowerCase().includes(q)) ||
        (item.nota && item.nota.toLowerCase().includes(q)) ||
        (item.cuenta && item.cuenta.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [history, historyFilter, historySearch]);

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

  // Generar Tip inteligente para Inicio
  const handleRefreshHomeTip = async () => {
    setIsRefreshingTip(true);
    try {
      const res = await analyzeFinancesWithAI({ 
        pockets, 
        history, 
        question: 'Dame un tip breve de 2 líneas sobre cómo dispersar o gestionar el dinero entre mis cuentas (Nequi, Bancolombia, etc.) y bolsillos.' 
      });
      const tipText = res.tips?.[0] || res.resumen_ejecutivo;
      setHomeTip(tipText);
      localStorage.setItem('platicapp_home_tip', tipText);
    } catch {
      setHomeTip('Recuerda: pasar el dinero a Nequi o Daviplata nada más recibirlo evita que gastes el arriendo o las suscripciones.');
      localStorage.setItem('platicapp_home_tip', homeTip);
    } finally {
      setIsRefreshingTip(false);
    }
  };

  // Sugerencia de IA al repartir dinero
  const handleAskAI = async () => {
    if (!incomingAmount || incomingAmount <= 0) return;
    setIsAiLoading(true);
    setAiError('');

    try {
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
    } catch {
      const simPcts = {};
      pockets.forEach(p => {
        if (p.pagado_este_ciclo) simPcts[p.id] = 5;
        else if (p.tipo === 'compromiso_fijo') simPcts[p.id] = 30;
        else if (p.tipo === 'gasto_corriente') simPcts[p.id] = 25;
        else if (p.tipo === 'reserva') simPcts[p.id] = 20;
        else simPcts[p.id] = 20;
      });
      const curSum = Object.values(simPcts).reduce((a, b) => a + b, 0);
      if (pockets[0]) simPcts[pockets[0].id] += (100 - curSum);

      setPercentages(simPcts);
      setAiGeneralAdvice('Reparto balanceado según compromisos y metas.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Confirmar y Guardar Reparto + GENERAR HOJA DE TRASLADOS
  const handleConfirmAllocation = async () => {
    if (!isPercentageValid || incomingAmount <= 0) return;

    const allocationsSummary = [];
    const transfersGenerated = [];

    const updated = pockets.map(p => {
      const pct = percentages[p.id] || 0;
      const addedMoney = Math.round((pct / 100) * incomingAmount);
      
      allocationsSummary.push({ 
        pocketNombre: p.nombre, 
        cuenta: p.cuenta_destino || 'Principal',
        porcentaje: pct, 
        monto: addedMoney 
      });

      // Si el bolsillo tiene asignada una cuenta y recibe dinero, generar ítem en la Hoja de Traslados
      if (addedMoney > 0) {
        transfersGenerated.push({
          id: `tr-${p.id}-${Date.now()}`,
          pocketNombre: p.nombre,
          cuentaDestino: p.cuenta_destino || 'Cuenta Destino',
          monto: addedMoney,
          color: p.color
        });
      }

      return {
        ...p,
        saldo_actual: Number(p.saldo_actual || 0) + addedMoney,
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
      cuentaOrigen: incomeOriginAccount,
      fecha: new Date().toISOString(),
      detalles: allocationsSummary
    };
    const updatedHistory = [newHistoryEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('platicapp_history_v3', JSON.stringify(updatedHistory));

    confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
    setIncomeModalOpen(false);

    // Abrir Hoja de Traslados si hay transferencias que hacer
    if (transfersGenerated.length > 0) {
      setPendingTransfers(transfersGenerated);
      setCompletedTransferIds({});
      setTransfersSheetOpen(true);
    } else {
      showToast('Ingreso repartido con éxito');
    }
  };

  // Pagar compromiso y vaciar bolsillo
  const handleConfirmPayCommitment = async () => {
    if (!selectedPocketDetail) return;
    const paymentAmount = Number(selectedPocketDetail.saldo_actual || 0);

    const updated = pockets.map(p => {
      if (p.id === selectedPocketDetail.id) {
        return {
          ...p,
          saldo_actual: 0,
          pagado_este_ciclo: true
        };
      }
      return p;
    });

    setPockets(updated);
    await savePocketsBatch(updated);

    const newHistoryEntry = {
      id: `pay-${Date.now()}`,
      tipo: 'pago_compromiso',
      pocketNombre: selectedPocketDetail.nombre,
      cuenta: selectedPocketDetail.cuenta_destino,
      monto: paymentAmount,
      nota: `Compromiso liquidado desde ${selectedPocketDetail.cuenta_destino || 'cuenta'}`,
      fecha: new Date().toISOString()
    };
    const updatedHistory = [newHistoryEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('platicapp_history_v3', JSON.stringify(updatedHistory));

    setPayModalOpen(false);
    setSelectedPocketDetail(null);
    confetti({ particleCount: 30, spread: 50 });
    showToast(`${selectedPocketDetail.nombre} pagado desde ${selectedPocketDetail.cuenta_destino || 'cuenta'}`);
  };

  // Reiniciar ciclo manualmente
  const handleResetPocketCycle = async (pocketId) => {
    const updated = pockets.map(p => p.id === pocketId ? { ...p, pagado_este_ciclo: false } : p);
    setPockets(updated);
    await savePocketsBatch(updated);
    if (selectedPocketDetail) setSelectedPocketDetail({ ...selectedPocketDetail, pagado_este_ciclo: false });
    showToast('Ciclo reiniciado para recibir fondos');
  };

  // Registrar Gasto
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
      cuenta: pocket.cuenta_destino || 'Cuenta',
      monto: amount,
      nota: expenseForm.nota || 'Gasto registrado',
      prestamo: borrowed,
      fecha: new Date().toISOString()
    };
    const updatedHistory = [newHistoryEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('platicapp_history_v3', JSON.stringify(updatedHistory));

    setExpenseModalOpen(false);
    setSelectedPocketDetail(null);
    setExpenseForm({ pocketId: '', monto: '', nota: '' });
    showToast('Gasto registrado');
  };

  // Crear bolsillo con color aleatorio y cuenta por defecto
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
      cuenta_destino: 'Nequi',
      saldo_actual: 0,
      pagado_este_ciclo: false,
      es_compartido: false
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
      cuenta_destino: editingPocket.cuenta_destino || 'Bancolombia',
      saldo_actual: parseFloat(editingPocket.saldo_actual) || 0
    };

    const updated = await savePocket(pocketData);
    setPockets(updated);
    initializePercentages(updated);
    setPocketModalOpen(false);
    setSelectedPocketDetail(null);
    showToast('Bolsillo guardado');
  };

  const handleDeletePocket = async (id) => {
    if (!window.confirm('¿Eliminar este bolsillo?')) return;
    const updated = await deletePocket(id);
    setPockets(updated);
    initializePercentages(updated);
    setSelectedPocketDetail(null);
    showToast('Bolsillo eliminado');
  };

  // Copiloto: Análisis
  const handleRunCopilotAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await analyzeFinancesWithAI({ pockets, history });
      setCopilotAnalysis(res);
    } catch {
      setCopilotAnalysis({
        diagnostico_estado: 'Estable',
        resumen_ejecutivo: 'Tus compromisos principales avanzan con buen ritmo. Mantén las transferencias a Nequi y Tarjeta Virtual al día para los débitos automáticos.',
        tips: [
          'Verifica que el saldo en Tarjeta Virtual cubra YouTube antes de la fecha de débito.',
          'Mantén tus gastos libres por debajo del 20% del total.',
          'Dispersa el dinero a Nequi apenas recibas ingresos para asegurar la gasolina.'
        ]
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Copiloto: Pregunta
  const handleAskCopilotQuestion = async (e) => {
    e.preventDefault();
    if (!userQuestion.trim() || isAnswering) return;

    const q = userQuestion;
    setUserQuestion('');
    setChatMessages(prev => [...prev, { role: 'user', text: q }]);
    setIsAnswering(true);

    try {
      const res = await analyzeFinancesWithAI({ pockets, history, question: q });
      setChatMessages(prev => [
        ...prev, 
        { role: 'assistant', text: res.respuesta_copiloto || res.resumen_ejecutivo }
      ]);
    } catch {
      setChatMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          text: `Con tu saldo disponible actual ($${totalBalance.toLocaleString('es-CO')}), te sugiero verificar los saldos en Nequi y Bancolombia antes del próximo corte.` 
        }
      ]);
    } finally {
      setIsAnswering(false);
    }
  };

  // Guardar Ajustes
  const handleSaveSettings = (e) => {
    e.preventDefault();
    const isGroq = settings.apiKey.startsWith('gsk_');
    saveStoredConfig({
      groqKey: isGroq ? settings.apiKey : '',
      geminiKey: !isGroq ? settings.apiKey : '',
      aiProvider: isGroq ? 'groq' : 'gemini',
      supabaseUrl: settings.cloudUrl,
      supabaseKey: settings.cloudKey
    });
    localStorage.setItem('platicapp_currency', settings.currency);
    showToast('Ajustes guardados');
  };

  // Exportar respaldo JSON
  const handleExportBackup = () => {
    const data = { pockets, history, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `platicapp_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast('Copia de seguridad descargada');
  };

  // Restaurar respaldo JSON
  const handleImportBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.pockets && Array.isArray(parsed.pockets)) {
          setPockets(parsed.pockets);
          await savePocketsBatch(parsed.pockets);
          initializePercentages(parsed.pockets);
        }
        if (parsed.history && Array.isArray(parsed.history)) {
          setHistory(parsed.history);
          localStorage.setItem('platicapp_history_v3', JSON.stringify(parsed.history));
        }
        showToast('Datos restaurados');
      } catch {
        showToast('Archivo no válido');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-md mx-auto min-h-screen pb-32 px-4 sm:px-5 pt-6 flex flex-col font-sans text-slate-100 antialiased selection:bg-emerald-500 selection:text-slate-950 overflow-x-hidden">
      
      {/* TOAST FLOTANTE */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-slate-700/60 shadow-2xl px-4 py-2 rounded-full text-xs font-medium text-slate-200 animate-in fade-in slide-in-from-top-2 duration-200 backdrop-blur-md">
          {toastMessage}
        </div>
      )}

      {/* HEADER LIMPIO CON NOMBRE DECORADO */}
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
            <span className="text-emerald-400">MI</span> Platicapp
          </h1>
          <p className="text-xs text-slate-400">Bolsillos sincronizados con tus cuentas reales</p>
        </div>

        <button 
          onClick={handleOpenNewPocketModal}
          className="p-2.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition active:scale-95"
          title="Nuevo bolsillo"
        >
          <Plus className="w-4 h-4" />
        </button>
      </header>

      {/* ======================================================== */}
      {/* 1. INICIO (HOME - SALDOS, ARQUEO POR CUENTAS Y BOLSILLOS) */}
      {/* ======================================================== */}
      {activeTab === 'home' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          {/* Card Resumen de Saldo */}
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-5 sm:p-6 relative overflow-hidden backdrop-blur-sm space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider font-medium text-slate-400">Total disponible</span>
                <div className="text-3xl sm:text-4xl font-extrabold text-white mt-0.5 tracking-tight">
                  ${totalBalance.toLocaleString('es-CO')}
                </div>
              </div>

              {/* Selector de vista: Categorías vs Cuentas Bancarias */}
              <div className="flex p-0.5 bg-slate-950/80 border border-slate-800 rounded-xl text-[11px] font-semibold">
                <button
                  onClick={() => setBalanceViewMode('categories')}
                  className={`py-1 px-2.5 rounded-lg transition ${
                    balanceViewMode === 'categories' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Tipo
                </button>
                <button
                  onClick={() => setBalanceViewMode('accounts')}
                  className={`py-1 px-2.5 rounded-lg transition ${
                    balanceViewMode === 'accounts' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Cuentas
                </button>
              </div>
            </div>

            {/* VISTA A: BARRA DE CATEGORÍAS */}
            {balanceViewMode === 'categories' && totalBalance > 0 && (
              <div className="space-y-1.5 pt-1 animate-in fade-in">
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
                  {distributionByCategory.compromisos > 0 && (
                    <div style={{ width: `${distributionByCategory.compromisos}%` }} className="bg-rose-500 h-full" />
                  )}
                  {distributionByCategory.diario > 0 && (
                    <div style={{ width: `${distributionByCategory.diario}%` }} className="bg-emerald-500 h-full" />
                  )}
                  {distributionByCategory.reserva > 0 && (
                    <div style={{ width: `${distributionByCategory.reserva}%` }} className="bg-blue-500 h-full" />
                  )}
                  {distributionByCategory.libre > 0 && (
                    <div style={{ width: `${distributionByCategory.libre}%` }} className="bg-purple-500 h-full" />
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 flex-wrap gap-1">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Fijos {distributionByCategory.compromisos}%</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Diario {distributionByCategory.diario}%</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Reserva {distributionByCategory.reserva}%</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Libre {distributionByCategory.libre}%</span>
                </div>
              </div>
            )}

            {/* VISTA B: ARQUEO POR CUENTA BANCARIA REAL */}
            {balanceViewMode === 'accounts' && (
              <div className="space-y-1.5 pt-1 animate-in fade-in">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {balancesByAccount.map(acc => (
                    <div key={acc.name} className="p-2 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
                      <div className="truncate pr-1">
                        <span className="text-slate-400 text-[10px] block truncate">{acc.name}</span>
                        <span className="font-bold text-white text-xs">${acc.amount.toLocaleString('es-CO')}</span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                        {acc.percentage}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>{pockets.length} bolsillos</span>
              <button
                onClick={() => {
                  setExpenseForm({ pocketId: pockets[0]?.id || '', monto: '', nota: '' });
                  setExpenseModalOpen(true);
                }}
                className="text-xs text-slate-300 hover:text-white flex items-center gap-1 transition"
              >
                <Minus className="w-3.5 h-3.5" /> Gasto rápido
              </button>
            </div>
          </div>

          {/* WIDGET DEL TIP DE LA IA */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-start gap-3 backdrop-blur-sm relative">
            <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <span className="font-semibold text-slate-200 block mb-0.5">Tip del Copiloto</span>
              <p className="text-slate-400 leading-relaxed">{homeTip}</p>
            </div>
            <button
              onClick={handleRefreshHomeTip}
              disabled={isRefreshingTip}
              className="text-slate-500 hover:text-slate-300 transition p-1"
              title="Actualizar tip"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingTip ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>

          {/* BOTÓN PRINCIPAL: ENTRAR DINERO */}
          <button
            onClick={() => setIncomeModalOpen(true)}
            className="w-full py-4 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-all duration-150"
          >
            <Plus className="w-4 h-4" />
            <span>Entrar dinero</span>
          </button>

          {/* LISTA DE BOLSILLOS */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
              <span>Tus bolsillos</span>
              <span>Saldo</span>
            </div>

            {sortedPockets.map(pocket => {
              const hasTarget = pocket.meta_monto > 0;
              const effectiveTarget = pocket.periodicidad === 'quincenal' && hasTarget 
                ? pocket.meta_monto / 2 
                : pocket.meta_monto;

              const progress = hasTarget 
                ? Math.min(100, Math.round((pocket.saldo_actual / effectiveTarget) * 100)) 
                : null;

              const isPaid = pocket.pagado_este_ciclo;

              return (
                <div 
                  key={pocket.id}
                  onClick={() => setSelectedPocketDetail(pocket)}
                  className={`border rounded-2xl p-4 transition-all duration-150 cursor-pointer active:scale-[0.99] space-y-2.5 ${
                    isPaid 
                      ? 'bg-slate-950/30 border-slate-900/80 opacity-55 hover:opacity-90' 
                      : 'bg-slate-900/60 border-slate-800/70 hover:border-slate-700/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: pocket.color }}
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm text-white">{pocket.nombre}</h3>
                          
                          {/* Badge de Cuenta Bancaria / Destino */}
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60">
                            {pocket.cuenta_destino || 'Bancolombia'}
                          </span>

                          {isPaid && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Pagado
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-400 mt-0.5">
                          <span className="capitalize">{pocket.periodicidad || 'Mensual'}</span>
                          {pocket.dia_vencimiento && (
                            <span> · Vence día {pocket.dia_vencimiento}</span>
                          )}
                        </div>
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

                  {/* Barra sutil de progreso */}
                  {hasTarget && (
                    <div className="w-full h-1 bg-slate-800/70 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-300"
                        style={{ 
                          width: `${progress}%`,
                          backgroundColor: isPaid ? '#10B981' : pocket.color 
                        }}
                      />
                    </div>
                  )}

                  {/* Deuda Interna */}
                  {pocket.deuda_interna && pocket.deuda_interna.monto > 0 && (
                    <div className="text-[11px] text-amber-400 flex items-center gap-1 font-medium pt-0.5">
                      <AlertCircle className="w-3 h-3" />
                      <span>Debe ${pocket.deuda_interna.monto.toLocaleString('es-CO')} a {pocket.deuda_interna.lender_nombre || 'Libre'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. COPILOTO FINANCIERO */}
      {/* ======================================================== */}
      {activeTab === 'copilot' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" /> Copiloto
            </h2>
            <p className="text-xs text-slate-400">Análisis de bolsillos y dispersión de cuentas en tiempo real</p>
          </div>

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
            <span>{isAnalyzing ? 'Examinando tus datos...' : 'Diagnosticar mis finanzas ahora'}</span>
          </button>

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
                  Recomendaciones
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

          <div className="space-y-3 pt-2">
            <span className="text-xs font-semibold text-slate-400 px-1">Preguntas al copiloto</span>
            
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
                placeholder="Pregúntale algo sobre tus finanzas..."
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
      {/* 3. MOVIMIENTOS (CON FILTROS Y BÚSQUEDA) */}
      {/* ======================================================== */}
      {activeTab === 'history' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div>
            <h2 className="text-xl font-bold text-white">Movimientos</h2>
            <p className="text-xs text-slate-400">Historial con cuenta bancaria asociada</p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Buscar por bolsillo, cuenta o nota..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-slate-700"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setHistoryFilter('all')}
              className={`py-1 px-3 rounded-full border transition whitespace-nowrap ${
                historyFilter === 'all' 
                  ? 'bg-slate-800 border-slate-700 text-white font-semibold' 
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Todos ({history.length})
            </button>
            <button
              onClick={() => setHistoryFilter('ingreso')}
              className={`py-1 px-3 rounded-full border transition whitespace-nowrap ${
                historyFilter === 'ingreso' 
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300 font-semibold' 
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Ingresos
            </button>
            <button
              onClick={() => setHistoryFilter('gasto')}
              className={`py-1 px-3 rounded-full border transition whitespace-nowrap ${
                historyFilter === 'gasto' 
                  ? 'bg-rose-950/60 border-rose-800 text-rose-300 font-semibold' 
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Gastos
            </button>
            <button
              onClick={() => setHistoryFilter('pago_compromiso')}
              className={`py-1 px-3 rounded-full border transition whitespace-nowrap ${
                historyFilter === 'pago_compromiso' 
                  ? 'bg-blue-950/60 border-blue-800 text-blue-300 font-semibold' 
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Pagos de compromiso
            </button>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-xs">
              No se encontraron movimientos.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredHistory.map(item => (
                <div key={item.id} className="bg-slate-900/60 border border-slate-800/70 rounded-2xl p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-white">
                        {item.tipo === 'ingreso' ? `Ingreso: ${item.fuente}` : item.tipo === 'pago_compromiso' ? `Compromiso: ${item.pocketNombre}` : item.pocketNombre}
                      </span>
                      {item.cuenta && (
                        <span className="text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                          {item.cuenta}
                        </span>
                      )}
                    </div>

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
                          {d.pocketNombre} ({d.cuenta}): <span className="text-slate-300 font-medium">{d.porcentaje}%</span> (${d.monto.toLocaleString('es-CO')})
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
      {/* 4. AJUSTES (LIMPIO, AMIGABLE Y ÚTIL) */}
      {/* ======================================================== */}
      {activeTab === 'settings' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div>
            <h2 className="text-xl font-bold text-white">Ajustes</h2>
            <p className="text-xs text-slate-400">Preferencias, copia de seguridad y conexión</p>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            
            {/* Clave de Inteligencia Artificial */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-white">Inteligencia Artificial</h3>
                  <p className="text-[11px] text-slate-400">Pega tu clave gratuita de Groq o de Gemini</p>
                </div>
                <a 
                  href="https://console.groq.com/keys" 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs text-emerald-400 hover:underline font-medium"
                >
                  Obtener gratis
                </a>
              </div>

              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => setSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="Pega aquí tu clave (gsk_... o AIza...)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-slate-700"
              />
            </div>

            {/* Moneda */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-3">
              <h3 className="font-semibold text-sm text-white">Moneda</h3>
              <select
                value={settings.currency}
                onChange={(e) => setSettings(prev => ({ ...prev, currency: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white"
              >
                <option value="COP">Peso Colombiano (COP)</option>
                <option value="USD">Dólar Estadounidense (USD)</option>
                <option value="MXN">Peso Mexicano (MXN)</option>
                <option value="EUR">Euro (EUR)</option>
              </select>
            </div>

            {/* Respaldos */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-3">
              <h3 className="font-semibold text-sm text-white">Copia de Seguridad</h3>
              <p className="text-[11px] text-slate-400">Descarga o restaura tus bolsillos y cuentas en cualquier momento.</p>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar</span>
                </button>

                <label className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Restaurar</span>
                  <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition active:scale-[0.99]"
            >
              Guardar Ajustes
            </button>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* MENÚ INFERIOR (APPLE HIG - 4 PESTAÑAS) */}
      {/* ======================================================== */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-950/85 backdrop-blur-xl border-t border-slate-800/70 z-40 px-3 py-2 flex items-center justify-around">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 py-1 px-4 transition-colors ${
            activeTab === 'home' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px]">Inicio</span>
        </button>

        <button
          onClick={() => setActiveTab('copilot')}
          className={`flex flex-col items-center gap-1 py-1 px-4 transition-colors ${
            activeTab === 'copilot' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-[10px]">Copiloto</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 py-1 px-4 transition-colors ${
            activeTab === 'history' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-5 h-5" />
          <span className="text-[10px]">Movimientos</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 py-1 px-4 transition-colors ${
            activeTab === 'settings' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <SettingsIcon className="w-5 h-5" />
          <span className="text-[10px]">Ajustes</span>
        </button>
      </nav>

      {/* ======================================================== */}
      {/* SHEET: ACCIONES Y DETALLE DEL BOLSILLO */}
      {/* ======================================================== */}
      {selectedPocketDetail && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-end justify-center p-0">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: selectedPocketDetail.color }} />
                <div>
                  <h3 className="font-bold text-white text-base">{selectedPocketDetail.nombre}</h3>
                  <span className="text-[10px] text-slate-400">Cuenta: {selectedPocketDetail.cuenta_destino || 'Bancolombia'}</span>
                </div>
              </div>
              <button onClick={() => setSelectedPocketDetail(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block">Saldo actual</span>
                <span className="text-2xl font-black text-white">
                  ${Number(selectedPocketDetail.saldo_actual || 0).toLocaleString('es-CO')}
                </span>
              </div>
              {selectedPocketDetail.meta_monto > 0 && (
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">Meta mensual</span>
                  <span className="text-sm font-semibold text-slate-300">
                    ${Number(selectedPocketDetail.meta_monto).toLocaleString('es-CO')}
                  </span>
                </div>
              )}
            </div>

            {/* Acciones principales del Bolsillo */}
            <div className="space-y-2 pt-1">
              {/* Pagar si es compromiso */}
              {selectedPocketDetail.tipo === 'compromiso_fijo' && Number(selectedPocketDetail.saldo_actual) > 0 && !selectedPocketDetail.pagado_este_ciclo && (
                <button
                  onClick={() => setPayModalOpen(true)}
                  className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Pagar compromiso desde {selectedPocketDetail.cuenta_destino || 'cuenta'}</span>
                </button>
              )}

              {selectedPocketDetail.pagado_este_ciclo && (
                <button
                  onClick={() => handleResetPocketCycle(selectedPocketDetail.id)}
                  className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reiniciar ciclo para el próximo mes</span>
                </button>
              )}

              <button
                onClick={() => {
                  setExpenseForm({ pocketId: selectedPocketDetail.id, monto: '', nota: '' });
                  setExpenseModalOpen(true);
                }}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition"
              >
                <Minus className="w-4 h-4" />
                <span>Registrar gasto de este bolsillo</span>
              </button>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    setEditingPocket(selectedPocketDetail);
                    setPocketModalOpen(true);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </button>

                <button
                  onClick={() => handleDeletePocket(selectedPocketDetail.id)}
                  className="py-2.5 px-4 rounded-xl bg-rose-950/30 border border-rose-900/40 text-rose-400 hover:bg-rose-900/40 text-xs font-semibold flex items-center justify-center transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ENTRAR DINERO (REPARTO EN %) */}
      {/* ======================================================== */}
      {incomeModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 sm:p-6 space-y-4 shadow-2xl my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Entrar dinero</h3>
              <button onClick={() => setIncomeModalOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400">Monto ingresado ($)</label>
                <div className="relative mt-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                  <input
                    type="number"
                    value={incomingAmount}
                    onChange={(e) => setIncomingAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-8 pr-4 text-white font-bold text-xl focus:outline-none"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400">Concepto</label>
                  <input
                    type="text"
                    value={incomeSource}
                    onChange={(e) => setIncomeSource(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-2.5 text-xs text-white focus:outline-none mt-1"
                    placeholder="ej. Nómina, venta..."
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400">¿A qué cuenta entró?</label>
                  <select
                    value={incomeOriginAccount}
                    onChange={(e) => setIncomeOriginAccount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-2 text-xs text-white mt-1"
                  >
                    {COMMON_ACCOUNTS.map(acc => (
                      <option key={acc} value={acc}>{acc}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleAskAI}
                disabled={isAiLoading || incomingAmount <= 0}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.99] text-white text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {isAiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-slate-300" />}
                <span>{isAiLoading ? 'Calculando porcentajes...' : 'Sugerir reparto con IA'}</span>
              </button>

              {aiGeneralAdvice && (
                <div className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800/60 p-2.5 rounded-xl">
                  {aiGeneralAdvice}
                </div>
              )}

              <div className="flex items-center justify-between text-xs font-medium pt-1">
                <span className={isPercentageValid ? 'text-slate-300' : 'text-amber-400'}>
                  Total: {currentTotalPercentage.toFixed(1)}% de 100%
                </span>
                {!isPercentageValid && (
                  <button onClick={balanceToFreePocket} className="text-xs text-slate-400 hover:text-white underline">
                    Ajustar a Libre
                  </button>
                )}
              </div>

              {/* Sliders */}
              <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                {pockets.map(pocket => {
                  const pct = percentages[pocket.id] || 0;
                  const allocated = Math.round((pct / 100) * incomingAmount);

                  return (
                    <div key={pocket.id} className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 truncate pr-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: pocket.color }} />
                          <span className="font-semibold text-white truncate">{pocket.nombre}</span>
                          <span className="text-[10px] text-slate-400 bg-slate-900 px-1 py-0.2 rounded border border-slate-800">
                            {pocket.cuenta_destino || 'Bancolombia'}
                          </span>
                        </div>
                        <span className="font-semibold text-white flex-shrink-0">${allocated.toLocaleString('es-CO')} ({pct}%)</span>
                      </div>

                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={pct}
                        onChange={(e) => handleSliderChange(pocket.id, e.target.value)}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleConfirmAllocation}
                disabled={!isPercentageValid || incomingAmount <= 0}
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition mt-2 active:scale-[0.99]"
              >
                Confirmar reparto y ver traslados
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* HOJA DE TRASLADOS (CHECKLIST DE TRANSFERENCIAS INMEDIATAS) */}
      {/* ======================================================== */}
      {transfersSheetOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 sm:p-6 space-y-4 shadow-2xl my-6 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Guía de Traslados</h3>
              </div>
              <button onClick={() => setTransfersSheetOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              El dinero ingresó a <span className="font-bold text-white">{incomeOriginAccount}</span>. Haz estas transferencias en tus apps bancarias para dejar todo al día:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {pendingTransfers.map(tr => {
                const isChecked = Boolean(completedTransferIds[tr.id]);
                const isSameAccount = tr.cuentaDestino.toLowerCase() === incomeOriginAccount.toLowerCase();

                return (
                  <div 
                    key={tr.id}
                    onClick={() => setCompletedTransferIds(prev => ({ ...prev, [tr.id]: !prev[tr.id] }))}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isChecked 
                        ? 'bg-slate-950/30 border-slate-900 opacity-50 line-through' 
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      )}
                      <div>
                        <div className="text-xs font-semibold text-white">
                          {isSameAccount ? `Dejar en ${tr.cuentaDestino}` : `Pasar a ${tr.cuentaDestino}`}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Para {tr.pocketNombre}
                        </div>
                      </div>
                    </div>

                    <div className="font-bold text-xs text-emerald-400">
                      ${tr.monto.toLocaleString('es-CO')}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => {
                setTransfersSheetOpen(false);
                showToast('Transferencias completadas');
              }}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
            >
              Listo, cuentas al día
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: PAGAR COMPROMISO */}
      {/* ======================================================== */}
      {payModalOpen && selectedPocketDetail && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Pagar compromiso</h3>
              <button onClick={() => setPayModalOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>Vas a liquidar el compromiso <span className="font-bold text-white">{selectedPocketDetail.nombre}</span>.</p>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
                <span className="text-[11px] text-slate-400 block">Monto que sale</span>
                <span className="text-2xl font-black text-white">
                  ${Number(selectedPocketDetail.saldo_actual || 0).toLocaleString('es-CO')}
                </span>
                <span className="text-[11px] text-emerald-400 block font-medium">
                  Desde {selectedPocketDetail.cuenta_destino || 'Bancolombia'}
                </span>
              </div>

              <p className="text-[11px] text-slate-400">
                El bolsillo se vaciará a $0, se marcará como pagado y bajará de prioridad para este ciclo.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
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
              <button onClick={() => setExpenseModalOpen(false)} className="text-slate-400 hover:text-white p-1">
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
                      {p.nombre} (${Number(p.saldo_actual).toLocaleString('es-CO')}) - {p.cuenta_destino || 'Bancolombia'}
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
                  placeholder="ej. Gasolina en Terpel, Almuerzo..."
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
      {/* MODAL: CREAR / EDITAR BOLSILLO CON CUENTA BANCARIA */}
      {/* ======================================================== */}
      {pocketModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 sm:p-6 space-y-4 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">
                {editingPocket.id ? 'Editar bolsillo' : 'Nuevo bolsillo'}
              </h3>
              <button onClick={() => setPocketModalOpen(false)} className="text-slate-400 hover:text-white p-1">
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
                  placeholder="ej. Gasolina, Arriendo, YouTube..."
                  required
                />
              </div>

              {/* Cuenta o Destino Bancario */}
              <div>
                <label className="text-xs text-slate-400">¿A qué cuenta pasas esta plata?</label>
                <div className="flex gap-2 mt-1">
                  <select
                    value={editingPocket.cuenta_destino}
                    onChange={(e) => setEditingPocket(prev => ({ ...prev, cuenta_destino: e.target.value }))}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white"
                  >
                    {COMMON_ACCOUNTS.map(acc => (
                      <option key={acc} value={acc}>{acc}</option>
                    ))}
                    <option value="Otra">Otra cuenta...</option>
                  </select>
                </div>
                {editingPocket.cuenta_destino === 'Otra' && (
                  <input
                    type="text"
                    placeholder="Escribe el nombre de la cuenta..."
                    onChange={(e) => setEditingPocket(prev => ({ ...prev, cuenta_destino: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-white mt-1.5"
                  />
                )}
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

    </div>
  );
}
