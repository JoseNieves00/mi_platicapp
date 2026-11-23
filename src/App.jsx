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
  Square,
  Layers,
  Wallet,
  LogIn,
  LogOut,
  User as UserIcon,
  ArrowRight,
  Briefcase,
  Calendar,
  PieChart,
  Sliders,
  Percent,
  Clock,
  ChevronDown
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { suggestAllocationWithAI, analyzeFinancesWithAI } from './services/ai';
import { getPocketWeeklyMetrics, getSegmentedBalances, calculatePredefinedAllocation, calculateWeeklyTargetAllocation, checkAndResetMonthlyCycle } from './services/financialMath';
import { fetchPockets, savePocket, deletePocket, savePocketsBatch, clearAllLocalUserData, resetAllUserDataAndCloud } from './services/pockets';
import { fetchAccounts, saveAccount, deleteAccount } from './services/accounts';
import { getStoredConfig, saveStoredConfig } from './services/config';
import { signInWithGoogle, signOutUser, getCurrentUser, subscribeToAuthChanges } from './services/auth';

function GoogleIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

const COLOR_PALETTE = [
  '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', 
  '#F59E0B', '#EF4444', '#06B6D4', '#14B8A6'
];

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [pockets, setPockets] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'manage' | 'copilot' | 'history' | 'settings'
  const [manageSubTab, setManageSubTab] = useState('pockets'); // 'pockets' | 'accounts'
  const [balanceViewMode, setBalanceViewMode] = useState('categories'); // 'categories' | 'accounts'
  
  // Sheet de Detalle del Bolsillo (Inicio)
  const [selectedPocketDetail, setSelectedPocketDetail] = useState(null);

  // Modales
  const [incomeModalOpen, setIncomeModalOpen] = useState(false);
  const [transfersSheetOpen, setTransfersSheetOpen] = useState(false);
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [completedTransferIds, setCompletedTransferIds] = useState({});

  const [pocketModalOpen, setPocketModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [isResetting, setIsResetting] = useState(false);
  const [distributionModalOpen, setDistributionModalOpen] = useState(false);

  // Multi-Perfil y Espacios de Trabajo
  const [profilesList, setProfilesList] = useState(() => {
    try {
      const stored = localStorage.getItem('platicapp_profiles_list');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    const legacyBusiness = localStorage.getItem('platicapp_business_name');
    const legacyActive = localStorage.getItem('platicapp_active_profile');
    if (legacyBusiness || legacyActive === 'business') {
      return [
        { id: 'personal', name: localStorage.getItem('platicapp_personal_name') || 'Personal' },
        { id: 'business', name: legacyBusiness || 'Mi Empresa' }
      ];
    }
    return [
      { id: 'personal', name: localStorage.getItem('platicapp_personal_name') || 'Personal' }
    ];
  });
  const [activeProfile, setActiveProfile] = useState(() => localStorage.getItem('platicapp_active_profile') || 'personal');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [newProfileNameInput, setNewProfileNameInput] = useState('');
  const [showDiscardIncomeConfirm, setShowDiscardIncomeConfirm] = useState(false);

  const currentProfileName = useMemo(() => {
    const found = profilesList.find(p => p.id === activeProfile);
    return found ? found.name : 'Personal';
  }, [profilesList, activeProfile]);
  const personalProfileName = profilesList.find(p => p.id === 'personal')?.name || 'Personal';
  const businessProfileName = profilesList.find(p => p.id === 'business')?.name || 'Mi Empresa';

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
    es_compartido: false,
    porcentaje_objetivo: '',
    perfil: 'personal'
  });

  // Formulario Crear / Editar Cuenta Bancaria
  const [editingAccount, setEditingAccount] = useState({
    id: null,
    nombre: '',
    tipo: 'banco',
    color: '#3B82F6',
    perfil: 'personal'
  });

  // Formulario Gasto
  const [expenseForm, setExpenseForm] = useState({ pocketId: '', monto: '', nota: '' });

  // Historial
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('platicapp_history_real_v1') || '[]');
    } catch {
      return [];
    }
  });

  // Filtros de Movimientos
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');

  // Tip Inteligente en Inicio
  const [homeTip, setHomeTip] = useState(() => {
    return localStorage.getItem('platicapp_home_tip') || 'Separa tus fondos en las cuentas bancarias correspondientes apenas recibas ingresos para mantener tus compromisos protegidos.';
  });
  const [isRefreshingTip, setIsRefreshingTip] = useState(false);

  // Estados para "Entrar Dinero"
  const [incomingAmount, setIncomingAmount] = useState('');
  const [incomeSource, setIncomeSource] = useState('');
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
      text: 'Hola, soy tu copiloto. Puedo analizar la distribución de tus bolsillos, el saldo por cuenta bancaria y ayudarte a tomar mejores decisiones.'
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
    loadData();

    // Comprobar sesión de Google OAuth
    getCurrentUser().then(user => {
      if (user) {
        setCurrentUser(user);
        loadData();
      }
    });

    const { data: { subscription } } = subscribeToAuthChanges((user) => {
      setCurrentUser(user);
      if (user) {
        loadData();
      }
    });

    return () => {
      subscription?.unsubscribe?.();
    };
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setIsLoggingIn(true);
      await signInWithGoogle();
    } catch (err) {
      showToast(err.message || 'Error al conectar con Google');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOutUser();
      setCurrentUser(null);
      showToast('Sesión cerrada');
      loadData();
    } catch {
      showToast('Error al cerrar sesión');
    }
  };

  const handleExecuteFullReset = async () => {
    try {
      setIsResetting(true);
      await resetAllUserDataAndCloud();
      setPockets([]);
      setHistory([]);
      setResetModalOpen(false);
      setResetStep(1);
      showToast('App restablecida de fábrica');
      setTimeout(() => {
        window.location.reload();
      }, 400);
    } catch {
      showToast('Error al reiniciar datos');
    } finally {
      setIsResetting(false);
    }
  };

  const loadData = async () => {
    const [pocketsData, accountsData] = await Promise.all([
      fetchPockets(),
      fetchAccounts()
    ]);
    const { updated: refreshedPockets, hasChanges } = checkAndResetMonthlyCycle(pocketsData);
    if (hasChanges) {
      await savePocketsBatch(refreshedPockets);
    }
    setPockets(refreshedPockets);
    setAccounts(accountsData);
    if (accountsData.length > 0) {
      setIncomeOriginAccount(accountsData[0].nombre);
    }
    initializePercentages(refreshedPockets);
  };

  // Colecciones filtradas por perfil activo (Personal vs Empresa)
  const visiblePockets = useMemo(() => {
    return pockets.filter(p => (p.perfil || 'personal') === activeProfile);
  }, [pockets, activeProfile]);

  const visibleAccounts = useMemo(() => {
    return accounts.filter(a => (a.perfil || 'personal') === activeProfile);
  }, [accounts, activeProfile]);

  const visibleHistory = useMemo(() => {
    return history.filter(h => (h.perfil || 'personal') === activeProfile);
  }, [history, activeProfile]);

  const initializePercentages = (pocketList) => {
    const targetPockets = (pocketList || visiblePockets).filter(p => (p.perfil || 'personal') === activeProfile);
    if (!targetPockets || targetPockets.length === 0) return;
    const predefined = calculatePredefinedAllocation(100, targetPockets);
    setPercentages(predefined.percentages);
  };

  // Saldos segmentados: Libre vs En Bolsillos vs Total
  const { freeBalance, committedBalance, totalBalance } = useMemo(() => {
    return getSegmentedBalances(visiblePockets);
  }, [visiblePockets]);

  const currentTotalPercentage = Object.values(percentages).reduce((acc, val) => acc + Number(val || 0), 0);
  const isPercentageValid = Math.abs(currentTotalPercentage - 100) < 0.01;

  // Compromisos prioritarios / Próximos a vencer (< 7 días o con cuota pendiente)
  const urgentCommitments = useMemo(() => {
    return visiblePockets
      .filter(p => p.tipo === 'compromiso_fijo' && p.dia_vencimiento && !p.pagado_este_ciclo)
      .map(p => ({ ...p, metrics: getPocketWeeklyMetrics(p) }))
      .filter(p => p.metrics.daysLeft !== null && p.metrics.daysLeft <= 7)
      .sort((a, b) => a.metrics.daysLeft - b.metrics.daysLeft);
  }, [visiblePockets]);

  // Distribución del dinero por Categoría
  const distributionByCategory = useMemo(() => {
    if (totalBalance <= 0) return { compromisos: 0, diario: 0, reserva: 0, libre: 0 };
    let comp = 0, diario = 0, res = 0, lib = 0;
    visiblePockets.forEach(p => {
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
  }, [visiblePockets, totalBalance]);

  // Arqueo: Saldo agrupado por Cuenta Bancaria Física
  const balancesByAccount = useMemo(() => {
    const accountMap = {};
    visibleAccounts.forEach(a => {
      accountMap[a.nombre] = { ...a, amount: 0, pocketsList: [] };
    });

    visiblePockets.forEach(p => {
      const accName = p.cuenta_destino || 'Bancolombia';
      if (!accountMap[accName]) {
        accountMap[accName] = { id: `acc-custom-${accName}`, nombre: accName, tipo: 'cuenta', color: '#64748B', amount: 0, pocketsList: [] };
      }
      accountMap[accName].amount += Number(p.saldo_actual || 0);
      accountMap[accName].pocketsList.push(p);
    });

    return Object.values(accountMap).map(acc => ({
      ...acc,
      percentage: totalBalance > 0 ? Math.round((acc.amount / totalBalance) * 100) : 0
    })).sort((a, b) => b.amount - a.amount);
  }, [visiblePockets, visibleAccounts, totalBalance]);

  // Bolsillos ordenados para Inicio: los pagados bajan al final automáticamente
  const sortedPockets = useMemo(() => {
    return [...visiblePockets].sort((a, b) => {
      if (a.pagado_este_ciclo && !b.pagado_este_ciclo) return 1;
      if (!a.pagado_este_ciclo && b.pagado_este_ciclo) return -1;
      return 0;
    });
  }, [visiblePockets]);

  // Movimientos filtrados por perfil activo
  const filteredHistory = useMemo(() => {
    return visibleHistory.filter(item => {
      const matchesType = historyFilter === 'all' || item.tipo === historyFilter;
      const q = historySearch.toLowerCase().trim();
      const matchesSearch = !q || 
        (item.fuente && item.fuente.toLowerCase().includes(q)) ||
        (item.pocketNombre && item.pocketNombre.toLowerCase().includes(q)) ||
        (item.nota && item.nota.toLowerCase().includes(q)) ||
        (item.cuenta && item.cuenta.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [visibleHistory, historyFilter, historySearch]);

  const handleSliderChange = (pocketId, val) => {
    const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
    setPercentages(prev => ({ ...prev, [pocketId]: num }));
  };

  const handleSelectProfile = (profId) => {
    setActiveProfile(profId);
    localStorage.setItem('platicapp_active_profile', profId);
    setProfileModalOpen(false);
    showToast(`Cambiado a perfil: ${profilesList.find(p => p.id === profId)?.name || profId}`);
  };

  const handleCreateProfile = (e) => {
    e.preventDefault();
    const trimmed = newProfileNameInput.trim();
    if (!trimmed) return;
    const newId = `perfil_${Date.now()}`;
    const updated = [...profilesList, { id: newId, name: trimmed }];
    setProfilesList(updated);
    localStorage.setItem('platicapp_profiles_list', JSON.stringify(updated));
    setNewProfileNameInput('');
    setActiveProfile(newId);
    localStorage.setItem('platicapp_active_profile', newId);
    setProfileModalOpen(false);
    showToast(`Perfil "${trimmed}" creado`);
  };

  const handleDeleteProfile = (profId) => {
    if (profId === 'personal') {
      showToast('No puedes eliminar el perfil Personal principal');
      return;
    }
    const updated = profilesList.filter(p => p.id !== profId);
    setProfilesList(updated);
    localStorage.setItem('platicapp_profiles_list', JSON.stringify(updated));
    if (activeProfile === profId) {
      setActiveProfile('personal');
      localStorage.setItem('platicapp_active_profile', 'personal');
    }
    showToast('Perfil eliminado');
  };

  // Limpieza total del modal de entrar dinero para que no queden datos residuales
  const resetIncomingModal = () => {
    setIncomingAmount('');
    setIncomeSource('');
    setPercentages({});
    setAiReasonings({});
    setAiGeneralAdvice('');
    setShowDiscardIncomeConfirm(false);
    setIncomeModalOpen(false);
  };

  const handleOpenIncomeModal = () => {
    // Inicializar limpio con los porcentajes base de los bolsillos del perfil activo
    const predefined = calculatePredefinedAllocation(0, visiblePockets);
    setPercentages(predefined.percentages);
    setIncomingAmount('');
    setIncomeSource('');
    setAiReasonings({});
    setAiGeneralAdvice('');
    setShowDiscardIncomeConfirm(false);
    setIncomeModalOpen(true);
  };

  const handleRequestCloseIncomeModal = () => {
    if (incomingAmount && Number(incomingAmount) > 0) {
      setShowDiscardIncomeConfirm(true);
    } else {
      resetIncomingModal();
    }
  };

  const balanceToFreePocket = () => {
    const targetPockets = visiblePockets;
    const freePocket = targetPockets.find(p => p.tipo === 'libre') || 
                       targetPockets.find(p => p.nombre.toLowerCase().includes('libre')) ||
                       targetPockets.find(p => !p.porcentaje_objetivo) ||
                       targetPockets[0];
    if (!freePocket) {
      showToast('Crea un bolsillo para asignar el dinero');
      return;
    }

    const otherSum = Object.entries(percentages)
      .filter(([id]) => id !== freePocket.id && targetPockets.some(p => p.id === id))
      .reduce((acc, [, val]) => acc + Number(val || 0), 0);

    const needed = Math.max(0, Number((100 - otherSum).toFixed(1)));
    setPercentages(prev => ({
      ...prev,
      [freePocket.id]: needed
    }));
    showToast(`Restante (${needed}%) llevado a ${freePocket.nombre}`);
  };

  // Generar Tip inteligente para Inicio basado en datos reales
  const handleRefreshHomeTip = async () => {
    setIsRefreshingTip(true);
    try {
      const res = await analyzeFinancesWithAI({ 
        pockets: visiblePockets, 
        history: visibleHistory, 
        profile: activeProfile,
        profileName: currentProfileName,
        question: 'Dame un tip breve de 2 líneas sobre cómo dispersar o gestionar el dinero entre mis cuentas bancarias y bolsillos.' 
      });
      const tipText = res.tips?.[0] || res.resumen_ejecutivo;
      setHomeTip(tipText);
      localStorage.setItem('platicapp_home_tip', tipText);
    } finally {
      setIsRefreshingTip(false);
    }
  };

  // Sugerencia de Copiloto IA al repartir dinero (Urgencia, vencimiento y cuotas)
  const handleAskAI = async () => {
    if (!incomingAmount || incomingAmount <= 0) {
      showToast('Ingresa un monto para calcular con Copiloto');
      return;
    }
    setIsAiLoading(true);
    setAiError('');

    try {
      const result = await suggestAllocationWithAI({ incomingAmount, pockets: visiblePockets, note: incomeSource });
      const newPcts = {};
      const newReasons = {};
      result.reparto.forEach(item => {
        newPcts[item.pocket_id] = item.porcentaje;
        newReasons[item.pocket_id] = item.justificacion;
      });

      setPercentages(newPcts);
      setAiReasonings(newReasons);
      setAiGeneralAdvice(result.consejo_general || '');
      showToast('✨ Copiloto asignó prioridades');
    } catch {
      // Fallback local determinista y transparente
      const res = calculateWeeklyTargetAllocation(incomingAmount, visiblePockets);
      setPercentages(res.percentages);
      setAiGeneralAdvice('Reparto calculado por urgencia de vencimientos y cuotas pendientes.');
      showToast('✨ Asignado por urgencia de compromisos');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Confirmar y Guardar Reparto + HOJA DE TRASLADOS (Solo traslados físicos interbancarios)
  const handleConfirmAllocation = async () => {
    if (!isPercentageValid || incomingAmount <= 0) {
      showToast('Debes repartir el 100% exacto del dinero ingresado');
      return;
    }

    const allocationsSummary = [];
    const transfersGenerated = [];

    const updated = pockets.map(p => {
      const pocketProfile = p.perfil || 'personal';
      if (pocketProfile !== activeProfile) {
        return p;
      }

      const pct = percentages[p.id] || 0;
      const addedMoney = Math.round((pct / 100) * incomingAmount);
      const pocketAcc = (p.cuenta_destino || incomeOriginAccount || '').trim();
      
      allocationsSummary.push({ 
        pocketNombre: p.nombre, 
        cuenta: pocketAcc,
        porcentaje: pct, 
        monto: addedMoney 
      });

      // Solo generar traslado físico si la cuenta receptora del dinero es DISTINTA a la cuenta del bolsillo
      const originAcc = (incomeOriginAccount || '').trim();
      if (addedMoney > 0 && pocketAcc && originAcc && pocketAcc.toLowerCase() !== originAcc.toLowerCase()) {
        transfersGenerated.push({
          id: `tr-${p.id}-${Date.now()}`,
          pocketNombre: p.nombre,
          cuentaOrigen: originAcc,
          cuentaDestino: pocketAcc,
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
      perfil: activeProfile,
      fecha: new Date().toISOString(),
      detalles: allocationsSummary
    };
    const updatedHistory = [newHistoryEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('platicapp_history_real_v1', JSON.stringify(updatedHistory));

    confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
    resetIncomingModal();

    if (transfersGenerated.length > 0) {
      setPendingTransfers(transfersGenerated);
      setCompletedTransferIds({});
      setTransfersSheetOpen(true);
    } else {
      showToast('Ingreso repartido exitosamente en tus bolsillos');
    }
  };

  // Pagar compromiso y vaciar bolsillo con registro de mes
  const handleConfirmPayCommitment = async () => {
    if (!selectedPocketDetail) return;
    const paymentAmount = Number(selectedPocketDetail.saldo_actual || 0);
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const updated = pockets.map(p => {
      if (p.id === selectedPocketDetail.id) {
        return {
          ...p,
          saldo_actual: 0,
          pagado_este_ciclo: true,
          ultimo_pago_mes: currentMonth,
          ultimo_pago_fecha: new Date().toISOString()
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
      perfil: activeProfile,
      nota: `Compromiso liquidado desde ${selectedPocketDetail.cuenta_destino || 'cuenta'}`,
      fecha: new Date().toISOString()
    };
    const updatedHistory = [newHistoryEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('platicapp_history_real_v1', JSON.stringify(updatedHistory));

    setPayModalOpen(false);
    setSelectedPocketDetail(null);
    confetti({ particleCount: 30, spread: 50 });
    showToast(`${selectedPocketDetail.nombre} pagado`);
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
      perfil: activeProfile,
      nota: expenseForm.nota || 'Gasto registrado',
      prestamo: borrowed,
      fecha: new Date().toISOString()
    };
    const updatedHistory = [newHistoryEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('platicapp_history_real_v1', JSON.stringify(updatedHistory));

    setExpenseModalOpen(false);
    setSelectedPocketDetail(null);
    setExpenseForm({ pocketId: '', monto: '', nota: '' });
    showToast('Gasto registrado');
  };

  // Crear bolsillo con color aleatorio y cuenta por defecto
  const handleOpenNewPocketModal = () => {
    const randomColor = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
    const defaultAcc = visibleAccounts[0]?.nombre || 'Bancolombia';
    setEditingPocket({
      id: null,
      nombre: '',
      color: randomColor,
      tipo: 'compromiso_fijo',
      periodicidad: 'mensual',
      meta_monto: '',
      dia_vencimiento: '',
      dia_vencimiento_2: '',
      cuenta_destino: defaultAcc,
      saldo_actual: 0,
      pagado_este_ciclo: false,
      es_compartido: false,
      porcentaje_objetivo: '',
      perfil: activeProfile
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
      saldo_actual: parseFloat(editingPocket.saldo_actual) || 0,
      porcentaje_objetivo: editingPocket.porcentaje_objetivo !== '' && editingPocket.porcentaje_objetivo !== null ? parseFloat(editingPocket.porcentaje_objetivo) : null,
      perfil: editingPocket.perfil || activeProfile
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

  // Guardar Cuenta Bancaria
  const handleSaveAccount = async (e) => {
    e.preventDefault();
    if (!editingAccount.nombre.trim()) return;

    const updated = await saveAccount({
      ...editingAccount,
      perfil: editingAccount.perfil || activeProfile
    });
    setAccounts(updated);
    setAccountModalOpen(false);
    showToast('Cuenta bancaria guardada');
  };

  const handleDeleteAccount = async (id) => {
    if (!window.confirm('¿Eliminar esta cuenta bancaria? Los bolsillos asociados seguirán existiendo.')) return;
    const updated = await deleteAccount(id);
    setAccounts(updated);
    showToast('Cuenta eliminada');
  };

  // Copiloto: Análisis dinámico 100% real
  const handleRunCopilotAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await analyzeFinancesWithAI({ 
        pockets: visiblePockets, 
        history: visibleHistory,
        profile: activeProfile,
        profileName: activeProfile === 'business' ? businessProfileName : personalProfileName
      });
      setCopilotAnalysis(res);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Copiloto: Pregunta con contexto real
  const handleAskCopilotQuestion = async (e) => {
    e.preventDefault();
    if (!userQuestion.trim() || isAnswering) return;

    const q = userQuestion;
    setUserQuestion('');
    setChatMessages(prev => [...prev, { role: 'user', text: q }]);
    setIsAnswering(true);

    try {
      const res = await analyzeFinancesWithAI({ 
        pockets: visiblePockets, 
        history: visibleHistory, 
        question: q,
        profile: activeProfile,
        profileName: activeProfile === 'business' ? businessProfileName : personalProfileName
      });
      setChatMessages(prev => [
        ...prev, 
        { role: 'assistant', text: res.respuesta_copiloto || res.resumen_ejecutivo }
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
    const data = { pockets, accounts, history, exportedAt: new Date().toISOString() };
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
        if (parsed.accounts && Array.isArray(parsed.accounts)) {
          setAccounts(parsed.accounts);
          localStorage.setItem('platicapp_accounts_v1', JSON.stringify(parsed.accounts));
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
    <div className="w-full max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto min-h-screen pb-[max(7.5rem,calc(env(safe-area-inset-bottom,0px)+7rem))] px-4 sm:px-6 md:px-8 pt-6 sm:pt-8 flex flex-col font-sans text-slate-100 antialiased selection:bg-emerald-500 selection:text-slate-950 overflow-x-hidden">
      
      {/* TOAST FLOTANTE */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-slate-700/60 shadow-2xl px-5 py-2.5 rounded-full text-xs sm:text-sm font-medium text-slate-200 animate-apple-pop backdrop-blur-md">
          {toastMessage}
        </div>
      )}

      {/* HEADER LIMPIO Y RESPONSIVE */}
      <header className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-1.5">
              <span className="text-emerald-400">MI</span> Platicapp
            </h1>

            {/* Selector de perfil minimalista estilo Apple */}
            <button
              onClick={() => setProfileModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white hover:border-slate-700 transition active:scale-95 shadow-sm"
              title="Cambiar o crear perfil / espacio de trabajo"
            >
              <UserIcon className="w-3 h-3 text-emerald-400" />
              <span>{currentProfileName}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Bolsillos y cuentas en sincronía</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {currentUser ? (
            <button
              onClick={() => setActiveTab('settings')}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden border border-emerald-500/50 shadow-sm transition active:scale-95 flex-shrink-0"
              title={`Conectado como ${currentUser.user_metadata?.full_name || currentUser.email}`}
            >
              {currentUser.user_metadata?.avatar_url ? (
                <img 
                  src={currentUser.user_metadata.avatar_url} 
                  alt="Avatar" 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <div className="w-full h-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs sm:text-sm font-bold">
                  {(currentUser.email?.[0] || 'U').toUpperCase()}
                </div>
              )}
            </button>
          ) : (
            <button
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="px-3 sm:px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition active:scale-95 text-xs sm:text-sm flex items-center gap-2 font-medium"
              title="Iniciar sesión con Google"
            >
              <GoogleIcon className="w-4 h-4" />
              <span>Entrar</span>
            </button>
          )}

          <button 
            onClick={handleOpenNewPocketModal}
            className="p-2.5 sm:p-3 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition active:scale-95"
            title="Nuevo bolsillo"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 1. INICIO (HOME - OPERATIVO Y LIMPIO) */}
      {/* ======================================================== */}
      {activeTab === 'home' && (
        <div className="space-y-4 sm:space-y-5 animate-apple-in">
          
          {/* Card Resumen de Saldo */}
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-5 sm:p-7 relative overflow-hidden backdrop-blur-sm space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider font-bold text-emerald-400">Disponible Libre</span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">Gastable ya</span>
                </div>
                <div className="text-3xl sm:text-4xl md:text-5xl font-black text-white mt-1 tracking-tight">
                  ${freeBalance.toLocaleString('es-CO')}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
                  Tu dinero disponible para gastos diarios sin tocar compromisos
                </p>
              </div>

              {/* Selector de vista: Categorías vs Cuentas Bancarias */}
              <div className="flex p-1 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs sm:text-sm font-semibold flex-shrink-0">
                <button
                  onClick={() => setBalanceViewMode('categories')}
                  className={`py-1.5 px-3 rounded-xl transition ${
                    balanceViewMode === 'categories' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Tipo
                </button>
                <button
                  onClick={() => setBalanceViewMode('accounts')}
                  className={`py-1.5 px-3 rounded-xl transition ${
                    balanceViewMode === 'accounts' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Cuentas
                </button>
              </div>
            </div>

            {/* Métrica secundaria: Reservado en Bolsillos y Total General */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-[11px] text-slate-400 block font-medium">En Bolsillos</span>
                <span className="text-sm sm:text-base font-bold text-slate-200 mt-0.5 block">
                  ${committedBalance.toLocaleString('es-CO')}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-[11px] text-slate-400 block font-medium">Total en Cuentas</span>
                <span className="text-sm sm:text-base font-bold text-white mt-0.5 block">
                  ${totalBalance.toLocaleString('es-CO')}
                </span>
              </div>
            </div>

            {/* VISTA A: BARRA DE CATEGORÍAS */}
            {balanceViewMode === 'categories' && totalBalance > 0 && (
              <div className="space-y-2 pt-1 animate-in fade-in">
                <div 
                  onClick={() => setDistributionModalOpen(true)}
                  className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden flex cursor-pointer hover:opacity-90 transition"
                  title="Toca para ver desglose detallado"
                >
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

                <div className="flex items-center justify-between text-xs text-slate-400 pt-0.5 flex-wrap gap-2">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Fijos {distributionByCategory.compromisos}%</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Diario {distributionByCategory.diario}%</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Reserva {distributionByCategory.reserva}%</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500" /> Libre {distributionByCategory.libre}%</span>
                </div>

                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={() => setDistributionModalOpen(true)}
                    className="text-[11px] text-slate-400 hover:text-emerald-400 flex items-center gap-1.5 transition underline decoration-dotted"
                  >
                    <PieChart className="w-3.5 h-3.5" />
                    <span>Ver desglose detallado de porcentajes</span>
                  </button>
                </div>
              </div>
            )}

            {/* VISTA B: ARQUEO POR CUENTA BANCARIA REAL */}
            {balanceViewMode === 'accounts' && (
              <div className="space-y-2 pt-1 animate-apple-in">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs sm:text-sm">
                  {balancesByAccount.map(acc => (
                    <div key={acc.nombre} className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
                      <div className="truncate pr-1">
                        <span className="text-slate-400 text-xs block truncate">{acc.nombre}</span>
                        <span className="font-bold text-white text-xs sm:text-sm">${acc.amount.toLocaleString('es-CO')}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-400 bg-slate-900 px-2 py-0.5 rounded">
                        {acc.percentage}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs sm:text-sm text-slate-400">
              <span>{visiblePockets.length} bolsillos</span>
              <button
                onClick={() => {
                  setExpenseForm({ pocketId: visiblePockets[0]?.id || '', monto: '', nota: '' });
                  setExpenseModalOpen(true);
                }}
                className="text-xs sm:text-sm text-slate-300 hover:text-white flex items-center gap-1.5 transition active:scale-95"
              >
                <Minus className="w-4 h-4" /> Gasto rápido
              </button>
            </div>
          </div>

          {/* SECCIÓN: ATENCIÓN SEMANAL / COMPROMISOS PRÓXIMOS */}
          {urgentCommitments.length > 0 && (
            <div className="bg-slate-900/60 border border-amber-900/40 rounded-3xl p-4 sm:p-5 space-y-3 backdrop-blur-sm animate-apple-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <h3 className="font-bold text-xs sm:text-sm text-amber-300 uppercase tracking-wider">
                    Compromisos próximos ({urgentCommitments.length})
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">Atención esta semana</span>
              </div>

              <div className="space-y-2">
                {urgentCommitments.slice(0, 3).map(p => {
                  const m = p.metrics;
                  return (
                    <div 
                      key={p.id}
                      onClick={() => setSelectedPocketDetail(p)}
                      className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between cursor-pointer transition active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-2.5 truncate pr-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        <div className="truncate">
                          <span className="font-semibold text-xs sm:text-sm text-white block truncate">{p.nombre}</span>
                          <span className="text-[11px] text-slate-400">
                            {p.cuenta_destino || 'Bancolombia'} · Meta: ${m.meta.toLocaleString('es-CO')}
                          </span>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 space-y-0.5">
                        <span className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-md inline-block ${
                          m.daysLeft === 0 
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                            : (m.daysLeft <= 3 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-300')
                        }`}>
                          {m.daysLeft === 0 ? 'Vence hoy' : `Vence en ${m.daysLeft} días`}
                        </span>
                        <div className="text-[11px] text-slate-400">
                          {m.faltanteTotal > 0 ? `Faltan $${m.faltanteTotal.toLocaleString('es-CO')}` : '✓ Cubierto'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* WIDGET DEL TIP DE LA IA */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 backdrop-blur-sm relative">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-xs sm:text-sm">
              <span className="font-semibold text-slate-200 block mb-0.5">Tip del Copiloto</span>
              <p className="text-slate-400 leading-relaxed">{homeTip}</p>
            </div>
            <button
              onClick={handleRefreshHomeTip}
              disabled={isRefreshingTip}
              className="text-slate-500 hover:text-slate-300 transition p-1.5 active:scale-95"
              title="Actualizar tip"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingTip ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>

          {/* BOTÓN PRINCIPAL: ENTRAR DINERO */}
          <button
            onClick={handleOpenIncomeModal}
            className="w-full py-4 sm:py-4.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-bold text-sm sm:text-base shadow-sm flex items-center justify-center gap-2.5 transition-all duration-200"
          >
            <Plus className="w-5 h-5" />
            <span>Entrar dinero</span>
          </button>

          {/* LISTA DE BOLSILLOS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-400 px-1">
              <span>Tus bolsillos</span>
              <span>Saldo actual</span>
            </div>

            {sortedPockets.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8 sm:p-10 text-center space-y-4 backdrop-blur-sm">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
                  <Wallet className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-white text-base sm:text-lg">Tu espacio está listo para empezar</h3>
                  <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Crea tus bolsillos reales (ej. Arriendo, Servicios, Gasolina, Mercado) para comenzar a organizar tus ingresos.
                  </p>
                </div>
                <button
                  onClick={handleOpenNewPocketModal}
                  className="py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs sm:text-sm inline-flex items-center gap-2 transition active:scale-95 border border-slate-700/60"
                >
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span>Crear mi primer bolsillo</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                {sortedPockets.map(pocket => {
                  const m = getPocketWeeklyMetrics(pocket);
                  const isPaid = pocket.pagado_este_ciclo;

                  return (
                    <div 
                      key={pocket.id}
                      onClick={() => setSelectedPocketDetail(pocket)}
                      className={`border rounded-2xl p-4 sm:p-5 transition-all duration-200 cursor-pointer active:scale-[0.98] hover:border-slate-700/80 hover:shadow-md space-y-3 ${
                        isPaid 
                          ? 'bg-slate-950/30 border-slate-900/80 opacity-55 hover:opacity-90' 
                          : 'bg-slate-900/60 border-slate-800/70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: pocket.color }}
                          />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-sm sm:text-base text-white">{pocket.nombre}</h3>
                              
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60">
                                {pocket.cuenta_destino || 'Bancolombia'}
                              </span>

                              {pocket.porcentaje_objetivo > 0 && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  {pocket.porcentaje_objetivo}% fijo
                                </span>
                              )}

                              {isPaid && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  Pagado
                                </span>
                              )}
                            </div>

                            <div className="text-xs sm:text-sm text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                              <span className="capitalize">{pocket.periodicidad || 'Mensual'}</span>
                              {m.daysLeft !== null && (
                                <span className={m.daysLeft <= 3 ? 'text-amber-400 font-semibold' : 'text-slate-400'}>
                                  · {m.daysLeft === 0 ? 'Vence hoy' : `Vence en ${m.daysLeft} días (día ${pocket.dia_vencimiento})`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-bold text-sm sm:text-base text-white">
                            ${Number(pocket.saldo_actual || 0).toLocaleString('es-CO')}
                          </div>
                          {m.meta > 0 && (
                            <div className="text-xs text-slate-400 mt-0.5">
                              Meta: ${m.meta.toLocaleString('es-CO')}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Desglose Semanal */}
                      {m.meta > 0 && (
                        <div className="pt-1 border-t border-slate-800/40 flex items-center justify-between text-[11px] text-slate-400">
                          <span>Cuota semanal: <strong className="text-slate-300">${m.cuotaSemanal.toLocaleString('es-CO')}</strong></span>
                          <span>
                            {isPaid ? (
                              <span className="text-emerald-400 font-medium">✓ Pagado este ciclo</span>
                            ) : m.faltanteSemanal > 0 ? (
                              <span className="text-amber-400 font-medium">Falta ${m.faltanteSemanal.toLocaleString('es-CO')} esta semana</span>
                            ) : (
                              <span className="text-emerald-400 font-medium">✓ Cuota semanal cubierta</span>
                            )}
                          </span>
                        </div>
                      )}

                      {m.meta > 0 && (
                        <div className="w-full h-1.5 bg-slate-800/70 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500 ease-out"
                            style={{ 
                              width: `${m.porcentajeProgreso || 0}%`,
                              backgroundColor: isPaid ? '#10B981' : pocket.color 
                            }}
                          />
                        </div>
                      )}

                      {pocket.deuda_interna && pocket.deuda_interna.monto > 0 && (
                        <div className="text-xs text-amber-400 flex items-center gap-1.5 font-medium pt-0.5">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Debe ${pocket.deuda_interna.monto.toLocaleString('es-CO')} a {pocket.deuda_interna.lender_nombre || 'Libre'}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. GESTIÓN: CONFIGURACIÓN DE BOLSILLOS Y CUENTAS */}
      {/* ======================================================== */}
      {activeTab === 'manage' && (
        <div className="space-y-5 animate-apple-in">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">Bolsillos & Cuentas</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Configura tus bolsillos, compromisos y cuentas bancarias destino</p>
          </div>

          {/* Selector de Sub-Pestaña: Bolsillos vs Cuentas */}
          <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-2xl text-xs sm:text-sm font-semibold">
            <button
              onClick={() => setManageSubTab('pockets')}
              className={`flex-1 py-2 sm:py-2.5 rounded-xl transition ${
                manageSubTab === 'pockets' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Bolsillos ({visiblePockets.length})
            </button>
            <button
              onClick={() => setManageSubTab('accounts')}
              className={`flex-1 py-2 sm:py-2.5 rounded-xl transition ${
                manageSubTab === 'accounts' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Cuentas Bancarias ({visibleAccounts.length})
            </button>
          </div>

          {/* SUB-PESTAÑA A: GESTIÓN DE BOLSILLOS */}
          {manageSubTab === 'pockets' && (
            <div className="space-y-3.5 animate-apple-in">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm text-slate-400">Organiza metas y periodicidades</span>
                <button
                  onClick={handleOpenNewPocketModal}
                  className="py-2 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nuevo Bolsillo</span>
                </button>
              </div>

              {visiblePockets.length === 0 ? (
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 text-center text-xs sm:text-sm text-slate-400">
                  No hay bolsillos creados todavía en este perfil. Toca "Nuevo Bolsillo" para empezar.
                </div>
              ) : (
                <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3.5 md:space-y-0">
                  {visiblePockets.map(p => (
                    <div key={p.id} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between hover:border-slate-700/80 transition-all">
                      <div className="flex items-center gap-3 truncate pr-2">
                        <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        <div className="truncate">
                          <h4 className="font-bold text-xs sm:text-sm text-white truncate">{p.nombre}</h4>
                          <div className="text-xs text-slate-400 space-x-1.5 mt-0.5 truncate">
                            <span className="capitalize">{p.periodicidad || 'Mensual'}</span>
                            <span>· {p.cuenta_destino || 'Bancolombia'}</span>
                            {p.meta_monto > 0 && <span>· Meta: ${Number(p.meta_monto).toLocaleString('es-CO')}</span>}
                            {p.porcentaje_objetivo > 0 && <span className="text-emerald-400 font-semibold">· {p.porcentaje_objetivo}% fijo</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => {
                            setEditingPocket(p);
                            setPocketModalOpen(true);
                          }}
                          className="p-2 text-slate-400 hover:text-white rounded-lg transition active:scale-90"
                          title="Editar"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeletePocket(p.id)}
                          className="p-2 text-slate-400 hover:text-rose-400 rounded-lg transition active:scale-90"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUB-PESTAÑA B: GESTIÓN DE CUENTAS BANCARIAS */}
          {manageSubTab === 'accounts' && (
            <div className="space-y-3.5 animate-apple-in">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm text-slate-400">Cuentas donde vive tu dinero físico</span>
                <button
                  onClick={() => {
                    setEditingAccount({ id: null, nombre: '', tipo: 'banco', color: '#3B82F6', perfil: activeProfile });
                    setAccountModalOpen(true);
                  }}
                  className="py-2 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nueva Cuenta</span>
                </button>
              </div>

              <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3.5 md:space-y-0">
                {balancesByAccount.map(acc => (
                  <div key={acc.nombre} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-3 hover:border-slate-700/80 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-950 flex items-center justify-center border border-slate-800 text-emerald-400">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm sm:text-base text-white">{acc.nombre}</h4>
                          <span className="text-xs text-slate-400 capitalize">{acc.tipo || 'Cuenta'}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-sm sm:text-base text-white">${acc.amount.toLocaleString('es-CO')}</span>
                        <span className="text-xs text-slate-400 block font-medium">({acc.percentage}% del total)</span>
                      </div>
                    </div>

                    {/* Bolsillos asociados a esta cuenta */}
                    <div className="pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                      <div className="truncate pr-2">
                        <span>Bolsillos: </span>
                        <span className="text-slate-300 font-medium">
                          {acc.pocketsList?.length > 0 
                            ? acc.pocketsList.map(p => p.nombre).join(', ') 
                            : 'Ninguno asignado'}
                        </span>
                      </div>

                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => {
                            setEditingAccount(acc);
                            setAccountModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-white rounded active:scale-90"
                          title="Editar"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(acc.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded active:scale-90"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. COPILOTO FINANCIERO */}
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
      {/* 4. MOVIMIENTOS (CON FILTROS Y BÚSQUEDA) */}
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
      {/* 5. AJUSTES (PREFERENCIAS, MONEDA, RESPALDOS) */}
      {/* ======================================================== */}
      {activeTab === 'settings' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div>
            <h2 className="text-xl font-bold text-white">Ajustes del Sistema</h2>
            <p className="text-xs text-slate-400">Cuenta, preferencias, copia de seguridad y conexión</p>
          </div>

          {/* Tarjeta de Cuenta Google / Nube */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-3.5 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                  <span>Cuenta & Respaldo en la Nube</span>
                  {currentUser && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {currentUser 
                    ? 'Tus datos están sincronizados en Supabase.' 
                    : 'Inicia sesión con Google para respaldar tus bolsillos y compartirlos en pareja.'}
                </p>
              </div>
            </div>

            {currentUser ? (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80">
                <div className="flex items-center gap-3 truncate pr-2">
                  {currentUser.user_metadata?.avatar_url ? (
                    <img 
                      src={currentUser.user_metadata.avatar_url} 
                      alt="Avatar" 
                      className="w-10 h-10 rounded-full border border-slate-700" 
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                      {(currentUser.email?.[0] || 'U').toUpperCase()}
                    </div>
                  )}
                  <div className="truncate">
                    <span className="font-bold text-white text-xs block truncate">
                      {currentUser.user_metadata?.full_name || 'Usuario'}
                    </span>
                    <span className="text-[11px] text-slate-400 block truncate">
                      {currentUser.email}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-rose-400 hover:text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-800"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Salir</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 active:scale-[0.99] text-slate-900 font-bold text-xs flex items-center justify-center gap-2.5 transition shadow-sm"
              >
                <GoogleIcon className="w-4 h-4" />
                <span>{isLoggingIn ? 'Conectando con Google...' : 'Continuar con Google'}</span>
              </button>
            )}
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
              <p className="text-[11px] text-slate-400">Descarga o restaura tus bolsillos, cuentas y movimientos en cualquier momento.</p>

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

            {/* Configuración de Espacios y Perfiles */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-emerald-400" />
                    <span>Espacios de Trabajo y Perfiles</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Actualmente en: <strong className="text-white">{currentProfileName}</strong> ({profilesList.length} espacio{profilesList.length !== 1 ? 's' : ''})
                  </p>
                </div>
                <button
                  onClick={() => setProfileModalOpen(true)}
                  className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition active:scale-95 border border-slate-700/60"
                >
                  Gestionar
                </button>
              </div>
            </div>

            {/* Zona de Peligro / Restablecer de Fábrica */}
            <div className="bg-rose-950/20 border border-rose-900/40 rounded-3xl p-5 space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                  <h3 className="font-semibold text-xs text-rose-300 uppercase tracking-wider">Zona de Peligro</h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Borra permanentemente todos los bolsillos, cuentas y movimientos tanto locales como en Supabase para arrancar desde cero absoluto.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetStep(1);
                  setResetModalOpen(true);
                }}
                className="w-full py-2.5 px-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/80 text-rose-300 text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Restablecer app de fábrica</span>
              </button>
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
      {/* MENÚ INFERIOR (APPLE HIG - 5 PESTAÑAS RESPONSIVE & SAFE AREA INSETS) */}
      {/* ======================================================== */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-lg md:max-w-xl mx-auto bg-slate-950/95 backdrop-blur-2xl border-t border-slate-800/70 z-40 px-3 sm:px-6 pt-2 pb-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)+0.4rem))] md:py-2.5 flex items-center justify-around md:bottom-5 md:rounded-full md:border md:border-slate-800/80 md:shadow-2xl">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 py-1 px-2 transition-all active:scale-95 ${
            activeTab === 'home' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Home className="w-5 h-5 sm:w-5 sm:h-5" />
          <span className="text-[11px] sm:text-xs font-medium">Inicio</span>
        </button>

        <button
          onClick={() => setActiveTab('manage')}
          className={`flex flex-col items-center gap-1 py-1 px-2 transition-all active:scale-95 ${
            activeTab === 'manage' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wallet className="w-5 h-5 sm:w-5 sm:h-5" />
          <span className="text-[11px] sm:text-xs font-medium whitespace-nowrap">Bolsillos & Cuentas</span>
        </button>

        <button
          onClick={() => setActiveTab('copilot')}
          className={`flex flex-col items-center gap-1 py-1 px-2 transition-all active:scale-95 ${
            activeTab === 'copilot' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-5 h-5 sm:w-5 sm:h-5" />
          <span className="text-[11px] sm:text-xs font-medium">Copiloto</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 py-1 px-2 transition-all active:scale-95 ${
            activeTab === 'history' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-5 h-5 sm:w-5 sm:h-5" />
          <span className="text-[11px] sm:text-xs font-medium">Movimientos</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 py-1 px-2 transition-all active:scale-95 ${
            activeTab === 'settings' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <SettingsIcon className="w-5 h-5 sm:w-5 sm:h-5" />
          <span className="text-[11px] sm:text-xs font-medium">Ajustes</span>
        </button>
      </nav>

      {/* ======================================================== */}
      {/* SHEET: ACCIONES Y DETALLE DEL BOLSILLO */}
      {/* ======================================================== */}
      {selectedPocketDetail && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedPocketDetail(null);
          }}
        >
          <div className="bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-7 space-y-4 sm:space-y-5 shadow-2xl animate-apple-pop max-h-[92vh] flex flex-col overscroll-contain pb-safe">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: selectedPocketDetail.color }} />
                <div>
                  <h3 className="font-bold text-white text-base sm:text-lg">{selectedPocketDetail.nombre}</h3>
                  <span className="text-xs text-slate-400">Cuenta destino: {selectedPocketDetail.cuenta_destino || 'Bancolombia'}</span>
                </div>
              </div>
              <button onClick={() => setSelectedPocketDetail(null)} className="text-slate-400 hover:text-white p-2 active:scale-90 rounded-full hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain space-y-4 pr-0.5">
              <div className="bg-slate-950 border border-slate-800 p-4 sm:p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Saldo actual</span>
                  <span className="text-2xl sm:text-3xl font-black text-white">
                    ${Number(selectedPocketDetail.saldo_actual || 0).toLocaleString('es-CO')}
                  </span>
                </div>
                {selectedPocketDetail.meta_monto > 0 && (
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block font-medium">Meta mensual</span>
                    <span className="text-sm sm:text-base font-semibold text-slate-300">
                      ${Number(selectedPocketDetail.meta_monto).toLocaleString('es-CO')}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2.5 pt-1">
                {selectedPocketDetail.tipo === 'compromiso_fijo' && Number(selectedPocketDetail.saldo_actual) > 0 && !selectedPocketDetail.pagado_este_ciclo && (
                  <button
                    onClick={() => setPayModalOpen(true)}
                    className="w-full py-3.5 sm:py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Pagar compromiso desde {selectedPocketDetail.cuenta_destino || 'cuenta'}</span>
                  </button>
                )}

                {selectedPocketDetail.pagado_este_ciclo && (
                  <button
                    onClick={() => handleResetPocketCycle(selectedPocketDetail.id)}
                    className="w-full py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
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
                  className="w-full py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
                >
                  <Minus className="w-4 h-4" />
                  <span>Registrar gasto de este bolsillo</span>
                </button>

                <div className="flex gap-2.5 pt-1">
                  <button
                    onClick={() => {
                      setEditingPocket(selectedPocketDetail);
                      setPocketModalOpen(true);
                    }}
                    className="flex-1 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition active:scale-95"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Editar</span>
                  </button>

                  <button
                    onClick={() => handleDeletePocket(selectedPocketDetail.id)}
                    className="py-3 px-4 rounded-xl bg-rose-950/30 border border-rose-900/40 text-rose-400 hover:bg-rose-900/40 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Borrar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ENTRAR DINERO (DISEÑO BLINDADO HÍBRIDO % / $) */}
      {/* ======================================================== */}
      {incomeModalOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleRequestCloseIncomeModal();
            }
          }}
        >
          <div className="bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl max-h-[92vh] flex flex-col overscroll-contain animate-apple-pop relative pb-safe">
            
            {/* Confirmación de descarte de ingreso */}
            {showDiscardIncomeConfirm && (
              <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm z-30 rounded-t-3xl sm:rounded-3xl p-6 flex flex-col items-center justify-center text-center space-y-4 animate-apple-pop">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">¿Descartar este ingreso?</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Se perderán los montos y repartos que hayas ingresado.
                  </p>
                </div>
                <div className="flex gap-2 w-full max-w-xs pt-2">
                  <button
                    onClick={() => setShowDiscardIncomeConfirm(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700 transition active:scale-95"
                  >
                    Continuar editando
                  </button>
                  <button
                    onClick={resetIncomingModal}
                    className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white font-bold text-xs hover:bg-rose-400 transition active:scale-95 shadow-md shadow-rose-500/20"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}

            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base sm:text-lg">Entrar dinero</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {currentProfileName}
                </span>
              </div>
              <button 
                onClick={handleRequestCloseIncomeModal} 
                className="text-slate-400 hover:text-white p-2 active:scale-90 rounded-full hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cabecera de Monto y Cuenta (Fija, no scrollea) */}
            <div className="space-y-2.5 pt-2.5 flex-shrink-0">
              <div>
                <label className="text-[11px] sm:text-xs text-slate-400 font-medium">Monto ingresado ($)</label>
                <div className="relative mt-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400 font-bold text-lg">$</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={incomingAmount}
                    onChange={(e) => {
                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                      setIncomingAmount(val);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-8 pr-4 text-white font-black text-lg sm:text-xl focus:outline-none focus:border-emerald-500 transition"
                    placeholder="0"
                    autoFocus
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400 font-medium">Concepto</label>
                  <input
                    type="text"
                    value={incomeSource}
                    onChange={(e) => setIncomeSource(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-2.5 text-xs text-white focus:outline-none focus:border-slate-700 mt-0.5"
                    placeholder="ej. Salario, Pago..."
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 font-medium">Cuenta receptora</label>
                  <select
                    value={incomeOriginAccount}
                    onChange={(e) => setIncomeOriginAccount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-2 text-xs text-white mt-0.5"
                  >
                    {visibleAccounts.length === 0 ? (
                      <option value="Efectivo">Efectivo</option>
                    ) : (
                      visibleAccounts.map(acc => (
                        <option key={acc.id} value={acc.nombre}>{acc.nombre}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Botón Central Inteligente y Asignación Rápida a Libre */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={handleAskAI}
                  disabled={isAiLoading || !incomingAmount || incomingAmount <= 0}
                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-purple-900/40 to-slate-800 border border-purple-500/30 hover:border-purple-500/60 text-purple-200 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-[0.98] disabled:opacity-40"
                  title="Calcula automáticamente según urgencias de corte, metas y porcentajes base"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                  <span className="truncate">{isAiLoading ? 'Analizando...' : 'Repartir con Copiloto IA'}</span>
                </button>

                <button
                  type="button"
                  onClick={balanceToFreePocket}
                  className="py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] sm:text-xs font-semibold flex items-center gap-1 transition active:scale-[0.98] flex-shrink-0"
                  title="Asigna todo el porcentaje restante al bolsillo Libre"
                >
                  <Sliders className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span>Restante a Libre</span>
                </button>
              </div>

              {aiGeneralAdvice && (
                <div className="text-[11px] text-slate-300 bg-slate-950/70 border border-slate-800 p-2 rounded-xl">
                  {aiGeneralAdvice}
                </div>
              )}

              {/* Barra de progreso y validación 100% estricto */}
              <div className="space-y-1 pt-1 border-t border-slate-800/60">
                <div className="flex items-center justify-between text-[11px] sm:text-xs font-semibold">
                  <span className={isPercentageValid ? 'text-emerald-400' : currentTotalPercentage > 100 ? 'text-rose-400' : 'text-amber-400'}>
                    {isPercentageValid
                      ? '✓ 100% asignado exactamente'
                      : currentTotalPercentage > 100
                      ? `Excedido: ${(currentTotalPercentage - 100).toFixed(1)}%`
                      : `Falta asignar: ${(100 - currentTotalPercentage).toFixed(1)}%`}
                  </span>
                  <span className="text-slate-400">
                    ${Math.round((currentTotalPercentage / 100) * incomingAmount).toLocaleString('es-CO')} de ${incomingAmount.toLocaleString('es-CO')}
                  </span>
                </div>

                {!isPercentageValid && incomingAmount > 0 && (
                  <div className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-xl flex items-center justify-between">
                    <span className="truncate pr-1">
                      {currentTotalPercentage < 100
                        ? `Faltan $${Math.round(((100 - currentTotalPercentage) / 100) * incomingAmount).toLocaleString('es-CO')}`
                        : 'Suma supera el 100%'}
                    </span>
                    {currentTotalPercentage < 100 && (
                      <button
                        type="button"
                        onClick={balanceToFreePocket}
                        className="text-amber-300 font-bold underline flex-shrink-0"
                      >
                        Enviar a Libre
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Lista Scrolleable Independiente de Bolsillos con Doble Input (% y $) */}
            <div className="flex-1 overflow-y-auto overscroll-contain space-y-2 my-2.5 pr-1 max-h-[38vh] sm:max-h-[44vh]">
              {visiblePockets.map(pocket => {
                const pct = percentages[pocket.id] !== undefined ? percentages[pocket.id] : 0;
                const allocatedPesos = Math.round((pct / 100) * (incomingAmount || 0));
                const metrics = getPocketWeeklyMetrics(pocket);
                const isCommitment = pocket.tipo === 'compromiso_fijo' || pocket.meta_monto || pocket.dia_vencimiento;

                return (
                  <div key={pocket.id} className="bg-slate-950/70 border border-slate-800/70 rounded-2xl p-2.5 space-y-1.5">
                    {/* Fila superior de información */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 truncate pr-1">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: pocket.color }} />
                        <span className="font-bold text-white truncate text-xs">{pocket.nombre}</span>
                        <span className="text-[9px] text-slate-400 bg-slate-900 px-1 py-0.5 rounded border border-slate-800 truncate">
                          {pocket.cuenta_destino || 'Bancolombia'}
                        </span>
                        {pocket.porcentaje_objetivo > 0 && (
                          <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded font-semibold border border-emerald-500/20 flex-shrink-0">
                            {pocket.porcentaje_objetivo}% base
                          </span>
                        )}
                        {pocket.pagado_este_ciclo && (
                          <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded font-medium border border-emerald-500/20 flex-shrink-0">
                            ✓ Pagado
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Fila de compromiso: Cuánto falta en dinero y en días */}
                    {isCommitment && (
                      <div className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-900/50 px-2 py-0.5 rounded-lg border border-slate-800/40">
                        <div className="flex items-center gap-1 truncate">
                          {metrics.meta > 0 ? (
                            metrics.faltanteTotal > 0 ? (
                              <span>Falta <strong className="text-slate-200">${metrics.faltanteTotal.toLocaleString('es-CO')}</strong></span>
                            ) : (
                              <span className="text-emerald-400 font-medium">Meta cubierta</span>
                            )
                          ) : (
                            <span>Sin meta</span>
                          )}
                        </div>
                        {metrics.daysLeft !== null && (
                          <span className={metrics.daysLeft <= 3 ? 'text-amber-400 font-semibold' : 'text-slate-400'}>
                            {metrics.daysLeft === 0 ? '¡Vence hoy!' : `Vence en ${metrics.daysLeft}d (día ${pocket.dia_vencimiento})`}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Fila inferior: Inputs Híbridos (% y $) */}
                    <div className="flex items-center gap-2">
                      {/* Input Porcentaje */}
                      <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 flex-1 focus-within:border-emerald-500 transition">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          min="0"
                          max="100"
                          value={pct}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                            setPercentages(prev => ({ ...prev, [pocket.id]: val }));
                          }}
                          className="w-full bg-transparent text-white font-bold text-xs focus:outline-none"
                        />
                        <span className="text-slate-400 text-xs font-semibold pl-1">%</span>
                      </div>

                      {/* Input Pesos ($) */}
                      <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 flex-[1.4] focus-within:border-emerald-500 transition">
                        <span className="text-slate-400 text-xs font-semibold pr-1">$</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          step="1000"
                          min="0"
                          value={allocatedPesos}
                          onChange={(e) => {
                            const pesos = Math.max(0, parseFloat(e.target.value) || 0);
                            const calculatedPct = incomingAmount > 0 
                              ? Number(((pesos / incomingAmount) * 100).toFixed(1)) 
                              : 0;
                            setPercentages(prev => ({ ...prev, [pocket.id]: calculatedPct }));
                          }}
                          className="w-full bg-transparent text-white font-bold text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Fijo de Acción */}
            <div className="pt-2 border-t border-slate-800 flex-shrink-0">
              <button
                onClick={handleConfirmAllocation}
                disabled={!isPercentageValid || incomingAmount <= 0}
                className="w-full py-3 sm:py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed text-slate-950 font-bold text-xs sm:text-sm transition active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
              >
                <span>Confirmar reparto y ver traslados</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: GESTOR DE ESPACIOS Y PERFILES (ESTILO APPLE) */}
      {/* ======================================================== */}
      {profileModalOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setProfileModalOpen(false);
          }}
        >
          <div className="bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-sm sm:max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl animate-apple-pop pb-safe max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-emerald-400" />
                  <span>Espacios de Trabajo</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Cambia entre tu economía personal y tus negocios.
                </p>
              </div>
              <button onClick={() => setProfileModalOpen(false)} className="text-slate-400 hover:text-white p-2 active:scale-90 rounded-full hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista de Perfiles Existentes */}
            <div className="space-y-2 overflow-y-auto overscroll-contain flex-1 pr-1 max-h-56">
              {profilesList.map(prof => {
                const isActive = prof.id === activeProfile;
                return (
                  <div
                    key={prof.id}
                    className={`p-3 rounded-2xl border transition flex items-center justify-between ${
                      isActive 
                        ? 'bg-slate-800/80 border-emerald-500/40 shadow-sm' 
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <button
                      onClick={() => handleSelectProfile(prof.id)}
                      className="flex items-center gap-2.5 flex-1 text-left"
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${
                        isActive ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {prof.id === 'personal' ? '👤' : '🏢'}
                      </div>
                      <div>
                        <span className="font-semibold text-xs sm:text-sm text-white block">
                          {prof.name}
                        </span>
                        {isActive ? (
                          <span className="text-[10px] text-emerald-400 font-medium">Activo ahora</span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Toca para abrir</span>
                        )}
                      </div>
                    </button>

                    {prof.id !== 'personal' && (
                      <button
                        onClick={() => handleDeleteProfile(prof.id)}
                        className="text-slate-500 hover:text-rose-400 p-2 transition active:scale-90"
                        title="Eliminar este perfil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Formulario Crear Nuevo Perfil */}
            <form onSubmit={handleCreateProfile} className="pt-2 border-t border-slate-800 space-y-2 flex-shrink-0">
              <label className="text-xs text-slate-400 font-medium block">
                + Crear nuevo perfil o negocio
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProfileNameInput}
                  onChange={(e) => setNewProfileNameInput(e.target.value)}
                  placeholder="ej. Mi Tienda, Freelance, Empresa..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-slate-700"
                />
                <button
                  type="submit"
                  disabled={!newProfileNameInput.trim()}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition active:scale-95"
                >
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* HOJA DE TRASLADOS */}
      {/* ======================================================== */}
      {transfersSheetOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTransfersSheetOpen(false);
          }}
        >
          <div className="bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md sm:max-w-lg w-full p-5 sm:p-7 space-y-4 shadow-2xl max-h-[92vh] flex flex-col overscroll-contain animate-apple-pop pb-safe">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base sm:text-lg">Guía de Traslados</h3>
              </div>
              <button onClick={() => setTransfersSheetOpen(false)} className="text-slate-400 hover:text-white p-2 active:scale-90 rounded-full hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed flex-shrink-0">
              El dinero ingresó a <span className="font-bold text-white">{incomeOriginAccount}</span>. Haz estas transferencias en tus apps bancarias para dejar todo al día:
            </p>

            <div className="space-y-2.5 overflow-y-auto overscroll-contain flex-1 pr-1 max-h-64">
              {pendingTransfers.map(tr => {
                const isChecked = Boolean(completedTransferIds[tr.id]);
                const isSameAccount = tr.cuentaDestino.toLowerCase() === incomeOriginAccount.toLowerCase();

                return (
                  <div 
                    key={tr.id}
                    onClick={() => setCompletedTransferIds(prev => ({ ...prev, [tr.id]: !prev[tr.id] }))}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between active:scale-[0.99] ${
                      isChecked 
                        ? 'bg-slate-950/30 border-slate-900 opacity-50 line-through' 
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isChecked ? (
                        <CheckSquare className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      )}
                      <div>
                        <div className="text-xs sm:text-sm font-semibold text-white">
                          {isSameAccount ? `Dejar en ${tr.cuentaDestino}` : `Pasar a ${tr.cuentaDestino}`}
                        </div>
                        <div className="text-xs text-slate-400">
                          Para {tr.pocketNombre}
                        </div>
                      </div>
                    </div>

                    <div className="font-bold text-xs sm:text-sm text-emerald-400">
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
              className="w-full py-3.5 sm:py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition active:scale-[0.98] flex-shrink-0"
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
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPayModalOpen(false);
          }}
        >
          <div className="bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 sm:p-7 space-y-4 shadow-2xl animate-apple-pop pb-safe max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <h3 className="font-bold text-white text-base sm:text-lg">Pagar compromiso</h3>
              <button onClick={() => setPayModalOpen(false)} className="text-slate-400 hover:text-white p-2 active:scale-90 rounded-full hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs sm:text-sm text-slate-300 overflow-y-auto overscroll-contain flex-1 pr-0.5">
              <p>Vas a liquidar el compromiso <span className="font-bold text-white">{selectedPocketDetail.nombre}</span>.</p>

              <div className="bg-slate-950 border border-slate-800 p-4 sm:p-5 rounded-2xl text-center space-y-1">
                <span className="text-xs text-slate-400 block font-medium">Monto que sale</span>
                <span className="text-2xl sm:text-3xl font-black text-white">
                  ${Number(selectedPocketDetail.saldo_actual || 0).toLocaleString('es-CO')}
                </span>
                <span className="text-xs sm:text-sm text-emerald-400 block font-semibold mt-1">
                  Desde {selectedPocketDetail.cuenta_destino || 'Bancolombia'}
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                El bolsillo se vaciará a $0, se marcará como pagado y bajará de prioridad para este ciclo.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
                className="flex-1 py-3 sm:py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs sm:text-sm transition active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPayCommitment}
                className="flex-1 py-3 sm:py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition active:scale-95"
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 sm:p-7 space-y-4 shadow-2xl animate-apple-pop max-h-[92vh] flex flex-col pb-safe">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <h3 className="font-bold text-white text-base sm:text-lg">Registrar gasto</h3>
              <button 
                onClick={() => setExpenseModalOpen(false)} 
                className="text-slate-400 hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterExpense} className="space-y-4 overflow-y-auto overscroll-contain flex-1 pr-1">
              <div>
                <label className="text-xs sm:text-sm font-medium text-slate-300">Bolsillo</label>
                <select
                  value={expenseForm.pocketId}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, pocketId: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-3.5 text-xs sm:text-sm text-white focus:outline-none mt-1 min-h-[44px]"
                  required
                >
                  <option value="">Selecciona un bolsillo...</option>
                  {visiblePockets.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} (${Number(p.saldo_actual).toLocaleString('es-CO')}) - {p.cuenta_destino || 'Bancolombia'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs sm:text-sm font-medium text-slate-300">Monto del gasto ($)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={expenseForm.monto}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, monto: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-3.5 text-base sm:text-lg font-bold text-white focus:outline-none mt-1 min-h-[44px]"
                  placeholder="0"
                  required
                />
              </div>

              <div>
                <label className="text-xs sm:text-sm font-medium text-slate-300">Nota u observación</label>
                <input
                  type="text"
                  value={expenseForm.nota}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, nota: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm text-white focus:outline-none mt-1 min-h-[44px]"
                  placeholder="ej. Gasolina en Terpel, Almuerzo..."
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-slate-100 hover:bg-white text-slate-950 font-bold text-xs sm:text-sm transition mt-2 min-h-[44px] active:scale-[0.98]"
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md sm:max-w-lg w-full p-5 sm:p-7 space-y-4 sm:space-y-5 shadow-2xl max-h-[92vh] flex flex-col animate-apple-pop pb-safe">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <h3 className="font-bold text-white text-base sm:text-lg">
                {editingPocket.id ? 'Editar bolsillo' : 'Nuevo bolsillo'}
              </h3>
              <button 
                onClick={() => setPocketModalOpen(false)} 
                className="text-slate-400 hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePocket} className="space-y-4 overflow-y-auto overscroll-contain flex-1 pr-1">
              <div>
                <label className="text-xs sm:text-sm font-medium text-slate-300">Nombre del bolsillo</label>
                <input
                  type="text"
                  value={editingPocket.nombre}
                  onChange={(e) => setEditingPocket(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm text-white focus:outline-none mt-1 min-h-[44px]"
                  placeholder="ej. Gasolina, Arriendo, YouTube..."
                  required
                />
              </div>

              {/* Cuenta Bancaria Asignada */}
              <div>
                <label className="text-xs sm:text-sm font-medium text-slate-300">¿En qué cuenta bancaria vive esta plata?</label>
                <select
                  value={editingPocket.cuenta_destino}
                  onChange={(e) => setEditingPocket(prev => ({ ...prev, cuenta_destino: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm text-white mt-1 min-h-[44px]"
                >
                  {visibleAccounts.map(acc => (
                    <option key={acc.id} value={acc.nombre}>{acc.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs sm:text-sm font-medium text-slate-300">Tipo</label>
                  <select
                    value={editingPocket.tipo}
                    onChange={(e) => setEditingPocket(prev => ({ ...prev, tipo: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-xs sm:text-sm text-white mt-1 min-h-[44px]"
                  >
                    <option value="compromiso_fijo">Compromiso</option>
                    <option value="gasto_corriente">Gasto Diario</option>
                    <option value="ahorro">Ahorro</option>
                    <option value="reserva">Reserva</option>
                    <option value="libre">Libre</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs sm:text-sm font-medium text-slate-300">Periodicidad</label>
                  <select
                    value={editingPocket.periodicidad}
                    onChange={(e) => setEditingPocket(prev => ({ ...prev, periodicidad: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-xs sm:text-sm text-white mt-1 min-h-[44px]"
                  >
                    <option value="mensual">Mensual</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="semanal">Semanal</option>
                    <option value="libre">Libre</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs sm:text-sm font-medium text-slate-300">Día vencimiento</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="31"
                    value={editingPocket.dia_vencimiento}
                    onChange={(e) => setEditingPocket(prev => ({ ...prev, dia_vencimiento: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-xs sm:text-sm text-white mt-1 min-h-[44px]"
                    placeholder="ej. 15"
                  />
                </div>

                {editingPocket.periodicidad === 'quincenal' && (
                  <div>
                    <label className="text-xs sm:text-sm font-medium text-slate-300">2do vencimiento</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="31"
                      value={editingPocket.dia_vencimiento_2}
                      onChange={(e) => setEditingPocket(prev => ({ ...prev, dia_vencimiento_2: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-xs sm:text-sm text-white mt-1 min-h-[44px]"
                      placeholder="ej. 30"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs sm:text-sm font-medium text-slate-300">Meta periódica ($)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={editingPocket.meta_monto}
                  onChange={(e) => setEditingPocket(prev => ({ ...prev, meta_monto: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm text-white mt-1 min-h-[44px]"
                  placeholder="ej. 1200000"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs sm:text-sm font-medium text-slate-300">Porcentaje fijo por ingreso (%) - Opcional</label>
                  <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Híbrido</span>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  max="100"
                  value={editingPocket.porcentaje_objetivo || ''}
                  onChange={(e) => setEditingPocket(prev => ({ ...prev, porcentaje_objetivo: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm text-white mt-1 min-h-[44px]"
                  placeholder="ej. 10 para apartar el 10% de cada ingreso"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Si le pones 10%, cada vez que ingreses dinero este bolsillo apartará automáticamente su 10%.
                </p>
              </div>

              <div>
                <label className="text-xs sm:text-sm font-medium text-slate-300">Saldo actual ($)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={editingPocket.saldo_actual}
                  onChange={(e) => setEditingPocket(prev => ({ ...prev, saldo_actual: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm text-white mt-1 min-h-[44px]"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="text-xs sm:text-sm font-medium text-slate-300 block mb-1.5">Color</label>
                <div className="flex gap-2.5 flex-wrap">
                  {COLOR_PALETTE.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditingPocket(prev => ({ ...prev, color: c }))}
                      className={`w-8 h-8 rounded-full transition ${editingPocket.color === c ? 'scale-125 ring-2 ring-white' : 'opacity-60 hover:opacity-100'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-2 pb-1">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition min-h-[44px] active:scale-[0.98]"
                >
                  {editingPocket.id ? 'Guardar cambios' : 'Crear bolsillo'}
                </button>

                {editingPocket.id && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = editingPocket.id;
                      setPocketModalOpen(false);
                      handleDeletePocket(id);
                    }}
                    className="w-full py-3 rounded-xl bg-rose-950/30 hover:bg-rose-900/40 border border-rose-900/40 text-rose-400 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition min-h-[44px] active:scale-[0.98]"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Borrar este bolsillo</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CREAR / EDITAR CUENTA BANCARIA */}
      {/* ======================================================== */}
      {accountModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 sm:p-7 space-y-4 shadow-2xl animate-apple-pop max-h-[90vh] flex flex-col pb-safe">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <h3 className="font-bold text-white text-base sm:text-lg">
                {editingAccount.id ? 'Editar Cuenta' : 'Nueva Cuenta Bancaria'}
              </h3>
              <button 
                onClick={() => setAccountModalOpen(false)} 
                className="text-slate-400 hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-4 overflow-y-auto overscroll-contain flex-1 pr-1">
              <div>
                <label className="text-xs sm:text-sm font-medium text-slate-300">Nombre de la cuenta o app</label>
                <input
                  type="text"
                  value={editingAccount.nombre}
                  onChange={(e) => setEditingAccount(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm text-white focus:outline-none mt-1 min-h-[44px]"
                  placeholder="ej. Nequi, Bancolombia, Nu, Lulo..."
                  required
                />
              </div>

              <div>
                <label className="text-xs sm:text-sm font-medium text-slate-300">Tipo de cuenta</label>
                <select
                  value={editingAccount.tipo}
                  onChange={(e) => setEditingAccount(prev => ({ ...prev, tipo: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm text-white mt-1 min-h-[44px]"
                >
                  <option value="banco">Cuenta de Ahorros / Corriente</option>
                  <option value="billetera">Billetera Digital (Nequi, Daviplata)</option>
                  <option value="tarjeta">Tarjeta Débito / Virtual</option>
                  <option value="efectivo">Efectivo en mano</option>
                </select>
              </div>

              <div className="space-y-2 pt-2 pb-1">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition min-h-[44px] active:scale-[0.98]"
                >
                  {editingAccount.id ? 'Guardar Cambios' : 'Crear Cuenta'}
                </button>

                {editingAccount.id && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = editingAccount.id;
                      setAccountModalOpen(false);
                      handleDeleteAccount(id);
                    }}
                    className="w-full py-3 rounded-xl bg-rose-950/30 hover:bg-rose-900/40 border border-rose-900/40 text-rose-400 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition min-h-[44px] active:scale-[0.98]"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Borrar esta cuenta</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: DESGLOSE DETALLADO DE PORCENTAJES Y PATRIMONIO */}
      {/* ======================================================== */}
      {distributionModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-7 space-y-4 shadow-2xl animate-apple-pop max-h-[92vh] flex flex-col pb-safe">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <div>
                <h3 className="font-bold text-white text-base sm:text-lg flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-emerald-400" />
                  <span>Distribución Patrimonial</span>
                </h3>
                <span className="text-xs text-slate-400">
                  Espacio: {activeProfile === 'business' ? businessProfileName : personalProfileName}
                </span>
              </div>
              <button 
                onClick={() => setDistributionModalOpen(false)} 
                className="text-slate-400 hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto overscroll-contain flex-1 pr-1">
              {/* Resumen de los 3 saldos */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-medium">Libre</span>
                  <span className="text-xs sm:text-sm font-bold text-emerald-400 mt-0.5 block truncate">
                    ${freeBalance.toLocaleString('es-CO')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {totalBalance > 0 ? Math.round((freeBalance / totalBalance) * 100) : 0}%
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-medium">Bolsillos</span>
                  <span className="text-xs sm:text-sm font-bold text-slate-300 mt-0.5 block truncate">
                    ${committedBalance.toLocaleString('es-CO')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {totalBalance > 0 ? Math.round((committedBalance / totalBalance) * 100) : 0}%
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-medium">Total</span>
                  <span className="text-xs sm:text-sm font-bold text-white mt-0.5 block truncate">
                    ${totalBalance.toLocaleString('es-CO')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">100%</span>
                </div>
              </div>

              {/* Desglose por Categoría */}
              <div className="space-y-2 pt-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block px-1">
                  Por Categoría
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-2 rounded-full bg-rose-500" /> Fijos</span>
                    <span className="font-bold text-white">{distributionByCategory.compromisos}%</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Diario</span>
                    <span className="font-bold text-white">{distributionByCategory.diario}%</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-2 rounded-full bg-blue-500" /> Reserva</span>
                    <span className="font-bold text-white">{distributionByCategory.reserva}%</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-2 rounded-full bg-purple-500" /> Libre</span>
                    <span className="font-bold text-white">{distributionByCategory.libre}%</span>
                  </div>
                </div>
              </div>

              {/* Desglose por Bolsillo */}
              <div className="space-y-2 pt-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block px-1">
                  Participación por Bolsillo
                </span>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {visiblePockets.map(pocket => {
                    const saldo = Number(pocket.saldo_actual || 0);
                    const sharePct = totalBalance > 0 ? Number(((saldo / totalBalance) * 100).toFixed(1)) : 0;
                    const metrics = getPocketWeeklyMetrics(pocket);

                    return (
                      <div key={pocket.id} className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
                        <div className="flex items-center gap-2.5 truncate pr-2">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: pocket.color }} />
                          <div className="truncate">
                            <span className="font-semibold text-xs sm:text-sm text-white block truncate">{pocket.nombre}</span>
                            <span className="text-[10px] text-slate-400">
                              {pocket.cuenta_destino || 'Bancolombia'}
                              {pocket.porcentaje_objetivo > 0 && ` · ${pocket.porcentaje_objetivo}% fijo`}
                            </span>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <span className="font-bold text-xs sm:text-sm text-white block">
                            ${saldo.toLocaleString('es-CO')}
                          </span>
                          <span className="text-[11px] text-emerald-400 font-semibold">
                            {sharePct}% del total
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              onClick={() => setDistributionModalOpen(false)}
              className="w-full py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs sm:text-sm transition mt-2 min-h-[44px] flex-shrink-0"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DOBLE CONFIRMACIÓN: RESTABLECER DE FÁBRICA */}
      {/* ======================================================== */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-rose-900/40 rounded-t-3xl sm:rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 pb-safe">
            <button
              onClick={() => {
                setResetModalOpen(false);
                setResetStep(1);
              }}
              className="absolute top-4 right-4 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            {resetStep === 1 ? (
              <div className="space-y-4 pt-1">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Paso 1 de 2: Confirmación</div>
                  <h3 className="text-lg font-bold text-white mt-1">¿Restablecer datos de fábrica?</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Esta acción eliminará de forma permanente todos tus bolsillos, cuentas bancarias e historial de movimientos tanto en este dispositivo como en la nube Supabase.
                  </p>
                </div>

                <div className="bg-slate-950/60 rounded-2xl p-3.5 border border-slate-800 text-[11px] text-slate-300 space-y-1.5">
                  <div className="flex items-center gap-2 text-rose-300">
                    <span>⚠️</span>
                    <span>Se limpiarán todos los bolsillos y saldos a cero</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span>🔒</span>
                    <span>Tus llaves de API y configuración se conservarán</span>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetModalOpen(false)}
                    className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetStep(2)}
                    className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <span>Continuar</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-1">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Paso 2 de 2: Confirmación Definitiva</div>
                  <h3 className="text-lg font-bold text-white mt-1">¿Estás completamente seguro?</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    No habrá vuelta atrás. Tu aplicación quedará en $0 y sin bolsillos para que configures tus finanzas reales desde cero.
                  </p>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetStep(1)}
                    disabled={isResetting}
                    className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
                  >
                    Atrás
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteFullReset}
                    disabled={isResetting}
                    className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-lg shadow-rose-950/50"
                  >
                    {isResetting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Borrando...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Sí, restablecer todo</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
