import { useEffect, useRef, useState } from "react";
import { Feather, LoaderCircle, Sparkles } from "lucide-react";
import { aiCopywritingResultSchema } from "../domain";
import { LatestRequest, services } from "../services/api";
import { useSettings } from "./data";
import { Field, Modal, useAction, useNotice } from "./ui";

export function AIWritingAssistant({
  source,
  label = "AI 暖心文案",
  scene = "日常关心",
  onApply,
}: {
  source: string;
  label?: string;
  scene?: string;
  onApply: (text: string) => void;
}) {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<"温柔" | "简洁" | "俏皮" | "郑重">("温柔");
  const [result, setResult] = useState("");
  const [draft, setDraft] = useState("");
  const requests = useRef(new LatestRequest());
  const { busy, run } = useAction();
  const notice = useNotice();
  useEffect(() => {
    const current = requests.current;
    return () => current.cancel();
  }, []);
  const close = () => {
    requests.current.cancel();
    setOpen(false);
  };
  const generate = () =>
    run(async () => {
      if (!settings.aiEnabled) throw new Error("请先在设置中启用 AI");
      setResult("");
      let error = "";
      try {
        await requests.current.run((signal) =>
          services.streamAI(
            {
              taskId: "copywriting",
              payload: { text: draft, scene, tone, length: "短" },
              consent: {
                taskId: "copywriting",
                fields: ["用户当前编辑的文案", "场景", "语气"],
                includesSensitive: false,
                includesPhotos: false,
              },
              budget: {
                dailyUsd: settings.aiBudgetDailyUsd,
                monthlyUsd: settings.aiBudgetMonthlyUsd,
              },
            },
            (event) => {
              if (event.type === "result") {
                const parsed = aiCopywritingResultSchema.parse(event.payload);
                setResult(parsed.text);
                setDraft(parsed.text);
              }
              if (event.type === "error") error = event.message;
            },
            signal,
          ),
        );
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        throw cause;
      }
      if (error) throw new Error(error);
      notice({ text: "文案已生成；确认后才会覆盖当前内容" });
    });
  return (
    <>
      <button
        type="button"
        className="button ghost"
        onClick={() => {
          setDraft(source);
          setOpen(true);
        }}
      >
        <Sparkles size={16} />
        {label}
      </button>
      {open && (
        <Modal title="让 AI 帮你润色" onClose={close}>
          <p>
            只发送下方这段你主动选择的文字、场景和语气；不发送档案、位置或照片。
          </p>
          <Field label="原文">
            <textarea
              rows={5}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
          <Field label="语气">
            <select
              value={tone}
              onChange={(event) =>
                setTone(event.target.value as typeof tone)
              }
            >
              {["温柔", "简洁", "俏皮", "郑重"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          {result && (
            <Field label="生成结果（可继续编辑）">
              <textarea
                rows={7}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </Field>
          )}
          <div className="form-actions">
            <button className="button secondary" disabled={busy} onClick={generate}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Feather size={16} />
              )}
              {busy ? "正在润色…" : "生成文案"}
            </button>
            {busy && (
              <button
                className="button ghost"
                type="button"
                onClick={() => requests.current.cancel()}
              >
                取消生成
              </button>
            )}
            <button
              className="button primary"
              disabled={!result || busy}
              onClick={() => {
                onApply(draft.trim());
                close();
                notice({ text: "已采用这次文案" });
              }}
            >
              确认采用
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
