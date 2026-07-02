<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { CopyPlus, PenTool, Play, RotateCcw } from "lucide-vue-next";
import { useAppStore } from "@/stores/app";
import type { Character, MediaAsset } from "@/types/domain";

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const duplicating = ref(false);
const activeTab = ref<"overview" | "characters" | "scenarios" | "notes" | "safety" | "changelog">("overview");
const storyline = computed(() => store.getStoryline(String(route.params.id)));
const casts = computed(() => storyline.value ? store.storylineCharacters(storyline.value) : []);
const scenarios = computed(() => storyline.value ? store.storylineScenarios(storyline.value) : []);
const media = computed(() => storyline.value ? store.storylineMedia(storyline.value) : []);
const validationIssues = computed(() => storyline.value ? store.validateStoryline(storyline.value.id) : []);
const existingChat = computed(() => store.activeChats.find((chat) => chat.storylineId === storyline.value?.id));

const tabs: Array<{ value: typeof activeTab.value; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "characters", label: "Characters" },
  { value: "scenarios", label: "Scenarios" },
  { value: "notes", label: "Creator Notes" },
  { value: "safety", label: "Safety" },
  { value: "changelog", label: "Changelog" },
];

async function duplicateAsDraft() {
  if (!storyline.value || duplicating.value) return;
  duplicating.value = true;
  try {
    const duplicatedId = await store.duplicateStorylineAsDraft(storyline.value.id);
    await router.push({ path: "/create", query: { storyId: duplicatedId, duplicated: "1" } });
  } finally {
    duplicating.value = false;
  }
}

function voiceReference(character: Character): MediaAsset | undefined {
  const assetId = character.voice.referenceAssetId;
  return assetId ? store.envelope.entities.mediaAssets[assetId] : undefined;
}
</script>

<template>
  <section v-if="storyline" class="page">
    <div class="hero-panel">
      <div>
        <p class="eyebrow">Storyline Detail</p>
        <h2>{{ storyline.title }}</h2>
        <p>{{ storyline.summary }}</p>
        <div class="tags">
          <span class="tag" :class="storyline.rating === 'SFW' ? 'sfw' : 'm17'">{{ storyline.rating }}</span>
          <span v-for="mode in storyline.supportedModes" :key="mode" class="tag">{{ mode }}</span>
          <span v-for="tag in storyline.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <div class="cluster" style="margin-top: 18px">
          <RouterLink class="primary-button" :to="`/start/${storyline.id}`">
            <Play :size="17" />
            Start
          </RouterLink>
          <RouterLink v-if="existingChat" class="secondary-button" :to="`/chat/${existingChat.id}`">
            <RotateCcw :size="17" />
            Resume
          </RouterLink>
          <RouterLink class="secondary-button" :to="{ path: '/create', query: { storyId: storyline.id } }">
            <PenTool :size="17" />
            Edit
          </RouterLink>
          <button class="secondary-button" :disabled="duplicating" @click="duplicateAsDraft">
            <CopyPlus :size="17" />
            Duplicate
          </button>
        </div>
      </div>
      <div class="cover" :class="{ mist: storyline.rating === 'M17' }" aria-hidden="true"></div>
    </div>

    <div class="mode-tabs detail-tabs" role="tablist" aria-label="Storyline detail tabs">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        :class="{ active: activeTab === tab.value }"
        @click="activeTab = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="page-grid" style="margin-top: 22px">
      <div class="field-grid">
        <section v-if="activeTab === 'overview'" class="panel">
          <h3>Premise</h3>
          <p class="muted">{{ storyline.premise }}</p>
          <h3>World Rules</h3>
          <ul>
            <li v-for="rule in storyline.worldRules" :key="rule">{{ rule }}</li>
          </ul>
          <h3>Supported Modes</h3>
          <div class="tags">
            <span v-for="mode in storyline.supportedModes" :key="mode" class="tag">{{ mode }}</span>
          </div>
        </section>

        <section v-else-if="activeTab === 'characters'" class="panel">
          <h3>Casts</h3>
          <div class="field-grid">
            <article v-for="character in casts" :key="character.id" class="field-box">
              <strong>{{ character.name }}</strong>
              <span class="muted">{{ character.subtitle }}</span>
              <p>{{ character.summary }}</p>
              <span class="muted small">{{ character.voice.tone }}</span>
              <template v-if="voiceReference(character)">
                <span class="muted small">Voice reference: {{ voiceReference(character)?.altText }}</span>
                <span class="muted small">
                  {{ voiceReference(character)?.license.kind }} license
                  · {{ voiceReference(character)?.safety.state }}
                  · {{ voiceReference(character)?.source.label }}
                </span>
              </template>
            </article>
          </div>
        </section>

        <section v-else-if="activeTab === 'scenarios'" class="panel">
          <h3>Scenarios</h3>
          <div class="field-grid">
            <article v-for="scenario in scenarios" :key="scenario.id" class="field-box">
              <strong>{{ scenario.title }}</strong>
              <span class="muted">{{ scenario.location || "No fixed location" }}</span>
              <p>{{ scenario.summary }}</p>
              <p class="muted">{{ scenario.opening }}</p>
            </article>
          </div>
        </section>

        <section v-else-if="activeTab === 'notes'" class="panel">
          <h3>Creator Notes</h3>
          <div class="field-grid">
            <div class="field-box">
              <strong>{{ storyline.createdBy.name }}</strong>
              <span class="muted">Creator ID: {{ storyline.createdBy.id }}</span>
            </div>
            <div class="field-box">
              <strong>Player Role</strong>
              <span class="muted">{{ storyline.playerRole }}</span>
            </div>
            <div class="field-box">
              <strong>Package Boundary</strong>
              <span class="muted">Original Evolvria content. Do not copy third-party brand, code, assets, prompts or user content.</span>
            </div>
          </div>
        </section>

        <section v-else-if="activeTab === 'safety'" class="panel">
          <h3>Safety</h3>
          <div class="field-grid">
            <div class="field-box">
              <strong>{{ storyline.rating }} / {{ storyline.moderation.state }}</strong>
              <span class="muted">{{ storyline.visibility }} visibility · {{ storyline.moderation.safetyFlags.join(", ") }}</span>
            </div>
            <div v-for="issue in validationIssues" :key="`${issue.field}:${issue.message}`" class="field-box">
              <strong>{{ issue.severity }}: {{ issue.field }}</strong>
              <span class="muted">{{ issue.message }}</span>
            </div>
            <div v-if="!validationIssues.length" class="field-box">
              <strong>No validation issues</strong>
              <span class="muted">This package can remain local_ready unless edited or new media is added.</span>
            </div>
          </div>
        </section>

        <section v-else class="panel">
          <h3>Changelog</h3>
          <div class="field-grid">
            <div class="field-box">
              <strong>{{ storyline.version.version }} / {{ storyline.version.status }}</strong>
              <span class="muted">{{ storyline.version.changelog }}</span>
              <span v-if="storyline.version.baseVersionId" class="muted">Base: {{ storyline.version.baseVersionId }}</span>
            </div>
            <div class="field-box">
              <strong>Timeline</strong>
              <span class="muted">Created {{ new Date(storyline.createdAt).toLocaleString() }}</span>
              <span class="muted">Updated {{ new Date(storyline.updatedAt).toLocaleString() }}</span>
            </div>
          </div>
        </section>
      </div>

      <aside class="panel">
        <h3>Launch Options</h3>
        <p class="muted small">Player role</p>
        <strong>{{ storyline.playerRole }}</strong>
        <p class="muted small">Creator</p>
        <strong>{{ storyline.createdBy.name }}</strong>
        <p class="muted small">Media</p>
        <strong>{{ media.length }} asset(s)</strong>
        <p class="muted small">Scenarios</p>
        <div class="field-grid">
          <div v-for="scenario in scenarios" :key="scenario.id" class="field-box">
            <strong>{{ scenario.title }}</strong>
            <span class="muted">{{ scenario.summary }}</span>
          </div>
        </div>
      </aside>
    </div>
  </section>
  <section v-else class="page">
    <div class="panel">Storyline not found.</div>
  </section>
</template>
