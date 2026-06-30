<script setup lang="ts">
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useWorldStore } from "@/stores/world";

const world = useWorldStore();
</script>

<template>
  <section v-if="world.hasWorld" class="grid gap-5 xl:grid-cols-[1fr_360px]">
    <div class="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>{{ world.world.name }}</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-sm leading-7 text-muted-foreground">{{ world.world.summary }}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>世界规则</CardTitle>
        </CardHeader>
        <CardContent>
        <ul class="flex flex-col gap-2 text-sm text-muted-foreground">
          <li v-for="rule in world.world.rules" :key="rule">· {{ rule }}</li>
        </ul>
        <Empty v-if="world.world.rules.length === 0">
          <EmptyHeader>
            <EmptyTitle>暂无规则</EmptyTitle>
          </EmptyHeader>
        </Empty>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>势力</CardTitle>
        </CardHeader>
        <CardContent>
        <div class="grid gap-3 md:grid-cols-2">
          <Alert v-for="faction in world.factions" :key="faction.id">
            <div class="font-medium">{{ faction.name }}</div>
            <AlertDescription>{{ faction.agenda }}</AlertDescription>
          </Alert>
        </div>
        <Empty v-if="world.factions.length === 0">
          <EmptyHeader>
            <EmptyTitle>暂无势力</EmptyTitle>
          </EmptyHeader>
        </Empty>
        </CardContent>
      </Card>
    </div>
    <aside class="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>AI 用量</CardTitle>
        </CardHeader>
        <CardContent>
        <div class="grid grid-cols-3 gap-2 text-center text-sm">
          <Badge variant="secondary" class="rounded-md px-3 py-2">调用 {{ world.usageSummary.calls }}</Badge>
          <Badge variant="secondary" class="rounded-md px-3 py-2">成功 {{ world.usageSummary.success_count }}</Badge>
          <Badge variant="secondary" class="rounded-md px-3 py-2">Token {{ world.usageSummary.total_tokens }}</Badge>
        </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>一致性检查</CardTitle>
        </CardHeader>
        <CardContent>
        <p class="text-muted-foreground text-sm">{{ world.consistencyIssues.length ? `发现 ${world.consistencyIssues.length} 个问题` : "当前未发现断裂引用。" }}</p>
        <ul class="mt-3 flex flex-col gap-2 text-xs text-muted-foreground">
          <li v-for="issue in world.consistencyIssues" :key="issue.code + issue.subject_id">
            <Alert>
              <AlertDescription>{{ issue.message }}</AlertDescription>
            </Alert>
          </li>
        </ul>
        </CardContent>
      </Card>
      <Button class="w-full" type="button" @click="world.runNpcTick">运行 NPC Tick</Button>
    </aside>
  </section>
</template>
