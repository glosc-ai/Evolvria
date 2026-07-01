<script setup lang="ts">
import { Bot, Clock, Copy, History, Info, MapPin, MessageSquare, Trophy, Users } from "@lucide/vue";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Conversation, Message, MessageActions, PromptInput, Suggestion, Suggestions } from "@/components/ai-elements";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useAppStore } from "@/stores/app";
import { useWorldStore } from "@/stores/world";
import type { TimelineEvent } from "@/types/domain";

interface ConversationMessage {
  id: string;
  from: "user" | "assistant" | "system";
  title?: string;
  text: string;
  meta?: string;
}

const router = useRouter();
const app = useAppStore();
const world = useWorldStore();
const action = ref("");

const travelTargets = computed(() => world.explorationTravelTargets);
const duplicateTravelSuggestionTargets = computed(() => (world.current ? [world.current, ...travelTargets.value] : travelTargets.value));
const visibleSuggestedActions = computed(() => {
  return world.suggestedActions.filter((item) => !world.travelActionTarget(item, duplicateTravelSuggestionTargets.value));
});

const conversationMessages = computed<ConversationMessage[]>(() => {
  const messages: ConversationMessage[] = [];
  for (const event of world.timeline) {
    const playerAction = actionTextFromEvent(event);
    if (playerAction) {
      messages.push({
        id: `${event.id}-user`,
        from: "user",
        text: playerAction,
        meta: timeLabel(event),
      });
    }
    messages.push({
      id: `${event.id}-assistant`,
      from: "assistant",
      title: event.title,
      text: event.description,
      meta: timeLabel(event),
    });
  }
  if (world.pendingAction) {
    messages.push({
      id: "pending-user",
      from: "user",
      text: world.pendingAction,
      meta: "已提交",
    });
    messages.push({
      id: "pending-assistant",
      from: "assistant",
      title: world.streamingNarrative ? "世界回应" : "正在生成",
      text: world.streamingNarrative || "世界正在解析这次行动，并准备写入时间线、记忆和关系变化。",
      meta: "AI",
    });
  }
  return messages;
});

const latestAssistantMessage = computed(() => [...conversationMessages.value].reverse().find((message) => message.from === "assistant"));

async function requestSubmit(text = action.value) {
  try {
    if (world.busy) return;
    if (!world.hasWorld) {
      await router.push("/new-world");
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    await submit(trimmed);
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "行动提交失败。");
  }
}

async function submit(text = action.value) {
  try {
    await world.submitPlayerAction(text);
    action.value = "";
  } catch (error) {
    app.setError(error instanceof Error ? error.message : "行动提交失败。");
  }
}

async function copyLatestMessage(): Promise<void> {
  const text = latestAssistantMessage.value?.text.trim();
  if (!text) return;
  await navigator.clipboard.writeText(text);
  app.setNotice("已复制最新叙事。");
}

function downloadConversation(): void {
  const markdown = conversationMessages.value
    .map((message) => {
      const role = message.from === "user" ? "你" : "世界";
      const title = message.title ? ` · ${message.title}` : "";
      return `**${role}${title}:**\n\n${message.text}`;
    })
    .join("\n\n");
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${world.world.name || "evolvria"}-conversation.md`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function actionTextFromEvent(event: TimelineEvent): string {
  if (event.type !== "player_action") return "";
  const match = event.description.match(/玩家行动[:：]\s*([^。]+)/);
  if (match?.[1]?.trim()) return match[1].trim();
  return event.title && event.title !== "玩家行动" ? event.title : "";
}

function timeLabel(event: TimelineEvent): string {
  return `第 ${event.world_time.day} 天 ${event.world_time.hour} 时`;
}
</script>

<template>
  <section v-if="world.hasWorld" class="min-h-0 min-w-0">
    <div class="flex min-h-0 min-w-0 flex-col gap-4">
      <Card v-if="world.world.ending" class="border-primary/40 bg-primary/5">
        <CardHeader>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <CardTitle class="flex items-center gap-2"><Trophy />{{ world.world.ending.title }}</CardTitle>
            <Badge>结局已达成</Badge>
          </div>
          <CardDescription>{{ world.world.ending.summary }}</CardDescription>
        </CardHeader>
      </Card>
      <Card class="h-[min(74vh,760px)] min-h-[560px] min-w-0 gap-0 overflow-hidden py-0">
        <CardHeader class="border-b py-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 flex-wrap items-center gap-3">
              <Badge variant="secondary"><MapPin />当前地点 {{ world.current?.name }}</Badge>
              <Badge variant="secondary"><Clock />第 {{ world.world.current_time.day }} 天 {{ world.world.current_time.hour }} 时</Badge>
              <Badge :variant="world.busy ? 'default' : 'secondary'"><Bot />{{ world.busy ? "AI 正在生成" : "等待行动" }}</Badge>
            </div>
            <div class="flex items-center gap-1">
              <MessageActions>
                <Button variant="ghost" size="icon-sm" type="button" aria-label="复制最新叙事" :disabled="!latestAssistantMessage" @click="copyLatestMessage">
                  <Copy data-icon="inline-start" />
                </Button>
              </MessageActions>
              <Dialog>
                <DialogTrigger as-child>
                  <Button variant="ghost" size="icon-sm" type="button" aria-label="查看场景信息">
                    <Info data-icon="inline-start" />
                  </Button>
                </DialogTrigger>
                <DialogContent class="max-h-[86vh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>场景信息</DialogTitle>
                    <DialogDescription>当前地点、最近事件与同行角色。</DialogDescription>
                  </DialogHeader>
                  <div class="grid gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle class="flex items-center gap-2"><MapPin />当前地点</CardTitle>
                        <CardDescription>{{ world.current?.description }}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div class="flex flex-wrap gap-2">
                          <Button v-for="location in world.locations.filter((l) => l.id !== world.current?.id).slice(0, 4)" :key="location.id" variant="outline" size="sm" type="button" @click="world.goToLocation(location.id)">前往 {{ location.name }}</Button>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle class="flex items-center gap-2"><History />最近事件</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ol class="flex flex-col gap-3 text-sm">
                          <li v-for="event in world.timeline.slice(-5).reverse()" :key="event.id" class="rounded-md bg-secondary p-3">
                            <div class="font-medium">{{ event.title }}</div>
                            <div class="mt-1 line-clamp-2 text-muted-foreground">{{ event.description }}</div>
                          </li>
                        </ol>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle class="flex items-center gap-2"><Users />同行角色</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div class="flex flex-col gap-2 text-sm">
                          <Badge v-for="character in world.characters.filter((c) => c.companion)" :key="character.id" variant="secondary" class="justify-start rounded-md px-3 py-2">{{ character.name }} · {{ character.role }}</Badge>
                        </div>
                        <Empty v-if="world.characters.filter((c) => c.companion).length === 0">
                          <EmptyHeader>
                            <EmptyTitle>暂无同行角色</EmptyTitle>
                          </EmptyHeader>
                        </Empty>
                      </CardContent>
                    </Card>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <p class="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{{ world.current?.description }}</p>
        </CardHeader>

        <CardContent class="flex min-h-0 flex-1 flex-col p-0">
          <Conversation downloadable content-class="px-4 py-6 md:px-6" @download="downloadConversation">
            <Message v-for="message in conversationMessages" :key="message.id" :from="message.from">
              <div v-if="message.from === 'assistant'" class="flex items-center gap-2 text-xs text-muted-foreground">
                <MessageSquare />
                <span>{{ message.title || "世界回应" }}</span>
                <span v-if="message.meta">· {{ message.meta }}</span>
              </div>
              <p v-else-if="message.meta" class="text-xs text-muted-foreground">{{ message.meta }}</p>
              <p class="whitespace-pre-wrap">{{ message.text }}</p>
            </Message>
          </Conversation>
        </CardContent>
      </Card>

      <div class="flex min-w-0 flex-col gap-3">
        <div v-if="travelTargets.length > 0" class="flex min-w-0 flex-wrap gap-2">
          <Button v-for="location in travelTargets" :key="location.id" variant="outline" size="sm" type="button" @click="world.goToLocation(location.id)">前往 {{ location.name }}</Button>
        </div>
        <Suggestions v-if="visibleSuggestedActions.length > 0">
          <Suggestion v-for="item in visibleSuggestedActions" :key="item" :suggestion="item" :disabled="world.busy" @select="requestSubmit" />
        </Suggestions>
        <PromptInput v-model="action" :disabled="world.busy" :status="world.busy ? 'streaming' : 'ready'" @submit="requestSubmit()" />
      </div>
    </div>
  </section>
  <section v-else class="mx-auto max-w-xl text-center">
    <h1 class="font-serif text-3xl font-semibold">还没有世界</h1>
    <p class="mt-2 text-muted-foreground">先创建世界后进入探索。</p>
    <Button class="mt-5" type="button" @click="router.push('/new-world')">新建世界</Button>
  </section>
</template>
