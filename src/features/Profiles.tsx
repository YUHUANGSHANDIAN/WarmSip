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
import { newEntity, type Profile } from "../domain";
export function ProfilesPage() {
  const { profiles } = useData();
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
      {profiles.length ? (
        <div className="profile-grid">
          {profiles.map((p, i) => (
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
              </Link>
              <Link to={`/gifts?profile=${p.id}`} className="button secondary">
                <Sparkles size={16} />为 TA 选礼
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="先记住一个重要的人"
          action={
            <Link to="/profiles/new" className="button primary">
              <Plus size={16} />
              添加收礼人
            </Link>
          }
        >
          喜欢的甜度、常去的城市、需要避开的食物，都值得被认真记住。
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
  const { maps } = useData();
  const [form, setForm] = useState<Profile>(() => ({
    ...newEntity(),
    name: "",
    relation: "朋友",
    city: "",
    likes: "",
    allergies: "",
    health: "",
    diet: "",
    note: "",
    anniversaries: [],
  }));
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
        <section className="section-heading">
          <div>
            <h2>与 TA 有关的暖迹</h2>
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
