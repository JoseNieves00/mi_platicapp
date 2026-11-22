-- ==============================================================================
-- MI PLATICAPP - SCHEMA DEFINITIVO DESDE CERO (SUPABASE / POSTGRESQL)
-- ==============================================================================
-- Copia y pega este contenido en el SQL Editor de tu proyecto en Supabase
-- (https://supabase.com/dashboard/project/_/sql)

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Limpieza previa total (para poder re-ejecutar sin errores)
DROP TABLE IF EXISTS public.pocket_members CASCADE;
DROP TABLE IF EXISTS public.chat_history CASCADE;
DROP TABLE IF EXISTS public.ai_allocation_logs CASCADE;
DROP TABLE IF EXISTS public.transfers CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.allocations CASCADE;
DROP TABLE IF EXISTS public.incomes CASCADE;
DROP TABLE IF EXISTS public.pockets CASCADE;
DROP TABLE IF EXISTS public.accounts CASCADE;

-- ==============================================================================
-- TABLAS PRINCIPALES
-- ==============================================================================

-- 3. Tabla de Cuentas Bancarias Reales (Accounts)
CREATE TABLE public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    tipo TEXT DEFAULT 'banco', -- banco, billetera, tarjeta, efectivo
    color TEXT DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de Bolsillos (Pockets)
CREATE TABLE public.pockets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    color TEXT DEFAULT '#10B981',
    icono TEXT DEFAULT 'wallet',
    tipo TEXT CHECK (tipo IN ('compromiso_fijo', 'gasto_corriente', 'ahorro', 'reserva', 'libre')) DEFAULT 'compromiso_fijo',
    periodicidad TEXT CHECK (periodicidad IN ('mensual', 'quincenal', 'semanal', 'libre')) DEFAULT 'mensual',
    meta_monto NUMERIC(14,2) DEFAULT NULL,
    dia_vencimiento INTEGER CHECK (dia_vencimiento BETWEEN 1 AND 31) DEFAULT NULL,
    dia_vencimiento_2 INTEGER CHECK (dia_vencimiento_2 BETWEEN 1 AND 31) DEFAULT NULL,
    saldo_actual NUMERIC(14,2) DEFAULT 0,
    pagado_este_ciclo BOOLEAN DEFAULT false,
    cuenta_destino TEXT DEFAULT 'Bancolombia', -- Nequi, Bancolombia, Daviplata, Tarjeta Virtual, Efectivo, etc.
    deuda_interna JSONB DEFAULT NULL, -- { pocket_id, lender_nombre, monto }
    
    -- Soporte para Finanzas en Pareja / Compartidas
    es_compartido BOOLEAN DEFAULT false,
    codigo_invitacion TEXT UNIQUE DEFAULT NULL,

    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Miembros de Bolsillos Compartidos (Finanzas en Pareja)
CREATE TABLE public.pocket_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pocket_id UUID REFERENCES public.pockets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    rol TEXT CHECK (rol IN ('dueno', 'miembro')) DEFAULT 'miembro',
    alias TEXT NOT NULL, -- ej. "Jose", "Aleja"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pocket_id, user_id)
);

-- 5. Tabla de Ingresos (Incomes)
CREATE TABLE public.incomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    fuente TEXT,
    cuenta_origen TEXT DEFAULT 'Cuenta Principal',
    fecha TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Asignaciones de cada Ingreso en Porcentajes y Pesos (Allocations)
CREATE TABLE public.allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    income_id UUID REFERENCES public.incomes(id) ON DELETE CASCADE,
    pocket_id UUID REFERENCES public.pockets(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    porcentaje NUMERIC(5,2) NOT NULL CHECK (porcentaje >= 0 AND porcentaje <= 100),
    monto NUMERIC(14,2) NOT NULL CHECK (monto >= 0),
    sugerido_por_ia BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Gastos por Bolsillo (Expenses)
CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    pocket_id UUID REFERENCES public.pockets(id) ON DELETE RESTRICT,
    monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    categoria TEXT,
    nota TEXT,
    cuenta_usada TEXT,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Transferencias Internas / Rebalanceos
CREATE TABLE public.transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    from_pocket_id UUID REFERENCES public.pockets(id) ON DELETE RESTRICT,
    to_pocket_id UUID REFERENCES public.pockets(id) ON DELETE RESTRICT,
    monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    motivo TEXT,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Chat del Copiloto Financiero con IA
CREATE TABLE public.chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    rol TEXT CHECK (rol IN ('user', 'assistant')),
    mensaje TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- SEGURIDAD: ROW LEVEL SECURITY (RLS)
-- Soporta bolsillos personales y compartidos entre parejas
-- ==============================================================================

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pockets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pocket_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

-- Políticas de Cuentas
CREATE POLICY "Users can manage own accounts" ON public.accounts
    FOR ALL USING (auth.uid() = user_id);

-- 1. Pocket members: acceso directo por user_id (evita recursión infinita de políticas)
CREATE POLICY "Users can view and manage pocket members" ON public.pocket_members
    FOR ALL USING (auth.uid() = user_id);

-- 2. Pockets: El dueño o cualquier miembro del bolsillo compartido puede ver y modificar
CREATE POLICY "Users can manage own pockets or shared members" ON public.pockets
    FOR ALL USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM public.pocket_members 
            WHERE pocket_members.pocket_id = pockets.id 
            AND pocket_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage own incomes" ON public.incomes
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage allocations" ON public.allocations
    FOR ALL USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM public.incomes 
            WHERE incomes.id = allocations.income_id 
            AND incomes.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage expenses" ON public.expenses
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage transfers" ON public.transfers
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage chat history" ON public.chat_history
    FOR ALL USING (auth.uid() = user_id);
