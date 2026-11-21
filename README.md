# 💰 MI Platicapp

App de finanzas personales por **bolsillos y porcentajes dinámicos** asistida por IA (Google Gemini) y con persistencia en **Supabase**.

---

## 🚀 Inicio Rápido

### 1. Configurar Credenciales (.env)
Abre el archivo [`.env`](file:///Users/josenieves/Documents/DEV/MI%20Platicapp/.env) en la raíz del proyecto y completa tus claves:

```env
# SUPABASE (https://supabase.com/dashboard/project/_/settings/api)
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui

# GEMINI AI (https://aistudio.google.com/app/apikey)
VITE_GEMINI_API_KEY=tu-gemini-api-key-aqui
```

### 2. Crear las Tablas en Supabase
1. Ingresa a tu panel en [Supabase](https://supabase.com).
2. Ve a **SQL Editor**.
3. Abre el archivo [`supabase/schema.sql`](file:///Users/josenieves/Documents/DEV/MI%20Platicapp/supabase/schema.sql), copia todo su contenido y ejecútalo con **Run**.

### 3. Iniciar el Servidor de Desarrollo
```bash
npm run dev
```

Abre `http://localhost:5173` en tu navegador o celular en la misma red local.

---

## 🎯 Filosofía del Proyecto

A diferencia de las apps de presupuesto mensual rígido tradicional:
1. **Flujo por Evento:** Cada vez que entra dinero, se toma una decisión de reparto en **porcentajes (%)**.
2. **IA Asignadora (Gemini 2.5 Flash):** Analiza el saldo de tus bolsillos, los días que faltan para los compromisos fijos y te propone la distribución óptima sumando 100%.
3. **Control Total:** Ajustas los sliders de porcentaje con sincronización instantánea en pesos.
4. **Trazabilidad en Supabase:** Cada ingreso y asignación queda guardado de forma inmutable.
