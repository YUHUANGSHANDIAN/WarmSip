import { Suspense, lazy, useEffect, useState } from "react";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Home,
  Sparkles,
  Map,
  Heart,
  UserRound,
  WifiOff,
  ArrowUpRight,
  Coffee,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useSettings } from "../components/data";
import { HomePage } from "../features/Home";
const ProfilesPage = lazy(() =>
  import("../features/Profiles").then((m) => ({ default: m.ProfilesPage })),
);
const ProfileForm = lazy(() =>
  import("../features/Profiles").then((m) => ({ default: m.ProfileForm })),
);
const GiftPage = lazy(() =>
  import("../features/Gifts").then((m) => ({ default: m.GiftPage })),
);
const HistoryPage = lazy(() =>
  import("../features/Gifts").then((m) => ({ default: m.HistoryPage })),
);
const OrdersPage = lazy(() =>
  import("../features/Records").then((m) => ({ default: m.OrdersPage })),
);
const OrderForm = lazy(() =>
  import("../features/Records").then((m) => ({ default: m.OrderForm })),
);
const CapsulesPage = lazy(() =>
  import("../features/Records").then((m) => ({ default: m.CapsulesPage })),
);
const CapsuleForm = lazy(() =>
  import("../features/Records").then((m) => ({ default: m.CapsuleForm })),
);
const CapsuleDetail = lazy(() =>
  import("../features/Records").then((m) => ({ default: m.CapsuleDetail })),
);
const CityPage = lazy(() =>
  import("../features/Records").then((m) => ({ default: m.CityPage })),
);
const SettingsPage = lazy(() =>
  import("../features/Settings").then((m) => ({ default: m.SettingsPage })),
);
const MapsPage = lazy(() =>
  import("../features/Maps").then((m) => ({ default: m.MapsPage })),
);
const MapForm = lazy(() =>
  import("../features/Maps").then((m) => ({ default: m.MapForm })),
);
const MapDetail = lazy(() =>
  import("../features/Maps").then((m) => ({ default: m.MapDetail })),
);
const PlaceForm = lazy(() =>
  import("../features/Maps").then((m) => ({ default: m.PlaceForm })),
);
const DiscoverPage = lazy(() =>
  import("../features/Maps").then((m) => ({ default: m.DiscoverPage })),
);
const nav = [
  { to: "/", label: "首页", icon: Home },
  { to: "/gifts", label: "AI 选礼", icon: Sparkles },
  { to: "/maps", label: "暖迹地图", icon: Map },
  { to: "/orders", label: "心意", icon: Heart },
  { to: "/settings", label: "我的", icon: UserRound },
];
export function App() {
  const settings = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        settings.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : settings.theme;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [settings.theme]);
  useEffect(() => {
    document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
  }, [location.pathname]);
  useEffect(() => {
    document.documentElement.dataset.motion = settings.reduceMotion
      ? "reduced"
      : "full";
  }, [settings.reduceMotion]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let dispose: (() => void) | undefined;
    let active = true;
    void import("@capacitor/app").then(async ({ App: NativeApp }) => {
      const handle = await NativeApp.addListener("backButton", () => {
        if (document.querySelector("dialog[open]")) {
          document
            .querySelector("dialog[open]")
            ?.dispatchEvent(new Event("cancel"));
        } else if (
          window.location.hash !== "#/" &&
          window.location.hash !== ""
        ) {
          if (window.history.state?.idx > 0) navigate(-1);
          else navigate("/", { replace: true });
        } else void NativeApp.minimizeApp();
      });
      if (active)
        dispose = () => {
          void handle.remove();
        };
      else await handle.remove();
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, [navigate]);
  const isMap =
    /^\/maps\/[^/]+$/.test(location.pathname) &&
    !location.pathname.endsWith("/new");
  if (!settings.ready)
    return (
      <main className="loading-state" role="status">
        正在打开本地记录…
      </main>
    );
  return (
    <div className={`app-shell ${isMap ? "map-shell" : ""}`}>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.querySelector<HTMLElement>("main")?.focus();
        }}
      >
        跳至主要内容
      </a>
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <img src="./brand/icon.svg" alt="" />
          <div>
            WarmSip<span>给 TA 点一杯温暖</span>
          </div>
        </NavLink>
        <div className="sidebar-caption">把关心，放进日常</div>
        <nav aria-label="主导航">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <n.icon size={21} />
              <span>{n.label}</span>
              {n.to === "/maps" && <span className="new-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-note">
            <Coffee size={25} />
            <p>
              不用很盛大，
              <br />
              温暖也会被记住。
            </p>
            <span>SEND A LITTLE WARMTH</span>
          </div>
          <NavLink to="/settings" className="privacy-link">
            你的记录，留在你的设备里 <ArrowUpRight size={15} />
          </NavLink>
          <small>WarmSip · 0.2.0-beta.2 预发布版</small>
        </div>
      </aside>
      <div className="content-shell">
        <header className="mobile-brand">
          <NavLink to="/">
            <img src="./brand/icon.svg" alt="" />
            WarmSip
          </NavLink>
          <span>给 TA 点一杯温暖</span>
        </header>
        {!online && (
          <div className="offline-banner" role="status">
            <WifiOff size={15} />
            当前离线 · 仍可查看和编辑本地记录
          </div>
        )}
        <main
          id="main"
          tabIndex={-1}
          className={isMap ? "map-main" : "page-main"}
        >
          <Suspense
            fallback={<div className="loading-state">正在打开暖迹…</div>}
          >
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/profiles" element={<ProfilesPage />} />
              <Route path="/profiles/new" element={<ProfileForm />} />
              <Route path="/profiles/:id" element={<ProfileForm />} />
              <Route path="/gifts" element={<GiftPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/new" element={<OrderForm />} />
              <Route path="/orders/:id" element={<OrderForm />} />
              <Route path="/capsules" element={<CapsulesPage />} />
              <Route path="/capsules/new" element={<CapsuleForm />} />
              <Route path="/capsules/:id/edit" element={<CapsuleForm />} />
              <Route path="/capsules/:id" element={<CapsuleDetail />} />
              <Route path="/city" element={<CityPage />} />
              <Route path="/maps" element={<MapsPage />} />
              <Route path="/maps/new" element={<MapForm />} />
              <Route path="/maps/:id/edit" element={<MapForm />} />
              <Route path="/maps/:id" element={<MapDetail />} />
              <Route path="/maps/:mapId/places/new" element={<PlaceForm />} />
              <Route path="/maps/:mapId/places/:id" element={<PlaceForm />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="*"
                element={
                  <div className="empty-state">
                    <h1>这一页暂时找不到</h1>
                    <NavLink className="button primary" to="/">
                      回到首页
                    </NavLink>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </main>
        <footer className="desktop-footer">
          让每一份关心，都有温暖的落点。
          <span>WarmSip · Send a Little Warmth.</span>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="移动端导航">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"}>
            <n.icon size={22} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
