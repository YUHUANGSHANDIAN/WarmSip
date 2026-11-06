import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  ShieldCheck,
  Trash2,
  RotateCcw,
  ArrowRight,
  Heart,
  History,
  LockKeyhole,
  Plug,
  Check,
  ExternalLink,
} from "lucide-react";
import { type Table } from "dexie";
import { useSettings } from "../components/data";
import {
  PageTitle,
  Field,
  Form,
  SaveButton,
  Modal,
  Badge,
  useAction,
  useNotice,
} from "../components/ui";
import {
  db,
  saveSettings,
  restoreRecord,
  permanentlyDelete,
  clearPersonalData,
  recordSchemas,
  type RecordTable,
} from "../storage/db";
import {
  readBackup,
  exportBackup,
  importBackup,
  tables,
  type ImportBundle,
} from "../storage/backup";
import { platform } from "../platform";
import { services, setAccessToken, validateServiceUrl } from "../services/api";
import { localDate } from "../services/time";
import { type Settings, type Capabilities } from "../domain";
import { AISettings } from "./AISettings";
const tableLabels: Record<RecordTable, string> = {
  profiles: "收礼人档案",
  maps: "暖迹地图",
  places: "地点记录",
  recommendations: "推荐历史",
  orders: "心意清单",
  capsules: "时间胶囊",
};
export function SettingsPage() {
  const settings = useSettings();
  const [form, setForm] = useState<Settings>(settings);
  const [token, setToken] = useState("");
  const [capabilities, setCapabilities] = useState<Capabilities>();
  const [bundle, setBundle] = useState<ImportBundle>();
  const [confirmExport, setConfirmExport] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearText, setClearText] = useState("");
  const [permanent, setPermanent] = useState<{
    table: RecordTable;
    id: string;
  }>();
  const { busy, run } = useAction();
  const notice = useNotice();
  const [storage, setStorage] = useState("");
  const [connecting, setConnecting] = useState(false);
  const deleted = useLiveQuery(
    async () => {
      const result: { table: RecordTable; id: string; title: string }[] = [];
      for (const table of Object.keys(recordSchemas) as RecordTable[]) {
        const records = await (db[table] as Table)
          .filter((x) => x.deletedAt !== null)
          .toArray();
        for (const r of records)
          result.push({
            table,
            id: r.id,
            title: r.title || r.name || `给 ${r.profileName} 的推荐`,
          });
      }
      return result;
    },
    [],
    [],
  );
  useEffect(() => setForm(settings), [settings]);
  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then((s) =>
        setStorage(`${((s.usage || 0) / 1024 / 1024).toFixed(1)} MB`),
      )
      .catch(() => {});
  }, []);
  const save = async (announce = true) => {
    const serviceUrl = validateServiceUrl(form.serviceUrl);
    if (!Intl.DateTimeFormat("zh-CN", { timeZone: form.timeZone }))
      throw new Error("时区无效");
    await saveSettings({ ...form, serviceUrl });
    setAccessToken(token);
    if (announce)
      notice({ text: "设置已保存；服务访问令牌仅在本次会话内使用" });
  };
  return (
    <>
      <PageTitle
        eyebrow="YOUR OWN LITTLE CORNER"
        title="我的 WarmSip"
        description="按照自己的节奏，让温暖成为日常。"
      />
      <div className="settings-summary">
        <img src="./brand/icon.svg" alt="WarmSip" />
        <div>
          <h2>记录属于你的生活</h2>
          <p>
            <LockKeyhole size={14} />
            本地使用 · 无需账号 · 地图默认私人
          </p>
        </div>
        <Badge tone="warm">0.2.0-beta.2 预发布版</Badge>
      </div>
      <div className="settings-shortcuts">
        <Link to="/profiles">
          <Heart size={20} />
          我在意的人
          <ArrowRight size={16} />
        </Link>
        <Link to="/history">
          <History size={20} />
          推荐历史
          <ArrowRight size={16} />
        </Link>
      </div>
      <Form
        className="settings-card"
        onSubmit={() => {
          void run(save);
        }}
      >
        <div className="section-heading">
          <h2>日常偏好</h2>
          <Badge>本机设置</Badge>
        </div>
        <div className="form-grid">
          <Field label="我的默认城市">
            <input
              value={form.city}
              placeholder="例如：杭州"
              maxLength={100}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </Field>
          <Field label="默认时区">
            <input
              value={form.timeZone}
              onChange={(e) =>
                setForm((f) => ({ ...f, timeZone: e.target.value }))
              }
            />
          </Field>
        </div>
        <div className="field">
          <span>外观主题</span>
          <div className="theme-options">
            {(
              [
                { key: "light", label: "明亮", icon: Sun },
                { key: "dark", label: "深色", icon: Moon },
                { key: "system", label: "跟随系统", icon: Monitor },
              ] as const
            ).map((t) => (
              <button
                type="button"
                key={t.key}
                className={form.theme === t.key ? "selected" : ""}
                aria-pressed={form.theme === t.key}
                onClick={() => setForm((f) => ({ ...f, theme: t.key }))}
              >
                <t.icon size={22} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ai-privacy-grid">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.reduceMotion}
              onChange={(e) =>
                setForm((f) => ({ ...f, reduceMotion: e.target.checked }))
              }
            />
            减少界面动效
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.aiEnabled}
              onChange={(e) =>
                setForm((f) => ({ ...f, aiEnabled: e.target.checked }))
              }
            />
            允许使用已连接的 AI
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.aiSendLikes}
              onChange={(e) =>
                setForm((f) => ({ ...f, aiSendLikes: e.target.checked }))
              }
            />
            任务需要时发送偏好标签
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.aiSendSensitive}
              onChange={(e) =>
                setForm((f) => ({ ...f, aiSendSensitive: e.target.checked }))
              }
            />
            任务需要时发送过敏、忌口或私人备注
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.aiSendPhotos}
              onChange={(e) =>
                setForm((f) => ({ ...f, aiSendPhotos: e.target.checked }))
              }
            />
            允许用户主动选择时发送照片
          </label>
        </div>
        <div className="form-grid">
          <Field label="AI 每日软预算（美元）" hint="0 表示不设应用内软预算。">
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.aiBudgetDailyUsd}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  aiBudgetDailyUsd: Number(e.target.value) || 0,
                }))
              }
            />
          </Field>
          <Field label="AI 每月软预算（美元）">
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.aiBudgetMonthlyUsd}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  aiBudgetMonthlyUsd: Number(e.target.value) || 0,
                }))
              }
            />
          </Field>
        </div>
        <div className="section-heading">
          <h2>
            <Plug size={20} />
            在线服务
          </h2>
          <Badge>可选配置</Badge>
        </div>
        <p className="muted">
          私人地图、照片和日常记录不依赖在线服务。配置后可使用真实地点搜索、天气和在线
          AI。
        </p>
        <Field
          label="服务地址"
          hint="填写已部署的 WarmSip 服务地址；远程服务要求 HTTPS。"
        >
          <input
            type="url"
            value={form.serviceUrl}
            placeholder="https://your-service.example.com"
            onChange={(e) => {
              setCapabilities(undefined);
              setForm((f) => ({ ...f, serviceUrl: e.target.value }));
            }}
          />
        </Field>
        <Field
          label="服务访问令牌"
          hint="仅保存在内存中；重启后重新输入。不要填写 AI 或地图提供方的服务端密钥。"
        >
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </Field>
        <div className="form-actions">
          <SaveButton busy={busy}>保存设置</SaveButton>
          <button
            type="button"
            className="button secondary"
            disabled={busy || connecting}
            onClick={() => {
              void run(async () => {
                setConnecting(true);
                try {
                  await save(false);
                  const next = await services.checkConnection();
                  setCapabilities(next);
                  notice({
                    text: next.ai || next.places || next.weather || next.map
                      ? "已连接服务，能力状态如下"
                      : "基础服务已连接；外部能力尚未配置",
                  });
                } finally {
                  setConnecting(false);
                }
              });
            }}
          >
            {connecting ? "正在唤醒免费服务…" : "保存并检查连接"}
          </button>
        </div>
        <p className="small-note">
          Render Free 实例休眠后，首次连接可能需要约一分钟唤醒；最多等待
          90 秒。
        </p>
        {capabilities && (
          <div className="capabilities">
            {[
              { name: "AI 选礼", ready: capabilities.ai },
              { name: "地点搜索", ready: capabilities.places },
              { name: "天气", ready: capabilities.weather },
              { name: "地图底图", ready: capabilities.map },
            ].map((c) => (
              <Badge key={c.name} tone={c.ready ? "sage" : "neutral"}>
                {c.ready && <Check size={12} />} {c.name}：
                {c.ready ? "服务已配置，需实际联调" : "尚未配置"}
              </Badge>
            ))}
          </div>
        )}
      </Form>
      <AISettings enabled={Boolean(capabilities)} />
      <section className="settings-card">
        <div className="section-heading">
          <h2>
            <ShieldCheck size={20} />
            我的数据，我来保管
          </h2>
          <span className="muted">
            {storage ? `当前站点存储约 ${storage}` : ""}
          </span>
        </div>
        <p>
          完整备份包含精确位置、私人备注、收礼人信息和照片。请保存在可信位置。分享给他人请使用地图中的分享预览。
        </p>
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setConfirmExport(true)}
          >
            <Download size={17} />
            导出完整备份
          </button>
          <label className="button secondary file-button">
            <Upload size={17} />
            导入备份
            <input
              type="file"
              accept=".zip,.json"
              aria-label="选择备份文件"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file)
                  void run(async () => setBundle(await readBackup(file)));
              }}
            />
          </label>
        </div>
        <p className="small-note">
          支持 WarmSip ZIP（含媒体）与原始 lg_warm_*_v1 JSON
          导出。无法直接读取灵光宿主中的私有存储。
        </p>
      </section>
      <section className="settings-card">
        <div className="section-heading">
          <h2>
            <Trash2 size={20} />
            回收站
          </h2>
          <Badge>{deleted.length} 条记录</Badge>
        </div>
        <p className="muted">
          恢复地图时，会恢复随该地图一起移入回收站的地点。此前单独删除的地点保持原状态。
        </p>
        {deleted.length ? (
          <div className="trash-list">
            {deleted.map((r) => (
              <div key={`${r.table}:${r.id}`}>
                <div>
                  <strong>{r.title}</strong>
                  <span>{tableLabels[r.table]}</span>
                </div>
                <button
                  className="button ghost"
                  disabled={busy}
                  onClick={() => {
                    void run(async () => {
                      await restoreRecord(r.table, r.id);
                      notice({ text: "记录已恢复" });
                    });
                  }}
                >
                  <RotateCcw size={15} />
                  恢复
                </button>
                <button
                  className="icon-button danger"
                  aria-label={`永久删除${r.title}`}
                  onClick={() => setPermanent({ table: r.table, id: r.id })}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="small-note">回收站是空的。</p>
        )}
      </section>
      <section className="settings-card about-card">
        <img src="./brand/wordmark.svg" alt="WarmSip · 给 TA 点一杯温暖" />
        <p>让每一份关心，都有温暖的落点。</p>
        <p className="muted">
          私人优先 · 不后台追踪位置 · 不自动上传照片和足迹
        </p>
        <button
          className="text-link"
          onClick={() => {
            void run(() =>
              platform.openExternal(
                "https://github.com/YUHUANGSHANDIAN/WarmSip",
              ),
            );
          }}
        >
          项目与版本说明
          <ExternalLink size={14} />
        </button>
        <button
          className="text-link danger clear-data"
          onClick={() => setConfirmClear(true)}
        >
          删除此设备上的全部个人数据
        </button>
      </section>
      {confirmExport && (
        <Modal
          title="保存一份完整的私密备份"
          onClose={() => setConfirmExport(false)}
        >
          <p>
            包含收礼人、地图、地点、精确坐标、照片、推荐、心意和胶囊。文件未加密，请妥善保管。
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await platform.saveFile(
                  `WarmSip-backup-${localDate()}.zip`,
                  await exportBackup(),
                );
                setConfirmExport(false);
                notice({ text: "备份文件已准备好" });
              });
            }}
          >
            导出完整备份
          </button>
        </Modal>
      )}
      {bundle && (
        <Modal
          title="导入前，核对这份备份"
          onClose={() => setBundle(undefined)}
        >
          <Badge>
            {bundle.legacy ? "原始应用导出格式" : "WarmSip 含媒体备份"}
          </Badge>
          <div className="import-counts">
            {tables.map((t) => (
              <div key={t}>
                <span>{tableLabels[t]}</span>
                <strong>{bundle.records[t].length}</strong>
              </div>
            ))}
            <div>
              <span>图片</span>
              <strong>{bundle.media.length}</strong>
            </div>
          </div>
          <p>
            完全相同的记录会跳过。同 ID
            的不同内容会作为副本导入，关联关系随副本调整。现有记录不会被覆盖。
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                const result = await importBackup(bundle);
                setBundle(undefined);
                notice({
                  text: `已导入 ${result.imported} 条，跳过 ${result.duplicates} 条重复，保留 ${result.conflicts} 条冲突副本`,
                });
              });
            }}
          >
            确认导入
          </button>
        </Modal>
      )}
      {permanent && (
        <Modal
          title="永久删除这条记录？"
          onClose={() => setPermanent(undefined)}
        >
          <p>
            该操作无法撤销。若删除地图，其所属地点也会永久删除；其他业务中的历史快照会保留。建议先导出备份。
          </p>
          <button
            className="button danger"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await permanentlyDelete(permanent.table, permanent.id);
                setPermanent(undefined);
                notice({ text: "记录已永久删除" });
              });
            }}
          >
            确认永久删除
          </button>
        </Modal>
      )}
      {confirmClear && (
        <Modal
          title="删除此设备上的全部个人数据"
          onClose={() => {
            setConfirmClear(false);
            setClearText("");
          }}
        >
          <p>
            所有档案、地图、地点、照片、推荐、心意、胶囊和设置将永久删除。请先导出备份。
          </p>
          <Field label="输入“删除全部数据”确认">
            <input
              value={clearText}
              onChange={(e) => setClearText(e.target.value)}
            />
          </Field>
          <button
            className="button danger"
            disabled={busy || clearText !== "删除全部数据"}
            onClick={() => {
              void run(async () => {
                if (capabilities) {
                  await services.clearAIData().catch(() => {
                    // Local deletion succeeds even when the optional service is offline.
                  });
                }
                await clearPersonalData();
                setAccessToken("");
                setToken("");
                setConfirmClear(false);
                setClearText("");
                notice({ text: "本机个人数据已删除" });
              });
            }}
          >
            永久删除全部个人数据
          </button>
        </Modal>
      )}
    </>
  );
}
