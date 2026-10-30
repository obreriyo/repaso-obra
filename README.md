# Repaso de obra

App para móvil con la que el jefe de obra y los encargados revisan las viviendas al terminar la obra, anotan cada fallo con fotos y exportan la lista de reparaciones a **PDF** y **Excel**.

Es una aplicación web instalable (PWA): funciona en cualquier móvil desde el navegador y se puede añadir a la pantalla de inicio. Los datos y las fotos se guardan en la nube, así que se ven igual desde cualquier móvil con la misma cuenta.

> **Estado:** primera versión. El código está escrito y revisado, pero todavía no se ha compilado ni probado contra una base de datos real. Sigue los pasos de abajo y, si algo falla en `npm run build` o al usarla, pega el mensaje de error y se corrige.

## Qué incluye

- Inicio de sesión con correo y contraseña (crear cuenta, recuperar contraseña).
- Varias obras por cuenta. Cada obra tiene **bloques**, y cada bloque **plantas** y **letras** (2ºB, Bajo A…). Las viviendas se generan solas.
- Revisión de cada vivienda: estado (pendiente, en curso, revisada) y fallos por estancia.
- Fallos con fotos (cámara o galería, se reducen solas), estancia, tipo, prioridad, subcontrata y descripción.
- Pestaña **Fallos** con todos los fallos de la obra, búsqueda y filtros.
- **Exportar a PDF y Excel** desde cada vivienda y desde la lista global (lo filtrado). En móvil se puede compartir directamente.
- **Equipo**: invitar por correo y registro de actividad (quién cambió qué y cuándo).
- Jefe de obra y encargados tienen **los mismos permisos** dentro de una obra.

## Tecnología

React + TypeScript + Vite · Supabase (cuentas, base de datos PostgreSQL y almacenamiento de fotos) · jsPDF y ExcelJS para exportar · PWA instalable.

## Puesta en marcha

### 1. Crear la base de datos (Supabase, tiene plan gratuito)

1. Entra en [supabase.com](https://supabase.com), crea una cuenta y un proyecto nuevo.
2. Abre **SQL Editor → New query**, pega todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**. Crea las tablas, los permisos y el almacenamiento de fotos.
3. En **Authentication → Providers → Email** puedes desactivar *Confirm email* si no quieres que cada persona tenga que confirmar su correo al registrarse (opcional).
4. En **Project Settings → API** copia la **Project URL** y la clave **anon public**.

### 2. Probarla en tu ordenador

Necesitas [Node.js](https://nodejs.org) 18 o superior.

```bash
npm install
cp .env.example .env.local     # y pega tus dos valores de Supabase
npm run dev
```

Abre la dirección que indica (normalmente http://localhost:5173) y crea tu cuenta.

### 3. Subirla a GitHub y publicarla

1. Crea un repositorio en GitHub y sube el proyecto:
   ```bash
   git init
   git add .
   git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPOSITORIO.git
   git push -u origin main
   ```
2. En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**. Crea dos secretos:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. En **Settings → Pages**, en *Source* elige **GitHub Actions**.
4. Cada `git push` a `main` compila y publica la app en `https://TU-USUARIO.github.io/TU-REPOSITORIO/` (mira la pestaña **Actions**).
5. En Supabase, **Authentication → URL Configuration**, pon esa dirección en *Site URL* (y en *Redirect URLs*). Así funcionan los enlaces de confirmación y de recuperar contraseña.

### 4. Instalarla en el móvil

Abre la dirección publicada en el móvil y usa **Añadir a pantalla de inicio** (Chrome: menú ⋮ → *Instalar aplicación*; Safari: Compartir → *Añadir a pantalla de inicio*). Cada persona entra con su cuenta.

## Seguridad

- La clave `anon` es pública por diseño: va dentro de la app. La protección está en el **Row Level Security** de `schema.sql`: cada persona solo ve las obras a las que pertenece.
- Las fotos van a un almacenamiento **privado**; la app las muestra con enlaces temporales.
- Nunca subas a GitHub la clave `service_role` de Supabase. Esta app no la necesita.

## Estructura

```
supabase/schema.sql      tablas, permisos, funciones y almacenamiento de fotos
src/lib/                 acceso a datos (api.ts), exportación (export.ts), sesión, fotos
src/pages/               pantallas: Login, Obras, NuevaObra, Viviendas, Vivienda, FalloForm, Fallos, Equipo
src/components/          cabecera y navegación, ventana de exportar
.github/workflows/       publicación automática en GitHub Pages
```

## Limitaciones de esta versión

- Necesita conexión: no hay modo sin conexión todavía.
- No se pueden dibujar círculos o flechas sobre las fotos.
- Las estancias de cada vivienda son texto libre (con sugerencias), no una lista fija por vivienda.
- Las subcontratas son texto libre con sugerencias de las ya usadas en la obra.
- Si la obra tiene miles de fallos, la lista global puede tardar en cargar.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Arranca la app en local |
| `npm run build` | Genera la versión final en `dist/` |
| `npm run typecheck` | Revisa los tipos de TypeScript |
| `npm run preview` | Sirve la versión compilada para probarla |
