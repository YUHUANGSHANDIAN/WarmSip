import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Sparkles,
  Gift,
  ArrowRight,
  Heart,
  History,
  MapPin,
  Trash2,
  LoaderCircle,
} from "lucide-react";
import { useData, useSettings } from "../components/data";
import {
  PageTitle,
  Field,
  Form,
  Badge,
  Empty,
  useAction,
  useNotice,
  formatDate,
} from "../components/ui";
import {
  saveRecord,
  softDelete,
  restoreRecord,
  storageMessage,
} from "../storage/db";
import {
  newEntity,
  type GiftResult,
  type Recommendation,
  type RecommendationRequest,
} from "../domain";
import { resolveLocation, localInspiration } from "../services/context";
import { LatestRequest, services } from "../services/api";
export function GiftResultCard({
  result,
  city,
  onSave,
}: {
  result: GiftResult;
  city: string;
  onSave?: () => void;
}) {
  return (
    <div className="gift-result">
      <h2>{result.summary}</h2>
      <div className="gift-items">
        {result.items.map((item, i) => (
          <article className="gift-item" key={i}>
            <div className={`gift-number tone-${i}`}>0{i + 1}</div>
            <div>
              <Badge>{item.category}</Badge>
              <h3>{item.name}</h3>
              <p>{item.reason}</p>
              {item.price && <span className="price-note">{item.price}</span>}
            </div>
            <Link
              className="icon-button"
              aria-label={`查找${item.name}相关地点`}
              to={`/discover?city=${encodeURIComponent(city)}&keyword=${encodeURIComponent(item.category)}`}
            >
              <ArrowRight size={18} />
            </Link>
          </article>
        ))}
      </div>
      <div className="blessing">
        <Heart size={20} />
        <p>“{result.blessing}”</p>
      </div>
      <div className="health-notes">
        {result.healthTips.map((tip, i) => (
          <p key={i}>{tip}</p>
        ))}
      </div>
      {onSave && (
        <button className="button primary" onClick={onSave}>
          <Heart size={17} />
          保存到心意清单
        </button>
      )}
    </div>
  );
}
export function GiftPage() {
  const [params] = useSearchParams();
  const { profiles } = useData();
  const settings = useSettings();
  const notice = useNotice();
  const { run } = useAction();
  const requests = useRef(new LatestRequest());
  const [profileId, setProfileId] = useState(params.get("profile") || "");
  const [manualCity, setManualCity] = useState(params.get("city") || "");
  const [scene, setScene] = useState("日常关心");
  const [budget, setBudget] = useState(50);
  const [mode, setMode] = useState<"local" | "ai">("local");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Recommendation>();
  const kind = params.get("kind") === "box" ? "box" : "normal";
  const profile = profiles.find((p) => p.id === profileId);
  const context = resolveLocation(manualCity, profile);
  const city = context.city || settings.city;
  useEffect(() => {
    const current = requests.current;
    return () => current.cancel();
  }, []);
  const generate = async () => {
    if (pending) return;
    if (mode === "ai" && !consent) {
      notice({ text: "请先确认向在线服务发送选定的必要信息", error: true });
      return;
    }
    setPending(true);
    setResult(undefined);
    const input: RecommendationRequest = {
      relation: profile?.relation || "自己",
      likes: profile?.likes || "",
      allergies: profile?.allergies || "",
      diet: profile?.diet || "",
      city,
      scene,
      budget,
      kind,
    };
    try {
      const value = await requests.current.run(async (signal) =>
        mode === "ai"
          ? services.recommend(input, signal)
          : localInspiration(input),
      );
      const record: Recommendation = {
        ...newEntity(),
        profileId,
        profileName: profile?.name || "自己",
        city,
        scene,
        budget,
        kind,
        source: mode,
        result: value,
      };
      await saveRecord("recommendations", record);
      setResult(record);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        notice({ text: storageMessage(e), error: true });
    } finally {
      setPending(false);
    }
  };
  const save = () => {
    if (!result) return;
    void run(async () => {
      await saveRecord("orders", {
        ...newEntity(),
        title: `给 ${result.profileName} 的${kind === "box" ? "惊喜" : "心意"}`,
        profileId: result.profileId,
        profileName: result.profileName,
        items: result.result.items,
        budget: result.budget,
        blessing: result.result.blessing,
        expectDate: "",
        status: "pending",
        note: "",
        placeId: "",
        placeSnapshot: null,
      });
      notice({ text: "已保存到心意清单" });
    });
  };
  return (
    <>
      <PageTitle
        eyebrow={
          kind === "box" ? "A LITTLE SURPRISE" : "THOUGHTFUL LITTLE GIFTS"
        }
        title={kind === "box" ? "拆开今天的小惊喜" : "今天，想为 TA 做点什么？"}
        description="从喜好与心情出发，找到一份刚刚好的关心。"
        action={
          <Link className="button secondary" to="/history">
            <History size={17} />
            推荐历史
          </Link>
        }
      />
      <div className="gift-layout">
        <Form
          onSubmit={() => {
            void generate();
          }}
        >
          <div className="form-intro">
            <div className="quick-icon peach">
              {kind === "box" ? <Gift /> : <Sparkles />}
            </div>
            <div>
              <h2>{kind === "box" ? "准备一份惊喜盲盒" : "把 TA 放在心上"}</h2>
              <p>先告诉我一点关于这份心意的事。</p>
            </div>
          </div>
          <Field label="这份关心送给谁">
            <select
              value={profileId}
              disabled={pending}
              onChange={(e) => setProfileId(e.target.value)}
            >
              <option value="">给自己 / 暂不关联档案</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.relation}
                </option>
              ))}
            </select>
          </Field>
          <Link to="/profiles/new" className="text-link small-link">
            添加一位新的收礼人
            <ArrowRight size={14} />
          </Link>
          <div className="form-grid">
            <Field label="今天的场景">
              <select
                value={scene}
                disabled={pending}
                onChange={(e) => setScene(e.target.value)}
              >
                {[
                  "日常关心",
                  "安慰一下",
                  "生日惊喜",
                  "纪念日",
                  "约会见面",
                  "异地送暖",
                  "周末探索",
                  "深夜慰藉",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="预算上限（元）">
              <input
                type="number"
                min={0}
                max={100000}
                step="0.01"
                required
                value={budget}
                disabled={pending}
                onChange={(e) => setBudget(e.target.valueAsNumber)}
              />
            </Field>
          </div>
          <Field
            label="本次选择的城市"
            hint={`当前使用：${city || "未指定城市"}${!manualCity && profile?.city ? "（收礼人城市）" : ""}`}
          >
            <input
              value={manualCity}
              maxLength={100}
              disabled={pending}
              placeholder={
                profile?.city || settings.city || "可手动指定一座城市"
              }
              onChange={(e) => setManualCity(e.target.value)}
            />
          </Field>
          <Field label="建议来源">
            <select
              value={mode}
              disabled={pending}
              onChange={(e) => setMode(e.target.value as "local" | "ai")}
            >
              <option value="local">本地灵感 · 无需网络</option>
              <option value="ai">在线 AI · 需要服务配置</option>
            </select>
          </Field>
          {mode === "ai" && (
            <div className="consent-panel">
              <p>
                将发送：关系、口味、过敏与忌口、饮食需求、城市、场景和预算。称呼、身体状态、私人备注、照片和足迹不发送。
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                我确认本次发送以上信息
              </label>
              <Link to="/settings" className="text-link">
                配置在线服务
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
          <div className="form-actions">
            {pending ? (
              <>
                <button type="button" className="button primary" disabled>
                  <LoaderCircle className="spin" size={17} />
                  正在准备心意…
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => requests.current.cancel()}
                >
                  取消生成
                </button>
              </>
            ) : (
              <button className="button primary" type="submit">
                <Sparkles size={17} />
                {kind === "box" ? "拆开惊喜盲盒" : "生成一份暖心建议"}
              </button>
            )}
          </div>
        </Form>
        <section className="gift-output">
          {result ? (
            <>
              <Badge tone={result.source === "ai" ? "sage" : "warm"}>
                {result.source === "ai" ? "在线 AI 生成" : "本地规则灵感"}
              </Badge>
              <GiftResultCard
                result={result.result}
                city={result.city}
                onSave={save}
              />
            </>
          ) : (
            <div className="gift-placeholder">
              <img src="./brand/icon.svg" alt="" />
              <h2>温暖，正在酝酿。</h2>
              <p>
                不用猜中所有喜好，
                <br />
                愿意认真想一想，就已经很特别。
              </p>
              <span>Send a Little Warmth.</span>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
export function HistoryPage() {
  const { recommendations } = useData();
  const [selected, setSelected] = useState<string>();
  const notice = useNotice();
  const { run } = useAction();
  return (
    <>
      <PageTitle
        back
        eyebrow="LITTLE THOUGHTS, SAVED"
        title="推荐历史"
        description="每一次认真想过的心意，都留在这里。"
      />
      {recommendations.length ? (
        <div className="history-list">
          {recommendations.map((r) => (
            <article className="history-card" key={r.id}>
              <div className="section-heading">
                <button
                  className="history-heading"
                  onClick={() =>
                    setSelected(selected === r.id ? undefined : r.id)
                  }
                  aria-expanded={selected === r.id}
                >
                  <h2>
                    给 {r.profileName} 的
                    {r.kind === "box" ? "惊喜盲盒" : "小心意"}
                  </h2>
                  <p>
                    {formatDate(r.createdAt)} · {r.scene} ·{" "}
                    {r.city || "未指定城市"}
                  </p>
                </button>
                <Badge tone="warm">
                  {r.source === "ai"
                    ? "在线 AI"
                    : r.source === "legacy"
                      ? "导入记录"
                      : "本地灵感"}
                </Badge>
                <button
                  className="icon-button"
                  aria-label={`删除给${r.profileName}的推荐`}
                  onClick={() => {
                    void run(async () => {
                      await softDelete("recommendations", r.id);
                      notice({
                        text: "推荐已移入回收站",
                        undo: () => restoreRecord("recommendations", r.id),
                      });
                    });
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
              {selected === r.id ? (
                <GiftResultCard
                  result={r.result}
                  city={r.city}
                  onSave={() => {
                    void run(async () => {
                      await saveRecord("orders", {
                        ...newEntity(),
                        title: `给 ${r.profileName} 的心意`,
                        profileName: r.profileName,
                        profileId: r.profileId,
                        items: r.result.items,
                        budget: r.budget,
                        blessing: r.result.blessing,
                      });
                      notice({ text: "已加入心意清单" });
                    });
                  }}
                />
              ) : (
                <p>{r.result.summary}</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="还没有保存过推荐"
          action={
            <Link to="/gifts" className="button primary">
              <Sparkles size={17} />
              准备第一份心意
            </Link>
          }
        >
          生成成功并保存后，建议会自动留在这里。
        </Empty>
      )}
      <Link to="/maps" className="text-link">
        <MapPin size={16} />
        去暖迹地图看看
      </Link>
    </>
  );
}
