import { estimateTurnCost } from "@/domain/cost";
import { createId, nowIso } from "@/domain/ids";
import type {
  Chat,
  ChatCheckpoint,
  Character,
  CostEstimate,
  GeneratedMessage,
  Message,
  MessageMode,
  NarrativeResponse,
  Persona,
  SceneHint,
  Scenario,
  Storyline,
} from "@/types/domain";

export interface SceneHintEditInput {
  mood?: string;
  camera?: SceneHint["camera"];
  choices?: Array<{
    id?: string;
    label: string;
    message: string;
  }>;
}

export function createChatSession(
  storyline: Storyline,
  scenario: Scenario,
  persona: Persona,
  providerType = "mock",
  model = "evolvria-mock",
  characters: Character[] = [],
): {
  chat: Chat;
  openingMessages: Message[];
} {
  const chatId = createId("chat");
  const createdAt = nowIso();
  const openingSpeaker = characters.find((character) => scenario.participatingCharacterIds.includes(character.id)) ?? characters[0];
  const openingVoiceReferenceId = openingSpeaker?.voice.referenceAssetId;
  const systemMessage = createMessage(chatId, "system", [
    `故事线：${storyline.title}`,
    `玩家身份：${persona.name}，${persona.description}`,
    `分级：${storyline.rating}`,
  ].join("\n"));
  const openingMessage = createMessage(chatId, "narrator", scenario.opening, undefined, [
    {
      mood: "opening",
      camera: "wide",
      characterSprites: scenario.participatingCharacterIds.slice(0, 3).map((characterId, index) => ({
        characterId,
        position: index === 0 ? "left" : index === 1 ? "center" : "right",
      })),
      voice: [
        {
          speakerId: openingSpeaker?.id,
          text: scenario.opening.slice(0, 160),
          voiceModel: openingVoiceReferenceId ? "voice-reference" : "planned-tts",
          assetId: openingVoiceReferenceId,
          status: "planned",
        },
      ],
      choices: [
        { id: "opening_observe", label: "观察环境", message: "我先观察周围，寻找异常细节。" },
        { id: "opening_approach", label: "靠近关键线索", message: "我靠近最可疑的线索，并准备承担风险。" },
        { id: "opening_ask", label: "询问同伴", message: "我询问在场同伴：刚才到底发生了什么？" },
      ],
    },
  ]);

  return {
    chat: {
      id: chatId,
      storylineId: storyline.id,
      scenarioId: scenario.id,
      personaId: persona.id,
      title: `${storyline.title} / ${scenario.title}`,
      status: "active",
      provider: { type: providerType as Chat["provider"]["type"], model },
      messageIds: [systemMessage.id, openingMessage.id],
      checkpointIds: [],
      createdAt,
      updatedAt: createdAt,
    },
    openingMessages: [systemMessage, openingMessage],
  };
}

export function createMessage(
  chatId: string,
  role: Message["role"],
  content: string,
  mode?: MessageMode,
  sceneHints?: Message["sceneHints"],
  extra?: Partial<Message>,
): Message {
  return {
    id: createId("msg"),
    chatId,
    role,
    content,
    mode,
    sceneHints,
    safetyFlags: ["none"],
    createdAt: nowIso(),
    ...extra,
  };
}

export function appendUserMessage(chat: Chat, content: string, mode: MessageMode, previousMessages: Message[]): {
  chat: Chat;
  message: Message;
  checkpoint: ChatCheckpoint;
  estimate: CostEstimate;
} {
  const estimate = estimateTurnCost(previousMessages, content);
  const checkpoint = createChatCheckpoint(chat.id, previousMessages);
  const message = createMessage(chat.id, "user", content, mode, undefined, {
    costEstimate: estimate,
    tokenEstimate: estimate.inputTokens,
  });
  return {
    chat: {
      ...chat,
      messageIds: [...chat.messageIds, message.id],
      checkpointIds: [...chat.checkpointIds, checkpoint.id],
      updatedAt: nowIso(),
    },
    message,
    checkpoint,
    estimate,
  };
}

export function createChatCheckpoint(chatId: string, previousMessages: Message[]): ChatCheckpoint {
  const lastMessage = previousMessages.at(-1);
  return {
    id: createId("checkpoint"),
    chatId,
    label: lastMessage ? `Before message ${previousMessages.length + 1}` : "Chat start",
    messageIndex: previousMessages.length,
    messageId: lastMessage?.id,
    createdAt: nowIso(),
  };
}

export function rollbackChatToCheckpoint(chat: Chat, checkpoint: ChatCheckpoint, rollbackMessageId: string): Chat {
  const retainedMessageIds = chat.messageIds.slice(0, checkpoint.messageIndex);
  const retainedCheckpointIds = chat.checkpointIds.slice(0, Math.max(0, chat.checkpointIds.indexOf(checkpoint.id) + 1));
  return {
    ...chat,
    status: "active",
    messageIds: [...retainedMessageIds, rollbackMessageId],
    checkpointIds: retainedCheckpointIds,
    updatedAt: nowIso(),
  };
}

export function searchChatMessages(messages: Message[], query: string): Message[] {
  const text = query.trim().toLowerCase();
  if (!text) return messages;
  return messages.filter((message) =>
    [message.role, message.mode ?? "", message.content].join(" ").toLowerCase().includes(text),
  );
}

export interface MessageWindow {
  messages: Message[];
  totalCount: number;
  hiddenCount: number;
  searchActive: boolean;
}

export function createMessageWindow(messages: Message[], visibleCount: number, query = ""): MessageWindow {
  const searched = searchChatMessages(messages, query);
  if (query.trim()) {
    return {
      messages: searched,
      totalCount: searched.length,
      hiddenCount: 0,
      searchActive: true,
    };
  }
  const clampedCount = Math.max(1, Math.floor(visibleCount));
  const start = Math.max(0, messages.length - clampedCount);
  return {
    messages: messages.slice(start),
    totalCount: messages.length,
    hiddenCount: start,
    searchActive: false,
  };
}

export function updateMessageSceneHint(message: Message, input: SceneHintEditInput): Message {
  const [currentHint = {}, ...remainingHints] = message.sceneHints ?? [];
  const updatedHint: SceneHint = {
    ...currentHint,
  };
  if (input.camera) updatedHint.camera = input.camera;
  if (Object.prototype.hasOwnProperty.call(input, "mood")) {
    updatedHint.mood = input.mood?.trim() || undefined;
  }

  if (input.choices) {
    updatedHint.choices = input.choices
      .slice(0, 3)
      .map((choice) => ({
        id: choice.id?.trim() || createId("choice"),
        label: choice.label.trim(),
        message: choice.message.trim(),
      }))
      .filter((choice) => choice.label && choice.message);
  }

  return {
    ...message,
    sceneHints: [updatedHint, ...remainingHints],
  };
}

export function formatChatExcerptMarkdown(input: {
  title: string;
  storylineTitle?: string;
  personaName?: string;
  messages: Message[];
}): string {
  const lines = [
    `# ${input.title}`,
    "",
    input.storylineTitle ? `Storyline: ${input.storylineTitle}` : undefined,
    input.personaName ? `Persona: ${input.personaName}` : undefined,
    `ExportedAt: ${nowIso()}`,
    "",
    "## Messages",
    "",
  ].filter((line): line is string => line !== undefined);
  for (const message of input.messages) {
    const mode = message.mode ? ` / ${message.mode}` : "";
    lines.push(`### ${message.role}${mode}`);
    lines.push("");
    lines.push(message.content);
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

export function mergeNarrativeResponse(chat: Chat, response: NarrativeResponse, retryOfMessageId?: string): {
  chat: Chat;
  messages: Message[];
} {
  const messages = response.messages.map((generated) => generatedToMessage(chat.id, generated, retryOfMessageId, response.usage, response.promptContractVersion));
  if (response.relationshipDeltas?.length && messages[0]) {
    messages[0] = {
      ...messages[0],
      relationshipDeltas: response.relationshipDeltas,
    };
  }
  return {
    chat: {
      ...chat,
      messageIds: [...chat.messageIds, ...messages.map((message) => message.id)],
      updatedAt: nowIso(),
    },
    messages,
  };
}

function generatedToMessage(chatId: string, generated: GeneratedMessage, retryOfMessageId?: string, usage?: CostEstimate, responseContractVersion?: string): Message {
  return createMessage(chatId, generated.role, generated.content, undefined, generated.sceneHints, {
    speakerId: generated.speakerId,
    promptContractVersion: generated.promptContractVersion ?? responseContractVersion,
    retryOfMessageId,
    safetyFlags: generated.safetyFlags ?? ["none"],
    tokenEstimate: usage?.outputTokens,
    costEstimate: usage,
  });
}

export function lastAssistantMessage(messages: Message[]): Message | undefined {
  return [...messages].reverse().find((message) => message.role === "assistant" || message.role === "narrator");
}
