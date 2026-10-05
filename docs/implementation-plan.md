# Plan de implementación — AMATIME Portal Operacional Desktop

Crear una aplicación de escritorio que reproduzca la interfaz aprobada y permita usar Huly, n8n, LibreChat y el Portal de Operaciones dentro de la misma ventana. Este documento conserva el plan inicial; la base Electron ya está implementada. Consulta [README](../README.md) para ejecutarla y conocer sus límites.

**Alcance confirmado por el usuario:** solo layout y pestañas; cada aplicación gestiona su propio login. No crear formularios, autenticación ni adaptadores de credenciales en el shell. El login ilustrado en Superdesign no forma parte del contenedor.

**Ajuste confirmado:** mostrar directamente la página remota desde que se selecciona la pestaña. Sin tarjetas de carga, pantallas intermedias ni espera artificial antes de hacer visible la vista. El header no muestra indicadores de carga ni HTTP.

**Modelo de pestañas confirmado:** la sidebar cambia de aplicación; la barra superior abre y cierra múltiples pestañas de esa aplicación. Cada pestaña tiene su propia vista, pero comparte la sesión de su aplicación. Se conservan las pestañas y su selección al cambiar entre aplicaciones.

## 1. Base verificada y alcance

- Repositorio inicialmente vacío: únicamente `.git`, sin commits, código ni dependencias. La arquitectura siguiente es **propuesta**, no una descripción de código existente.
- Superdesign: proyecto `6720bca5-2378-4624-9ceb-0cdbe3be11d7`, draft `94bf5c69-5d00-4332-a1fc-cda8fbd1b72c`, **v5**.
- Referencia descargada: [HTML original](design/amatime-portal-improved.html). Referencia visual aprobada: [captura](design/amatime-portal-reference.png).
- El usuario confirmó una aplicación de escritorio con los servicios dentro de su ventana. Windows es el primer entorno de validación propuesto; otros sistemas quedan fuera del MVP.
- Los cuatro endpoints respondieron `200 OK` a solicitudes HEAD desde este equipo el 05-10-2026. Esto no demuestra login, permisos ni compatibilidad completa.

| Servicio | Dirección inicial | ID interno |
|---|---|---|
| Huly | `http://172.16.8.73:8087/` | `huly` |
| n8n | `http://172.16.8.73:5678/` | `n8n` |
| LibreChat | `https://172.16.8.73/` | `librechat` |
| Portal de Operaciones | `https://app.amatime.com/` | `portal` |

El usuario proporcionó el dominio del Portal sin protocolo; HTTPS se comprobó y se propone como configuración inicial. No incorporar los hosts ficticios del draft.

**MVP:** shell visual, cuatro vistas remotas, navegación, sesiones aisladas, tema, estados de carga/error, recarga, cierre de sesión local y distribución inicial. Sin paneles de métricas inventadas, notificaciones simuladas, SSO propio ni reimplementación de los servicios.

## 2. Arquitectura recomendada

**Propuesta:** Electron + TypeScript, React para el shell local, Vite para compilar sus recursos y CSS con tokens explícitos. Electron se recomienda por sus vistas Chromium controladas desde el proceso principal; tiene un coste de memoria y distribución mayor que un contenedor basado en el WebView del sistema. Si el tamaño del instalador resulta prioritario, reevaluar el runtime antes de implementar, no a mitad del trabajo.

Usar una `WebContentsView` por pestaña y una partición de sesión por aplicación, no un iframe ni el HTML del prototipo como aplicación final. La API permite cargar contenido web y colocar la vista dentro de una ventana desde el proceso principal. [Referencia oficial](https://www.electronjs.org/docs/latest/api/web-contents-view).

```text
Ventana de escritorio
  +-- Shell local: sidebar / header / ajustes / estados
  |     +-- Preload: puente IPC mínimo y tipado
  +-- Proceso principal
        +-- Registro de servicios y política de navegación
        +-- Controlador de vistas: crear / activar / redimensionar / cerrar
        +-- Gestor de sesiones por servicio
        +-- Vista remota activa: sin privilegios del shell
```

La vista remota ocupa únicamente el área central, dejando siempre disponibles sidebar y header. Sus límites deben recalcularse al redimensionar y cambiar escala. Ocultarla al mostrar ajustes o diálogos locales: una vista nativa no se comporta como un elemento del DOM de React.

Crear vistas bajo demanda y conservar las ya abiertas durante la sesión, para preservar formularios y navegación al cambiar de servicio. Medir consumo con cuatro servicios abiertos; cerrar explícitamente sus `webContents` al finalizar y evitar instancias duplicadas.

### Estructura propuesta

```text
src/
  main/
    index.ts                 # Ventana y ciclo de vida
    services.ts              # Endpoints y allowlists
    service-view-manager.ts  # Vistas, límites y navegación
    service-session-manager.ts
    ipc.ts                   # Validación de mensajes y remitentes
  preload/index.ts           # API limitada para el shell local
  shared/contracts.ts        # IDs, eventos y tipos de estados
  renderer/
    App.tsx
    components/              # AppShell, Sidebar, Header, StatusPanel
    features/settings/
    features/service-access/ # Acceso, carga y error; adaptadores si proceden
    styles/tokens.css
    styles/global.css
tests/
  unit/
  integration/
  e2e/
docs/design/                 # Referencias, no código de producción
```

No pasar una URL arbitraria desde el renderer al proceso principal: enviar un `ServiceId` validado y resolver la dirección desde configuración confiable. Mantener versiones fijadas y lockfile; seleccionar versiones soportadas al comenzar el bootstrap.

## 3. Traducción del diseño a componentes

| Elemento del draft | Implementación y criterio |
|---|---|
| Sidebar compacta | Cuatro servicios, selección activa, tooltip accesible por foco y mouse; ajustes y ayuda con acciones reales. |
| Header | Pestañas de la aplicación seleccionada con el título real de cada página (sin numeración), abrir/cerrar pestañas, recargar y cambiar tema. Sin indicadores de carga ni HTTP. |
| Tarjeta de acceso del draft | No se implementa. El servicio remoto presenta su login; el shell solo muestra carga, error o aviso de HTTP. |
| Loading | Estado interno sin indicador visual en el header. La página se muestra inmediatamente; sin tarjeta local ni timeout artificial. |
| Área de aplicación | Servicio real en `WebContentsView`, no el sandbox ilustrativo del draft. |
| Ajustes | Tema, persistencia por servicio y acción explícita para borrar su sesión. No almacenar contraseñas. |

Extraer del HTML los tokens `#00504d`, `#0ea5a0`, `#1da774`, `#0b1222`, fondo oscuro `#020617`, radios y sombras. El draft usa Plus Jakarta Sans, sidebar de 80 px y header de 64 px; la captura debe guiar el ajuste visual porque su escala puede diferir. Ajuste compacto solicitado: sidebar de 64 px y header de 52 px, sincronizados con las vistas nativas mediante src/shared/layout.ts.

Empaquetar CSS, iconos Tabler y fuente localmente tras revisar licencias; no depender de Tailwind, Iconify o Google Fonts por CDN en el shell. Confirmar logo oficial antes de sustituir el marcador de cuadrícula del prototipo. Tema oscuro inicial; tema claro del shell no implica cambiar el tema interno de cada servicio.

Validar a 1280×720 y 1920×1080, y con escalas de Windows de 100%, 125% y 150%. Definir tamaño mínimo de ventana después de esa prueba. Usar labels asociados, foco visible, nombres accesibles en iconos y soporte para movimiento reducido.

## 4. Autenticación y sesiones: responsabilidad de cada servicio

El draft acepta un texto que contiene `@amatime.com` y una contraseña de cuatro caracteres, y luego espera 1,5 segundos. **Eso es una simulación, no autenticación.** Tampoco sus métricas son datos reales.

Primero probar el login nativo de cada servicio en su vista aislada: cookies, redirecciones, WebSockets, persistencia, logout y cualquier SSO/2FA. No asumir que comparten credenciales por estar en el mismo servidor.

**Decisión confirmada:** cargar directamente cada aplicación, incluyendo su login nativo. No capturar ni reenviar contraseñas desde el shell. No implementar adaptadores de autenticación ni inyectar scripts que completen formularios. La captura es referencia del layout, no autorización para crear un login propio.

Separar cookies y almacenamiento mediante una partición por servicio; `persist:` conserva la sesión entre ejecuciones y una partición sin ese prefijo es en memoria. Decidir la partición antes de crear la vista y reconstruirla si cambia la preferencia. [API de sesiones](https://www.electronjs.org/docs/latest/api/session).

“Cerrar sesión local” elimina únicamente los datos del servicio seleccionado y reconstruye su vista. No prometer revocación de tokens en el servidor: requiere el logout oficial de cada servicio. Estado de autenticación = desconocido hasta contar con señal confiable del servicio, nunca inferido de un `200`.

## 5. Seguridad y límites de integración

Huly y n8n usan HTTP: la LAN no cifra credenciales ni garantiza integridad del contenido. **Bloqueo de producción:** habilitar HTTPS con certificados confiables mediante infraestructura, o contar con una excepción de riesgo explícita y documentada; no considerar la configuración actual apta para credenciales de producción.

En las vistas remotas: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, sin preload privilegiado. En el shell: CSP restrictiva, recursos empaquetados y puente mínimo. Validar remitente y payload de IPC; limitar permisos, navegación y ventanas emergentes. No desactivar `webSecurity` ni aislamiento. Excepción solicitada: únicamente LibreChat en https://172.16.8.73/ admite ERR_CERT_AUTHORITY_INVALID; los demás orígenes, aplicaciones y errores TLS se rechazan. Esta excepción no sustituye una CA confiable para producción. Estos controles se apoyan en la [guía de seguridad de Electron](https://www.electronjs.org/docs/latest/tutorial/security).

Registrar orígenes exactos por servicio, incluyendo puerto. Descubrir redirecciones y proveedores de identidad durante la prueba, y aprobarlos expresamente. Popups de autenticación requieren ventanas controladas en la misma partición; enlaces externos solo con esquema validado y política explícita. Descargas y permisos deben estar denegados por defecto y habilitarse por necesidad verificada.

No registrar contraseñas, cookies, tokens ni query strings sensibles. Los endpoints internos pertenecen a documentación privada; revisar antes de publicar el repositorio o distribuir referencias.

## 6. Fases de implementación y pruebas

Aplicar **TDD estricto**: prueba que falla → cambio mínimo → prueba que pasa → refactor. Runner unitario propuesto: Vitest; pruebas de escritorio propuestas: Playwright con Electron. Confirmar compatibilidad al fijar dependencias. Pruebas automatizadas con servicios locales controlados; pruebas reales en LAN como suite separada, sin credenciales en el repositorio.

| Fase | Trabajo | Evidencia de salida |
|---|---|---|
| 0. Viabilidad | Probar los cuatro servicios en una ventana Electron mínima, login nativo, redirecciones, persistencia y transporte; resolver login propio versus nativo. | Matriz de compatibilidad por servicio y decisiones registradas; sin afirmar soporte no probado. |
| 1. Base | Bootstrap, scripts de desarrollo/build/tests, shell local seguro, registro y contratos IPC. | Pruebas de IDs inválidos, remitentes no autorizados y configuración; ventana abre sin recursos CDN. |
| 2. Shell visual | Sidebar, header, tokens, tarjeta de acceso y ajustes. | Pruebas de selección, teclado, tema y screenshots comparadas con referencia. |
| 3. Vistas reales | Crear/activar vistas, resize, carga, error, timeout, reintento y limpieza. | Alternar servicios durante cargas lentas no muestra el servicio equivocado; resize no tapa el shell. |
| 4. Sesiones | Particiones independientes, recordar sesión, borrado local y adaptadores soportados si se aprueban. | Borrar Huly no afecta n8n/LibreChat/Portal; pruebas de reinicio y sesión expirada. |
| 5. Integración | Popups, enlaces, descargas permitidas, caída de red y permisos. | Pruebas de política con servidor controlado y smoke tests manuales por servicio. |
| 6. Distribución | Empaquetado Windows, configuración sin secretos, revisión de dependencias y firma antes de despliegue corporativo. | Instalación en equipo limpio, informe de QA y documentación de operación. |

Casos obligatorios: doble clic de acceso, cambio de servicio durante autenticación, fallo de conexión, navegación bloqueada, cierre con cargas pendientes, credenciales rechazadas si hay adaptador y preferencia de persistencia desactivada. No trasladar el contador global de intentos ni el bloqueo visual del prototipo: límites de autenticación deben corresponder al servidor.

Separar cambios en unidades revisables, con pruebas junto al código. Cada fase puede necesitar varios PRs; revisar el tamaño real antes de implementar y acordar slices si supera 400 líneas. No hacer commits en esta etapa de planificación.

## 7. Criterios de aceptación del MVP

- [ ] La ventana conserva la composición aprobada: sidebar, header, tema oscuro y acceso centrado.
- [ ] Los cuatro servicios reales se usan dentro de la ventana, sin mostrar contenido placeholder como funcionalidad.
- [ ] Cambiar de servicio conserva su contexto y no mezcla sesiones ni resultados asíncronos.
- [ ] Estado “cargado” y estado “autenticado” no se confunden; métricas inexistentes se omiten.
- [ ] El login respeta el mecanismo real de cada servicio; contraseñas nunca se guardan en el shell.
- [ ] Sin red se muestra error recuperable, mientras navegación y ajustes siguen disponibles.
- [ ] Tema, teclado y escalado funcionan; vista remota no oculta controles locales.
- [ ] Las políticas de seguridad tienen pruebas y el transporte cumple el requisito de producción.
- [ ] Instalador Windows probado en equipo limpio y sesiones borrables por servicio.

## Próximo paso

Completar la verificación funcional dentro de cada aplicación usando su propio login y resolver HTTPS en infraestructura antes de producción. No construir un formulario de credenciales en el contenedor. Las pruebas de carga no demuestran autenticación ni funcionalidades posteriores al login.


