<script setup lang="ts">
import { useWorldStore } from "@/stores/world";

const world = useWorldStore();
</script>

<template>
  <section v-if="world.hasWorld" class="grid gap-5 xl:grid-cols-[1fr_360px]">
    <div class="space-y-5">
      <div class="e-panel p-5">
        <h1 class="text-2xl font-semibold">{{ world.world.name }}</h1>
        <p class="mt-3 text-sm leading-7 text-white/72">{{ world.world.summary }}</p>
      </div>
      <div class="e-panel p-5">
        <h2 class="font-medium">世界规则</h2>
        <ul class="mt-3 space-y-2 text-sm text-white/68">
          <li v-for="rule in world.world.rules" :key="rule">· {{ rule }}</li>
        </ul>
      </div>
      <div class="e-panel p-5">
        <h2 class="font-medium">势力</h2>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <div v-for="faction in world.factions" :key="faction.id" class="rounded-md bg-black/24 p-3 text-sm">
            <div class="font-medium">{{ faction.name }}</div>
            <div class="e-muted mt-1">{{ faction.agenda }}</div>
          </div>
        </div>
      </div>
    </div>
    <aside class="space-y-5">
      <div class="e-panel p-5">
        <h2 class="font-medium">AI 用量</h2>
        <div class="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <div class="rounded bg-black/24 p-3"><div class="e-muted text-xs">调用</div><div class="mt-1">{{ world.usageSummary.calls }}</div></div>
          <div class="rounded bg-black/24 p-3"><div class="e-muted text-xs">成功</div><div class="mt-1">{{ world.usageSummary.success_count }}</div></div>
          <div class="rounded bg-black/24 p-3"><div class="e-muted text-xs">Token</div><div class="mt-1">{{ world.usageSummary.total_tokens }}</div></div>
        </div>
      </div>
      <div class="e-panel p-5">
        <h2 class="font-medium">一致性检查</h2>
        <p class="e-muted mt-2 text-sm">{{ world.consistencyIssues.length ? `发现 ${world.consistencyIssues.length} 个问题` : "当前未发现断裂引用。" }}</p>
        <ul class="mt-3 space-y-2 text-xs text-amber-100">
          <li v-for="issue in world.consistencyIssues" :key="issue.code + issue.subject_id">{{ issue.message }}</li>
        </ul>
      </div>
      <button class="e-btn e-btn-primary w-full" type="button" @click="world.runNpcTick">运行 NPC Tick</button>
    </aside>
  </section>
</template>
