# AMATIME Tools Desktop

Contenedor Electron para **Huly, n8n, LibreChat, Portal de Operaciones y Email Category AI**. La sidebar selecciona la aplicación; la barra superior permite abrir varias pestañas de esa aplicación. **Cada aplicación usa su propio login:** este proyecto no captura credenciales ni implementa autenticación.

Las pestañas muestran el título de su página y se actualizan cuando cambia. Si la página no tiene título, muestran el nombre de la aplicación, sin numeración.

Los logos de la sidebar se empaquetan desde `images/`, en este orden: Bot AMA (LibreChat), app AMA (Portal de Operaciones, `icon_144x144.png`), Huly, n8n y Email Category AI (icono Tabler `IconMailAi`).
La marca superior usa `AMA-TIME-digital.png`, sin el icono de cuadrícula anterior.

En el header, **− / porcentaje / +** ajusta el zoom de la aplicación entre 50% y 200%. Haz clic en el porcentaje para volver al 100%. Cada aplicación mantiene su zoom durante la ejecución y lo comparte entre sus pestañas; la interfaz del escritorio no cambia de tamaño.

La navegación compacta usa sidebar de 64 px y barra superior de 52 px; sus medidas y las vistas nativas se coordinan en `src/shared/layout.ts`. El logo de n8n se carga desde `n8n-logo.svg` (el archivo suministrado como `.png` contenía SVG).

## Ejecutar

Requisitos de desarrollo: Node.js 24 y npm. Para los servicios internos, acceso a la LAN o VPN.

```powershell
npm ci
npm start
```

`npm start` compila y abre Electron. `npm run dev` hace lo mismo; no hay hot reload configurado. Usa Recargar servicio en el header para refrescar la aplicación remota, no el código del shell.

## Verificar y distribuir

La versión **0.2.0** incorpora actualizaciones desde GitHub Releases: busca, descarga y confirma la instalación en Ajustes. [Guía para publicar versiones](docs/releases.md). Las instalaciones 0.1.0 requieren instalar esta nueva base manualmente una vez.

```powershell
npm run check      # Tipos, pruebas unitarias y build
npm run test:e2e   # Pruebas reales de Electron con servidor local aislado
npm run smoke:live # Solo carga de los cinco destinos reales; sin login
npm run dist       # Instalador Windows en release/
```

La prueba `smoke:live` requiere red y escribe capturas e informe en `.qa/live/` (ignorado por Git). No verifica autenticación ni funcionalidades tras el login. Las pruebas E2E usan datos temporales, sin tocar las sesiones del usuario.

El instalador de desarrollo no tiene firma corporativa. Configurar certificado de firma y validar en un equipo limpio antes de distribuirlo. Los recursos del shell y las licencias de sus dependencias se empaquetan localmente.

## Servicios

| Pestaña | Dirección |
|---|---|
| Huly Workspace | `http://172.16.8.73:8087/` |
| n8n Automations | `http://172.16.8.73:5678/` |
| LibreChat AI | `https://172.16.8.73/` |
| Portal de Operaciones | `https://app.amatime.com/` |
| Email Category AI | `https://email-category-ama-ia.netlify.app/` |

Las direcciones se definen en [`src/main/policy.ts`](src/main/policy.ts). Editarlas y volver a compilar; no se aceptan URLs arbitrarias desde la interfaz.

**HTTP no cifra credenciales.** Configurar HTTPS antes de producción; el contenedor no cambia la infraestructura. Por petición explícita, LibreChat admite únicamente el error de autoridad no confiable en `https://172.16.8.73/`. Esta excepción reduce la protección frente a suplantación; úsala solo en la red interna de confianza y configura una CA confiable para producción. Los demás certificados y errores siguen validándose.

## Comportamiento

- La sidebar cambia de aplicación. La barra superior muestra solo las pestañas de la aplicación seleccionada: **+** abre otra y **×** la cierra.
- Cada pestaña tiene una vista y navegación independientes. Al volver a una aplicación se conservan sus pestañas y se restaura la última seleccionada. Cerrar la última crea una nueva pestaña de la misma aplicación.
- Cada pestaña muestra la página directamente desde el inicio, sin tarjetas de carga, formularios propios, consentimiento intermedio ni timeout artificial que detenga el servicio.
- Cada aplicación tiene su propia partición de cookies y almacenamiento; sus pestañas comparten esa sesión, como en un navegador. Recordar sesión está activado por defecto y puede cambiarse en Ajustes.
- Cambiar Recordar sesión borra los datos locales de ese servicio. Borrar sesión no revoca tokens del servidor: usa su logout propio para eso.
- El tema oscuro/claro afecta únicamente al shell. No modifica el tema interno de las aplicaciones.
- Los enlaces que abren ventana del mismo origen se abren en una nueva pestaña de su aplicación; otros orígenes, descargas y permisos de dispositivos están bloqueados. Un SSO externo necesita una política revisada; no se promete compatibilidad con todos los flujos.

## Arquitectura

| Ruta | Responsabilidad |
|---|---|
| `src/main/index.ts` | Ventana, protocolo local seguro y validación/serialización de IPC |
| `src/main/service-view-manager.ts` | `WebContentsView`, navegación, carga, errores, sesiones y limpieza |
| `src/main/application-tabs.ts` | Pestañas por aplicación, selección recordada, apertura y cierre |
| `src/main/policy.ts` | Destinos, IDs, aislamiento y geometría del contenido |
| `src/main/preferences.ts` | Preferencias locales sin secretos, escritura atómica |
| `src/preload/index.ts` | Puente tipado y limitado, solo para el shell |
| `src/renderer/` | Interfaz React, CSS y recursos locales |
| `tests/unit/`, `tests/e2e/` | Políticas y comportamiento de escritorio |
| `docs/design/` | Draft Superdesign v5 y captura de referencia |

La integración usa [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view) con aislamiento y sandbox, siguiendo la [guía de seguridad de Electron](https://www.electronjs.org/docs/latest/tutorial/security). El shell se sirve desde `app://bundle`, con CSP restrictiva. Ninguna vista remota tiene el puente IPC ni acceso a Node.js.

## Límites de esta entrega

No incluye SSO compartido, APIs de autenticación, métricas inventadas, formularios locales de acceso, actualización automática ni firma del instalador. Los endpoints internos y las referencias pertenecen a documentación privada: revisar antes de publicar el repositorio.

Consulta el [plan de implementación](docs/implementation-plan.md) para el contexto del diseño y los criterios originales.
