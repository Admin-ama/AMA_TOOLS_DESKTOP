// Una sola geometría para el shell CSS, las vistas nativas y los controles de ventana.
export const SHELL_LAYOUT = { sidebarWidth: 64, headerHeight: 52, rightSidebarWidth: 56, statusBarHeight: 28 } as const;
export function contentBounds(width: number, height: number) {
  const { sidebarWidth: x, headerHeight: y, rightSidebarWidth: right, statusBarHeight: bottom } = SHELL_LAYOUT;
  return { x, y, width: Math.max(0, width - x - right), height: Math.max(0, height - y - bottom) };
}
