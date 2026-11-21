-- ==============================================================================
-- MI PLATICAPP - SCHEMA DEFINITIVO PARA SUPABASE (POSTGRESQL)
-- ==============================================================================
-- Copia y pega este contenido en el SQL Editor de tu proyecto en Supabase
-- (https://supabase.com/dashboard/project/_/sql)

-- 1. Extensión para UUIDs (normalmente ya activa en Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabla de Bolsillos (Pockets)
CREATE TABLE IF NOT EXISTS public.pockets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    color TEXT DEFAULT '#10B981',
    icono TEXT DEFAULT 'wallet',
    tipo TEXT CHECK (tipo IN ('compromiso_fijo', 'gasto_corriente', 'ahorro', 'reserva', 'libre')) DEFAULT 'gasto_corriente',
    meta_monto NUMERIC(14,2) DEFAULT NULL,
    dia_vencimiento INTEGER CHECK (dia_vencimiento BETWEEN 1 AND 31) DEFAULT NULL,
    saldo_actual NUMERIC(14,2) DEFAULT 0,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de Ingresos (Incomes)
CREATE TABLE IF NOT EXISTS public.incomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    fuente TEXT,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Asignaciones de cada Ingreso en Porcentajes y Pesos (Allocations)
CREATE TABLE IF NOT EXISTS public.allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    income_id UUID REFERENCES public.incomes(id) ON DELETE CASCADE,
    pocket_id UUID REFERENCES public.pockets(id) ON DELETE RESTRICT,
    porcentaje NUMERIC(5,2) NOT NULL CHECK (porcentaje >= 0 AND porcentaje <= 100),
    monto NUMERIC(14,2) NOT NULL CHECK (monto >= 0),
    sugerido_por_ia BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Gastos por Bolsillo (Expenses)
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    pocket_id UUID REFERENCES public.pockets(id) ON DELETE RESTRICT,
    monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    categoria TEXT,
    nota TEXT,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Transferencias / Rebalanceos entre Bolsillos (Transfers)
CREATE TABLE IF NOT EXISTS public.transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    from_pocket_id UUID REFERENCES public.pockets(id) ON DELETE RESTRICT,
    to_pocket_id UUID REFERENCES public.pockets(id) ON DELETE RESTRICT,
    monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    motivo TEXT,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Historial de Auditoría de IA y Consejos
CREATE TABLE IF NOT EXISTS public.ai_allocation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    income_id UUID REFERENCES public.incomes(id) ON DELETE SET NULL,
    monto_ingreso NUMERIC(14,2) NOT NULL,
    propuesta_ia JSONB NOT NULL,
    reparto_aplicado JSONB NOT NULL,
    explicacion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Chat del Asesor Financiero LLM
CREATE TABLE IF NOT EXISTS public.chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    rol TEXT CHECK (rol IN ('user', 'assistant')),
    mensaje TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- SEGURIDAD: ROW LEVEL SECURITY (RLS)
-- Cada usuario solo puede ver y modificar sus propios datos
-- ==============================================================================

ALTER TABLE public.pockets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_allocation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura/escritura basadas en el usuario autenticado
CREATE POLICY "Users can manage their own pockets" ON public.pockets
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own incomes" ON public.incomes
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own allocations" ON public.allocations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.incomes 
            WHERE incomes.id = allocations.income_id 
            AND incomes.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage their own expenses" ON public.expenses
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own transfers" ON public.transfers
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own ai logs" ON public.ai_allocation_logs
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own chat history" ON public.chat_history
    FOR ALL USING (auth.uid() = user_id);

-- ==============================================================================
-- BUNDLE DE BOLSILOS POR DEFECTO AL CREAR UN NUEVO USUARIO
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_pockets()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.pockets (user_id, nombre, color, tipo, meta_monto, dia_vencimiento)
    VALUES
        (NEW.id, 'Arriendo / Vivienda', '#EF4444', 'compromiso_fijo', 1200000, 30),
        (NEW.id, 'Servicios Públicos', '#F59E0B', 'compromiso_fijo', 250000, 15),
        (NEW.id, 'Mercado & Comida', '#10B981', 'gasto_corriente', 600000, NULL),
        (NEW.id, 'Colchón de Reserva', '#3B82F6', 'reserva', 2000000, NULL),
        (NEW.id, 'Libre / Ocio', '#8B5CF6', 'libre', NULL, NULL);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger automático al registrarse
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_pockets();
