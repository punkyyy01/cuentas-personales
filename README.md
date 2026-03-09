# ExpenseTrack

ExpenseTrack es una aplicación diseñada para la gestión de gastos e ingresos, permitiendo a los usuarios conectar sus cuentas bancarias, establecer presupuestos y sincronizar transacciones de manera eficiente.

## Características principales

- **Gestión de cuentas**: Los usuarios pueden listar y crear cuentas bancarias.
- **Presupuestos**: Establece límites de gasto mensuales por categoría.
- **Integración con Fintoc**: Sincronización de movimientos bancarios mediante la API de Fintoc.
- **Conexión con Google**: Sincronización de correos y tokens de Google.
- **Webhooks**: Manejo de eventos para transacciones y presupuestos.

## Requisitos del sistema

- Node.js 16 o superior
- Python 3.9 o superior
- PostgreSQL 13 o superior

## Instalación

1. Clona el repositorio:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd cuentas
   ```

2. Instala las dependencias de Node.js:
   ```bash
   npm install
   ```

3. Configura el entorno virtual de Python:
   ```bash
   python -m venv .venv
   .\.venv\Scripts\activate
   pip install -r requirements.txt
   ```

4. Configura las variables de entorno:
   - Crea un archivo `.env` basado en `.env.example` y completa los valores necesarios.

5. Ejecuta las migraciones de la base de datos:
   ```bash
   npm run migrate
   ```

6. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```

## Scripts disponibles

- `npm run dev`: Inicia el servidor de desarrollo.
- `npm run build`: Construye la aplicación para producción.
- `npm run start`: Inicia la aplicación en modo producción.

## Arquitectura

- **Frontend**: Construido con Next.js y React.
- **Backend**: API RESTful utilizando rutas de Next.js.
- **Base de datos**: PostgreSQL con Supabase como cliente.
- **Integraciones**: Fintoc para movimientos bancarios y Google OAuth para sincronización de correos.

## Seguridad

- **CSP**: Política de seguridad de contenido configurada en `vercel.json`.
- **Tokens seguros**: Uso de cookies y encabezados para autenticación.

## Migraciones

Ejemplo de migraciones:

- `2026-03-06_add_example_column_to_accounts.sql`: Agrega una columna de ejemplo a la tabla `accounts_cards`.
- `2026-03-07_create_fintoc_links.sql`: Crea la tabla `fintoc_links` para almacenar tokens de enlace.