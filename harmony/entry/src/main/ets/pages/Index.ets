import { webview } from '@kit.ArkWeb'

@Entry
@Component
struct Index {
  @State private ready: boolean = false
  private controller: webview.WebviewController = new webview.WebviewController()

  build() {
    Column() {
      Web({ src: $rawfile('web/index.html'), controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(true)
        .onLoadIntercept((event) => {
          // Never allow remote documents to acquire native access in this WebView.
          const url: string = event?.data.getRequestUrl() ?? ''
          return !url.startsWith('resource://rawfile/web/')
        })
        .onPageEnd(() => { this.ready = true })
        .width('100%')
        .height('100%')
      if (!this.ready) {
        Text('正在打开 WarmSip…').fontColor('#6A4B3C').fontSize(16)
      }
    }.width('100%').height('100%').backgroundColor('#FFF7F2')
  }
}
