<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { LayoutGrid, ListFilter, Search, ShieldCheck, Sparkles } from "lucide-vue-next";
import { buildLibraryItems, publicCatalogStats, type LibraryCatalog, type LibraryKind, type LibrarySort } from "@/domain/library";
import { labelFor, playModeLabel } from "@/lib/display";
import { useAppStore } from "@/stores/app";
import type { ContentRating, PlayMode } from "@/types/domain";

const store = useAppStore();
const query = ref("");
const kind = ref<LibraryKind>("all");
const catalog = ref<LibraryCatalog>("all");
const rating = ref<"all" | ContentRating>("all");
const mode = ref<"all" | PlayMode>("all");
const language = ref("all");
const tag = ref("all");
const sort = ref<LibrarySort>("updated");
const view = ref<"grid" | "list" | "review">("grid");

const searchResult = computed(() =>
  store.searchContent({
    query: query.value,
    kind: kind.value,
    catalog: catalog.value,
    rating: rating.value,
    mode: mode.value,
    language: language.value,
    tag: tag.value,
    sort: sort.value,
    adultUnlocked: store.envelope.settings.adultContentUnlocked,
    pageSize: 500,
  }),
);
const filteredItems = computed(() => searchResult.value.items);
const facets = computed(() => searchResult.value.facets);
const totalItems = computed(() => store.searchContent({ pageSize: 1, adultUnlocked: true }).total);
const catalogStats = computed(() => publicCatalogStats(buildLibraryItems(store.envelope.entities)));

const kinds: Array<{ value: LibraryKind; label: string }> = [
  { value: "all", label: "全部" },
  { value: "storyline", label: "故事线" },
  { value: "character", label: "角色" },
  { value: "scenario", label: "场景" },
  { value: "media", label: "媒体" },
];

const catalogs: Array<{ value: LibraryCatalog; label: string }> = [
  { value: "all", label: "全部本地内容" },
  { value: "public", label: "公开目录" },
  { value: "private", label: "私有草稿" },
  { value: "review", label: "审核队列" },
];

function resetFilters() {
  query.value = "";
  kind.value = "all";
  catalog.value = "all";
  rating.value = "all";
  mode.value = "all";
  language.value = "all";
  tag.value = "all";
  sort.value = "updated";
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <p class="eyebrow">探索</p>
        <h2>内容库</h2>
      </div>
      <RouterLink class="secondary-button" to="/create">创建本地草稿</RouterLink>
    </div>

    <div class="panel field-grid">
      <div class="mode-tabs" role="tablist" aria-label="内容类型">
        <button v-for="item in kinds" :key="item.value" type="button" :class="{ active: kind === item.value }" @click="kind = item.value">
          {{ item.label }}
        </button>
      </div>
      <div class="row">
        <label class="field-box">
          <span>目录</span>
          <select v-model="catalog" class="select">
            <option v-for="item in catalogs" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label class="field-box" style="flex: 1 1 320px">
          <span><Search :size="15" /> 搜索</span>
          <input v-model="query" class="input" placeholder="标题、角色、场景、标签、创作者" />
        </label>
        <label class="field-box">
          <span>分级</span>
          <select v-model="rating" class="select">
            <option value="all">全部分级</option>
            <option value="SFW">SFW</option>
            <option value="M17">M17</option>
            <option value="AdultLocked">成人锁定</option>
          </select>
        </label>
        <label class="field-box">
          <span>模式</span>
          <select v-model="mode" class="select">
            <option value="all">全部模式</option>
            <option v-for="item in facets.modes" :key="item" :value="item">{{ playModeLabel(item) }}</option>
          </select>
        </label>
        <label class="field-box">
          <span>语言</span>
          <select v-model="language" class="select">
            <option value="all">全部语言</option>
            <option v-for="item in facets.languages" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
      </div>
      <div class="row">
        <label class="field-box" style="flex: 1 1 220px">
          <span>标签</span>
          <select v-model="tag" class="select">
            <option value="all">全部标签</option>
            <option v-for="item in facets.tags" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label class="field-box">
          <span>排序</span>
          <select v-model="sort" class="select">
            <option value="updated">最近更新</option>
            <option value="played">最近游玩</option>
            <option value="created">最近创建</option>
            <option value="title">标题</option>
            <option value="completion">完成度</option>
            <option value="heat">热度占位</option>
            <option value="recommended">推荐</option>
          </select>
        </label>
        <div class="field-box">
          <span>视图</span>
          <div class="cluster">
            <button class="ghost-button" type="button" :class="{ active: view === 'grid' }" @click="view = 'grid'">
              <LayoutGrid :size="15" />
              网格
            </button>
            <button class="ghost-button" type="button" :class="{ active: view === 'list' }" @click="view = 'list'">
              <ListFilter :size="15" />
              列表
            </button>
            <button class="ghost-button" type="button" :class="{ active: view === 'review' }" @click="view = 'review'">
              <ShieldCheck :size="15" />
              审核
            </button>
          </div>
        </div>
        <button class="ghost-button" type="button" @click="resetFilters">重置</button>
      </div>
    </div>

    <div class="section-title" style="margin-top: 22px">
      <h2>结果</h2>
      <span class="muted small">
        {{ searchResult.total }} / {{ totalItems }} 项 · 公开 {{ catalogStats.publicCount }} · 审核 {{ catalogStats.reviewCount }}
      </span>
    </div>

    <section v-if="catalogStats.recommended.length" class="panel field-grid" aria-label="公开推荐">
      <h3><Sparkles :size="17" /> 公开推荐</h3>
      <div class="card-grid compact-grid">
        <RouterLink
          v-for="item in catalogStats.recommended"
          :key="`recommendation:${item.kind}:${item.id}`"
          class="media-card"
          :to="item.route || '/library'"
          :aria-label="`推荐：${item.title}`"
        >
          <div class="card-body">
            <h3>{{ item.title }}</h3>
            <p>{{ item.subtitle || item.summary }}</p>
            <span class="muted small">{{ item.rating }} · {{ labelFor(item.status) }} · 评分 {{ item.completion + item.heat }}</span>
          </div>
        </RouterLink>
      </div>
    </section>

    <div v-if="view === 'grid'" class="card-grid" style="margin-top: 18px">
      <component
        :is="item.route ? RouterLink : 'article'"
        v-for="item in filteredItems"
        :key="`${item.kind}:${item.id}`"
        class="media-card"
        :to="item.route"
        :aria-label="`${labelFor(item.kind)}：${item.title}`"
      >
        <div class="cover" :class="{ mist: item.rating === 'M17' }">
          <span class="tag">{{ labelFor(item.kind) }}</span>
          <span v-if="item.rating" class="tag" :class="item.rating === 'SFW' ? 'sfw' : 'm17'">{{ item.rating }}</span>
        </div>
        <div class="card-body">
          <h3>{{ item.title }}</h3>
          <p>{{ item.subtitle || item.summary }}</p>
          <div class="tags">
            <span v-for="itemTag in item.tags.slice(0, 4)" :key="itemTag" class="tag">{{ itemTag }}</span>
          </div>
          <p class="muted small" style="margin-top: 10px">
            {{ item.language || "未知" }} · {{ labelFor(item.status) }} · {{ labelFor(item.visibility || "private") }} · {{ item.castCount ?? 0 }} 名角色
          </p>
        </div>
      </component>
    </div>

    <div v-else class="panel table-list">
      <div class="table-row table-head">
        <span>类型</span>
        <span>标题</span>
        <span>分级</span>
        <span>模式</span>
        <span>{{ view === "review" ? "审核" : "更新" }}</span>
      </div>
      <component
        :is="item.route ? RouterLink : 'div'"
        v-for="item in filteredItems"
        :key="`${item.kind}:${item.id}`"
        class="table-row"
        :to="item.route"
        :aria-label="`${labelFor(item.kind)}：${item.title}`"
      >
        <span class="tag">{{ labelFor(item.kind) }}</span>
        <strong>{{ item.title }}</strong>
        <span>{{ item.rating || "-" }}</span>
        <span>{{ item.modes.map(playModeLabel).join(", ") || "-" }}</span>
        <span v-if="view === 'review'">{{ labelFor(item.moderationState || item.status) }} · {{ labelFor(item.visibility || "private") }} · {{ item.completion }}%</span>
        <span v-else>{{ new Date(item.updatedAt).toLocaleDateString() }}</span>
      </component>
    </div>
  </section>
</template>
