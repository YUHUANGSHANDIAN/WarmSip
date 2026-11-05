import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plus,
  Heart,
  Hourglass,
  Trash2,
  MapPin,
  ArrowRight,
  Utensils,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import { useData, useSettings } from "../components/data";
import { AIWritingAssistant } from "../components/AIWriting";
import {
  PageTitle,
  Empty,
  Field,
  Form,
  SaveButton,
  Modal,
  Badge,
  useAction,
  useNotice,
  formatDate,
  Photo,
  PhotoPicker,
} from "../components/ui";
import { db, saveRecord, softDelete, restoreRecord } from "../storage/db";
import {
  newEntity,
  orderSchema,
  capsuleSchema,
  type Order,
  type Capsule,
  snapshot,
  aiCityGuideResultSchema,
  orderStatusLabels,
} from "../domain";
import { canOpen, localDate } from "../services/time";
import { services } from "../services/api";
import { platform } from "../platform";

export function OrdersPage() {
  const { orders } = useData();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"updated" | "date">("updated");
  const { run } = useAction();
  const notice = useNotice();
  const visible = orders
    .filter((o) => filter === "all" || o.status === filter)
    .filter(
      (o) =>
        !search ||
        o.title.includes(search) ||
        o.profileName.includes(search) ||
        o.placeSnapshot?.name.includes(search),
    )
    .sort((a, b) =>
      sort === "date"
        ? (a.expectDate || "9999").localeCompare(b.expectDate || "9999")
        : b.updatedAt - a.updatedAt,
    );
  return (
    <>
      <PageTitle
        eyebrow="LITTLE ACTS OF LOVE"
        title="把心意，慢慢实现"
        description="记录想为 TA 做的事，留住每一个认真准备的瞬间。"
        action={
          <Link className="button primary" to="/orders/new">
            <Plus size={17} />
            记录一份心意
          </Link>
        }
      />
      <div className="subnav">
        <Link className="active" to="/orders">
          <Heart size={17} />
          心意清单
        </Link>
        <Link to="/capsules">
          <Hourglass size={17} />
          时间胶囊
        </Link>
        <Link to="/history">推荐历史</Link>
      </div>
      <div className="filter-row">
        {[
          ["all", "全部心意"],
          ...(
            [
              "draft",
              "planned",
              "preparing",
              "ready",
              "gifted",
              "completed",
            ] as const
          ).map((status) => [status, orderStatusLabels[status]] as const),
        ].map(([key, label]) => (
          <button
            key={key}
            className={`chip ${filter === key ? "selected" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="record-toolbar">
        <label className="search-input">
          <input
            aria-label="搜索心意"
            value={search}
            placeholder="搜索标题、TA 或地点"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label="心意排序"
          value={sort}
          onChange={(event) => setSort(event.target.value as "updated" | "date")}
        >
          <option value="updated">最近更新</option>
          <option value="date">按期望日期</option>
        </select>
      </div>
      {visible.length ? (
        <div className="record-grid">
          {visible.map((o) => (
            <article className="order-card" key={o.id}>
              <div className="section-heading">
                <div className="quick-icon rose">
                  <Heart size={21} />
                </div>
                <Badge tone={o.status === "completed" ? "sage" : "warm"}>
                  {orderStatusLabels[o.status]}
                </Badge>
              </div>
              <Link to={`/orders/${o.id}`}>
                <h2>{o.title}</h2>
                <p>
                  给 {o.profileName} · {o.expectDate || "选一个合适的日子"}
                </p>
                {o.placeSnapshot && (
                  <p className="small-link">
                    <MapPin size={14} />
                    {o.placeSnapshot.name}
                  </p>
                )}
                {o.reminderAt && (
                  <p className="small-link">
                    <Hourglass size={14} />
                    应用内提醒 {new Date(o.reminderAt).toLocaleString("zh-CN")}
                  </p>
                )}
                <p className="record-excerpt">
                  {o.items.map((x) => x.name).join(" · ") ||
                    o.note ||
                    "一份简单的关心，也有自己的分量。"}
                </p>
              </Link>
              <div className="card-footer">
                <span>预算 ¥{o.budget}</span>
                <select
                  className="status-select"
                  aria-label={`${o.title}的状态`}
                  value={o.status === "pending" ? "planned" : o.status}
                  onChange={(event) => {
                    const status = event.target.value as Order["status"];
                    void run(async () => {
                      await saveRecord("orders", { ...o, status });
                      notice({ text: `状态已更新为${orderStatusLabels[status]}` });
                    });
                  }}
                >
                  {(
                    ["draft", "planned", "preparing", "ready", "gifted", "completed"] as const
                  ).map((status) => (
                    <option value={status} key={status}>
                      {orderStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={filter === "all" ? "第一份心意，从这里开始" : "这里还没有记录"}
          action={
            <Link className="button primary" to="/orders/new">
              <Plus size={17} />
              记录心意
            </Link>
          }
        >
          一杯暖饮，一次散步，或一个记了很久的小愿望。
        </Empty>
      )}
      <p className="section-footnote">
        心意清单是个人记录，不代表已经支付、下单、采购或配送。
      </p>
    </>
  );
}
export function OrderForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const notice = useNotice();
  const { busy, run } = useAction();
  const { profiles, places } = useData();
  const existing = useLiveQuery(
    () => (id ? db.orders.get(id) : undefined),
    [id],
  );
  const [form, setForm] = useState<Order>(() =>
    orderSchema.parse({ ...newEntity(), title: "一份小心意" }),
  );
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (existing) setForm(existing);
  }, [existing]);
  const linked = places.find((p) => p.id === params.get("place"));
  useEffect(() => {
    if (!id && linked)
      setForm((f) => ({
        ...f,
        title: `想在${linked.name}送出的心意`,
        placeId: linked.id,
        placeSnapshot: snapshot(linked),
        profileId: linked.profileId,
      }));
  }, [id, linked]);
  const set = (key: keyof Order, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <>
      <PageTitle
        back
        eyebrow="MAKE A LITTLE WISH HAPPEN"
        title={id ? "编辑这份心意" : "记录一份心意"}
        action={
          id && (
            <button
              className="button danger ghost"
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={16} />
              删除记录
            </button>
          )
        }
      />
      <Form
        onSubmit={() => {
          void run(async () => {
            if (
              form.expectDate &&
              form.expectDate < localDate() &&
              form.expectDate !== existing?.expectDate
            )
              throw new Error("新的期望日期不能早于今天");
            const profile = profiles.find((p) => p.id === form.profileId);
            await saveRecord("orders", {
              ...form,
              profileName: profile?.name || form.profileName,
            });
            notice({ text: "心意已保存" });
            navigate("/orders");
          });
        }}
      >
        <Field label="这份心意的名字">
          <input
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="送给谁">
            <select
              value={form.profileId}
              onChange={(e) => set("profileId", e.target.value)}
            >
              <option value="">{form.profileName || "TA"}（不关联档案）</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="预算（元）">
            <input
              required
              type="number"
              min={0}
              max={1000000}
              step="0.01"
              value={form.budget}
              onChange={(e) => set("budget", e.target.valueAsNumber)}
            />
          </Field>
          <Field label="期望日期（可选）">
            <input
              type="date"
              value={form.expectDate}
              onChange={(e) => set("expectDate", e.target.value)}
            />
          </Field>
          <Field label="当前状态">
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {(
                ["draft", "planned", "preparing", "ready", "gifted", "completed"] as const
              ).map((status) => (
                <option value={status} key={status}>
                  {orderStatusLabels[status]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="应用内提醒时间（可选）">
            <input
              type="datetime-local"
              value={form.reminderAt}
              onChange={(event) => set("reminderAt", event.target.value)}
            />
          </Field>
        </div>
        <Field label="关联地点">
          <select
            value={form.placeId}
            onChange={(e) => {
              const p = places.find((p) => p.id === e.target.value);
              setForm((f) => ({
                ...f,
                placeId: p?.id || "",
                placeSnapshot: p ? snapshot(p) : null,
              }));
            }}
          >
            <option value="">不关联地点</option>
            {places.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {form.placeSnapshot && (
          <div className="linked-place">
            <MapPin size={18} />
            <div>
              <strong>{form.placeSnapshot.name}</strong>
              <p>{form.placeSnapshot.address || form.placeSnapshot.city}</p>
            </div>
          </div>
        )}
        {form.items.length > 0 && (
          <div className="info-panel">
            {form.items.map((i, n) => (
              <p key={n}>
                {i.name} · {i.reason}
              </p>
            ))}
          </div>
        )}
        <Field label="想说的话">
          <textarea
            rows={3}
            maxLength={2000}
            value={form.blessing}
            onChange={(e) => set("blessing", e.target.value)}
          />
          <AIWritingAssistant
            source={form.blessing || "想为这份心意写一句真诚的话。"}
            label="润色想说的话"
            onApply={(blessing) => set("blessing", blessing)}
          />
        </Field>
        <Field label="私人备注">
          <textarea
            rows={4}
            maxLength={10000}
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
        <div className="form-actions">
          <SaveButton busy={busy}>保存心意</SaveButton>
        </div>
      </Form>
      {confirm && (
        <Modal title="将这份心意移入回收站？" onClose={() => setConfirm(false)}>
          <p>地图地点和收礼人档案仍会保留。</p>
          <button
            className="button danger"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await softDelete("orders", id!);
                notice({
                  text: "心意已移入回收站",
                  undo: () => restoreRecord("orders", id!),
                });
                navigate("/orders");
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
export function CapsulesPage() {
  const { capsules } = useData();
  return (
    <>
      <PageTitle
        eyebrow="A LETTER TO THE FUTURE"
        title="时间胶囊"
        description="把今天的心意，交给未来的某一天。"
        action={
          <Link to="/capsules/new" className="button primary">
            <Plus size={17} />
            封存一份期待
          </Link>
        }
      />
      <div className="subnav">
        <Link to="/orders">
          <Heart size={17} />
          心意清单
        </Link>
        <Link className="active" to="/capsules">
          <Hourglass size={17} />
          时间胶囊
        </Link>
      </div>
      {capsules.length ? (
        <div className="record-grid">
          {capsules.map((c) => (
            <Link
              className={`capsule-card ${c.openedAt ? "opened" : ""}`}
              to={`/capsules/${c.id}`}
              key={c.id}
            >
              <div className="capsule-stamp">
                <Hourglass size={32} />
              </div>
              <Badge tone={c.openedAt ? "sage" : "lavender"}>
                {c.openedAt
                  ? "已经打开"
                  : canOpen(c)
                    ? "可以开启啦"
                    : "等待开启"}
              </Badge>
              <h2>{c.title}</h2>
              <p>
                {c.openDate} · {c.timeZone}
              </p>
              <span>
                {c.openedAt ? "重温这份心意" : "留给未来的一个小约定"}
                <ArrowRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="给未来留一点期待"
          action={
            <Link to="/capsules/new" className="button primary">
              <Hourglass size={16} />
              创建时间胶囊
            </Link>
          }
        >
          一句想说的话，一个想一起去的地方，等到约定那天再打开。
        </Empty>
      )}
    </>
  );
}
export function CapsuleForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notice = useNotice();
  const settings = useSettings();
  const { maps, places } = useData();
  const { busy, run } = useAction();
  const existing = useLiveQuery(
    () => (id ? db.capsules.get(id) : undefined),
    [id],
  );
  const [form, setForm] = useState<Capsule>(() =>
    capsuleSchema.parse({
      ...newEntity(),
      title: "给未来的一点温暖",
      content: "想在那天告诉你…",
      openDate: localDate(),
      timeZone: settings.timeZone,
    }),
  );
  useEffect(() => {
    if (existing) setForm(existing);
  }, [existing]);
  const set = (key: keyof Capsule, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <>
      <PageTitle
        back
        eyebrow="SEALED WITH A LITTLE WARMTH"
        title={id ? "编辑时间胶囊" : "封存一份期待"}
        description="从约定日期的当地零点开始，就可以打开。"
      />
      <Form
        onSubmit={() => {
          void run(async () => {
            await saveRecord("capsules", form);
            notice({ text: "时间胶囊已保存" });
            navigate("/capsules");
          });
        }}
      >
        <Field label="胶囊标题">
          <input
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <Field label="想留给未来的话">
          <textarea
            required
            rows={7}
            maxLength={20000}
            value={form.content}
            onChange={(e) => set("content", e.target.value)}
          />
          <AIWritingAssistant
            source={form.content}
            label="润色胶囊内容"
            scene="写给未来"
            onApply={(content) => set("content", content)}
          />
        </Field>
        <div className="form-grid">
          <Field label="开启日期">
            <input
              required
              type="date"
              value={form.openDate}
              onChange={(e) => set("openDate", e.target.value)}
            />
          </Field>
          <Field label="开启时区">
            <input
              required
              list="timezones"
              value={form.timeZone}
              onChange={(e) => set("timeZone", e.target.value)}
            />
            <datalist id="timezones">
              {[
                "Asia/Shanghai",
                "Asia/Tokyo",
                "Europe/London",
                "America/New_York",
                "UTC",
              ].map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </Field>
          <Field label="关联暖迹地图">
            <select
              value={form.mapId}
              onChange={(e) => set("mapId", e.target.value)}
            >
              <option value="">不关联地图</option>
              {maps.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="关联地点">
            <select
              value={form.placeId}
              onChange={(e) => {
                const place = places.find((p) => p.id === e.target.value);
                setForm((f) => ({
                  ...f,
                  placeId: place?.id || "",
                  placeSnapshot: place ? snapshot(place) : null,
                }));
              }}
            >
              <option value="">不关联地点</option>
              {places
                .filter((p) => !form.mapId || p.mapId === form.mapId)
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <PhotoPicker
          ids={form.photoIds}
          max={4}
          label="添加一张未来记忆"
          onChange={(photoIds) => set("photoIds", photoIds)}
        />
        <div className="form-actions">
          <SaveButton busy={busy}>保存时间胶囊</SaveButton>
        </div>
      </Form>
    </>
  );
}
export function CapsuleDetail() {
  const { id } = useParams();
  const capsule = useLiveQuery(() => db.capsules.get(id!), [id]);
  const { run, busy } = useAction();
  const notice = useNotice();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  if (!capsule) return <div className="loading-state">正在寻找这份期待…</div>;
  return (
    <>
      <PageTitle
        back
        title="时间胶囊"
        action={
          <Link to={`/capsules/${id}/edit`} className="button secondary">
            编辑胶囊
          </Link>
        }
      />
      <article className="capsule-letter">
        <div className="capsule-stamp">
          {capsule.openedAt ? <Heart size={38} /> : <LockKeyhole size={38} />}
        </div>
        <Badge tone="lavender">
          {capsule.openedAt ? "已经开启" : "写给未来的你"}
        </Badge>
        <h1>{capsule.title}</h1>
        <p>
          {capsule.openDate} · {capsule.timeZone}
        </p>
        {capsule.openedAt ? (
          <>
            <div className="letter-text">{capsule.content}</div>
            {capsule.blessing && <p>{capsule.blessing}</p>}
            {capsule.photoIds.length > 0 && (
              <div className="photo-grid capsule-photos">
                {capsule.photoIds.map((photoId) => (
                  <Photo key={photoId} id={photoId} alt={capsule.title} />
                ))}
              </div>
            )}
            {capsule.placeSnapshot && (
              <div className="linked-place">
                <MapPin />
                <div>
                  <h3>{capsule.placeSnapshot.name}</h3>
                  <p>{capsule.placeSnapshot.address}</p>
                </div>
              </div>
            )}
            {capsule.mapId && (
              <Link to={`/maps/${capsule.mapId}`} className="text-link">
                打开关联地图
                <ArrowRight size={16} />
              </Link>
            )}
          </>
        ) : canOpen(capsule) ? (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                if (!canOpen(capsule)) throw new Error("还没有到约定的日期");
                await saveRecord("capsules", {
                  ...capsule,
                  openedAt: Date.now(),
                });
                notice({ text: "这份温暖，终于抵达今天" });
              });
            }}
          >
            <Heart size={17} />
            开启时间胶囊
          </button>
        ) : (
          <p className="capsule-wait">
            还没到约定的日子。
            <br />
            让这份期待，再慢慢酝酿一会儿。
          </p>
        )}
        <small>封存于 {formatDate(capsule.createdAt)}</small>
        {capsule.openedAt && (
          <button className="text-link" onClick={() => setSharing(true)}>
            分享这份温暖
          </button>
        )}
        <button className="text-link danger" onClick={() => setConfirm(true)}>
          移入回收站
        </button>
      </article>
      {confirm && (
        <Modal title="将时间胶囊移入回收站？" onClose={() => setConfirm(false)}>
          <p>胶囊可在回收站恢复，关联地图与地点不受影响。</p>
          <button
            className="button danger"
            onClick={() => {
              void run(async () => {
                await softDelete("capsules", id!);
                notice({
                  text: "胶囊已移入回收站",
                  undo: () => restoreRecord("capsules", id!),
                });
                navigate("/capsules");
              });
            }}
          >
            移入回收站
          </button>
        </Modal>
      )}
      {sharing && (
        <Modal title="分享前，确认内容" onClose={() => setSharing(false)}>
          <p>将分享标题、正文和祝福。照片、地点快照和关联人不会自动包含。</p>
          <pre className="share-preview">
            {capsule.title}
            {"\n\n"}
            {capsule.content}
            {capsule.blessing ? `\n\n${capsule.blessing}` : ""}
            {"\n\nWarmSip · 给 TA 点一杯温暖"}
          </pre>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await platform.share(
                  `${capsule.title}\n\n${capsule.content}${capsule.blessing ? `\n\n${capsule.blessing}` : ""}\n\nWarmSip · 给 TA 点一杯温暖`,
                );
                setSharing(false);
                notice({ text: "已交给系统分享或复制到剪贴板" });
              })
            }
          >
            确认分享
          </button>
        </Modal>
      )}
    </>
  );
}
export function CityPage() {
  const settings = useSettings();
  const [city, setCity] = useState(settings.city);
  const [guide, setGuide] = useState<{
    title: string;
    summary: string;
    themes: { name: string; why: string }[];
    searchSuggestions: string[];
  }>();
  const { busy, run } = useAction();
  const notice = useNotice();
  const generateGuide = () =>
    run(async () => {
      if (!settings.aiEnabled) throw new Error("请先在设置中启用 AI");
      if (!city.trim()) throw new Error("请先选择城市");
      setGuide(undefined);
      let next: typeof guide;
      let error = "";
      await services.streamAI(
        {
          taskId: "city-guide",
          payload: { city, interests: ["食物", "文化", "散步"] },
          consent: {
            taskId: "city-guide",
            fields: ["城市", "兴趣主题"],
            includesSensitive: false,
            includesPhotos: false,
          },
          budget: {
            dailyUsd: settings.aiBudgetDailyUsd,
            monthlyUsd: settings.aiBudgetMonthlyUsd,
          },
        },
        (event) => {
          if (event.type === "result")
            next = aiCityGuideResultSchema.parse(event.payload);
          if (event.type === "error") error = event.message;
        },
        new AbortController().signal,
      );
      if (error) throw new Error(error);
      if (!next) throw new Error("AI 没有返回可用的城市导览");
      setGuide(next);
      notice({
        text: "导览只提供灵感；点击建议后才会查询真实地点",
      });
    });
  return (
    <>
      <PageTitle
        eyebrow="TASTE A CITY, REMEMBER A MOMENT"
        title="城市味道"
        description="从一顿早餐、一杯咖啡开始，认识一座城市。"
      />
      <section className="city-hero">
        <div>
          <Badge tone="sage">
            <Utensils size={13} />
            循着烟火气出发
          </Badge>
          <h2>
            想和 TA 一起，
            <br />
            尝尝哪座城的味道？
          </h2>
          <p>先选城市，再用真实地点搜索找到落脚的小店。</p>
        </div>
        <div className="city-search">
          <Field label="想探索的城市">
            <input
              value={city}
              placeholder="例如：成都"
              maxLength={100}
              onChange={(e) => setCity(e.target.value)}
            />
          </Field>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={generateGuide}
          >
            <Sparkles size={16} />
            {busy ? "正在编辑导览…" : "生成 AI 城市导览"}
          </button>
          <Link
            className="button primary"
            to={`/discover?city=${encodeURIComponent(city)}`}
          >
            <MapPin size={17} />
            去这座城市发现
          </Link>
        </div>
      </section>
      {guide && (
        <section className="city-ai-guide" aria-labelledby="city-guide-title">
          <Badge tone="sage">AI 城市灵感 · 非实时商家数据</Badge>
          <h2 id="city-guide-title">{guide.title}</h2>
          <p>{guide.summary}</p>
          <div className="ai-guide-themes">
            {guide.themes.map((theme) => (
              <article key={theme.name}>
                <h3>{theme.name}</h3>
                <p>{theme.why}</p>
              </article>
            ))}
          </div>
          <div className="inline-links">
            {guide.searchSuggestions.map((keyword) => (
              <Link
                key={keyword}
                to={`/discover?city=${encodeURIComponent(city)}&keyword=${encodeURIComponent(keyword)}`}
              >
                查找「{keyword}」真实地点
                <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="record-grid">
        {[
          {
            title: "从一顿热乎早餐开始",
            tag: "早餐",
            text: "找一家愿意早起去的小店，坐下来，慢慢吃完今天的第一餐。",
          },
          {
            title: "留一个下午给咖啡",
            tag: "咖啡馆",
            text: "聊天、发呆，或读几页书。合适的地方，让相处不用刻意安排。",
          },
          {
            title: "把夜晚交给街边小吃",
            tag: "小吃",
            text: "走走停停，遇见喜欢的味道就记下来。下一次，还可以带 TA 一起。",
          },
          {
            title: "给普通日子一点甜",
            tag: "甜品",
            text: "不必等到纪念日。一份两个人分享的甜，也可以成为新的记忆。",
          },
        ].map((item, i) => (
          <article className={`city-card city-${i}`} key={item.tag}>
            <span className="city-number">0{i + 1}</span>
            <Badge>{item.tag}</Badge>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
            <Link
              className="text-link"
              to={`/discover?city=${encodeURIComponent(city)}&keyword=${encodeURIComponent(item.tag)}`}
            >
              寻找真实地点
              <ArrowRight size={16} />
            </Link>
          </article>
        ))}
      </div>
      <p className="section-footnote">
        以上为 WarmSip 原创探索灵感，不代表具体商家、实时价格或城市调查结果。
      </p>
    </>
  );
}
