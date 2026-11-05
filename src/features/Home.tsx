import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Sparkles,
  Gift,
  Hourglass,
  Utensils,
  Coffee,
  Heart,
  MapPin,
  Sun,
  CalendarDays,
  LockKeyhole,
} from "lucide-react";
import { useData, useSettings } from "../components/data";
import { Photo, Badge } from "../components/ui";
import { upcomingAnniversaries } from "../services/time";
import { services } from "../services/api";
import { type Weather, statusLabels } from "../domain";
export function HomePage() {
  const { profiles, maps, places, orders } = useData();
  const settings = useSettings();
  const [weather, setWeather] = useState<Weather>();
  const [weatherStatus, setWeatherStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  useEffect(() => {
    setWeather(undefined);
    setWeatherStatus("idle");
    if (!settings.city || !settings.serviceUrl) return;
    setWeatherStatus("loading");
    const c = new AbortController();
    void services
      .weather(settings.city, c.signal)
      .then((value) => {
        setWeather(value);
        setWeatherStatus("ready");
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setWeatherStatus("error");
      });
    return () => c.abort();
  }, [settings.city, settings.serviceUrl]);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const anniversary = upcomingAnniversaries(profiles)[0];
  const latestMap = [...maps].sort(
    (a, b) => (b.lastViewedAt || b.updatedAt) - (a.lastViewedAt || a.updatedAt),
  )[0];
  const openOrder = orders.find(
    (order) => !["gifted", "completed"].includes(order.status),
  );
  return (
    <div className="home-page">
      <div className="welcome-row">
        <div>
          <span className="eyebrow">A LITTLE WARMTH, EVERY DAY</span>
          <h1>
            {greeting}，把温暖带给 TA <Sun className="sun-icon" size={28} />
          </h1>
          <p>平凡的一天，也值得被认真惦记。</p>
        </div>
        <div className="today-pill">
          <CalendarDays size={17} />
          {new Intl.DateTimeFormat("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
          }).format(new Date())}
        </div>
      </div>
      <section className="hero-card">
        <div className="hero-copy">
          <Badge tone="warm">
            <Heart size={12} />
            每一份关心，都值得被记住
          </Badge>
          <h2>
            一杯温暖，
            <br />
            一段属于你们的<span>小日常。</span>
          </h2>
          <p>
            记住 TA 的喜好，收藏想一起去的地方。
            <br />
            让那些说不出口的关心，有一个温柔的落点。
          </p>
          <div className="hero-actions">
            <Link className="button primary" to="/gifts">
              <Sparkles size={18} />给 TA 挑份心意
              <ArrowRight size={17} />
            </Link>
            <Link className="text-link" to="/maps">
              看看我们的暖迹
              <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="hero-footnote">
            <span className="tiny-dot" />
            不用很盛大，刚刚好就很温暖。
          </div>
        </div>
        <img
          className="hero-art"
          src="./brand/warm-moment.svg"
          alt="暖心杯子、手写卡片与记录美好地点的原创插画"
        />
      </section>
      <section className="daily-brief" aria-label="今天可以做的事">
        <article>
          <span className="eyebrow">TODAY'S LITTLE NUDGE</span>
          <h2>今天的暖心建议</h2>
          <p>
            {profiles[0]
              ? `为 ${profiles[0].name} 准备一个不需要很盛大的小惊喜，先从 TA 的一件偏好开始。`
              : "先记下一位在意的 TA，或直接收藏一个想一起去的地方。"}
          </p>
          <Link
            to={profiles[0] ? `/gifts?profile=${profiles[0].id}` : "/profiles/new"}
            className="text-link"
          >
            开始今天的小行动 <ArrowRight size={15} />
          </Link>
        </article>
        <article>
          <span className="eyebrow">PICK UP WHERE YOU LEFT</span>
          <h2>继续上次旅程</h2>
          <p>
            {latestMap
              ? `回到「${latestMap.title}」，补上一处想去的街角或已经发生的回忆。`
              : "从第一张暖迹图开始，把想一起去的远方慢慢收藏起来。"}
          </p>
          <Link
            to={latestMap ? `/maps/${latestMap.id}` : "/maps/new"}
            className="text-link"
          >
            {latestMap ? "继续暖迹" : "创建暖迹图"} <ArrowRight size={15} />
          </Link>
        </article>
        <article>
          <span className="eyebrow">A PROMISE TO KEEP</span>
          <h2>待实现的心意</h2>
          <p>
            {openOrder
              ? `${openOrder.title} 还在等待实现。今天可以推进一小步。`
              : "还没有待实现的心意，也可以为平常的一天准备一点期待。"}
          </p>
          <Link
            to={openOrder ? `/orders/${openOrder.id}` : "/orders/new"}
            className="text-link"
          >
            {openOrder ? "继续准备" : "记录一份心意"} <ArrowRight size={15} />
          </Link>
        </article>
      </section>
      <section className="quick-grid" aria-label="快捷功能">
        {[
          {
            to: "/gifts?kind=box",
            icon: Gift,
            title: "惊喜盲盒",
            text: "给平常的一天加点甜",
            tone: "peach",
          },
          {
            to: "/capsules",
            icon: Hourglass,
            title: "时间胶囊",
            text: "把今天的心意留给未来",
            tone: "lavender",
          },
          {
            to: "/city",
            icon: Utensils,
            title: "城市味道",
            text: "循着烟火气，发现一座城",
            tone: "sage",
          },
          {
            to: "/profiles",
            icon: Heart,
            title: "我在意的人",
            text: profiles.length
              ? `记着 ${profiles.length} 位 TA 的小偏好`
              : "记住那些重要的小细节",
            tone: "rose",
          },
        ].map((item) => (
          <Link key={item.to} to={item.to} className="quick-card">
            <div className={`quick-icon ${item.tone}`}>
              <item.icon size={23} />
            </div>
            <div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
            <ArrowUpRight size={18} className="subtle-arrow" />
          </Link>
        ))}
      </section>
      <div className="dashboard-columns">
        <section className="dashboard-main">
          <div className="section-heading">
            <div>
              <span className="eyebrow">OUR WARM TRAILS</span>
              <h2>把喜欢的地方，慢慢收藏</h2>
            </div>
            <Link to="/maps" className="text-link">
              全部地图
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="home-maps">
            {maps.length ? (
              maps.slice(0, 2).map((m) => (
                <Link to={`/maps/${m.id}`} className="mini-map-card" key={m.id}>
                  <Photo id={m.coverId} alt={m.title} className="map-cover" />
                  <div className="mini-map-body">
                    <Badge>
                      <LockKeyhole size={11} />
                      私人地图
                    </Badge>
                    <h3>{m.title}</h3>
                    <p>{m.description || "收藏每一个值得记住的地方。"}</p>
                    <span>
                      <MapPin size={14} />
                      {places.filter((p) => p.mapId === m.id).length} 个地点 ·{" "}
                      {m.city || "城市不限"}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <Link to="/maps/new" className="create-map-card">
                <div className="map-empty-art">
                  <MapPin size={42} />
                  <Heart size={18} />
                  <Coffee size={24} />
                </div>
                <div>
                  <Badge tone="sage">暖迹地图 · WarmTrail</Badge>
                  <h3>从第一个想一起去的地方开始</h3>
                  <p>
                    咖啡馆、街角的小店，或是还没出发的远方。
                    <br />
                    画出属于你们的暖迹。
                  </p>
                  <span className="button secondary">
                    <Plus size={17} />
                    创建第一张地图
                  </span>
                </div>
                <ArrowUpRight size={25} />
              </Link>
            )}
          </div>
          <div className="section-heading compact">
            <h2>最近的小小暖迹</h2>
            <Link className="text-link" to="/discover">
              发现新地点
              <ArrowUpRight size={16} />
            </Link>
          </div>
          {places.length ? (
            <div className="recent-list">
              {[...places]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, 3)
                .map((p) => (
                  <Link to={`/maps/${p.mapId}/places/${p.id}`} key={p.id}>
                    <Photo id={p.photoIds[0] || ""} />
                    <div>
                      <h3>{p.name}</h3>
                      <p>
                        {p.city || "自定义地点"} · {p.category}
                      </p>
                    </div>
                    <Badge tone={p.status}>{statusLabels[p.status]}</Badge>
                  </Link>
                ))}
            </div>
          ) : (
            <div className="gentle-empty">
              <MapPin size={24} />
              <p>
                这里会留下你收藏的地点和到访的故事。
                <br />
                <span>第一次暖迹，正等你写下。</span>
              </p>
            </div>
          )}
        </section>
        <aside className="dashboard-side">
          <section className="weather-card">
            <div className="section-heading">
              <span>
                <Sun size={18} />
                城市里的温度
              </span>
              <Link to="/settings" aria-label="设置天气城市">
                <ArrowUpRight size={18} />
              </Link>
            </div>
            {weather ? (
              <>
                <strong>
                  {weather.temperature}
                  <small>°C</small>
                </strong>
                <p>
                  {weather.city} · {weather.condition}
                </p>
                <small>
                  {weather.source} · {weather.reportedAt}
                </small>
              </>
            ) : (
              <>
                <strong className="weather-unknown">
                  {weatherStatus === "loading" ? "正在读取天气" : "慢一点，也很好"}
                </strong>
                <p>
                  {weatherStatus === "error"
                    ? `${settings.city} · 天气服务暂不可用，本地建议仍可使用`
                    : settings.city
                    ? `${settings.city} · 实时天气暂不可用`
                    : "选一座城市，让关心更贴近 TA。"}
                </p>
                <Link to="/settings" className="text-link">
                  {settings.city ? "查看服务设置" : "设置我的城市"}
                  <ArrowRight size={14} />
                </Link>
              </>
            )}
          </section>
          <section className="anniversary-card">
            <span className="eyebrow">SOMETHING TO LOOK FORWARD TO</span>
            <h3>
              <CalendarDays size={19} />
              值得期待的日子
            </h3>
            {anniversary ? (
              <>
                <div className="day-count">
                  {anniversary.days}
                  <span>天</span>
                </div>
                <p>
                  {anniversary.profile.name} · {anniversary.name}
                </p>
                <Link
                  className="text-link"
                  to={`/gifts?profile=${anniversary.profile.id}`}
                >
                  提前准备一份心意
                  <ArrowRight size={15} />
                </Link>
              </>
            ) : (
              <>
                <p>
                  把重要的日子记下来，
                  <br />
                  让心意早一点准备好。
                </p>
                <Link to="/profiles/new" className="text-link">
                  添加 TA 的纪念日
                  <Plus size={15} />
                </Link>
              </>
            )}
          </section>
          <div className="home-stats">
            <div>
              <strong>
                {places.filter((p) => p.status === "visited").length}
              </strong>
              <span>走过的地方</span>
            </div>
            <div>
              <strong>
                {orders.filter((o) => o.status === "completed").length}
              </strong>
              <span>完成的心意</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
