import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Heart, MapPin, Trash2, Sparkles } from "lucide-react";
import { useData } from "../components/data";
import {
  PageTitle,
  Empty,
  Field,
  Form,
  SaveButton,
  Modal,
  useAction,
  useNotice,
  Badge,
} from "../components/ui";
import { db, saveRecord, softDelete, restoreRecord } from "../storage/db";
import { newEntity, profileSchema, type Profile } from "../domain";
export function ProfilesPage() {
  const { profiles, archivedProfiles } = useData();
  const [search, setSearch] = useState("");
  const [relation, setRelation] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const { run } = useAction();
  const notice = useNotice();
  const source = showArchived ? archivedProfiles : profiles;
  const visible = source.filter(
    (profile) =>
      (relation === "all" || profile.relation === relation) &&
      (!search ||
        profile.name.includes(search) ||
        profile.city.includes(search) ||
        profile.likes.includes(search) ||
        profile.tags.some((tag) => tag.includes(search))),
  );
  return (
    <>
      <PageTitle
        eyebrow="PEOPLE I CARE ABOUT"
        title="我在意的人"
        description="重要的不只是名字，还有 TA 喜欢的每一个小细节。"
        action={
          <Link to="/profiles/new" className="button primary">
            <Plus size={17} />
            添加收礼人
          </Link>
        }
      />
      <div className="record-toolbar">
        <label className="search-input">
          <input
            type="search"
            aria-label="搜索 TA"
            placeholder="搜索称呼、城市或标签"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label="按关系筛选"
          value={relation}
          onChange={(event) => setRelation(event.target.value)}
        >
          <option value="all">全部关系</option>
          {["朋友", "伴侣", "家人", "同事", "自己", "其他"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <button
          type="button"
          className={`button ${showArchived ? "secondary" : "ghost"}`}
          aria-pressed={showArchived}
          onClick={() => setShowArchived((value) => !value)}
        >
          已归档 {archivedProfiles.length}
        </button>
      </div>
      {visible.length ? (
        <div className="profile-grid">
          {visible.map((p, i) => (
            <article className="profile-card" key={p.id}>
              <Link to={`/profiles/${p.id}`} className="profile-main">
                <div className={`avatar avatar-${i % 4}`}>
                  {p.name.slice(0, 1)}
                </div>
                <Badge>{p.relation}</Badge>
                <h2>{p.name}</h2>
                <p>
                  <MapPin size={14} />
                  {p.city || "还未记录城市"}
                </p>
                <div className="profile-preferences">
                  {p.likes || "还可以多记住一点 TA 的喜好。"}
                </div>
                {p.tags.length > 0 && (
                  <div className="profile-tags">
                    {p.tags.slice(0, 4).map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                )}
              </Link>
              <div className="profile-actions">
                <Link to={`/gifts?profile=${p.id}`} className="button secondary">
                  <Sparkles size={16} />为 TA 选礼
                </Link>
                <button
                  className="button ghost"
                  onClick={() =>
                    void run(async () => {
                      await saveRecord("profiles", {
                        ...p,
                        archivedAt: showArchived ? null : Date.now(),
                      });
                      notice({
                        text: showArchived ? "档案已恢复" : "档案已归档，可随时恢复",
                      });
                    })
                  }
                >
                  {showArchived ? "恢复" : "归档"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={showArchived ? "归档是空的" : search ? "没有匹配的人" : "先记住一个重要的人"}
          action={
            <Link to="/profiles/new" className="button primary">
              <Plus size={16} />
              添加收礼人
            </Link>
          }
        >
          {showArchived
            ? "归档不会删除地图、心意或胶囊，也不会把它们上传。"
            : "喜欢的甜度、常去的城市、需要避开的食物，都值得被认真记住。"}
        </Empty>
      )}
    </>
  );
}
export function ProfileForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotice();
  const { busy, run } = useAction();
  const existing = useLiveQuery(
    () => (id ? db.profiles.get(id) : undefined),
    [id],
  );
  const { maps, orders, recommendations, capsules } = useData();
  const [form, setForm] = useState<Profile>(() => {
    const profile = profileSchema.parse({
      ...newEntity(),
      name: "新的 TA",
    });
    return { ...profile, name: "" };
  });
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (existing) setForm(existing);
  }, [existing]);
  const set = (key: keyof Profile, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <>
      <PageTitle
        back
        eyebrow="A PERSON WORTH REMEMBERING"
        title={id ? "TA 的小档案" : "认识一位重要的 TA"}
        description="这些细节只保存在你的设备里。"
        action={
          id && (
            <button
              className="button danger ghost"
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={16} />
              删除档案
            </button>
          )
        }
      />
      <Form
        onSubmit={() => {
          void run(async () => {
            await saveRecord("profiles", form);
            notify({ text: "已记住 TA 的小细节" });
            navigate("/profiles");
          });
        }}
      >
        <div className="form-intro">
          <div className="quick-icon rose">
            <Heart />
          </div>
          <div>
            <h2>关于 TA</h2>
            <p>你想怎样称呼这位特别的人？</p>
          </div>
        </div>
        <div className="form-grid">
          <Field label="称呼">
            <input
              required
              maxLength={80}
              value={form.name}
              placeholder="例如：妈妈、小林、未来的自己"
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="你们的关系">
            <select
              value={form.relation}
              onChange={(e) => set("relation", e.target.value)}
            >
              {["朋友", "伴侣", "家人", "同事", "自己", "其他"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="TA 所在的城市" hint="异地送暖时优先使用这座城市。">
            <input
              value={form.city}
              maxLength={100}
              placeholder="例如：杭州"
              onChange={(e) => set("city", e.target.value)}
            />
          </Field>
          <Field label="口味偏好">
            <input
              value={form.likes}
              maxLength={1000}
              placeholder="例如：少糖、喜欢桂花香"
              onChange={(e) => set("likes", e.target.value)}
            />
          </Field>
          <Field label="预算偏好">
            <div className="inline-range">
              <input
                type="number"
                min={0}
                aria-label="最低预算"
                value={form.budgetMin || ""}
                onChange={(event) =>
                  set("budgetMin", Number(event.target.value) || 0)
                }
                placeholder="最低"
              />
              <span>至</span>
              <input
                type="number"
                min={0}
                aria-label="最高预算"
                value={form.budgetMax || ""}
                onChange={(event) =>
                  set("budgetMax", Number(event.target.value) || 0)
                }
                placeholder="最高"
              />
            </div>
          </Field>
        </div>
        <Field label="标签（用逗号分开）">
          <input
            value={form.tags.join("，")}
            onChange={(event) =>
              set(
                "tags",
                event.target.value
                  .split(/[,，]/)
                  .map((value) => value.trim())
                  .filter(Boolean)
                  .slice(0, 20),
              )
            }
            placeholder="例如：桂花、手写、周末散步"
          />
        </Field>
        <details className="sensitive-details">
          <summary>敏感偏好与备注</summary>
          <p className="muted">
            默认保存在本机。只有你在任务中明确选择时，才会向已配置的 AI 服务发送。
          </p>
          <div className="form-grid">
          <Field label="过敏与忌口">
            <input
              value={form.allergies}
              maxLength={1000}
              placeholder="例如：花生过敏、不吃海鲜"
              onChange={(e) => set("allergies", e.target.value)}
            />
          </Field>
          <Field label="饮食需求">
            <input
              value={form.diet}
              maxLength={1000}
              placeholder="例如：不含咖啡因、素食"
              onChange={(e) => set("diet", e.target.value)}
            />
          </Field>
          <Field label="身体状态（仅本地保存）">
            <input
              value={form.health}
              maxLength={1000}
              placeholder="只记录你有必要记住的信息"
              onChange={(e) => set("health", e.target.value)}
            />
          </Field>
          </div>
          <Field label="私人的小备注">
            <textarea
              rows={3}
              value={form.note}
              maxLength={5000}
              onChange={(e) => set("note", e.target.value)}
              placeholder="那些想记住的小事…"
            />
          </Field>
        </details>
        <div className="section-heading compact">
          <h3>值得记住的日子</h3>
          <button
            type="button"
            className="text-link"
            onClick={() =>
              set("anniversaries", [
                ...form.anniversaries,
                { name: "纪念日", date: "" },
              ])
            }
          >
            <Plus size={15} />
            添加日期
          </button>
        </div>
        {form.anniversaries.map((a, i) => (
          <div className="anniversary-input" key={i}>
            <input
              aria-label={`纪念日 ${i + 1} 名称`}
              required
              value={a.name}
              onChange={(e) =>
                set(
                  "anniversaries",
                  form.anniversaries.map((v, n) =>
                    n === i ? { ...v, name: e.target.value } : v,
                  ),
                )
              }
            />
            <input
              aria-label={`纪念日 ${i + 1} 日期`}
              type="date"
              required
              value={a.date}
              onChange={(e) =>
                set(
                  "anniversaries",
                  form.anniversaries.map((v, n) =>
                    n === i ? { ...v, date: e.target.value } : v,
                  ),
                )
              }
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`移除纪念日 ${i + 1}`}
              onClick={() =>
                set(
                  "anniversaries",
                  form.anniversaries.filter((_, n) => n !== i),
                )
              }
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        <div className="form-actions">
          <SaveButton busy={busy}>保存 TA 的档案</SaveButton>
          <Link to="/profiles" className="button ghost">
            取消
          </Link>
        </div>
      </Form>
      {id && (
        <section className="profile-connected">
          <h2>和 TA 有关的记录</h2>
          <div className="profile-connected-grid">
            <div>
              <h3>暖迹地图</h3>
              <div className="inline-links">
                {maps
                  .filter((m) => m.profileId === id)
                  .map((m) => (
                    <Link key={m.id} to={`/maps/${m.id}`}>
                      {m.title}
                    </Link>
                  ))}
                <Link to={`/maps/new?profile=${id}`}>
                  <Plus size={15} />
                  创建关联地图
                </Link>
              </div>
            </div>
            <div>
              <h3>心意计划</h3>
              <div className="inline-links">
                {orders
                  .filter((order) => order.profileId === id)
                  .slice(0, 5)
                  .map((order) => (
                    <Link key={order.id} to={`/orders/${order.id}`}>
                      {order.title}
                    </Link>
                  ))}
                <Link to="/orders/new">
                  <Plus size={15} />
                  记录一份心意
                </Link>
              </div>
            </div>
            <div>
              <h3>最近灵感</h3>
              <div className="inline-links">
                {recommendations
                  .filter((recommendation) => recommendation.profileId === id)
                  .slice(0, 3)
                  .map((recommendation) => (
                    <Link key={recommendation.id} to="/history">
                      {recommendation.result.summary.slice(0, 28)}
                    </Link>
                  ))}
              </div>
            </div>
            <div>
              <h3>时间胶囊</h3>
              <p>{capsules.filter((capsule) => capsule.mapId && maps.some((map) => map.id === capsule.mapId && map.profileId === id)).length} 个关联胶囊</p>
            </div>
          </div>
        </section>
      )}
      {confirm && (
        <Modal title="将这个档案移入回收站？" onClose={() => setConfirm(false)}>
          <p>
            关联地图、心意记录和胶囊会保留。你可以在“我的 → 回收站”恢复档案。
          </p>
          <div className="form-actions">
            <button
              className="button danger"
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  await softDelete("profiles", id!);
                  notify({
                    text: "档案已移入回收站",
                    undo: () => restoreRecord("profiles", id!),
                  });
                  navigate("/profiles");
                });
              }}
            >
              移入回收站
            </button>
            <button className="button ghost" onClick={() => setConfirm(false)}>
              取消
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
