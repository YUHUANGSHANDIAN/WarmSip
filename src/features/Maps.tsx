import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plus,
  MapPin,
  ArrowRight,
  ArrowLeft,
  MoreHorizontal,
  Share2,
  Search,
  SlidersHorizontal,
  LockKeyhole,
  Heart,
  Check,
  Gift,
  Trash2,
  Download,
  Edit3,
  ChevronUp,
  ChevronDown,
  Navigation,
  Star,
  Map as MapIcon,
  List,
  Compass,
  Sparkles,
} from "lucide-react";
import {
  PageTitle,
  Empty,
  Field,
  Form,
  SaveButton,
  Photo,
  PhotoPicker,
  Modal,
  Badge,
  useAction,
  useNotice,
} from "../components/ui";
import {
  MapView,
  getSavedMapView,
  saveSelectedPlace,
} from "../components/MapView";
import { useData, useSettings } from "../components/data";
import { db, saveRecord, softDelete, restoreRecord } from "../storage/db";
import { exportBackup } from "../storage/backup";
import {
  newEntity,
  mapSchema,
  placeSchema,
  poiSchema,
  placeStatuses,
  statusLabels,
  snapshot,
  type MapCollection,
  type PlaceRecord,
  type Coordinate,
  type Poi,
  aiMapIntentResultSchema,
  aiStoryResultSchema,
} from "../domain";
import { localDate } from "../services/time";
import { services, LatestRequest } from "../services/api";
import { type Viewport } from "../services/map";
import { platform, navigationUrl } from "../platform";
import {
  mapSummary,
  shareCard,
  privateShareDefaults,
  type ShareOptions,
} from "../services/sharing";

const themes = [
  "我和 TA",
  "双人足迹",
  "城市美食",
  "咖啡与甜品",
  "周末探索",
  "旅行清单",
  "家人与朋友",
  "自定义主题",
];
const statusIcons = {
  want: MapPin,
  visited: Check,
  toGift: Heart,
  gifted: Gift,
};
export function MapsPage() {
  const { maps, places } = useData();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated");
  const visible = maps
    .filter((m) => m.title.includes(search) || m.city.includes(search))
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "zh-CN")
        : sort === "created"
          ? b.createdAt - a.createdAt
          : b.updatedAt - a.updatedAt,
    );
  return (
    <>
      <PageTitle
        eyebrow="WARMTRAIL · OUR LITTLE WORLD"
        title="暖迹地图"
        description="收藏每一个值得记住的地方。"
        action={
          <Link className="button primary" to="/maps/new">
            <Plus size={17} />
            创建新地图
          </Link>
        }
      />
      <div className="map-overview">
        <div className="map-intro">
          <span className="eyebrow">PLACES, PEOPLE & LITTLE STORIES</span>
          <h2>
            想去的远方，
            <br />
            和已经留下的<span>小小足迹。</span>
          </h2>
          <p>
            从街角的咖啡馆，到约定一起去的城市。
            <br />
            每一个地点，都可以有属于你的故事。
          </p>
          <Link className="text-link" to="/discover">
            发现附近的温暖
            <Compass size={17} />
          </Link>
        </div>
        <div className="map-stats">
          {[
            { n: maps.length, label: "私人地图", icon: MapIcon },
            {
              n: places.filter((p) => p.status === "want").length,
              label: "想去的地方",
              icon: MapPin,
            },
            {
              n: places.filter((p) => p.status === "visited").length,
              label: "已留下足迹",
              icon: Check,
            },
          ].map((item) => (
            <div key={item.label}>
              <item.icon size={21} />
              <strong>{item.n}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="section-heading">
        <h2>
          我的暖迹图 <small>{maps.length}</small>
        </h2>
        <select
          aria-label="地图排序"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="updated">最近更新</option>
          <option value="created">最近创建</option>
          <option value="title">按名称排序</option>
        </select>
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="搜索我的地图"
            value={search}
            placeholder="搜索地图或城市"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {visible.length ? (
        <div className="map-grid">
          {visible.map((m, i) => (
            <Link
              className={`map-card map-theme-${i % 4}`}
              to={`/maps/${m.id}`}
              key={m.id}
            >
              <div className="map-card-cover">
                {m.coverId ? (
                  <Photo id={m.coverId} alt={m.title} className="map-cover" />
                ) : (
                  <div className="original-map-cover">
                    <MapPin size={50} />
                    <span>{m.theme}</span>
                    <Heart size={23} />
                  </div>
                )}
                <Badge>
                  <LockKeyhole size={12} />
                  私人地图
                </Badge>
              </div>
              <div className="map-card-copy">
                <h3>
                  {m.title}
                  <ArrowUpRightIcon />
                </h3>
                <p>{m.description || "每一个地点，都有一个值得记住的理由。"}</p>
                <div>
                  <span>
                    <MapPin size={14} />
                    {places.filter((p) => p.mapId === m.id).length} 个地点
                  </span>
                  <span>{m.city || "慢慢探索"}</span>
                </div>
              </div>
            </Link>
          ))}
          <Link className="new-map-tile" to="/maps/new">
            <Plus size={28} />
            <strong>开始一张新地图</strong>
            <span>给下一段故事留一点空间</span>
          </Link>
        </div>
      ) : (
        <Empty
          title={search ? "没有找到对应地图" : "从第一张暖迹图开始"}
          action={
            <Link to="/maps/new" className="button primary">
              <Plus size={17} />
              创建第一张地图
            </Link>
          }
        >
          从第一个想一起去的地方开始，画出属于你们的暖迹。
        </Empty>
      )}
      {maps.some((m) => m.lastViewedAt > 0) && (
        <section className="recent-map-strip">
          <span>最近看过</span>
          {[...maps]
            .filter((m) => m.lastViewedAt > 0)
            .sort((a, b) => b.lastViewedAt - a.lastViewedAt)
            .slice(0, 3)
            .map((m) => (
              <Link to={`/maps/${m.id}`} key={m.id}>
                {m.title}
                <ArrowRight size={14} />
              </Link>
            ))}
        </section>
      )}
    </>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={18} className="diagonal-arrow" />;
}
export function MapForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const notice = useNotice();
  const { profiles } = useData();
  const settings = useSettings();
  const { busy, run } = useAction();
  const existing = useLiveQuery(() => (id ? db.maps.get(id) : undefined), [id]);
  const [form, setForm] = useState<MapCollection>(() =>
    mapSchema.parse({
      ...newEntity(),
      title: "我和 TA 的暖迹图",
      city: settings.city,
      profileId: params.get("profile") || "",
    }),
  );
  useEffect(() => {
    if (existing) setForm(existing);
  }, [existing]);
  const set = (key: keyof MapCollection, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <>
      <PageTitle
        back
        eyebrow="MAKE ROOM FOR A NEW STORY"
        title={id ? "编辑暖迹地图" : "创建一张暖迹图"}
        description="为想去的地方、走过的街角，留一个专属的位置。"
      />
      <Form
        onSubmit={() => {
          void run(async () => {
            await saveRecord("maps", form);
            notice({ text: id ? "地图已更新" : "第一份期待，已经放进地图" });
            navigate(`/maps/${form.id}`, { replace: true });
          });
        }}
      >
        <Field label="地图名称">
          <input
            required
            maxLength={80}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <Field label="关于这张地图">
          <textarea
            rows={3}
            maxLength={3000}
            value={form.description}
            placeholder="想一起去的地方，和不想忘记的小瞬间…"
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="地图主题">
            <select
              value={themes.includes(form.theme) ? form.theme : "自定义主题"}
              onChange={(e) => set("theme", e.target.value)}
            >
              {themes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="默认城市">
            <input
              value={form.city}
              maxLength={100}
              placeholder="例如：天津"
              onChange={(e) => set("city", e.target.value)}
            />
          </Field>
          <Field label="与谁有关（可选）">
            <select
              value={form.profileId}
              onChange={(e) => {
                const p = profiles.find((p) => p.id === e.target.value);
                setForm((f) => ({
                  ...f,
                  profileId: e.target.value,
                  city: f.city || p?.city || "",
                }));
              }}
            >
              <option value="">自己的地图 / 暂不关联</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {(!themes.includes(form.theme) || form.theme === "自定义主题") && (
          <Field label="自定义主题名称">
            <input
              maxLength={80}
              value={form.theme === "自定义主题" ? "" : form.theme}
              onChange={(e) => set("theme", e.target.value)}
            />
          </Field>
        )}
        <div className="field">
          <span>地图封面（可选）</span>
          <PhotoPicker
            ids={form.coverId ? [form.coverId] : []}
            max={1}
            label="选择封面"
            onChange={(ids) => set("coverId", ids[0] || "")}
          />
        </div>
        <div className="privacy-note">
          <LockKeyhole size={20} />
          <div>
            <strong>只有这台设备上的你可以看到</strong>
            <p>地图默认保存在本地。分享时，你可以预览并选择公开哪些内容。</p>
          </div>
        </div>
        <div className="form-actions">
          <SaveButton busy={busy}>{id ? "保存修改" : "创建暖迹图"}</SaveButton>
        </div>
      </Form>
    </>
  );
}
export function MapDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { maps, places, profiles } = useData();
  const settings = useSettings();
  const map = maps.find((m) => m.id === id);
  const notice = useNotice();
  const { run, busy } = useAction();
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState(
    getSavedMapView(id!)?.selected || "",
  );
  const [focus, setFocus] = useState({ id: "", seq: 0 });
  const [sheet, setSheet] = useState(1);
  const [sort, setSort] = useState("custom");
  const [scope, setScope] = useState("all");
  const [viewport, setViewport] = useState<Viewport>();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [backupConfirm, setBackupConfirm] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"search" | "story">("search");
  const [aiQuery, setAiQuery] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiStory, setAiStory] = useState<{ title: string; narrative: string; blessing: string }>();
  const pointer = useRef(0);
  const dragged = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const all = useMemo(() => places.filter((p) => p.mapId === id), [places, id]);
  const filtered = useMemo(
    () => all.filter((p) => status === "all" || p.status === status),
    [all, status],
  );
  const shown = useMemo(
    () =>
      filtered
        .filter((p) => scope === "all" || viewport?.visibleIds?.includes(p.id))
        .sort((a, b) =>
          sort === "timeline"
            ? (b.visitedAt || b.plannedAt || "").localeCompare(
                a.visitedAt || a.plannedAt || "",
              )
            : a.sortOrder - b.sortOrder || b.createdAt - a.createdAt,
        ),
    [filtered, scope, viewport, sort],
  );
  useEffect(() => {
    if (!id) return;
    void db.maps
      .update(id, { lastViewedAt: Date.now() })
      .catch(() => notice({ text: "无法保存最近查看状态", error: true }));
  }, [id, notice]);
  const select = (key: string) => {
    setSelected(key);
    saveSelectedPlace(id!, key);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-place-id="${CSS.escape(key)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const cardSelect = (key: string) => {
    setSelected(key);
    saveSelectedPlace(id!, key);
    setFocus((f) => ({ id: key, seq: f.seq + 1 }));
  };
  const runMapAI = () =>
    run(async () => {
      if (!map) throw new Error("地图不可用");
      if (!settings.aiEnabled) throw new Error("请先在设置中启用 AI");
      setAiText("");
      if (aiMode === "search") {
        if (!aiQuery.trim()) throw new Error("请描述想找的地方");
        let intent: { keyword: string; category: string; city: string; radius: number } | undefined;
        let streamError = "";
        await services.streamAI(
          {
            taskId: "map-intent",
            payload: {
              query: aiQuery,
              city: map.city,
              longitude: viewport?.center.longitude,
              latitude: viewport?.center.latitude,
            },
            consent: {
              taskId: "map-intent",
              fields: ["用户搜索描述", "城市"],
              includesSensitive: false,
              includesPhotos: false,
            },
            budget: {
              dailyUsd: settings.aiBudgetDailyUsd,
              monthlyUsd: settings.aiBudgetMonthlyUsd,
            },
          },
          (event) => {
            if (event.type === "delta") setAiText((value) => value + event.delta);
            if (event.type === "result") intent = aiMapIntentResultSchema.parse(event.payload);
            if (event.type === "error") streamError = event.message;
          },
          new AbortController().signal,
        );
        if (streamError) throw new Error(streamError);
        if (!intent) throw new Error("AI 没有返回有效的搜索条件");
        setAiOpen(false);
        navigate(
          `/discover?map=${encodeURIComponent(map.id)}&city=${encodeURIComponent(intent.city || map.city)}&keyword=${encodeURIComponent([intent.keyword, intent.category].filter(Boolean).join(" "))}`,
        );
        return;
      }
      if (!all.length) throw new Error("先记录至少一个地点，再生成足迹故事");
      let result:
        | { title: string; narrative: string; blessing: string }
        | undefined;
      let streamError = "";
      await services.streamAI(
        {
          taskId: "story",
          payload: {
            mapTitle: map.title,
            places: all.map((place) => ({
              name: place.name,
              note: settings.aiSendSensitive ? place.note : "",
              mood: place.mood,
              status: statusLabels[place.status],
              visitedAt: place.visitedAt,
            })),
            tone: "温柔",
          },
          consent: {
            taskId: "story",
            fields: [
              "地图标题",
              "地点名称",
              "地点状态",
              "地点心情",
              ...(settings.aiSendSensitive ? ["私人地点备注"] : []),
            ],
            includesSensitive: settings.aiSendSensitive,
            includesPhotos: false,
          },
          budget: {
            dailyUsd: settings.aiBudgetDailyUsd,
            monthlyUsd: settings.aiBudgetMonthlyUsd,
          },
        },
        (event) => {
          if (event.type === "delta") setAiText((value) => value + event.delta);
          if (event.type === "result") result = aiStoryResultSchema.parse(event.payload);
          if (event.type === "error") streamError = event.message;
        },
        new AbortController().signal,
      );
      if (streamError) throw new Error(streamError);
      if (!result) throw new Error("AI 没有返回有效的足迹故事");
      setAiStory(result);
    });
  if (!map)
    return (
      <div className="page-main">
        <PageTitle back title="这张地图暂时找不到" />
        <p>它可能已移入回收站，或还没有完成导入。</p>
        <Link to="/maps" className="button primary">
          返回我的地图
        </Link>
      </div>
    );
  return (
    <div className={`map-detail sheet-${sheet}`}>
      <MapView
        id={map.id}
        city={map.city}
        places={filtered}
        selected={selected}
        focusId={focus.id}
        focusSequence={focus.seq}
        onSelect={select}
        onViewport={setViewport}
      />
      <div className="map-toolbar">
        <button
          className="map-round-button"
          aria-label="返回地图列表"
          onClick={() => navigate("/maps")}
        >
          <ArrowLeft />
        </button>
        <div className="map-floating-title">
          <LockKeyhole size={15} />
          <span>{map.title}</span>
        </div>
        <div className="map-menu-wrap">
          <button
            className="map-round-button"
            aria-label="地图更多操作"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <MoreHorizontal />
          </button>
          {menu && (
            <div className="map-menu">
              <Link to={`/maps/${id}/edit`}>
                <Edit3 size={16} />
                编辑地图
              </Link>
              <button
                onClick={() => {
                  setAiMode("search");
                  setAiOpen(true);
                  setMenu(false);
                }}
              >
                <Compass size={16} />
                AI 暖迹灵感
              </button>
              <button
                onClick={() => {
                  setSharing(true);
                  setMenu(false);
                }}
              >
                <Share2 size={16} />
                分享暖迹
              </button>
              <button
                onClick={() => {
                  setBackupConfirm(true);
                  setMenu(false);
                }}
              >
                <Download size={16} />
                导出私密备份
              </button>
              <button
                className="danger"
                onClick={() => {
                  setConfirm(true);
                  setMenu(false);
                }}
              >
                <Trash2 size={16} />
                删除地图
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="map-status-filters">
        <button
          className={`chip ${status === "all" ? "selected" : ""}`}
          onClick={() => setStatus("all")}
        >
          全部 {all.length}
        </button>
        {placeStatuses.map((s) => {
          const Icon = statusIcons[s];
          return (
            <button
              className={`chip ${status === s ? "selected" : ""}`}
              key={s}
              onClick={() => setStatus(s)}
            >
              <Icon size={14} />
              {statusLabels[s]} {all.filter((p) => p.status === s).length}
            </button>
          );
        })}
      </div>
      <section className="map-sheet" aria-label="地图信息与地点列表">
        <button
          className="sheet-handle"
          aria-label="调整地点面板高度"
          aria-expanded={sheet > 0}
          onClick={() => {
            if (!dragged.current) setSheet((s) => (s + 1) % 3);
            dragged.current = false;
          }}
          onPointerDown={(e) => {
            pointer.current = e.clientY;
            dragged.current = false;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            const diff = e.clientY - pointer.current;
            dragged.current = Math.abs(diff) > 25;
            if (Math.abs(diff) > 25)
              setSheet((s) =>
                Math.min(2, Math.max(0, s + (diff < 0 ? 1 : -1))),
              );
          }}
        >
          <span />
        </button>
        <div className="sheet-heading">
          <div>
            <Badge tone="sage">{map.theme}</Badge>
            <h1>{map.title}</h1>
            <p>
              {all.length} 个地点 <span>· 本机的你创建</span>
            </p>
          </div>
          <Link to={`/maps/${id}/places/new`} className="button primary">
            <Plus size={17} />
            添加地点
          </Link>
        </div>
        <p className="map-description">
          {map.description || "把想去的远方和走过的街角，慢慢写进这张暖迹图。"}
        </p>
        <div className="sheet-tools">
          <div className="segmented">
            <button
              className={sort === "custom" ? "active" : ""}
              onClick={() => setSort("custom")}
            >
              <List size={14} />
              地点列表
            </button>
            <button
              className={sort === "timeline" ? "active" : ""}
              onClick={() => setSort("timeline")}
            >
              时间顺序
            </button>
          </div>
          <label className="scope-select">
            <span className="sr-only">地点范围</span>
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">全部地点</option>
              <option value="viewport" disabled={!viewport}>
                当前视野
              </option>
            </select>
          </label>
          <button
            className="icon-button sheet-expand"
            aria-label={sheet === 2 ? "收起面板" : "展开面板"}
            onClick={() => setSheet(sheet === 2 ? 0 : 2)}
          >
            {sheet === 2 ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </div>
        {scope === "viewport" && (
          <p className="scope-note">仅显示当前底图视野中的已定位地点。</p>
        )}
        <div className="map-place-list" ref={listRef}>
          {shown.length ? (
            shown.map((p, index) => {
              const Icon = statusIcons[p.status];
              return (
                <article
                  key={p.id}
                  data-place-id={p.id}
                  className={`place-card ${selected === p.id ? "selected" : ""}`}
                >
                  <button
                    className="place-card-main"
                    onClick={() => cardSelect(p.id)}
                    aria-label={`在地图上查看 ${p.name}`}
                    aria-pressed={selected === p.id}
                  >
                    <Photo id={p.photoIds[0] || ""} alt={p.name} />
                    <div>
                      <Badge tone={p.status}>
                        <Icon size={12} />
                        {statusLabels[p.status]}
                      </Badge>
                      <h3>{p.name}</h3>
                      <p>
                        {p.city || "城市未填写"} · {p.category}
                      </p>
                      <p className="place-note">
                        {p.note || p.address || "给这个地点留一点小记忆。"}
                      </p>
                      <small>
                        {p.visitedAt ||
                          p.plannedAt ||
                          new Date(p.createdAt).toLocaleDateString(
                            "zh-CN",
                          )}{" "}
                        · {p.provider === "amap" ? "高德地点" : "自定义地点"}
                        {!p.coordinate ? " · 待定位" : ""}
                      </small>
                    </div>
                  </button>
                  <div className="place-card-actions">
                    <Link to={`/maps/${id}/places/${p.id}`}>
                      <Edit3 size={14} />
                      详情 / 编辑
                    </Link>
                    <button
                      aria-label={p.favorite ? "取消收藏" : "收藏地点"}
                      onClick={() => {
                        void run(async () => {
                          await saveRecord("places", {
                            ...p,
                            favorite: !p.favorite,
                          });
                        });
                      }}
                    >
                      <Star
                        size={15}
                        fill={p.favorite ? "currentColor" : "none"}
                      />
                    </button>
                    {sort === "custom" && index > 0 && (
                      <button
                        aria-label={`上移${p.name}`}
                        onClick={() => {
                          void run(async () => {
                            const arranged = [...shown];
                            [arranged[index - 1], arranged[index]] = [
                              arranged[index],
                              arranged[index - 1],
                            ];
                            await db.transaction("rw", db.places, async () => {
                              for (let n = 0; n < arranged.length; n++)
                                await db.places.update(arranged[n].id, {
                                  sortOrder: n,
                                  updatedAt: Date.now(),
                                });
                            });
                          });
                        }}
                      >
                        <ChevronUp size={15} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <Empty
              title={all.length ? "这个范围还没有地点" : "第一处暖迹，等你落笔"}
              action={
                <Link
                  to={`/maps/${id}/places/new`}
                  className="button secondary"
                >
                  <Plus size={16} />
                  添加地点
                </Link>
              }
            >
              记录一个想去的地方，或一段已经发生的美好。
            </Empty>
          )}
        </div>
        <div className="sheet-bottom">
          <Link to={`/discover?map=${id}&city=${encodeURIComponent(map.city)}`}>
            <Compass size={16} />
            在这座城市发现
          </Link>
          <button onClick={() => setSharing(true)}>
            <Share2 size={16} />
            分享暖迹
          </button>
          <button
            onClick={() => {
              setAiMode("story");
              setAiOpen(true);
            }}
          >
            <Sparkles size={16} />
            润色足迹故事
          </button>
        </div>
      </section>
      {aiOpen && (
        <Modal
          title={aiMode === "search" ? "用一句话找暖迹" : "把足迹写成故事"}
          onClose={() => {
            setAiOpen(false);
            setAiStory(undefined);
          }}
        >
          {aiMode === "search" ? (
            <>
              <p>
                AI 只把描述转换成搜索条件，真实地点仍由高德 POI 服务返回。
              </p>
              <Field label="想找怎样的地方">
                <textarea
                  rows={3}
                  value={aiQuery}
                  onChange={(event) => setAiQuery(event.target.value)}
                  placeholder="例如：适合安静聊天、雨天也能去的咖啡馆"
                />
              </Field>
              <button className="button primary" disabled={busy} onClick={runMapAI}>
                <Sparkles size={16} />
                {busy ? "正在整理条件…" : "搜索真实地点"}
              </button>
            </>
          ) : aiStory ? (
            <>
              <Field label="故事标题">
                <input
                  value={aiStory.title}
                  onChange={(event) =>
                    setAiStory((value) =>
                      value ? { ...value, title: event.target.value } : value,
                    )
                  }
                />
              </Field>
              <Field label="足迹故事">
                <textarea
                  rows={10}
                  value={aiStory.narrative}
                  onChange={(event) =>
                    setAiStory((value) =>
                      value ? { ...value, narrative: event.target.value } : value,
                    )
                  }
                />
              </Field>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await saveRecord("maps", {
                      ...map,
                      description: aiStory.narrative,
                    });
                    setAiOpen(false);
                    setAiStory(undefined);
                    notice({ text: "确认后的足迹故事已写入地图介绍" });
                  })
                }
              >
                确认并更新地图介绍
              </button>
            </>
          ) : (
            <>
              <p>
                只会发送地点名称、状态和心情。
                {settings.aiSendSensitive
                  ? "私人地点备注已由你的设置授权发送。"
                  : "私人地点备注、照片和精确坐标不会发送。"}
              </p>
              <button className="button primary" disabled={busy} onClick={runMapAI}>
                <Sparkles size={16} />
                {busy ? "正在写下足迹…" : "生成可编辑故事"}
              </button>
            </>
          )}
          {aiText && !aiStory && (
            <pre className="ai-stream-raw" aria-label="AI 流式生成内容">
              {aiText.slice(-1200)}
            </pre>
          )}
        </Modal>
      )}
      {sharing && (
        <ShareMap
          map={map}
          places={all}
          recipient={profiles.find((p) => p.id === map.profileId)?.name || ""}
          onClose={() => setSharing(false)}
        />
      )}{" "}
      {confirm && (
        <Modal title="将这张地图移入回收站？" onClose={() => setConfirm(false)}>
          <p>
            “{map.title}”和其中 {all.length}{" "}
            个地点将暂时隐藏。心意记录、时间胶囊和收礼人档案会保留。可在回收站恢复。
          </p>
          <button
            className="button danger"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await softDelete("maps", map.id);
                notice({
                  text: "地图已移入回收站",
                  undo: () => restoreRecord("maps", map.id),
                });
                navigate("/maps");
              });
            }}
          >
            移入回收站
          </button>
        </Modal>
      )}
      {backupConfirm && (
        <Modal
          title="导出这张地图的私密备份"
          onClose={() => setBackupConfirm(false)}
        >
          <p>
            备份包含完整地点、精确坐标、私人备注、照片和关联档案。请妥善保存，不要当作公开分享卡片发送。
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await platform.saveFile(
                  `WarmSip-map-${localDate()}.zip`,
                  await exportBackup(db, map.id),
                );
                setBackupConfirm(false);
                notice({ text: "地图备份已准备好" });
              });
            }}
          >
            <Download size={16} />
            保存私密备份
          </button>
        </Modal>
      )}
    </div>
  );
}
function ShareMap({
  map,
  places,
  recipient,
  onClose,
}: {
  map: MapCollection;
  places: PlaceRecord[];
  recipient: string;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<ShareOptions>(privateShareDefaults);
  const { busy, run } = useAction();
  const notice = useNotice();
  const preview = mapSummary(map, places, options, recipient);
  return (
    <Modal title="分享前，看看哪些内容会被带走" onClose={onClose}>
      <p>
        默认只分享地图名称、地点名称、城市和状态。地图简介与街道地址不包含在默认分享中。
      </p>
      <div className="share-options">
        {(
          [
            ["notes", "加入私人备注"],
            ["coordinates", "加入精确坐标"],
            ["photos", "卡片包含地点照片"],
            ["recipient", "加入关联人的称呼"],
          ] as const
        ).map(([key, label]) => (
          <label className="checkbox" key={key}>
            <input
              type="checkbox"
              checked={options[key]}
              onChange={(e) =>
                setOptions((o) => ({ ...o, [key]: e.target.checked }))
              }
            />
            {label}
          </label>
        ))}
      </div>
      <pre className="share-preview">{preview}</pre>
      {options.photos && (
        <div className="photo-grid">
          {places
            .slice(0, 4)
            .filter((p) => p.photoIds[0])
            .map((p) => (
              <Photo key={p.id} id={p.photoIds[0]} alt={p.name} />
            ))}
        </div>
      )}
      <p className="muted">图片卡片展示前 4 个地点，文字摘要包含全部地点。</p>
      <div className="form-actions">
        <button
          disabled={busy}
          className="button primary"
          onClick={() => {
            void run(async () => {
              await platform.share(preview);
              notice({ text: "分享内容已交给系统，或已复制到剪贴板" });
            });
          }}
        >
          <Share2 size={16} />
          分享摘要
        </button>
        <button
          disabled={busy}
          className="button secondary"
          onClick={() => {
            void run(async () => {
              const file = await shareCard(map, places, options, recipient);
              await platform.share(preview, file);
              notice({ text: "暖迹卡片已准备好" });
            });
          }}
        >
          生成足迹卡片
        </button>
      </div>
    </Modal>
  );
}

export function PlaceForm() {
  const { mapId, id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const notice = useNotice();
  const { profiles, maps } = useData();
  const map = maps.find((m) => m.id === mapId);
  const { busy, run } = useAction();
  const existing = useLiveQuery(
    () => (id ? db.places.get(id) : undefined),
    [id],
  );
  const [form, setForm] = useState<PlaceRecord>(() =>
    placeSchema.parse({ ...newEntity(), mapId: mapId!, name: "新地点" }),
  );
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [crs, setCrs] = useState<"WGS84" | "GCJ02">("WGS84");
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [addressSearch, setAddressSearch] = useState(false);
  useEffect(() => {
    if (existing) {
      setForm(existing);
      setLatitude(
        existing.coordinate ? String(existing.coordinate.latitude) : "",
      );
      setLongitude(
        existing.coordinate ? String(existing.coordinate.longitude) : "",
      );
      setCrs(existing.coordinate?.crs || "WGS84");
    }
  }, [existing]);
  useEffect(() => {
    if (id) return;
    const state = location.state as { poi?: unknown } | null;
    if (state?.poi) {
      const p = poiSchema.safeParse(state.poi);
      if (p.success) {
        const poi = p.data;
        setForm((f) => ({
          ...f,
          name: poi.name,
          address: poi.address,
          city: poi.city,
          category: poi.category,
          provider: "amap",
          poiId: poi.id,
        }));
        setLatitude(String(poi.coordinate.latitude));
        setLongitude(String(poi.coordinate.longitude));
        setCrs(poi.coordinate.crs);
      }
    } else if (map)
      setForm((f) => ({
        ...f,
        city: f.city || map.city,
        profileId: f.profileId || map.profileId,
      }));
  }, [id, location.state, map]);
  const set = (key: keyof PlaceRecord, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  const coordinate = (): Coordinate | null => {
    if (!latitude && !longitude) return null;
    if (!latitude || !longitude)
      throw new Error("请同时填写经度和纬度，或都留空");
    return { latitude: Number(latitude), longitude: Number(longitude), crs };
  };
  return (
    <>
      <PageTitle
        back
        eyebrow="SAVE A PLACE, KEEP A FEELING"
        title={id ? "地点与小故事" : "添加一个值得记住的地方"}
        description={map ? `收藏到「${map.title}」` : "收藏一份新的期待"}
        action={
          id && (
            <button
              className="button danger ghost"
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={16} />
              删除地点
            </button>
          )
        }
      />
      {!id && (
        <div className="place-add-options">
          <Link
            to={`/discover?map=${mapId}&city=${encodeURIComponent(form.city)}`}
          >
            <Search size={18} />
            搜索真实地点
          </Link>
          <button onClick={() => setPicking(!picking)}>
            <MapPin size={18} />
            在地图上选点
          </button>
          <button onClick={() => setAddressSearch(!addressSearch)}>
            <Navigation size={18} />
            地址定位
          </button>
        </div>
      )}
      {picking && (
        <div className="pick-map">
          <MapView
            id={`pick-${mapId}`}
            city={form.city}
            places={[]}
            onSelect={() => {}}
            picking
            onPick={(c) => {
              setLatitude(String(c.latitude));
              setLongitude(String(c.longitude));
              setCrs(c.crs);
              setPicking(false);
              notice({ text: "已选取地图位置，请补充地点信息" });
            }}
          />
        </div>
      )}
      <Form
        onSubmit={() => {
          void run(async () => {
            if (!map || map.deletedAt)
              throw new Error("所属地图不可用，请先恢复地图");
            await saveRecord("places", { ...form, coordinate: coordinate() });
            notice({
              text: id ? "地点与回忆已更新" : "这个地方，已留在暖迹里",
            });
            navigate(`/maps/${mapId}`, { replace: true });
          });
        }}
      >
        <div className="form-grid">
          <Field label="地点名称">
            <input
              required
              maxLength={200}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="所在城市">
            <input
              value={form.city}
              maxLength={100}
              placeholder="例如：天津"
              onChange={(e) => set("city", e.target.value)}
            />
          </Field>
        </div>
        <Field label="详细地址">
          <input
            value={form.address}
            maxLength={500}
            onChange={(e) => set("address", e.target.value)}
            placeholder="可以先记下地址，稍后再补坐标"
          />
        </Field>
        {addressSearch && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                const results = await services.geocode(
                  form.address,
                  form.city,
                  new AbortController().signal,
                );
                if (!results.length)
                  throw new Error("没有找到对应地址，请补充城市或手动选点");
                const p = results[0];
                setLatitude(String(p.coordinate.latitude));
                setLongitude(String(p.coordinate.longitude));
                setCrs(p.coordinate.crs);
                setForm((f) => ({ ...f, address: p.address, city: p.city }));
                notice({ text: "已定位到地址，请核对坐标和地址后保存" });
              });
            }}
          >
            尝试定位这个地址
          </button>
        )}
        <div className="form-grid">
          <Field label="当前状态">
            <select
              value={form.status}
              onChange={(e) => {
                const status = e.target.value as PlaceRecord["status"];
                setForm((f) => ({
                  ...f,
                  status,
                  visitedAt:
                    status === "visited"
                      ? f.visitedAt || localDate()
                      : f.visitedAt,
                }));
              }}
            >
              {placeStatuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="地点类别">
            <input
              value={form.category}
              list="place-categories"
              maxLength={100}
              onChange={(e) => set("category", e.target.value)}
            />
            <datalist id="place-categories">
              {[
                "咖啡馆",
                "饮品",
                "甜品",
                "小吃",
                "餐厅",
                "公园",
                "风景",
                "文化",
                "其他",
              ].map((c) => (
                <option value={c} key={c} />
              ))}
            </datalist>
          </Field>
          <Field label="想去 / 计划日期">
            <input
              type="date"
              value={form.plannedAt}
              onChange={(e) => set("plannedAt", e.target.value)}
            />
          </Field>
          <Field label="到访日期">
            <input
              type="date"
              required={form.status === "visited"}
              value={form.visitedAt}
              onChange={(e) => set("visitedAt", e.target.value)}
            />
          </Field>
        </div>
        <details
          className="coordinate-details"
          open={Boolean(latitude || longitude)}
        >
          <summary>地理坐标（可稍后补充）</summary>
          <div className="form-grid three">
            <Field label="纬度">
              <input
                type="number"
                step="any"
                min={-90}
                max={90}
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
              />
            </Field>
            <Field label="经度">
              <input
                type="number"
                step="any"
                min={-180}
                max={180}
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
              />
            </Field>
            <Field label="坐标系统">
              <select
                value={crs}
                onChange={(e) => setCrs(e.target.value as "WGS84" | "GCJ02")}
              >
                <option value="WGS84">WGS84 / GPS</option>
                <option value="GCJ02">GCJ-02 / 高德</option>
              </select>
            </Field>
          </div>
          <small>
            修改坐标系统名称不会转换数值。请按真实来源选择；未定位的地点保留在列表中。
          </small>
        </details>
        <div className="form-grid">
          <Field label="和谁一起 / 与谁有关">
            <select
              value={form.profileId}
              onChange={(e) => set("profileId", e.target.value)}
            >
              <option value="">自己 / 暂不关联</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="心情">
            <input
              value={form.mood}
              maxLength={200}
              onChange={(e) => set("mood", e.target.value)}
              placeholder="例如：很放松，想再来一次"
            />
          </Field>
        </div>
        <Field label="自定义标签（用逗号分开）">
          <input
            value={form.tags.join("，")}
            onChange={(e) =>
              set(
                "tags",
                e.target.value
                  .split(/[,，]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            placeholder="纪念日，周末，小确幸"
          />
        </Field>
        <Field label="属于这个地点的小故事">
          <textarea
            rows={5}
            maxLength={10000}
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="记得那天的风，也记得我们聊了很久…"
          />
        </Field>
        <div className="field">
          <span>地点照片</span>
          <PhotoPicker
            ids={form.photoIds}
            onChange={(ids) => set("photoIds", ids)}
          />
        </div>
        <Badge>
          {form.provider === "amap"
            ? "地点来源：高德地图"
            : "地点来源：手动创建"}
        </Badge>
        <div className="form-actions">
          <SaveButton busy={busy}>保存地点与故事</SaveButton>
          {id && (
            <Link to={`/orders/new?place=${id}`} className="button secondary">
              <Heart size={16} />
              关联一份心意
            </Link>
          )}
          {latitude && longitude && (
            <button
              type="button"
              className="button ghost"
              onClick={() => {
                void run(async () => {
                  const c = coordinate();
                  if (c)
                    await platform.openExternal(navigationUrl(form.name, c));
                });
              }}
            >
              <Navigation size={16} />
              外部导航
            </button>
          )}
        </div>
      </Form>
      {confirm && (
        <Modal title="将这个地点移入回收站？" onClose={() => setConfirm(false)}>
          <p>地点记录和照片引用可恢复，关联心意与胶囊中的地点快照会保留。</p>
          <button
            className="button danger"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await softDelete("places", id!);
                notice({
                  text: "地点已移入回收站",
                  undo: () => restoreRecord("places", id!),
                });
                navigate(`/maps/${mapId}`);
              });
            }}
          >
            移入回收站
          </button>
        </Modal>
      )}
    </>
  );
}

export function DiscoverPage() {
  const [params] = useSearchParams();
  const { maps, profiles } = useData();
  const settings = useSettings();
  const navigate = useNavigate();
  const notice = useNotice();
  const { run, busy } = useAction();
  const [city, setCity] = useState(params.get("city") || settings.city);
  const [keyword, setKeyword] = useState(params.get("keyword") || "");
  const [category, setCategory] = useState("");
  const [mapId, setMapId] = useState(params.get("map") || "");
  const [results, setResults] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [view, setView] = useState("split");
  const [page, setPage] = useState(1);
  const [viewport, setViewport] = useState<Viewport>();
  const [radius, setRadius] = useState(3000);
  const [scene, setScene] = useState("周末探索");
  const [focus, setFocus] = useState({ id: "", seq: 0 });
  const requests = useRef(new LatestRequest());
  const searchSequence = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastQuery = useRef<Parameters<typeof services.search>[0] | undefined>(
    undefined,
  );
  const searchLatest = useRef<
    (inArea?: boolean, nextPage?: number) => Promise<void>
  >(async () => {});
  const filterKey = JSON.stringify([city, keyword, category]);
  const previousFilters = useRef(filterKey);
  useEffect(() => {
    const manager = requests.current;
    const sequence = searchSequence;
    return () => {
      manager.cancel();
      sequence.current++;
      clearTimeout(debounceTimer.current);
    };
  }, []);
  useEffect(() => {
    if (previousFilters.current === filterKey) return;
    previousFilters.current = filterKey;
    requests.current.cancel();
    searchSequence.current++;
    setLoading(false);
    setResults([]);
    setSearched(false);
    clearTimeout(debounceTimer.current);
    if (city.trim())
      debounceTimer.current = setTimeout(() => {
        void searchLatest.current();
      }, 400);
    return () => clearTimeout(debounceTimer.current);
  }, [filterKey, city]);
  const search = async (inArea = false, nextPage = 1) => {
    clearTimeout(debounceTimer.current);
    if (!city.trim() && !inArea) {
      notice({ text: "请先选择城市，或在底图上选择区域", error: true });
      return;
    }
    const sequence = ++searchSequence.current;
    const query =
      nextPage > 1 && lastQuery.current
        ? { ...lastQuery.current, page: nextPage }
        : {
            keyword,
            city,
            category,
            page: nextPage,
            ...(inArea && viewport
              ? {
                  longitude: viewport.center.longitude,
                  latitude: viewport.center.latitude,
                  radius,
                }
              : {}),
          };
    lastQuery.current = query;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const response = await requests.current.run((signal) =>
        services.search(query, signal),
      );
      setResults((old) =>
        nextPage > 1
          ? [...old, ...response.filter((p) => !old.some((o) => o.id === p.id))]
          : response,
      );
      setPage(nextPage);
    } catch (e) {
      if (
        sequence === searchSequence.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      ) {
        setResults([]);
        setError(e instanceof Error ? e.message : "搜索失败");
      }
    } finally {
      if (sequence === searchSequence.current) setLoading(false);
    }
  };
  searchLatest.current = search;
  const displayPlaces = useMemo(
    () =>
      results.map((p, index) =>
        placeSchema.parse({
          ...newEntity(),
          id: p.id,
          mapId: "discover",
          name: p.name,
          address: p.address,
          city: p.city,
          coordinate: p.coordinate,
          provider: "amap",
          poiId: p.id,
          category: p.category,
          sortOrder: index,
        }),
      ),
    [results],
  );
  const add = (p: Poi) => {
    if (!mapId) {
      notice({ text: "请先选择要收藏到的私人地图", error: true });
      return;
    }
    navigate(`/maps/${mapId}/places/new`, { state: { poi: p } });
  };
  return (
    <>
      <PageTitle
        eyebrow="DISCOVER A LITTLE WARMTH"
        title="在城市里，遇见新的喜欢"
        description="真实地点来自高德地图；未配置服务时，可先手动记录地点。"
      />
      <Form
        className="discovery-search"
        onSubmit={() => {
          void search();
        }}
      >
        <Field label="探索城市">
          <input
            value={city}
            maxLength={100}
            placeholder="输入城市"
            onChange={(e) => {
              requests.current.cancel();
              setLoading(false);
              setCity(e.target.value);
              setResults([]);
              setSearched(false);
            }}
          />
        </Field>
        <Field label="想找什么">
          <input
            value={keyword}
            maxLength={100}
            placeholder="咖啡馆、甜品或地点名称"
            onChange={(e) => setKeyword(e.target.value)}
          />
        </Field>
        <button className="button primary" disabled={loading} type="submit">
          <Search size={17} />
          {loading ? "搜索中…" : "发现地点"}
        </button>
      </Form>
      <div className="discovery-toolbar">
        <div className="filter-row">
          {["", "咖啡馆", "饮品", "甜品", "小吃", "餐厅", "公园"].map((c) => (
            <button
              key={c}
              className={`chip ${category === c ? "selected" : ""}`}
              onClick={() => setCategory(c)}
            >
              {c || "全部分类"}
            </button>
          ))}
        </div>
        <div className="segmented">
          <button
            className={view === "split" ? "active" : ""}
            aria-label="地图与列表"
            onClick={() => setView("split")}
          >
            <MapIcon size={17} />
          </button>
          <button
            className={view === "list" ? "active" : ""}
            aria-label="仅地点列表"
            onClick={() => setView("list")}
          >
            <List size={17} />
          </button>
        </div>
      </div>
      <details className="discovery-options">
        <summary>
          <SlidersHorizontal size={15} />
          更多探索选项
        </summary>
        <div className="form-grid">
          <Field label="收礼人城市">
            <select
              defaultValue=""
              onChange={(e) => {
                const p = profiles.find((p) => p.id === e.target.value);
                if (p) {
                  requests.current.cancel();
                  setCity(p.city);
                  setResults([]);
                }
              }}
            >
              <option value="">不使用档案城市</option>
              {profiles.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name} · {p.city || "未填写城市"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="这次的场景">
            <select value={scene} onChange={(e) => setScene(e.target.value)}>
              {[
                "安慰一下",
                "生日惊喜",
                "纪念日",
                "约会见面",
                "异地送暖",
                "周末探索",
                "深夜慰藉",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="当前地图中心附近范围">
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            >
              <option value={1000}>1 公里</option>
              <option value={3000}>3 公里</option>
              <option value={10000}>10 公里</option>
            </select>
          </Field>
        </div>
        <p>
          范围以当前地图中心为基准，不代表你或 TA
          到商家的实际距离。当前数据源未提供可靠价格与营业状态，因此不展示对应筛选。
        </p>
      </details>
      <div className="save-to-map">
        <LockKeyhole size={16} />
        <label>
          收藏到
          <select
            aria-label="收藏到私人地图"
            value={mapId}
            onChange={(e) => setMapId(e.target.value)}
          >
            <option value="">选择一张私人地图</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </label>
        <Link to="/maps/new">
          新建地图
          <Plus size={14} />
        </Link>
      </div>
      <div className={`discover-results ${view === "list" ? "list-only" : ""}`}>
        {view === "split" && (
          <div className="discover-map">
            <MapView
              id="discovery"
              city={city}
              places={displayPlaces}
              selected={selected}
              focusId={focus.id}
              focusSequence={focus.seq}
              onSelect={setSelected}
              onViewport={setViewport}
            />
            {viewport && (
              <button
                className="button secondary area-search"
                disabled={loading}
                onClick={() => {
                  void search(true);
                }}
              >
                搜索此区域
              </button>
            )}
          </div>
        )}
        <div className="discover-list">
          {error ? (
            <div role="alert" className="service-error">
              <MapPin size={28} />
              <h3>这次还没找到在线的答案</h3>
              <p>{error}</p>
              <Link to="/settings" className="button secondary">
                查看服务配置
              </Link>
            </div>
          ) : results.length ? (
            results.map((p) => (
              <article
                key={p.id}
                className={`poi-card ${selected === p.id ? "selected" : ""}`}
              >
                <button
                  className="poi-main"
                  onClick={() => {
                    setSelected(p.id);
                    setFocus((f) => ({ id: p.id, seq: f.seq + 1 }));
                  }}
                >
                  <Badge tone="sage">{p.category}</Badge>
                  <h3>{p.name}</h3>
                  <p>
                    {p.city} · {p.address}
                  </p>
                  <small>
                    {p.source} · {scene}的待选地点（请自行核实是否适合）
                  </small>
                </button>
                <div className="poi-actions">
                  <button className="button secondary" onClick={() => add(p)}>
                    <Plus size={15} />
                    收藏到地图
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`将${p.name}加入心意`}
                    disabled={busy}
                    onClick={() => {
                      void run(async () => {
                        await saveRecord("orders", {
                          ...newEntity(),
                          title: `在${p.name}准备一份心意`,
                          profileName: "TA",
                          placeSnapshot: snapshot(p),
                          source: "map",
                          note: `场景：${scene}`,
                        });
                        notice({ text: "已加入心意清单" });
                      });
                    }}
                  >
                    <Heart size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`导航到${p.name}`}
                    onClick={() => {
                      void run(() =>
                        platform.openExternal(
                          navigationUrl(p.name, p.coordinate),
                        ),
                      );
                    }}
                  >
                    <Navigation size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`复制${p.name}地址`}
                    onClick={() => {
                      void run(async () => {
                        await navigator.clipboard.writeText(
                          `${p.name}\n${p.address}`,
                        );
                        notice({ text: "地址已复制" });
                      });
                    }}
                  >
                    <Share2 size={17} />
                  </button>
                </div>
              </article>
            ))
          ) : (
            <Empty
              title={
                searched ? "没有找到匹配地点" : "从一座城市、一个关键词开始"
              }
            >
              {searched
                ? "试试其他关键词或稍大一点的区域。"
                : "你的下一份喜欢，也许就在转角。"}
            </Empty>
          )}
          {results.length >= page * 20 && (
            <button
              className="button secondary"
              disabled={loading}
              onClick={() => {
                void search(false, page + 1);
              }}
            >
              加载更多
            </button>
          )}
        </div>
      </div>
    </>
  );
}
