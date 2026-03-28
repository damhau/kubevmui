declare module '@novnc/novnc/lib/rfb' {
  export default class RFB {
    constructor(
      target: HTMLElement,
      url: string,
      options?: Record<string, unknown>,
    )
    scaleViewport: boolean
    resizeSession: boolean
    clipViewport: boolean
    showDotCursor: boolean
    background: string
    qualityLevel: number
    compressionLevel: number
    readonly capabilities: { power: boolean }
    disconnect(): void
    sendCredentials(credentials: { username?: string; password?: string; target?: string }): void
    sendKey(keysym: number, code: string | null, down?: boolean): void
    sendCtrlAltDel(): void
    focus(): void
    blur(): void
    machineShutdown(): void
    machineReboot(): void
    machineReset(): void
    clipboardPasteFrom(text: string): void
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void
  }
}
