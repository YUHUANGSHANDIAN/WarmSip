import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  X,
  ArrowLeft,
  LoaderCircle,
  MapPin,
  ImagePlus,
  Check,
  AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { db, storageMessage } from "../storage/db";
import { addPhoto } from "../storage/media";

type Notice = { text: string; error?: boolean; undo?: () => Promise<void> };
const NoticeContext = createContext<(notice: Notice) => void>(() => {});
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice>();
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => setNotice(undefined),
      notice.undo ? 12000 : 6500,
    );
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <NoticeContext.Provider value={setNotice}>
      {children}
      {notice && (
        <div
          className={`toast ${notice.error ? "error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.error ? <AlertCircle size={18} /> : <Check size={18} />}
          <span>{notice.text}</span>
          {notice.undo && (
            <button
              onClick={() => {
                void notice
                  .undo?.()
                  .then(() => setNotice({ text: "已恢复" }))
                  .catch((e) =>
                    setNotice({ text: storageMessage(e), error: true }),
                  );
              }}
            >
              撤销
            </button>
          )}
          <button aria-label="关闭提示" onClick={() => setNotice(undefined)}>
            <X size={16} />
          </button>
        </div>
      )}
    </NoticeContext.Provider>
  );
}
export function useNotice() {
  return useContext(NoticeContext);
}
export function useAction() {
  const notify = useNotice();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const run = useCallback(
    async (work: () => Promise<void>) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      try {
        await work();
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          notify({ text: storageMessage(e), error: true });
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [notify],
  );
  return { busy, run };
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
  back = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  back?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <header className="page-title">
      {back && (
        <button
          className="icon-button back-button"
          aria-label="返回"
          onClick={() =>
            window.history.state?.idx > 0
              ? navigate(-1)
              : navigate("/", { replace: true })
          }
        >
          <ArrowLeft />
        </button>
      )}
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="title-actions">{action}</div>}
    </header>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-symbol">
        <MapPin size={30} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={id}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{title}</h2>
        <button className="icon-button" aria-label="关闭弹窗" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SaveButton({
  busy,
  children = "保存",
}: {
  busy: boolean;
  children?: ReactNode;
}) {
  return (
    <button className="button primary" disabled={busy} type="submit">
      {busy && <LoaderCircle size={17} className="spin" />}
      {busy ? "正在保存…" : children}
    </button>
  );
}
export function Form({
  children,
  onSubmit,
  className = "form-card",
}: {
  children: ReactNode;
  onSubmit: () => void;
  className?: string;
}) {
  const handle = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form className={className} onSubmit={handle}>
      {children}
    </form>
  );
}
export function Photo({
  id,
  alt = "",
  className = "photo",
}: {
  id: string;
  alt?: string;
  className?: string;
}) {
  const media = useLiveQuery(() => (id ? db.media.get(id) : undefined), [id]);
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!media) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(media.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [media]);
  return url ? (
    <img className={className} src={url} alt={alt} loading="lazy" />
  ) : (
    <div
      className={`${className} photo-placeholder`}
      role="img"
      aria-label={alt || "暂无照片"}
    >
      <MapPin />
    </div>
  );
}
export function PhotoPicker({
  ids,
  onChange,
  max = 12,
  label = "添加照片",
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  label?: string;
}) {
  const { busy, run } = useAction();
  return (
    <div className="photo-picker">
      <div className="photo-grid">
        {ids.map((id) => (
          <div className="photo-tile" key={id}>
            <Photo id={id} />
            <button
              type="button"
              aria-label="移除此照片"
              onClick={() => onChange(ids.filter((x) => x !== id))}
            >
              <X size={15} />
            </button>
          </div>
        ))}
        {ids.length < max && (
          <label className="photo-add">
            <ImagePlus size={22} />
            <span>{busy ? "处理中…" : label}</span>
            <input
              aria-label={label}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple={max > 1}
              disabled={busy}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                void run(async () => {
                  if (files.length + ids.length > max)
                    throw new Error(`最多添加 ${max} 张照片`);
                  const next = [];
                  for (const file of files) next.push(await addPhoto(file));
                  onChange([...new Set([...ids, ...next])]);
                });
              }}
            />
          </label>
        )}
      </div>
      <small className="muted">
        保存在本机 · JPG / PNG / WebP · 单张最大 15 MB
      </small>
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function formatDate(value: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(value);
}
