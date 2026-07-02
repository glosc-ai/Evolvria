<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { LayoutGrid, ListFilter, Search, ShieldCheck, Sparkles } from "lucide-vue-next";
import { buildLibraryItems, publicCatalogStats, type LibraryCatalog, type LibraryKind, type LibrarySort } from "@/domain/library";
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
  { value: "all", label: "All" },
  { value: "storyline", label: "Storylines" },
  { value: "character", label: "Characters" },
  { value: "scenario", label: "Scenarios" },
  { value: "media", label: "Media" },
];

const catalogs: Array<{ value: LibraryCatalog; label: string }> = [
  { value: "all", label: "All Local" },
  { value: "public", label: "Public Catalog" },
  { value: "private", label: "Private Drafts" },
  { value: "review", label: "Review Queue" },
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
        <p class="eyebrow">Explore</p>
        <h2>Library</h2>
      </div>
      <RouterLink class="secondary-button" to="/create">Create local draft</RouterLink>
    </div>

    <div class="panel field-grid">
      <div class="mode-tabs" role="tablist" aria-label="Library content type">
        <button v-for="item in kinds" :key="item.value" type="button" :class="{ active: kind === item.value }" @click="kind = item.value">
          {{ item.label }}
        </button>
      </div>
      <div class="row">
        <label class="field-box">
          <span>Catalog</span>
          <select v-model="catalog" class="select">
            <option v-for="item in catalogs" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label class="field-box" style="flex: 1 1 320px">
          <span><Search :size="15" /> Search</span>
          <input v-model="query" class="input" placeholder="标题、角色、场景、标签、创作者" />
        </label>
        <label class="field-box">
          <span>Rating</span>
          <select v-model="rating" class="select">
            <option value="all">All ratings</option>
            <option value="SFW">SFW</option>
            <option value="M17">M17</option>
            <option value="AdultLocked">AdultLocked</option>
          </select>
        </label>
        <label class="field-box">
          <span>Mode</span>
          <select v-model="mode" class="select">
            <option value="all">All modes</option>
            <option v-for="item in facets.modes" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label class="field-box">
          <span>Language</span>
          <select v-model="language" class="select">
            <option value="all">All languages</option>
            <option v-for="item in facets.languages" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
      </div>
      <div class="row">
        <label class="field-box" style="flex: 1 1 220px">
          <span>Tag</span>
          <select v-model="tag" class="select">
            <option value="all">All tags</option>
            <option v-for="item in facets.tags" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label class="field-box">
          <span>Sort</span>
          <select v-model="sort" class="select">
            <option value="updated">Recently updated</option>
            <option value="played">Recently played</option>
            <option value="created">Recently created</option>
            <option value="title">Title</option>
            <option value="completion">Completion</option>
            <option value="heat">Heat placeholder</option>
            <option value="recommended">Recommended</option>
          </select>
        </label>
        <div class="field-box">
          <span>View</span>
          <div class="cluster">
            <button class="ghost-button" type="button" :class="{ active: view === 'grid' }" @click="view = 'grid'">
              <LayoutGrid :size="15" />
              Grid
            </button>
            <button class="ghost-button" type="button" :class="{ active: view === 'list' }" @click="view = 'list'">
              <ListFilter :size="15" />
              List
            </button>
            <button class="ghost-button" type="button" :class="{ active: view === 'review' }" @click="view = 'review'">
              <ShieldCheck :size="15" />
              Review
            </button>
          </div>
        </div>
        <button class="ghost-button" type="button" @click="resetFilters">Reset</button>
      </div>
    </div>

    <div class="section-title" style="margin-top: 22px">
      <h2>Results</h2>
      <span class="muted small">
        {{ searchResult.total }} / {{ totalItems }} items · public {{ catalogStats.publicCount }} · review {{ catalogStats.reviewCount }}
      </span>
    </div>

    <section v-if="catalogStats.recommended.length" class="panel field-grid" aria-label="Public recommendations">
      <h3><Sparkles :size="17" /> Public Recommendations</h3>
      <div class="card-grid compact-grid">
        <RouterLink
          v-for="item in catalogStats.recommended"
          :key="`recommendation:${item.kind}:${item.id}`"
          class="media-card"
          :to="item.route || '/library'"
          :aria-label="`recommended: ${item.title}`"
        >
          <div class="card-body">
            <h3>{{ item.title }}</h3>
            <p>{{ item.subtitle || item.summary }}</p>
            <span class="muted small">{{ item.rating }} · {{ item.status }} · score {{ item.completion + item.heat }}</span>
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
        :aria-label="`${item.kind}: ${item.title}`"
      >
        <div class="cover" :class="{ mist: item.rating === 'M17' }">
          <span class="tag">{{ item.kind }}</span>
          <span v-if="item.rating" class="tag" :class="item.rating === 'SFW' ? 'sfw' : 'm17'">{{ item.rating }}</span>
        </div>
        <div class="card-body">
          <h3>{{ item.title }}</h3>
          <p>{{ item.subtitle || item.summary }}</p>
          <div class="tags">
            <span v-for="itemTag in item.tags.slice(0, 4)" :key="itemTag" class="tag">{{ itemTag }}</span>
          </div>
          <p class="muted small" style="margin-top: 10px">
            {{ item.language || "unknown" }} · {{ item.status }} · {{ item.visibility || "private" }} · {{ item.castCount ?? 0 }} cast
          </p>
        </div>
      </component>
    </div>

    <div v-else class="panel table-list">
      <div class="table-row table-head">
        <span>Type</span>
        <span>Title</span>
        <span>Rating</span>
        <span>Modes</span>
        <span>{{ view === "review" ? "Moderation" : "Updated" }}</span>
      </div>
      <component
        :is="item.route ? RouterLink : 'div'"
        v-for="item in filteredItems"
        :key="`${item.kind}:${item.id}`"
        class="table-row"
        :to="item.route"
        :aria-label="`${item.kind}: ${item.title}`"
      >
        <span class="tag">{{ item.kind }}</span>
        <strong>{{ item.title }}</strong>
        <span>{{ item.rating || "-" }}</span>
        <span>{{ item.modes.join(", ") || "-" }}</span>
        <span v-if="view === 'review'">{{ item.moderationState || item.status }} · {{ item.visibility || "private" }} · {{ item.completion }}%</span>
        <span v-else>{{ new Date(item.updatedAt).toLocaleDateString() }}</span>
      </component>
    </div>
  </section>
</template>
