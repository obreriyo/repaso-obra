# Repaso de obra

App para móvil con la que el jefe de obra y los encargados revisan las viviendas al terminar la obra, anotan cada fallo con fotos y exportan la lista de reparaciones a **PDF** y **Excel**.

Es una aplicación web instalable (PWA): funciona en cualquier móvil desde el navegador y se puede añadir a la pantalla de inicio. Los datos y las fotos se guardan en la nube, así que se ven igual desde cualquier móvil con la misma cuenta.

> **Estado:** primera versión. El código está escrito y revisado, pero todavía no se ha compilado ni probado contra una base de datos real. Sigue los pasos de abajo y, si algo falla en `npm run build` o al usarla, pega el mensaje de error y se corrige.

## Qué incluye

- Inicio de sesión con correo y contraseña (crear cuenta, recuperar contraseña).
- Varias obras por cuenta. Cada obra tiene **bloques**, y cada planta de cada bloque sus propias **letras** (2ºB, Bajo A, Ático A…), con distinto número de viviendas por planta y ático opcional. Las viviendas se generan solas.
- Revisión de cada vivienda: estado (pendiente, en curso, revisada) y fallos por estancia.
- Fallos con fotos (botones **Cámara** y **Galería**, se reducen solas), estancia, tipo, prioridad, subcontrata y descripción.
- Pestaña **Fallos** con todos los fallos de la obra, búsqueda y filtros.
- **Exportar a PDF y Excel** desde cada vivienda y desde la lista global (lo filtrado). En móvil se puede compartir directamente.
- **Equipo**: invitar por correo y registro de actividad (quién cambió qué y cuándo).
- Se pueden **añadir bloques** a una obra ya creada (botón en Viviendas) y eliminar **bloques** (desde Viviendas) y **obras** (desde Mis obras o Equipo), siempre con doble confirmación.
- En el APK de Android, el botón *atrás* vuelve a la pantalla anterior y, en el inicio, pregunta si quieres salir; PDF, Excel y la copia de seguridad se abren con la hoja de compartir de Android.
- **Copia de seguridad** por obra (en Equipo): zip con Excel, archivo de datos JSON y, si quieres, las fotos.
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

## Actualizar sin perder datos

- Los datos viven en Supabase, no en la app: subir código nuevo a GitHub **no toca la base de datos**.
- Cuando una versión cambie la base de datos, vendrá un script en `supabase/migraciones/` (`001_…`, `002_…`). Se pega en **SQL Editor → Run** una sola vez, en orden. Son scripts que no borran datos. **No vuelvas a ejecutar `schema.sql` para actualizar.**
- `schema.sql` solo sirve para crear una base de datos nueva desde cero.

## Generar el APK de Android

En la pestaña **Actions** del repositorio, elige **Generar APK → Run workflow**. Al terminar, descarga `repaso-obra-apk` desde *Artifacts*. El APK es de pruebas ("debug"): Android no deja instalarlo encima de otro firmado con otra clave, así que al actualizar hay que desinstalar el anterior (los datos en la nube no se pierden).

## Novedades: sin conexión, subcontratas y marcado de fotos

- **Modo sin conexión**: al abrir una obra con internet, sus datos se guardan en el móvil (también con el botón «Descargar datos de esta obra» en Equipo). Sin cobertura puedes apuntar fallos, hacer fotos, cambiar estados y marcar reparados; todo queda en el móvil y se envía solo al volver la conexión (arriba aparece una franja con lo pendiente). No se puede sin conexión: crear/borrar obras o bloques, gestionar el equipo y la copia de seguridad. Las fotos ya subidas no se ven sin conexión.
- **Importante**: no desinstales la app mientras haya cambios sin enviar; se perderían.
- **Marcar fotos**: en el formulario de fallo, botón «Marcar» sobre cada foto (círculo, flecha, dibujo libre, deshacer).
- **Subcontratas**: lista por obra (se gestiona en Equipo) para elegirlas con un toque. Migración `003_subcontratas.sql` (se aplica sola).
- **Obras grandes**: la lista de fallos se muestra de 50 en 50.

## Seguridad

- La clave `anon` es pública por diseño: va dentro de la app. La protección está en el **Row Level Security** de `schema.sql`: cada persona solo ve las obras a las que pertenece.
- Las fotos van a un almacenamiento **privado**; la app las muestra con enlaces temporales.
- Nunca subas a GitHub la clave `service_role` de Supabase. Esta app no la necesita.

## Estructura

```
supabase/schema.sql      base de datos completa (para crear una nueva desde cero)
supabase/migraciones/    cambios que no borran datos, para bases de datos ya en uso
src/lib/                 acceso a datos (api.ts), exportación (export.ts), copia de seguridad (copia.ts), sesión, fotos
src/pages/               pantallas: Login, Obras, NuevaObra, Viviendas, Vivienda, FalloForm, Fallos, Equipo
src/components/          cabecera y navegación, ventana de exportar
.github/workflows/       publicación automática en GitHub Pages (deploy.yml) y generación del APK (apk.yml)
```

## Limitaciones de esta versión

- Necesita conexión: no hay modo sin conexión todavía.
- No se pueden dibujar círculos o flechas sobre las fotos.
- Las estancias de cada vivienda son texto libre (con sugerencias), no una lista fija por vivienda.
- No se pueden editar las plantas o letras de un bloque ya creado (se puede añadir un bloque nuevo o eliminar el bloque y crearlo otra vez).
- Las subcontratas son texto libre con sugerencias de las ya usadas en la obra.
- Si la obra tiene miles de fallos, la lista global puede tardar en cargar.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Arranca la app en local |
| `npm run build` | Genera la versión final en `dist/` |
| `npm run typecheck` | Revisa los tipos de TypeScript |
| `npm run preview` | Sirve la versión compilada para probarla |
