import type {
  LocationContext,
  Profile,
  Coordinate,
  RecommendationRequest,
  GiftResult,
} from "../domain";
export function resolveLocation(
  manualCity: string,
  profile?: Pick<Profile, "city">,
  device?: { city: string; coordinate: Coordinate },
): LocationContext {
  if (manualCity.trim())
    return { kind: "manual-city", city: manualCity.trim(), coordinate: null };
  if (profile?.city.trim())
    return {
      kind: "recipient-city",
      city: profile.city.trim(),
      coordinate: null,
    };
  if (device) return { kind: "device", ...device };
  return { kind: "manual-city", city: "", coordinate: null };
}
export function localInspiration(input: RecommendationRequest): GiftResult {
  const sensitive = Boolean(input.allergies.trim() || input.diet.trim());
  const boxIdeas = [
    {
      name: "一封只说今天的手写信",
      category: "心意",
      price: "自行安排",
      store: "",
      reason: "把具体的小事写下来，让惊喜落在一个真实的细节上。",
    },
    {
      name: "一次不看手机的散步",
      category: "陪伴",
      price: "自行安排",
      store: "",
      reason: "留出一段完整的时间，比起复杂的安排更像认真陪伴。",
    },
    {
      name: "为 TA 挑一首今天的声音",
      category: "声音",
      price: "自行安排",
      store: "",
      reason: "用一首歌记住今天，也把想说的话藏进播放列表。",
    },
    {
      name: "一张可以马上兑现的小券",
      category: "约定",
      price: "自行安排",
      store: "",
      reason: "写下一个双方都轻松做到的约定，让期待有具体日期。",
    },
  ];
  const start = input.kind === "box" ? Math.floor(Math.random() * boxIdeas.length) : 0;
  const boxItems =
    input.kind === "box"
      ? [boxIdeas[start], boxIdeas[(start + 1) % boxIdeas.length]]
      : [];
  return {
    summary:
      input.kind === "box"
        ? "今天的盲盒，是一份留给 TA 的小期待。"
        : "关心可以从一件很小的事开始。",
    items: sensitive && input.kind !== "box"
      ? [
          {
            name: "写一张手写关心卡",
            category: "心意",
            price: "自行安排",
            store: "",
            reason: "有饮食限制时，先用一句认真写下的话传递关心。",
          },
          {
            name: "约一次轻松散步",
            category: "陪伴",
            price: "自行安排",
            store: "",
            reason: "根据 TA 的意愿和天气安排，不涉及无法核实的配料。",
          },
        ]
      : input.kind === "box"
        ? boxItems
        : [
          {
            name: "一杯合 TA 口味的暖饮",
            category: "饮品",
            price: `预算内选择（上限 ¥${input.budget}）`,
            store: "",
            reason: input.likes
              ? `按照偏好「${input.likes}」与商家确认适合的选择。`
              : "先问问 TA 今天想喝什么，让关心刚刚好。",
          },
          {
            name: "一次一起探索的小约定",
            category: "陪伴",
            price: "自行安排",
            store: "",
            reason: "收藏一个想去的地方，给下一次见面留一点期待。",
          },
        ],
    healthTips: [
      "这是本地规则提供的灵感，不是实时 AI 生成。",
      "下单前请向商家核实配料、过敏原、价格与营业情况。",
    ],
    blessing: "愿今天的小小温暖，刚好抵达你身边。",
  };
}
