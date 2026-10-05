import path from 'node:path';

function quote(argument: string) {
  return `"${argument.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

export function windowsAppDetails(packaged: boolean, executable: string, appPath: string, resourcesPath: string, developmentIcon: string) {
  return {
    appId: packaged ? 'com.amatime.tools.desktop' : 'com.amatime.tools.desktop.dev',
    // Explorer cannot resolve Electron's virtual app.asar filesystem.
    appIconPath: packaged ? path.join(resourcesPath, 'amatime.ico') : developmentIcon,
    appIconIndex: 0,
    relaunchCommand: [executable, ...(!packaged ? [appPath] : [])].map(quote).join(' '),
    relaunchDisplayName: packaged ? 'AMATIME Tools' : 'AMATIME Tools (desarrollo)',
  } satisfies Electron.AppDetailsOptions;
}
