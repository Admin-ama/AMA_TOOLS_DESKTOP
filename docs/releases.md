# Publicar versiones y actualizar AMATIME Tools

Sube una etiqueta `vX.Y.Z`: GitHub Actions comprueba el proyecto y crea una **release en borrador** con instalador Windows x64, `.blockmap` y `latest.yml`. Revisa los archivos y pulsa **Publish release** para que la app instalada encuentre la versión.

Repositorio público: [Admin-ama/AMA_TOOLS_DESKTOP](https://github.com/Admin-ama/AMA_TOOLS_DESKTOP).

## Aviso de actualización sin interrupciones

Cuando hay una versión nueva aparece un aviso abajo a la derecha, sin tomar el foco ni bloquear las aplicaciones:

- **Descargar y actualizar** inicia la descarga; puedes seguir trabajando. Al terminar, **Instalar y reiniciar** pide confirmación antes de cerrar la app.
- **Más tarde** oculta el aviso de esa versión durante la sesión, incluso si termina una descarga. La actualización sigue accesible en **Ajustes**.

No se descarga nada sin tu consentimiento y cerrar la app NO instala automáticamente. El aviso vuelve a ser elegible al abrir una nueva sesión o si se publica otra versión.

## Primera publicación: v0.2.0

El proyecto local todavía no tiene commits. Revisa los archivos antes de subirlos; no incluyas contraseñas, sesiones, tokens ni archivos `.env`.

```powershell
npm ci
npm run check
npx playwright test
git add .
git commit -m "feat(desktop): add operational shell and release updates"
git push -u origin main
git tag v0.2.0
git push origin v0.2.0
```

En **Actions → Windows release**, espera a que termine. En **Releases**, revisa el borrador `v0.2.0` y publícalo. El workflow valida que la etiqueta coincida con `package.json`; usa `GITHUB_TOKEN` de Actions solo al subir los archivos. No necesitas un PAT y no se guarda ningún token en el `.exe`.

**Los instaladores 0.1.0 anteriores no incluyen updater.** Instala manualmente la nueva 0.2.0 una vez; las siguientes versiones podrán descargarse desde Ajustes. No se puede actualizar automáticamente código que nunca tuvo updater.

## Siguientes versiones

Con los cambios ya revisados y probados:

```powershell
npm version patch --no-git-tag-version
git add .
git commit -m "chore(release): bump desktop version"
git push origin main
# Sustituye la etiqueta por la versión real de package.json.
git tag v0.2.1
git push origin v0.2.1
```

Publica el borrador cuando el workflow termine. No edites una etiqueta publicada: usa una versión mayor. Mantén el `.exe`, su `.blockmap` y `latest.yml` en la misma release; no publiques solamente el instalador.

## Actualizar desde la app

1. La app Windows empaquetada busca versiones al arrancar y cada seis horas. En desarrollo no consulta GitHub.
2. En **Ajustes → Actualizaciones**, usa **Buscar actualizaciones** y luego **Descargar actualización**.
3. Tras la descarga, guarda el trabajo pendiente y pulsa **Instalar y reiniciar**. Un diálogo pide confirmación; cancelar deja la app abierta. Al confirmar, el instalador corre en modo silencioso (sin asistente), reutiliza la carpeta instalada y vuelve a abrir la app.

La descarga e instalación no son automáticas y no se instala nada solo por cerrar la app. Se usan versiones estables, sin downgrade. Las preferencias y particiones de sesión mantienen el mismo `appId`; no se borran como parte de actualizar. Comprueba una actualización real entre dos versiones antes de distribuir ampliamente.

## Seguridad y límites

- Se requiere acceso HTTPS a GitHub y sus servidores de archivos, además de LAN/VPN para las aplicaciones internas.
- El feed usa HTTPS normal. La excepción TLS de LibreChat **no se aplica al updater**.
- El instalador actual no tiene firma corporativa: SmartScreen puede advertir. Añade firma de código antes de distribución amplia; las verificaciones de descarga no reemplazan una identidad de editor confiable.
- Cambiar el repositorio a privado requiere rediseñar el acceso al feed; nunca incrustes `GH_TOKEN` en la app.
- No se publicó ninguna release durante la configuración. GitHub Actions y la actualización entre versiones necesitan verificarse tras subir el código.

Arquitectura basada en [electron-updater y NSIS](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/auto-update.md). Los archivos de publicación y `app-update.yml` los genera electron-builder.
