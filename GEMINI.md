# REGLAS DEL PROYECTO: MI PLATICAPP

## 1. Protección Estricta del Entorno de Producción y Datos Reales
- **Zero Mockups o Datos Falsos en Producción:** Nunca sobreescribir, inyectar datos de prueba o alterar las tablas de la base de datos (`Supabase`) con datos ficticios. Los bolsillos, cuentas, ingresos y gastos ingresados por el usuario son reales y sagrados.
- **Migraciones No Destructivas:** Está estrictamente prohibido ejecutar `DROP TABLE` o alterar tablas en caliente de forma destructiva. Cualquier cambio en la base de datos debe ser incremental y seguro (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
- **Seguridad de Variables y Credenciales:** El archivo `.env` con credenciales de producción jamás debe comprometerse en Git. La plantilla pública para desarrolladores es `.env.example`.
- **Aislamiento por Usuario (RLS):** Toda consulta a Supabase debe estar protegida por Row Level Security garantizando que ningún usuario pueda ver o modificar datos de otro usuario (`auth.uid() = user_id`).

## 2. Calidad de Código y Estabilidad
- **Verificación de Compilación Pre-Commit:** Ningún cambio de código se considera terminado sin haber ejecutado y verificado `npm run build` con código de salida 0.
- **Resiliencia Local-First (Offline):** La aplicación debe funcionar fluidamente tanto en modo local (sin conexión / invitado) como en modo nube sincronizado con Supabase y Google Auth.

## 3. Principios de Diseño de Apple (Human Interface Guidelines)
- **Simplicidad y Foco:** Eliminar elementos visuales innecesarios, insignias técnicas y saturación de emojis.
- **Claridad Operativa:** La interfaz debe reflejar el estado financiero real de forma inmediata.
- **Tipografía y Micro-interacciones:** Diseñado mobile-first, con objetivos táctiles de al menos 44px, contrastes legibles y animaciones sutiles y fluidas.
