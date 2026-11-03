import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./app/App";
import { NoticeProvider } from "./components/ui";
import "./styles.css";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <img src="./brand/icon.svg" alt="WarmSip" width="72" />
        <h1>暂时没能打开这一页</h1>
        <p>
          本地记录不会因页面错误而被清空。请重新加载；若仍失败，请先保留应用数据。
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          重新加载
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <NoticeProvider>
          <App />
        </NoticeProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
