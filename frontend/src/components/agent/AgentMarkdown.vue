<script setup lang="ts">
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { computed } from "vue";

const props = defineProps<{
  content: string;
}>();

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true
});

const renderedContent = computed(() =>
  DOMPurify.sanitize(markdown.render(props.content), {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "code", "pre", "ul", "ol", "li",
      "blockquote", "a", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "span"
    ],
    ALLOWED_ATTR: ["href", "title", "class"]
  })
);
</script>

<template>
  <!-- Agent content is rendered without raw HTML and sanitized before display. -->
  <div class="agent-markdown" v-html="renderedContent"></div>
</template>

<style scoped>
.agent-markdown {
  display: grid;
  gap: 7px;
  font-size: 13px;
  line-height: 1.68;
}

.agent-markdown :deep(p) {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.agent-markdown :deep(ul),
.agent-markdown :deep(ol) {
  min-width: 0;
  display: grid;
  gap: 5px;
  margin: 0;
  padding-left: 20px;
}

.agent-markdown :deep(code) {
  padding: 2px 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
}

.agent-markdown :deep(pre) {
  overflow: auto;
  padding: 10px;
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.2);
}

.agent-markdown :deep(blockquote) {
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid rgba(143, 214, 200, 0.7);
  color: #c6d7d4;
}

.agent-markdown :deep(a) {
  color: #9fd9cb;
  text-decoration: underline;
}
</style>
