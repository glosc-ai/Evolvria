import { estimateTurnCost } from "@/domain/cost";
import { NARRATIVE_PROMPT_CONTRACT_VERSION } from "@/services/ai/context";
import type { Character, Message, NarrativeRequest, NarrativeResponse } from "@/types/domain";

export async function generateMockNarrative(request: NarrativeRequest): Promise<NarrativeResponse> {
  await delay(180);
  const primary = request.characters[0];
  const recentAssistantCount = request.messages.filter((message) => message.role === "assistant" || message.role === "narrator").length;
  const beat = recentAssistantCount + 1;
  const usage = estimateTurnCost(request.messages, request.userInput, 260);
  const content = buildMockContent(request, primary, beat);

  return {
    promptContractVersion: NARRATIVE_PROMPT_CONTRACT_VERSION,
    messages: [
      {
        role: "assistant",
        speakerId: primary?.id,
        content,
        sceneHints: [
          {
            mood: beat % 2 === 0 ? "quiet_tension" : "discovery",
            camera: beat % 3 === 0 ? "close" : "medium",
            characterSprites: request.characters.slice(0, 3).map((character, index) => ({
              characterId: character.id,
              position: index === 0 ? "left" : index === 1 ? "center" : "right",
            })),
            voice: [
              {
                speakerId: primary?.id,
                text: content.slice(0, 180),
                voiceModel: primary?.voice.referenceAssetId ? "voice-reference" : "planned-tts",
                assetId: primary?.voice.referenceAssetId,
                status: "planned",
              },
            ],
            choices: [
              { id: `choice_${beat}_press`, label: "推进线索", message: `我沿着第 ${beat} 个节拍里的线索继续推进。` },
              { id: `choice_${beat}_inspect`, label: "仔细调查", message: "我放慢脚步，检查场景里容易被忽略的细节。" },
              { id: `choice_${beat}_ask`, label: "询问动机", message: `我追问${primary?.name ?? "在场者"}真正隐瞒的动机。` },
            ],
          },
        ],
        safetyFlags: ["none"],
      },
    ],
    relationshipDeltas: primary
      ? [{ sourceId: request.persona.id, targetId: primary.id, summary: "共同经历让信任略微上升。", weight: 1 }]
      : [],
    usage,
  };
}

function buildMockContent(request: NarrativeRequest, primary: Character | undefined, beat: number): string {
  const speaker = primary?.name ?? "旁白";
  const voice = primary?.voice.catchphrases[0] ? `“${primary.voice.catchphrases[0]}”` : "空气里有什么正在改变。";
  const modeLine = request.mode === "act"
    ? "你的动作让场景里的隐秘规则开始回应。"
    : request.mode === "ask"
      ? "问题没有立刻得到答案，却把一条线索推到了光下。"
      : request.mode === "ooc"
        ? "系统记录了你的偏好，并把叙事节奏调得更稳。"
        : "这句话像一枚投入水面的坐标片，荡开新的选择。";

  return [
    `${speaker}停顿片刻，视线越过你看向${request.scenario.location ?? "远处"}。${voice}`,
    `${modeLine}`,
    `第 ${beat} 个节拍里，${request.storyline.title}把一个可行动的线索交给你：${nextClue(request.userInput, beat)}`,
    "你可以追问、观察周围，或者直接采取行动。",
  ].join("\n\n");
}

function nextClue(input: string, beat: number): string {
  const clues = [
    "一个被刻意擦掉的名字仍然留下温度。",
    "远处的灯光按三短一长的节奏闪烁。",
    "有人在你抵达前就替你做出了选择。",
    "规则没有改变，改变的是谁有权解释规则。",
  ];
  const index = (input.length + beat) % clues.length;
  return clues[index];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
